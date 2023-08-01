import { DataFactory, NamedNode, Literal } from 'n3'
import { Term } from '@rdfjs/types'
import { PREFIX_SHACL, PREFIX_XSD, PREFIX_DASH, SHAPES_GRAPH, PREFIX_RDF } from './constants'
import { findObjectValueByPredicate, findLabel } from './util'
import { ShaclProperty } from './property'

export type Editor = HTMLElement & { value: string }

export abstract class InputBase extends HTMLElement {
    static idCtr = 0
    property: ShaclProperty
    editor: Editor
    required = false

    constructor(property: ShaclProperty) {
        super()

        this.property = property
        this.required = this.property.minCount > 0

        this.editor = this.createEditor()
        this.editor.id = `e${InputBase.idCtr++}`
        this.editor.setAttribute('value', property.defaultValue ? property.defaultValue : '')
        this.editor.classList.add('editor', 'form-control')
        // add path to editor to provide a hook to external apps
        this.editor.dataset.path = this.property.path

        const label = document.createElement('label')
        label.htmlFor = this.editor.id
        label.innerText = property.name || property.path
        if (property.description) {
            label.setAttribute('title', property.description)
        }

        const placeholder = property.description ? property.description : property.pattern ? property.pattern : null
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

    setValue(value: Term) {
        this.editor.value = value.value
    }

    abstract createEditor(): Editor
    abstract toRDFObject(): Literal | NamedNode | undefined
}

export class InputDate extends InputBase {
    createEditor(): Editor {
        const input = document.createElement('input')
        if (this.property.datatype?.value  === PREFIX_XSD + 'dateTime') {
            input.type = 'datetime-local'
        }
        else {
            input.type = 'date'
        }
        return input
    }

    setValue(value: Term) {
        let isoDate = new Date(value.value).toISOString()
        if ((this.editor as HTMLInputElement).type === 'datetime-local') {
            isoDate = isoDate.slice(0, 19)
        } else {
            isoDate = isoDate.slice(0, 10)
        }
        super.setValue(DataFactory.literal(isoDate, this.property.datatype))
    }

    toRDFObject(): Literal | undefined {
        if (this.editor.value) {
            return DataFactory.literal(this.editor.value, this.property.datatype)
        }
        return
    }
}

export class InputText extends InputBase {

    constructor(property: ShaclProperty) {
        super(property)

        const input = this.editor as HTMLInputElement
        const minLength = findObjectValueByPredicate(this.property.quads, 'minLength')
        if (minLength) {
            input.minLength = parseInt(minLength)
        }
        const maxLength = findObjectValueByPredicate(this.property.quads, 'maxLength')
        if (maxLength) {
            input.maxLength = parseInt(maxLength)
        }
    }

    createEditor(): Editor {
        let input
        if (findObjectValueByPredicate(this.property.quads, 'singleLine', PREFIX_DASH) === 'false') {
            input = document.createElement('textarea')
            input.rows = 5
            // input.oninput = function () { this.parentNode.dataset.replicatedValue = this.value }
        }
        else {
            input = document.createElement('input')
            input.type = 'text'
        }
        return input
    }

    toRDFObject(): Literal | NamedNode | undefined {
        if (this.editor.value) {
            if (this.property.nodeKind?.id === `${PREFIX_SHACL}IRI`) {
                return DataFactory.namedNode(this.editor.value)
            } else {
                return DataFactory.literal(this.editor.value, this.property.datatype)
            }
        }
    }
}

export class InputLangString extends InputText {
    language: string | undefined
    langChooser: HTMLInputElement | HTMLSelectElement

    constructor(property: ShaclProperty) {
        super(property)
        this.langChooser = this.createLangChooser()
        this.appendChild(this.langChooser)
    }

    setValue(value: Term) {
        super.setValue(value)
        if (value instanceof Literal) {
            this.langChooser.value = value.language
        }
    }

    toRDFObject(): Literal | NamedNode | undefined {
        if (this.editor.value) {
            return DataFactory.literal(this.editor.value, this.langChooser.value ? this.langChooser.value : this.property.datatype)
        }
    }

