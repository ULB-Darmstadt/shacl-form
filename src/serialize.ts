import { Writer, Quad, Literal, Prefixes } from 'n3'
import { RDF_PREDICATE_TYPE } from './constants'

export function serialize(quads: Quad[], format: string, prefixes?: Prefixes): string | {}[] {
    if (format === 'application/ld+json') {
        return serializeJsonld(quads)
    } else {
        const writer = new Writer({ format: format, prefixes: prefixes })
        writer.addQuads(quads)
        let serialized = ''
        writer.end((error, result) => {
            if (error) {
                console.error(error)
            }
            serialized = result
        })
        return serialized
    }
}

function serializeJsonld(quads: Quad[]): {}[] {
    const triples: {}[] = []
    for (const quad of quads) {
        let triple = {}
        triple['@id'] = quad.subject.id
  
        if (quad.predicate === RDF_PREDICATE_TYPE) {
          triple['@type'] = quad.object.id
        } else {
            let object: string | {} = quad.object.value
            if (quad.object instanceof Literal) {
                if (quad.object.language) {
                    object = { '@language': quad.object.language, '@value': quad.object.value }
                } else if (quad.object.datatype && quad.object.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string') {
                    object = { '@type': quad.object.datatype.value, '@value': quad.object.value }
                }
            } else {
                object = { '@id': quad.object.id }
            }
            triple[quad.predicate.value] = object
        }
        triples.push(triple)
    }
    return triples
}
