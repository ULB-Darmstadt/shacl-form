import { ShaclNode } from './node'
import { Config } from './config'
import { Writer, Quad, Store, DataFactory, NamedNode, Parser } from 'n3'
import { DEFAULT_PREFIXES, PREFIX_RDF, PREFIX_SHACL } from './prefixes'
import { focusFirstInputElement } from './util'
import SHACLValidator from 'rdf-validate-shacl'
import factory from 'rdf-ext'
import { DefaultTheme, Theme } from './theme'

const styles = `
shacl-form form { padding-left: 1rem; }
shacl-node shacl-node h1 { font-size: 1rem; color: #555; }
shacl-node, shacl-group { display: flex; flex-direction: column; width: 100%; }
shacl-node .control-button { cursor: pointer; }
shacl-node .control-button:not(:hover) { border-color: transparent; background: 0; }
shacl-node .remove-button { margin-left: 4px; }
shacl-node .add-button { font-size: 0.7rem; color: #555;  margin-right: 24px; text-decoration:none; }
shacl-node .add-button:before { content: '+'; margin-right: 0.2em; }
shacl-node .add-button:hover { color: inherit; }
shacl-node .prop-instance { display: flex; align-items: flex-start; margin-top: 8px; width: 100%; }
shacl-node h1 { font-size: 1.1rem; border-bottom: 1px solid; margin-top: 0; }
shacl-property { display: flex; flex-direction: column; align-items: end; }
shacl-property .prop-instance:not(:first-child) > .prop > label { visibility: hidden; }
shacl-group { margin-bottom: 1em; padding-bottom: 1em; }
shacl-group h2 { font-size: 1rem; border-bottom: 1px solid; margin-top: 0; color: #555; }
.prop { display: flex; flex-grow: 1; align-items: flex-start; }
.prop label { display: inline-block; word-break: break-word; width: 7em; line-height: 1em; padding-top: 0.15em; flex-shrink: 0; position: relative; }
.prop label[title] { cursor: help; text-decoration: underline dashed #AAA; }
.prop label.required::before { color: red; content: '\u2736'; font-size: 0.6rem; position: absolute; left: -1.4em; top: 0.15rem; }
.prop .editor { flex-grow: 1; }
.prop textarea.editor { resize: vertical; }
.validation { align-self: flex-start; color: red; }

shacl-form.bootstrap .prop label { padding-top: 0.7em; }
shacl-form.bootstrap .prop label.required::before { top: 0.65rem; }
`

export class ShaclForm extends HTMLElement {
    static get observedAttributes() { return Config.keysAsDataAttributes }

    config: Config = new Config()
    shape: ShaclNode | undefined
    form: HTMLFormElement
    initTimeout: ReturnType<typeof setTimeout> | undefined

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
        const stylesheet = document.createElement('style')
        stylesheet.append(styles)
        this.prepend(stylesheet)
        this.prepend(this.form)
    }

    attributeChangedCallback() {
        const newConfig = Config.from(this)
        if (!newConfig.equals(this.config)) {
            clearTimeout(this.initTimeout)
            this.initTimeout = setTimeout(() => {
                this.config = newConfig
                this.config.loadGraphs().then(_ => this.initialize()).catch(e => {
                    console.log(e)
                    if (this.shape && this.form.contains(this.shape)) {
                        this.form.removeChild(this.shape)
                    }
                })
            }, 20)
        }
    }

    private initialize() {
        if (this.shape && this.form.contains(this.shape)) {
            this.form.removeChild(this.shape)
        }

        // find root shacl shape
        const rootShapeShaclSubject = this.findRootShaclShapeSubject()
        if (rootShapeShaclSubject) {
            this.shape = new ShaclNode(this.config, rootShapeShaclSubject, null, this.config.valueSubject ? new NamedNode(this.config.valueSubject) : undefined)
            this.form.prepend(this.shape)
            focusFirstInputElement(this.shape)
        }
    }

    public toRDF(): Quad[] {
        const graph = new Store()
        if (this.shape) {
            this.shape.toRDF(graph)
        }
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

    public reportValidity(): boolean {
        return this.form.reportValidity()
    }

    private async validate(): Promise<boolean> {
        for (const elem of this.querySelectorAll(':scope .validation')) {
            elem.remove()
        }

        const shapes = factory.dataset(this.config.shapesGraph)
        const validator = new SHACLValidator(shapes, { factory })
        // const report = await validator.validate(data)
        const report = await validator.validate(factory.dataset(this.toRDF()))
    
        for (const result of report.results) {
            // See https://www.w3.org/TR/shacl/#results-validation-result for details about each property
            console.log('--- mesage', result.message)
            console.log('--- path', result.path)
            console.log('--- focusNode', result.focusNode)
            console.log('--- severity', result.severity)
            console.log('--- sourceConstraintComponent', result.sourceConstraintComponent)
            console.log('--- sourceShape', result.sourceShape)

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
