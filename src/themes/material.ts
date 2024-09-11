import { ShaclPropertyTemplate } from '../property-template'
import { Term } from '@rdfjs/types'
import { MdOutlinedTextField } from '@material/web/textfield/outlined-text-field'
import { MdFilledButton } from '@material/web/button/filled-button'
import { MdOutlinedButton } from '@material/web/button/outlined-button'
import { MdOutlinedSelect } from '@material/web/select/outlined-select'
import { MdSelectOption } from '@material/web/select/select-option'
import { MdCheckbox } from '@material/web/checkbox/checkbox'
import { Theme } from '../theme'
import { InputListEntry, Editor } from '../theme'
import { Literal } from 'n3'
import css from './material.css'
import { PREFIX_XSD } from '../constants'

export class MaterialTheme extends Theme {
    constructor() {
        super(css)
    }

    createDefaultTemplate(label: string, value: Term | null, required: boolean, editor: Editor, template?: ShaclPropertyTemplate): HTMLElement {
        editor.classList.add('editor')
        if (template?.datatype) {
            // store datatype on editor, this is used for RDF serialization
            editor['shaclDatatype'] = template.datatype
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
        if (template?.hasValue) {
            editor.disabled = true
        }
        editor.value = value?.value || template?.defaultValue?.value || ''
    
        const placeholder = template?.description ? template.description.value : template?.pattern ? template.pattern : null
        if (placeholder) {
            editor.setAttribute('placeholder', placeholder)
        }
        if (required) {
            editor.setAttribute('required', 'true')
        }
    
        const result = document.createElement('div')
        if (label) {
            const labelElem = document.createElement('label')
            labelElem.htmlFor = editor.id
            labelElem.innerText = label
            result.appendChild(labelElem)
        }
        result.appendChild(editor)
        return result
    }
    
    createTextEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement {
        const editor = new MdOutlinedTextField()
        editor.label = label
        editor.supportingText = template.description ?.value || ''
        if (template.singleLine === false) {
            editor.type = 'textarea'
            editor.rows = 5
        }
        else {
            editor.type = 'text'
            if (template.pattern) {
                editor.pattern = template.pattern
            }
        }

        return this.createDefaultTemplate('', value, required, editor, template)
    }

    createNumberEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement {
        const editor = new MdOutlinedTextField()
        editor.type = 'number'
        editor.label = label
        editor.supportingText = template.description ?.value || ''
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
        return this.createDefaultTemplate('', value, required, editor, template)
    }

    createListEditor(label: string, value: Term | null, required: boolean, listEntries: InputListEntry[], template?: ShaclPropertyTemplate): HTMLElement {
        const editor = new MdOutlinedSelect()
        editor.label = label
        editor.supportingText = template?.description?.value || template?.label || ''
        const result = this.createDefaultTemplate('', null, required, editor, template)
        let addEmptyOption = true
    
        for (const item of listEntries) {
            const option = new MdSelectOption()
            const itemValue = (typeof item.value === 'string') ? item.value : item.value.value
            const itemLabel = item.label ? item.label : itemValue
            option.value = itemValue
            if (value && value.value === itemValue) {
                option.selected = true
            }
            if (item.indent) {
                for (let i = 0; i < item.indent; i++) {
                    option.innerHTML = '&#160;&#160;' + option.innerHTML
                }
            }
            if (itemValue === '') {
                addEmptyOption = false
                option.ariaLabel = 'blank'
            }
            if (itemLabel) {
                const labelElem = document.createElement('div')
                labelElem.innerText = itemLabel
                labelElem.slot = 'headline'
                option.appendChild(labelElem)
            }
            editor.appendChild(option)
        }
        if (addEmptyOption) {
            // add an empty element
            const empty = new MdSelectOption()
            empty.ariaLabel = 'blank'
            editor.prepend(empty)
        }
        if (value) {
            editor.value = value.value
        }
        return result
    }

    createBooleanEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement {
        const editor = new MdCheckbox()
        editor.setAttribute('type', 'checkbox')
        const result = this.createDefaultTemplate('', value, required, editor, template)
        // 'required' on checkboxes forces the user to tick the checkbox, which is not what we want here
        editor.removeAttribute('required')
        if (value instanceof Literal) {
            editor.checked = value.value === 'true'
        }
        const labelElem = document.createElement('label')
        labelElem.appendChild(editor)
        labelElem.appendChild(document.createTextNode(label))
        result.appendChild(labelElem)
        return result
    }

    createDateEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement {
        return this.createTextEditor(label, value, required, template)
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

    createButton(label: string, primary: boolean): HTMLElement {
        let button
        if (primary) {
            button = new MdFilledButton()
            button.classList.add('primary')
        } else {
            button = new MdOutlinedButton()
            button.classList.add('secondary')
        }
        button.innerHTML = label
        return button
    }
}
