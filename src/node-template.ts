import type { Literal, NamedNode, Quad } from 'n3'
import { Term } from '@rdfjs/types'
import { OWL_PREDICATE_IMPORTS, PREFIX_DASH, PREFIX_DCTERMS, PREFIX_RDFS, PREFIX_SHACL, SHACL_PREDICATE_CLASS } from './constants.js'
import { Config } from './config.js'
import { mergeProperty, mergeQuads as mergePropertyQuads, propertyPathKey, ShaclPropertyTemplate } from './property-template.js'
import { prioritizeByLanguage } from './util.js'

const mappers: Record<string, (template: ShaclNodeTemplate, term: Term) => void> = {
    [`${PREFIX_SHACL}node`]: (template, term) => {
        template.extendedShapes.add(new ShaclNodeTemplate(term, template.config, template))
    },
    [`${PREFIX_SHACL}and`]: (template, term) => {
        for (const shape of template.config.lists[term.value]) {
            template.extendedShapes.add(new ShaclNodeTemplate(shape, template.config, template))
        }
    },
    [`${PREFIX_SHACL}property`]: (template, term) => {
        const property = template.config.getPropertyTemplate(term, template)
        const pathKey = propertyPathKey(property)
        if (pathKey) {
            let array = template.properties[pathKey]
            if (!array) {
                array = []
                template.properties[pathKey] = array
            }
            if (property.qualifiedValueShape) {
                array.push(property)
            } else {
                // merge properties with same path and no qualifiedValueShape into one single property
                let existingProperty: ShaclPropertyTemplate | undefined
                for (let i = 0; i < template.properties[pathKey].length && !existingProperty; i++) {
                    if (!template.properties[pathKey][i].qualifiedValueShape) {
                        existingProperty = template.properties[pathKey][i]
                    }
                }
                if (existingProperty) {
                    mergeProperty(existingProperty, property)
                } else {
                    array.push(property)
                }
            }
        }
    },
    [`${PREFIX_SHACL}nodeKind`]: (template, term) => {
        template.nodeKind = term as NamedNode
    },
    [`${PREFIX_SHACL}targetClass`]: (template, term) => {
        template.targetClass = term as NamedNode
    },
    [`${PREFIX_DASH}facet`]: (template, term) => {
        template.facet = term.value === 'true' || term.value === '1'
    },
    [`${PREFIX_SHACL}or`]: (template, term) => {
        template.or = template.config.lists[term.value]
    },
    [`${PREFIX_SHACL}xone`]: (template, term) => {
        template.xone = template.config.lists[term.value]
    },
    [OWL_PREDICATE_IMPORTS.id]: (template, term) => {
        template.owlImports.add(term as NamedNode)
    },
    [`${PREFIX_DCTERMS}title`]: (template, term) => {
        const literal = term as Literal
        template.label = prioritizeByLanguage(template.config.languages, template.label, literal)
    },
    [`${PREFIX_RDFS}label`]: (template, term) => {
        const literal = term as Literal
        template.label = prioritizeByLanguage(template.config.languages, template.label, literal)
    }
}

export class ShaclNodeTemplate {
    id: Term
    label?: Literal | undefined
    parent?: ShaclNodeTemplate | ShaclPropertyTemplate // parent is the node shape that extends this node shape or the property that conforms to this node shape
    nodeKind?: NamedNode
    targetClass?: NamedNode
    facet?: boolean
    or?: Term[]
    xone?: Term[]
    extendedShapes: Set<ShaclNodeTemplate> = new Set()
    properties: Record<string, ShaclPropertyTemplate[]> = {} // complete sh:path expression -> sh:property
    owlImports: Set<NamedNode> = new Set()
    merged = false
    config: Config

    constructor(id: Term, config: Config, parent?: ShaclNodeTemplate | ShaclPropertyTemplate) {
        this.id = id
        this.config = config
        this.parent = parent
        // register this template on config before merging quads to prevent recursion
        config.registerNodeTemplate(this)
        mergeQuads(this, this.config.store.getQuads(id, null, null, null))
    }
}

