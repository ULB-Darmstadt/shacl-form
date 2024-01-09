import { ShaclNode } from './node'
import { Config } from './config'
import { ClassInstanceProvider, Plugin, PluginOptions } from './plugin'
import { Quad, Store, NamedNode, DataFactory } from 'n3'
import { RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, SHACL_PREDICATE_TARGET_CLASS, SHAPES_GRAPH } from './constants'
import { Editor, Theme } from './theme'
import { serialize } from './serialize'
import SHACLValidator from 'rdf-validate-shacl'

export class ShaclForm extends HTMLElement {
    static get observedAttributes() { return Config.dataAttributes() }

    config: Config
    shape: ShaclNode | null = null
    form: HTMLFormElement
    initDebounceTimeout: ReturnType<typeof setTimeout> | undefined

    constructor(theme: Theme) {
        super()

        this.attachShadow({ mode: 'open' })
        this.form = document.createElement('form')
        this.config = new Config(theme, this.form)
        this.form.addEventListener('change', ev => {
            ev.stopPropagation()
            if (this.config.editMode) {
                this.validate(true).then(valid => {
                    this.dispatchEvent(new CustomEvent('change', { bubbles: true, cancelable: false, composed: true, detail: { 'valid': valid } }))
                }).catch(e => { console.log(e) })
            }
        })
    }

    connectedCallback() {
        this.shadowRoot!.prepend(this.form)
    }

    attributeChangedCallback() {
        this.config.updateAttributes(this)
        this.initialize()
    }

    private initialize() {
        clearTimeout(this.initDebounceTimeout)
        this.initDebounceTimeout = setTimeout(async () => {
            // remove all child elements from form and show loading indicator
            this.form.replaceChildren(document.createTextNode(this.config.attributes.loading))
            try {
                await this.config.loader.loadGraphs()
                // remove loading indicator
                this.form.replaceChildren()
                // find root shacl shape
                const rootShapeShaclSubject = this.findRootShaclShapeSubject()
                if (rootShapeShaclSubject) {
                    // remove all previous css classes to have a defined state
                    this.form.classList.forEach(value => { this.form.classList.remove(value) })
                    this.form.classList.toggle('mode-edit', this.config.editMode)
                    this.form.classList.toggle('mode-view', !this.config.editMode)
                    // let theme add classes to form element
                    this.config.theme.apply(this.form)
                    // adopt stylesheets from theme and plugins
                    const styles: CSSStyleSheet[] = [ this.config.theme.stylesheet ]
                    for (const plugin of this.config.plugins.list()) {
                        if (plugin.stylesheet) {
                            styles.push(plugin.stylesheet)
                        }
                    }
                    this.shadowRoot!.adoptedStyleSheets = styles

                    this.shape = new ShaclNode(rootShapeShaclSubject, this.config, this.config.attributes.valueSubject ? DataFactory.namedNode(this.config.attributes.valueSubject) : undefined)
                    this.form.appendChild(this.shape)

                    if (this.config.editMode) {
                        // add submit button
                        if (this.config.attributes.submitButton !== null) {
                            const button = this.config.theme.createButton(this.config.attributes.submitButton || 'Submit', true)
                            button.addEventListener('click', (event) => {
                                event.preventDefault()
                                // let browser check form validity first
                                if (this.form.reportValidity()) {
                                    // now validate data graph
                                    this.validate().then(valid => {
                                        if (valid) {
                                            // form and data graph are valid, so fire submit event
                                            this.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
                                        } else {
                                            // focus first invalid element
                                            (this.form.querySelector(':scope .invalid > .editor') as HTMLElement)?.focus()
                                        }
                                    })
                                }
                            })
                            this.form.appendChild(button)
                        }
                        await this.validate(true)
                    }
                } else if (this.config.shapesGraph.size > 0) {
                    // raise error only when shapes graph is not empty
                    throw new Error('shacl root node shape not found')
                }
            } catch (e) {
                console.error(e)
                const errorDisplay = document.createElement('div')
                errorDisplay.innerText = String(e)
                this.form.replaceChildren(errorDisplay)
            }
        }, 200)
    }

    public serialize(format = 'text/turtle', graph = this.toRDF()): string {
        const quads = graph.getQuads(null, null, null, null)
        return serialize(quads, format, this.config.prefixes)
    }

    public toRDF(graph = new Store()): Store {
        this.shape?.toRDF(graph)
        return graph
    }

    public registerPlugin(plugin: Plugin, options?: PluginOptions) {
        this.config.plugins.register(plugin)
        this.initialize()
    }

    public setTheme(theme: Theme) {
        this.config.theme = theme
        this.initialize()
    }

    public setClassInstanceProvider(provider: ClassInstanceProvider) {
        this.config.classInstanceProvider = provider
        this.initialize()
    }

