import { Plugin } from '../plugin'
import { Term } from '@rdfjs/types'

import { ShaclPropertyTemplate } from '../property-template'
import { createListEditor, InputListEntry } from '../editors'

export class FixedListPlugin extends Plugin {
    entries: InputListEntry[]
    
    constructor(predicate: string, entries: InputListEntry[]) {
        super(predicate)
        this.entries = entries
    }

    createInstance(template: ShaclPropertyTemplate, value?: Term): HTMLElement {
        return createListEditor(template, this.entries, value)
    }
}