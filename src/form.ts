import { ShaclNode } from './node'
import { Config } from './config'
import { Plugin, Plugins } from './plugin'
import { Writer, Quad, Store, DataFactory, NamedNode } from 'n3'
import { DEFAULT_PREFIXES, PREFIX_RDF, PREFIX_SHACL } from './prefixes'
import { focusFirstInputElement } from './util'
import SHACLValidator from 'rdf-validate-shacl'
import factory from 'rdf-ext'
import './styles.css'

export class ShaclForm extends HTMLElement {
    static get observedAttributes() { return Config.keysAsDataAttributes }

    config: Config = new Config()
    shape: ShaclNode | null = null
    form: HTMLFormElement
    plugins: Plugins = {}
    initDebounceTimeout: ReturnType<typeof setTimeout> | undefined

    constructor() {
        super()

        this.form = document.createElement('form')
        this.form.appendChild(document.createElement('slot'))
        this.form.addEventListener('change', ev => {
            ev.stopPropagation()
            this.validate().then(valid => {
                this.dispatchEvent(new CustomEvent('change', { bubbles: true, cancelable: false, composed: true, detail: { 'valid': valid } }))
            })
        })
    }

    connectedCallback() {
        this.prepend(this.form)
    }

    attributeChangedCallback() {
        const newConfig = Config.from(this)
        if (!newConfig.equals(this.config)) {
            this.config = newConfig
            this.initialize()
        }
    }

    private initialize() {
        clearTimeout(this.initDebounceTimeout)
        this.initDebounceTimeout = setTimeout(() => {
            this.config.loadGraphs().then(_ => {
                if (this.form.contains(this.shape)) {
                    this.form.removeChild(this.shape as ShaclNode)
                }

                // find root shacl shape
                const rootShapeShaclSubject = this.findRootShaclShapeSubject()
                if (rootShapeShaclSubject) {
                    this.shape = new ShaclNode(this, rootShapeShaclSubject, undefined, this.config.valueSubject ? new NamedNode(this.config.valueSubject) : undefined)
                    this.form.prepend(this.shape)
                    focusFirstInputElement(this.shape)
                }
            }).catch(e => {
                console.log(e)
                if (this.form.contains(this.shape)) {
                    this.form.removeChild(this.shape as ShaclNode)
                }
            })
        }, 50)
    }

    public toRDF(): Quad[] {
        const graph = new Store()
        this.shape?.toRDF(graph)
        return graph.getQuads(null, null, null, null)
    }

    public toRDFTurtle(): string {
        const writer = new Writer({ prefixes: DEFAULT_PREFIXES })
        writer.addQuads(this.toRDF())
        let serialized = ''
        writer.end((error, result) => {
            if (error) {
                console.error(error)
            }
            serialized = result
        })
        return serialized
    }

    public registerPlugin(plugin: Plugin) {
        this.plugins[plugin.predicate] = plugin
        this.initialize()
    }

    public reportValidity(): boolean {
        return this.form.reportValidity()
    }

    public async validate(showHints = false): Promise<boolean> {
        for (const elem of this.querySelectorAll(':scope .validation')) {
            elem.remove()
        }

        const shapes = factory.dataset(this.config.shapesGraph)
        const validator = new SHACLValidator(shapes, { factory })
        const report = await validator.validate(factory.dataset(this.toRDF()))

        if (showHints) {
            for (const result of report.results) {
                // See https://www.w3.org/TR/shacl/#results-validation-result for details about each property
                const invalidElement = this.querySelector(`:scope [data-node-id='${result.focusNode.id}'] [data-path='${result.path.id}']`)
                const messageElement = document.createElement('pre')
                messageElement.classList.add('validation')
                if (result.message.length > 0) {
                    for (const message of result.message) {
                        messageElement.innerText += message + '\n'
                    }
                } else {
                    messageElement.innerText += result.sourceConstraintComponent.value
                }
                invalidElement?.appendChild(messageElement)
            }
        }
        return report.conforms
    }


    private findRootShaclShapeSubject(): NamedNode | undefined {
        let rootShapeShaclSubject: NamedNode | null = null
        // if data-shape-subject is set, use that
        if (this.config.shapeSubject) {
            rootShapeShaclSubject = new NamedNode(this.config.shapeSubject)
            if (!this.config.shapesGraph.has(DataFactory.triple(rootShapeShaclSubject, new NamedNode(`${PREFIX_RDF}type`), new NamedNode(`${PREFIX_SHACL}NodeShape`)))) {
                console.warn(`shapes graph does not contain requested root shape ${this.config.shapeSubject}`)
                return
            }
        }
        else {
            // if data-value-subject is set, use shape of that
            if (this.config.valueSubject) {
                const rootValueSubject = new NamedNode(this.config.valueSubject)
                const rootValueSubjectTypes = this.config.valuesGraph.getQuads(rootValueSubject, new NamedNode(`${PREFIX_RDF}type`), null, null)
                if (rootValueSubjectTypes.length === 0) {
                    console.warn(`value subject '${this.config.valueSubject}' has no ${PREFIX_RDF}type statement`)
                    return
                }
                // if type refers to a node shape, prioritize that over targetClass resolution
                for (const rootValueSubjectType of rootValueSubjectTypes) {
                    if (this.config.shapesGraph.has(DataFactory.triple(rootValueSubjectType.object as NamedNode, new NamedNode(`${PREFIX_RDF}type`), new NamedNode(`${PREFIX_SHACL}NodeShape`)))) {
                        rootShapeShaclSubject = rootValueSubjectType.object as NamedNode
                        break
                    }
                }
                if (!rootShapeShaclSubject) {
                    const rootShapes = this.config.shapesGraph.getQuads(null, `${PREFIX_SHACL}targetClass`, rootValueSubjectTypes[0].object, null)
                    if (rootShapes.length === 0) {
                        console.warn(`value subject '${this.config.valueSubject}' has no shacl shape definition in the shapes graph`)
                        return
                    }
                    if (rootShapes.length > 1) {
                        console.warn(`value subject '${this.config.valueSubject}' has multiple shacl shape definitions in the shapes graph, choosing the first found (${rootShapes[0].subject})`)
                    }
                    if (this.config.shapesGraph.getQuads(rootShapes[0].subject, `${PREFIX_RDF}type`, `${PREFIX_SHACL}NodeShape`, null).length === 0) {
                        console.error(`value subject '${this.config.valueSubject}' references a shape which is not a NodeShape (${rootShapes[0].subject})`)
                        return
                    }
                    rootShapeShaclSubject = rootShapes[0].subject as NamedNode
                }
            }
            else {
                // choose first of all defined root shapes
                const rootShapes = this.config.shapesGraph.getQuads(null, `${PREFIX_RDF}type`, `${PREFIX_SHACL}NodeShape`, null)
                if (rootShapes.length == 0) {
                    console.warn('shapes graph does not contain any root shapes')
                    return
                }
                if (rootShapes.length > 1) {
                    console.warn('shapes graph contains', rootShapes.length, 'root shapes. choosing first found which is', rootShapes[0].subject.value)
                    console.info('hint: set the shape to use with attribute "data-shape-subject"')
                }
                rootShapeShaclSubject = rootShapes[0].subject as NamedNode
            }
        }
        return rootShapeShaclSubject
    }
}

window.customElements.define('shacl-form', ShaclForm)
