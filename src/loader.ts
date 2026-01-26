import { Store, Quad, NamedNode, DataFactory, StreamParser, Prefixes } from 'n3'
import { DATA_GRAPH, DCTERMS_PREDICATE_CONFORMS_TO, OWL_PREDICATE_IMPORTS, RDF_PREDICATE_TYPE, SHACL_PREDICATE_CLASS, SHACL_PREDICATE_TARGET_CLASS, SHAPES_GRAPH } from './constants'
import { isURL } from './util'
import { RdfXmlParser } from 'rdfxml-streaming-parser'
import jsonld from 'jsonld'
import { ClassInstanceProvider, DataProvider } from './plugin'


// cache external data in module scope to avoid requesting/parsing
// them multiple times, e.g. when more than one shacl-form element is on the page
// that import the same resources
export const rdfCache: Record<string, Promise<Quad[]>> = {}
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
    dataProvider?: DataProvider
}

interface LoaderContext {
    store: Store
    importedUrls: string[]
    atts: LoaderAttributes
}

export async function loadGraphs(atts: LoaderAttributes) {
    const ctx: LoaderContext = {
        store: new Store(),
        importedUrls: [],
        atts: atts
    }

    const promises: Promise<void>[] = []
    if (atts.shapes) {
        promises.push(importRDF(parseRDF(atts.shapes), ctx, SHAPES_GRAPH))
    } else if (atts.shapesUrl) {
        promises.push(importRDF(fetchRDF(atts.shapesUrl, ctx.atts.proxy), ctx, SHAPES_GRAPH))
    }
    if (atts.values) {
        promises.push(importRDF(parseRDF(atts.values), ctx, DATA_GRAPH))
    } else if (atts.valuesUrl) {
        promises.push(importRDF(fetchRDF(atts.valuesUrl, ctx.atts.proxy), ctx, DATA_GRAPH))
    }
    await Promise.all(promises)

    // if shapes graph is empty, but we have the following triples:
    // <valueSubject> a <uri> or <valueSubject> dcterms:conformsTo <uri>
    // or if we have data-shape-subject set on the form,
    // then try to load the referenced object(s) into the shapes graph
    if (atts.valuesSubject && ctx.store.countQuads(null, null, null, SHAPES_GRAPH) === 0) {
        const shapeCandidates = [
            ...ctx.store.getObjects(atts.valuesSubject, RDF_PREDICATE_TYPE, DATA_GRAPH),
            ...ctx.store.getObjects(atts.valuesSubject, DCTERMS_PREDICATE_CONFORMS_TO, DATA_GRAPH)
        ]
        const promises: Promise<void>[] = []
        for (const uri of shapeCandidates) {
            const url = toURL(uri.value)
            if (url && ctx.importedUrls.indexOf(url) < 0) {
                ctx.importedUrls.push(url)
                promises.push(importRDF(fetchRDF(url, ctx.atts.proxy), ctx, SHAPES_GRAPH))
            }
        }
        try {
            await Promise.allSettled(promises)
        } catch (e) {
            console.warn(e)
        }
    }

    // if non-lazy data provider is set, load class instances now
    const provider = (atts.dataProvider && !atts.dataProvider.lazyLoad) ? atts.dataProvider : atts.classInstanceProvider
    if (provider) {
        const classesToLoad = new Set<string>()
        for (const clazz of ctx.store.getObjects(null, SHACL_PREDICATE_CLASS, SHAPES_GRAPH)) {
            classesToLoad.add(clazz.value)
        }
        for (const clazz of ctx.store.getObjects(null, SHACL_PREDICATE_TARGET_CLASS, SHAPES_GRAPH)) {
            classesToLoad.add(clazz.value)
        }
        if (classesToLoad.size > 0) {
            await loadClassInstances(Array.from(classesToLoad.values()), ctx, provider)
        }
    }
    return ctx.store
}

