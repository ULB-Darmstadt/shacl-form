import { Store, Parser, Quad, Prefixes, NamedNode } from 'n3'
import { OWL_IMPORTS, SHAPES_GRAPH } from './constants'
import { ShaclForm } from './form'
import { Config } from './config'

export class Loader {
    private abortController: AbortController | null = null
    private config: Config

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
            const owlImports: Array<string> = []
            await new Promise((resolve, reject) => {
                p.parse(text, (error: Error, quad: Quad, prefixes: Prefixes) => {
                    if (error) {
                        return reject(error)
                    }
                    if (quad) {
                        store.add(new Quad(quad.subject, quad.predicate, quad.object, graph))
                        // check if this is an owl:imports
                        if (this.config.attributes.ignoreOwlImports === null && OWL_IMPORTS.equals(quad.predicate)) {
                            owlImports.push(quad.object.value)
                        }
                        return
                    }
                    if (prefixes) {
                        this.config.registerPrefixes(prefixes)
                    }
                    resolve(null)
                })
            })

            for (const owlImport of owlImports) {
                const url = this.toURL(owlImport)
                if (url) {
                    await this.importRDF(this.fetchRDF(url), store, graph, parser)
                }
            }
        }

        if (input instanceof Promise) {
            input = await input
        }
        await parse(input)
    }

    fetchRDF(url: string): Promise<string> {
        return fetch(url, {
            headers: {
                'Accept': 'text/turtle, application/trig, application/n-triples, application/n-quads, text/n3'
            },
            signal: this.abortController?.signal
        }).then(resp => {
            if (resp.ok) {
                return resp.text()
            }
            else {
                throw new Error('failed loading ' + url)
            }
        }).catch(e => {
            throw new Error('failed loading ' + url + ', reason:' + e)
        })
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