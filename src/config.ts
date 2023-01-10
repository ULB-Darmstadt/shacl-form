import { Store, Parser } from 'n3'
import { Term } from '@rdfjs/types'
import { PREFIX_SHACL, PREFIX_RDF } from './prefixes'
import { DefaultTheme, Theme } from './theme'

export class Config {
    static abortController = new AbortController()

    shapes: string | null = null
    shapesUrl: string | null = null
    shapeSubject: string | null = null
    values: string | null = null
    valuesUrl: string | null = null
    valueSubject: string | null = null
    language: string | null = null

    private _theme: Theme = new DefaultTheme()
    private _shapesGraph: Store = new Store()
    private _valuesGraph: Store = new Store()
    private _lists: Record<string, Term[]> = {}
    private _groups: Array<string> = []

    equals(other: Config): boolean {
        if (!other) {
            return false
        }
        for (const key of Object.keys(this)) {
            if (this[key] !== other[key]) {
                return false
            }
        }
        return true
    }

    async loadGraphs() {
        Config.abortController.abort()
        this._shapesGraph = new Store(new Parser().parse(this.shapes ? this.shapes : this.shapesUrl ? await fetch(this.shapesUrl, { signal: Config.abortController.signal }).then(resp => resp.text()) : ''))
        this._valuesGraph = new Store(new Parser().parse(this.values ? this.values : this.valuesUrl ? await fetch(this.valuesUrl, { signal: Config.abortController.signal }).then(resp => resp.text()) : ''))

        this._lists = this._shapesGraph.extractLists()
        this._groups = []
        this._shapesGraph.getQuads(null, `${PREFIX_RDF}type`, `${PREFIX_SHACL}PropertyGroup`, null).forEach(groupQuad => {
            this._groups.push(groupQuad.subject.value)
        })
    }

    get shapesGraph() {
        return this._shapesGraph
    }

    get valuesGraph() {
        return this._valuesGraph
    }

    get lists() {
        return this._lists
    }

    get groups() {
        return this._groups
    }

    set theme(theme: Theme) {
        this._theme = theme
        console.log('--- theme', this._theme)
    }

    static from(elem: HTMLElement): Config {
        const config = new Config()
        for (const key of Object.keys(config)) {
            config[key] = elem.dataset[key]
        }
        if (!config.language) {
            config.language = navigator.language
        }
        return config
    }

    static get keysAsDataAttributes(): Array<string> {
        return Object.keys(new Config()).filter(key => { return !key.startsWith('_')}).map(key => {
            // convert camelcase key to kebap case
            key = key.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
            return 'data-' + key
        })
    }
}