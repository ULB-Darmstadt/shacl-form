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

    createEditor(template: ShaclPropertyTemplate, value?: Term): HTMLElement {
        const required = template.minCount !== undefined && template.minCount > 0
        return template.config.theme.createListEditor(template.label, value || null, required, this.entries, template)
    }
}