import { BlankNode, NamedNode, Quad, Store, Quad_Object } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from './node'
import { inputFactory, InputBase, InputList, InputListEntry } from './inputs'
import { findLabel, findObjectValueByPredicate, findObjectByPredicate, focusFirstInputElement } from './util'
import { ShaclForm } from './form'
import { PREFIX_RDF, PREFIX_SHACL, PREFIX_SKOS, SHAPES_GRAPH } from './constants'

export class ShaclProperty extends HTMLElement {
    name: string
    path: string
    node: NamedNode | undefined
    classInstances: Array<InputListEntry> | undefined
    minCount = 0
    maxCount = 0
    description = ''
    defaultValue = ''
    pattern = ''
    nodeKind: NamedNode | undefined
    shaclIn: string | undefined
    languageIn: Term[] | undefined
    datatype: NamedNode | undefined
    quads: Quad[]
    form: ShaclForm
    addButton: HTMLElement

    constructor(form: ShaclForm, shaclSubject: BlankNode | NamedNode, valueSubject?: NamedNode | BlankNode) {
        super()

        this.form = form
        this.quads = form.config.shapesGraph.getQuads(shaclSubject, null, null, SHAPES_GRAPH)
        const node = findObjectValueByPredicate(this.quads, 'node')
        if (node) {
            this.node = new NamedNode(node)
        } else {
            const clazz = findObjectValueByPredicate(this.quads, 'class')
            if (clazz) {
                // try to find node shape that has requested target class.
                const nodeShapes = form.config.shapesGraph.getQuads(null, `${PREFIX_SHACL}targetClass`, clazz, SHAPES_GRAPH)
                if (nodeShapes.length > 0) {
                    this.node = new NamedNode(nodeShapes[0].subject.value)
                }
                else {
                    // try to resolve class instances from loaded ontologies
                    this.classInstances = []
                    const ontologyInstances = form.config.shapesGraph.getQuads(null, `${PREFIX_RDF}type`, clazz, null)
                    for (const ontologyInstance of ontologyInstances) {
                        const ontologyInstanceQuads = form.config.shapesGraph.getQuads(ontologyInstance.subject, null, null, null)
                        this.classInstances.push({
                            value: ontologyInstance.subject.value,
                            label: findLabel(ontologyInstanceQuads, form.config.language)
                        })
                    }
                }
            }
        }
        this.path = findObjectValueByPredicate(this.quads, 'path')
        this.dataset.path = this.path
        this.name = findObjectValueByPredicate(this.quads, 'name', PREFIX_SHACL, form.config.language)
        if (!this.name) {
            this.name = this.path
        }
        this.defaultValue = findObjectValueByPredicate(this.quads, 'defaultValue')
        this.description = findObjectValueByPredicate(this.quads, 'description', PREFIX_SHACL, this.form.config.language)
        this.pattern = findObjectValueByPredicate(this.quads, 'pattern')
        this.nodeKind = findObjectByPredicate(this.quads, 'nodeKind') as NamedNode

        this.shaclIn = findObjectValueByPredicate(this.quads, 'in')
        const languageListSubject = findObjectValueByPredicate(this.quads, 'languageIn')
        if (languageListSubject) {
            this.languageIn = this.form.config.lists[languageListSubject]
        }
        this.style.order = findObjectValueByPredicate(this.quads, 'order')

        const minCount = findObjectValueByPredicate(this.quads, 'minCount')
        if (minCount) {
            this.minCount = parseInt(minCount)
        }

        const maxCount = findObjectValueByPredicate(this.quads, 'maxCount')
        if (maxCount) {
            this.maxCount = parseInt(maxCount)
        }

        const datatype = findObjectByPredicate(this.quads, 'datatype') as NamedNode
        if (datatype) {
            this.datatype = datatype
        }

        this.addButton = document.createElement('a')
        this.addButton.innerText = this.name
        this.addButton.title = 'Add ' + this.name
        // this.addButton.type = 'button'
        this.addButton.classList.add('control-button', 'add-button')
        this.addButton.addEventListener('click', _ => {
            const instance = this.createPropertyInstance()
            this.updateControls()
            focusFirstInputElement(instance)
        });
        this.appendChild(this.addButton)

        const hasValue = findObjectByPredicate(this.quads, 'hasValue')
        const values = valueSubject ? form.config.dataGraph.getQuads(valueSubject, this.path, null, null) : []
        let valuesContainHasValue = false
        for (const value of values) {
            this.createPropertyInstance(value.object)
            if (hasValue && value.object.equals(hasValue)) {
                valuesContainHasValue = true
            }
        }
        if (hasValue && !valuesContainHasValue) {
            this.createPropertyInstance(hasValue)
        }

        this.updateControls()
    }

