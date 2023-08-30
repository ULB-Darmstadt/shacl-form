import { Store, Parser, Quad, Prefixes, NamedNode } from 'n3'
import { OWL_IMPORTS, SHACL_PREDICATE_CLASS, SHAPES_GRAPH } from './constants'
import { Config } from './config'

export class Loader {
    private abortController: AbortController | null = null
    private config: Config
    private owlImportsLoaded: string[] = []
    private classesLoaded: string[] = []

    constructor(config: Config) {
        this.config = config
    }

    async loadGraphs() {
        if (this.abortController) {
            this.abortController.abort()
        }
        this.abortController = new AbortController()

        const store = new Store()
        const valuesStore = new Store()
        this.config.prefixes = {}

        await Promise.all([
            this.importRDF(this.config.attributes.shapes ? this.config.attributes.shapes : this.config.attributes.shapesUrl ? this.fetchRDF(this.config.attributes.shapesUrl) : '', store, SHAPES_GRAPH),
            this.importRDF(this.config.attributes.values ? this.config.attributes.values : this.config.attributes.valuesUrl ? this.fetchRDF(this.config.attributes.valuesUrl) : '', valuesStore, undefined, new Parser({ blankNodePrefix: '' })),
        ])

        this.config.shapesGraph = store
        this.config.dataGraph = valuesStore
    }
    
    async importRDF(input: string | Promise<string>, store: Store, graph?: NamedNode, parser?: Parser) {
        const p = parser ? parser : new Parser()
        const parse = async (text: string) => {
            const owlImports: string[] = []
            const classes: string[] = []
            await new Promise((resolve, reject) => {
                p.parse(text, (error: Error, quad: Quad, prefixes: Prefixes) => {
                    if (error) {
                        return reject(error)
                    }
                    if (quad) {
                        store.add(new Quad(quad.subject, quad.predicate, quad.object, graph))
                        // check if this is an owl:imports predicate
                        if (this.config.attributes.ignoreOwlImports === null && OWL_IMPORTS.equals(quad.predicate)) {
                            owlImports.push(quad.object.value)
                        }
                        // check if this is an sh:class predicate
                        if (this.config.classInstanceProvider && SHACL_PREDICATE_CLASS.equals(quad.predicate)) {
                            classes.push(quad.object.value)
                        }
                        return
                    }
                    if (prefixes) {
                        this.config.registerPrefixes(prefixes)
                    }
                    resolve(null)
                })
            })

            if (owlImports.length || classes.length) {
                const promises: Promise<void>[] = []
                for (const owlImport of owlImports) {
                    const url = this.toURL(owlImport)
                    if (url && this.owlImportsLoaded.indexOf(url) < 0) {
                        // import url only once
                        this.owlImportsLoaded.push(url)
                        promises.push(this.importRDF(this.fetchRDF(url), store, graph, parser))
                    }
                }
                for (const clazz of classes) {
                    if (this.classesLoaded.indexOf(clazz) < 0) {
                        // import class definitions only once
                        promises.push(this.importRDF(this.config.classInstanceProvider!(clazz), store, graph, parser))
                    }
                }
                await Promise.all(promises)
            }
        }

        if (input instanceof Promise) {
            input = await input
        }
        if (input) {
            await parse(input)
        }
    }

    async fetchRDF(url: string): Promise<string> {
        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'text/turtle, application/trig, application/n-triples, application/n-quads, text/n3'
                },
                signal: this.abortController?.signal
            })
            if (response.ok) {
                return response.text()
            }
        }
        catch(e) {
            throw new Error('failed loading ' + url + ', reason:' + e)
        }
        throw new Error('failed loading ' + url)
    }

    toURL(id: string): string | null {
        if (this.isURL(id)) {
            return id
        }
        if (this.config.prefixes) {
            const splitted = id.split(':')
            if (splitted.length === 2) {
                const prefix = this.config.prefixes[splitted[0]]
                if (prefix) {
                    // need to ignore type check. 'prefix' is a string and not a NamedNode<string> (seems to be a bug in n3 typings)
                    // @ts-ignore
                    id = id.replace(`${splitted[0]}:`, prefix)
                    if (this.isURL(id)) {
                        return id
                    }
                }
            }
        }
        return null
    }
    
    isURL(input: string): boolean {
        let url: URL
        try {
            url = new URL(input)
        } catch (_) {
            return false
        }
        return url.protocol === 'http:' || url.protocol === 'https:'
    }
}