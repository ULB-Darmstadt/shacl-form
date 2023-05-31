import { Quad, DataFactory, NamedNode, Store } from 'n3'
import { Term, Literal } from '@rdfjs/types'
import { PREFIX_SHACL, PREFIX_XSD, PREFIX_DASH, PREFIX_RDFS } from './prefixes'
import { findObjectValueByPredicate, findObjectByPredicate } from './util'
import { Config } from './config'

export type Editor = HTMLElement & { value: string }

export abstract class InputBase extends HTMLElement {
    static idCtr = 0
    config: Config
    editor: Editor
    required = false
    name = ''
    description = ''
    defaultValue = ''
    minCount = ''
    maxCount = ''
    path = ''
    pattern = ''
    dataType: NamedNode | undefined
    nodeKind: NamedNode | null = null

    constructor(quads: Quad[], config: Config) {
        super()

        this.config = config
        this.dataType = findObjectByPredicate(quads, 'datatype') as NamedNode
        this.defaultValue = findObjectValueByPredicate(quads, 'defaultValue')
        this.description = findObjectValueByPredicate(quads, 'description', PREFIX_SHACL, config.language)
        this.minCount = findObjectValueByPredicate(quads, 'minCount')
        this.maxCount = findObjectValueByPredicate(quads, 'maxCount')
        this.path = findObjectValueByPredicate(quads, 'path')
        this.pattern = findObjectValueByPredicate(quads, 'pattern')
        this.nodeKind = findObjectByPredicate(quads, 'nodeKind') as NamedNode
        this.name = findObjectValueByPredicate(quads, 'name', PREFIX_SHACL, config.language)
        if (!this.name) {
            this.name = this.path
        }
        this.required = this.minCount > '0'

        this.editor = this.createEditor(quads)
        this.editor.id = `e-${InputBase.idCtr++}`
        this.editor.setAttribute('value', this.defaultValue ? this.defaultValue : '')
        this.editor.classList.add('editor', 'form-control')
        // add path to editor to provide a hook to external apps
        this.editor.dataset.path = this.path

        const label = document.createElement('label')
        label.htmlFor = this.editor.id
        label.innerText = this.name
        if (this.description) {
            label.setAttribute('title', this.description)
        }

        const placeholder = this.description ? this.description : this.pattern ? this.pattern : null
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

    setValue(value: string) {
        this.editor.value = value
    }

    abstract createEditor(quads: Quad[]): Editor
    abstract toRDFObject(): Literal | NamedNode | undefined
}

export class InputDate extends InputBase {
    createEditor(quads: Quad[]): Editor {
        const input = document.createElement('input')
        if (this.dataType && this.dataType.value === PREFIX_XSD + 'dateTime') {
            input.type = 'datetime-local'
        }
        else {
            input.type = 'date'
        }
        return input
    }

    setValue(value: string) {
        const date = new Date(value)
        if ((this.editor as HTMLInputElement).type === 'datetime-local') {
            value = date.toISOString().slice(0, 19)
        } else {
            value = date.toISOString().slice(0, 10)
        }
        super.setValue(value)
    }

    toRDFObject(): Literal | undefined {
        if (this.editor.value) {
            return DataFactory.literal(this.editor.value, this.dataType)
        }
        return
    }
}

export class InputText extends InputBase {
    constructor(quads: Quad[], config: Config) {
        super(quads, config)

        const input = this.editor as HTMLInputElement
        const minLength = findObjectValueByPredicate(quads, 'minLength')
        if (minLength) {
            input.minLength = parseInt(minLength)
        }
        const maxLength = findObjectValueByPredicate(quads, 'maxLength')
        if (maxLength) {
            input.maxLength = parseInt(maxLength)
        }
    }

