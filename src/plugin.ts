import { ShaclPropertySpec } from './property-spec'
import { InputBase } from './inputs'

export type Plugins = {
    [predicate: string]: Plugin;
}

export abstract class Plugin {
    predicate: string

    constructor(predicate: string) {
        this.predicate = predicate
    }

    abstract createInstance(property: ShaclPropertySpec, value?: string): InputBase
}