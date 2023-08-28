import { DataFactory, NamedNode, Literal } from 'n3'
import { Term } from '@rdfjs/types'
import { PREFIX_SHACL, PREFIX_XSD, PREFIX_RDF } from './constants'
import { createInputListEntries, findInstancesOf } from './util'
import { ShaclPropertyTemplate } from './property-template'

export type Editor = HTMLElement & { value: string }

export abstract class InputBase extends HTMLElement {
    static idCtr = 0
    template: ShaclPropertyTemplate
    editor: Editor
    required = false

    constructor(template: ShaclPropertyTemplate, value?: Term) {
        super()

        this.template = template
        this.required = this.template.minCount !== undefined && this.template.minCount > 0

        this.editor = this.createEditor()
        this.editor.id = `e${InputBase.idCtr++}`
        this.editor.setAttribute('value', template.defaultValue?.value || '')
        this.editor.classList.add('editor', 'form-control')
        // add path to editor to provide a hook to external apps
        this.editor.dataset.path = this.template.path
        this.editor.dataset.nodeId = this.template.nodeId.id
        if (value) {
            this.editor.value = value.value
        }

        const label = document.createElement('label')
        label.htmlFor = this.editor.id
        label.innerText = template.label
        if (template.description) {
            label.setAttribute('title', template.description.value)
        }

        const placeholder = template.description ? template.description.value : template.pattern ? template.pattern : null
        if (placeholder) {
            this.editor.setAttribute('placeholder', placeholder)
        }
        if (this.required) {
            this.editor.setAttribute('required', 'true')
            label.classList.add('required')
        }

        this.classList.add('prop')
        this.appendChild(label)
        this.appendChild(this.editor)
    }

    abstract createEditor(): Editor
    abstract toRDFObject(): Literal | NamedNode | undefined
}

export class InputDate extends InputBase {
    constructor(template: ShaclPropertyTemplate, value?: Term) {
        if (value) {
            let isoDate = new Date(value.value).toISOString()
            if (template.datatype?.value  === PREFIX_XSD + 'dateTime') {
                isoDate = isoDate.slice(0, 19)
            } else {
                isoDate = isoDate.slice(0, 10)
            }
            value = DataFactory.literal(isoDate, template.datatype)
        }
        super(template, value)
    }

    createEditor(): Editor {
        const input = document.createElement('input')
        if (this.template.datatype?.value  === PREFIX_XSD + 'dateTime') {
            input.type = 'datetime-local'
        }
        else {
            input.type = 'date'
        }
        input.classList.add('pr-0')
        return input
    }

    toRDFObject(): Literal | undefined {
        if (this.editor.value) {
            return DataFactory.literal(this.editor.value, this.template.datatype)
        }
        return
    }
}

export class InputText extends InputBase {
    constructor(property: ShaclPropertyTemplate, value?: Term) {
        super(property, value)

        const input = this.editor as HTMLInputElement
        if (property.minLength) {
            input.minLength = property.minLength
        }
        if (property.maxLength) {
            input.maxLength = property.maxLength
        }
        if (property.pattern) {
            input.pattern = property.pattern
        }
    }

    createEditor(): Editor {
        let input
        if (this.template.singleLine === false) {
            input = document.createElement('textarea')
            input.rows = 5
        }
        else {
            input = document.createElement('input')
            input.type = 'text'
        }
        return input
    }

    toRDFObject(): Literal | NamedNode | undefined {
        if (this.editor.value) {
            if (this.template.class || this.template.nodeKind?.id === `${PREFIX_SHACL}IRI`) {
                return DataFactory.namedNode(this.editor.value)
            } else {
                return DataFactory.literal(this.editor.value, this.template.datatype)
            }
        }
    }
}

export class InputLangString extends InputText {
    language: string | undefined
    langChooser: HTMLInputElement | HTMLSelectElement

    constructor(property: ShaclPropertyTemplate, value?: Term) {
        super(property, value)
        this.langChooser = this.createLangChooser()
        this.appendChild(this.langChooser)
        if (value instanceof Literal) {
            this.langChooser.value = value.language
        }
    }

    toRDFObject(): Literal | NamedNode | undefined {
        if (this.editor.value) {
            return DataFactory.literal(this.editor.value, this.langChooser.value ? this.langChooser.value : this.template.datatype)
        }
    }

    createLangChooser(): HTMLInputElement | HTMLSelectElement {
        let chooser
        if (this.template.languageIn?.length) {
            chooser = document.createElement('select')
            for (const lang of this.template.languageIn) {
                const option = document.createElement('option')
                option.innerText = lang.value
                chooser.appendChild(option)
            }
        } else {
            chooser = document.createElement('input')
            chooser.maxLength = 5 // e.g. en-US
        }
        chooser.title = 'Language of the text'
        chooser.placeholder = 'lang?'
        chooser.classList.add('lang-chooser')
        // if lang chooser changes, fire a change event on the text input instead. this is for shacl validation handling.
        chooser.addEventListener('change', (ev) => { ev.stopPropagation(); this.editor.dispatchEvent(new Event('change', { bubbles: true })) })
        return chooser
    }
}

export class InputBoolean extends InputBase {
    constructor(property: ShaclPropertyTemplate, value?: Term) {
        super(property)
        // 'required' on checkboxes forces the user to tick the checkbox, which is not what we want here
        this.editor.removeAttribute('required')
        this.querySelector(':scope label')?.classList.remove('required')
        if (value instanceof Literal) {
            const checkbox = this.editor as HTMLInputElement
            checkbox.checked = value.value === 'true'
        }
    }

