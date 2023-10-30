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

export class MaterialTheme extends Theme {
    constructor() {
        super(css)
    }

    createDefaultTemplate(label: string, value: Term | null, required: boolean, editor: Editor, template?: ShaclPropertyTemplate): HTMLElement {
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
    
        const placeholder = template?.description ? template.description.value : template?.pattern ? template.pattern : null
        if (placeholder) {
            editor.setAttribute('placeholder', placeholder)
        }
        if (required) {
            editor.setAttribute('required', 'true')
        }
    
        const result = document.createElement('div')
        result.appendChild(editor)
        return result
    }
    
    createTextEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement {
        const editor = new MdOutlinedTextField()
        editor.label = label
        editor.supportingText = template.description ?.value || ''
        return this.createDefaultTemplate(label, value, required, editor, template)
    }

    createNumberEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement {
        const editor = new MdOutlinedTextField()
        editor.type = 'number'
        editor.label = label
        editor.supportingText = template.description ?.value || ''
        return this.createDefaultTemplate(label, value, required, editor, template)
    }

    createListEditor(label: string, value: Term | null, required: boolean, listEntries: InputListEntry[], template?: ShaclPropertyTemplate): HTMLElement {
        const editor = new MdOutlinedSelect()
        editor.supportingText = template?.description?.value || template?.label || ''
        const result = this.createDefaultTemplate(label, null, required, editor, template)
        let addEmptyOption = true
    
        for (const item of listEntries) {
            const option = new MdSelectOption()
            const itemValue = (typeof item.value === 'string') ? item.value : item.value.value
            const itemLabel = item.label ? item.label : itemValue
            option.value = itemValue
            if (value && value.value === itemValue) {
                option.selected = true
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
        const result = this.createDefaultTemplate(label, value, required, editor, template)
        // 'required' on checkboxes forces the user to tick the checkbox, which is not what we want here
        editor.removeAttribute('required')
        if (value instanceof Literal) {
            editor.checked = value.value === 'true'
        }
        return result
    }

    createDateEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement {
        return this.createTextEditor(label, value, required, template)
    }

    createLangStringEditor(label: string, value: Term | null, required: boolean, template: ShaclPropertyTemplate): HTMLElement {
        return this.createTextEditor(label, value, required, template)
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
