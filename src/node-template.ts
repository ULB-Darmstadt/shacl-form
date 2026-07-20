import type { Literal, NamedNode, Quad } from 'n3'
import { Term } from '@rdfjs/types'
import { OWL_PREDICATE_IMPORTS, PREFIX_DCTERMS, PREFIX_RDFS, PREFIX_SHACL, SHACL_PREDICATE_CLASS } from './constants.js'
import { Config } from './config.js'
import { mergeProperty, mergeQuads as mergePropertyQuads, ShaclPropertyTemplate } from './property-template.js'
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
        if (property.path) {
            let array = template.properties[property.path]
            if (!array) {
                array = []
                template.properties[property.path] = array
            }
            if (property.qualifiedValueShape) {
                array.push(property)
            } else {
                // merge properties with same path and no qualifiedValueShape into one single property
                let existingProperty: ShaclPropertyTemplate | undefined
                for (let i = 0; i < template.properties[property.path].length && !existingProperty; i++) {
                    if (!template.properties[property.path][i].qualifiedValueShape) {
                        existingProperty = template.properties[property.path][i]
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
    or?: Term[]
    xone?: Term[]
    extendedShapes: Set<ShaclNodeTemplate> = new Set()
    properties: Record<string, ShaclPropertyTemplate[]> = {} // sh:path -> sh:property
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
    return template
}

// merges properties with same sh:path and no sh:qualifiedValueShape on upmost suitable parent if cardinality of merged property's sh:maxCount equals 1
export function mergeOverriddenProperties(node: ShaclNodeTemplate) {
    if (node.merged) {
        return
    }
    node.merged = true
    for (const props of Object.values(node.properties)) {
        for (const prop of props) {
            const [chain, maxCountIsOne] = buildPropertyChain(node, prop.path!)
            // length must be > 1 and maxCount = 1 for overridden property
            if (chain.length > 1 && maxCountIsOne) {
                // merge properties into the last element in array (which is the topmost in the hierarchy) and remove preceding properties
                const target = chain[chain.length - 1]
                for (let i = chain.length - 2; i >= 0; i--) {
                    const source = chain[i]
                    delete source.parent.properties[source.path!]
                    mergeProperty(target, source)
                }
                // an override may have pinned a concrete value-type (e.g. sh:datatype) on a property that inherited sh:xone/sh:or options.
                // narrow the options to the matching branches so the form does not keep showing options the override ruled out.
                filterMatchingOptions(target)
            }
        }
    }
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
        // length == 1 excludes sh:qualifiedValueShapes
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
