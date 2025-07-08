import { PREFIX_RDFS } from './constants'
import { Config } from './config'
import { findObjectValueByPredicate } from './util'

export function createShaclGroup(groupSubject: string, config: Config): HTMLElement {
    const group = document.createElement('div')
    group.dataset['subject'] = groupSubject
    group.classList.add('shacl-group')
    let name = groupSubject
    const quads = config.store.getQuads(groupSubject, null, null, null)
    const label = findObjectValueByPredicate(quads, "label", PREFIX_RDFS, config.languages)
    if (label) {
        name = label
    }
    const order = findObjectValueByPredicate(quads, "order")
    if (order) {
        group.style.order = order
    }
    const header = document.createElement('h1')
    header.innerText = name
    group.appendChild(header)

    if (config.attributes.collapse !== null) {
        group.classList.add('collapsible')
        if (config.attributes.collapse === 'open') {
            group.classList.add('open')
        }
        header.classList.add('activator')
        header.addEventListener('click', () => {
            group.classList.toggle('open')
        })

    }
    return group
}
