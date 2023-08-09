import { BlankNode, NamedNode, Quad, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from './node'
import { inputFactory, InputBase, InputList, InputListEntry } from './inputs'
import { findLabel, findObjectValueByPredicate, focusFirstInputElement } from './util'
import { PREFIX_DASH, PREFIX_RDF, PREFIX_SHACL, SHAPES_GRAPH } from './constants'
import { ShaclOrConstraint } from './constraints'
import { Config } from './config'
import { ShaclPropertySpec, addQuads, removeQuads } from './property-spec'

export class ShaclProperty extends HTMLElement {
    spec: ShaclPropertySpec
    addButton: HTMLElement
    valueSubject: NamedNode | BlankNode | undefined

    constructor(shaclSubject: BlankNode | NamedNode, config: Config, valueSubject?: NamedNode | BlankNode) {
        super()

        this.spec = new ShaclPropertySpec(config)
        this.valueSubject = valueSubject
        const quads = config.shapesGraph.getQuads(shaclSubject, null, null, SHAPES_GRAPH)
        addQuads(this.spec, quads)

        if (this.spec.order) {
            this.style.order = this.spec.order
        }

        this.spec.name = findObjectValueByPredicate(quads, 'name', PREFIX_SHACL, config.language)
        if (!this.spec.name) {
            this.spec.name = this.spec.path
        }
        const description = findObjectValueByPredicate(quads, 'description', PREFIX_SHACL, config.language)
        if (description.length) {
            this.spec.description = description
        }

        this.addButton = document.createElement('a')
        this.appendChild(this.addButton)
        this.addButton.innerText = this.spec.name || 'unknown'
        this.addButton.title = 'Add ' + this.spec.name
        this.addButton.classList.add('control-button', 'add-button')
        this.addButton.addEventListener('click', _ => {
            const instance = this.createPropertyInstance()
            this.updateControls()
            focusFirstInputElement(instance)
        });

        // bind existing values
        if (this.spec.path) {
            const values = this.valueSubject ? config.dataGraph.getQuads(this.valueSubject, this.spec.path, null, null) : []
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
        this.addEventListener('change', () => { console.log('--- got change event'); this.updateControls() })
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
            const path = (instance as ShaclPropertyInstance).spec.path
            if (path) {
                const pathNode = new NamedNode(path)
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

        if (this.spec.node) {
            this.appendChild(new ShaclNode(this.spec.node, this.spec.config, this, value as NamedNode | BlankNode | undefined))
        } else {
            let editor: InputBase
            const plugin = this.spec.path ? this.spec.config.plugins[this.spec.path] : undefined
            if (plugin) {
                editor = plugin.createInstance(this.spec, value?.value)
            }
            else {
                // if we have class instances, use these as list values
                editor = this.spec.classInstances?.length ? new InputList(this.spec, this.spec.classInstances) : inputFactory(this.spec)
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
        removeButton.title = 'Remove ' + this.spec.name
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
