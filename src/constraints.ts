import { BlankNode, NamedNode, Quad } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from "./node"
import { ShaclPropertyInstance, ShaclProperty } from "./property"
import { Config } from './config'
import { SHAPES_GRAPH } from './constants'
import { findLabel, removeKnownPrefixes } from './util'

export class ShaclOrConstraint extends HTMLElement {

    constructor(options: Term[], context: ShaclNode | ShaclProperty, config: Config) {
        super()

        const wrapper = document.createElement('div')
        wrapper.classList.add('prop')
        const label = document.createElement('label')
        label.innerHTML = 'Please choose'
        const select = document.createElement('select')
        select.classList.add('editor')
        // this.selectContainer.classList.add('prop-instance')
        wrapper.appendChild(label)
        wrapper.appendChild(select)
        this.appendChild(wrapper)

        const option = document.createElement('option')
        option.value = ''
        option.innerHTML = '--- please choose ---'
        select.options.add(option)

        if (context instanceof ShaclNode) {
            const properties: ShaclProperty[] = []
            // expect options to be shacl properties
            for (let i = 0; i < options.length; i++) {
                const property = new ShaclProperty(options[i] as NamedNode | BlankNode, config)
                properties.push(property)
                const option = document.createElement('option')
                option.value = i.toString()
                option.innerHTML = property.spec.label
                select.options.add(option)
            }
            select.onchange = () => {
                if (select.value) {
                    this.replaceWith(properties[parseInt(select.value)])
                }
            }
        } else {
            label.innerHTML = context.spec.label + '?'
            const values: Quad[][] = []
            for (let i = 0; i < options.length; i++) {
                const quads = config.shapesGraph.getQuads(options[i], null, null, SHAPES_GRAPH)
                if (quads.length) {
                    values.push(quads)

                    const option = document.createElement('option')
                    option.value = i.toString()
                    option.innerHTML = findLabel(quads, config.language) || (removeKnownPrefixes(quads[0].predicate.value) + ' = ' + removeKnownPrefixes(quads[0].object.value))
                    select.options.add(option)
                }
            }
            
            select.onchange = () => {
                if (select.value) {
                    this.replaceWith(new ShaclPropertyInstance(context.spec.clone().merge(values[parseInt(select.value)]), undefined, true))
                }
            }
        }
    }
}

window.customElements.define('shacl-or-constraint', ShaclOrConstraint)
