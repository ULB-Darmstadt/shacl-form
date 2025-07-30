import { Store, Quad, NamedNode, DataFactory, StreamParser } from 'n3'
import { DATA_GRAPH, DCTERMS_PREDICATE_CONFORMS_TO, OWL_PREDICATE_IMPORTS, RDF_PREDICATE_TYPE, SHACL_PREDICATE_CLASS, SHAPES_GRAPH } from './constants'
import { Config } from './config'
import { isURL } from './util'
import { RdfXmlParser } from 'rdfxml-streaming-parser'
import { toRDF } from 'jsonld'


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

        let store = sharedShapesGraph
        this.config.prefixes = {}

        const promises: Promise<void>[] = []
        if (!store) {
            store = new Store()
            promises.push(this.importRDF(this.config.attributes.shapes ? this.config.attributes.shapes : this.config.attributes.shapesUrl ? fetchRDF(this.config.attributes.shapesUrl) : '', store, SHAPES_GRAPH))
        }
        promises.push(this.importRDF(this.config.attributes.values ? this.config.attributes.values : this.config.attributes.valuesUrl ? fetchRDF(this.config.attributes.valuesUrl) : '', store, DATA_GRAPH))
        await Promise.all(promises)

        // if shapes graph is empty, but we have the following triples:
        // <valueSubject> a <uri> or <valueSubject> dcterms:conformsTo <uri>
        // then try to load the referenced object into the shapes graph
        if (!sharedShapesGraph && store.countQuads(null, null, null, SHAPES_GRAPH) === 0 && this.config.attributes.valuesSubject) {
            const shapeCandidates = [
                ...store.getObjects(this.config.attributes.valuesSubject, RDF_PREDICATE_TYPE, DATA_GRAPH),
                ...store.getObjects(this.config.attributes.valuesSubject, DCTERMS_PREDICATE_CONFORMS_TO, DATA_GRAPH)
            ]
            const promises: Promise<void>[] = []
            for (const uri of shapeCandidates) {
                const url = this.toURL(uri.value)
                if (url && this.loadedExternalUrls.indexOf(url) < 0) {
                    this.loadedExternalUrls.push(url)
                    promises.push(this.importRDF(fetchRDF(url), store, SHAPES_GRAPH))
                }
            }
            try {
                await Promise.allSettled(promises)
            } catch (e) {
                console.warn(e)
            }
        }

        this.config.store = store
    }
    
    async importRDF(input: string | Promise<string>, store: Store, graph?: NamedNode) {
        const parse = async (input: string) => {
            const dependencies: Promise<void>[] = []
            await new Promise((resolve, reject) => {
                const parser = guessContentType(input) === 'xml' ? new RdfXmlParser() : new StreamParser()
                parser.on('data', (quad: Quad) => {
                    store.add(new Quad(quad.subject, quad.predicate, quad.object, graph))
                    // check if this is an owl:imports predicate and try to load the url
                    if (this.config.attributes.ignoreOwlImports === null && OWL_PREDICATE_IMPORTS.equals(quad.predicate)) {
                        const url = this.toURL(quad.object.value)
                        // import url only once
                        if (url && this.loadedExternalUrls.indexOf(url) < 0) {
                            this.loadedExternalUrls.push(url)
                            // import into separate graph
                            dependencies.push(this.importRDF(fetchRDF(url), store, DataFactory.namedNode(url)))
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
                            dependencies.push(this.importRDF(promise, store, graph))
                        }
                    }
                })
                .on('error', (error) => {
                    console.warn('failed parsing graph', graph, error.message)
                    reject(error)
                })
                .on('prefix', (prefix, iri) => {
                    // ignore empty (default) namespace
                    if (prefix) {
                        this.config.prefixes[prefix] = iri
                    }
                })
                .on('end', () => {
                    resolve(null)
                })
                parser.write(input)
                parser.end()
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
            if (guessContentType(input) === 'json') {
                // convert json to n-quads
                try {
                    input = await toRDF(JSON.parse(input), { format: 'application/n-quads' }) as string
                } catch(e) {
                    console.error(e)
                }
            }
            await parse(input)
        }
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

async function fetchRDF(url: string): Promise<string> {
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

/* Can't rely on HTTP content-type header, since many resources are delivered with text/plain */
function guessContentType(input: string) {
    if (/^\s*\{/.test(input)) {
        return 'json'
    } else if (/^\s*<\?xml/.test(input)) {
        return 'xml'
    } 
    return 'ttl'
}

export function setSharedShapesGraph(graph: Store) {
    sharedShapesGraph = graph
}
