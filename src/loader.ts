import { Store, Parser, Quad, Prefixes, NamedNode } from 'n3'
import { OWL_IMPORTS, SHAPES_GRAPH } from './constants'
import { ShaclForm } from './form'

export class Loader {
    private abortController: AbortController | null = null
    private form: ShaclForm

    constructor(form: ShaclForm) {
        this.form = form
    }

    async loadGraphs() {
        if (this.abortController) {
            this.abortController.abort()
        }
        this.abortController = new AbortController()

        const graph = new Store()
        const valuesGraph = new Store()

        await Promise.all([
            this.importRDF(this.form.config.shapes ? this.form.config.shapes : this.form.config.shapesUrl ? this.fetchRDF(this.form.config.shapesUrl) : '', graph, SHAPES_GRAPH),
            this.importRDF(this.form.config.values ? this.form.config.values : this.form.config.valuesUrl ? this.fetchRDF(this.form.config.valuesUrl) : '', valuesGraph, undefined, new Parser({ blankNodePrefix: '' })),
        ])

        this.form.config.graph = graph
        this.form.config.valuesGraph = valuesGraph
    }
    
    async importRDF(input: string | Promise<string>, store: Store, graph?: NamedNode, parser?: Parser): Promise<null> {
        const p = parser ? parser : new Parser()
        const parse = (text: string, resolve, reject) => {
            const owlImports: Array<string> = []
            p.parse(text, (error: Error, quad: Quad, prefixes: Prefixes) => {
                if (error) {
                    reject(error)
                }
                else {
                    if (quad) {
                        store.add(new Quad(quad.subject, quad.predicate, quad.object, graph))
                        // see if this is an owl:imports
                        if (this.form.config.loadOwlImports === 'true' && OWL_IMPORTS.equals(quad.predicate)) {
                            owlImports.push(quad.object.value)
                        }
                    }
                    else {
                        if (this.form.config.loadOwlImports === 'true' && prefixes) {
                            for (const owlImport of owlImports) {
                                const url = this.toURL(owlImport, prefixes)
                                if (url) {
                                    this.fetchRDF(url).then(text => {
                                        this.importRDF(text, store, graph, parser)
                                    }).catch(e => {
                                        console.log(e)
                                    })
                                }
                            }
                        }
                        resolve(null)
                    }
                }
            }, undefined)
        }
        return new Promise<null>((resolve, reject) => {
            if (input instanceof Promise) {
                input.then(text => parse(text, resolve, reject)).catch(e => {
                    reject(e)
                })
            }
            else {
                parse(input, resolve, reject)
            }
        })
    }

    fetchRDF(url: string, accept = 'text/turtle'): Promise<string> {
        return fetch(url, {
            headers: {
                'Accept': accept
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

    toURL(id: string, prefixes: Prefixes): string | null {
        if (this.isURL(id)) {
            return id
        }
        const splitted = id.split(':')
        if (splitted.length === 2) {
            const prefix = prefixes[splitted[0]]
            if (prefix) {
                // need to ignore type check. 'prefix' is a string and not a NamedNode<string> (seems to be a bug in n3 typings)
                // @ts-ignore
                id = id.replace(`${splitted[0]}:`, prefix)
                if (this.isURL(id)) {
                    return id
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