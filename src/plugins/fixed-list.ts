import { Plugin } from '../plugin'
import { ShaclPropertySpec } from '../property-spec'
import { InputList, InputListEntry } from '../inputs'
import { DataFactory } from 'n3'

export class FixedListPlugin extends Plugin {
    entries: InputListEntry[] | Promise<InputListEntry[]>
    
    constructor(predicate: string, entries: InputListEntry[] | Promise<InputListEntry[]>) {
        super(predicate)
        this.entries = entries
    }

    createInstance(property: ShaclPropertySpec, value?: string): InputList {
        const instance = new InputList(property)
        if (this.entries instanceof Promise) {
            this.entries.then(entries => {
                instance.setListEntries(entries)
                if (value) {
                    instance.setValue(DataFactory.literal(value))
                }
            })
        } else {
            instance.setListEntries(this.entries)
        }
        return instance
    }
}