import { Store, Parser, Quad, Prefixes, NamedNode, DataFactory } from 'n3'
import { toRDF } from 'jsonld'
import { DCTERMS_PREDICATE_CONFORMS_TO, OWL_PREDICATE_IMPORTS, RDF_PREDICATE_TYPE, SHACL_PREDICATE_CLASS, SHAPES_GRAPH } from './constants'
import { Config } from './config'
import { isURL } from './util'

// cache external data in module scope (and not in Loader instance) to avoid requesting
// them multiple times, e.g. when more than one shacl-form element is on the page
// that import the same resources
const loadedURLCache: Record<string, Promise<string>> = {}
const loadedClassesCache: Record<string, Promise<string>> = {}
let sharedShapesGraph: Store | undefined

export class Loader {
    private config: Config
    private loadedExternalUrls: string[] = []
    private loadedClasses: string[] = []

    constructor(config: Config) {
        this.config = config
    }

    async loadGraphs() {
        // clear local caches
        this.loadedExternalUrls = []
        this.loadedClasses = []

        let shapesStore = sharedShapesGraph
        const valuesStore = new Store()
        this.config.prefixes = {}

        const promises = [ this.importRDF(this.config.attributes.values ? this.config.attributes.values : this.config.attributes.valuesUrl ? this.fetchRDF(this.config.attributes.valuesUrl) : '', valuesStore, undefined, new Parser({ blankNodePrefix: '' })) ]
        if (!shapesStore) {
            shapesStore = new Store()
            promises.push(this.importRDF(this.config.attributes.shapes ? this.config.attributes.shapes : this.config.attributes.shapesUrl ? this.fetchRDF(this.config.attributes.shapesUrl) : '', shapesStore, SHAPES_GRAPH))
        }
        await Promise.all(promises)

        // if shapes graph is empty, but we have the following triples:
        // <valueSubject> a <uri> or <valueSubject> dcterms:conformsTo <uri>
        // then try to load the referenced object into the shapes graph
        if (!sharedShapesGraph && shapesStore?.size == 0 && this.config.attributes.valuesSubject) {
            const shapeCandidates = [
                ...valuesStore.getObjects(this.config.attributes.valuesSubject, RDF_PREDICATE_TYPE, null),
                ...valuesStore.getObjects(this.config.attributes.valuesSubject, DCTERMS_PREDICATE_CONFORMS_TO, null)
            ]
            const promises: Promise<void>[] = []
            for (const uri of shapeCandidates) {
                const url = this.toURL(uri.value)
                if (url && this.loadedExternalUrls.indexOf(url) < 0) {
                    this.loadedExternalUrls.push(url)
                    promises.push(this.importRDF(this.fetchRDF(url), shapesStore, SHAPES_GRAPH))
                }
            }
            try {
                await Promise.allSettled(promises)
            } catch (e) {
                console.warn(e)
            }
        }

        this.config.shapesGraph = shapesStore
        this.config.dataGraph = valuesStore
    }
    
    async importRDF(input: string | Promise<string>, store: Store, graph?: NamedNode, parser?: Parser) {
        const p = parser || new Parser()
        const parse = async (text: string) => {
            const dependencies: Promise<void>[] = []
            await new Promise((resolve, reject) => {
                p.parse(text, (error: Error, quad: Quad, prefixes: Prefixes) => {
                    if (error) {
                        console.warn('failed parsing graph', graph, error.message)
                        return reject(error)
                    }
                    if (quad) {
                        store.add(new Quad(quad.subject, quad.predicate, quad.object, graph))
                        // check if this is an owl:imports predicate and try to load the url
                        if (this.config.attributes.ignoreOwlImports === null && OWL_PREDICATE_IMPORTS.equals(quad.predicate)) {
                            const url = this.toURL(quad.object.value)
                            // import url only once
                            if (url && this.loadedExternalUrls.indexOf(url) < 0) {
                                this.loadedExternalUrls.push(url)
                                // import into separate graph
                                dependencies.push(this.importRDF(this.fetchRDF(url), store, DataFactory.namedNode(url), parser))
                            }
                        }
                        // check if this is an sh:class predicate and invoke class instance provider
                        if (this.config.classInstanceProvider && SHACL_PREDICATE_CLASS.equals(quad.predicate)) {
                            const className = quad.object.value
                            // import class definitions only once
                            if (this.loadedClasses.indexOf(className) < 0) {
                                let promise: Promise<string>
                                // check if class is in module scope cache
                                if (className in loadedClassesCache) {
                                    promise = loadedClassesCache[className]
                                } else {
                                    promise = this.config.classInstanceProvider(className)
                                    loadedClassesCache[className] = promise
                                }
                                this.loadedClasses.push(className)
                                dependencies.push(this.importRDF(promise, store, graph, parser))
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
                await Promise.allSettled(dependencies)
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
                // @ts-ignore, because result of toRDF is a string and not an object
                input = await toRDF(JSON.parse(input), { format: 'application/n-quads' }) as string
            } catch(_) {
                // NOP, it wasn't JSON
            }
            await parse(input)
        }
    }

    async fetchRDF(url: string): Promise<string> {
        // try to load from cache first
        if (url in loadedURLCache) {
            return loadedURLCache[url]
        }
        const promise = fetch(url, {
            headers: {
                'Accept': 'text/turtle, application/trig, application/n-triples, application/n-quads, text/n3, application/ld+json'
            },
        }).then(resp => resp.text())
        loadedURLCache[url] = promise
        return promise
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

export function setSharedShapesGraph(graph: Store) {
    sharedShapesGraph = graph
}
