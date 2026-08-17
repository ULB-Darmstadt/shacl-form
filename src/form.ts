import { ShaclNode } from './node.js'
import type { ShaclProperty } from './property.js'
import { Config } from './config.js'
import { ClassInstanceProvider, RdfUrlResolver, ResourceLinkProvider, Plugin, listPlugins, registerPlugin } from './plugin.js'
import { Store, NamedNode, DataFactory, BlankNode, Literal } from 'n3'
import { DATA_GRAPH, DCTERMS_PREDICATE_CONFORMS_TO, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, SHACL_PREDICATE_MESSAGE, SHACL_PREDICATE_TARGET_CLASS, SHAPES_GRAPH } from './constants.js'
import { Editor, Theme } from './theme.js'
import { serialize } from './serialize.js'
import { RokitCollapsible, RokitSelect } from '@ro-kit/ui-widgets'
import { mergeOverriddenProperties, ShaclNodeTemplate } from './node-template.js'
import { findConformsToShapeSubject, findConformsToValuesSubject, loadGraphs } from './graph-loader.js'
import { prefixes } from './rdf-loader.js'
import { loadUnresolvedValues } from './linker.js'
import { findBestMatchingLiteral } from './util.js'
import type { Query, QueryFacetProvider } from './query/index.js'
import type { Term } from '@rdfjs/types'

type QueryController = {
    stylesheet: CSSStyleSheet
    initialize(): Promise<void>
    handleChange(): void
    getQuery(): Query
    refreshFacets(): void
    dispose(): void
}

export * from './exports.js'
export const initTimeout = 200

export interface ValidationReport {
    conforms: boolean
    results: unknown[]
}

export class ShaclForm extends HTMLElement {
    static get observedAttributes() {
        return Config.dataAttributes()
    }

    config: Config
    shape: ShaclNode | null = null
    form: HTMLFormElement
    initDebounceTimeout: ReturnType<typeof setTimeout> | undefined
    private styleElement: HTMLStyleElement | null = null
    private queryController?: QueryController
    private validationQueue: Promise<void> = Promise.resolve()
    private validationGeneration = 0

    constructor() {
        super()

        this.form = document.createElement('form')
        this.form.setAttribute('part', 'form')
        this.config = new Config(this.form)
        this.form.addEventListener('change', ev => {
            ev.stopPropagation()
            if (this.config.queryMode) {
                this.queryController?.handleChange()
            } else if (this.config.editMode) {
                this.validate(true).then(report => {
                    this.refreshClassInstanceEditors()
                    this.dispatchEvent(new CustomEvent('change', { bubbles: true, cancelable: false, composed: true, detail: { 'valid': report.conforms, 'report': report } }))
                }).catch(e => {
                    console.warn(e)
                })
            }
        })
    }

    connectedCallback() {
        this.config.updateAttributes(this)
        this.ensureRenderRoot()
        this.initialize()
    }

    attributeChangedCallback() {
        this.config.updateAttributes(this)
        this.ensureRenderRoot()
        this.initialize()
    }

