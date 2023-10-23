import { BlankNode, Literal, NamedNode, Quad } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from "./node"
import { ShaclProperty, createPropertyInstance } from "./property"
import { Config } from './config'
import { PREFIX_SHACL, RDF_PREDICATE_TYPE, SHACL_PREDICATE_CLASS, SHACL_PREDICATE_TARGET_CLASS, SHAPES_GRAPH } from './constants'
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
        // value is a literal, try to resolve sh:or by matching on given value datatype
        const valueType = value.datatype
        for (const subject of template.shaclOr) {
            const options = template.config.shapesGraph.getQuads(subject, null, null, SHAPES_GRAPH)
            for (const quad of options) {
                if (quad.predicate.value === `${PREFIX_SHACL}datatype` && quad.object.equals(valueType)) {
                    return template.clone().merge(options)
                }
            }
        }
    } else {
        // value is a NamedNode or BlankNode, try to resolve sh:or by matching rdf:type of given value with sh:node or sh:class
        let types = template.config.dataGraph.getObjects(value, RDF_PREDICATE_TYPE, null)
        if (types.length > 0) {
            for (const subject of template.shaclOr) {
                const options = template.config.shapesGraph.getQuads(subject, null, null, SHAPES_GRAPH)
                for (const quad of options) {
                    // try to find matching sh:node in sh:or values
                    if (quad.predicate.value === `${PREFIX_SHACL}node`) {
                        for (const type of types) {
                            if (template.config.shapesGraph.has(new Quad(quad.object, SHACL_PREDICATE_TARGET_CLASS, type, SHAPES_GRAPH))) {
                                return template.clone().merge(options)
                            }
                        }
                    }
                    // try to find matching sh:class in sh:or values
                    if (quad.predicate.equals(SHACL_PREDICATE_CLASS)) {
                        for (const type of types) {
                            if (quad.object.equals(type)) {
                                return template.clone().merge(options)
                            }
                        }
                    }
                }
            }
        }
    }
    console.warn('couldn\'t resolve sh:or for value', value)
    return template
}