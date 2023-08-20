import { Plugin } from '../plugin'
import { ShaclPropertyTemplate } from '../property-template'
import { InputList, InputListEntry } from '../inputs'

export class FixedListPlugin extends Plugin {
    entries: InputListEntry[] | Promise<InputListEntry[]>
    
    constructor(predicate: string, entries: InputListEntry[] | Promise<InputListEntry[]>) {
        super(predicate)
        this.entries = entries
    }

    createInstance(property: ShaclPropertyTemplate, value?: string): InputList {
        return new InputList(property, this.entries)
    }
}