    private initialize() {
        clearTimeout(this.initDebounceTimeout)
        this.queryController?.dispose()
        this.queryController = undefined
        // set loading attribute on element so that hosting app can apply special css rules
        this.setAttribute('loading', '')
        // Keep the graph-loading placeholder visually consistent with the form and
        // query-facet loading states. The complete stylesheet set is applied again
        // after graph loading, once query-mode and plugin styles are known.
        this.config.theme.apply(this.form)
        this.applyStyles([this.config.theme.stylesheet])
        // remove all child elements from form and show loading indicator
        this.form.replaceChildren(document.createTextNode(this.config.attributes.loading))
        this.initDebounceTimeout = setTimeout(async () => {
            try {
                // reset cached values in config
                this.config.reset()
                // load all data
                this.config.store = await loadGraphs({
                    shapes: this.config.attributes.shapes,
                    shapesUrl: this.config.attributes.shapesUrl,
                    values: this.config.attributes.values,
                    valuesUrl: this.config.attributes.valuesUrl,
                    valuesSubject: this.config.attributes.valuesSubject,
                    loadOwlImports: this.config.attributes.ignoreOwlImports === null,
                    classInstanceProvider: this.config.classInstanceProvider,
                    rdfUrlResolver: this.config.rdfUrlResolver,
                    proxy: this.config.attributes.proxy
                }, this.config.originalValues)
                // if we have a resource link provider, let it resolve linked resources in the data graph
                if (this.config.resourceLinkProvider) {
                    await loadUnresolvedValues(this.config)
                }
                if (!this.config.attributes.valuesSubject) {
                    this.config.attributes.valuesSubject = findConformsToValuesSubject(this.config.store) || null
                }

                // remove loading indicator
                this.form.replaceChildren()
                // find root shacl shape
                const rootShapeShaclSubject = this.findRootShaclShapeSubject()
                if (rootShapeShaclSubject) {
                    // remove all previous css classes to have a defined state
                    this.form.classList.forEach(value => {
                        this.form.classList.remove(value)
                    })
                    this.form.classList.toggle('mode-edit', this.config.editMode)
                    this.form.classList.toggle('mode-view', this.config.mode === 'view')
                    this.form.classList.toggle('mode-query', this.config.queryMode)
                    if (this.config.queryMode) {
                        const { QueryModeController } = await import('./query/mode.js')
                        this.queryController = new QueryModeController(this)
                    }
                    // let theme add css classes to form element
                    this.config.theme.apply(this.form)
                    // adopt stylesheets from theme and plugins
                    const styles: CSSStyleSheet[] = [this.config.theme.stylesheet]
                    if (this.config.hierarchyColorsStyleSheet) {
                        styles.push(this.config.hierarchyColorsStyleSheet)
                    }
                    if (this.queryController) {
                        styles.push(this.queryController.stylesheet)
                    }
                    for (const plugin of listPlugins()) {
                        if (plugin.stylesheet) {
                            styles.push(plugin.stylesheet)
                        }
                    }
                    this.applyStyles(styles)

                    const rootTemplate = new ShaclNodeTemplate(rootShapeShaclSubject, this.config)
                    for (const nodeTemplate of this.config.nodeTemplates) {
                        mergeOverriddenProperties(nodeTemplate)
                    }
                    this.shape = new ShaclNode(rootTemplate, this.config.attributes.valuesSubject ? DataFactory.namedNode(this.config.attributes.valuesSubject) : undefined)
                    this.form.appendChild(this.shape)

                    if (this.config.attributes.showRootShapeLabel !== null && rootTemplate.label) {
                        const heading = document.createElement('h3')
                        heading.innerText = rootTemplate.label.value
                        this.form.prepend(heading)
                    }

                    if (this.config.editMode) {
                        // add submit button
                        if (this.config.attributes.submitButton !== null) {
                            const button = this.config.theme.createButton(this.config.attributes.submitButton || 'Submit', true)
                            button.classList.add('submit-button')
                            const existingPart = button.getAttribute('part')
                            button.setAttribute('part', `${existingPart ? existingPart + ' ' : ''}submit-button`)
                            button.addEventListener('click', (event) => {
                                event.preventDefault()
                                // let browser check form validity first
                                if (this.form.reportValidity()) {
                                    // now validate data graph
                                    this.validate().then(report => {
                                        if (report?.conforms) {
                                            // form and data graph are valid, so fire submit event
                                            this.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
                                        } else {
                                            this.focusFirstInvalidElement()
                                        }
                                    })
                                } else {
                                    // Native validation bubbles are unreliable for
                                    // form-associated controls with nested shadow roots.
                                    // Render the SHACL message and focus the real control.
                                    this.validate().then(() => {
                                        this.focusFirstInvalidElement(true)
                                    })
                                }
                            })
                            this.form.appendChild(button)
                        }
                        // property value binding is asynchronous, so wait for node rendering to finish before cleanup
                        await this.shape?.ready
                        // delete bound values from data graph, otherwise validation would not work correctly
                        if (this.config.attributes.valuesSubject) {
                            this.removeFromDataGraph(DataFactory.namedNode(this.config.attributes.valuesSubject))
                        }
                        await this.validate(true)
                        this.refreshClassInstanceEditors()
                    } else if (this.config.queryMode) {
                        await this.shape.ready
                        await this.queryController?.initialize()
                    }
                } else if (this.config.store.countQuads(null, null, null, SHAPES_GRAPH) > 0) {
                    // raise error only when shapes graph is not empty
                    throw new Error('shacl root node shape not found')
                }
            } catch (e) {
                console.error(e)
                const errorDisplay = document.createElement('div')
                errorDisplay.innerText = String(e)
                this.form.replaceChildren(errorDisplay)
            }
            // QueryModeController owns the attribute while an initial facet request
            // may still be running (for example when the provider was attached
            // during initialization). Other modes finish loading here.
            if (!(this.config.queryMode && this.config.queryFacetProvider && this.queryController)) {
                this.removeAttribute('loading')
            }
            // drain micro task queue before dispatching 'ready' event
            await this.shape?.ready
            this.dispatchEvent(new Event('ready', { bubbles: true, composed: true }))
        }, initTimeout)
    }

