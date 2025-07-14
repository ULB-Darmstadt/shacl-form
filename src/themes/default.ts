import { Term } from '@rdfjs/types'
import { ShaclPropertyTemplate } from "../property-template"
import { Editor, InputListEntry, Theme } from "../theme"
import { PREFIX_SHACL, PREFIX_XSD } from '../constants'
import { Literal, NamedNode } from 'n3'
import { Term as N3Term }  from 'n3'
import css from './default.css?raw'
import { RokitSelect } from '@ro-kit/ui-widgets'

export class DefaultTheme extends Theme {
    idCtr = 0

    constructor(overiddenCss?: string) {
        super(overiddenCss ? overiddenCss : css)
    }

    createDefaultTemplate(label: string, value: Term | null, required: boolean, editor: Editor, template?: ShaclPropertyTemplate): HTMLElement {
        editor.id = `e${this.idCtr++}`
        editor.classList.add('editor')
        if (template?.datatype) {
            // store datatype on editor, this is used for RDF serialization
            editor.shaclDatatype = template.datatype
        } else if (value instanceof Literal) {
            editor.shaclDatatype = value.datatype
        }
        if (template?.minCount !== undefined) {
            editor.dataset.minCount = String(template.minCount)
        }
        if (template?.class) {
            editor.dataset.class = template.class.value
        }
        if (template?.nodeKind) {
            editor.dataset.nodeKind = template.nodeKind.value
        } else if (value instanceof NamedNode) {
            editor.dataset.nodeKind = PREFIX_SHACL + 'IRI'
        }
        if (template?.hasValue || template?.readonly) {
            editor.disabled = true
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
        const editor: Editor = document.createElement('input')
        if (template.datatype?.value  === PREFIX_XSD + 'dateTime') {
            editor.type = 'datetime-local'
            // this enables seconds in dateTime input
            editor.setAttribute('step', '1')
        }
        else {
            editor.type = 'date'
        }
        editor.classList.add('pr-0')
        const result = this.createDefaultTemplate(label, null, required, editor, template)
        if (value) {
            try {
                let isoDate = new Date(value.value).toISOString()
                if (template.datatype?.value  === PREFIX_XSD + 'dateTime') {
                    isoDate = isoDate.slice(0, 19)
                } else {
                    isoDate = isoDate.slice(0, 10)
                }
                editor.value = isoDate
            } catch(ex) {
                console.error(ex, value)
            }
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
            if (template.pattern) {
                editor.pattern = template.pattern
            }
        }
    
        if (template.minLength) {
            editor.minLength = template.minLength
        }
        if (template.maxLength) {
            editor.maxLength = template.maxLength
        }
        return this.createDefaultTemplate(label, value, required, editor, template)
    }

    createLangStringEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement {
        const result = this.createTextEditor(label, value, required, template)
        const editor = result.querySelector(':scope .editor') as Editor
        let langChooser: HTMLSelectElement | HTMLInputElement
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
            langChooser.placeholder = 'lang?'
        }
        langChooser.title = 'Language of the text'
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

    createFileEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement {
        const editor = document.createElement('input')
        editor.type = 'file'
        editor.addEventListener('change', (e) => {
            if (editor.files?.length) {
                e.stopPropagation()
                const reader = new FileReader()
                reader.readAsDataURL(editor.files[0])
                reader.onload = () => {
                    (editor as Editor)['binaryData'] = btoa(reader.result as string)
                    editor.parentElement?.dispatchEvent(new Event('change', { bubbles: true }))
                }
            } else {
                (editor as Editor)['binaryData'] = undefined               
            }
        })
        return this.createDefaultTemplate(label, value, required, editor, template)
    }

    createNumberEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement {
        const editor = document.createElement('input')
        editor.type = 'number'
        editor.classList.add('pr-0')
        const min = template.minInclusive !== undefined ? template.minInclusive : template.minExclusive !== undefined ? template.minExclusive + 1 : undefined
        const max = template.maxInclusive !== undefined ? template.maxInclusive : template.maxExclusive !== undefined ? template.maxExclusive - 1 : undefined
        if (min !== undefined) {
            editor.min = String(min)
        }
        if (max !== undefined) {
            editor.max = String(max)
        }
        if (template.datatype?.value !== PREFIX_XSD + 'integer') {
            editor.step = '0.1'
        }
        return this.createDefaultTemplate(label, value, required, editor, template)
    }

    createListEditor(label: string, value: Term | null, required: boolean, listEntries: InputListEntry[], template?: ShaclPropertyTemplate): HTMLElement {
        const editor = new RokitSelect()
        editor.dense = true
        editor.clearable = true
        editor.collapse = true
        const result = this.createDefaultTemplate(label, null, required, editor, template)
        const ul = document.createElement('ul')
    
        const appendListEntry = (entry: InputListEntry, parent: HTMLUListElement) => {
            const li = document.createElement('li')
            let entryValue = ''
            if (typeof entry.value === 'string') {
                entryValue = entry.value
            } else {
                // this is needed for typed rdf literals
                entryValue = (entry.value as N3Term).id
            }
            li.innerText = entry.label ? entry.label : entryValue
            li.dataset.value = entryValue
            parent.appendChild(li)
            if (entry.children?.length) {
                const ul = document.createElement('ul')
                li.appendChild(ul)
                for (const child of entry.children) {
                    appendListEntry(child, ul)
                }
            }
        }

        for (const item of listEntries) {
            appendListEntry(item, ul)
        }

        editor.appendChild(ul)
        if (value) {
            editor.value = value.value
        }
        return result
    }

    createButton(label: string, _: boolean): HTMLElement {
        const button = document.createElement('button')
        button.type = 'button'
        button.innerHTML = label
        return button
    }
}
