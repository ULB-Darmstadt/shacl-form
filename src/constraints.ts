import { BlankNode, Literal, NamedNode, Quad } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from "./node"
import { ShaclProperty, createPropertyInstance } from "./property"
import { Config } from './config'
import { PREFIX_SHACL, RDF_PREDICATE_TYPE, SHAPES_GRAPH } from './constants'
import { findLabel, removePrefixes } from './util'
import { ShaclPropertyTemplate } from './property-template'


export function createShaclOrConstraint(options: Term[], context: ShaclNode | ShaclProperty, config: Config): HTMLElement {
    const constraintElement = document.createElement('div')
    constraintElement.classList.add('shacl-or-constraint')
    const label = document.createElement('label')
    label.innerHTML = 'Please choose'
    const select = document.createElement('select')
    // select.classList.add('editor')
    constraintElement.appendChild(label)
    constraintElement.appendChild(select)

    const option = document.createElement('option')
    option.value = ''
    option.innerHTML = '--- please choose ---'
    select.options.add(option)

    if (context instanceof ShaclNode) {
        const properties: ShaclProperty[] = []
        // expect options to be shacl properties
        for (let i = 0; i < options.length; i++) {
            const property = new ShaclProperty(options[i] as NamedNode | BlankNode, config, context.nodeId)
            properties.push(property)
            const option = document.createElement('option')
            option.value = i.toString()
            option.innerHTML = property.template.label
            select.options.add(option)
        }
        select.onchange = () => {
            if (select.value) {
                constraintElement.replaceWith(properties[parseInt(select.value)])
            }
        }
    } else {
        label.innerHTML = context.template.label + '?'
        const values: Quad[][] = []
        for (let i = 0; i < options.length; i++) {
            const quads = config.shapesGraph.getQuads(options[i], null, null, SHAPES_GRAPH)
            if (quads.length) {
                values.push(quads)

                const option = document.createElement('option')
                option.value = i.toString()
                option.innerHTML = findLabel(quads, config.attributes.language) || (removePrefixes(quads[0].predicate.value, config.prefixes) + ' = ' + removePrefixes(quads[0].object.value, config.prefixes))
                select.options.add(option)
            }
        }
        
        select.onchange = () => {
            if (select.value) {
                // this.replaceWith(new ShaclPropertyInstance(context.template.clone().merge(values[parseInt(select.value)]), undefined, true))
                constraintElement.replaceWith(createPropertyInstance(context.template.clone().merge(values[parseInt(select.value)]), undefined, true))
            }
        }
    }
    return constraintElement
}

export function resolveShaclOrConstraint(template: ShaclPropertyTemplate, value: Term): ShaclPropertyTemplate {
    if (!template.shaclOr) {
        console.warn('can\'t resolve sh:or because template has no options', template)
        return template
    }
    if (value instanceof Literal) {
        // value is a literal, try to match given value datatype
        const valueType = value.datatype
        for (const option of template.shaclOr) {
            const shaclOrDatatypes = template.config.shapesGraph.getObjects(option, `${PREFIX_SHACL}datatype`, SHAPES_GRAPH)
            if (shaclOrDatatypes.length && shaclOrDatatypes[0].equals(valueType)) {
                template = template.clone()
                template.datatype = shaclOrDatatypes[0] as NamedNode
                return template
            }
        }
        console.warn('couldn\'t resolve sh:or datatype for literal', value)
    } else {
        // value is a NamedNode or BlankNode
        // find rdf:type of given value. if more than one available, choose first one for now
        let types = template.config.dataGraph.getObjects(value, RDF_PREDICATE_TYPE, null)
        if (types.length > 0) {
            const type = types[0] as NamedNode
            template = template.clone()
            // try to find node shape that has requested target class
            const nodeShapes = template.config.shapesGraph.getSubjects(`${PREFIX_SHACL}targetClass`, type, SHAPES_GRAPH)
            if (nodeShapes.length > 0) {
                template.node = nodeShapes[0] as NamedNode
                // remove label since this is a node type property now
                template.label = ''
            } else {
                template.class = type
            }
        }
    }
    return template
}