    private ensureRenderRoot() {
        const useShadowRoot = this.config.attributes.useShadowRoot !== 'false'
        if (useShadowRoot) {
            if (!this.shadowRoot) {
                this.attachShadow({ mode: 'open' })
            }
            if (!this.shadowRoot!.contains(this.form)) {
                this.shadowRoot!.prepend(this.form)
            }
        } else {
            if (this.shadowRoot?.contains(this.form)) {
                this.shadowRoot.removeChild(this.form)
            }
            if (!this.contains(this.form)) {
                this.prepend(this.form)
            }
        }
    }

    private focusFirstInvalidElement(reportValidity = false) {
        const invalidEditor = this.form.querySelector(':scope .invalid > .editor') as Editor & {
            reportValidity?: () => boolean
        } | null
        if (invalidEditor) {
            if (reportValidity) {
                invalidEditor.reportValidity?.()
            }
            if (invalidEditor instanceof RokitSelect) {
                invalidEditor.input.inputElement.focus()
            } else {
                invalidEditor.focus()
            }
        } else {
            this.form.querySelector(':scope .invalid')?.scrollIntoView()
        }
    }

    private applyStyles(styles: CSSStyleSheet[]) {
        const useShadowRoot = this.config.attributes.useShadowRoot !== 'false'
        if (useShadowRoot && this.shadowRoot) {
            this.shadowRoot.adoptedStyleSheets = styles
            if (this.styleElement) {
                this.styleElement.remove()
                this.styleElement = null
            }
            return
        }

        const cssText = styles.map(styleSheet => {
            const rules = Array.from(styleSheet.cssRules).map(rule => rule.cssText).join('\n')
            return rules.replace(/:host\b/g, 'shacl-form')
        }).join('\n')

        if (!this.styleElement) {
            this.styleElement = document.createElement('style')
            this.prepend(this.styleElement)
        }
        this.styleElement.textContent = cssText
    }

    public serialize(format = 'text/turtle', graph?: Store): string {
        this.assertNotQueryMode('serialize')
        graph = graph ?? this.toRDF()
        const quads = graph.getQuads(null, null, null, null)
        return serialize(quads, format, prefixes)
    }

    public toRDF(graph = new Store()): Store {
        this.assertNotQueryMode('toRDF')
        let removedBlankNodes: Map<string, BlankNode> | undefined
        if (this.config.attributes.preserveUnmappedValues !== null) {
            removedBlankNodes = this.preparePreservedOutput(graph)
        }
        this.shape?.toRDF(graph, undefined, this.config.attributes.generateNodeShapeReference)
        if (removedBlankNodes?.size) {
            this.pruneOrphanedBlankNodes(graph, removedBlankNodes)
        }
        return graph
    }

