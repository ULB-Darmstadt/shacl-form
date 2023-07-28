import { NamedNode } from "n3"

export const PREFIX_SHACL = 'http://www.w3.org/ns/shacl#'
export const PREFIX_DASH = 'http://datashapes.org/dash#'
export const PREFIX_XSD = 'http://www.w3.org/2001/XMLSchema#'
export const PREFIX_RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
export const PREFIX_RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
export const PREFIX_SCHEMA = 'http://schema.org/'
export const PREFIX_SKOS = 'http://www.w3.org/2004/02/skos/core#'
export const PREFIX_OWL = 'http://www.w3.org/2002/07/owl#'

export const DEFAULT_PREFIXES = {
    'xsd': PREFIX_XSD,
    'rdf': PREFIX_RDF,
    'schema': PREFIX_SCHEMA
}

export const SHAPES_GRAPH: NamedNode = new NamedNode("shapes")
export const OWL_IMPORTS: NamedNode = new NamedNode(`${PREFIX_OWL}imports`)

