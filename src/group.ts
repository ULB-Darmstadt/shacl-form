import { PREFIX_RDFS } from './prefixes'
import { Config } from './config'
import { findObjectValueByPredicate } from './util'

export class ShaclGroup extends HTMLElement {
    constructor(groupSubject: string, config: Config) {
        super()

        this.dataset['subject'] = groupSubject

        let name = groupSubject
        const quads = config.shapesGraph.getQuads(groupSubject, null, null, null)
        const label = findObjectValueByPredicate(quads, "label", PREFIX_RDFS, config.language)
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