    private preparePreservedOutput(graph: Store): Map<string, BlankNode> {
        const original = this.config.originalValues
        const removedBlankNodes = new Map<string, BlankNode>()
        graph.addQuads(original.getQuads(null, null, null, null))

        // Replace only values represented by the rendered form. Deleting the exact
        // original quads keeps unrelated predicates, subjects, and graph names intact.
        for (const property of this.form.querySelectorAll<ShaclProperty>('shacl-property')) {
            if (property.parent.linked) {
                continue
            }
            for (const path of property.template.pathAlternatives ?? [property.template.path]) {
                if (!path) {
                    continue
                }
                for (const quad of original.getQuads(property.parent.nodeId, path, null, null)) {
                    graph.delete(quad)
                    if (quad.object.termType === 'BlankNode') {
                        removedBlankNodes.set(quad.object.id, quad.object)
                    }
                }
            }
        }

        for (const node of this.form.querySelectorAll<ShaclNode>('shacl-node:not([part~="linked-node"])')) {
            if (!node.template.targetClass) {
                continue
            }
            for (const quad of original.getQuads(node.nodeId, RDF_PREDICATE_TYPE, node.template.targetClass, null)) {
                graph.delete(quad)
            }
        }

        const shapeReference = this.config.attributes.generateNodeShapeReference
        if (this.shape && shapeReference) {
            for (const quad of original.getQuads(
                this.shape.nodeId,
                DataFactory.namedNode(shapeReference),
                this.shape.template.id,
                null
            )) {
                graph.delete(quad)
            }
        }
        return removedBlankNodes
    }

    private pruneOrphanedBlankNodes(graph: Store, roots: Map<string, BlankNode>) {
        const candidates = new Map(roots)
        const pending = [...roots.values()]
        while (pending.length) {
            const node = pending.pop()!
            for (const quad of graph.getQuads(node, null, null, null)) {
                if (quad.object.termType === 'BlankNode' && !candidates.has(quad.object.id)) {
                    candidates.set(quad.object.id, quad.object)
                    pending.push(quad.object)
                }
            }
        }

        // A candidate is retained if it is still part of the rendered form or has
        // an incoming reference from outside the candidate subgraph. Retention then
        // propagates through its blank-node descendants.
        const retained = new Set<string>()
        const retainedPending: BlankNode[] = []
        const retain = (node: BlankNode) => {
            if (!retained.has(node.id)) {
                retained.add(node.id)
                retainedPending.push(node)
            }
        }
        for (const node of this.form.querySelectorAll<ShaclNode>('shacl-node:not([part~="linked-node"])')) {
            if (node.nodeId.termType === 'BlankNode' && candidates.has(node.nodeId.id)) {
                retain(node.nodeId)
            }
        }
        for (const candidate of candidates.values()) {
            const externallyReferenced = graph.getQuads(null, null, candidate, null).some(quad =>
                quad.subject.termType !== 'BlankNode' || !candidates.has(quad.subject.id)
            )
            if (externallyReferenced) {
                retain(candidate)
            }
        }
        while (retainedPending.length) {
            const node = retainedPending.pop()!
            for (const quad of graph.getQuads(node, null, null, null)) {
                if (quad.object.termType === 'BlankNode' && candidates.has(quad.object.id)) {
                    retain(quad.object)
                }
            }
        }

        for (const candidate of candidates.values()) {
            if (!retained.has(candidate.id)) {
                for (const quad of graph.getQuads(candidate, null, null, null)) {
                    graph.delete(quad)
                }
            }
        }
    }

    public registerPlugin(plugin: Plugin) {
        registerPlugin(plugin)
        this.initialize()
    }

    public setTheme(theme: Theme) {
        this.config.theme = theme
        this.initialize()
    }

    public setClassInstanceProvider(provider: ClassInstanceProvider) {
        this.config.classInstanceProvider = provider
        this.initialize()
    }

    public setRdfUrlResolver(provider: RdfUrlResolver) {
        this.config.rdfUrlResolver = provider
        this.initialize()
    }

    public setResourceLinkProvider(provider: ResourceLinkProvider) {
        this.config.resourceLinkProvider = provider
        this.initialize()
    }

    public setQueryFacetProvider(provider: QueryFacetProvider) {
        this.config.queryFacetProvider = provider
        this.queryController?.refreshFacets()
    }

    public getQuery(): Query {
        if (!this.shape) {
            return { rootShapeId: '', criteria: [] }
        }
        return this.queryController?.getQuery() ?? {
            rootShapeId: this.shape.template.id.value,
            targetClass: this.shape.template.targetClass?.value,
            criteria: []
        }
    }

