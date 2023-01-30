import { ShaclProperty } from './property'
import { InputBase } from './inputs'

export type Plugins = {
    [predicate: string]: Plugin;
}

export abstract class Plugin {
    predicate: string

    constructor(predicate: string) {
        this.predicate = predicate
    }

    abstract createInstance(property: ShaclProperty, value?: string): InputBase
}