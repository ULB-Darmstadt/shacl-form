import { DataFactory, Prefixes, Quad, StreamParser } from 'n3'
import { RdfXmlParser } from 'rdfxml-streaming-parser'
import jsonld from 'jsonld'
import { RdfUrlResolver } from './plugin.js'

// cache external data in module scope to avoid requesting/parsing
// them multiple times, e.g. when more than one shacl-form element is on the page
// that import the same resources
export const rdfCache: Record<string, Promise<Quad[]>> = {}
export const prefixes: Prefixes = {}

type RdfSource =
    | { rdf: string }
    | { url: string, proxy?: string | null, rdfUrlResolver?: RdfUrlResolver }

export async function loadRDF(source: RdfSource): Promise<Quad[]> {
    if ('rdf' in source) {
        return parseRDF(source.rdf)
    }
    if (source.rdfUrlResolver) {
        return parseRDF(await source.rdfUrlResolver(source.url))
    }
    return fetchRDF(source.url, source.proxy)
}

export async function fetchRDF(url: string, proxy: string | null | undefined): Promise<Quad[]> {
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
            }
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

export async function parseRDF(rdf: string): Promise<Quad[]> {
    if (!rdf.trim()) {
        return []
    }
    const contentType = guessContentType(rdf)
    if (contentType === 'json') {
        // convert json to n-quads
        try {
            rdf = await jsonld.toRDF(JSON.parse(rdf), { format: 'application/n-quads' }) as string
        } catch (e) {
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

/* Can't rely on HTTP content-type header, since many resources are delivered with text/plain */
function guessContentType(input: string) {
    if (/^\s*[\\[{]/.test(input)) {
        return 'json'
    } else if (/^\s*<\?xml/.test(input)) {
        return 'xml'
    }
    return 'ttl'
}
