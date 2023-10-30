import { Store, Parser, Quad, Prefixes, NamedNode } from 'n3'
import * as jsonld from 'jsonld'
import { OWL_IMPORTS, SHACL_PREDICATE_CLASS, SHAPES_GRAPH } from './constants'
import { Config } from './config'
import { isURL } from './util'

export class Loader {
    private abortController: AbortController | null = null
    private config: Config
    private loadedOwlImports: string[] = []
    private loadedClasses: string[] = []

    constructor(config: Config) {
        this.config = config
    }

    async loadGraphs() {
        if (this.abortController) {
            this.abortController.abort()
        }
        this.abortController = new AbortController()
        this.loadedOwlImports = []
        this.loadedClasses = []

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
        const p = parser || new Parser()
        const parse = async (text: string) => {
            const dependencies: Promise<void>[] = []
            await new Promise((resolve, reject) => {
                p.parse(text, (error: Error, quad: Quad, prefixes: Prefixes) => {
                    if (error) {
                        return reject(error)
                    }
                    if (quad) {
                        store.add(new Quad(quad.subject, quad.predicate, quad.object, graph))
                        // check if this is an owl:imports predicate and try to load the url
                        if (this.config.attributes.ignoreOwlImports === null && OWL_IMPORTS.equals(quad.predicate)) {
                            const url = this.toURL(quad.object.value)
                            // import url only once
                            if (url && this.loadedOwlImports.indexOf(url) < 0) {
                                this.loadedOwlImports.push(url)
                                dependencies.push(this.importRDF(this.fetchRDF(url), store, graph, parser))
                            }
                        }
                        // check if this is an sh:class predicate and invoke class instance provider
                        if (this.config.classInstanceProvider && SHACL_PREDICATE_CLASS.equals(quad.predicate)) {
                            // import class definitions only once
                            if (this.loadedClasses.indexOf(quad.object.value) < 0) {
                                this.loadedClasses.push(quad.object.value)
                                dependencies.push(this.importRDF(this.config.classInstanceProvider(quad.object.value), store, graph, parser))
                            }
                        }
                        return
                    }
                    if (prefixes) {
                        this.config.registerPrefixes(prefixes)
                    }
                    resolve(null)
                })
            })
            try {
                await Promise.all(dependencies)
            } catch (e) {
                console.warn(e)
            }
        }

        if (input instanceof Promise) {
            input = await input
        }
        if (input) {
            try {
                // check if input is JSON
                input = jsonld.toRDF(JSON.parse(input), {format: 'application/n-quads'}) as string
            } catch(_) {
                // NOP, it wasn't JSON
            }
            await parse(input)
        }
    }

    async fetchRDF(url: string): Promise<string> {
        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'text/turtle, application/trig, application/n-triples, application/n-quads, text/n3, application/ld+json'
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
        if (isURL(id)) {
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
                    if (isURL(id)) {
                        return id
                    }
                }
            }
        }
        return null
    }
}