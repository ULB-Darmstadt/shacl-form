import type { NamedNode, Quad } from 'n3'
import { Term } from '@rdfjs/types'
import { OWL_PREDICATE_IMPORTS, PREFIX_SHACL } from './constants'
import { Config } from './config'
import { mergeProperty, ShaclPropertyTemplate } from './property-template'

const mappers: Record<string, (template: ShaclNodeTemplate, term: Term) => void> = {
    [`${PREFIX_SHACL}node`]:                (template, term) => { template.extendedShapes.add(new ShaclNodeTemplate(term, template.config, template))},
    [`${PREFIX_SHACL}and`]:                 (template, term) => { for (const shape of template.config.lists[term.value]) { template.extendedShapes.add(new ShaclNodeTemplate(shape, template.config, template))}},
    [`${PREFIX_SHACL}property`]:            (template, term) => {
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
    [`${PREFIX_SHACL}nodeKind`]:            (template, term) => { template.nodeKind = term as NamedNode },
    [`${PREFIX_SHACL}targetClass`]:         (template, term) => { template.targetClass = term as NamedNode },
    [`${PREFIX_SHACL}or`]:                  (template, term) => { template.or = template.config.lists[term.value] },
    [`${PREFIX_SHACL}xone`]:                (template, term) => { template.xone = template.config.lists[term.value] },
    [OWL_PREDICATE_IMPORTS.id]:             (template, term) => { template.owlImports.add(term as NamedNode) }
}

export class ShaclNodeTemplate {
    id: Term
    parent?: ShaclNodeTemplate | ShaclPropertyTemplate // parent is the node shape that extends this node shape or the property that conforms to this node shape
    nodeKind?: NamedNode
    targetClass?: NamedNode
    or?: Term[]
    xone?: Term[]
    extendedShapes: Set<ShaclNodeTemplate> = new Set()
    properties: Record<string, ShaclPropertyTemplate[]> = {} // sh:path -> sh:property
    owlImports: Set<NamedNode> = new Set()
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
    for (const props of Object.values(node.properties)) {
        for (const prop of props) {
            if (prop.qualifiedValueShape) {
                mergeOverriddenProperties(prop.qualifiedValueShape)
            } else {
                const [tree, maxCountIsOne] = buildPropertyChain(prop, prop.path!)
                // length must be greater than 1 for overridden property
                if (tree.length > 1 && maxCountIsOne) {
                    // merge properties into the last element in array and remove preceding properties
                    const target = tree[tree.length - 1]
                    for (let i = tree.length - 2; i >= 0; i--) {
                        const source = tree[i]
                        delete source.parent.properties[source.path!]
                        // console.log('--- vertical merge', source.label, '(parent=', source.parent.id.value, ')', 'into', target, '(parent=', target.parent.id.value, ')')
                        mergeProperty(target, source)
                    }
                }
            }
        }
    }
    for (const parent of node.extendedShapes) {
        mergeOverriddenProperties(parent)
    }
}

function buildPropertyChain(property: ShaclPropertyTemplate, path: string, chain: ShaclPropertyTemplate[] = [], currentMaxCountIsOne = false, visited = new Set<string>()): [ShaclPropertyTemplate[], boolean] {
    const key = buildTemplateKey(property.id, property.parent)
    if (visited.has(key)) {
        return [chain, currentMaxCountIsOne]
    }
    visited.add(key)
    if (!property.qualifiedValueShape && property.path === path) {
        chain.push(property)
        currentMaxCountIsOne = currentMaxCountIsOne || property.maxCount === 1
    }
    for (const node of property.nodeShapes) {
        for (const parentProps of Object.values(node.properties)) {
            for (const parentProp of parentProps) {
                const [_, max] = buildPropertyChain(parentProp, path, chain, currentMaxCountIsOne, visited)
                currentMaxCountIsOne = currentMaxCountIsOne || max
            }
        }
        for (const parentShape of node.extendedShapes) {
            for (const [_, props] of Object.entries(parentShape.properties)) {
                for (const parentProp of props) {
                    const [_, max] = buildPropertyChain(parentProp, path, chain, currentMaxCountIsOne, visited)
                    currentMaxCountIsOne = currentMaxCountIsOne || max
                }
            }
        }
    }
    for (const node of property.parent.extendedShapes) {
        for (const [_, props] of Object.entries(node.properties)) {
            for (const parentProp of props) {
                const [_, max] = buildPropertyChain(parentProp, path, chain, currentMaxCountIsOne, visited)
                currentMaxCountIsOne = currentMaxCountIsOne || max
            }
        }
    }
    return [chain, currentMaxCountIsOne]
}

function buildTemplateKey(id: Term, parent?: ShaclNodeTemplate | ShaclPropertyTemplate): string {
    let key = id.value
    if (parent) {
        if (parent instanceof ShaclPropertyTemplate) {
            key += '*' + parent.id.value
        } else {
            key += '*' + buildTemplateKey(parent.id, parent.parent)
        }
    }
    return key
}