export function mergeQuads(template: ShaclNodeTemplate, quads: Quad[]) {
    for (const quad of quads) {
        mappers[quad.predicate.id]?.call(template, template, quad.object)
    }
    foldAlternativePathBranches(template)
    return template
}

// A common shapes-graph pattern combines one aggregate alternative path
// (typically carrying min/max cardinality) with one direct-path property per
// alternative (carrying the editor-specific constraints). When every
// alternative has exactly one companion without independent cardinality, fold
// those companions into the alternative property instead of rendering all
// three controls independently.
function foldAlternativePathBranches(node: ShaclNodeTemplate) {
    const alternatives = Object.values(node.properties)
        .flat()
        .filter(property => property.pathAlternatives?.length)
    const foldedDirectPaths = new Set<string>()

    for (const alternative of alternatives) {
        const branches: Record<string, ShaclPropertyTemplate> = {}
        const complete = alternative.pathAlternatives!.every(path => {
            const candidates = node.properties[path]
            if (candidates?.length !== 1 || hasIndependentCardinality(candidates[0])) {
                return false
            }
            branches[path] = candidates[0]
            return true
        })
        if (!complete) {
            continue
        }
        alternative.pathAlternativeBranches = branches
        alternative.pathAlternatives!.forEach(path => foldedDirectPaths.add(path))
    }

    for (const path of foldedDirectPaths) {
        delete node.properties[path]
    }
}

function hasIndependentCardinality(template: ShaclPropertyTemplate) {
    return template.minCount !== undefined ||
        template.maxCount !== undefined ||
        template.qualifiedMinCount !== undefined ||
        template.qualifiedMaxCount !== undefined ||
        template.qualifiedValueShape !== undefined
}

// merges overridden properties with the same sh:path on the upmost suitable parent.
// ordinary properties require sh:maxCount 1; qualified properties additionally merge when both
// their containing shapes and their qualified value shapes form matching specialization chains.
export function mergeOverriddenProperties(node: ShaclNodeTemplate) {
    if (node.merged) {
        return
    }
    node.merged = true
    for (const props of Object.values(node.properties)) {
        for (const prop of props) {
            const pathKey = propertyPathKey(prop)!
            const [chain, maxCountIsOne] = buildPropertyChain(node, pathKey)
            const hasQualifiedProperty = chain.some(property => property.qualifiedValueShape !== undefined)
            const qualifiedSpecialization = isStrictQualifiedPropertySpecializationChain(chain)
            const mayMerge = hasQualifiedProperty ? qualifiedSpecialization : maxCountIsOne
            if (chain.length > 1 && mayMerge) {
                // merge properties into the last element in array (which is the topmost in the hierarchy) and remove preceding properties
                const target = chain[chain.length - 1]
                if (qualifiedSpecialization) {
                    // the concrete overridden property shape identifies the branch the
                    // data conforms to; keep it for the query layer
                    target.queryShapePathId = chain[0].id.value
                }
                for (let i = chain.length - 2; i >= 0; i--) {
                    const source = chain[i]
                    const inheritedQualifiedShape = qualifiedSpecialization ? target.qualifiedValueShape : undefined
                    delete source.parent.properties[propertyPathKey(source)!]
                    mergeProperty(target, source, true)
                    // the more specific qualified shape already renders its inherited shape through
                    // sh:node/sh:and. keeping both in nodeShapes would render the ancestor twice.
                    if (inheritedQualifiedShape) {
                        target.nodeShapes.delete(inheritedQualifiedShape)
                    }
                }
                // an override may have pinned a concrete value-type (e.g. sh:datatype) on a property that inherited sh:xone/sh:or options.
                // narrow the options to the matching branches so the form does not keep showing options the override ruled out.
                filterMatchingOptions(target)
            }
        }
    }
}

