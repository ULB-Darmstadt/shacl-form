import { DataFactory, Literal, NamedNode } from 'n3'
import { Term } from '@rdfjs/types'
import { PREFIX_SHACL, PREFIX_XSD, PREFIX_RDF } from './constants'
import { createInputListEntries, findInstancesOf } from './util'
import { ShaclPropertyTemplate } from './property-template'

let idCtr = 0

export type Editor = HTMLElement & { value: string }
export type InputListEntry = { value: Term | string, label?: string }
export abstract class Theme {
    abstract createList(template: ShaclPropertyTemplate, editMode: boolean, listEntries: InputListEntry[], value?: Term): HTMLElement
    abstract createLangString(template: ShaclPropertyTemplate, editMode: boolean, value?: Term): HTMLElement
    abstract createText(template: ShaclPropertyTemplate, editMode: boolean, value?: Term): HTMLElement
    abstract createNumber(template: ShaclPropertyTemplate, editMode: boolean, value?: Term): HTMLElement
    abstract createDate(template: ShaclPropertyTemplate, editMode: boolean, value?: Term): HTMLElement
    abstract createBoolean(template: ShaclPropertyTemplate, editMode: boolean, value?: Term): HTMLElement

    createDefaultTemplate(template: ShaclPropertyTemplate, editor: Editor, value?: Term): HTMLElement {
        editor.id = `e${idCtr++}`
        editor.classList.add('editor', 'form-control')
        if (template.datatype) {
            // store datatype on editor, this is used for RDF serialization
            editor['shacl-datatype'] = template.datatype
        }
        if (template.minCount !== undefined) {
            editor.dataset.minCount = String(template.minCount)
        }
        if (template.class) {
            editor.dataset.class = template.class.value
        }
        if (template.nodeKind) {
            editor.dataset.nodeKind = template.nodeKind.value
        }
        editor.value = value?.value || template.defaultValue?.value || ''
    
        const label = document.createElement('label')
        label.htmlFor = editor.id
        label.innerText = template.label
        if (template.description) {
            label.setAttribute('title', template.description.value)
        }
    
        const placeholder = template.description ? template.description.value : template.pattern ? template.pattern : null
        if (placeholder) {
            editor.setAttribute('placeholder', placeholder)
        }
        if (template.minCount !== undefined && template.minCount > 0) {
            editor.setAttribute('required', 'true')
            label.classList.add('required')
        }
    
        const result = document.createElement('div')
        result.classList.add('property-instance')
        result.appendChild(label)
        result.appendChild(editor)
        return result
    }
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
    } else if (editor['type'] === 'checkbox') {
        // emit boolean 'false' only when required
        if (editor['checked'] || parseInt(editor.dataset.minCount || '0') > 0) {
            return DataFactory.literal(editor['checked'] ? 'true' : 'false', datatype)
        }
    }
}

export function fieldFactory(template: ShaclPropertyTemplate, value?: Term): HTMLElement {
    const editMode = template.config.editMode
    // if we have a class, find the instances and display them in a list
    if (template.class) {
        return template.config.theme.createList(template, editMode, findInstancesOf(template.class, template.config), value)
    }

    // check if it is a list
    if (template.shaclIn) {
        const list = template.config.lists[template.shaclIn]
        if (list?.length) {
            return template.config.theme.createList(template, editMode, createInputListEntries(list, template.config.shapesGraph, template.config.attributes.language), value)
        }
        else {
            console.error('list not found:', template.shaclIn, 'existing lists:', template.config.lists)
        }
    }

    // check if it is a langstring
    if  (template.datatype?.value === `${PREFIX_RDF}langString` || template.languageIn?.length) {
        return template.config.theme.createLangString(template, editMode, value)
    }

    switch (template.datatype?.value.replace(PREFIX_XSD, '')) {
        case 'string':
            return template.config.theme.createText(template, editMode, value)
        case 'integer':
        case 'float':
        case 'double':
        case 'decimal':
            return template.config.theme.createNumber(template, editMode, value)
        case 'date':
        case 'dateTime':
            return template.config.theme.createDate(template, editMode, value)
        case 'boolean':
            return template.config.theme.createBoolean(template, editMode, value)
        }

    // nothing found, fallback to 'text'
    return template.config.theme.createText(template, editMode, value)
}
