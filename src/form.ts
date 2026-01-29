import { ShaclNode } from './node'
import { Config } from './config'
import { ClassInstanceProvider, DataProvider, Plugin, listPlugins, registerPlugin } from './plugin'
import { Store, NamedNode, DataFactory, BlankNode } from 'n3'
import { DATA_GRAPH, DCTERMS_PREDICATE_CONFORMS_TO, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, SHACL_PREDICATE_TARGET_CLASS, SHAPES_GRAPH } from './constants'
import { Editor, Theme } from './theme'
import { serialize } from './serialize'
import { RokitCollapsible } from '@ro-kit/ui-widgets'
import { mergeOverriddenProperties, ShaclNodeTemplate } from './node-template'
import { loadClassInstances, loadGraphs, loadShapeInstances, prefixes } from './loader'
import { findAllClasses } from './util'

export * from './exports'
export const initTimeout = 50

export interface ValidationReport {
    conforms: boolean
    results: unknown[]
}

export class ShaclForm extends HTMLElement {
    static get observedAttributes() { return Config.dataAttributes() }

    config: Config
    shape: ShaclNode | null = null
    form: HTMLFormElement
    initDebounceTimeout: ReturnType<typeof setTimeout> | undefined

    constructor() {
        super()

        this.attachShadow({ mode: 'open' })
        this.form = document.createElement('form')
        this.config = new Config(this.form)
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
        // set loading attribute on element so that hosting app can apply special css rules
        this.setAttribute('loading', '')
        // remove all child elements from form and show loading indicator
        this.form.replaceChildren(document.createTextNode(this.config.attributes.loading))
        this.initDebounceTimeout = setTimeout(async () => {
            try {
                // reset cached values in config
                this.config.reset()
                // load all data
                this.config.store = await loadGraphs({
                    shapes: this.config.attributes.shapes,
                    shapesUrl: this.config.attributes.shapesUrl,
                    values: this.config.attributes.values,
                    valuesUrl: this.config.attributes.valuesUrl,
                    valuesSubject: this.config.attributes.valuesSubject,
                    loadOwlImports: this.config.attributes.ignoreOwlImports === null,
                    classInstanceProvider: this.config.classInstanceProvider,
                    dataProvider: this.config.dataProvider,
                    proxy: this.config.attributes.proxy
                })
                // remove loading indicator
                this.form.replaceChildren()
                // find root shacl shape
                const rootShapeShaclSubject = this.findRootShaclShapeSubject()
                if (rootShapeShaclSubject) {
                    // remove all previous css classes to have a defined state
                    this.form.classList.forEach(value => { this.form.classList.remove(value) })
                    this.form.classList.toggle('mode-edit', this.config.editMode)
                    this.form.classList.toggle('mode-view', !this.config.editMode)
                    // let theme add css classes to form element
                    this.config.theme.apply(this.form)
                    // adopt stylesheets from theme and plugins
                    const styles: CSSStyleSheet[] = [ this.config.theme.stylesheet ]
                    if (this.config.hierarchyColorsStyleSheet) {
                        styles.push(this.config.hierarchyColorsStyleSheet)
                    }
                    for (const plugin of listPlugins()) {
                        if (plugin.stylesheet) {
                            styles.push(plugin.stylesheet)
                        }
                    }
                    this.shadowRoot!.adoptedStyleSheets = styles

                    const rootTemplate = new ShaclNodeTemplate(rootShapeShaclSubject, this.config)
                    for (const nodeTemplate of this.config.nodeTemplates) {
                        mergeOverriddenProperties(nodeTemplate)
                    }
                    // if non lazy loading data provider is set, load shape instances for linking
                    if (this.config.dataProvider?.shapeInstances && !this.config.dataProvider.lazyLoad) {
                        await loadShapeInstances(this.config.getNodeTemplateIds(), this.config)
                    }
                    // if non lazy loading data provider or classInstanceProvider is set, load class instances
                    if ((this.config.dataProvider && !this.config.dataProvider.lazyLoad) || this.config.classInstanceProvider) {
                        await loadClassInstances(findAllClasses(this.config.store), this.config)
                    }

                    this.shape = new ShaclNode(rootTemplate, this.config.attributes.valuesSubject ? DataFactory.namedNode(this.config.attributes.valuesSubject) : undefined)
                    this.form.appendChild(this.shape)

                    if (this.config.attributes.showRootShapeLabel !== null && rootTemplate.label) {
                        const heading = document.createElement('h3')
                        heading.innerText = rootTemplate.label.value
                        this.form.prepend(heading)
                    }

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
                                            const invalidEditor = this.form.querySelector(':scope .invalid > .editor')
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
                        // property value binding is asynchronous, so delay data graph cleanup
                        setTimeout(() => {
                            // delete bound values from data graph, otherwise validation would not work correctly
                            if (this.config.attributes.valuesSubject) {
                                this.removeFromDataGraph(DataFactory.namedNode(this.config.attributes.valuesSubject))
                            }
                            this.validate(true)
                        })
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
            this.removeAttribute('loading')
            // dispatch 'ready' event on macro task queue to be sure to have all property values bound to the form
            setTimeout(() => { this.dispatchEvent(new Event('ready')) })
        }, initTimeout)
    }

    public serialize(format = 'text/turtle', graph = this.toRDF()): string {
        const quads = graph.getQuads(null, null, null, null)
        return serialize(quads, format, prefixes)
    }

    public toRDF(graph = new Store()): Store {
        this.shape?.toRDF(graph, undefined, this.config.attributes.generateNodeShapeReference)
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

    /**
    * @deprecated Use setDataProvider() instead
    */
    public setClassInstanceProvider(provider: ClassInstanceProvider) {
        this.config.classInstanceProvider = provider
        this.initialize()
    }

    public setDataProvider(provider: DataProvider) {
        this.config.dataProvider = provider
        this.initialize()
    }

    /* Returns the validation report */
    public async validate(ignoreEmptyValues = false): Promise<ValidationReport> {
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

        if (!this.shape) {
            return { conforms: true, results: [] }
        }
        const rootShape = this.shape
        const promise = new Promise<ValidationReport>((resolve) => {
            this.config.store.deleteGraph(this.config.valuesGraphId || '').on('end', async () => {
                rootShape.toRDF(this.config.store, undefined, this.config.attributes.generateNodeShapeReference)
                try {
                    const report = await this.config.validator.validate({ dataset: this.config.store, terms: [ rootShape.nodeId ] }, [{ terms: [ rootShape.template.id ] }])
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
                    resolve(report)
                } catch(e) {
                    console.error(e)
                    resolve({ conforms: false, results: [] })
                }
            })
        })
        return promise
    }

    private createValidationErrorDisplay(validatonResult?: unknown, clazz?: string): HTMLElement {
        const messageElement = document.createElement('span')
        messageElement.classList.add('validation-error')
        if (clazz) {
            messageElement.classList.add(clazz)
        }
        const result = (typeof validatonResult === 'object' && validatonResult !== null)
            ? validatonResult as { message?: Array<{ value: string }>; sourceConstraintComponent?: { value?: string } }
            : null
        if (result) {
            if (result.message?.length) {
                for (const message of result.message) {
                    messageElement.title += message.value + '\n'
                }
            } else if (result.sourceConstraintComponent?.value) {
                messageElement.title = result.sourceConstraintComponent.value
            }
        }
        return messageElement
    }

    private findRootShaclShapeSubject(): NamedNode | undefined {
        // if data-shape-subject is set, use that
        if (this.config.attributes.shapeSubject) {
            const rootShapeShaclSubject = DataFactory.namedNode(this.config.attributes.shapeSubject)
            if (this.config.store.getQuads(rootShapeShaclSubject, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null).length === 0) {
                console.warn(`shapes graph does not contain requested node shape ${this.config.attributes.shapeSubject}`)
                return
            } else {
                return rootShapeShaclSubject
            }
        } else {
            // if we have a data graph and data-values-subject is set, use shape of that
            if (this.config.attributes.valuesSubject && this.config.store.countQuads(null, null, null, DATA_GRAPH) > 0) {
                const rootValueSubject = DataFactory.namedNode(this.config.attributes.valuesSubject)
                const rootValueSubjectTypes = [
                    ...this.config.store.getQuads(rootValueSubject, RDF_PREDICATE_TYPE, null, DATA_GRAPH),
                    ...this.config.store.getQuads(rootValueSubject, DCTERMS_PREDICATE_CONFORMS_TO, null, DATA_GRAPH)
                ]
                if (rootValueSubjectTypes.length === 0) {
                    console.warn(`value subject '${this.config.attributes.valuesSubject}' has neither ${RDF_PREDICATE_TYPE.id} nor ${DCTERMS_PREDICATE_CONFORMS_TO.id} statement`)
                } else {
                    // if type/conformsTo refers to a node shape, prioritize that over targetClass resolution
                    for (const rootValueSubjectType of rootValueSubjectTypes) {
                        if (this.config.store.getQuads(rootValueSubjectType.object as NamedNode, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null).length > 0) {
                            return rootValueSubjectType.object as NamedNode
                        }
                    }
                }
                // find root shape via targetClass
                const classes = this.config.store.getObjects(rootValueSubject, RDF_PREDICATE_TYPE, DATA_GRAPH)
                for (const clazz of classes) {
                    for (const rootShapeCandidate of this.config.store.getQuads(null, SHACL_PREDICATE_TARGET_CLASS, clazz, null)) {
                        return rootShapeCandidate.subject as NamedNode
                    }
                }
            }
            // choose first of all defined root shapes
            const rootShapes = this.config.store.getQuads(null, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null)
            if (rootShapes.length == 0) {
                console.warn('shapes graph does not contain any node shapes')
                return
            }
            if (rootShapes.length > 1) {
                console.warn('shapes graph contains', rootShapes.length, 'node shapes. choosing first found which is', rootShapes[0].subject.value)
                console.info('hint: set the node shape to use with element attribute "data-shape-subject"')
            }
            return rootShapes[0].subject as NamedNode
        }
    }

    private removeFromDataGraph(subject: NamedNode | BlankNode) {
        for (const quad of this.config.store.getQuads(subject, null, null, DATA_GRAPH)) {
            this.config.store.delete(quad)
            if (quad.object.termType === 'NamedNode' || quad.object.termType === 'BlankNode') {
                // recurse
                this.removeFromDataGraph(quad.object)
            }
        }
    }
}

window.customElements.define('shacl-form', ShaclForm)
