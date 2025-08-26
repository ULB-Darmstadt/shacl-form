import { ShaclNode } from './node'
import { Config } from './config'
import { ClassInstanceProvider, Plugin, listPlugins, registerPlugin } from './plugin'
import { Store, NamedNode, DataFactory, Quad, BlankNode } from 'n3'
import { DATA_GRAPH, DCTERMS_PREDICATE_CONFORMS_TO, PREFIX_SHACL, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, SHACL_PREDICATE_TARGET_CLASS, SHAPES_GRAPH } from './constants'
import { Editor, Theme } from './theme'
import { serialize } from './serialize'
import { Validator } from 'shacl-engine'
import { RokitCollapsible } from '@ro-kit/ui-widgets'

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
                this.validate(true).then(report => {
                    this.dispatchEvent(new CustomEvent('change', { bubbles: true, cancelable: false, composed: true, detail: { 'valid': report.conforms, 'report': report } }))
                }).catch(e => { console.warn(e) })
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
                // reset rendered node references
                this.config.renderedNodes.clear()
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
                    for (const plugin of listPlugins()) {
                        if (plugin.stylesheet) {
                            styles.push(plugin.stylesheet)
                        }
                    }
                    this.shadowRoot!.adoptedStyleSheets = styles

                    this.shape = new ShaclNode(rootShapeShaclSubject, this.config, this.config.attributes.valuesSubject ? DataFactory.namedNode(this.config.attributes.valuesSubject) : undefined)
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
                                    this.validate().then(report => {
                                        if (report?.conforms) {
                                            // form and data graph are valid, so fire submit event
                                            this.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
                                        } else {
                                            // focus first invalid element
                                            let invalidEditor = this.form.querySelector(':scope .invalid > .editor')
                                            if (invalidEditor) {
                                                (invalidEditor as HTMLElement).focus()
                                            } else {
                                                this.form.querySelector(':scope .invalid')?.scrollIntoView()
                                            }
                                        }
                                    })
                                }
                            })
                            this.form.appendChild(button)
                        }
                        // delete bound values from data graph, otherwise validation would be confused
                        if (this.config.attributes.valuesSubject) {
                            this.removeFromDataGraph(DataFactory.namedNode(this.config.attributes.valuesSubject))
                        }
                        await this.validate(true)
                    }
                } else if (this.config.store.countQuads(null, null, null, SHAPES_GRAPH) > 0) {
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

    public registerPlugin(plugin: Plugin) {
        registerPlugin(plugin)
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

    /* Returns the validation report */
    public async validate(ignoreEmptyValues = false): Promise<any> {
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

        this.config.store.deleteGraph(this.config.valuesGraphId || '')
        this.shape?.toRDF(this.config.store)
        if (this.shape) {
            // add node target for validation. this is required in case of missing sh:targetClass in root shape
            this.config.store.add(new Quad(this.shape.shaclSubject, DataFactory.namedNode(PREFIX_SHACL + 'targetNode'), this.shape.nodeId, this.config.valuesGraphId))
        }
        try {
            const dataset = this.config.store
            const report = await new Validator(dataset, { details: true, factory: DataFactory }).validate({ dataset })

            for (const result of report.results) {
                if (result.focusNode?.ptrs?.length) {
                    for (const ptr of result.focusNode.ptrs) {
                        const focusNode = ptr._term
                        // result.path can be empty, e.g. if a focus node does not contain a required property node
                        if (result.path?.length) {
                            const path = result.path[0].predicates[0]
                            // try to find most specific editor elements first
                            let invalidElements = this.form.querySelectorAll(`
                                :scope shacl-node[data-node-id='${focusNode.id}'] > shacl-property > .property-instance[data-path='${path.id}'] > .editor,
                                :scope shacl-node[data-node-id='${focusNode.id}'] > shacl-property > .shacl-group > .property-instance[data-path='${path.id}'] > .editor,
                                :scope shacl-node[data-node-id='${focusNode.id}'] > .shacl-group > shacl-property > .property-instance[data-path='${path.id}'] > .editor,
                                :scope shacl-node[data-node-id='${focusNode.id}'] > .shacl-group > shacl-property > .shacl-group > .property-instance[data-path='${path.id}'] > .editor`)
                            if (invalidElements.length === 0) {
                                // if no editors found, select respective node. this will be the case for node shape violations.
                                invalidElements = this.form.querySelectorAll(`
                                    :scope [data-node-id='${focusNode.id}']  > shacl-property > .property-instance[data-path='${path.id}'],
                                    :scope [data-node-id='${focusNode.id}']  > shacl-property > .shacl-group > .property-instance[data-path='${path.id}']`)
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
                                            if (parent instanceof RokitCollapsible) {
                                                parent.open = true
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
                }
            }
            return report
        } catch(e) {
            console.error(e)
            return false
        }
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
            if (this.config.store.getQuads(rootShapeShaclSubject, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null).length === 0) {
                console.warn(`shapes graph does not contain requested root shape ${this.config.attributes.shapeSubject}`)
                return
            }
        }
        else {
            // if we have a data graph and data-values-subject is set, use shape of that
            if (this.config.attributes.valuesSubject && this.config.store.countQuads(null, null, null, DATA_GRAPH) > 0) {
                const rootValueSubject = DataFactory.namedNode(this.config.attributes.valuesSubject)
                const rootValueSubjectTypes = [
                    ...this.config.store.getQuads(rootValueSubject, RDF_PREDICATE_TYPE, null, DATA_GRAPH),
                    ...this.config.store.getQuads(rootValueSubject, DCTERMS_PREDICATE_CONFORMS_TO, null, DATA_GRAPH)
                ]
                if (rootValueSubjectTypes.length === 0) {
                    console.warn(`value subject '${this.config.attributes.valuesSubject}' has neither ${RDF_PREDICATE_TYPE.id} nor ${DCTERMS_PREDICATE_CONFORMS_TO.id} statement`)
                    return
                }
                // if type/conformsTo refers to a node shape, prioritize that over targetClass resolution
                for (const rootValueSubjectType of rootValueSubjectTypes) {
                    if (this.config.store.getQuads(rootValueSubjectType.object as NamedNode, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null).length > 0) {
                        rootShapeShaclSubject = rootValueSubjectType.object as NamedNode
                        break
                    }
                }
                if (!rootShapeShaclSubject) {
                    const rootShapes = this.config.store.getQuads(null, SHACL_PREDICATE_TARGET_CLASS, rootValueSubjectTypes[0].object, null)
                    if (rootShapes.length === 0) {
                        console.error(`value subject '${this.config.attributes.valuesSubject}' has no shacl shape definition in the shapes graph`)
                        return
                    }
                    if (rootShapes.length > 1) {
                        console.warn(`value subject '${this.config.attributes.valuesSubject}' has multiple shacl shape definitions in the shapes graph, choosing the first found (${rootShapes[0].subject})`)
                    }
                    if (this.config.store.getQuads(rootShapes[0].subject, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null).length === 0) {
                        console.error(`value subject '${this.config.attributes.valuesSubject}' references a shape which is not a NodeShape (${rootShapes[0].subject})`)
                        return
                    }
                    rootShapeShaclSubject = rootShapes[0].subject as NamedNode
                }
            }
            else {
                // choose first of all defined root shapes
                const rootShapes = this.config.store.getQuads(null, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null)
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

    private removeFromDataGraph(subject: NamedNode | BlankNode) {
        this.config.attributes.valuesSubject
        for (const quad of this.config.store.getQuads(subject, null, null, DATA_GRAPH)) {
            this.config.store.delete(quad)
            if (quad.object.termType === 'NamedNode' || quad.object.termType === 'BlankNode') {
                // recurse
                this.removeFromDataGraph(quad.object)
            }
        }
    }
}
