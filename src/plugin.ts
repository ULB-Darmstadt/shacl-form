import { ShaclPropertyTemplate } from './property-template'
import { InputListEntry } from './editors'
import { NamedNode } from 'n3'
import { Term } from '@rdfjs/types'
import { findInstancesOf } from './util';
import { Config } from './config';
import { SHAPES_GRAPH } from './constants';

export type Plugins = {
    [predicate: string]: Plugin;
}

export abstract class Plugin {
    predicate: string

    constructor(predicate: string) {
        this.predicate = predicate
    }

    abstract createInstance(template: ShaclPropertyTemplate, value?: Term): HTMLElement
}

export type ClassInstanceProvider = (clazz: string) => Promise<string>
