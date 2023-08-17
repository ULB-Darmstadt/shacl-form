import { ShaclNode } from './node'
import { Config } from './config'
import { Plugin } from './plugin'
import { Quad, Store, NamedNode, DataFactory } from 'n3'
import { PREFIX_SHACL, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, SHAPES_GRAPH } from './constants'
import { focusFirstInputElement } from './util'
import SHACLValidator from 'rdf-validate-shacl'
import './styles.css'
import { Loader } from './loader'
import { Editor } from './inputs'
import { serialize } from './serialize'

export class ShaclForm extends HTMLElement {
    static get observedAttributes() { return Config.keysAsDataAttributes }

    config: Config = new Config()
    loader: Loader = new Loader(this)
    shape: ShaclNode | null = null
    form: HTMLFormElement
    initDebounceTimeout: ReturnType<typeof setTimeout> | undefined

    constructor() {
        super()

        this.form = document.createElement('form')
        this.form.addEventListener('change', ev => {
            ev.stopPropagation()
            this.validate(true).then(valid => {
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
            newConfig.plugins = this.config.plugins
            this.config = newConfig
            this.initialize()
        }
    }

    private initialize() {
        clearTimeout(this.initDebounceTimeout)
        this.initDebounceTimeout = setTimeout(() => {
            // remove all child elements from form
            this.form.replaceChildren()
            this.loader.loadGraphs().then(_ => {
                // find root shacl shape
                const rootShapeShaclSubject = this.findRootShaclShapeSubject()
                if (rootShapeShaclSubject) {
                    this.shape = new ShaclNode(rootShapeShaclSubject, this.config, undefined, this.config.valueSubject ? DataFactory.namedNode(this.config.valueSubject) : undefined)
                    // add submit button
                    if (this.config.submitButton !== null) {
                        const button = document.createElement('button')
                        button.type = 'button'
                        button.innerText = this.config.submitButton || 'Submit'
                        button.addEventListener('click', () => {
                            this.validate().then(valid => {
                                if (valid && this.form.checkValidity()) {
                                    this.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true, composed: true }))
                                } else {
                                    // focus first invalid element
                                    const firstInvalidElement = this.querySelector(':scope .invalid > .editor') as HTMLElement | null
                                    if (firstInvalidElement) {
                                        firstInvalidElement.focus()
                                    } else {
                                        this.form.reportValidity()
                                    }
                                }
                            })
                        })
                        this.form.prepend(button)
                    }
                    this.form.prepend(this.shape)
                    focusFirstInputElement(this.shape)
                    this.validate(true)
                }
            }).catch(e => {
                console.error(e)
                // remove all child elements from form
                const errorDisplay = document.createElement('div')
                errorDisplay.innerText = e
                this.form.appendChild(errorDisplay)
            })
        }, 50)
    }

    public serialize(format = 'text/turtle'): string | {}[] {
        const graph = new Store()
        this.shape?.toRDF(graph)
        const quads = graph.getQuads(null, null, null, null)
        return serialize(quads, format, this.config.prefixes)
    }

    public registerPlugin(plugin: Plugin) {
        this.config.plugins[plugin.predicate] = plugin
        this.initialize()
    }