    public async validate(ignoreEmptyValues = false): Promise<boolean> {
        for (const elem of this.form.querySelectorAll(':scope .validation-error')) {
            elem.remove()
        }
        for (const elem of this.form.querySelectorAll(':scope .property-instance')) {
            elem.classList.remove('invalid')
            if (((elem.querySelector(':scope > .editor')) as Editor)?.value) {
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
        //     console.log('--- message', result.message)
        //     console.log('--- path', result.path)
        //     console.log('--- focusNode', result.focusNode)
        //     console.log('--- severity', result.severity)
        //     console.log('--- sourceConstraintComponent', result.sourceConstraintComponent)
        //     console.log('--- sourceShape', result.sourceShape)
        // }

        for (const result of report.results) {
            // result.path can be null, e.g. if a focus node does not contain a required property node
            const focusNode = result.focusNode as NamedNode
            if (result.path) {
                const path = result.path as NamedNode
                // try to find most specific editor elements first
                let invalidElements = this.form.querySelectorAll(`:scope [data-node-id='${focusNode.id}'] [data-path='${path.id}'] > .editor`)
                if (invalidElements.length === 0) {
                    // if no editors found, select respective node. this will be the case for node shape violations.
                    invalidElements = this.form.querySelectorAll(`:scope [data-node-id='${focusNode.id}'] [data-path='${path.id}']`)
                }

                for (const invalidElement of invalidElements) {
                    if (invalidElement.classList.contains('editor')) {
                        // this is a property shape violation
                        if (!ignoreEmptyValues || (invalidElement as Editor).value) {
                            let parent: HTMLElement | null = invalidElement.parentElement!
                            parent.classList.add('invalid')
                            parent.classList.remove('valid')
                            parent.appendChild(this.createValidationErrorDisplay(result))
                            do {
                                if (parent.classList.contains('collapsible')) {
                                    parent.classList.add('open')
                                }
                                parent = parent.parentElement
                            } while (parent)
                        }
                    } else if (!ignoreEmptyValues) {
                        // this is a node shape violation
                        invalidElement.classList.add('invalid')
                        invalidElement.classList.remove('valid')
                        invalidElement.appendChild(this.createValidationErrorDisplay(result, 'node'))
                    }
                }
            } else if (!ignoreEmptyValues) {
                this.form.querySelector(`:scope [data-node-id='${focusNode.id}']`)?.prepend(this.createValidationErrorDisplay(result, 'node'))
            }
        }
        return report.conforms
    }

    private createValidationErrorDisplay(validatonResult?: any, clazz?: string): HTMLElement {
        const messageElement = document.createElement('span')
        messageElement.classList.add('validation-error')
        if (clazz) {
            messageElement.classList.add(clazz)
        }
        if (validatonResult) {
            if (validatonResult.message?.length > 0) {
                for (const message of validatonResult.message) {
                    messageElement.title += message.value + '\n'
                }
            } else {
                messageElement.title = validatonResult.sourceConstraintComponent?.value
            }
        }
        return messageElement
    }


    private findRootShaclShapeSubject(): NamedNode | undefined {
        let rootShapeShaclSubject: NamedNode | null = null
        // if data-shape-subject is set, use that
        if (this.config.attributes.shapeSubject) {
            rootShapeShaclSubject = DataFactory.namedNode(this.config.attributes.shapeSubject)
            if (!this.config.shapesGraph.has(new Quad(rootShapeShaclSubject, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, SHAPES_GRAPH))) {
                console.warn(`shapes graph does not contain requested root shape ${this.config.attributes.shapeSubject}`)
                return
            }
        }
        else {
            // if we have a data graph and data-value-subject is set, use shape of that
            if (this.config.attributes.valueSubject && this.config.dataGraph.size > 0) {
                const rootValueSubject = DataFactory.namedNode(this.config.attributes.valueSubject)
                const rootValueSubjectTypes = this.config.dataGraph.getQuads(rootValueSubject, RDF_PREDICATE_TYPE, null, null)
                if (rootValueSubjectTypes.length === 0) {
                    console.warn(`value subject '${this.config.attributes.valueSubject}' has no ${RDF_PREDICATE_TYPE.id} statement`)
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
                    const rootShapes = this.config.shapesGraph.getQuads(null, SHACL_PREDICATE_TARGET_CLASS, rootValueSubjectTypes[0].object, SHAPES_GRAPH)
                    if (rootShapes.length === 0) {
                        console.error(`value subject '${this.config.attributes.valueSubject}' has no shacl shape definition in the shapes graph`)
                        return
                    }
                    if (rootShapes.length > 1) {
                        console.warn(`value subject '${this.config.attributes.valueSubject}' has multiple shacl shape definitions in the shapes graph, choosing the first found (${rootShapes[0].subject})`)
                    }
                    if (this.config.shapesGraph.getQuads(rootShapes[0].subject, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, SHAPES_GRAPH).length === 0) {
                        console.error(`value subject '${this.config.attributes.valueSubject}' references a shape which is not a NodeShape (${rootShapes[0].subject})`)
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
