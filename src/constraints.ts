import { BlankNode, NamedNode, Quad } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from "./node"
import { ShaclProperty, createPropertyInstance } from "./property"
import { Config } from './config'
import { PREFIX_SHACL, RDF_PREDICATE_TYPE, SHACL_PREDICATE_CLASS, SHACL_PREDICATE_TARGET_CLASS, SHACL_PREDICATE_NODE_KIND, SHACL_OBJECT_IRI, SHACL_PREDICATE_PROPERTY, SHACL_PREDICATE_NODE } from './constants'
import { findLabel, removePrefixes } from './util'
import { Editor, InputListEntry } from './theme'
import { cloneProperty, mergeQuads } from './property-template'
import { prefixes } from './loader'


export function createShaclOrConstraint(options: Term[], context: ShaclNode | ShaclProperty, config: Config): HTMLElement {
    const constraintElement = document.createElement('div')
    constraintElement.classList.add('shacl-or-constraint')
    constraintElement.setAttribute('part', 'constraint')

    const optionElements: InputListEntry[] = []

    if (context instanceof ShaclNode) {
        const properties: ShaclProperty[][] = []
        // options can be shacl properties or blank nodes referring to (list of) properties
        let optionsAreReferencedProperties = false
        if (options.length) {
            optionsAreReferencedProperties = config.store.countQuads(options[0], SHACL_PREDICATE_PROPERTY, null, null) > 0
        }
        for (let i = 0; i < options.length; i++) {
            if (optionsAreReferencedProperties) {
                const quads = config.store.getObjects(options[i] , SHACL_PREDICATE_PROPERTY, null)
                // option can be single property or list of properties
                const list: ShaclProperty[] = []
                let combinedText = ''
                for (const subject of quads) {
                    const template = config.getPropertyTemplate(subject, context.template)
                    const property = new ShaclProperty(template, context)
                    list.push(property)
                    combinedText += (combinedText.length > 1 ? ' / ' : '') + property.template.label
                }
                properties.push(list)
                optionElements.push({ label: combinedText, value: i.toString() })
            } else {
                const subject = options[i] as NamedNode | BlankNode
                const template = config.getPropertyTemplate(subject, context.template)
                const property = new ShaclProperty(template, context)
                properties.push([property])
                optionElements.push({ label: property.template.label, value: i.toString() })
            }
        }
        const editor = config.theme.createListEditor('Please choose', null, false, optionElements)
        editor.setAttribute('part', 'constraint-editor')
        const select = editor.querySelector('.editor') as Editor
        select.onchange = () => {
            if (select.value) {
                const selectedOptions = properties[parseInt(select.value)]
                let lastAddedProperty: ShaclProperty
                if (selectedOptions.length) {
                    lastAddedProperty = selectedOptions[0]
                    constraintElement.replaceWith(selectedOptions[0])
                }
                for (let i = 1; i < selectedOptions.length; i++) {
                    lastAddedProperty!.after(selectedOptions[i])
                    lastAddedProperty = selectedOptions[i]
                }
            }
        }
        constraintElement.appendChild(editor)
    } else {
        const values: Quad[][] = []
        for (let i = 0; i < options.length; i++) {
            const quads = config.store.getQuads(options[i], null, null, null)
            if (quads.length) {
                values.push(quads)
                let label = findLabel(quads, config.languages)
                if (!label) {
                    // try sh:name as fallback for label
                    for (const quad of quads) {
                        if (quad.predicate.value === `${PREFIX_SHACL}name`) {
                            label = quad.object.value
                            break
                        }
                    }
                }
                // if no label found, but one of the quads has a sh:node predicate, try to find the label for the referenced node shape
                if (!label) {
                    for (const quad of quads) {
                        if (quad.predicate.equals(SHACL_PREDICATE_NODE)) {
                            label = findLabel(config.store.getQuads(quad.object, null, null, null), config.languages)
                        }
                    }
                }
                optionElements.push({ label: label || (removePrefixes(quads[0].predicate.value, prefixes) + ' = ' + removePrefixes(quads[0].object.value, prefixes)), value: i.toString() })
            }
        }
        const editor = config.theme.createListEditor(context.template.label + '?', null, false, optionElements, context.template)
        editor.setAttribute('part', 'constraint-editor')
        const select = editor.querySelector('.editor') as Editor
        select.onchange = async () => {
            if (select.value) {
                const merged = mergeQuads(cloneProperty(context.template), values[parseInt(select.value)])
                const instance = await createPropertyInstance(merged, undefined, true)
                constraintElement.replaceWith(instance)
            }
        }
        constraintElement.appendChild(editor)
    }

    return constraintElement
}

export function resolveShaclOrConstraintOnProperty(subjects: Term[], value: Term, config: Config): Quad[] {
    if (value.termType === 'Literal') {
        // value is a literal, try to resolve sh:or/sh:xone by matching on given value datatype
        const valueType = value.datatype
        for (const subject of subjects) {
            const options = config.store.getQuads(subject, null, null, null)
            for (const quad of options) {
                if (quad.predicate.value === `${PREFIX_SHACL}datatype` && quad.object.equals(valueType)) {
                    return options
                }
            }
        }
    } else {
        // value is a NamedNode or BlankNode, try to resolve sh:or/sh:xone by matching rdf:type of given value with sh:node or sh:class in data graph or shapes graph
        const types = config.store.getObjects(value, RDF_PREDICATE_TYPE, null)
        for (const subject of subjects) {
            const options = config.store.getQuads(subject, null, null, null)
            for (const quad of options) {
                if (types.length > 0) {
                    // try to find matching sh:node in sh:or/sh:xone values
                    if (quad.predicate.value === `${PREFIX_SHACL}node`) {
                        for (const type of types) {
                            if (config.store.getQuads(quad.object, SHACL_PREDICATE_TARGET_CLASS, type, null).length > 0) {
                                return options
                            }
                        }
                    }
                    // try to find matching sh:class in sh:or/sh:xone values
                    if (quad.predicate.equals(SHACL_PREDICATE_CLASS)) {
                        for (const type of types) {
                            if (quad.object.equals(type)) {
                                return options
                            }
                        }
                    }
                } else if (quad.predicate.equals(SHACL_PREDICATE_NODE_KIND) && quad.object.equals(SHACL_OBJECT_IRI)) {
                    // if sh:nodeKind is sh:IRI, just use that
                    return options
                }
            }
        }
    }
    console.error('couldn\'t resolve sh:or/sh:xone on property for value', value)
    return []
}

export function resolveShaclOrConstraintOnNode(subjects: Term[], value: Term, config: Config): Term[] {
    for (const subject of subjects) {
        let subjectMatches = false
        const propertySubjects = config.store.getObjects(subject, SHACL_PREDICATE_PROPERTY, null)
        for (const propertySubject of propertySubjects) {
            const paths = config.store.getObjects(propertySubject, `${PREFIX_SHACL}path`, null)
            for (const path of paths) {
                // this allows partial matches in data or shapes graph on properties
                subjectMatches = config.store.countQuads(value, path, null, null) > 0
                if (subjectMatches) {
                    break
                }
            }
        }
        if (subjectMatches) {
            return propertySubjects
        }
    }

    console.error('couldn\'t resolve sh:or/sh:xone on node for value', value)
    return []
}
