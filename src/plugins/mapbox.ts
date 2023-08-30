import { Term } from '@rdfjs/types'
import { Plugin } from '../plugin'
import { ShaclPropertyTemplate } from '../property-template'
import { createTextEditor } from '../editors'

export class MapBoxPlugin extends Plugin {
    apiKey: string

    constructor(predicate: string, apiKey: string) {
        super(predicate)
        this.apiKey = apiKey
    }

    createInstance(template: ShaclPropertyTemplate, value?: Term): HTMLElement {
        const instance = createTextEditor(template, value)
        const button = document.createElement('button')
        button.type = 'button'
        button.innerHTML = 'Open map...'
        button.onclick = function() {
            console.log('--- click')
        }
        instance.appendChild(button)
        return instance
    }
}
