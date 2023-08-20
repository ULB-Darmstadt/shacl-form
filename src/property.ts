import { BlankNode, DataFactory, NamedNode, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from './node'
import { inputFactory, InputBase } from './inputs'
import { focusFirstInputElement } from './util'
import { SHAPES_GRAPH } from './constants'
import { ShaclOrConstraint } from './constraints'
import { Config } from './config'
import { ShaclPropertyTemplate } from './property-template'

export class ShaclProperty extends HTMLElement {
    template: ShaclPropertyTemplate
    addButton: HTMLElement

    constructor(shaclSubject: BlankNode | NamedNode, config: Config, valueSubject?: NamedNode | BlankNode) {
        super()

        this.template = new ShaclPropertyTemplate(config.shapesGraph.getQuads(shaclSubject, null, null, SHAPES_GRAPH), config)

        if (this.template.order) {
            this.style.order = this.template.order
        }

        this.addButton = document.createElement('a')
        this.appendChild(this.addButton)
        this.addButton.innerText = this.template.label
        this.addButton.title = 'Add ' + this.template.label
        this.addButton.classList.add('control-button', 'add-button')
        this.addButton.addEventListener('click', _ => {
            const instance = this.createPropertyInstance()
            this.updateControls()
            focusFirstInputElement(instance)
        });

        // bind existing values
        if (this.template.path) {
            const values = valueSubject ? config.dataGraph.getQuads(valueSubject, this.template.path, null, null) : []
            let valuesContainHasValue = false
            for (const value of values) {
                this.createPropertyInstance(value.object)
                if (this.template.hasValue && value.object.equals(this.template.hasValue)) {
                    valuesContainHasValue = true
                }
            }
            if (this.template.hasValue && !valuesContainHasValue) {
                this.createPropertyInstance(this.template.hasValue)
            }
        }
        this.addEventListener('change', () => { this.updateControls() })
        this.updateControls()
    }

    createPropertyInstance(value?: Term): HTMLElement {
        const instance = this.template.shaclOr?.length ? new ShaclOrConstraint(this.template.shaclOr, this, this.template.config) : new ShaclPropertyInstance(this.template, value)
        this.insertBefore(instance, this.addButton)
        return instance
    }

    updateControls() {
        let instances = this.querySelectorAll(":scope > shacl-property-instance, :scope > shacl-or-constraint")
        if (instances.length === 0 && (!this.template.node || (this.template.minCount !== undefined && this.template.minCount > 0))) {
            this.createPropertyInstance()
            instances = this.querySelectorAll(":scope > shacl-property-instance, :scope > shacl-or-constraint")
        }
        const mayRemove = instances.length > (this.template.minCount ? this.template.minCount : 1)
        for (const removeButton of this.querySelectorAll(":scope > shacl-property-instance > .remove-button")) {
            (removeButton as HTMLElement).style.visibility = (mayRemove || removeButton.classList.contains('persistent')) ? 'visible' : 'hidden'
        }

        const mayAdd = this.template.maxCount === undefined || instances.length < this.template.maxCount
        this.addButton.style.display = mayAdd ? 'inline' : 'none'
    }

    toRDF(graph: Store, subject: NamedNode | BlankNode) {
        // for (const instance of this.querySelectorAll(':scope > shacl-property-instance > *:first-child')) {
        for (const instance of this.querySelectorAll(':scope > shacl-property-instance')) {
            const template = (instance as ShaclPropertyInstance).template
            if (template.path) {
                const pathNode = DataFactory.namedNode(template.path)
                const child = instance.querySelector(':scope > *:first-child')
                if (child instanceof ShaclNode) {
                    const quadCount = graph.size
                    const shapeSubject = child.toRDF(graph)
                    // check if shape generated at least one quad. if not, omit path for this property.
                    if (graph.size > quadCount) {
                        graph.addQuad(subject, pathNode, shapeSubject)
                    }
                } else if (child instanceof InputBase) {
                    const term = child.toRDFObject()
                    if (term) {
                        graph.addQuad(subject, pathNode, term)
                    }
                }
            }
        }
    }

}

export class ShaclPropertyInstance extends HTMLElement {
    template: ShaclPropertyTemplate

    constructor(template: ShaclPropertyTemplate, value?: Term, forceRemovable = false) {
        super()

        this.template = template

        if (template.node) {
            this.appendChild(new ShaclNode(template.node, template.config, this, value as NamedNode | BlankNode | undefined))
        } else {
            let editor: InputBase
            const plugin = template.path ? template.config.plugins[template.path] : undefined
            if (plugin) {
                editor = plugin.createInstance(template, value?.value)
            } else {
                editor =  inputFactory(template)
                if (value) {
                    editor.setValue(value)
                }
            }
            this.appendChild(editor)
        }

        const removeButton = document.createElement('button')
        removeButton.innerText = '\u00d7'
        removeButton.type = 'button'
        removeButton.classList.add('control-button', 'btn', 'remove-button')
        if (forceRemovable) {
            removeButton.classList.add('persistent')
        }
        removeButton.title = 'Remove ' + template.label
        removeButton.addEventListener('click', _ => {
            const parent = this.parentElement
            this.remove()
            parent?.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
        })
        this.appendChild(removeButton)
    }
}

window.customElements.define('shacl-property', ShaclProperty)
window.customElements.define('shacl-property-instance', ShaclPropertyInstance)
