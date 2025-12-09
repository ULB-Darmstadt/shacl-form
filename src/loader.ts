import { Store, Quad, NamedNode, DataFactory, StreamParser, Prefixes } from 'n3'
import { DATA_GRAPH, DCTERMS_PREDICATE_CONFORMS_TO, OWL_PREDICATE_IMPORTS, SHACL_PREDICATE_CLASS, SHACL_PREDICATE_TARGET_CLASS, SHAPES_GRAPH } from './constants'
import { isURL } from './util'
import { RdfXmlParser } from 'rdfxml-streaming-parser'
import jsonld from 'jsonld'
import { ClassInstanceProvider } from './plugin'


// cache external data in module scope to avoid requesting/parsing
// them multiple times, e.g. when more than one shacl-form element is on the page
// that import the same resources
export const rdfCache: Record<string, Promise<Quad[]>> = {}
export const classesCache: Record<string, Promise<string>> = {}
export const prefixes: Prefixes = {}

export interface LoaderAttributes {
    loadOwlImports: boolean
    proxy?: string | null
    shapes?: string | null
    shapesUrl?: string | null
    values?: string | null
    valuesUrl?: string | null
    valuesSubject?: string | null
    classInstanceProvider?: ClassInstanceProvider
}

interface LoaderContext {
    store: Store
    importedUrls: string[]
    importedClasses: string[]
    atts: LoaderAttributes
}

export async function loadGraphs(atts: LoaderAttributes) {
    const ctx: LoaderContext = {
        store: new Store(),
        importedUrls: [],
        importedClasses: [],
        atts: atts
    }

    const promises: Promise<void>[] = []
    if (atts.shapes) {
        promises.push(importRDF(parseRDF(atts.shapes, SHAPES_GRAPH), ctx))
    } else if (atts.shapesUrl) {
        promises.push(importRDF(fetchRDF(atts.shapesUrl, ctx, SHAPES_GRAPH), ctx))
    }
    if (atts.values) {
        promises.push(importRDF(parseRDF(atts.values, DATA_GRAPH), ctx))
    } else if (atts.valuesUrl) {
        promises.push(importRDF(fetchRDF(atts.valuesUrl, ctx, DATA_GRAPH), ctx))
    }
    await Promise.all(promises)

    // if shapes graph is empty, but we have the following triples:
    // <valueSubject> a <uri> or <valueSubject> dcterms:conformsTo <uri>
    // or if we have data-shape-subject set on the form,
    // then try to load the referenced object(s) into the shapes graph
    if (ctx.store.countQuads(null, null, null, SHAPES_GRAPH) === 0 && atts.valuesSubject) {
        const shapeCandidates = [
            // ...store.getObjects(this.config.attributes.valuesSubject, RDF_PREDICATE_TYPE, DATA_GRAPH),
            ...ctx.store.getObjects(atts.valuesSubject, DCTERMS_PREDICATE_CONFORMS_TO, DATA_GRAPH)
        ]
        const promises: Promise<void>[] = []
        for (const uri of shapeCandidates) {
            const url = toURL(uri.value)
            if (url && ctx.importedUrls.indexOf(url) < 0) {
                ctx.importedUrls.push(url)
                promises.push(importRDF(fetchRDF(url, ctx, SHAPES_GRAPH), ctx))
            }
        }
        try {
            await Promise.allSettled(promises)
        } catch (e) {
            console.warn(e)
        }
    }

    return ctx.store
}

async function importRDF(rdf: Promise<Quad[]>, ctx: LoaderContext) {
    const quads = await rdf
    const dependencies: Promise<void>[] = []

    for (const quad of quads) {
        ctx.store.add(new Quad(quad.subject, quad.predicate, quad.object, quad.graph))
        // check if this is an owl:imports predicate and try to load the url
        if (OWL_PREDICATE_IMPORTS.equals(quad.predicate) && ctx.atts.loadOwlImports) {
            const url = toURL(quad.object.value)
            // import url only once
            if (url && ctx.importedUrls.indexOf(url) < 0) {
                ctx.importedUrls.push(url)
                dependencies.push(importRDF(fetchRDF(url, ctx), ctx))
            }
        }
        // check if this is an sh:class predicate and invoke class instance provider
        if (ctx.atts.classInstanceProvider && (SHACL_PREDICATE_CLASS.equals(quad.predicate) || SHACL_PREDICATE_TARGET_CLASS.equals(quad.predicate))) {
            const className = quad.object.value
            // import class definitions only once
            if (ctx.importedClasses.indexOf(className) < 0) {
                let promise: Promise<string>
                // check if class is in module scope cache
                if (className in classesCache) {
                    promise = classesCache[className]
                } else {
                    promise = ctx.atts.classInstanceProvider(className)
                    classesCache[className] = promise
                }
                ctx.importedClasses.push(className)
                dependencies.push(importRDF(parseRDF(await promise, SHAPES_GRAPH), ctx))
            }
        }
    }
    await Promise.allSettled(dependencies)
}

async function fetchRDF(url: string, ctx: LoaderContext, graph?: NamedNode): Promise<Quad[]> {
    // try to load from cache first
    if (url in rdfCache) {
        return rdfCache[url]
    }
    rdfCache[url] = new Promise<Quad[]>(async (resolve, reject) => {
        try {
            let proxiedURL = url
            // if we have a proxy configured, then load url via proxy
            if (ctx.atts.proxy) {
                proxiedURL = ctx.atts.proxy + encodeURIComponent(url)
            }
            const response = await fetch(proxiedURL, {
                headers: {
                    'Accept': 'text/turtle, application/trig, application/n-triples, application/n-quads, text/n3, application/ld+json'
                },
            }).then(resp => resp.text())
            resolve(await parseRDF(response, graph || DataFactory.namedNode(url)))
        } catch(e) {
            reject(e)
        }
    })
    return rdfCache[url]
}

async function parseRDF(rdf: string, graph: NamedNode): Promise<Quad[]> {
    if (guessContentType(rdf) === 'json') {
        // convert json to n-quads
        try {
            rdf = await jsonld.toRDF(JSON.parse(rdf), { format: 'application/n-quads' }) as string
        } catch(e) {
            console.error(e)
        }
    }
    const quads: Quad[] = []
    await new Promise((resolve, reject) => {
        const parser = guessContentType(rdf) === 'xml' ? new RdfXmlParser() : new StreamParser()
        parser.on('data', (quad: Quad) => {
            quads.push(new Quad(quad.subject, quad.predicate, quad.object, graph))
        })
        .on('error', (error) => {
            reject(error)
        })
        .on('prefix', (prefix, iri) => {
            // ignore empty (default) namespace
            if (prefix) {
                prefixes[prefix] = iri
            }
        })
        .on('end', () => {
            resolve(null)
        })
        parser.write(rdf)
        parser.end()
    })
    return quads
}

function toURL(id: string): string | null {
    if (isURL(id)) {
        return id
    }
    const splitted = id.split(':')
    if (splitted.length === 2) {
        const prefix = prefixes[splitted[0]]
        if (prefix) {
            // need to ignore type check. 'prefix' is a string and not a NamedNode<string> (seems to be a bug in n3 typings)
            // @ts-ignore
            id = id.replace(`${splitted[0]}:`, prefix)
            if (isURL(id)) {
                return id
            }
        }
    }
    return null
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