    createEditor(quads: Quad[]): Editor {
        let input
        if (findObjectValueByPredicate(quads, 'singleLine', PREFIX_DASH) === 'false') {
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
            if (this.nodeKind && this.nodeKind.id === `${PREFIX_SHACL}IRI`) {
                return DataFactory.namedNode(this.editor.value)
            } else {
                return DataFactory.literal(this.editor.value, this.dataType)
            }
        }
        return
    }
}

export class InputNumber extends InputBase {
    constructor(quads: Quad[], config: Config) {
        super(quads, config)

        const input = this.editor as HTMLInputElement
        const minExclusive = findObjectValueByPredicate(quads, 'minExclusive')
        const minInclusive = findObjectValueByPredicate(quads, 'minInclusive')
        const min = minInclusive ? minInclusive : minExclusive ? String(parseFloat(minExclusive) + 1) : undefined
        const maxExclusive = findObjectValueByPredicate(quads, 'maxExclusive')
        const maxInclusive = findObjectValueByPredicate(quads, 'maxInclusive')
        const max = maxInclusive ? maxInclusive : maxExclusive ? String(parseFloat(maxExclusive) - 1) : undefined
        if (min) {
            input.min = min
        }
        if (max) {
            input.max = max
        }
        if (this.dataType && this.dataType.value !== PREFIX_XSD + 'integer') {
            input.step = '0.1'
        }
    }

    createEditor(quads: Quad[]): Editor {
        const input = document.createElement('input')
        input.type = 'number'
        return input
    }

    toRDFObject(): Literal | undefined {
        if (this.editor.value) {
            return DataFactory.literal(parseFloat(this.editor.value), this.dataType)
        }
        return
    }
}

export type InputListEntry = Term | { label?: string, value: string }
const isTerm = (o: any): o is Term => {
    return o && typeof o.termType === "string";
}

export class InputList extends InputBase {
    constructor(quads: Quad[], config: Config) {
        super(quads, config)
    }

    setListEntries(list: InputListEntry[]) {
        const select = this.editor as HTMLSelectElement
        if (!this.required || this.config.addEmptyElementToLists !== undefined) {
            const option = document.createElement('option')
            option.value = ''
            //option.hidden = true
            select.options.add(option)
        }
        for (const item of list) {
            let label: string | null = null
            if (isTerm(item)) {
                label = item.termType === "NamedNode" ? this.findLabel(new NamedNode(item.value), this.config) : null
            } else {
                label = item.label ? item.label : null
            }
            const option = document.createElement('option')
            option.innerHTML = label ? label : item.value
            if (label && item.value) {
                option.value = item.value
            }
            select.options.add(option)
        }
    }

    findLabel(subject: NamedNode, config: Config): string | null {
        const quads = config.shapesGraph.getQuads(subject, null, null, null)
        return findObjectValueByPredicate(quads, 'label', PREFIX_RDFS, config.language)
    }

    createEditor(quads: Quad[]): Editor {
        return document.createElement('select')
    }

    toRDFObject(): Literal | NamedNode | undefined {
        if (this.editor.value) {
            if (this.nodeKind && this.nodeKind.id === `${PREFIX_SHACL}IRI`) {
                return DataFactory.namedNode(this.editor.value)
            } else {
                return DataFactory.literal(this.editor.value, this.dataType)
            }
        }

        return
    }
}

export function inputFactory(quads: Quad[], config: Config): InputBase {
    const dataType = findObjectByPredicate(quads, 'datatype') as NamedNode
    if (dataType) {
        switch (dataType.value.replace(PREFIX_XSD, '')) {
            case 'string':
                return new InputText(quads, config)
            case 'integer':
            case 'float':
            case 'double':
            case 'decimal':
                return new InputNumber(quads, config)
            case 'date':
            case 'dateTime':
                return new InputDate(quads, config)
        }
    }

    // check if it is a list
    const listSubject = findObjectValueByPredicate(quads, 'in')
    if (listSubject) {
        const list = config.lists[listSubject]
        if (list) {
            const inputList = new InputList(quads, config)
            inputList.setListEntries(list)
            return inputList
        }
        else {
            console.error('list not found:', listSubject, 'existing lists:', config.lists)
        }
    }

    // nothing found, fallback to 'text'
    return new InputText(quads, config)
}

window.customElements.define('input-date', InputDate)
window.customElements.define('input-text', InputText)
window.customElements.define('input-number', InputNumber)
window.customElements.define('input-list', InputList)
