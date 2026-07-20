import { DataFactory, NamedNode, Writer, Quad, Literal, Prefixes } from 'n3'
import { FRACTIONAL_DATATYPES, PREFIX_XSD, RDF_PREDICATE_TYPE, PREFIX_SHACL, XSD_DATATYPE_STRING } from './constants.js'
import { Editor } from './theme.js'
import { NodeObject } from 'jsonld'
import { serializeXsdDateTimeValue, serializeXsdDateValue } from './util.js'

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
            let object: string | Record<string, string> = quad.object.value
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

export function toRDF(editor: Editor): NamedNode | Literal | undefined {
    let languageOrDatatype: NamedNode<string> | string | undefined = editor.shaclDatatype
    // prefer value from dataset over editor value (this is used by rdfs:label substitution for term values)
    let value: number | string = editor.dataset.value || editor.value
    if ((editor['type'] === 'file' || editor.getAttribute('type') === 'file') && editor['binaryData']) {
        value = editor['binaryData']
    } else if (editor['type'] === 'checkbox' || editor.getAttribute('type') === 'checkbox') {
        // emit boolean 'false' only when required
        if (editor['checked'] || parseInt(editor.dataset.minCount || '0') > 0) {
            return DataFactory.literal(editor['checked'] ? 'true' : 'false', languageOrDatatype)
        }
        return undefined
    }
    if (value) {
        if (value.startsWith('<') && value.endsWith('>') && value.indexOf(':') > -1) {
            return DataFactory.namedNode(value.substring(1, value.length - 1))
        } else if (editor.dataset.class || editor.dataset.nodeKind === PREFIX_SHACL + 'IRI') {
            return DataFactory.namedNode(value)
        } else if (editor.dataset.link) {
            return JSON.parse(editor.dataset.link)
        } else {
            if (editor.dataset.lang) {
                languageOrDatatype = editor.dataset.lang
            } else if (languageOrDatatype instanceof NamedNode && FRACTIONAL_DATATYPES.has(languageOrDatatype.value)) {
                const normalizedValue = normalizeFractionalNumber(value)
                if (normalizedValue === undefined) {
                    return undefined
                }
                value = normalizedValue
            } else if (editor['type'] === 'number') {
                value = parseFloat(value)
            } else if (editor['type'] === 'datetime-local') {
                value = serializeXsdDateTimeValue(value, editor.dataset.xsdTemporalSuffix)
            } else if (editor['type'] === 'date' && languageOrDatatype instanceof NamedNode && languageOrDatatype.value === PREFIX_XSD + 'date') {
                value = serializeXsdDateValue(value, editor.dataset.xsdTemporalSuffix)
            }
            // check if value is a typed rdf literal or langString
            if ((!languageOrDatatype || (languageOrDatatype instanceof NamedNode && XSD_DATATYPE_STRING.equals(languageOrDatatype))) && typeof value === 'string') {
                // check for typed rdf literal
                let tokens = value.split('^^')
                if (tokens.length === 2 && tokens[0].startsWith('"') && tokens[0].endsWith('"') && tokens[1].split(':').length === 2) {
                    value = tokens[0].substring(1, tokens[0].length - 1)
                    languageOrDatatype = DataFactory.namedNode(tokens[1])
                } else {
                    // check for langString
                    tokens = value.split('@')
                    if (tokens.length === 2 && tokens[0].startsWith('"') && tokens[0].endsWith('"')) {
                        value = tokens[0].substring(1, tokens[0].length - 1)
                        languageOrDatatype = tokens[1]
                    } else if (value.startsWith('"') && value.endsWith('"')) {
                        // check for simple literal
                        value = value.substring(1, value.length - 1)
                    }
                }
            }
            return DataFactory.literal(value, languageOrDatatype)
        }
    }
}

function normalizeFractionalNumber(value: string): string | undefined {
    const normalized = value.replace(',', '.')
    return /^[-+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$/.test(normalized)
        ? normalized
        : undefined
}
