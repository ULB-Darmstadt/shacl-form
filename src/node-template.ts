import type { NamedNode, Quad } from 'n3'
import { Term } from '@rdfjs/types'
import { OWL_PREDICATE_IMPORTS, PREFIX_SHACL } from './constants'
import { Config } from './config'
import { mergeProperty, ShaclPropertyTemplate } from './property-template'

const mappers: Record<string, (template: ShaclNodeTemplate, term: Term) => void> = {
    [`${PREFIX_SHACL}node`]:                (template, term) => { template.extendedShapes.add(template.config.nodeShapes[term.value] || new ShaclNodeTemplate(term, template.config, template))},
    [`${PREFIX_SHACL}and`]:                 (template, term) => { for (const shape of template.config.lists[term.value]) { template.extendedShapes.add(template.config.nodeShapes[shape.value] || new ShaclNodeTemplate(shape, template.config, template)) } },
    [`${PREFIX_SHACL}property`]:            (template, term) => {
        const property = template.config.propertyShapes[term.value] || new ShaclPropertyTemplate(term, template)
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
    parent?: ShaclNodeTemplate
    nodeKind?: NamedNode
    targetClass?: NamedNode
    or?: Term[]
    xone?: Term[]
    extendedShapes: Set<ShaclNodeTemplate> = new Set()
    properties: Record<string, ShaclPropertyTemplate[]> = {} // sh:path -> sh:property
    owlImports: Set<NamedNode> = new Set()
    config: Config

    constructor(id: Term, config: Config, parent?: ShaclNodeTemplate) {
        this.id = id
        this.config = config
        this.parent = parent
        config.nodeShapes[id.value] = this
        mergeQuads(this, config.store.getQuads(id, null, null, null))
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
    const accumulatedProps: Record<string, ShaclPropertyTemplate[]> = {}
    accumulateProps(node, accumulatedProps)
    for (const [path, props] of Object.entries(accumulatedProps)) {
        // length must be greater than 1 for overridden property
        if (props.length > 1) {
            // check if property's maxCount equals 1
            let maxCountIsOne = false
            let qualifiedValueShapeAbsent = true
            for (const prop of props) {
                maxCountIsOne = maxCountIsOne || prop.maxCount === 1
                qualifiedValueShapeAbsent = qualifiedValueShapeAbsent && prop.qualifiedValueShape === undefined
            }
            if (maxCountIsOne && qualifiedValueShapeAbsent) {
                // merge properties into the last element in array and remove preceding properties
                const target = props[props.length - 1]
                for (let i = props.length - 2; i >= 0; i--) {
                    const source = props[i]
                    delete source.parent.properties[path]
                    mergeProperty(target, source)
                }
            }
        }
    }
}

function accumulateProps(node: ShaclNodeTemplate, accumulatedProps: Record<string, ShaclPropertyTemplate[]>, visited = new Set<string>()) {
    if (visited.has(node.id.value)) {
        return
    }
    visited.add(node.id.value)
    for (const [path, props] of Object.entries(node.properties)) {
        let array = accumulatedProps[path]
        if (!array) {
            array = []
            accumulatedProps[path] = array
        }
        array.push(...props)
    }
    for (const parent of node.extendedShapes) {
        accumulateProps(parent, accumulatedProps, visited)
    }
}
