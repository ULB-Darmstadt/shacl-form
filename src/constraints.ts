import { BlankNode, Literal, NamedNode, Quad } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from "./node"
import { ShaclProperty, createPropertyInstance } from "./property"
import { Config } from './config'
import { PREFIX_SHACL, RDF_PREDICATE_TYPE, SHACL_PREDICATE_CLASS, SHACL_PREDICATE_TARGET_CLASS, SHAPES_GRAPH } from './constants'
import { findLabel, removePrefixes } from './util'
import { ShaclPropertyTemplate } from './property-template'
import { Editor, InputListEntry } from './theme'


export function createShaclOrConstraint(options: Term[], context: ShaclNode | ShaclProperty, config: Config): HTMLElement {
    const constraintElement = document.createElement('div')
    constraintElement.classList.add('shacl-or-constraint')

    const optionElements: InputListEntry[] =  []
    optionElements.push({ label: '--- please choose ---', value: '' })

    if (context instanceof ShaclNode) {
        const properties: ShaclProperty[] = []
        // expect options to be shacl properties
        for (let i = 0; i < options.length; i++) {
            const property = new ShaclProperty(options[i] as NamedNode | BlankNode, config, context.nodeId)
            properties.push(property)
            optionElements.push({ label: property.template.label, value: i.toString() })
        }
        const editor = config.theme.createListEditor('Please choose', null, false, optionElements)
        const select = editor.querySelector('.editor') as Editor
        select.onchange = () => {
            if (select.value) {
                constraintElement.replaceWith(properties[parseInt(select.value)])
            }
        }
        constraintElement.appendChild(editor)
    } else {
        const values: Quad[][] = []
        for (let i = 0; i < options.length; i++) {
            const quads = config.shapesGraph.getQuads(options[i], null, null, SHAPES_GRAPH)
            if (quads.length) {
                values.push(quads)
                optionElements.push({ label: findLabel(quads, config.attributes.language) || (removePrefixes(quads[0].predicate.value, config.prefixes) + ' = ' + removePrefixes(quads[0].object.value, config.prefixes)), value: i.toString() })
            }
        }
        const editor = config.theme.createListEditor(context.template.label + '?', null, false, optionElements, context.template)
        const select = editor.querySelector('.editor') as Editor
        select.onchange = () => {
            if (select.value) {
                constraintElement.replaceWith(createPropertyInstance(context.template.clone().merge(values[parseInt(select.value)]), undefined, true))
            }
        }
        constraintElement.appendChild(editor)
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
        // value is a NamedNode or BlankNode, try to resolve sh:or by matching rdf:type of given value with sh:node or sh:class in data graph or shapes graph
        let types = template.config.dataGraph.getObjects(value, RDF_PREDICATE_TYPE, null)
        types.push(...template.config.shapesGraph.getObjects(value, RDF_PREDICATE_TYPE, SHAPES_GRAPH))

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
    console.error('couldn\'t resolve sh:or for value', value)
    return template
}