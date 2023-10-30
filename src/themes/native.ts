import { Term } from '@rdfjs/types'
import { ShaclPropertyTemplate } from "../property-template"
import { Editor, InputListEntry, Theme } from "../theme"
import { PREFIX_XSD, SHAPES_GRAPH } from '../constants'
import { Literal, NamedNode } from 'n3'
import css from './native.css'
import { findLabel, isURL } from '../util'

export class NativeTheme extends Theme {
    idCtr = 0

    constructor(overiddenCss?: string) {
        super(overiddenCss ? overiddenCss : css)
    }

    createDefaultTemplate(label: string, value: Term | null, required: boolean, editor: Editor, template?: ShaclPropertyTemplate): HTMLElement {
        editor.id = `e${this.idCtr++}`
        editor.classList.add('editor')
        if (template?.datatype) {
            // store datatype on editor, this is used for RDF serialization
            editor['shacl-datatype'] = template.datatype
        }
        if (template?.minCount !== undefined) {
            editor.dataset.minCount = String(template.minCount)
        }
        if (template?.class) {
            editor.dataset.class = template.class.value
        }
        if (template?.nodeKind) {
            editor.dataset.nodeKind = template.nodeKind.value
        }
        editor.value = value?.value || template?.defaultValue?.value || ''
    
        const labelElem = document.createElement('label')
        labelElem.htmlFor = editor.id
        labelElem.innerText = label
        if (template?.description) {
            labelElem.setAttribute('title', template.description.value)
        }
    
        const placeholder = template?.description ? template.description.value : template?.pattern ? template.pattern : null
        if (placeholder) {
            editor.setAttribute('placeholder', placeholder)
        }
        if (required) {
            editor.setAttribute('required', 'true')
            labelElem.classList.add('required')
        }
    
        const result = document.createElement('div')
        result.appendChild(labelElem)
        result.appendChild(editor)
        return result
    }

    createDateEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement {
        const editor = document.createElement('input')
        if (template.datatype?.value  === PREFIX_XSD + 'dateTime') {
            editor.type = 'datetime-local'
        }
        else {
            editor.type = 'date'
        }
        editor.classList.add('pr-0')
        const result = this.createDefaultTemplate(label, null, required, editor, template)
        if (value) {
            let isoDate = new Date(value.value).toISOString()
            if (template.datatype?.value  === PREFIX_XSD + 'dateTime') {
                isoDate = isoDate.slice(0, 19)
            } else {
                isoDate = isoDate.slice(0, 10)
            }
            editor.value = isoDate
        }
        return result
    }

    createTextEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement {
        let editor
        if (template.singleLine === false) {
            editor = document.createElement('textarea')
            editor.rows = 5
        }
        else {
            editor = document.createElement('input')
            editor.type = 'text'
        }
    
        if (template.minLength) {
                editor.minLength = template.minLength
            }
        if (template.maxLength) {
            editor.maxLength = template.maxLength
        }
        if (template.pattern) {
            editor.pattern = template.pattern
        }
        return this.createDefaultTemplate(label, value, required, editor, template)
    }

    createLangStringEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement {
        const result = this.createTextEditor(label, value, required, template)
        const editor = result.querySelector(':scope .editor') as Editor
        let langChooser
        if (template.languageIn?.length) {
            langChooser = document.createElement('select')
            for (const lang of template.languageIn) {
                const option = document.createElement('option')
                option.innerText = lang.value
                langChooser.appendChild(option)
            }
        } else {
            langChooser = document.createElement('input')
            langChooser.maxLength = 5 // e.g. en-US
        }
        langChooser.title = 'Language of the text'
        langChooser.placeholder = 'lang?'
        langChooser.classList.add('lang-chooser')
        // if lang chooser changes, fire a change event on the text input instead. this is for shacl validation handling.
        langChooser.addEventListener('change', (ev) => {
            ev.stopPropagation();
            if (editor) {
                editor.dataset.lang = langChooser.value
                editor.dispatchEvent(new Event('change', { bubbles: true }))
            }
        })
        if (value instanceof Literal) {
            langChooser.value = value.language
        }
        editor.dataset.lang = langChooser.value
        editor.after(langChooser)
        return result
    }

    createBooleanEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement {
        const editor = document.createElement('input')
        editor.type = 'checkbox'
        editor.classList.add('ml-0')
    
        const result = this.createDefaultTemplate(label, null, required, editor, template)
    
        // 'required' on checkboxes forces the user to tick the checkbox, which is not what we want here
        editor.removeAttribute('required')
        result.querySelector(':scope label')?.classList.remove('required')
        if (value instanceof Literal) {
            editor.checked = value.value === 'true'
        }
        return result
    }

    createNumberEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement {
        const editor = document.createElement('input')
        editor.type = 'number'
        editor.classList.add('pr-0')
        const min = template.minInclusive ? template.minInclusive : template.minExclusive ? template.minExclusive + 1 : undefined
        const max = template.maxInclusive ? template.maxInclusive : template.maxExclusive ? template.maxExclusive - 1 : undefined
        if (min) {
            editor.min = String(min)
        }
        if (max) {
            editor.max = String(max)
        }
        if (template.datatype?.value !== PREFIX_XSD + 'integer') {
            editor.step = '0.1'
        }
        return this.createDefaultTemplate(label, value, required, editor, template)
    }

    createListEditor(label: string, value: Term | null, required: boolean, listEntries: InputListEntry[], template?: ShaclPropertyTemplate): HTMLElement {
        const editor = document.createElement('select')
        const result = this.createDefaultTemplate(label, null, required, editor, template)
        let addEmptyOption = true
    
        for (const item of listEntries) {
            const option = document.createElement('option')
            const itemValue = (typeof item.value === 'string') ? item.value : item.value.value
            option.innerHTML = item.label ? item.label : itemValue
            option.value = itemValue
            if (value && value.value === itemValue) {
                option.selected = true
            }
            if (itemValue === '') {
                addEmptyOption = false
            }
            editor.appendChild(option)
        }
        if (addEmptyOption) {
            // add an empty element
            const emptyOption = document.createElement('option')
            emptyOption.value = ''
            if (!value) {
                emptyOption.selected = true
            }
            editor.prepend(emptyOption)
        }
        if (value) {
            editor.value = value.value
        }
        return result
    }

    createButton(label: string, primary: boolean): HTMLElement {
        const button = document.createElement('button')
        button.type = 'button'
        button.innerHTML = label
        return button
    }
}