    createPropertyInstance(value?: Term): HTMLElement {
        const instance = document.createElement('div')
        instance.classList.add('prop-instance')
        // check if property value type is a node shape
        if (this.node) {
            const newNode = new ShaclNode(this.form, this.node, this, value as NamedNode | BlankNode)
            instance.appendChild(newNode)
        } else {
            let editor: InputBase
            const plugin = this.form.plugins[this.path]
            if (plugin) {
                editor = plugin.createInstance(this, value?.value)
            }
            else {
                // if we have class instances, use these as list values
                if (this.classInstances?.length) {
                    editor = new InputList(this);
                    (editor as InputList).setListEntries(this.classInstances)
                }
                else {
                    editor = inputFactory(this)
                }
                if (value) {
                    editor.setValue(value)
                }
        }
            instance.appendChild(editor)
        }

        const removeButton = document.createElement('button')
        removeButton.innerText = '\u00d7'
        removeButton.type = 'button'
        removeButton.classList.add('control-button', 'btn', 'remove-button')
        removeButton.title = 'Remove ' + this.name
        removeButton.addEventListener('click', _ => {
            instance.remove()
            this.updateControls()
            this.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
        })
        instance.appendChild(removeButton)

        this.insertBefore(instance, this.addButton)
        return instance
    }

    updateControls() {
        let instances = this.querySelectorAll(":scope > .prop-instance")
        if (instances.length === 0 && (!this.node || this.minCount > 0)) {
            this.createPropertyInstance()
            instances = this.querySelectorAll(":scope > .prop-instance")
        }
        const mayRemove = (instances.length > 1 || this.node) && instances.length > this.minCount
        for (const removeButton of this.querySelectorAll(":scope > .prop-instance > .remove-button")) {
            if (mayRemove) {
                (removeButton as HTMLElement).style.visibility = 'visible'
                // (removeButton as HTMLElement).style.display = 'inline'
            } else {
                (removeButton as HTMLElement).style.visibility = 'hidden'
                // (removeButton as HTMLElement).style.display = 'none'
            }
        }

        const mayAdd = instances.length < this.maxCount || this.maxCount === 0
        if (mayAdd) {
            this.addButton.style.display = 'inline'
        } else {
            this.addButton.style.display = 'none'
        }
    }

    toRDF(graph: Store, subject: NamedNode | BlankNode) {
        const pathNode = new NamedNode(this.dataset.path as string)
        for (const instance of this.querySelectorAll(':scope > .prop-instance > *:first-child')) {
            if (instance instanceof ShaclNode) {
                const quadCount = graph.size
                const shapeSubject = instance.toRDF(graph)
                // check if shape generated at least one quad. if not, omit path for this property.
                if (graph.size > quadCount) {
                    graph.addQuad(subject, pathNode, shapeSubject)
                }
            } else if (instance instanceof InputBase) {
                const literal = instance.toRDFObject()
                if (literal) {
                    graph.addQuad(subject, pathNode, literal)
                }
            }
        }
    }
}

window.customElements.define('shacl-property', ShaclProperty)
