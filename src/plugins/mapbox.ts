import { DataFactory } from 'n3'
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
        const instance = new InputText(property)
        if (value) {
            instance.setValue(DataFactory.literal(value))
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
