import { ShaclPropertyTemplate } from './property-template'
import { Term } from '@rdfjs/types'

export class Plugins {
    private plugins: Record<string, Plugin> = {}
    
    register(plugin: Plugin) {
        if (plugin.predicate === undefined && plugin.datatype === undefined) {
            console.warn('not registering plugin because it does neither define predicate nor datatype', plugin)
        } else {
            this.plugins[`${plugin.predicate}^${plugin.datatype}`] = plugin
        }
    }

    find(predicate: string | undefined, datatype: string | undefined): Plugin | undefined {
        let plugin = this.plugins[`${predicate}^${datatype}`]
        if (plugin) {
            return plugin
        }
        plugin = this.plugins[`${predicate}^${undefined}`]
        if (plugin) {
            return plugin
        }
        return this.plugins[`${undefined}^${datatype}`]
    }
}

export type PluginOptions = {
    predicate?: string
    datatype?: string
}

export abstract class Plugin {
    predicate: string | undefined
    datatype: string | undefined

    constructor(options: PluginOptions) {
        this.predicate = options.predicate
        this.datatype = options.datatype
    }

    abstract createInstance(template: ShaclPropertyTemplate, value?: Term): HTMLElement
}

export type ClassInstanceProvider = (clazz: string) => Promise<string>