    createLangChooser(): HTMLInputElement | HTMLSelectElement {
        let chooser
        if (this.property.languageIn?.length) {
            chooser = document.createElement('select')
            for (const lang of this.property.languageIn) {
                const option = document.createElement('option')
                option.innerText = lang.value
                chooser.appendChild(option)
            }
        } else {
            chooser = document.createElement('input')
            chooser.maxLength = 5 // e.g. en-US
        }
        chooser.title = 'Language of the text'
        chooser.placeholder = chooser.title
        chooser.classList.add('lang-chooser')
        return chooser
    }
}

export class InputNumber extends InputBase {
    constructor(property: ShaclProperty) {
        super(property)

        const input = this.editor as HTMLInputElement
        const minExclusive = findObjectValueByPredicate(property.quads, 'minExclusive')
        const minInclusive = findObjectValueByPredicate(property.quads, 'minInclusive')
        const min = minInclusive ? minInclusive : minExclusive ? String(parseFloat(minExclusive) + 1) : undefined
        const maxExclusive = findObjectValueByPredicate(property.quads, 'maxExclusive')
        const maxInclusive = findObjectValueByPredicate(property.quads, 'maxInclusive')
        const max = maxInclusive ? maxInclusive : maxExclusive ? String(parseFloat(maxExclusive) - 1) : undefined
        if (min) {
            input.min = min
        }
        if (max) {
            input.max = max
        }
        if (property.datatype?.value !== PREFIX_XSD + 'integer') {
            input.step = '0.1'
        }
    }

    createEditor(): Editor {
        const input = document.createElement('input')
        input.type = 'number'
        return input
    }

    toRDFObject(): Literal | undefined {
        if (this.editor.value) {
            return DataFactory.literal(parseFloat(this.editor.value), this.property.datatype)
        }
    }
}

export type InputListEntry = Term | { value: string, label?: string }
const isTerm = (o: any): o is Term => {
    return o && typeof o.termType === "string";
}

export class InputList extends InputBase {
    constructor(property: ShaclProperty) {
        super(property)
    }

    setListEntries(list: InputListEntry[]) {
        const select = this.editor as HTMLSelectElement
        if (!this.required || this.property.form.config.addEmptyElementToLists !== undefined) {
            const option = document.createElement('option')
            option.value = ''
            //option.hidden = true
            select.options.add(option)
        }
        for (const item of list) {
            let label: string | null = null
            if (isTerm(item)) {
                if (item.termType === "NamedNode") {
                    label = findLabel(this.property.form.config.shapesGraph.getQuads(item, null, null, SHAPES_GRAPH), this.property.form.config.language)
                }
            } else {
                label = item.label ? item.label : null
            }
            const option = document.createElement('option')
            option.innerHTML = label ? label : item.value.toString()
            if (label && item.value) {
                option.value = item.value.toString()
            }
            select.options.add(option)
        }
    }

    createEditor(): Editor {
        return document.createElement('select')
    }

    toRDFObject(): Literal | NamedNode | undefined {
        if (this.editor.value) {
            if (this.property.nodeKind?.id === `${PREFIX_SHACL}IRI`) {
                return DataFactory.namedNode(this.editor.value)
            } else {
                return DataFactory.literal(this.editor.value, this.property.datatype)
            }
        }
    }
}

export function inputFactory(property: ShaclProperty): InputBase {
    // check if it a langstring
    if  (property.datatype?.value === `${PREFIX_RDF}langString` || property.languageIn?.length) {
        return new InputLangString(property)
    }

    switch (property.datatype?.value.replace(PREFIX_XSD, '')) {
        case 'string':
            return new InputText(property)
        case 'integer':
        case 'float':
        case 'double':
        case 'decimal':
            return new InputNumber(property)
        case 'date':
        case 'dateTime':
            return new InputDate(property)
    }

    // check if it is a list
    if (property.shaclIn) {
        const list = property.form.config.lists[property.shaclIn]
        if (list) {
            const inputList = new InputList(property)
            inputList.setListEntries(list)
            return inputList
        }
        else {
            console.error('list not found:', property.shaclIn, 'existing lists:', property.form.config.lists)
        }
    }

    // nothing found, fallback to 'text'
    return new InputText(property)
}

window.customElements.define('input-langstring', InputLangString)
window.customElements.define('input-date', InputDate)
window.customElements.define('input-text', InputText)
window.customElements.define('input-number', InputNumber)
window.customElements.define('input-list', InputList)