    public refreshQueryFacets() {
        this.queryController?.refreshFacets()
    }

    /* Returns the validation report */
    public async validate(ignoreEmptyValues = false): Promise<ValidationReport> {
        this.assertNotQueryMode('validate')
        const validationGeneration = ++this.validationGeneration
        for (const elem of this.form.querySelectorAll(':scope .validation-error')) {
            elem.remove()
        }
        for (const elem of this.form.querySelectorAll<HTMLElement>(':scope .property-instance')) {
            const editor = elem.querySelector(':scope > .editor') as Editor | null
            const hasValue = Boolean(editor?.value)
            const hasEditorValidityError = editor?.validity?.valid === false && (hasValue || !ignoreEmptyValues)
            elem.classList.toggle('invalid', hasEditorValidityError)
            if (hasValue && !hasEditorValidityError) {
                elem.classList.add('valid')
            } else {
                elem.classList.remove('valid')
            }
            if (hasEditorValidityError && editor?.validationMessage) {
                this.appendValidationErrorDisplay(elem, editor.validationMessage)
            }
        }
        for (const btn of this.form.querySelectorAll('.add-button-wrapper')) {
            btn.classList.remove('invalid', 'validation-error')
        }

        if (!this.shape) {
            return { conforms: true, results: [] }
        }
        // if a add-button is required, then mark it as invalid and early out
        if (!ignoreEmptyValues) {
            const requiredAddButtons = this.form.querySelectorAll('.add-button-wrapper.required')
            for (const btn of requiredAddButtons) {
                btn.classList.add('invalid')
                btn.after(this.createValidationErrorDisplay('Value is required', 'node'))
            }
            if (requiredAddButtons.length > 0) {
                return { conforms: false, results: [] }
            }
        }

        const rootShape = this.shape
        const runValidation = () => new Promise<ValidationReport>((resolve) => {
            this.config.store.deleteGraph(this.config.valuesGraphId || '').on('end', async () => {
                rootShape.toRDF(this.config.store, undefined, this.config.attributes.generateNodeShapeReference)
                try {
                    const report = await this.config.validator.validate({ dataset: this.config.store, terms: [rootShape.nodeId] }, [{ terms: [rootShape.template.id] }])
                    if (validationGeneration !== this.validationGeneration) {
                        resolve(report)
                        return
                    }
                    const validationResults = [...report.results]
                    for (let resultIndex = 0; resultIndex < validationResults.length; resultIndex++) {
                        const result = validationResults[resultIndex]
                        // Composite constraints such as sh:node expose the
                        // actionable property violations as nested results.
                        // Walk those too so fields are not left with a valid
                        // marker merely because their violation is wrapped.
                        validationResults.push(...(result.results ?? []))
                        if (result.focusNode?.ptrs?.length) {
                            for (const ptr of result.focusNode.ptrs) {
                                const focusNode = ptr._term
                                // result.path can be empty, e.g. if a focus node does not contain a required property node
                                if (result.path?.length) {
                                    const path = result.path[0].predicates[0]
                                    // try to find most specific editor elements first
                                    const editorSelector = (attribute: 'data-path' | 'data-predicate') => `
                                        :scope shacl-node[data-node-id='${focusNode.id}'] > shacl-property > .property-instance[${attribute}='${path.id}'] > .editor,
                                        :scope shacl-node[data-node-id='${focusNode.id}'] > shacl-property > .shacl-group > .property-instance[${attribute}='${path.id}'] > .editor,
                                        :scope shacl-node[data-node-id='${focusNode.id}'] > .shacl-group > shacl-property > .property-instance[${attribute}='${path.id}'] > .editor,
                                        :scope shacl-node[data-node-id='${focusNode.id}'] > .shacl-group > shacl-property > .shacl-group > .property-instance[${attribute}='${path.id}'] > .editor`
                                    let invalidElements = this.form.querySelectorAll(editorSelector('data-path'))
                                    if (invalidElements.length === 0) {
                                        invalidElements = this.form.querySelectorAll(editorSelector('data-predicate'))
                                    }
                                    if (invalidElements.length === 0) {
                                        // if no editors found, select respective node. this will be the case for node shape violations.
                                        invalidElements = this.form.querySelectorAll(`
                                            :scope [data-node-id='${focusNode.id}']  > shacl-property > .property-instance[data-path='${path.id}'],
                                            :scope [data-node-id='${focusNode.id}']  > shacl-property > .shacl-group > .property-instance[data-path='${path.id}'],
                                            :scope [data-node-id='${focusNode.id}']  > shacl-property > .alternative-path-constraint[data-path='${path.id}'],
                                            :scope [data-node-id='${focusNode.id}']  > shacl-property > .shacl-group > .alternative-path-constraint[data-path='${path.id}']`)
                                    }
                                    if (invalidElements.length === 0) {
                                        invalidElements = this.form.querySelectorAll(`
                                            :scope [data-node-id='${focusNode.id}']  > shacl-property > .property-instance[data-predicate='${path.id}'],
                                            :scope [data-node-id='${focusNode.id}']  > shacl-property > .shacl-group > .property-instance[data-predicate='${path.id}']`)
                                    }

                                    for (const invalidElement of invalidElements) {
                                        if (invalidElement.classList.contains('editor')) {
                                            // this is a property shape violation
                                            if (!ignoreEmptyValues || (invalidElement as Editor).value) {
                                                let parent: HTMLElement | null = invalidElement.parentElement!
                                                parent.classList.add('invalid')
                                                parent.classList.remove('valid')
                                                this.appendValidationErrorDisplay(parent, result)
                                                do {
                                                    if (parent instanceof RokitCollapsible) {
                                                        parent.open = true
                                                    }
                                                    parent = parent.parentElement
                                                } while (parent)
                                            }
                                        } else if (!ignoreEmptyValues) {
                                            // this is a node shape violation
                                            invalidElement.classList.add('invalid')
                                            invalidElement.classList.remove('valid')
                                            invalidElement.appendChild(this.createValidationErrorDisplay(result, 'node'))
                                        }
                                    }
                                } else if (!ignoreEmptyValues) {
                                    this.form.querySelector(`:scope [data-node-id='${focusNode.id}']:not([part~='linked-node'])`)?.prepend(this.createValidationErrorDisplay(result, 'node'))
                                }
                            }
                        }
                    }
                    resolve(report)
                } catch (e) {
                    console.error(e)
                    resolve({ conforms: false, results: [] })
                }
            })
        })
        const promise = this.validationQueue.then(runValidation, runValidation)
        this.validationQueue = promise.then(() => undefined, () => undefined)
        return promise
    }

