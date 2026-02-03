import { BlankNode, DataFactory, Literal, NamedNode, Quad, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from './node'
import { createShaclOrConstraint, resolveShaclOrConstraintOnProperty } from './constraints'
import { focusFirstInputElement } from './util'
import { aggregatedMinCount, cloneProperty, mergeQuads, ShaclPropertyTemplate } from './property-template'
import { Editor, fieldFactory } from './theme'
import { toRDF } from './serialize'
import { findPlugin } from './plugin'
import { DATA_GRAPH } from './constants'
import { RokitButton, RokitCollapsible } from '@ro-kit/ui-widgets'
import { createLinker } from './linker'

export class ShaclProperty extends HTMLElement {
    template: ShaclPropertyTemplate
    container: HTMLElement
    parent: ShaclNode

    constructor(template: ShaclPropertyTemplate, parent: ShaclNode) {
        super()
        this.template = template
        this.parent = parent
        this.container = this
        if (this.template.nodeShapes.size && this.template.config.attributes.collapse !== null && (this.template.maxCount === undefined || this.template.maxCount > 1)) {
            const collapsible = new RokitCollapsible()
            collapsible.classList.add('collapsible', 'shacl-group');
            collapsible.open = template.config.attributes.collapse === 'open';
            collapsible.label = this.template.label;
            this.container = collapsible
            this.appendChild(this.container)
        }

        if (this.template.order !== undefined) {
            this.style.order = `${this.template.order}`
        }
        if (this.template.cssClass) {
            this.classList.add(this.template.cssClass)
        }
        if (template.config.editMode && !parent.linked) {
            this.addEventListener('change', async () => { await this.updateControls() })
        }
    }

    // binds data graph triples to form fields and (if present) creates missing sh:hasValue form field
    async bindValues(valueSubject: NamedNode | BlankNode | undefined, multiValuedPath?: boolean) {
        if (this.template.path) {
            let valuesContainHasValue = false
            if (valueSubject) {
                // for linked resource, get values in all graphs, otherwise only from data graph
                let values = this.template.config.store.getQuads(valueSubject, this.template.path, null, this.parent.linked ? null : DATA_GRAPH)
                if (multiValuedPath) {
                    // ignore values that do not conform to this property. this might be the case when there are multiple properties with the same sh:path in a NodeShape (i.e. sh:qualifiedValueShape).
                    values = await this.filterValidValues(values, valueSubject)
                }
                for (const value of values) {
                    // remove quad from data graph to prevent double binding if value is not linked
                    if (!this.parent.linked) {
                        this.template.config.store.delete(value)
                    }
                    // if value is not in data graph or has loaded via ResourceLinkProvider, then it is a linked resource
                    await this.addPropertyInstance(value.object, !DATA_GRAPH.equals(value.graph) || this.template.config.providedResources[value.object.value] !== undefined, this.template.config.providedResources[value.object.value] !== undefined)
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

    async addPropertyInstance(value?: Term, linked?: boolean, forceRemovable = false): Promise<HTMLElement> {
        let instance: HTMLElement
        if (this.template.or?.length || this.template.xone?.length) {
            const options = this.template.or?.length ? this.template.or : this.template.xone as Term[]
            let resolved = false
            if (value) {
                const resolvedOptions = resolveShaclOrConstraintOnProperty(options, value, this.template.config)
                if (resolvedOptions.length) {
                    const merged = mergeQuads(cloneProperty(this.template), resolvedOptions)
                    instance = await createPropertyInstance(merged, value, !this.parent.linked, this.parent.linked)
                    resolved = true
                }
            }
            if (!resolved) {
                instance = createShaclOrConstraint(options, this, this.template.config)
                appendRemoveButton(instance, '', this.template.config.theme.dense, this.template.config.hierarchyColorsStyleSheet !== undefined)
            }
        } else {
            instance = await createPropertyInstance(this.template, value, forceRemovable, linked || this.parent.linked)
        }
        this.container.insertBefore(instance!, this.querySelector(':scope > .add-button-wrapper'))
        return instance!
    }

    async updateControls() {
        if (this.template.config.editMode && !this.parent.linked && !this.querySelector(':scope > .add-button-wrapper')) {
            this.container.appendChild(await this.createAddControls())
        }
        const minCount = aggregatedMinCount(this.template)
        const literal = this.template.nodeShapes.size === 0
        const noLinkableResources = this.querySelector(':scope > .add-button-wrapper > .link-button') === null
        let instanceCount = this.instanceCount()
        if (instanceCount === 0 && (literal || (noLinkableResources && minCount > 0))) {
                this.addPropertyInstance()
                instanceCount = 1
        }
        if (!literal) {
            this.querySelector(':scope > .add-button-wrapper')?.classList.toggle('required', instanceCount < minCount)
        }

        let mayRemove: boolean
        if (minCount > 0) {
            mayRemove = instanceCount > minCount
        } else {
            mayRemove = this.template.nodeShapes.size > 0 || instanceCount > 1
        }

        const mayAdd = this.template.maxCount === undefined || instanceCount < this.template.maxCount
        this.classList.toggle('may-remove', mayRemove)
        this.classList.toggle('may-add', mayAdd)
    }

    instanceCount() {
        return this.querySelectorAll(":scope > .property-instance, :scope > .shacl-or-constraint, :scope > shacl-node, :scope > .collapsible > .property-instance").length
    }

    toRDF(graph: Store, subject: NamedNode | BlankNode) {
        const pathNode = DataFactory.namedNode(this.template.path!)
        for (const instance of this.querySelectorAll(':scope > .property-instance, :scope > .collapsible > .property-instance')) {
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
                }
                else {
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
        const invalidTerms: string[] = []
        for (const result of report.results) {
            const reportObject = this.template.qualifiedValueShape ? result.focusNode : result.value
            if (reportObject?.ptrs?.length) {
                invalidTerms.push(reportObject.ptrs[0]._term.id)
            }
        }
        return values.filter(value => {
            return invalidTerms.indexOf(value.object.id) === -1
        })
    }

    async createAddControls() {
        const wrapper = document.createElement('div')
        wrapper.classList.add('add-button-wrapper')

        const linker = await createLinker(this)
        if (linker) {
            wrapper.appendChild(linker)
        }

        const addButton = this.template.config.theme.createButton(this.template.label, false)
        addButton.title = 'Add ' + this.template.label
        addButton.classList.add('add-button')
        addButton.setAttribute('text', '')
        addButton.addEventListener('click', async () => {
            const instance = await this.addPropertyInstance()
            instance.classList.add('fadeIn')
            await this.updateControls()
            setTimeout(() => {
                focusFirstInputElement(instance)
                instance.classList.remove('fadeIn')
            }, 200)
        })
        wrapper.appendChild(addButton)
        return wrapper
    }
}

export async function createPropertyInstance(template: ShaclPropertyTemplate, value?: Term, forceRemovable = false, linked = false): Promise<HTMLElement> {
    let instance: HTMLElement
    if (template.nodeShapes.size) {
        instance = document.createElement('div')
        instance.classList.add('property-instance')
        for (const shape of template.nodeShapes) {
            const node = new ShaclNode(shape, value as NamedNode | BlankNode | undefined, template.nodeKind, template.label, linked)
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
        }
        if (linked) {
            instance.classList.add('linked')
        }
    }
    if (template.config.editMode && (!linked || forceRemovable)) {
        appendRemoveButton(instance, template.label, template.config.theme.dense, template.config.hierarchyColorsStyleSheet !== undefined, forceRemovable)
    } else if (!template.config.editMode && template.config.hierarchyColorsStyleSheet !== undefined) {
        // in colorized view mode, add remove button wrapper only
        instance.appendChild(createRemoveButtonWrapper(true))
    }

    if (value && !template.config.editMode) {
        // in view mode, still enable RDF serialization of the form
        if (value instanceof Literal) {
            instance.dataset.value = value.value
            if (value.language.length > 0) {
                instance.dataset.lang = value.language
            } else {
                (instance as Editor).shaclDatatype = value.datatype
            }
        } else {
            // assuming NamedNodes here
            instance.dataset.value = '<' + value.value + '>'
        }
    }

    instance.dataset.path = template.path
    return instance
}

function appendRemoveButton(instance: HTMLElement, label: string, dense: boolean, colorize: boolean, forceRemovable = false) {
    const wrapper = createRemoveButtonWrapper(colorize)
    const removeButton = new RokitButton()
    removeButton.classList.add('remove-button', 'clear')
    removeButton.title = 'Remove ' + label
    removeButton.dense = dense
    removeButton.icon = true
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

function createRemoveButtonWrapper(colorize: boolean) {
    const wrapper = document.createElement('div')
    wrapper.className = 'remove-button-wrapper'
    if (colorize) {
        wrapper.classList.add('colorize')
    }
    return wrapper
}

window.customElements.define('shacl-property', ShaclProperty)
