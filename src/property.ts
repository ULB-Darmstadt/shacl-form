import { BlankNode, DataFactory, Literal, NamedNode, Quad, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from './node.js'
import { createAlternativePathConstraint, createShaclOrConstraint, resolveShaclOrConstraintOnProperty } from './constraints.js'
import { findInstancesOf, focusFirstInputElement } from './util.js'
import { aggregatedMaxCount, aggregatedMinCount, cloneProperty, mergeProperty, mergeQuads, ShaclPropertyTemplate } from './property-template.js'
import { Editor, fieldFactory, InputListEntry } from './theme.js'
import { toRDF } from './serialize.js'
import { findPlugin } from './plugin.js'
import { DATA_GRAPH, PREFIX_SHACL, RDF_OBJECT_NIL, RDF_PREDICATE_FIRST, RDF_PREDICATE_REST, RDF_PREDICATE_TYPE } from './constants.js'
import { RokitButton, RokitCollapsible } from '@ro-kit/ui-widgets'
import { createLinker } from './linker.js'
import { bindEditorTerm } from './editor.js'
import { v4 as uuidv4 } from 'uuid'

const ADD_BUTTON_SELECTOR = ':scope > .add-button-wrapper, :scope > .collapsible > .add-button-wrapper'
const PROPERTY_INSTANCE_SELECTOR = ':scope > .property-instance, :scope > .shacl-or-constraint, :scope > .alternative-path-constraint, :scope > shacl-node, :scope > .collapsible > .property-instance, :scope > .collapsible > .alternative-path-constraint'

export class ShaclProperty extends HTMLElement {
    template: ShaclPropertyTemplate
    container: HTMLElement
    parent: ShaclNode
    private readonly rdfListItemTemplate?: ShaclPropertyTemplate
    private readonly rdfListNodes = new WeakMap<HTMLElement, NamedNode | BlankNode>()
    private readonly rdfListGroups = new WeakMap<HTMLElement, string>()

    constructor(template: ShaclPropertyTemplate, parent: ShaclNode) {
        super()
        this.template = template
        this.parent = parent
        this.rdfListItemTemplate = detectRdfListItemTemplate(template)
        this.container = this
        this.setAttribute('part', 'property')
        if (this.template.nodeShapes.size && this.template.config.attributes.collapse !== null && (this.template.maxCount === undefined || this.template.maxCount > 1)) {
            const collapsible = new RokitCollapsible()
            collapsible.classList.add('collapsible', 'shacl-group')
            collapsible.open = template.config.attributes.collapse === 'open'
            collapsible.label = this.template.label
            collapsible.setAttribute('part', 'collapsible')
            this.container = collapsible
            this.appendChild(this.container)
        }

        if (this.template.cssClass) {
            this.classList.add(this.template.cssClass)
        }
        if (template.config.editMode && !parent.linked) {
            this.addEventListener('change', async () => {
                await this.updateControls()
            })
        }
    }

    // binds data graph triples to form fields and (if present) creates missing sh:hasValue form field
    async bindValues(valueSubject: NamedNode | BlankNode | undefined, multiValuedPath?: boolean) {
        if (this.template.path) {
            let valuesContainHasValue = false
            if (valueSubject) {
                // for linked resource, get values in all graphs, otherwise only from data graph
                let values = (this.template.pathAlternatives ?? [this.template.path]).flatMap(path =>
                    this.template.config.store.getQuads(valueSubject, path, null, this.parent.linked ? null : DATA_GRAPH)
                )
                if (multiValuedPath) {
                    // ignore values that do not conform to this property. this might be the case when there are multiple properties with the same sh:path in a NodeShape (i.e. sh:qualifiedValueShape).
                    values = await this.filterValidValues(values, valueSubject)
                }
                // A more-specific inherited property may already have rendered this
                // value. Linked data cannot be removed from the shared store, so
                // exclude it explicitly before rendering the generic ancestor property.
                values = values.filter(value => this.parent.shouldBindPropertyValue(value))
                for (const value of values) {
                    // remove quad from data graph to prevent double binding if value is not linked
                    if (!this.parent.linked) {
                        this.template.config.store.delete(value)
                    }
                    // if value is not in data graph or has loaded via ResourceLinkProvider, then it is a linked resource
                    const linked = !DATA_GRAPH.equals(value.graph) || this.template.config.providedResources[value.object.value] !== undefined
                    const instance = this.rdfListItemTemplate
                        ? await this.bindRdfList(value.object, linked)
                        : await this.addPropertyInstance(
                            value.object,
                            linked,
                            this.template.config.providedResources[value.object.value] !== undefined,
                            value.predicate.value
                        )
                    if (instance) {
                        this.parent.recordBoundPropertyValue(value)
                    }
                    if (this.template.hasValue && value.object.equals(this.template.hasValue)) {
                        valuesContainHasValue = true
                    }
                }
            }
            if (this.template.config.editMode) {
                if (this.template.hasValue && !valuesContainHasValue && !this.parent.linked) {
                    // sh:hasValue is defined in shapes graph, but does not exist in data graph, so force it
                    await this.addPropertyInstance(this.template.hasValue)
                }
            }
        }
    }

    async initializeQuery() {
        const { initializeQueryProperty } = await import('./query/mode.js')
        await initializeQueryProperty(this)
    }

    async addPropertyInstance(value?: Term, linked?: boolean, forceRemovable = false, predicate?: string, insert = true): Promise<HTMLElement | undefined> {
        if (this.rdfListItemTemplate) {
            return this.addRdfListItem(value, linked, forceRemovable, insert)
        }
        let instance: HTMLElement | undefined
        if (this.template.pathAlternatives && !predicate) {
            if (this.template.config.editMode) {
                instance = createAlternativePathConstraint(this, value, linked, forceRemovable)
            }
        } else {
            const alternativeBranch = predicate ? this.template.pathAlternativeBranches?.[predicate] : undefined
            const effectiveTemplate = predicate && (predicate !== this.template.path || alternativeBranch)
                ? cloneProperty(this.template)
                : this.template
            if (predicate) {
                effectiveTemplate.path = predicate
            }
            if (alternativeBranch) {
                mergeProperty(effectiveTemplate, alternativeBranch, true)
                effectiveTemplate.label = alternativeBranch.name?.value || alternativeBranch.label || effectiveTemplate.label
            }
            if (effectiveTemplate.or?.length || effectiveTemplate.xone?.length) {
                const options = effectiveTemplate.or?.length ? effectiveTemplate.or : effectiveTemplate.xone as Term[]
                let resolved = false
                if (value) {
                    const resolvedOptions = resolveShaclOrConstraintOnProperty(options, value, effectiveTemplate.config)
                    if (resolvedOptions.length) {
                        const merged = mergeQuads(cloneProperty(effectiveTemplate), resolvedOptions)
                        instance = await createPropertyInstance(merged, value, !this.parent.linked, this.parent.linked, this.parent)
                        resolved = true
                    }
                }
                // prevent creating constraint chooser in view mode
                if (!resolved && effectiveTemplate.config.editMode) {
                    instance = createShaclOrConstraint(options, this, effectiveTemplate.config, predicate, effectiveTemplate)
                    appendRemoveButton(instance, '', effectiveTemplate.config.theme.dense, effectiveTemplate.config.hierarchyColorsStyleSheet !== undefined, forceRemovable)
                }
            } else {
                instance = await createPropertyInstance(effectiveTemplate, value, forceRemovable, linked || this.parent.linked, this.parent)
            }
        }
        if (instance) {
            instance.dataset.path = this.template.path
            if (predicate) {
                instance.dataset.predicate = predicate
            }
            if (insert) {
                this.container.insertBefore(instance, this.querySelector(ADD_BUTTON_SELECTOR))
            }
        }
        return instance
    }

    async updateControls() {
        if (this.template.config.editMode && !this.parent.linked && !this.querySelector(ADD_BUTTON_SELECTOR)) {
            this.container.appendChild(await this.createAddControls())
        }
        const minCount = this.rdfListItemTemplate
            ? (aggregatedMinCount(this.template) > 0 ? 1 : 0)
            : aggregatedMinCount(this.template)
        const literal = this.rdfListItemTemplate ? this.rdfListItemTemplate.nodeShapes.size === 0 : this.template.nodeShapes.size === 0
        const noLinkableResources = this.querySelector(':scope > .add-button-wrapper > .link-button, :scope > .collapsible > .add-button-wrapper > .link-button') === null
        const mayAutocreateRequiredNode = literal || !this.hasRecursiveNodeShape()
        let instanceCount = this.instanceCount()
        if (instanceCount === 0 && mayAutocreateRequiredNode && (literal || (noLinkableResources && minCount > 0))) {
            await this.addPropertyInstance()
            instanceCount = 1
        }
        if (!literal) {
            this.querySelector(ADD_BUTTON_SELECTOR)?.classList.toggle('required', instanceCount < minCount)
        }

        let mayRemove: boolean
        if (minCount > 0) {
            mayRemove = instanceCount > minCount
        } else {
            mayRemove = !literal || instanceCount > 1
        }

        // sh:maxCount applies to the single list head, not to its rdf:first members.
        const hasLinkedList = this.rdfListItemTemplate !== undefined && this.querySelector(':scope > .property-instance.linked, :scope > .collapsible > .property-instance.linked') !== null
        const listGroupCount = new Set(instancesOf(this).map(instance => this.rdfListGroups.get(instance))).size
        const mayAddListItem = this.rdfListItemTemplate !== undefined && !hasLinkedList && listGroupCount <= 1
        const mayAdd = mayAddListItem || instanceCount < aggregatedMaxCount(this.template)
        this.classList.toggle('may-remove', mayRemove)
        this.classList.toggle('may-add', mayAdd)
    }

    instanceCount() {
        return this.querySelectorAll(PROPERTY_INSTANCE_SELECTOR).length
    }

    refreshClassInstances() {
        if (!this.template.class || this.template.hasValue || !this.template.config.editMode) {
            return
        }

        for (const instance of this.querySelectorAll<HTMLElement>(':scope > .property-instance, :scope > .collapsible > .property-instance')) {
            const editor = instance.querySelector<Editor>(':scope > .editor')
            if (!editor || editor.dataset.class !== this.template.class.value) {
                continue
            }

            const currentValue = toRDF(editor)
            const entries = findInstancesOf(this.template.class, this.template)
            if (currentValue && !containsEntry(entries, currentValue)) {
                // Keep a selected value visible even if its source node was removed.
                // Validation can then flag the stale reference without silently losing it.
                entries.push({ value: currentValue, children: [] })
            }
            const signature = entriesSignature(entries)
            if (editor.dataset.classInstances === signature) {
                continue
            }

            const replacement = this.template.config.theme.createListEditor(
                this.template.label,
                currentValue ?? null,
                aggregatedMinCount(this.template) > 0,
                entries,
                this.template
            ).querySelector<Editor>('.editor')!
            replacement.dataset.classInstances = signature
            editor.replaceWith(replacement)
        }
    }

    hasRecursiveNodeShape() {
        const ancestorShapeIds = new Set<string>()
        this.parent.ancestorShapeIds.forEach(id => ancestorShapeIds.add(id))
        ancestorShapeIds.add(this.parent.template.id.value)
        for (const shape of this.template.nodeShapes) {
            if (ancestorShapeIds.has(shape.id.value)) {
                return true
            }
        }
        return false
    }

    toRDF(graph: Store, subject: NamedNode | BlankNode) {
        if (this.rdfListItemTemplate) {
            this.rdfListToRDF(graph, subject)
            return
        }
        for (const instance of this.querySelectorAll<HTMLElement>(':scope > .property-instance, :scope > .collapsible > .property-instance')) {
            const pathNode = DataFactory.namedNode(instance.dataset.predicate ?? this.template.path!)
            if (instance.firstChild instanceof ShaclNode) {
                const shapeSubject = instance.firstChild.toRDF(graph)
                graph.addQuad(subject, pathNode, shapeSubject, this.template.config.valuesGraphId)
            } else {
                if (this.template.config.editMode) {
                    for (const editor of instance.querySelectorAll<Editor>(':scope > .editor')) {
                        const value = toRDF(editor)
                        if (value) {
                            graph.addQuad(subject, pathNode, value, this.template.config.valuesGraphId)
                        }
                    }
                } else {
                    const value = toRDF(instance as Editor)
                    if (value) {
                        graph.addQuad(subject, pathNode, value, this.template.config.valuesGraphId)
                    }
                }
            }
        }
    }

    async filterValidValues(values: Quad[], valueSubject: NamedNode | BlankNode) {
        // if this property is a sh:qualifiedValueShape, then filter values by validating against this shape
        let nodeShapeToValidate = this.template.id
        let dataSubjectsToValidate = [valueSubject]
        if (this.template.qualifiedValueShape) {
            nodeShapeToValidate = this.template.qualifiedValueShape.id
            dataSubjectsToValidate = []
            for (const value of values) {
                dataSubjectsToValidate.push(value.object as NamedNode)
            }
        }
        const report = await this.template.config.validator.validate({ dataset: this.template.config.store, terms: dataSubjectsToValidate }, [{ terms: [nodeShapeToValidate] }])
        const invalidTerms = new Set<string>()
        for (const result of report.results) {
            const reportObject = this.template.qualifiedValueShape ? result.focusNode : result.value
            if (reportObject?.ptrs?.length) {
                invalidTerms.add(reportObject.ptrs[0]._term.id)
            }
        }
        return values.filter(value => !invalidTerms.has(value.object.id))
    }

    async createAddControls() {
        const wrapper = document.createElement('div')
        wrapper.classList.add('add-button-wrapper')
        wrapper.setAttribute('part', 'add-controls')

        // The generic linker creates one nested node instance and bypasses the
        // list-item/head bookkeeping. Existing externally linked collections can
        // still be displayed, but creating such a link is not a list editing action.
        const linker = this.rdfListItemTemplate ? undefined : await createLinker(this)
        if (linker) {
            wrapper.appendChild(linker)
        }

        const addButton = this.template.config.theme.createButton(this.template.label, false)
        addButton.title = 'Add ' + this.template.label
        addButton.classList.add('add-button')
        addButton.setAttribute('text', '')
        const existingPart = addButton.getAttribute('part')
        addButton.setAttribute('part', `${existingPart ? existingPart + ' ' : ''}add-button`)
        addButton.addEventListener('click', async () => {
            const instance = await this.addPropertyInstance()
            if (instance) {
                instance.classList.add('fadeIn')
                await this.updateControls()
                if (this.template.nodeShapes.size) {
                    this.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
                }
                setTimeout(() => {
                    focusFirstInputElement(instance)
                    instance.classList.remove('fadeIn')
                }, 200)
            }
        })
        wrapper.appendChild(addButton)
        return wrapper
    }

    private async bindRdfList(head: Term, linked: boolean): Promise<HTMLElement | undefined> {
        if (head.termType !== 'NamedNode' && head.termType !== 'BlankNode') {
            return undefined
        }
        let current = head as unknown as NamedNode | BlankNode
        const visited = new Set<string>()
        let firstInstance: HTMLElement | undefined
        while (!current.equals(RDF_OBJECT_NIL) && !visited.has(current.id)) {
            visited.add(current.id)
            const graph = linked ? null : DATA_GRAPH
            const first = this.template.config.store.getQuads(current, RDF_PREDICATE_FIRST, null, graph)[0]
            if (!first) {
                break
            }
            const rest = this.template.config.store.getQuads(current, RDF_PREDICATE_REST, null, graph)[0]
            if (!linked) {
                this.template.config.store.delete(first)
                if (rest) {
                    this.template.config.store.delete(rest)
                }
            }
            const instance = await this.addRdfListItem(first.object, linked, false, true, current, rdfTermKey(head))
            firstInstance ||= instance
            if (!rest || (rest.object.termType !== 'NamedNode' && rest.object.termType !== 'BlankNode')) {
                break
            }
            current = rest.object as unknown as NamedNode | BlankNode
        }
        return firstInstance
    }

    private async addRdfListItem(value?: Term, linked = false, forceRemovable = false, insert = true, listNode?: NamedNode | BlankNode, listGroup?: string) {
        const itemTemplate = cloneProperty(this.rdfListItemTemplate!)
        itemTemplate.label = this.template.label
        const instance = await createPropertyInstance(itemTemplate, value, forceRemovable, linked || this.parent.linked, this.parent)
        instance.dataset.path = this.template.path
        const existingGroup = instancesOf(this).map(existing => this.rdfListGroups.get(existing)).find(group => group !== undefined)
        const node = listNode ?? this.createRdfListNode(existingGroup === undefined)
        this.rdfListNodes.set(instance, node)
        this.rdfListGroups.set(instance, listGroup ?? existingGroup ?? rdfTermKey(node))
        if (insert) {
            this.container.insertBefore(instance, this.querySelector(ADD_BUTTON_SELECTOR))
        }
        return instance
    }

    private createRdfListNode(isHead: boolean): NamedNode | BlankNode {
        if (isHead && this.template.nodeKind?.value === `${PREFIX_SHACL}IRI`) {
            return DataFactory.namedNode(this.template.config.attributes.valuesNamespace + uuidv4())
        }
        return DataFactory.blankNode()
    }

    private rdfListToRDF(graph: Store, subject: NamedNode | BlankNode) {
        const groups = new Map<string, Array<{ instance: HTMLElement, node: NamedNode | BlankNode, value?: NamedNode | BlankNode | Literal, linked: boolean }>>()
        for (const instance of instancesOf(this)) {
            const node = this.rdfListNodes.get(instance) ?? DataFactory.blankNode()
            const groupId = this.rdfListGroups.get(instance) ?? rdfTermKey(node)
            const linked = instance.classList.contains('linked')
            let value: NamedNode | BlankNode | Literal | undefined
            if (!linked && instance.firstChild instanceof ShaclNode) {
                value = instance.firstChild.toRDF(graph)
            } else if (!linked && this.template.config.editMode) {
                const editor = instance.querySelector<Editor>(':scope > .editor')
                value = editor ? toRDF(editor) : undefined
            } else if (!linked) {
                value = toRDF(instance as Editor)
            }
            if (linked || value) {
                const group = groups.get(groupId) ?? []
                group.push({ instance, node, value, linked })
                groups.set(groupId, group)
            }
        }
        const retainedNodeIds = new Set([...groups.values()].flatMap(group => group.map(item => rdfTermKey(item.node))))
        const retainedValues = new Map([...groups.values()].flatMap(group => group
            .filter(item => !item.linked && item.value)
            .map(item => [rdfTermKey(item.node), rdfTermKey(item.value!)] as const)))
        const linkedHeadIds = new Set([...groups.values()].filter(group => group[0]?.linked).map(group => rdfTermKey(group[0].node)))
        this.removePreservedRdfList(graph, subject, retainedNodeIds, retainedValues, linkedHeadIds)
        for (const group of groups.values()) {
            graph.addQuad(subject, DataFactory.namedNode(this.template.path!), group[0].node, this.template.config.valuesGraphId)
            if (group[0].linked) {
                continue
            }
            if (this.template.class) {
                graph.addQuad(group[0].node, RDF_PREDICATE_TYPE, this.template.class, this.template.config.valuesGraphId)
            }
            group.forEach(({ node, value }, index) => {
                graph.addQuad(node, RDF_PREDICATE_FIRST, value!, this.template.config.valuesGraphId)
                graph.addQuad(node, RDF_PREDICATE_REST, group[index + 1]?.node ?? RDF_OBJECT_NIL, this.template.config.valuesGraphId)
            })
        }
    }

    private removePreservedRdfList(graph: Store, subject: NamedNode | BlankNode, retainedNodeIds: Set<string>, retainedValues: Map<string, string>, skippedHeadIds: Set<string>) {
        if (this.template.config.attributes.preserveUnmappedValues === null) {
            return
        }
        const original = this.template.config.originalValues
        const heads = original.getObjects(subject, DataFactory.namedNode(this.template.path!), null)
        const listNodes = new Map<string, NamedNode | BlankNode>()
        const orphanedObjects: BlankNode[] = []
        for (const head of heads) {
            if (head.termType !== 'NamedNode' && head.termType !== 'BlankNode') {
                continue
            }
            if (skippedHeadIds.has(rdfTermKey(head))) {
                continue
            }
            let current = head
            const visited = new Set<string>()
            while (!current.equals(RDF_OBJECT_NIL) && !visited.has(current.id)) {
                visited.add(current.id)
                listNodes.set(rdfTermKey(current), current)
                const rest = original.getQuads(current, RDF_PREDICATE_REST, null, null)[0]
                for (const quad of graph.getQuads(current, RDF_PREDICATE_FIRST, null, null)) {
                    graph.delete(quad)
                    const retainedValue = retainedValues.get(rdfTermKey(current))
                    if (quad.object.termType === 'BlankNode' && rdfTermKey(quad.object) !== retainedValue) {
                        orphanedObjects.push(quad.object)
                    }
                }
                for (const quad of graph.getQuads(current, RDF_PREDICATE_REST, null, null)) {
                    graph.delete(quad)
                }
                if (!rest || (rest.object.termType !== 'NamedNode' && rest.object.termType !== 'BlankNode')) {
                    break
                }
                current = rest.object
            }
        }
        // Once first/rest arcs have been removed, an old blank list cell with no
        // incoming references is genuinely orphaned. Remove its remaining metadata;
        // retained cells and externally referenced cells keep theirs.
        for (const node of listNodes.values()) {
            if (node.termType === 'BlankNode' && !retainedNodeIds.has(rdfTermKey(node)) && graph.countQuads(null, null, node, null) === 0) {
                for (const quad of graph.getQuads(node, null, null, null)) {
                    graph.delete(quad)
                    if (quad.object.termType === 'BlankNode') {
                        orphanedObjects.push(quad.object)
                    }
                }
            }
        }
        removeOrphanedBlankNodeSubgraphs(graph, orphanedObjects)
    }
}

function instancesOf(property: ShaclProperty) {
    return Array.from(property.querySelectorAll<HTMLElement>(':scope > .property-instance, :scope > .collapsible > .property-instance'))
}

function rdfTermKey(term: Pick<Term, 'termType' | 'value'>) {
    return `${term.termType}:${term.value}`
}

function removeOrphanedBlankNodeSubgraphs(graph: Store, candidates: BlankNode[]) {
    const visited = new Set<string>()
    while (candidates.length) {
        const node = candidates.pop()!
        if (visited.has(node.id) || graph.countQuads(null, null, node, null) > 0) {
            continue
        }
        visited.add(node.id)
        for (const quad of graph.getQuads(node, null, null, null)) {
            graph.delete(quad)
            if (quad.object.termType === 'BlankNode') {
                candidates.push(quad.object)
            }
        }
    }
}

export function detectRdfListItemTemplate(template: ShaclPropertyTemplate): ShaclPropertyTemplate | undefined {
    if (template.maxCount !== 1 || template.nodeShapes.size !== 1 || !isSupportedRdfListNodeKind(template.nodeKind) || !hasOnlySupportedShapePredicates(template.config.store, template.id, [
        'path', 'minCount', 'maxCount', 'node', 'nodeKind', 'class'
    ])) {
        return undefined
    }
    const listShape = [...template.nodeShapes][0]
    const listPropertyCount = template.config.store.countQuads(listShape.id, `${PREFIX_SHACL}property`, null, null)
    const listNodeReferences = template.config.store.getObjects(template.id, `${PREFIX_SHACL}node`, null)
    if (listNodeReferences.length !== 1 || !listNodeReferences[0].equals(listShape.id) || listPropertyCount !== 2 || Object.keys(listShape.properties).length !== 2 || listShape.extendedShapes.size || listShape.or?.length || listShape.xone?.length || listShape.nodeKind || listShape.targetClass || !hasOnlySupportedShapePredicates(template.config.store, listShape.id, ['property'])) {
        return undefined
    }
    const first = listShape.properties[RDF_PREDICATE_FIRST.value]
    const rest = listShape.properties[RDF_PREDICATE_REST.value]
    if (first?.length !== 1 || rest?.length !== 1 || first[0].minCount !== 1 || first[0].maxCount !== 1 || rest[0].minCount !== 1 || rest[0].maxCount !== 1) {
        return undefined
    }
    if (first[0].or?.length || first[0].xone?.length || first[0].hasValue || !hasOnlySupportedShapePredicates(template.config.store, rest[0].id, [
        'path', 'minCount', 'maxCount', 'or'
    ])) {
        return undefined
    }
    const branches = rest[0].or
    if (branches?.length !== 2) {
        return undefined
    }
    let hasNilBranch = false
    let hasRecursiveBranch = false
    for (const branch of branches) {
        const quads = template.config.store.getQuads(branch, null, null, null)
        const constraints = quads.filter(quad => quad.predicate.value.startsWith(PREFIX_SHACL) && !SHACL_METADATA_PREDICATES.has(quad.predicate.value))
        hasNilBranch ||= constraints.length === 1 && constraints[0].predicate.value === `${PREFIX_SHACL}hasValue` && constraints[0].object.equals(RDF_OBJECT_NIL)
        hasRecursiveBranch ||= constraints.length === 1 && constraints[0].predicate.value === `${PREFIX_SHACL}node` && constraints[0].object.equals(listShape.id)
    }
    return hasNilBranch && hasRecursiveBranch ? first[0] : undefined
}

function isSupportedRdfListNodeKind(nodeKind: NamedNode | undefined) {
    return nodeKind === undefined || [
        `${PREFIX_SHACL}IRI`,
        `${PREFIX_SHACL}BlankNode`,
        `${PREFIX_SHACL}BlankNodeOrIRI`
    ].includes(nodeKind.value)
}

const SHACL_METADATA_PREDICATES = new Set([
    `${PREFIX_SHACL}name`,
    `${PREFIX_SHACL}description`,
    `${PREFIX_SHACL}order`,
    `${PREFIX_SHACL}group`,
    `${PREFIX_SHACL}message`,
    `${PREFIX_SHACL}severity`
])

function hasOnlySupportedShapePredicates(store: Store, subject: Term, supportedLocalNames: string[]) {
    const supported = new Set(supportedLocalNames.map(name => PREFIX_SHACL + name))
    // RDF types and non-SHACL annotations do not change how the specialized
    // editor must bind or serialize the shape.
    return store.getQuads(subject, null, null, null).every(quad =>
        !quad.predicate.value.startsWith(PREFIX_SHACL) ||
        supported.has(quad.predicate.value) ||
        SHACL_METADATA_PREDICATES.has(quad.predicate.value)
    )
}

function containsEntry(entries: InputListEntry[], value: Term): boolean {
    return entries.some(entry =>
        (typeof entry.value !== 'string' && entry.value.equals(value)) ||
        containsEntry(entry.children ?? [], value)
    )
}

function entriesSignature(entries: InputListEntry[]): string {
    return JSON.stringify(entries.map(entry => [
        typeof entry.value === 'string' ? entry.value : `${entry.value.termType}:${entry.value.value}`,
        entry.label,
        entriesSignature(entry.children ?? [])
    ]))
}

export async function createPropertyInstance(template: ShaclPropertyTemplate, value?: Term, forceRemovable = false, linked = false, parentNode?: ShaclNode): Promise<HTMLElement> {
    let instance: HTMLElement
    if (template.nodeShapes.size) {
        instance = document.createElement('div')
        instance.classList.add('property-instance')
        instance.setAttribute('part', 'property-instance')
        const childAncestorShapeIds = new Set(parentNode?.ancestorShapeIds ?? [])
        if (parentNode) {
            childAncestorShapeIds.add(parentNode.template.id.value)
        }
        for (const shape of template.nodeShapes) {
            const node = new ShaclNode(shape, value as NamedNode | BlankNode | undefined, template.nodeKind, template.label, linked, childAncestorShapeIds)
            instance.appendChild(node)
            await node.ready
        }
    } else {
        const plugin = findPlugin(template.path, template.datatype?.value)
        if (plugin) {
            if (template.config.editMode && !linked) {
                instance = plugin.createEditor(template, value)
            } else {
                instance = plugin.createViewer(template, value!)
            }
        } else {
            instance = fieldFactory(template, value || null, template.config.editMode && !linked)
        }
        // count as property-instance only if not empty
        if (instance.childNodes.length > 0) {
            instance.classList.add('property-instance')
            instance.setAttribute('part', 'property-instance')
        }
        if (linked) {
            instance.classList.add('linked')
        }
    }
    if (template.config.editMode && (!linked || forceRemovable)) {
        appendRemoveButton(instance, template.label, template.config.theme.dense, template.config.hierarchyColorsStyleSheet !== undefined, forceRemovable)
    } else if (template.config.hierarchyColorsStyleSheet !== undefined) {
        // add remove button wrapper only (for coloring)
        instance.appendChild(createRemoveButtonWrapper(true))
    }

    if (value && !template.config.editMode) {
        // In view mode there is no input element, so retain the bound RDF term
        // directly on the property instance for lossless serialization.
        bindEditorTerm(instance as Editor, value)
    }

    instance.dataset.path = template.path
    return instance
}

export function appendRemoveButton(instance: HTMLElement, label: string, dense: boolean, colorize: boolean, forceRemovable = false) {
    const wrapper = createRemoveButtonWrapper(colorize)
    const removeButton = new RokitButton()
    removeButton.classList.add('remove-button', 'clear')
    removeButton.title = 'Remove ' + label
    removeButton.dense = dense
    removeButton.icon = true
    const existingPart = removeButton.getAttribute('part')
    removeButton.setAttribute('part', `${existingPart ? existingPart + ' ' : ''}remove-button`)
    removeButton.addEventListener('click', () => {
        instance.classList.remove('fadeIn')
        instance.classList.add('fadeOut')
        setTimeout(() => {
            const parent = instance.parentElement
            instance.remove()
            parent?.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
        }, 200)
    })
    if (forceRemovable) {
        removeButton.classList.add('persistent')
    }
    wrapper.appendChild(removeButton)
    instance.appendChild(wrapper)
}

export function createRemoveButtonWrapper(colorize: boolean) {
    const wrapper = document.createElement('div')
    wrapper.className = 'remove-button-wrapper'
    wrapper.setAttribute('part', 'remove-controls')
    if (colorize) {
        wrapper.classList.add('colorize')
    }
    return wrapper
}

window.customElements.define('shacl-property', ShaclProperty)