    private assertNotQueryMode(method: string) {
        if (this.config.queryMode) {
            throw new Error(`${method}() is not available in query mode; use getQuery()`)
        }
    }

    private refreshClassInstanceEditors() {
        if (!this.shape || !this.config.editMode) {
            return
        }
        for (const property of this.form.querySelectorAll<ShaclProperty>('shacl-property')) {
            property.refreshClassInstances()
        }
    }

    private appendValidationErrorDisplay(parent: HTMLElement, validationResult?: unknown, clazz?: string) {
        const messageElement = this.createValidationErrorDisplay(validationResult, clazz)
        const existing = parent.querySelector<HTMLElement>(':scope > .validation-error')
        if (!existing) {
            parent.appendChild(messageElement)
            return
        }
        if (messageElement.title && this.hasExplicitShaclMessage(validationResult)) {
            existing.title = messageElement.title
            return
        }
        if (messageElement.title && !existing.title.split('\n').includes(messageElement.title)) {
            existing.title = existing.title ? `${existing.title}\n${messageElement.title}` : messageElement.title
        }
    }

    private hasExplicitShaclMessage(validationResult: unknown) {
        if (typeof validationResult !== 'object' || validationResult === null) {
            return false
        }
        const result = validationResult as {
            shape?: { message?: Term[], ptr?: { terms?: Term[] } }
            source?: Term[]
        }
        if (result.shape?.message?.length) {
            return true
        }
        const messageSubjects = [...(result.shape?.ptr?.terms ?? []), ...(result.source ?? [])]
        return messageSubjects.some(subject =>
            this.config.store.countQuads(subject, SHACL_PREDICATE_MESSAGE, null, null) > 0
        )
    }

