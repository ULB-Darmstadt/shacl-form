import { BlankNode, DataFactory, Literal, NamedNode, Quad, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from './node'
import { createShaclOrConstraint, resolveShaclOrConstraintOnProperty } from './constraints'
import { findInstancesOf, focusFirstInputElement } from './util'
import { cloneProperty, mergeQuads, ShaclPropertyTemplate } from './property-template'
import { Editor, fieldFactory, InputListEntry } from './theme'
import { toRDF } from './serialize'
import { findPlugin } from './plugin'
import { DATA_GRAPH, RDF_PREDICATE_TYPE } from './constants'
import { RokitButton, RokitCollapsible, RokitSelect } from '@ro-kit/ui-widgets'

export class ShaclProperty extends HTMLElement {
    template: ShaclPropertyTemplate
    addButton: RokitSelect | undefined
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
            this.addButton = this.createAddButton()
            this.container.appendChild(this.addButton)
            this.addEventListener('change', () => { this.updateControls() })
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
                    this.addPropertyInstance(value.object)
                    if (this.template.hasValue && value.object.equals(this.template.hasValue)) {
                        valuesContainHasValue = true
                    }
                }
            }
            if (this.template.config.editMode) {
                if (this.template.hasValue && !valuesContainHasValue && !this.parent.linked) {
                    // sh:hasValue is defined in shapes graph, but does not exist in data graph, so force it
                    this.addPropertyInstance(this.template.hasValue)
                }
                this.updateControls()
            }
        }
    }

    addPropertyInstance(value?: Term): HTMLElement {
        let instance: HTMLElement
        if (this.template.or?.length || this.template.xone?.length) {
            const options = this.template.or?.length ? this.template.or : this.template.xone as Term[]
            let resolved = false
            if (value) {
                const resolvedOptions = resolveShaclOrConstraintOnProperty(options, value, this.template.config)
                if (resolvedOptions.length) {
                    const merged = mergeQuads(cloneProperty(this.template), resolvedOptions)
                    instance = createPropertyInstance(merged, value, true)
                    resolved = true
                }
            } 
            if (!resolved) {
                instance = createShaclOrConstraint(options, this, this.template.config)
                appendRemoveButton(instance, '', this.template.config.theme.dense, this.template.config.hierarchyColorsStyleSheet !== undefined)
            }
        } else {
            // check if value is part of the data graph. if not, create a linked resource
            let linked = false
            if (value && !(value instanceof Literal)) {
                const clazz = this.getRdfClassToLinkOrCreate()
                if (clazz && this.template.config.store.countQuads(value, RDF_PREDICATE_TYPE, clazz, DATA_GRAPH) === 0) {
                    // value is not in data graph, so must be a link in the shapes graph
                    linked = true
                }
            }
            instance = createPropertyInstance(this.template, value, undefined, linked || this.parent.linked)
        }
        if (this.addButton) {
            this.container.insertBefore(instance!, this.addButton)
        } else {
            this.container.appendChild(instance!)
        }
        return instance!
    }

    updateControls() {
        let instanceCount = this.instanceCount()
        if (instanceCount === 0 && (this.template.nodeShapes.size === 0 || this.template.aggregatedMinCount > 0)) {
            this.addPropertyInstance()
            instanceCount = this.instanceCount()
        }
        let mayRemove: boolean
        if (this.template.aggregatedMinCount > 0) {
            mayRemove = instanceCount > this.template.aggregatedMinCount
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
                for (const editor of instance.querySelectorAll<Editor>(':scope > .editor')) {
                    const value = toRDF(editor)
                    if (value) {
                        graph.addQuad(subject, pathNode, value, this.template.config.valuesGraphId)
                    }
                }
            }
        }
    }

    getRdfClassToLinkOrCreate() {
        if (this.template.class && this.template.nodeShapes.size) {
            return this.template.class
        }
        else {
            for (const node of this.template.nodeShapes) {
                // if this property has no sh:class but sh:node, then use the node shape's sh:targetClass to find protiential instances
                if (node.targetClass) {
                    return node.targetClass
                }
            }
        }
        return undefined
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
        const report = await this.template.config.validator.validate({ dataset: this.template.config.store, terms: dataSubjectsToValidate }, [{ terms: [ nodeShapeToValidate ] }])
        const invalidTerms: string[] =  []
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

    createAddButton() {
        const addButton = new RokitSelect()
        addButton.dense = this.template.config.theme.dense
        addButton.label = "+ " + this.template.label
        addButton.title = 'Add ' + this.template.label
        addButton.autoGrowLabelWidth = true
        addButton.classList.add('add-button')

        // load potential value candidates for linking
        let instances: InputListEntry[] = []
        let clazz = this.getRdfClassToLinkOrCreate()
        if (clazz) {
            instances = findInstancesOf(clazz, this.template)
        }
        if (instances.length === 0) {
            // no class instances found, so create an add button that creates a new instance
            addButton.emptyMessage = ''
            addButton.inputMinWidth = 0
            addButton.addEventListener('click', _ => {
                addButton.blur()
                const instance = this.addPropertyInstance()
                instance.classList.add('fadeIn')
                this.updateControls()
                setTimeout(() => {
                    focusFirstInputElement(instance)
                    instance.classList.remove('fadeIn')
                }, 200)
            })
        } else {
            // some instances found, so create an add button that can create a new instance or link existing ones
            const ul = document.createElement('ul')
            const newItem = document.createElement('li')
            newItem.innerHTML = '&#xFF0B; Create new ' + this.template.label + '...'
            newItem.dataset.value = 'new'
            newItem.classList.add('large')
            ul.appendChild(newItem)
            const divider = document.createElement('li')
            divider.classList.add('divider')
            ul.appendChild(divider)
            const header = document.createElement('li')
            header.classList.add('header')
            header.innerText = 'Or link existing:'
            ul.appendChild(header)
            for (const instance of instances) {
                const li = document.createElement('li')
                const itemValue = (typeof instance.value === 'string') ? instance.value : instance.value.value
                li.innerText = instance.label ? instance.label : itemValue
                li.dataset.value = JSON.stringify(instance.value)
                ul.appendChild(li)
            }
            addButton.appendChild(ul)
            addButton.collapsibleWidth = '250px'
            addButton.collapsibleOrientationLeft = ''
            addButton.addEventListener('change', () => {
                if (addButton.value === 'new') {
                    // user wants to create a new instance
                    this.addPropertyInstance()
                } else {
                    // user wants to link existing instance
                    const value = JSON.parse(addButton.value) as Term
                    this.container.insertBefore(createPropertyInstance(this.template, value, true, true), addButton)
                }
                addButton.value = ''
            })
        }
        return addButton
    }
}

export function createPropertyInstance(template: ShaclPropertyTemplate, value?: Term, forceRemovable = false, linked = false): HTMLElement {
    let instance: HTMLElement
    if (template.nodeShapes.size) {
        instance = document.createElement('div')
        instance.classList.add('property-instance')
        for (const node of template.nodeShapes) {
            instance.appendChild(new ShaclNode(node, value as NamedNode | BlankNode | undefined, template.nodeKind, template.label, linked))
        }
        if (linked) {
            forceRemovable = true
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
    }
    instance.dataset.path = template.path
    return instance
}

function appendRemoveButton(instance: HTMLElement, label: string, dense: boolean, colorize: boolean, forceRemovable = false) {
    const wrapper = document.createElement('div')
    wrapper.className = 'remove-button-wrapper'
    if (colorize) {
        wrapper.classList.add('colorize')
    }
    const removeButton = new RokitButton()
    removeButton.classList.add('remove-button', 'clear')
    removeButton.title = 'Remove ' + label
    removeButton.dense = dense
    removeButton.icon = true
    removeButton.addEventListener('click', _ => {
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

window.customElements.define('shacl-property', ShaclProperty)
