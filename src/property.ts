import { BlankNode, DataFactory, NamedNode, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from './node'
import { inputFactory, InputBase, InputList } from './inputs'
import { createInputListEntries, focusFirstInputElement } from './util'
import { RDF_PREDICATE_TYPE, SHAPES_GRAPH } from './constants'
import { ShaclOrConstraint } from './constraints'
import { Config } from './config'
import { ShaclPropertySpec } from './property-spec'

export class ShaclProperty extends HTMLElement {
    spec: ShaclPropertySpec
    addButton: HTMLElement

    constructor(shaclSubject: BlankNode | NamedNode, config: Config, valueSubject?: NamedNode | BlankNode) {
        super()

        this.spec = new ShaclPropertySpec(config.shapesGraph.getQuads(shaclSubject, null, null, SHAPES_GRAPH), config)

        if (this.spec.order) {
            this.style.order = this.spec.order
        }

        this.addButton = document.createElement('a')
        this.appendChild(this.addButton)
        this.addButton.innerText = this.spec.label
        this.addButton.title = 'Add ' + this.spec.label
        this.addButton.classList.add('control-button', 'add-button')
        this.addButton.addEventListener('click', _ => {
            const instance = this.createPropertyInstance()
            this.updateControls()
            focusFirstInputElement(instance)
        });

        // bind existing values
        if (this.spec.path) {
            const values = valueSubject ? config.dataGraph.getQuads(valueSubject, this.spec.path, null, null) : []
            let valuesContainHasValue = false
            for (const value of values) {
                this.createPropertyInstance(value.object)
                if (this.spec.hasValue && value.object.equals(this.spec.hasValue)) {
                    valuesContainHasValue = true
                }
            }
            if (this.spec.hasValue && !valuesContainHasValue) {
                this.createPropertyInstance(this.spec.hasValue)
            }
        }
        this.addEventListener('change', () => { this.updateControls() })
        this.updateControls()
    }

    createPropertyInstance(value?: Term): HTMLElement {
        const instance = this.spec.shaclOr?.length ? new ShaclOrConstraint(this.spec.shaclOr, this, this.spec.config) : new ShaclPropertyInstance(this.spec, value)
        this.insertBefore(instance, this.addButton)
        return instance
    }

    updateControls() {
        let instances = this.querySelectorAll(":scope > shacl-property-instance, :scope > shacl-or-constraint")
        if (instances.length === 0 && (!this.spec.node || (this.spec.minCount !== undefined && this.spec.minCount > 0))) {
            this.createPropertyInstance()
            instances = this.querySelectorAll(":scope > shacl-property-instance")
        }
        const mayRemove = instances.length > (this.spec.minCount ? this.spec.minCount : 1)
        for (const removeButton of this.querySelectorAll(":scope > shacl-property-instance > .remove-button")) {
            (removeButton as HTMLElement).style.visibility = (mayRemove || removeButton.classList.contains('persistent')) ? 'visible' : 'hidden'
        }

        const mayAdd = this.spec.maxCount === undefined || instances.length < this.spec.maxCount
        this.addButton.style.display = mayAdd ? 'inline' : 'none'
    }

    toRDF(graph: Store, subject: NamedNode | BlankNode) {
        // for (const instance of this.querySelectorAll(':scope > shacl-property-instance > *:first-child')) {
        for (const instance of this.querySelectorAll(':scope > shacl-property-instance')) {
            const spec = (instance as ShaclPropertyInstance).spec
            if (spec.class) {
                graph.addQuad(subject, RDF_PREDICATE_TYPE, spec.class)
            }
            if (spec.path) {
                const pathNode = DataFactory.namedNode(spec.path)
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
    spec: ShaclPropertySpec

    constructor(spec: ShaclPropertySpec, value?: Term, forceRemovable = false) {
        super()

        this.spec = spec

        if (spec.node) {
            this.appendChild(new ShaclNode(spec.node, spec.config, this, value as NamedNode | BlankNode | undefined))
        } else {
            let editor: InputBase
            const plugin = spec.path ? spec.config.plugins[spec.path] : undefined
            if (plugin) {
                editor = plugin.createInstance(spec, value?.value)
            } else {
                // if we have class instances, use these as list values
                if (spec.classInstances?.length) {
                    editor = new InputList(spec, createInputListEntries(spec.classInstances, spec.config.shapesGraph, spec.config.language))
                    
                } else {
                    editor =  inputFactory(spec)
                }
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
        removeButton.title = 'Remove ' + spec.label
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
