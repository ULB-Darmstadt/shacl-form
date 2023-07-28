import { BlankNode, NamedNode, Quad, Store, Quad_Object } from 'n3'
import { ShaclNode } from './node'
import { inputFactory, InputBase, InputList, InputListEntry } from './inputs'
import { SHAPES_GRAPH , findObjectValueByPredicate, focusFirstInputElement } from './util'
import { ShaclForm } from './form'
import { PREFIX_RDF, PREFIX_SHACL, PREFIX_SKOS } from './prefixes'

export class ShaclProperty extends HTMLElement {
    name: string
    node: NamedNode | null = null
    classInstances: Array<InputListEntry> | null = null
    minCount = 0
    maxCount = 0
    quads: Quad[]
    form: ShaclForm
    addButton: HTMLElement

    constructor(form: ShaclForm, shaclSubject: BlankNode | NamedNode, valueSubject?: NamedNode | BlankNode) {
        super()

        this.form = form
        this.quads = form.config.graph.getQuads(shaclSubject, null, null, SHAPES_GRAPH)
        const node = findObjectValueByPredicate(this.quads, 'node')
        if (node) {
            this.node = new NamedNode(node)
        } else {
            const clazz = findObjectValueByPredicate(this.quads, 'class')
            if (clazz) {
                // try to find node shape that has requested target class.
                const nodeShapes = form.config.graph.getQuads(null, `${PREFIX_SHACL}targetClass`, clazz, SHAPES_GRAPH)
                if (nodeShapes.length > 0) {
                    this.node = new NamedNode(nodeShapes[0].subject.value)
                }
                else {
                    // try to resolve class instances from loaded ontologies
                    this.classInstances = []
                    const ontologyInstances = form.config.graph.getQuads(null, `${PREFIX_RDF}type`, clazz, null)
                    for (const ontologyInstance of ontologyInstances) {
                        const ontologyInstanceQuads = form.config.graph.getQuads(ontologyInstance.subject, null, null, null)
                        this.classInstances.push({
                            value: ontologyInstance.subject.value,
                            label: findObjectValueByPredicate(ontologyInstanceQuads, 'prefLabel', PREFIX_SKOS, form.config.language)
                        })
                    }
                }
            }
        }
        // else {
        //     const clazz = findObjectValueByPredicate(this.quads, 'class')
        //     config.shapesGraph.forEach((quad) => {
        //         if (config.shapesGraph.has(DataFactory.triple(quad.subject, new NamedNode(`${PREFIX_RDF}type`), new NamedNode(`${PREFIX_SHACL}NodeShape`)))) {
        //             this.node = quad.subject as NamedNode
        //         }
        //     }, null, `${PREFIX_SHACL}targetClass`, clazz, null)

        // }
        this.dataset.path = findObjectValueByPredicate(this.quads, 'path')
        this.name = findObjectValueByPredicate(this.quads, 'name', PREFIX_SHACL, form.config.language)
        if (!this.name) {
            this.name = this.dataset.path
        }
        this.style.order = findObjectValueByPredicate(this.quads, 'order')

        const minCount = findObjectValueByPredicate(this.quads, 'minCount')
        const maxCount = findObjectValueByPredicate(this.quads, 'maxCount')
        if (minCount) {
            this.minCount = parseInt(minCount)
        }
        if (maxCount) {
            this.maxCount = parseInt(maxCount)
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

        const values = valueSubject ? form.config.valuesGraph.getQuads(valueSubject, this.dataset.path, null, null) : []
        for (const value of values) {
            this.createPropertyInstance(value.object)
        }

        this.updateControls()
    }

    createPropertyInstance(value?: Quad_Object): HTMLElement {
        const instance = document.createElement('div')
        instance.classList.add('prop-instance')
        // check if property value type is a node shape
        if (this.node) {
            const newNode = new ShaclNode(this.form, this.node, this, value as NamedNode | BlankNode)
            instance.appendChild(newNode)
        } else {
            let editor: InputBase
            const plugin = this.dataset.path ? this.form.plugins[this.dataset.path] : undefined
            if (plugin) {
                editor = plugin.createInstance(this, value?.value)
            }
            else {
                // if we have classInstances, use these as list values
                if (this.classInstances) {
                    editor = new InputList(this.quads, this.form.config)
                    const listEditor = editor as InputList
                    listEditor.setListEntries(this.classInstances)
                }
                else {
                    editor = inputFactory(this.quads, this.form.config)
                    if (value) {
                        editor.setValue(value.value)
                    }
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
