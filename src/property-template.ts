import { Literal, NamedNode, Quad } from 'n3'
import { Term } from '@rdfjs/types'
import { OWL_PREDICATE_IMPORTS, PREFIX_DASH, PREFIX_OA, PREFIX_SHACL, RDF_OBJECT_LANG_STRING, SHACL_PREDICATE_CLASS, SHACL_PREDICATE_TARGET_CLASS } from './constants.js'
import { Config } from './config.js'
import { findLabel, prioritizeByLanguage, removePrefixes } from './util.js'
import { ShaclNodeTemplate } from './node-template.js'
import { prefixes } from './rdf-loader.js'

export const mappers: Record<string, (template: ShaclPropertyTemplate, term: Term) => void> = {
    [`${PREFIX_SHACL}name`]: (template, term) => {
        const literal = term as Literal; template.name = prioritizeByLanguage(template.config.languages, template.name, literal)
    },
    [`${PREFIX_SHACL}description`]: (template, term) => {
        const literal = term as Literal; template.description = prioritizeByLanguage(template.config.languages, template.description, literal)
    },
    [`${PREFIX_SHACL}path`]: (template, term) => {
        template.path = term.value
    },
    [`${PREFIX_SHACL}group`]: (template, term) => {
        template.group = (term as NamedNode).id
    },
    [`${PREFIX_SHACL}datatype`]: (template, term) => {
        template.datatype = term as NamedNode
    },
    [`${PREFIX_SHACL}nodeKind`]: (template, term) => {
        template.nodeKind = term as NamedNode
    },
    [`${PREFIX_SHACL}minCount`]: (template, term) => {
        template.minCount = parseInt(term.value)
    },
    [`${PREFIX_SHACL}maxCount`]: (template, term) => {
        template.maxCount = parseInt(term.value)
    },
    [`${PREFIX_SHACL}minLength`]: (template, term) => {
        template.minLength = parseInt(term.value)
    },
    [`${PREFIX_SHACL}maxLength`]: (template, term) => {
        template.maxLength = parseInt(term.value)
    },
    [`${PREFIX_SHACL}minInclusive`]: (template, term) => {
        template.minInclusive = parseInt(term.value)
    },
    [`${PREFIX_SHACL}maxInclusive`]: (template, term) => {
        template.maxInclusive = parseInt(term.value)
    },
    [`${PREFIX_SHACL}minExclusive`]: (template, term) => {
        template.minExclusive = parseInt(term.value)
    },
    [`${PREFIX_SHACL}maxExclusive`]: (template, term) => {
        template.maxExclusive = parseInt(term.value)
    },
    [`${PREFIX_SHACL}pattern`]: (template, term) => {
        template.pattern = term.value
    },
    [`${PREFIX_SHACL}order`]: (template, term) => {
        template.order = parseInt(term.value)
    },
    [`${PREFIX_DASH}singleLine`]: (template, term) => {
        template.singleLine = term.value === 'true'
    },
    [`${PREFIX_DASH}readonly`]: (template, term) => {
        template.readonly = term.value === 'true'
    },
    [`${PREFIX_OA}styleClass`]: (template, term) => {
        template.cssClass = term.value
    },
    [`${PREFIX_SHACL}in`]: (template, term) => {
        template.in = term.value
    },
    // sh:datatype might be undefined, but sh:languageIn defined. this is undesired. the spec says, that strings without a lang tag are not valid if sh:languageIn is set. but the shacl validator accepts these as valid. to prevent this, we just set the datatype here to 'langString'.
    [`${PREFIX_SHACL}languageIn`]: (template, term) => {
        template.languageIn = template.config.lists[term.value]; template.datatype = RDF_OBJECT_LANG_STRING
    },
    [`${PREFIX_SHACL}defaultValue`]: (template, term) => {
        template.defaultValue = term
    },
    [`${PREFIX_SHACL}hasValue`]: (template, term) => {
        template.hasValue = term
    },
    [`${PREFIX_SHACL}node`]: (template, term) => {
        template.node = term as NamedNode
        template.nodeShapes.add(template.config.getNodeTemplate(term, template))
    },
    [`${PREFIX_SHACL}and`]: (template, term) => {
        template.and = term.value
        const list = template.config.lists[template.and]
        if (list?.length) {
            for (const node of list) {
                template.nodeShapes.add(template.config.getNodeTemplate(node, template))
            }
        }
    },
    [`${PREFIX_SHACL}qualifiedValueShape`]: (template, term) => {
        const shape = template.config.getNodeTemplate(term, template)
        template.qualifiedValueShape = shape
        template.nodeShapes.add(shape)
    },
    [`${PREFIX_SHACL}qualifiedMinCount`]: (template, term) => {
        template.qualifiedMinCount = parseInt(term.value)
    },
    [`${PREFIX_SHACL}qualifiedMaxCount`]: (template, term) => {
        template.qualifiedMaxCount = parseInt(term.value)
    },
    [OWL_PREDICATE_IMPORTS.id]: (template, term) => {
        template.owlImports.add(term as NamedNode)
    },
    [SHACL_PREDICATE_CLASS.id]: (template, term) => {
        template.class = term as NamedNode
        // try to find node shape that has requested target class
        const nodeShapes = template.config.store.getSubjects(SHACL_PREDICATE_TARGET_CLASS, term, null)
        if (nodeShapes.length > 0) {
            template.node = nodeShapes[0] as NamedNode
        }
    },
    [`${PREFIX_SHACL}or`]: (template, term) => {
        const list = template.config.lists[term.value]
        if (list?.length) {
            template.or = list
        } else {
            console.error('list for sh:or not found:', term.value, 'existing lists:', template.config.lists)
        }
    },
    [`${PREFIX_SHACL}xone`]: (template, term) => {
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
    qualifiedMinCount: number | undefined
    qualifiedMaxCount: number | undefined
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
    qualifiedValueShape: ShaclNodeTemplate | undefined
    nodeShapes: Set<ShaclNodeTemplate> = new Set()
    owlImports: Set<NamedNode> = new Set()

    id: Term
    parent: ShaclNodeTemplate
    config: Config

    constructor(id: Term, parent: ShaclNodeTemplate) {
        this.id = id
        this.parent = parent
        this.config = parent.config
        // register this template on config before merging quads to prevent recursion
        this.config.registerPropertyTemplate(this)
        mergeQuads(this, this.config.store.getQuads(id, null, null, null))
    }
}

export function aggregatedMinCount(template: ShaclPropertyTemplate) {
    return Math.max(template.minCount ?? 0, template.qualifiedMinCount ?? 0)
}

export function aggregatedMaxCount(template: ShaclPropertyTemplate) {
    return Math.min(template.maxCount ?? Number.MAX_SAFE_INTEGER, template.qualifiedMaxCount ?? Number.MAX_SAFE_INTEGER)
}

export function cloneProperty(template: ShaclPropertyTemplate) {
    const copy = Object.assign({}, template)
    // arrays/sets are not cloned but referenced, so clone them manually
    copy.nodeShapes = new Set(template.nodeShapes)
    copy.owlImports = new Set(template.owlImports)
    if (template.languageIn) {
        copy.languageIn = [...template.languageIn]
    }
    if (template.or) {
        copy.or = [...template.or]
    }
    if (template.xone) {
        copy.xone = [...template.xone]
    }
    return copy
}

export function mergeQuads(template: ShaclPropertyTemplate, quads: Quad[]) {
    for (const quad of quads) {
        mappers[quad.predicate.id]?.call(template, template, quad.object)
    }
    // provide best fitting label for UI
    template.label = template.name?.value || findLabel(quads, template.config.languages)
    if (!template.label) {
        template.label = template.path ? removePrefixes(template.path, prefixes) : 'unknown'
    }
    return template
}

export function mergeProperty(target: ShaclPropertyTemplate, source: ShaclPropertyTemplate, preferSourceDisplayMetadata = false) {
    const s = source as unknown as Record<string, unknown>
    const t = target as unknown as Record<string, unknown>
    const targetNodesAreValidationOnly = hasValidationOnlyNodeShapes(target)
    const sourceNodesAreValidationOnly = hasValidationOnlyNodeShapes(source)
    const discardTargetNodes = targetNodesAreValidationOnly && hasDirectEditorConstraints(source)
    const discardSourceNodes = sourceNodesAreValidationOnly && hasDirectEditorConstraints(target)

    if (discardTargetNodes) {
        target.nodeShapes.clear()
        target.node = undefined
    }

    for (const key in source) {
        if (key !== 'parent' && key !== 'config' && key !== 'id') {
            const sourceValue = s[key]
            if (sourceValue !== undefined && sourceValue !== '') {
                if (key === 'label') {
                    // The label is recomputed from the merged sh:name below. Keeping the
                    // target here also prevents a later path fallback from replacing an
                    // earlier, explicitly selected label.
                    continue
                } else if (key === 'name' || key === 'description' || key === 'group' || key === 'order') {
                    // Display metadata is deterministic: the first declaration wins,
                    // while a later declaration may fill metadata omitted by the first.
                    // A property inherited through sh:node is different: there the
                    // more-specific source property intentionally overrides its base.
                    if (preferSourceDisplayMetadata || t[key] === undefined || t[key] === '') {
                        t[key] = sourceValue
                    }
                } else if (key === 'minCount') {
                    target.minCount = Math.max(target.minCount ?? 0, source.minCount!)
                } else if (key === 'maxCount') {
                    target.maxCount = Math.min(target.maxCount ?? Number.MAX_SAFE_INTEGER, source.maxCount!)
                } else if (key === 'qualifiedMinCount') {
                    target.qualifiedMinCount = Math.max(target.qualifiedMinCount ?? 0, source.qualifiedMinCount!)
                } else if (key === 'qualifiedMaxCount') {
                    target.qualifiedMaxCount = Math.min(target.qualifiedMaxCount ?? Number.MAX_SAFE_INTEGER, source.qualifiedMaxCount!)
                } else if (key === 'nodeShapes' && discardSourceNodes) {
                    continue
                } else if (key === 'node' && discardSourceNodes) {
                    continue
                } else if (Array.isArray(sourceValue)) {
                    const targetValue = t[key]
                    if (Array.isArray(targetValue)) {
                        targetValue.push(...sourceValue)
                    } else {
                        t[key] = [...sourceValue]
                    }
                } else if (sourceValue instanceof Set && sourceValue.size) {
                    const targetValue = t[key]
                    t[key] = new Set([...(targetValue instanceof Set ? targetValue : []), ...sourceValue])
                } else {
                    t[key] = sourceValue
                }
            }
        }
    }
    if (target.name) {
        target.label = target.name.value
    }
}

// sh:node normally describes the nested form to render. When a same-path sibling
// explicitly defines a scalar editor, however, an otherwise bare sh:node shape is
// a validation constraint and must not replace that editor with a nested form.
function hasValidationOnlyNodeShapes(template: ShaclPropertyTemplate) {
    return template.nodeShapes.size > 0 &&
        template.qualifiedValueShape === undefined &&
        template.name === undefined &&
        template.description === undefined &&
        !hasDirectEditorConstraints(template)
}

function hasDirectEditorConstraints(template: ShaclPropertyTemplate) {
    return template.in !== undefined ||
        template.datatype !== undefined ||
        template.languageIn !== undefined ||
        template.class !== undefined ||
        template.hasValue !== undefined ||
        template.defaultValue !== undefined
}
