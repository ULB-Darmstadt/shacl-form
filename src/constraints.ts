import { BlankNode, NamedNode, Quad } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from "./node"
import { ShaclProperty, createPropertyInstance } from "./property"
import { Config } from './config'
import { SHAPES_GRAPH } from './constants'
import { findLabel, removePrefixes } from './util'


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
