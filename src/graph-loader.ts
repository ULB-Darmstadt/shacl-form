import { Store, Quad, NamedNode, DataFactory } from 'n3'
import { DATA_GRAPH, DCTERMS_PREDICATE_CONFORMS_TO, OWL_PREDICATE_IMPORTS, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, SHAPES_GRAPH } from './constants'
import { findAllClasses, isURL } from './util'
import { ClassInstanceProvider, RdfUrlResolver } from './plugin'
import { loadRDF, prefixes } from './rdf-loader'

export { rdfCache, prefixes, fetchRDF, parseRDF } from './rdf-loader'

export interface LoaderAttributes {
    loadOwlImports: boolean
    proxy?: string | null
    shapes?: string | null
    shapesUrl?: string | null
    values?: string | null
    valuesUrl?: string | null
    valuesSubject?: string | null
    classInstanceProvider?: ClassInstanceProvider
    rdfUrlResolver?: RdfUrlResolver
}

export interface LoaderContext {
    store: Store
    importedUrls: string[]
    atts: LoaderAttributes
}

export function findConformsToValuesSubject(store: Store): string | undefined {
    const subjects = new Set<string>()
    for (const quad of store.getQuads(null, DCTERMS_PREDICATE_CONFORMS_TO, null, DATA_GRAPH)) {
        if (quad.subject.termType === 'NamedNode') {
            subjects.add(quad.subject.value)
        }
    }
    if (subjects.size === 1) {
        return subjects.values().next().value
    }
}

export function findConformsToShapeSubject(store: Store, valuesSubject: string): NamedNode | undefined {
    const rootValueSubject = DataFactory.namedNode(valuesSubject)
    for (const shape of store.getObjects(rootValueSubject, DCTERMS_PREDICATE_CONFORMS_TO, DATA_GRAPH)) {
        if (shape.termType === 'NamedNode' && store.getQuads(shape, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null).length > 0) {
            return shape
        }
    }
}

export async function loadGraphs(atts: LoaderAttributes) {
    const ctx: LoaderContext = {
        store: new Store(),
        importedUrls: [],
        atts: atts
    }

    const promises: Promise<void>[] = []
    if (atts.shapes) {
        promises.push(importRDF(loadRDF({ rdf: atts.shapes }), ctx, SHAPES_GRAPH))
    } else if (atts.shapesUrl) {
        promises.push(importRDF(loadRDF({ url: atts.shapesUrl, proxy: ctx.atts.proxy, rdfUrlResolver: ctx.atts.rdfUrlResolver }), ctx, SHAPES_GRAPH))
    }
    if (atts.values) {
        promises.push(importRDF(loadRDF({ rdf: atts.values }), ctx, DATA_GRAPH))
    } else if (atts.valuesUrl) {
        promises.push(importRDF(loadRDF({ url: atts.valuesUrl, proxy: ctx.atts.proxy, rdfUrlResolver: ctx.atts.rdfUrlResolver }), ctx, DATA_GRAPH))
    }
    await Promise.all(promises)

    // conditionally load class instances
    if (atts.classInstanceProvider) {
        try {
            const classes = findAllClasses(ctx.store)
            const rdf = await atts.classInstanceProvider(classes)
            if (rdf) {
                await importRDF(loadRDF({ rdf }), ctx, SHAPES_GRAPH)
            }
        } catch (e) {
            console.error('failed loading class instances', e)
        }
    }

    if (!atts.valuesSubject) {
        atts.valuesSubject = findConformsToValuesSubject(ctx.store) || null
    }

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
            let url = toURL(uri.value)
            if (!url && uri.value.startsWith('urn:') && ctx.atts.proxy) {
                // if we have a proxy set, try to resolve <urn:...> uris anyway
                url = uri.value
            }
            if (url && ctx.importedUrls.indexOf(url) < 0) {
                ctx.importedUrls.push(url)
                promises.push(importRDF(loadRDF({ url, proxy: ctx.atts.proxy, rdfUrlResolver: ctx.atts.rdfUrlResolver }), ctx, SHAPES_GRAPH))
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

export async function importRDF(rdf: Promise<Quad[]>, ctx: LoaderContext, graph: NamedNode) {
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
        if (ctx.atts.loadOwlImports && OWL_PREDICATE_IMPORTS.equals(quad.predicate)) {
            const url = toURL(quad.object.value)
            // import url only once
            if (url && ctx.importedUrls.indexOf(url) < 0) {
                ctx.importedUrls.push(url)
                dependencies.push(importRDF(loadRDF({ url, proxy: ctx.atts.proxy, rdfUrlResolver: ctx.atts.rdfUrlResolver }), ctx, DataFactory.namedNode(url)))
            }
        }
    }
    await Promise.allSettled(dependencies)
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
