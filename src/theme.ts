import { Literal, NamedNode } from 'n3'
import { Term } from '@rdfjs/types'
import { PREFIX_XSD, PREFIX_RDF, SHAPES_GRAPH } from './constants'
import { createInputListEntries, findInstancesOf, findLabel, isURL } from './util'
import { ShaclPropertyTemplate } from './property-template'
import css from './styles.css'

export type Editor = HTMLElement & { value: string, type?: string, shaclDatatype?: NamedNode<string>, binaryData?: string, checked?: boolean, disabled?: boolean }
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
        let lang: HTMLElement | null = null
        if (value instanceof NamedNode) {
            const quads = template.config.shapesGraph.getQuads(name, null, null, SHAPES_GRAPH)
            if (quads.length) {
                const s = findLabel(quads, template.config.languages)
                if (s) {
                    name = s
                }
            }
        } else if (value instanceof Literal) {
            if (value.language) {
                lang = document.createElement('span')
                lang.classList.add('lang')
                lang.innerText = `@${value.language}`
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
        valueElem.innerText = name
        if (lang) {
            valueElem.appendChild(lang)
        }
        viewer.appendChild(valueElem)
        return viewer
    }
    
    abstract createListEditor(label: string, value: Term | null, required: boolean, listEntries: InputListEntry[], template?: ShaclPropertyTemplate): HTMLElement
    abstract createLangStringEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement
    abstract createTextEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement
    abstract createNumberEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement
    abstract createDateEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement
    abstract createBooleanEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement
    abstract createFileEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement
    abstract createButton(label: string, primary: boolean): HTMLElement
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
                const listEntries = createInputListEntries(list, template.config.shapesGraph, template.config.languages)
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
            case 'base64Binary':
                return template.config.theme.createFileEditor(template.label, value, required, template)
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