    public async validate(ignoreEmptyValues = false): Promise<boolean> {
        for (const elem of this.querySelectorAll(':scope .validation-error')) {
            elem.remove()
        }
        for (const elem of this.querySelectorAll(':scope .prop')) {
            elem.classList.remove('invalid')
            if (((elem.querySelector('.editor')) as Editor).value) {
                elem.classList.add('valid')
            } else {
                elem.classList.remove('valid')
            }
        }

        this.config.shapesGraph.deleteGraph('')
        this.shape?.toRDF(this.config.shapesGraph)
        const report = await new SHACLValidator(this.config.shapesGraph).validate(this.config.shapesGraph)

        // for (const result of report.results) {
        //     // See https://www.w3.org/TR/shacl/#results-validation-result for details
        //     // about each property
        //     console.log(result.message)
        //     console.log(result.path)
        //     console.log(result.focusNode)
        //     console.log(result.severity)
        //     console.log(result.sourceConstraintComponent)
        //     console.log(result.sourceShape)
        // }

        for (const result of report.results) {
            // result.path can be null, e.g. if a focus node does not contain a required property node
            if (result.path) {
                for (const invalidElement of this.querySelectorAll(`:scope shacl-node[data-node-id='${result.focusNode.id}'] .editor[data-path='${result.path.id}']`)) {
                    if (!ignoreEmptyValues || (invalidElement as Editor).value) {
                        const parent = invalidElement.parentElement!
                        parent.classList.add('invalid')
                        parent.classList.remove('valid')
                        parent.appendChild(this.createValidationErrorDisplay(result))
                    }
                }
            } else {
                this.querySelector(`:scope shacl-node[data-node-id='${result.focusNode.id}']`)?.prepend(this.createValidationErrorDisplay(result))
            }
        }
        return report.conforms
    }

    private createValidationErrorDisplay(validatonResult: any): HTMLElement {
        const messageElement = document.createElement('span')
        messageElement.classList.add('validation-error')
        if (validatonResult.message.length > 0) {
            for (const message of validatonResult.message) {
                messageElement.title += message.value + '\n'
            }
        } else {
            messageElement.title += validatonResult.sourceConstraintComponent.value
        }
        return messageElement
    }


    private findRootShaclShapeSubject(): NamedNode | undefined {
        let rootShapeShaclSubject: NamedNode | null = null
        // if data-shape-subject is set, use that
        if (this.config.shapeSubject) {
            rootShapeShaclSubject = DataFactory.namedNode(this.config.shapeSubject)
            if (!this.config.shapesGraph.has(new Quad(rootShapeShaclSubject, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, SHAPES_GRAPH))) {
                console.warn(`shapes graph does not contain requested root shape ${this.config.shapeSubject}`)
                return
            }
        }
        else {
            // if data-value-subject is set and we have input data, use shape of that
            if (this.config.valueSubject && this.config.dataGraph.size > 0) {
                const rootValueSubject = DataFactory.namedNode(this.config.valueSubject)
                const rootValueSubjectTypes = this.config.dataGraph.getQuads(rootValueSubject, RDF_PREDICATE_TYPE, null, null)
                if (rootValueSubjectTypes.length === 0) {
                    console.warn(`value subject '${this.config.valueSubject}' has no ${RDF_PREDICATE_TYPE.id} statement`)
                    return
                }
                // if type refers to a node shape, prioritize that over targetClass resolution
                for (const rootValueSubjectType of rootValueSubjectTypes) {
                    if (this.config.shapesGraph.has(new Quad(rootValueSubjectType.object as NamedNode, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, SHAPES_GRAPH))) {
                        rootShapeShaclSubject = rootValueSubjectType.object as NamedNode
                        break
                    }
                }
                if (!rootShapeShaclSubject) {
                    const rootShapes = this.config.shapesGraph.getQuads(null, `${PREFIX_SHACL}targetClass`, rootValueSubjectTypes[0].object, SHAPES_GRAPH)
                    if (rootShapes.length === 0) {
                        console.warn(`value subject '${this.config.valueSubject}' has no shacl shape definition in the shapes graph`)
                        return
                    }
                    if (rootShapes.length > 1) {
                        console.warn(`value subject '${this.config.valueSubject}' has multiple shacl shape definitions in the shapes graph, choosing the first found (${rootShapes[0].subject})`)
                    }
                    if (this.config.shapesGraph.getQuads(rootShapes[0].subject, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, SHAPES_GRAPH).length === 0) {
                        console.error(`value subject '${this.config.valueSubject}' references a shape which is not a NodeShape (${rootShapes[0].subject})`)
                        return
                    }
                    rootShapeShaclSubject = rootShapes[0].subject as NamedNode
                }
            }
            else {
                // choose first of all defined root shapes
                const rootShapes = this.config.shapesGraph.getQuads(null, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, SHAPES_GRAPH)
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
