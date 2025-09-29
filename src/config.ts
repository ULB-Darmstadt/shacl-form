import { DataFactory, NamedNode, Prefixes, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { PREFIX_SHACL, RDF_PREDICATE_TYPE } from './constants'
import { ClassInstanceProvider } from './plugin'
import { Loader } from './loader'
import { Theme } from './theme'
import { extractLists } from './util'
import { ShaclNodeTemplate } from './node-template'
import { ShaclPropertyTemplate } from './property-template'
import { DefaultTheme } from './theme.default'
import { Validator } from 'shacl-engine'

export class ElementAttributes {
    shapes: string | null = null
    shapesUrl: string | null = null
    shapeSubject: string | null = null
    values: string | null = null
    valuesUrl: string | null = null
    /**
     * @deprecated Use valuesSubject instead
     */
    valueSubject: string | null = null // for backward compatibility
    valuesSubject: string | null = null
    valuesNamespace = ''
    valuesGraph: string | null = null
    view: string | null = null
    language: string | null = null
    loading: string = 'Loading\u2026'
    proxy: string | null = null
    ignoreOwlImports: string | null = null
    collapse: string | null = null
    submitButton: string | null = null
    generateNodeShapeReference: string | null = null
    showNodeIds: string | null = null
    dense: string = "true"
}

export class Config {
    attributes = new ElementAttributes()
    loader = new Loader(this)
    classInstanceProvider: ClassInstanceProvider | undefined
    prefixes: Prefixes = {}
    editMode = true
    languages: string[]

    lists: Record<string, Term[]> = {}
    groups: string[] = []
    // @ts-ignore
    _theme: Theme
    form: HTMLElement
    renderedNodes = new Set<string>()
    valuesGraphId: NamedNode | undefined
    nodeShapes: Record<string, ShaclNodeTemplate> = {}
    propertyShapes: Record<string, ShaclPropertyTemplate> = {}
    private _store = new Store()
    validator = new Validator(this._store, { details: true, factory: DataFactory })

    constructor(form: HTMLElement) {
        this.form = form
        this.theme = new DefaultTheme()
        this.languages = [...new Set(navigator.languages.flatMap(lang => {
            if (lang.length > 2) {
                // for each 5 letter lang code (e.g. de-DE) append its corresponding 2 letter code (e.g. de) directly afterwards
                return [lang.toLocaleLowerCase(), lang.substring(0, 2)]
            } 
            return lang
        })), ''] // <-- append empty string to accept RDF literals with no language
    }

    reset() {
        this.lists = {}
        this.groups = []
        this.renderedNodes.clear()
        this.nodeShapes = {}
        this.propertyShapes = {}
    }
 
    updateAttributes(elem: HTMLElement) {
        const atts = new ElementAttributes();
        (Object.keys(atts) as Array<keyof ElementAttributes>).forEach(key => {
            const value = elem.dataset[key]
            if (value !== undefined) {
                atts[key] = value
            }
        })
        this.editMode = atts.view === null
        this.theme.setDense(atts.dense === "true")
        this.attributes = atts
        // for backward compatibility
        if (this.attributes.valueSubject && !this.attributes.valuesSubject) {
            this.attributes.valuesSubject = this.attributes.valueSubject
        }
        if (atts.language) {
            const index = this.languages.indexOf(atts.language)
            if (index > -1) {
                // remove preferred language from the list of languages
                this.languages.splice(index, 1)
            }
            // now prepend preferred language at start of the list of languages
            this.languages.unshift(atts.language)
        }
        if (atts.valuesGraph) {
            this.valuesGraphId = DataFactory.namedNode(atts.valuesGraph)
        }
    }

    static dataAttributes(): Array<string> {
        const atts = new ElementAttributes()
        return Object.keys(atts).map(key => {
            // convert camelcase key to kebap case
            key = key.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
            return 'data-' + key
        })
    }

    get theme() {
        return this._theme
    }

    set theme(theme: Theme) {
        this._theme = theme
        theme.setDense(this.attributes.dense === "true")
    }

    get store() {
        return this._store
    }

    set store(store: Store) {
        this._store = store
        this.lists = extractLists(store, { ignoreErrors: true })
        this.groups = []
        store.forSubjects(subject => {
            this.groups.push(subject.id)
        }, RDF_PREDICATE_TYPE, `${PREFIX_SHACL}PropertyGroup`, null)
        this.validator = new Validator(store, { details: true, factory: DataFactory })
    }
}