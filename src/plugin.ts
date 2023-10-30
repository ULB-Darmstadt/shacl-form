import { ShaclPropertyTemplate } from './property-template'
import { Term } from '@rdfjs/types'

export class Plugins {
    private plugins: Record<string, Plugin> = {}
    
    register(plugin: Plugin) {
        if (plugin.predicate === undefined && plugin.datatype === undefined) {
            console.warn('not registering plugin because it does neither define "predicate" nor "datatype"', plugin)
        } else {
            this.plugins[`${plugin.predicate}^${plugin.datatype}`] = plugin
        }
    }

    list(): Plugin[] {
        return Object.entries(this.plugins).map((value: [_: string, plugin: Plugin]) => { return value[1] })
    }

    find(predicate: string | undefined, datatype: string | undefined): Plugin | undefined {
        // first try to find plugin with matching predicate and datatype
        let plugin = this.plugins[`${predicate}^${datatype}`]
        if (plugin) {
            return plugin
        }
        // now prefer predicate over datatype
        plugin = this.plugins[`${predicate}^${undefined}`]
        if (plugin) {
            return plugin
        }
        // last, try to find plugin with matching datatype
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
    stylesheet: CSSStyleSheet | undefined

    constructor(options: PluginOptions, css?: string) {
        this.predicate = options.predicate
        this.datatype = options.datatype
        if (css) {
            this.stylesheet = new CSSStyleSheet()
            this.stylesheet.replaceSync(css)
        }
    }

    abstract createEditor(template: ShaclPropertyTemplate, value?: Term): HTMLElement

    createViewer(template: ShaclPropertyTemplate, value: Term): HTMLElement {
        return template.config.theme.createViewer(template.label, value, template)
    }
}

export type ClassInstanceProvider = (clazz: string) => Promise<string>
