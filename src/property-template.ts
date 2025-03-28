import { Literal, NamedNode, Quad, DataFactory } from 'n3'
import { Term } from '@rdfjs/types'
import { OWL_PREDICATE_IMPORTS, PREFIX_DASH, PREFIX_OA, PREFIX_RDF, PREFIX_SHACL, SHACL_PREDICATE_CLASS, SHACL_PREDICATE_TARGET_CLASS } from './constants'
import { Config } from './config'
import { findLabel, prioritizeByLanguage, removePrefixes } from './util'
import { ShaclNode } from './node'

const mappers: Record<string, (template: ShaclPropertyTemplate, term: Term) => void> = {
    [`${PREFIX_SHACL}name`]:         (template, term) => { const literal = term as Literal; template.name = prioritizeByLanguage(template.config.languages, template.name, literal) },
    [`${PREFIX_SHACL}description`]:  (template, term) => { const literal = term as Literal; template.description = prioritizeByLanguage(template.config.languages, template.description, literal) },
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
    [`${PREFIX_SHACL}order`]:        (template, term) => { template.order = parseInt(term.value) },
    [`${PREFIX_DASH}singleLine`]:    (template, term) => { template.singleLine = term.value === 'true' },
    [`${PREFIX_DASH}readonly`]:      (template, term) => { template.readonly = term.value === 'true' },
    [`${PREFIX_OA}styleClass`]:      (template, term) => { template.cssClass = term.value },
    [`${PREFIX_SHACL}and`]:          (template, term) => { template.shaclAnd = term.value },
    [`${PREFIX_SHACL}in`]:           (template, term) => { template.shaclIn = term.value },
    // sh:datatype might be undefined, but sh:languageIn defined. this is undesired. the spec says, that strings without a lang tag are not valid if sh:languageIn is set. but the shacl validator accepts these as valid. to prevent this, we just set the datatype here to 'langString'.
    [`${PREFIX_SHACL}languageIn`]:   (template, term) => { template.languageIn = template.config.lists[term.value]; template.datatype = DataFactory.namedNode(PREFIX_RDF + 'langString') },
    [`${PREFIX_SHACL}defaultValue`]: (template, term) => { template.defaultValue = term },
    [`${PREFIX_SHACL}hasValue`]:     (template, term) => { template.hasValue = term },
    [OWL_PREDICATE_IMPORTS.id]:   (template, term) => { template.owlImports.push(term as NamedNode) },
    [SHACL_PREDICATE_CLASS.id]:   (template, term) => {
        template.class = term as NamedNode
        // try to find node shape that has requested target class
        const nodeShapes = template.config.shapesGraph.getSubjects(SHACL_PREDICATE_TARGET_CLASS, term, null)
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
    parent: ShaclNode
    label = ''
    name: Literal | undefined
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
    readonly: boolean | undefined
    cssClass: string | undefined
    defaultValue: Term | undefined
    pattern: string | undefined
    order: number | undefined
    nodeKind: NamedNode | undefined
    shaclAnd: string | undefined
    shaclIn: string | undefined
    shaclOr: Term[] | undefined
    languageIn: Term[] | undefined
    datatype: NamedNode | undefined
    hasValue: Term | undefined
    owlImports: NamedNode[] = []

    config: Config
    extendedShapes: NamedNode[] | undefined

    constructor(quads: Quad[], parent: ShaclNode, config: Config) {
        this.parent = parent
        this.config = config
        this.merge(quads)
    }

    merge(quads: Quad[]): ShaclPropertyTemplate {
        for (const quad of quads) {
            mappers[quad.predicate.id]?.call(this, this, quad.object)
        }
        // provide best fitting label for UI
        this.label = this.name?.value || findLabel(quads, this.config.languages)
        if (!this.label && !this.shaclAnd) {
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
        // arrays are not cloned but referenced, so create them manually
        copy.owlImports = [ ...this.owlImports ]
        if (this.languageIn) {
            copy.languageIn = [ ...this.languageIn ]
        }
        if (this.shaclOr) {
            copy.shaclOr = [ ...this.shaclOr ]
        }
        copy.merge = this.merge.bind(copy)
        copy.clone = this.clone.bind(copy)
        return copy
    }
}
