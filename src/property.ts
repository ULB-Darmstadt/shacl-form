import { BlankNode, DataFactory, NamedNode, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from './node'
import { focusFirstInputElement } from './util'
import { createShaclOrConstraint, resolveShaclOrConstraint } from './constraints'
import { Config } from './config'
import { ShaclPropertyTemplate } from './property-template'
import { Editor, fieldFactory } from './theme'
import { toRDF } from './serialize'
import { findPlugin } from './plugin'

export class ShaclProperty extends HTMLElement {
    template: ShaclPropertyTemplate
    addButton: HTMLElement | undefined

    constructor(shaclSubject: BlankNode | NamedNode, parent: ShaclNode, config: Config, valueSubject?: NamedNode | BlankNode) {
        super()
        this.template = new ShaclPropertyTemplate(config.shapesGraph.getQuads(shaclSubject, null, null, null), parent, config)

        if (this.template.order !== undefined) {
            this.style.order = `${this.template.order}`
        }
        if (this.template.cssClass) {
            this.classList.add(this.template.cssClass)
        }

        if (config.editMode) {
            this.addButton = document.createElement('a')
            this.addButton.innerText = this.template.label
            this.addButton.title = 'Add ' + this.template.label
            this.addButton.classList.add('control-button', 'add-button')
            this.addButton.addEventListener('click', _ => {
                const instance = this.addPropertyInstance()
                instance.classList.add('fadeIn')
                this.updateControls()
                focusFirstInputElement(instance)
                setTimeout(() => {
                    instance.classList.remove('fadeIn')
                }, 200)
            })
            this.appendChild(this.addButton)
        }

        // bind existing values
        if (this.template.path) {
            const values = valueSubject ? config.dataGraph.getQuads(valueSubject, this.template.path, null, null) : []
            let valuesContainHasValue = false
            for (const value of values) {
                this.addPropertyInstance(value.object)
                if (this.template.hasValue && value.object.equals(this.template.hasValue)) {
                    valuesContainHasValue = true
                }
            }
            if (config.editMode && this.template.hasValue && !valuesContainHasValue) {
                // sh:hasValue is defined in shapes graph, but does not exist in data graph, so force it
                this.addPropertyInstance(this.template.hasValue)
            }
        }

        if (config.editMode) {
            this.addEventListener('change', () => { this.updateControls() })
            this.updateControls()
        }

        if (this.template.extendedShapes?.length && this.template.config.attributes.collapse !== null && (!this.template.maxCount || this.template.maxCount > 1)) {
            // in view mode, show collapsible only when we have something to show
            if (config.editMode || this.childElementCount > 0) {
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
        if (this.template.shaclOr?.length) {
            if (value) {
                instance = createPropertyInstance(resolveShaclOrConstraint(this.template, value), value, true)
            } else {
                instance = createShaclOrConstraint(this.template.shaclOr, this, this.template.config)
                appendRemoveButton(instance, '')
            }
        } else {
            instance = createPropertyInstance(this.template, value)
        }
        if (this.template.config.editMode) {
            this.insertBefore(instance, this.addButton!)
        } else {
            this.appendChild(instance)
        }
        return instance
    }

    updateControls() {
        let instanceCount = this.querySelectorAll(":scope > .property-instance, :scope > .shacl-or-constraint, :scope > shacl-node").length
        if (instanceCount === 0 && (!this.template.extendedShapes?.length || (this.template.minCount !== undefined && this.template.minCount > 0))) {
            this.addPropertyInstance()
            instanceCount = this.querySelectorAll(":scope > .property-instance, :scope > .shacl-or-constraint, :scope > shacl-node").length
        }
        let mayRemove: boolean
        if (this.template.minCount !== undefined) {
            mayRemove = instanceCount > this.template.minCount
        } else {
            mayRemove = (this.template.extendedShapes && this.template.extendedShapes.length > 0) || instanceCount > 1
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
                graph.addQuad(subject, pathNode, shapeSubject, this.template.config.valuesGraph)
            } else {
                const editor = instance.querySelector('.editor') as Editor
                const value = toRDF(editor)
                if (value) {
                    graph.addQuad(subject, pathNode, value, this.template.config.valuesGraph)
                }
            }
        }
    }
}

export function createPropertyInstance(template: ShaclPropertyTemplate, value?: Term, forceRemovable = false): HTMLElement {
    let instance: HTMLElement
    if (template.extendedShapes?.length) {
        instance = document.createElement('div')
        instance.classList.add('property-instance')
        for (const node of template.extendedShapes) {
            instance.appendChild(new ShaclNode(node, template.config, value as NamedNode | BlankNode | undefined, template.parent, template.nodeKind, template.label))
        }
    } else {
        const plugin = findPlugin(template.path, template.datatype?.value)
        if (plugin) {
            if (template.config.editMode) {
                instance = plugin.createEditor(template, value)
            } else {
                instance = plugin.createViewer(template, value!)
            }
        } else {
            instance = fieldFactory(template, value || null)
        }
        instance.classList.add('property-instance')
    }
    if (template.config.editMode) {
        appendRemoveButton(instance, template.label, forceRemovable)
    }
    instance.dataset.path = template.path
    return instance
}

function appendRemoveButton(instance: HTMLElement, label: string, forceRemovable = false) {
    const removeButton = document.createElement('a')
    removeButton.innerText = '\u00d7'
    removeButton.classList.add('control-button', 'btn', 'remove-button')
    removeButton.title = 'Remove ' + label
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
