import { PREFIX_RDFS, SHAPES_GRAPH } from './constants'
import { Config } from './config'
import { findObjectValueByPredicate } from './util'

export class ShaclGroup extends HTMLElement {
    constructor(groupSubject: string, config: Config) {
        super()

        this.dataset['subject'] = groupSubject

        let name = groupSubject
        const quads = config.shapesGraph.getQuads(groupSubject, null, null, SHAPES_GRAPH)
        const label = findObjectValueByPredicate(quads, "label", PREFIX_RDFS, config.attributes.language)
        if (label) {
            name = label
        }
        const order = findObjectValueByPredicate(quads, "order")
        if (order) {
            this.style.order = order
        }
        const header = document.createElement('h2')
        header.innerText = name
        this.appendChild(header)
    }
}

window.customElements.define('shacl-group', ShaclGroup)