function isStrictQualifiedPropertySpecializationChain(chain: ShaclPropertyTemplate[]): boolean {
    if (chain.length < 2) {
        return false
    }
    for (let i = 0; i < chain.length - 1; i++) {
        const child = chain[i]
        const parent = chain[i + 1]
        if (
            !child.qualifiedValueShape ||
            !parent.qualifiedValueShape ||
            !isStrictNodeShapeExtension(child.parent, parent.parent) ||
            !isStrictNodeShapeExtension(child.qualifiedValueShape, parent.qualifiedValueShape)
        ) {
            return false
        }
    }
    return true
}

function isStrictNodeShapeExtension(descendant: ShaclNodeTemplate, ancestor: ShaclNodeTemplate): boolean {
    const pending = [...descendant.extendedShapes]
    const visited = new Set<ShaclNodeTemplate>()
    while (pending.length) {
        const candidate = pending.pop()!
        if (candidate.id.equals(ancestor.id)) {
            return true
        }
        if (!visited.has(candidate)) {
            visited.add(candidate)
            pending.push(...candidate.extendedShapes)
        }
    }
    return false
}

// narrows sh:xone/sh:or alternatives on a merged property to the branches compatible with the concrete value-type constraints the property now pins
// (e.g. sh:datatype from a child override). if exactly one branch remains, its constraints are merged into the property.
// if no branch matches, retain the alternatives so an unsatisfiable override is not silently presented as valid.
function filterMatchingOptions(template: ShaclPropertyTemplate) {
    for (const key of ['xone', 'or'] as const) {
        const branches = template[key]
        if (!branches?.length) {
            continue
        }
        const matching = branches.filter((branch) => branchMatchesPinnedConstraints(branch, template))
        // only narrow when a pinned constraint actually ruled out at least one branch
        if (matching.length > 0 && matching.length < branches.length) {
            if (matching.length === 1) {
                template[key] = undefined
                mergePropertyQuads(template, template.config.store.getQuads(matching[0], null, null, null))
            } else {
                template[key] = matching
            }
        }
    }
}

function branchMatchesPinnedConstraints(branch: Term, template: ShaclPropertyTemplate): boolean {
    const branchQuads = template.config.store.getQuads(branch, null, null, null)
    return (
        constraintMatches(branchQuads, `${PREFIX_SHACL}datatype`, template.datatype) &&
        constraintMatches(branchQuads, SHACL_PREDICATE_CLASS.id, template.class) &&
        constraintMatches(branchQuads, `${PREFIX_SHACL}nodeKind`, template.nodeKind)
    )
}

// a branch is compatible with a pinned constraint if it does not declare a conflicting value:
// a branch that omits the constraint is kept; one that declares a different value is ruled out.
function constraintMatches(branchQuads: Quad[], predicate: string, pinned: NamedNode | undefined): boolean {
    if (!pinned) {
        return true
    }
    let declaredOnBranch = false
    for (const quad of branchQuads) {
        if (quad.predicate.value === predicate) {
            declaredOnBranch = true
            if (quad.object.equals(pinned)) {
                return true
            }
        }
    }
    return !declaredOnBranch
}

function buildPropertyChain(
    currentNode: ShaclNodeTemplate,
    path: string,
    visited = new Set<string>(),
    chain: ShaclPropertyTemplate[] = [],
    currentMaxCountIsOne = false
): [ShaclPropertyTemplate[], boolean] {
    if (!visited.has(currentNode.id.value)) {
        visited.add(currentNode.id.value)
        const prop = currentNode.properties[path]
        // multiple properties on the same node/path represent separate value partitions
        if (prop?.length === 1) {
            chain.push(prop[0])
            currentMaxCountIsOne = currentMaxCountIsOne || prop[0].maxCount === 1
            for (const node of prop[0].nodeShapes) {
                const [_, max] = buildPropertyChain(node, path, visited, chain, currentMaxCountIsOne)
                currentMaxCountIsOne = currentMaxCountIsOne || max
            }
        }
        for (const node of currentNode.extendedShapes) {
            const [_, max] = buildPropertyChain(node, path, visited, chain, currentMaxCountIsOne)
            currentMaxCountIsOne = currentMaxCountIsOne || max
        }
    }
    return [chain, currentMaxCountIsOne]
}
