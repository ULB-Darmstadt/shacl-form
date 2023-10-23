import { Term } from '@rdfjs/types'
import { ShaclPropertyTemplate } from "../property-template"
import { Editor, InputListEntry, Theme } from "../theme"
import { PREFIX_XSD } from '../constants'
import { Literal } from 'n3'

export class NativeTheme extends Theme {
    createDate(template: ShaclPropertyTemplate, editMode: boolean, value?: Term): HTMLElement {
        const editor = document.createElement('input')
        if (template.datatype?.value  === PREFIX_XSD + 'dateTime') {
            editor.type = 'datetime-local'
        }
        else {
            editor.type = 'date'
        }
        editor.classList.add('pr-0')
        const result = this.createDefaultTemplate(template, editor)
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

    createText(template: ShaclPropertyTemplate, editMode: boolean, value?: Term): HTMLElement {
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
        return this.createDefaultTemplate(template, editor, value)
    }

    createLangString(template: ShaclPropertyTemplate, editMode: boolean, value?: Term): HTMLElement {
        const result = this.createText(template, editMode, value)
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

    createBoolean(template: ShaclPropertyTemplate, editMode: boolean, value?: Term): HTMLElement {
        const editor = document.createElement('input')
        editor.type = 'checkbox'
        editor.classList.add('ml-0')
    
        const result = this.createDefaultTemplate(template, editor, value)
    
        // 'required' on checkboxes forces the user to tick the checkbox, which is not what we want here
        editor.removeAttribute('required')
        result.querySelector(':scope label')?.classList.remove('required')
        if (value instanceof Literal) {
            editor.checked = value.value === 'true'
        }
        return result
    }

    createNumber(template: ShaclPropertyTemplate, editMode: boolean, value?: Term): HTMLElement {
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
        return this.createDefaultTemplate(template, editor, value)
    }

    createList(template: ShaclPropertyTemplate, editMode: boolean, listEntries: InputListEntry[], value?: Term): HTMLElement {
        const editor = document.createElement('select')
        const result = this.createDefaultTemplate(template, editor)
        // add an empty element
        const emptyOption = document.createElement('option')
        emptyOption.value = ''
        editor.options.add(emptyOption)
    
        for (const item of listEntries) {
            const option = document.createElement('option')
            const itemValue = (typeof item.value === 'string') ? item.value : item.value.value
            option.innerHTML = item.label ? item.label : itemValue
            option.value = itemValue
            if (value && value.value === itemValue) {
                option.selected = true
            }
            editor.options.add(option)
        }
        if (value) {
            editor.value = value.value
        }
        return result
    }
}