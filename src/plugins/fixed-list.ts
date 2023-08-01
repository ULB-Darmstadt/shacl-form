import { Plugin } from '../plugin'
import { ShaclProperty } from '../property'
import { InputList, InputListEntry } from '../inputs'
import { DataFactory } from 'n3'

export class FixedListPlugin extends Plugin {
    entries: InputListEntry[] | Promise<InputListEntry[]>
    constructor(predicate: string, entries: InputListEntry[] | Promise<InputListEntry[]>) {
        super(predicate)
        this.entries = entries
    }

    createInstance(property: ShaclProperty, value?: string): InputList {
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