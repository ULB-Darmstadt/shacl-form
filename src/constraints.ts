import { BlankNode, NamedNode, Quad } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from "./node"
import { ShaclPropertyInstance, ShaclProperty } from "./property"
import { Config } from './config'
import { SHAPES_GRAPH } from './constants'
import { addQuads, removeQuads } from './property-spec'
import { removeKnownPrefixes } from './util'

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
        option.innerHTML = '--- <i>please choose</i> ---'
        select.options.add(option)

        if (context instanceof ShaclNode) {
            const properties: ShaclProperty[] = []
            // expect options to be shacl properties
            for (let i = 0; i < options.length; i++) {
                const property = new ShaclProperty(options[i] as NamedNode | BlankNode, config)
                properties.push(property)
                const option = document.createElement('option')
                option.value = i.toString()
                option.innerHTML = property.spec.name || 'unknown'
                select.options.add(option)
            }
            select.onchange = () => {
                if (select.value) {
                    this.replaceWith(properties[parseInt(select.value)])
                }
            }
        }
        else {
            if (context.spec.name) {
                label.innerHTML = context.spec.name + '?'
            }
            const values: Quad[][] = []
            for (let i = 0; i < options.length; i++) {
                const quads = config.shapesGraph.getQuads(options[i], null, null, SHAPES_GRAPH)
                if (quads.length) {
                    values.push(quads)

                    const option = document.createElement('option')
                    option.value = i.toString()
                    option.innerHTML = removeKnownPrefixes(quads[0].predicate.value) + ' = ' + removeKnownPrefixes(quads[0].object.value)
                    select.options.add(option)
                }
            }
            
            select.onchange = () => {
                if (select.value) {
                    const quads = values[parseInt(select.value)]
                    const spec = Object.assign({}, context.spec)
                    addQuads(spec, quads)
                    this.replaceWith(new ShaclPropertyInstance(spec, undefined, true))
                    // this.dispatchEvent(new CustomEvent('shacl-or-resolved', { bubbles: false, cancelable: false, composed: true, detail: { 'quads': values[parseInt(select.value)] } }))
                }
            }
        }
    }
}

window.customElements.define('shacl-or-constraint', ShaclOrConstraint)