    createEditor(): Editor {
        const input = document.createElement('input')
        input.type = 'checkbox'
        input.classList.add('ml-0')
        return input
    }

    toRDFObject(): Literal | undefined {
        const checkbox = this.editor as HTMLInputElement
        // emit 'false' only when required
        if (checkbox.checked || this.required) {
            return DataFactory.literal(checkbox.checked ? 'true' : 'false', this.template.datatype)
        }
    }
}

export class InputNumber extends InputBase {
    constructor(property: ShaclPropertyTemplate, value?: Term) {
        super(property, value)

        const input = this.editor as HTMLInputElement
        const min = property.minInclusive ? property.minInclusive : property.minExclusive ? property.minExclusive + 1 : undefined
        const max = property.maxInclusive ? property.maxInclusive : property.maxExclusive ? property.maxExclusive - 1 : undefined
        if (min) {
            input.min = String(min)
        }
        if (max) {
            input.max = String(max)
        }
        if (property.datatype?.value !== PREFIX_XSD + 'integer') {
            input.step = '0.1'
        }
    }

    createEditor(): Editor {
        const input = document.createElement('input')
        input.type = 'number'
        input.classList.add('pr-0')
        return input
    }

    toRDFObject(): Literal | undefined {
        if (this.editor.value) {
            return DataFactory.literal(parseFloat(this.editor.value), this.template.datatype)
        }
    }
}

export type InputListEntry = { value: Term, label?: string }

export class InputList extends InputBase {
    constructor(property: ShaclPropertyTemplate, listEntries: InputListEntry[] | Promise<InputListEntry[]>, value?: Term) {
        super(property)

        const select = this.editor as HTMLSelectElement
        // add an empty element
        const emptyOption = document.createElement('option')
        emptyOption.value = ''
        select.options.add(emptyOption)

        if (listEntries instanceof Promise) {
            select.disabled = true
            emptyOption.innerText = 'Loading...'
            listEntries.then(entries => {
                select.disabled = false
                emptyOption.innerText = ''
                this.setListEntries(entries, value)
            }).catch(e => {
                console.error(e)
                emptyOption.innerText = 'Loading failed'
            })
        } else {
            this.setListEntries(listEntries, value)
        }
    }

    setListEntries(list: InputListEntry[], value?: Term) {
        const select = this.editor as HTMLSelectElement
        for (const item of list) {
            const option = document.createElement('option')
            option.innerHTML = item.label ? item.label : item.value.value
            option.value = item.value.value
            if (value && value.equals(item.value)) {
                option.selected = true
            }
            select.options.add(option)
        }
        if (value) {
            select.value = value.value
        }
    }

    createEditor(): Editor {
        return document.createElement('select')
    }

    toRDFObject(): Literal | NamedNode | undefined {
        if (this.editor.value) {
            if (this.template.class || this.template.nodeKind?.id === `${PREFIX_SHACL}IRI`) {
                return DataFactory.namedNode(this.editor.value)
            } else {
                return DataFactory.literal(this.editor.value, this.template.datatype)
            }
        }
    }
}

export function inputFactory(template: ShaclPropertyTemplate, value?: Term): InputBase {
    // if we have a class, find the instances and display them in a list
    if (template.class) {
        let listEntries: InputListEntry[] | Promise<InputListEntry[]>
        if (template.config.classInstanceLoader) {
            listEntries = template.config.classInstanceLoader.loadClassInstances(template.class, template.config)
        } else {
            listEntries = findInstancesOf(template.class, template.config)
            // if (property.classInstances?.length) {
            //     listEntries = createInputListEntries(property.classInstances, property.config.shapesGraph, property.config.language)
            // } else {
            //     console.warn('class', property.class.value, 'has no instances in the shapes graph. the generated RDF triples will not validate.')
            //     listEntries = [{value: DataFactory.literal('Error')}]
            // }
        }
        
        return new InputList(template, listEntries, value)
    }

    // check if it is a list
    if (template.shaclIn) {
        const list = template.config.lists[template.shaclIn]
        if (list?.length) {
            return new InputList(template, createInputListEntries(list, template.config.shapesGraph, template.config.attributes.language), value)
        }
        else {
            console.error('list not found:', template.shaclIn, 'existing lists:', template.config.lists)
        }
    }

    // check if it a langstring
    if  (template.datatype?.value === `${PREFIX_RDF}langString` || template.languageIn?.length) {
        return new InputLangString(template, value)
    }

    switch (template.datatype?.value.replace(PREFIX_XSD, '')) {
        case 'string':
            return new InputText(template, value)
        case 'integer':
        case 'float':
        case 'double':
        case 'decimal':
            return new InputNumber(template, value)
        case 'date':
        case 'dateTime':
            return new InputDate(template, value)
        case 'boolean':
            return new InputBoolean(template, value)
        }

    // nothing found, fallback to 'text'
    return new InputText(template, value)
}

window.customElements.define('input-langstring', InputLangString)
window.customElements.define('input-date', InputDate)
window.customElements.define('input-text', InputText)
window.customElements.define('input-number', InputNumber)
window.customElements.define('input-boolean', InputBoolean)
window.customElements.define('input-list', InputList)
