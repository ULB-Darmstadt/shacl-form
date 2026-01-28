import { ShaclPropertyTemplate } from './property-template'
import { Term } from '@rdfjs/types'

// store plugins in module scope so that they apply to all shacl-form elements
const plugins: Record<string, Plugin> = {}

export function registerPlugin(plugin: Plugin) {
    if (plugin.predicate === undefined && plugin.datatype === undefined) {
        console.warn('not registering plugin because it does neither define "predicate" nor "datatype"', plugin)
    } else {
        plugins[`${plugin.predicate}^${plugin.datatype}`] = plugin
    }
}

export function listPlugins(): Plugin[] {
    return Object.entries(plugins).map((value: [_: string, plugin: Plugin]) => { return value[1] })
}

export function findPlugin(predicate: string | undefined, datatype: string | undefined): Plugin | undefined {
    // first try to find plugin with matching predicate and datatype
    let plugin = plugins[`${predicate}^${datatype}`]
    if (plugin) {
        return plugin
    }
    // now prefer predicate over datatype
    plugin = plugins[`${predicate}^${undefined}`]
    if (plugin) {
        return plugin
    }
    // last, try to find plugin with matching datatype
    return plugins[`${undefined}^${datatype}`]
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

/**
* @deprecated Use DataProvider instead
*/
export type ClassInstanceProvider = (clazz: string) => Promise<string>

export type DataProvider = {
    lazyLoad: boolean
    classInstances: (classes: Set<string>) => Promise<string>
    // result is expected to be a record that maps from instance id to its turtle RDF
    shapeInstances?: (shape: string) => Promise<Record<string, string>>
}