export async function loadClassInstances(classes: string[], target: Store | LoaderContext, provider: DataProvider | ClassInstanceProvider) {
    let ctx: LoaderContext
    if (target instanceof Store) {
        ctx = {
            store: target,
            importedUrls: [],
            atts: { loadOwlImports: false }
        }
    } else {
        ctx = target
    }

    let rdf: string
    if (typeof provider === 'object') {
        rdf = await provider.classInstances(Array.from(classes))
    } else {
        rdf = ''
        for (const clazz of classes) {
            const instances = await provider(clazz)
            if (instances) {
                rdf += instances + '\n'
            }
        }
    }
    if (rdf) {
        await importRDF(parseRDF(rdf), ctx, SHAPES_GRAPH)
    }
}

export async function loadShapeInstances(shapes: string[], store: Store, provider: DataProvider) {
    const ctx: LoaderContext = {
        store: store,
        importedUrls: [],
        atts: { loadOwlImports: false }
    }

    const rdf = await provider.shapeInstances(shapes)
    if (rdf) {
        await importRDF(parseRDF(rdf), ctx, SHAPES_GRAPH)
    }
}

async function importRDF(rdf: Promise<Quad[]>, ctx: LoaderContext, graph: NamedNode) {
    const quads = await rdf
    const dependencies: Promise<void>[] = []

    for (const quad of quads) {
        // if we have quads (named graphs) in the data graph then keep the graph id if it is not the value subject
        let targetGraph = graph
        if (ctx.atts.valuesSubject && DATA_GRAPH.equals(graph)) {
            if (quad.graph.id && quad.graph.id !== ctx.atts.valuesSubject) {
                targetGraph = quad.graph as NamedNode
            }
        }
        ctx.store.add(DataFactory.quad(quad.subject, quad.predicate, quad.object, targetGraph))
        // check if this is an owl:imports predicate and try to load the url
        if (OWL_PREDICATE_IMPORTS.equals(quad.predicate) && ctx.atts.loadOwlImports) {
            const url = toURL(quad.object.value)
            // import url only once
            if (url && ctx.importedUrls.indexOf(url) < 0) {
                ctx.importedUrls.push(url)
                dependencies.push(importRDF(fetchRDF(url, ctx.atts.proxy), ctx, DataFactory.namedNode(url)))
            }
        }
    }
    await Promise.allSettled(dependencies)
}

async function fetchRDF(url: string, proxy: string | null | undefined): Promise<Quad[]> {
    // try to load from cache first
    if (url in rdfCache) {
        return rdfCache[url]
    }
    rdfCache[url] = (async () => {
        let proxiedURL = url
        // if we have a proxy configured, then load url via proxy
        if (proxy) {
            proxiedURL = proxy + encodeURIComponent(url)
        }
        const response = await fetch(proxiedURL, {
            headers: {
                'Accept': 'text/turtle, application/trig, application/n-triples, application/n-quads, text/n3, application/ld+json'
            },
        })
        if (response.ok) {
            const content = await response.text()
            return parseRDF(content)
        } else {
            console.warn('failed fetching RDF from', url)
            return []
        }
    })()
    return rdfCache[url]
}

async function parseRDF(rdf: string): Promise<Quad[]> {
    if (!rdf.trim()) {
        return []
    }
    const contentType = guessContentType(rdf)
    if (contentType === 'json') {
        // convert json to n-quads
        try {
            rdf = await jsonld.toRDF(JSON.parse(rdf), { format: 'application/n-quads' }) as string
        } catch(e) {
            console.error(e)
        }
    }
    const quads: Quad[] = []
    await new Promise((resolve, reject) => {
        const parser = contentType === 'xml' ? new RdfXmlParser() : new StreamParser()
        parser.on('data', (quad: Quad) => {
            quads.push(DataFactory.quad(quad.subject, quad.predicate, quad.object, quad.graph))
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
            // @ts-expect-error need to ignore type check. 'prefix' is a string and not a NamedNode<string> (seems to be a bug in n3 typings)
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
    if (/^\s*[\\[{]/.test(input)) {
        return 'json'
    } else if (/^\s*<\?xml/.test(input)) {
        return 'xml'
    }
    return 'ttl'
}
