import { DataFactory, Literal, NamedNode } from 'n3'
import { Term } from '@rdfjs/types'
import { PREFIX_SHACL, PREFIX_XSD, PREFIX_RDF, SHAPES_GRAPH } from './constants'
import { createInputListEntries, findInstancesOf, findLabel, isURL } from './util'
import { ShaclPropertyTemplate } from './property-template'
import css from './styles.css'

export type Editor = HTMLElement & { value: string }
export type InputListEntry = { value: Term | string, label?: string }

export abstract class Theme {
    stylesheet: CSSStyleSheet

    constructor(styles?: string) {
        let aggregatedStyles = css
        if (styles) {
            aggregatedStyles += '\n' + styles
        }
        this.stylesheet = new CSSStyleSheet()
        this.stylesheet.replaceSync(aggregatedStyles)
    }

    apply(root: HTMLFormElement) {
        // NOP
    }

    createViewer(label: string, value: Term, template: ShaclPropertyTemplate): HTMLElement {
        const viewer = document.createElement('div')
        const labelElem = document.createElement('label')
        labelElem.innerHTML = label + ':'
        if (template.description) {
            labelElem.setAttribute('title', template.description.value)
        }
        viewer.appendChild(labelElem)
        let name = value.value
        if (value instanceof NamedNode) {
            const quads = template.config.shapesGraph.getQuads(name, null, null, SHAPES_GRAPH)
            if (quads.length) {
                const s = findLabel(quads, template.config.attributes.language)
                if (s) {
                    name = s
                }
            }
        } else if (value instanceof Literal) {
            if (value.language) {
                name += '<span class="lang">@' + value.language + '</span>'
            } else if (value.datatype.value === `${PREFIX_XSD}date`) {
                name = new Date(Date.parse(value.value)).toDateString()
            } else if (value.datatype.value === `${PREFIX_XSD}dateTime`) {
                name = new Date(Date.parse(value.value)).toLocaleString()
            }
        }
        let valueElem: HTMLElement
        if (isURL(value.value)) {
            valueElem = document.createElement('a')
            valueElem.setAttribute('href', value.value)
        } else {
            valueElem = document.createElement('div')
        }
        valueElem.classList.add('d-flex')
        valueElem.innerHTML = name
        viewer.appendChild(valueElem)
        return viewer
    }
    
    abstract createListEditor(label: string, value: Term | null, required: boolean, listEntries: InputListEntry[], template?: ShaclPropertyTemplate): HTMLElement
    abstract createLangStringEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement
    abstract createTextEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement
    abstract createNumberEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement
    abstract createDateEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement
    abstract createBooleanEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement
    abstract createButton(label: string, primary: boolean): HTMLElement
}

export function toRDF(editor: Editor): Literal | NamedNode | undefined {
    let datatype = editor['shacl-datatype']
    let value: number | string = editor.value
    if (value) {
        if (editor.dataset.class || editor.dataset.nodeKind === PREFIX_SHACL + 'IRI') {
            return DataFactory.namedNode(value)
        } else {
            if (editor.dataset.lang) {
                datatype = editor.dataset.lang
            }
            else if (editor['type'] === 'number') {
                value = parseFloat(value)
            }
            return DataFactory.literal(value, datatype)
        }
    } else if (editor['type'] === 'checkbox' || editor.getAttribute('type')) {
        // emit boolean 'false' only when required
        if (editor['checked'] || parseInt(editor.dataset.minCount || '0') > 0) {
            return DataFactory.literal(editor['checked'] ? 'true' : 'false', datatype)
        }
    }
}

export function fieldFactory(template: ShaclPropertyTemplate, value: Term | null): HTMLElement {
    if (template.config.editMode) {
        const required = template.minCount !== undefined && template.minCount > 0
        // if we have a class, find the instances and display them in a list
        if (template.class) {
            return template.config.theme.createListEditor(template.label, value, required, findInstancesOf(template.class, template.config), template)
        }

        // check if it is a list
        if (template.shaclIn) {
            const list = template.config.lists[template.shaclIn]
            if (list?.length) {
                const listEntries = createInputListEntries(list, template.config.shapesGraph, template.config.attributes.language)
                return template.config.theme.createListEditor(template.label, value, required, listEntries, template)
            }
            else {
                console.error('list not found:', template.shaclIn, 'existing lists:', template.config.lists)
            }
        }

        // check if it is a langstring
        if  (template.datatype?.value === `${PREFIX_RDF}langString` || template.languageIn?.length) {
            return template.config.theme.createLangStringEditor(template.label, value, required, template)
        }

        switch (template.datatype?.value.replace(PREFIX_XSD, '')) {
            case 'integer':
            case 'float':
            case 'double':
            case 'decimal':
                return template.config.theme.createNumberEditor(template.label, value, required, template)
            case 'date':
            case 'dateTime':
                return template.config.theme.createDateEditor(template.label, value, required, template)
            case 'boolean':
                return template.config.theme.createBooleanEditor(template.label, value, required, template)
            }

        // nothing found (or datatype is 'string'), fallback to 'text'
        return template.config.theme.createTextEditor(template.label, value, required, template)
    } else {
        if (value) {
            return template.config.theme.createViewer(template.label, value, template)
        }
        const fallback = document.createElement('div')
        fallback.innerHTML = 'No value'
        return fallback
    }
}
