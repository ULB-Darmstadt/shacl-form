import { Prefixes, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { PREFIX_SHACL, RDF_PREDICATE_TYPE, SHAPES_GRAPH } from './constants'
import { ClassInstanceProvider } from './plugin'
import { Loader } from './loader'
import { Theme } from './theme'

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
    view: string | null = null
    language: string | null = null
    loading: string = 'Loading\u2026'
    ignoreOwlImports: string | null = null
    collapse: string | null = null
    submitButton: string | null = null
}

export class Config {
    attributes = new ElementAttributes()
    loader = new Loader(this)
    classInstanceProvider: ClassInstanceProvider | undefined
    prefixes: Prefixes = {}
    editMode = true
    languages: string[] = Array.from(navigator.languages)

    dataGraph = new Store()
    lists: Record<string, Term[]> = {}
    groups: Array<string> = []
    theme: Theme
    form: HTMLElement
    renderedNodes = new Set<string>()
    private _shapesGraph = new Store()

    constructor(theme: Theme, form: HTMLElement) {
        this.theme = theme
        this.form = form
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
        this.attributes = atts
        // for backward compatibility
        if (this.attributes.valueSubject && !this.attributes.valuesSubject) {
            this.attributes.valuesSubject = this.attributes.valueSubject
        }
        if (atts.language) {
            // remove preferred language from list of navigator languages
            const index = this.languages.indexOf(atts.language)
            if (index > -1) {
                this.languages.splice(index, 1)
            }
            // now prepend preferred language at start of list of navigator languages
            this.languages.unshift(atts.language)
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

    get shapesGraph() {
        return this._shapesGraph
    }

    set shapesGraph(graph: Store) {
        this._shapesGraph = graph
        this.lists = graph.extractLists()
        this.groups = []
        graph.getQuads(null, RDF_PREDICATE_TYPE, `${PREFIX_SHACL}PropertyGroup`, SHAPES_GRAPH).forEach(groupQuad => {
            this.groups.push(groupQuad.subject.value)
        })
    }

    registerPrefixes(prefixes: Prefixes) {
        for (const key in prefixes) {
            // ignore empty (default) namespace
            if (key) {
                this.prefixes[key] = prefixes[key]
            } 
        }
    }
}