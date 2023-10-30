import { Prefixes, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { PREFIX_SHACL, RDF_PREDICATE_TYPE, SHAPES_GRAPH } from './constants'
import { ClassInstanceProvider, Plugins } from './plugin'
import { Loader } from './loader'
import { Theme } from './theme'

export class ElementAttributes {
    shapes: string | null = null
    shapesUrl: string | null = null
    shapeSubject: string | null = null
    values: string | null = null
    valuesUrl: string | null = null
    valueSubject: string | null = null
    mode: string | null = null
    language: string = navigator.language
    ignoreOwlImports: string | null = null
    submitButton: string | null = null
}

export class Config {
    attributes = new ElementAttributes()
    loader = new Loader(this)
    classInstanceProvider: ClassInstanceProvider | undefined
    prefixes: Prefixes = {}
    plugins = new Plugins()
    editMode = true

    dataGraph = new Store()
    lists: Record<string, Term[]> = {}
    groups: Array<string> = []
    theme: Theme
    form: HTMLElement
    private _shapesGraph = new Store()

    constructor(theme: Theme, form: HTMLElement) {
        this.theme = theme
        this.form = form
    }
 
    updateAttributes(elem: HTMLElement) {
        const atts = new ElementAttributes()
        for (const key of Object.keys(atts)) {
            if (elem.dataset[key] !== undefined) {
                atts[key] = elem.dataset[key]
            }
        }
        this.editMode = atts.mode !== 'view'
        this.attributes = atts
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