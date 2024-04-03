import { Literal, NamedNode, BlankNode, Quad, DataFactory } from 'n3'
import { Term } from '@rdfjs/types'
import { PREFIX_DASH, PREFIX_RDF, PREFIX_SHACL, SHACL_PREDICATE_CLASS, SHACL_PREDICATE_TARGET_CLASS, SHAPES_GRAPH } from './constants'
import { Config } from './config'
import { findLabel, removePrefixes } from './util'

const mappers: Record<string, (template: ShaclPropertyTemplate, term: Term) => void> = {
    [`${PREFIX_SHACL}name`]:         (template, term) => { const literal = term as Literal; if (!template.name || literal.language === template.config.attributes.language) { template.name = literal } },
    [`${PREFIX_SHACL}cssClass`]:         (template, term) => { template.cssClass = term.value },
    [`${PREFIX_SHACL}description`]:  (template, term) => { const literal = term as Literal; if (!template.description || literal.language === template.config.attributes.language) { template.description = literal } },
    [`${PREFIX_SHACL}path`]:         (template, term) => { template.path = term.value },
    [`${PREFIX_SHACL}node`]:         (template, term) => { template.node = term as NamedNode },
    [`${PREFIX_SHACL}datatype`]:     (template, term) => { template.datatype = term as NamedNode },
    [`${PREFIX_SHACL}nodeKind`]:     (template, term) => { template.nodeKind = term as NamedNode },
    [`${PREFIX_SHACL}minCount`]:     (template, term) => { template.minCount = parseInt(term.value) },
    [`${PREFIX_SHACL}maxCount`]:     (template, term) => { template.maxCount = parseInt(term.value) },
    [`${PREFIX_SHACL}minLength`]:    (template, term) => { template.minLength = parseInt(term.value) },
    [`${PREFIX_SHACL}maxLength`]:    (template, term) => { template.maxLength = parseInt(term.value) },
    [`${PREFIX_SHACL}minInclusive`]: (template, term) => { template.minInclusive = parseInt(term.value) },
    [`${PREFIX_SHACL}maxInclusive`]: (template, term) => { template.maxInclusive = parseInt(term.value) },
    [`${PREFIX_SHACL}minExclusive`]: (template, term) => { template.minExclusive = parseInt(term.value) },
    [`${PREFIX_SHACL}maxExclusive`]: (template, term) => { template.maxExclusive = parseInt(term.value) },
    [`${PREFIX_SHACL}pattern`]:      (template, term) => { template.pattern = term.value },
    [`${PREFIX_SHACL}order`]:        (template, term) => { template.order = term.value },
    [`${PREFIX_DASH}singleLine`]:    (template, term) => { template.singleLine = term.value === 'true' },
    [`${PREFIX_SHACL}and`]:          (template, term) => { template.shaclAnd = term.value },
    [`${PREFIX_SHACL}in`]:           (template, term) => { template.shaclIn = term.value },
    // sh:datatype might be undefined, but sh:languageIn defined. this is undesired. the spec says, that strings without a lang tag are not valid if sh:languageIn is set. but the shacl validator accepts these as valid. to prevent this, we just set the datatype here to 'langString'.
    [`${PREFIX_SHACL}languageIn`]:   (template, term) => { template.languageIn = template.config.lists[term.value]; template.datatype = DataFactory.namedNode(PREFIX_RDF + 'langString') },
    [`${PREFIX_SHACL}defaultValue`]: (template, term) => { template.defaultValue = term },
    [`${PREFIX_SHACL}hasValue`]:     (template, term) => { template.hasValue = term },
    [SHACL_PREDICATE_CLASS.value]:   (template, term) => {
        template.class = term as NamedNode
        // try to find node shape that has requested target class
        const nodeShapes = template.config.shapesGraph.getSubjects(SHACL_PREDICATE_TARGET_CLASS, term, SHAPES_GRAPH)
        if (nodeShapes.length > 0) {
            template.node = nodeShapes[0] as NamedNode
        }
    },
    [`${PREFIX_SHACL}or`]:           (template, term) => {
        const list = template.config.lists[term.value]
        if (list?.length) {
            template.shaclOr = list
        } else {
            console.error('list not found:', term.value, 'existing lists:', template.config.lists)
        }
    }
}

export class ShaclPropertyTemplate  {
    label = ''
    nodeId: NamedNode | BlankNode
    name: Literal | undefined
    cssClass: string | undefined
    description: Literal | undefined
    path: string | undefined
    node: NamedNode | undefined
    class: NamedNode | undefined
    minCount: number | undefined
    maxCount: number | undefined
    minLength: number | undefined
    maxLength: number | undefined
    minInclusive: number | undefined
    maxInclusive: number | undefined
    minExclusive: number | undefined
    maxExclusive: number | undefined
    singleLine: boolean | undefined
    defaultValue: Term | undefined
    pattern: string | undefined
    order: string | undefined
    nodeKind: NamedNode | undefined
    shaclAnd: string | undefined
    shaclIn: string | undefined
    shaclOr: Term[] | undefined
    languageIn: Term[] | undefined
    datatype: NamedNode | undefined
    hasValue: Term | undefined

    config: Config
    extendedShapes: NamedNode[] | undefined

    constructor(quads: Quad[], nodeId: NamedNode | BlankNode, config: Config) {
        this.config = config
        this.nodeId = nodeId
        this.merge(quads)
    }

    merge(quads: Quad[]): ShaclPropertyTemplate {
        for (const quad of quads) {
            mappers[quad.predicate.id]?.call(this, this, quad.object)
        }
        // provide best fitting label for UI
        this.label = this.name?.value || findLabel(quads, this.config.attributes.language)
        if (!this.label && !this.node && !this.shaclAnd) {
            // force label value only for non-node properties to avoid nested <h1> in UI
            this.label = this.path ? removePrefixes(this.path, this.config.prefixes) : 'unknown'
        }
        // resolve extended shapes
        if (this.node || this.shaclAnd) {
            this.extendedShapes = []
            if (this.node) {
                this.extendedShapes.push(this.node)
            }
            if (this.shaclAnd) {
                const list = this.config.lists[this.shaclAnd]
                if (list?.length) {
                    for (const node of list) {
                        this.extendedShapes.push(node as NamedNode)
                    }
                }
            }
        }
        return this
    }

    clone(): ShaclPropertyTemplate {
        const copy = Object.assign({}, this)
        copy.merge = this.merge.bind(copy)
        copy.clone = this.clone.bind(copy)
        return copy
    }
}
