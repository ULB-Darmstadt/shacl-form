import { DataFactory, NamedNode, Writer, Quad, Literal, Prefixes } from 'n3'
import { PREFIX_XSD, RDF_PREDICATE_TYPE, PREFIX_SHACL } from './constants'
import { Editor } from './theme'
import { NodeObject } from 'jsonld'

export function serialize(quads: Quad[], format: string, prefixes?: Prefixes): string {
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

function serializeJsonld(quads: Quad[]): string {
    const triples: NodeObject[] = []
    for (const quad of quads) {
        const triple: NodeObject = { '@id': quad.subject.id }
  
        if (quad.predicate === RDF_PREDICATE_TYPE) {
          triple['@type'] = quad.object.id
        } else {
            let object: string | {} = quad.object.value
            if (quad.object instanceof Literal) {
                if (quad.object.language) {
                    object = { '@language': quad.object.language, '@value': quad.object.value }
                } else if (quad.object.datatype && quad.object.datatype.value !== `${PREFIX_XSD}#string`) {
                    object = { '@type': quad.object.datatype.value, '@value': quad.object.value }
                }
            } else {
                object = { '@id': quad.object.id }
            }
            triple[quad.predicate.value] = object
        }
        triples.push(triple)
    }
    return JSON.stringify(triples)
}

export function toRDF(editor: Editor): Literal | NamedNode | undefined {
    let languageOrDatatype: NamedNode<string> | string | undefined = editor['shaclDatatype']
    let value: number | string = editor.value
    if (value) {
        if (editor.dataset.class || editor.dataset.nodeKind === PREFIX_SHACL + 'IRI') {
            return DataFactory.namedNode(value)
        } else {
            if (editor.dataset.lang) {
                languageOrDatatype = editor.dataset.lang
            }
            else if (editor['type'] === 'number') {
                value = parseFloat(value)
            }
            return DataFactory.literal(value, languageOrDatatype)
        }
    } else if (editor['type'] === 'checkbox' || editor.getAttribute('type') === 'checkbox') {
        // emit boolean 'false' only when required
        if (editor['checked'] || parseInt(editor.dataset.minCount || '0') > 0) {
            return DataFactory.literal(editor['checked'] ? 'true' : 'false', languageOrDatatype)
        }
    }
}