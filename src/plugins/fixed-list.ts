import { Plugin } from '../plugin'
import { ShaclProperty } from '../property'
import { InputList, InputListEntry } from '../inputs'

export class FixedListPlugin extends Plugin {
    entries: InputListEntry[] | Promise<InputListEntry[]>
    constructor(predicate: string, entries: InputListEntry[] | Promise<InputListEntry[]>) {
        super(predicate)
        this.entries = entries
    }

    createInstance(property: ShaclProperty, value?: string): InputList {
        const instance = new InputList(property.quads, property.form.config)
        if (this.entries instanceof Promise) {
            this.entries.then(entries => {
                instance.setListEntries(entries)
                if (value) {
                    instance.setValue(value)
                }
            })
        } else {
            instance.setListEntries(this.entries)
        }
        return instance
    }
}