import { BlankNode, DataFactory, NamedNode, Quad, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from './node'
import { createShaclOrConstraint, resolveShaclOrConstraintOnProperty } from './constraints'
import { findInstancesOf, findLabel, focusFirstInputElement } from './util'
import { Config } from './config'
import { ShaclPropertyTemplate } from './property-template'
import { Editor, fieldFactory, InputListEntry } from './theme'
import { toRDF } from './serialize'
import { findPlugin } from './plugin'
import { DATA_GRAPH, RDF_PREDICATE_TYPE, SHACL_PREDICATE_TARGET_CLASS } from './constants'
import { RokitButton, RokitSelect } from '@ro-kit/ui-widgets'

export class ShaclProperty extends HTMLElement {
    template: ShaclPropertyTemplate
    addButton: RokitSelect | undefined

    constructor(shaclSubject: BlankNode | NamedNode, parent: ShaclNode, config: Config, valueSubject?: NamedNode | BlankNode) {
        super()
        this.template = new ShaclPropertyTemplate(config.store.getQuads(shaclSubject, null, null, null), parent, config)

        if (this.template.order !== undefined) {
            this.style.order = `${this.template.order}`
        }
        if (this.template.cssClass) {
            this.classList.add(this.template.cssClass)
        }

        if (config.editMode && !parent.linked) {
            this.addButton = this.createAddButton()
            this.appendChild(this.addButton)
        }

        // bind existing values
        if (this.template.path) {
            let values: Quad[] = []
            if (valueSubject) {
                if (parent.linked) {
                    // for linked resource, get values in all graphs
                    values = config.store.getQuads(valueSubject, this.template.path, null, null)
                } else {
                    // get values only from data graph
                    values = config.store.getQuads(valueSubject, this.template.path, null, DATA_GRAPH)
                }
            }
            let valuesContainHasValue = false
            for (const value of values) {
                // ignore values that do not conform to this property.
                // this might be the case when there are multiple properties with the same sh:path in a NodeShape.
                if (this.isValueValid(value.object)) {
                    this.addPropertyInstance(value.object)
                    if (this.template.hasValue && value.object.equals(this.template.hasValue)) {
                        valuesContainHasValue = true
                    }
                }
            }
            if (config.editMode && this.template.hasValue && !valuesContainHasValue && !parent.linked) {
                // sh:hasValue is defined in shapes graph, but does not exist in data graph, so force it
                this.addPropertyInstance(this.template.hasValue)
            }
        }

        if (config.editMode && !parent.linked) {
            this.addEventListener('change', () => { this.updateControls() })
            this.updateControls()
        }

        if (this.template.extendedShapes.length && this.template.config.attributes.collapse !== null && (!this.template.maxCount || this.template.maxCount > 1)) {
            // in view mode, show collapsible only when we have something to show
            if ((config.editMode && !parent.linked) || this.childElementCount > 0) {
                const collapsible = this
                collapsible.classList.add('collapsible')
                if (this.template.config.attributes.collapse === 'open') {
                    collapsible.classList.add('open')
                }
                const activator = document.createElement('h1')
                activator.classList.add('activator')
                activator.innerText = this.template.label
                activator.addEventListener('click', () => {
                    collapsible.classList.toggle('open')
                })
                this.prepend(activator)
            }
        }
    }

    addPropertyInstance(value?: Term): HTMLElement {
        let instance: HTMLElement
        if (this.template.shaclOr?.length || this.template.shaclXone?.length) {
            const options = this.template.shaclOr?.length ? this.template.shaclOr : this.template.shaclXone as Term[]
            let resolved = false
            if (value) {
                const resolvedOptions = resolveShaclOrConstraintOnProperty(options, value, this.template.config)
                if (resolvedOptions.length) {
                    instance = createPropertyInstance(this.template.clone().merge(resolvedOptions), value, true)
                    resolved = true
                }
            } 
            if (!resolved) {
                instance = createShaclOrConstraint(options, this, this.template.config)
                appendRemoveButton(instance, '')
            }
        } else {
            // check if value is part of the data graph. if not, create a linked resource
            let linked = false
            if (value) {
                const clazz = this.getRdfClassToLinkOrCreate()
                if (clazz && this.template.config.store.countQuads(value, RDF_PREDICATE_TYPE, clazz, DATA_GRAPH) === 0) {
                    // value is not in data graph, so must be a link in the shapes graph
                    linked = true
                }
            }
            instance = createPropertyInstance(this.template, value, undefined, linked || this.template.parent.linked)
        }
        if (this.addButton) {
            this.insertBefore(instance!, this.addButton)
        } else {
            this.appendChild(instance!)
        }
        return instance!
    }

    updateControls() {
        let instanceCount = this.querySelectorAll(":scope > .property-instance, :scope > .shacl-or-constraint, :scope > shacl-node").length
        if (instanceCount === 0 && (!this.template.extendedShapes.length || (this.template.minCount !== undefined && this.template.minCount > 0))) {
            this.addPropertyInstance()
            instanceCount = this.querySelectorAll(":scope > .property-instance, :scope > .shacl-or-constraint, :scope > shacl-node").length
        }
        let mayRemove: boolean
        if (this.template.minCount !== undefined) {
            mayRemove = instanceCount > this.template.minCount
        } else {
            mayRemove = this.template.extendedShapes.length > 0 || instanceCount > 1
        }

        const mayAdd = this.template.maxCount === undefined || instanceCount < this.template.maxCount
        this.classList.toggle('may-remove', mayRemove)
        this.classList.toggle('may-add', mayAdd)
    }

    toRDF(graph: Store, subject: NamedNode | BlankNode) {
        for (const instance of this.querySelectorAll(':scope > .property-instance')) {
            const pathNode = DataFactory.namedNode((instance as HTMLElement).dataset.path!)
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
        if (this.template.class && this.template.node) {
            return this.template.class
        }
        else {
            for (const node of this.template.extendedShapes) {
                // if this property has no sh:class but sh:node, then use the node shape's sh:targetClass to find protiential instances
                const targetClasses = this.template.config.store.getObjects(node, SHACL_PREDICATE_TARGET_CLASS, null)
                if (targetClasses.length > 0) {
                    return targetClasses[0] as NamedNode
                }
            }
        }
        return undefined
    }

    isValueValid(value: Term) {
        if (!this.template.extendedShapes.length) {
            // property has no node shape, so value is valid
            return true
        }
        // property has node shape(s), so check if value conforms to any targetClass
        for (const node of this.template.extendedShapes) {
            const targetClasses = this.template.config.store.getObjects(node, SHACL_PREDICATE_TARGET_CLASS, null)
            for (const targetClass of targetClasses) {
                if (this.template.config.store.countQuads(value, RDF_PREDICATE_TYPE, targetClass, null) > 0) {
                    return true
                }
            }
        }
        return false
    }

    createAddButton() {
        const addButton = new RokitSelect()
        addButton.dense = true
        addButton.label = "+ " + this.template.label
        addButton.title = 'Add ' + this.template.label
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
            addButton.collapsibleWidth = '200px'
            addButton.collapsibleOrientationLeft = ''
            addButton.addEventListener('change', () => {
                if (addButton.value === 'new') {
                    // user wants to create a new instance
                    this.addPropertyInstance()
                } else {
                    // user wants to link existing instance
                    const value = JSON.parse(addButton.value) as Term
                    this.insertBefore(createPropertyInstance(this.template, value, true, true), addButton)
                }
                addButton.value = ''
            })
        }
        return addButton
    }
}

export function createPropertyInstance(template: ShaclPropertyTemplate, value?: Term, forceRemovable = false, linked = false): HTMLElement {
    let instance: HTMLElement
    if (template.extendedShapes.length) {
        instance = document.createElement('div')
        instance.classList.add('property-instance')
        for (const node of template.extendedShapes) {
            instance.appendChild(new ShaclNode(node, template.config, value as NamedNode | BlankNode | undefined, template.parent, template.nodeKind, template.label, linked))
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
        instance.classList.add('property-instance')
        if (linked) {
            instance.classList.add('linked')
        }
    }
    if (template.config.editMode) {
        appendRemoveButton(instance, template.label, forceRemovable)
    }
    instance.dataset.path = template.path
    return instance
}

function appendRemoveButton(instance: HTMLElement, label: string, forceRemovable = false) {
    const removeButton = new RokitButton()
    removeButton.classList.add('remove-button', 'clear')
    removeButton.title = 'Remove ' + label
    removeButton.dense = true
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
    instance.appendChild(removeButton)
}

window.customElements.define('shacl-property', ShaclProperty)
