import { InputText } from '../inputs'
import { Plugin } from '../plugin'
import { ShaclProperty } from '../property'

export class MapBoxPlugin extends Plugin {
    apiKey: string

    constructor(predicate: string, apiKey: string) {
        super(predicate)
        this.apiKey = apiKey
    }

    createInstance(property: ShaclProperty, value?: string): InputText {
        const instance = new InputText(property.quads, property.form.config)
        if (value) {
            instance.setValue(value)
        }
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
