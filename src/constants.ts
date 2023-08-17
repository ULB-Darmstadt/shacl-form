import { DataFactory } from "n3"

export const PREFIX_SHACL = 'http://www.w3.org/ns/shacl#'
export const PREFIX_DASH = 'http://datashapes.org/dash#'
export const PREFIX_XSD = 'http://www.w3.org/2001/XMLSchema#'
export const PREFIX_RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
export const PREFIX_RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
export const PREFIX_SCHEMA = 'http://schema.org/'
export const PREFIX_SKOS = 'http://www.w3.org/2004/02/skos/core#'
export const PREFIX_OWL = 'http://www.w3.org/2002/07/owl#'
export const PREFIX_FOAF = 'http://xmlns.com/foaf/0.1/'
export const PREFIX_DCTERMS = 'http://purl.org/dc/terms/'

export const DEFAULT_PREFIXES = {
    'xsd': PREFIX_XSD,
    'rdf': PREFIX_RDF,
    'schema': PREFIX_SCHEMA
}

export const KNOWN_PREFIXES = [ PREFIX_SHACL, PREFIX_DASH, PREFIX_XSD, PREFIX_RDF, PREFIX_RDFS, PREFIX_SCHEMA, PREFIX_SKOS, PREFIX_OWL, PREFIX_FOAF, PREFIX_DCTERMS]

export const SHAPES_GRAPH = DataFactory.namedNode('shapes')
export const OWL_IMPORTS = DataFactory.namedNode(PREFIX_OWL + 'imports')

export const RDF_PREDICATE_TYPE = DataFactory.namedNode(PREFIX_RDF + 'type')
export const RDFS_PREDICATE_SUBCLASS_OF = DataFactory.namedNode(PREFIX_RDFS + 'subClassOf')
export const SHACL_OBJECT_NODE_SHAPE = DataFactory.namedNode(PREFIX_SHACL + 'NodeShape')