    private createValidationErrorDisplay(validatonResult?: unknown, clazz?: string): HTMLElement {
        const messageElement = document.createElement('span')
        messageElement.classList.add('validation-error')
        if (clazz) {
            messageElement.classList.add(clazz)
        }
        const result = (typeof validatonResult === 'object' && validatonResult !== null)
            ? validatonResult as { message?: Array<Literal>; sourceConstraintComponent?: { value?: string } }
            : null
        if (result) {
            if (result.message?.length) {
                messageElement.title += findBestMatchingLiteral(this.config.languages, result.message)
            } else if (result.sourceConstraintComponent?.value) {
                messageElement.title = result.sourceConstraintComponent.value
            }
        } else if (typeof(validatonResult) === 'string') {
            messageElement.title = validatonResult
        }
        return messageElement
    }

    private findRootShaclShapeSubject(): NamedNode | undefined {
        // if data-shape-subject is set, use that
        if (this.config.attributes.shapeSubject) {
            const rootShapeShaclSubject = DataFactory.namedNode(this.config.attributes.shapeSubject)
            if (this.config.store.getQuads(rootShapeShaclSubject, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null).length === 0) {
                console.warn(`shapes graph does not contain requested node shape ${this.config.attributes.shapeSubject}`)
                return
            } else {
                return rootShapeShaclSubject
            }
        } else {
            // if we have a data graph and data-values-subject is set, use shape of that
            if (this.config.attributes.valuesSubject && this.config.store.countQuads(null, null, null, DATA_GRAPH) > 0) {
                const rootValueSubject = DataFactory.namedNode(this.config.attributes.valuesSubject)
                const rootConformsToShape = findConformsToShapeSubject(this.config.store, this.config.attributes.valuesSubject)
                const rootValueSubjectTypes = this.config.store.getQuads(rootValueSubject, RDF_PREDICATE_TYPE, null, DATA_GRAPH)
                if (rootValueSubjectTypes.length === 0) {
                    console.warn(`value subject '${this.config.attributes.valuesSubject}' has neither ${RDF_PREDICATE_TYPE.id} nor ${DCTERMS_PREDICATE_CONFORMS_TO.id} statement`)
                }
                // if dcterms:conformsTo refers to a node shape, prioritize that over targetClass resolution
                if (rootConformsToShape) {
                    return rootConformsToShape
                }
                // if rdf:type refers to a node shape, prioritize that over targetClass resolution
                for (const rootValueSubjectType of rootValueSubjectTypes) {
                    if (this.config.store.getQuads(rootValueSubjectType.object as NamedNode, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null).length > 0) {
                        return rootValueSubjectType.object as NamedNode
                    }
                }
                // find root shape via targetClass
                const classes = this.config.store.getObjects(rootValueSubject, RDF_PREDICATE_TYPE, DATA_GRAPH)
                for (const clazz of classes) {
                    for (const rootShapeCandidate of this.config.store.getQuads(null, SHACL_PREDICATE_TARGET_CLASS, clazz, null)) {
                        return rootShapeCandidate.subject as NamedNode
                    }
                }
            }
            // choose first of all defined root shapes
            const rootShapes = this.config.store.getQuads(null, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null)
            if (rootShapes.length == 0) {
                console.warn('shapes graph does not contain any node shapes')
                return
            }
            if (rootShapes.length > 1) {
                console.warn('shapes graph contains', rootShapes.length, 'node shapes. choosing first found which is', rootShapes[0].subject.value)
                console.info('hint: set the node shape to use with element attribute "data-shape-subject"')
            }
            return rootShapes[0].subject as NamedNode
        }
    }

    private removeFromDataGraph(subject: NamedNode | BlankNode) {
        for (const quad of this.config.store.getQuads(subject, null, null, DATA_GRAPH)) {
            this.config.store.delete(quad)
            if (quad.object.termType === 'NamedNode' || quad.object.termType === 'BlankNode') {
                // recurse
                this.removeFromDataGraph(quad.object)
            }
        }
    }
}

window.customElements.define('shacl-form', ShaclForm)
