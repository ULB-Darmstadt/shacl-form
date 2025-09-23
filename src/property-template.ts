import { Literal, NamedNode, Quad, DataFactory } from 'n3'
import { Term } from '@rdfjs/types'
import { OWL_PREDICATE_IMPORTS, PREFIX_DASH, PREFIX_OA, PREFIX_RDF, PREFIX_SHACL, SHACL_PREDICATE_CLASS, SHACL_PREDICATE_TARGET_CLASS } from './constants'
import { Config } from './config'
import { findLabel, prioritizeByLanguage, removePrefixes } from './util'
import { ShaclNodeTemplate } from './node-template'

const mappers: Record<string, (template: ShaclPropertyTemplate, term: Term) => void> = {
    [`${PREFIX_SHACL}name`]:         (template, term) => { const literal = term as Literal; template.name = prioritizeByLanguage(template.config.languages, template.name, literal) },
    [`${PREFIX_SHACL}description`]:  (template, term) => { const literal = term as Literal; template.description = prioritizeByLanguage(template.config.languages, template.description, literal) },
    [`${PREFIX_SHACL}path`]:         (template, term) => { template.path = term.value },
    [`${PREFIX_SHACL}node`]:         (template, term) => { template.node = term as NamedNode },
    [`${PREFIX_SHACL}group`]:        (template, term) => { template.group = (term as NamedNode).id },
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
    [`${PREFIX_SHACL}and`]:          (template, term) => { template.and = term.value },
    [`${PREFIX_SHACL}in`]:           (template, term) => { template.in = term.value },
    // sh:datatype might be undefined, but sh:languageIn defined. this is undesired. the spec says, that strings without a lang tag are not valid if sh:languageIn is set. but the shacl validator accepts these as valid. to prevent this, we just set the datatype here to 'langString'.
    [`${PREFIX_SHACL}languageIn`]:   (template, term) => { template.languageIn = template.config.lists[term.value]; template.datatype = DataFactory.namedNode(PREFIX_RDF + 'langString') },
    [`${PREFIX_SHACL}defaultValue`]: (template, term) => { template.defaultValue = term },
    [`${PREFIX_SHACL}hasValue`]:     (template, term) => { template.hasValue = term },
    [`${PREFIX_SHACL}qualifiedValueShape`]:     (template, term) => { template.qualifiedValueShape = term },
    [`${PREFIX_SHACL}qualifiedMinCount`]: (template, term) => { template.minCount = parseInt(term.value) },
    [`${PREFIX_SHACL}qualifiedMaxCount`]: (template, term) => { template.maxCount = parseInt(term.value) },
    [OWL_PREDICATE_IMPORTS.id]:      (template, term) => { template.owlImports.push(term as NamedNode) },
    [SHACL_PREDICATE_CLASS.id]:      (template, term) => {
        template.class = term as NamedNode
        // try to find node shape that has requested target class
        const nodeShapes = template.config.store.getSubjects(SHACL_PREDICATE_TARGET_CLASS, term, null)
        if (nodeShapes.length > 0) {
            template.node = nodeShapes[0] as NamedNode
        }
    },
    [`${PREFIX_SHACL}or`]:           (template, term) => {
        const list = template.config.lists[term.value]
        if (list?.length) {
            template.or = list
        } else {
            console.error('list for sh:or not found:', term.value, 'existing lists:', template.config.lists)
        }
    },
    [`${PREFIX_SHACL}xone`]:           (template, term) => {
        const list = template.config.lists[term.value]
        if (list?.length) {
            template.xone = list
        } else {
            console.error('list for sh:xone not found:', term.value, 'existing lists:', template.config.lists)
        }
    }
}

export class ShaclPropertyTemplate {
    label = ''
    name: Literal | undefined
    description: Literal | undefined
    path: string | undefined
    node: NamedNode | undefined
    group: string | undefined
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
    and: string | undefined
    in: string | undefined
    or: Term[] | undefined
    xone: Term[] | undefined
    languageIn: Term[] | undefined
    datatype: NamedNode | undefined
    hasValue: Term | undefined
    qualifiedValueShape: Term | undefined
    owlImports: NamedNode[] = []
    extendedShapes: ShaclNodeTemplate[]  = []

    parent: ShaclNodeTemplate
    config: Config

    constructor(id: Term, parent: ShaclNodeTemplate) {
        this.parent = parent
        this.config = parent.config
        this.config.propertyShapes[id.value] = this
        mergeQuads(this, this.config.store.getQuads(id, null, null, null))
        if (this.qualifiedValueShape) {
            mergeQuads(this, this.config.store.getQuads(this.qualifiedValueShape, null, null, null))
        }
    }
}

export function cloneProperty(template: ShaclPropertyTemplate) {
    const copy = Object.assign({}, template)
    // arrays are not cloned but referenced, so create them manually
    copy.extendedShapes = [ ...template.extendedShapes ]
    copy.owlImports = [ ...template.owlImports ]
    if (template.languageIn) {
        copy.languageIn = [ ...template.languageIn ]
    }
    if (template.or) {
        copy.or = [ ...template.or ]
    }
    if (template.xone) {
        copy.xone = [ ...template.xone ]
    }
    return copy
}

export function mergeQuads(template: ShaclPropertyTemplate, quads: Quad[]) {
    for (const quad of quads) {
        mappers[quad.predicate.id]?.call(template, template, quad.object)
    }
    // provide best fitting label for UI
    template.label = template.name?.value || findLabel(quads, template.config.languages)
    if (!template.label && !template.and) {
        template.label = template.path ? removePrefixes(template.path, template.config.prefixes) : 'unknown'
    }
    // register extended shapes
    if (template.node) {
        template.extendedShapes.push(template.config.nodeShapes[template.node.value] || new ShaclNodeTemplate(template.node, template.config))
    }
    if (template.and) {
        const list = template.config.lists[template.and]
        if (list?.length) {
            for (const node of list) {
                template.extendedShapes.push(template.config.nodeShapes[node.value] || new ShaclNodeTemplate(node, template.config))
            }
        }
    }
    return template
}

export function mergeProperty(target: ShaclPropertyTemplate, source: ShaclPropertyTemplate) {
    const s = source as Record<string, any>
    const t = target as Record<string, any>
    for (const key in source) {
        if (key !== 'parent' && key !== 'config') {
            if (Array.isArray(s[key])) {
                t[key].push(...s[key])
            } else {
                t[key] = s[key]
            }
        }
    }
}
