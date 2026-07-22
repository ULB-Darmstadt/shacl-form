import { PREFIX_RDFS } from './constants.js'
import { Config } from './config.js'
import { findObjectValueByPredicate } from './util.js'
import { RokitCollapsible } from '@ro-kit/ui-widgets'

export function createShaclGroup(groupSubject: string, config: Config): { element: HTMLElement, order: number } {
    let name = groupSubject
    const quads = config.store.getQuads(groupSubject, null, null, null)
    const label = findObjectValueByPredicate(quads, 'label', PREFIX_RDFS, config.languages)
    if (label) {
        name = label
    }

    let group: HTMLElement
    if (config.attributes.collapse !== null) {
        group = new RokitCollapsible()
        group.classList.add('collapsible');
        (group as RokitCollapsible).open = config.attributes.collapse === 'open';
        (group as RokitCollapsible).label = name
        group.setAttribute('part', 'group collapsible')
    } else {
        group = document.createElement('div')
        const header = document.createElement('h1')
        header.innerText = name
        header.setAttribute('part', 'group-title')
        group.appendChild(header)
        group.setAttribute('part', 'group')
    }

    group.dataset['subject'] = groupSubject
    group.classList.add('shacl-group')
    const order = parseInt(findObjectValueByPredicate(quads, 'order') ?? '') || 0
    return { element: group, order }
}
