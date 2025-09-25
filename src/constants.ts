import { DataFactory } from "n3"

export const PREFIX_SHACL = 'http://www.w3.org/ns/shacl#'
export const PREFIX_DASH = 'http://datashapes.org/dash#'
export const PREFIX_XSD = 'http://www.w3.org/2001/XMLSchema#'
export const PREFIX_RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
export const PREFIX_RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
export const PREFIX_SKOS = 'http://www.w3.org/2004/02/skos/core#'
export const PREFIX_OWL = 'http://www.w3.org/2002/07/owl#'
export const PREFIX_OA = 'http://www.w3.org/ns/oa#'
export const PREFIX_DCTERMS = 'http://purl.org/dc/terms/'
export const PREFIX_FOAF = 'http://xmlns.com/foaf/0.1/'

export const SHAPES_GRAPH = DataFactory.namedNode('loaded-shapes')
export const DATA_GRAPH = DataFactory.namedNode('loaded-data')

export const RDF_PREDICATE_TYPE = DataFactory.namedNode(PREFIX_RDF + 'type')
export const DCTERMS_PREDICATE_CONFORMS_TO = DataFactory.namedNode(PREFIX_DCTERMS + 'conformsTo')
export const RDFS_PREDICATE_SUBCLASS_OF = DataFactory.namedNode(PREFIX_RDFS + 'subClassOf')
export const OWL_PREDICATE_IMPORTS = DataFactory.namedNode(PREFIX_OWL + 'imports')
export const SKOS_PREDICATE_BROADER = DataFactory.namedNode(PREFIX_SKOS + 'broader')
export const SKOS_PREDICATE_NARROWER = DataFactory.namedNode(PREFIX_SKOS + 'narrower')
export const SHACL_OBJECT_NODE_SHAPE = DataFactory.namedNode(PREFIX_SHACL + 'NodeShape')
export const SHACL_OBJECT_IRI = DataFactory.namedNode(PREFIX_SHACL + 'IRI')
export const SHACL_PREDICATE_PROPERTY = DataFactory.namedNode(PREFIX_SHACL + 'property')
export const SHACL_PREDICATE_CLASS = DataFactory.namedNode(PREFIX_SHACL + 'class')
export const SHACL_PREDICATE_NODE = DataFactory.namedNode(PREFIX_SHACL + 'node')
export const SHACL_PREDICATE_TARGET_CLASS = DataFactory.namedNode(PREFIX_SHACL + 'targetClass')
export const SHACL_PREDICATE_NODE_KIND = DataFactory.namedNode(PREFIX_SHACL + 'nodeKind')
export const XSD_DATATYPE_STRING =  DataFactory.namedNode(PREFIX_XSD + 'string')