import { BlankNode, DataFactory, NamedNode, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from './node'
import { focusFirstInputElement } from './util'
import { PREFIX_SHACL, RDF_PREDICATE_TYPE, SHAPES_GRAPH } from './constants'
import { createShaclOrConstraint } from './constraints'
import { Config } from './config'
import { ShaclPropertyTemplate } from './property-template'
import { Editor, editorFactory, toRDF } from './editors'

export class ShaclProperty extends HTMLElement {
    template: ShaclPropertyTemplate
    addButton: HTMLElement

    constructor(shaclSubject: BlankNode | NamedNode, config: Config, nodeId: NamedNode | BlankNode, valueSubject?: NamedNode | BlankNode) {
        super()

        this.template = new ShaclPropertyTemplate(config.shapesGraph.getQuads(shaclSubject, null, null, SHAPES_GRAPH), nodeId, config)
        this.dataset.nodeId = this.template.nodeId.id

        if (this.template.order) {
            this.style.order = this.template.order
        }

        this.addButton = document.createElement('a')
        this.appendChild(this.addButton)
        this.addButton.innerText = this.template.label
        this.addButton.title = 'Add ' + this.template.label
        this.addButton.classList.add('control-button', 'add-button')
        this.addButton.addEventListener('click', _ => {
            const instance = this.addPropertyInstance()
            this.updateControls()
            focusFirstInputElement(instance)
        });

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
            if (this.template.hasValue && !valuesContainHasValue) {
                this.addPropertyInstance(this.template.hasValue)
            }
        }
        this.addEventListener('change', () => { this.updateControls() })
        this.updateControls()
    }

    addPropertyInstance(value?: Term): HTMLElement {
        let instance: HTMLElement
        if (this.template.shaclOr?.length) {
            if (value) {
                let template = this.template
                // find rdf:type of given value. if more than one available, choose first one for now
                const types = this.template.config.shapesGraph.getObjects(value, RDF_PREDICATE_TYPE, null)
                if (types.length > 0) {
                    template = template.clone()
                    template.class = types[0] as NamedNode
                }
                instance = createPropertyInstance(template, value, true)
            } else {
                instance = createShaclOrConstraint(this.template.shaclOr, this, this.template.config)
            }

        } else {
            instance = createPropertyInstance(this.template, value)
        }
        this.insertBefore(instance, this.addButton)
        return instance
    }

    updateControls() {
        let instanceCount = this.querySelectorAll(":scope > .property-instance, :scope > .shacl-or-constraint, :scope > shacl-node").length
        if (instanceCount === 0 && (!this.template.node || (this.template.minCount !== undefined && this.template.minCount > 0))) {
            this.addPropertyInstance()
            instanceCount = this.querySelectorAll(":scope > .property-instance, :scope > .shacl-or-constraint, :scope > shacl-node").length
        }
        let mayRemove: boolean
        if (this.template.minCount !== undefined) {
            mayRemove = instanceCount > this.template.minCount
        } else {
            mayRemove = this.template.node !== undefined || instanceCount > 1
        }

        const mayAdd = this.template.maxCount === undefined || instanceCount < this.template.maxCount
        this.classList.toggle('may-remove', mayRemove)
        this.classList.toggle('may-add', mayAdd)
    }

    toRDF(graph: Store, subject: NamedNode | BlankNode) {
        for (const instance of this.querySelectorAll(':scope > .property-instance')) {
            const pathNode = DataFactory.namedNode((instance as HTMLElement).dataset.path!)
            if (instance.firstChild instanceof ShaclNode) {
                const quadCount = graph.size
                const shapeSubject = instance.firstChild.toRDF(graph)
                // check if shape generated at least one quad. if not, omit path for this property.
                if (graph.size > quadCount) {
                    graph.addQuad(subject, pathNode, shapeSubject)
                }
            } else {
                const editor = instance.querySelector('.editor') as Editor
                const value = toRDF(editor)
                if (value) {
                    graph.addQuad(subject, pathNode, value)
                }
            }
        }
    }
}

export function createPropertyInstance(template: ShaclPropertyTemplate, value?: Term, forceRemovable = false): HTMLElement {
    let instance: HTMLElement
    if (template.node) {
        instance = document.createElement('div')
        instance.classList.add('property-instance')
        instance.appendChild(new ShaclNode(template.node, template.config, value as NamedNode | BlankNode | undefined, template.label))
    } else {
        const plugin = template.config.plugins.find(template.path, template.datatype?.value)
        if (plugin) {
            instance = plugin.createInstance(template, value)
        } else {
            instance = editorFactory(template, value)
        }
    }
    const removeButton = document.createElement('button')
    removeButton.innerText = '\u00d7'
    removeButton.type = 'button'
    removeButton.classList.add('control-button', 'btn', 'remove-button')
    removeButton.title = 'Remove ' + template.label
    removeButton.addEventListener('click', _ => {
        const parent = instance.parentElement
        instance.remove()
        parent?.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
    })
    if (forceRemovable) {
        removeButton.classList.add('persistent')
    }
    instance.appendChild(removeButton)
    instance.dataset.path = template.path
    return instance
}

window.customElements.define('shacl-property', ShaclProperty)
