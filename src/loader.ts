import { Store, Quad, NamedNode, DataFactory, StreamParser, Term } from 'n3'
import { DATA_GRAPH, DCTERMS_PREDICATE_CONFORMS_TO, OWL_PREDICATE_IMPORTS, SHACL_PREDICATE_CLASS, SHACL_PREDICATE_NODE, SHACL_PREDICATE_TARGET_CLASS, SHAPES_GRAPH } from './constants'
import { Config } from './config'
import { isURL } from './util'
import { RdfXmlParser } from 'rdfxml-streaming-parser'
import { toRDF } from 'jsonld'


// cache external data in module scope (and not in Loader instance) to avoid requesting
// them multiple times, e.g. when more than one shacl-form element is on the page
// that import the same resources
const loadedURLCache: Record<string, Promise<string>> = {}
const loadedClassesCache: Record<string, Promise<string>> = {}

export class Loader {
    private config: Config
    private loadedExternalUrls: string[] = []

    constructor(config: Config) {
        this.config = config
    }

    async loadGraphs() {
        // clear local caches
        this.loadedExternalUrls = []
        this.config.prefixes = {}

        const promises: Promise<void>[] = []
        const store = new Store()
        promises.push(this.importRDF(this.config.attributes.shapes ? this.config.attributes.shapes : this.config.attributes.shapesUrl ? this.fetchRDF(this.config.attributes.shapesUrl) : '', store, SHAPES_GRAPH))
        // load data graph
        promises.push(this.importRDF(this.config.attributes.values ? this.config.attributes.values : this.config.attributes.valuesUrl ? this.fetchRDF(this.config.attributes.valuesUrl) : '', store, DATA_GRAPH))
        await Promise.all(promises)
        await this.fetchOwlImports(store)
        await this.fetchClassInstances(store)

        // if shapes graph is empty, but we have the following triples:
        // <valueSubject> a <uri> or <valueSubject> dcterms:conformsTo <uri>
        // or if we have data-shape-subject set on the form,
        // then try to load the referenced object(s) into the shapes graph
        if (store.countQuads(null, null, null, SHAPES_GRAPH) === 0) {
            const shapeCandidates = new Set<Term>()
            if (this.config.attributes.valuesSubject) {
                store.forObjects((object) => shapeCandidates.add(object), this.config.attributes.valuesSubject, DCTERMS_PREDICATE_CONFORMS_TO, DATA_GRAPH)
            }
            if (this.config.attributes.shapeSubject) {
                shapeCandidates.add(DataFactory.namedNode(this.config.attributes.shapeSubject))
            }
            const promises: Promise<void>[] = []
            for (const uri of shapeCandidates) {
                const url = this.toURL(uri.value)
                if (url && this.loadedExternalUrls.indexOf(url) < 0) {
                    this.loadedExternalUrls.push(url)
                    promises.push(this.importRDF(this.fetchRDF(url), store, SHAPES_GRAPH))
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

    async fetchRDF(url: string): Promise<string> {
        // try to load from cache first
        if (url in loadedURLCache) {
            console.log('--- cache hit', url)
            return loadedURLCache[url]
        }
        let proxiedURL = url
        // if we have a proxy configured, then load url via proxy
        if (this.config.attributes.proxy) {
            proxiedURL = this.config.attributes.proxy + encodeURIComponent(url)
        }
        const promise = fetch(proxiedURL, {
            headers: {
                'Accept': 'text/turtle, application/trig, application/n-triples, application/n-quads, text/n3, application/ld+json'
            },
        }).then(resp => resp.text())
        loadedURLCache[url] = promise
        return promise
    }

    async fetchOwlImports(store: Store) {
        if (this.config.attributes.ignoreOwlImports === null) {
            const urls = new Set<string>()
            // find all triples in all graphs of the form <s> <sh:class> <:className>
            store.forObjects((url) => {
                urls.add(url.value)
            }, null, OWL_PREDICATE_IMPORTS, null)

            const dependencies: Promise<void>[] = []
            for (const url of urls) {
                const convertedURL = this.toURL(url)
                // import url only once
                if (convertedURL) {
                    // import into separate graph
                    dependencies.push(this.importRDF(this.fetchRDF(convertedURL), store, DataFactory.namedNode(convertedURL)))
                }
            }
            return Promise.allSettled(dependencies)
        }
    }

    async fetchClassInstances(store: Store) {
        if (this.config.classInstanceProvider) {
            const classNames = new Set<string>()
            // find all triples in all graphs of the form <s> <sh:class> <:className>
            store.forObjects((clazz) => {
                classNames.add(clazz.value)
            }, null, SHACL_PREDICATE_CLASS, null)
            // find all triples in all graphs of the form <s> <sh:node> <o> and <o> <sh:targetClass> <:className>
            store.forObjects((node) => {
                store.forObjects((clazz) => {
                    classNames.add(clazz.value)
                }, node, SHACL_PREDICATE_TARGET_CLASS, null)
            }, null, SHACL_PREDICATE_NODE, null)

            const dependencies: Promise<void>[] = []
            for (const className of classNames) {
                let promise: Promise<string>
                // check if class is in module scope cache
                if (className in loadedClassesCache) {
                    console.log('--- class cache hit', className)
                    promise = loadedClassesCache[className]
                } else {
                    promise = this.config.classInstanceProvider(className)
                    loadedClassesCache[className] = promise
                }
                dependencies.push(this.importRDF(promise, store, SHAPES_GRAPH))
            }
            return Promise.all(dependencies)
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

/* Can't rely on HTTP content-type header, since many resources are delivered with text/plain */
function guessContentType(input: string) {
    if (/^\s*\{/.test(input)) {
        return 'json'
    } else if (/^\s*<\?xml/.test(input)) {
        return 'xml'
    } 
    return 'ttl'
}
