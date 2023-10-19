import { Plugin, PluginOptions } from '../plugin'
import { Term } from '@rdfjs/types'

import { ShaclPropertyTemplate } from '../property-template'
import { InputListEntry } from '../theme'

export class FixedListPlugin extends Plugin {
    entries: InputListEntry[]
    
    constructor(options: PluginOptions, entries: InputListEntry[]) {
        super(options)
        this.entries = entries
    }

    createInstance(template: ShaclPropertyTemplate, value?: Term): HTMLElement {
        return template.config.theme.createListEditor(template, this.entries, value)
    }
}