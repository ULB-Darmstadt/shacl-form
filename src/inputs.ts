import { Quad, DataFactory, NamedNode, Store } from 'n3'
import { Term, Literal } from '@rdfjs/types'
import { PREFIX_SHACL, PREFIX_XSD, PREFIX_DASH, PREFIX_RDFS } from './prefixes'
import { findObjectValueByPredicate, findObjectByPredicate } from './util'
import { Config } from './config'

export abstract class InputBase extends HTMLElement {
    static idCtr = 0
    editor: HTMLElement
    required: boolean
    name: string
    description: string
    defaultValue: string
    minCount: string
    maxCount: string
    path: string
    pattern: string
    dataType: NamedNode
    nodeKind: NamedNode

    constructor(quads: Quad[], language: string | null, dataType: NamedNode) {
        super()

        this.dataType = dataType
        this.defaultValue = findObjectValueByPredicate(quads, 'defaultValue')
        this.description = findObjectValueByPredicate(quads, 'description', PREFIX_SHACL, language)
        this.minCount = findObjectValueByPredicate(quads, 'minCount')
        this.maxCount = findObjectValueByPredicate(quads, 'maxCount')
        this.path = findObjectValueByPredicate(quads, 'path')
        this.pattern = findObjectValueByPredicate(quads, 'pattern')
        this.nodeKind = findObjectByPredicate(quads, 'nodeKind') as NamedNode
        this.name = findObjectValueByPredicate(quads, 'name', PREFIX_SHACL, language)
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

    setValue(value: any) {
        this.editor['value'] = value
    }

    abstract createEditor(quads: Quad[]): HTMLElement
    abstract toRDFObject(): Literal | NamedNode | undefined
}

export class InputDate extends InputBase {
    constructor(quads: Quad[], language: string | null, dataType: NamedNode) {
        super(quads, language, dataType)
    }

    createEditor(quads: Quad[]): HTMLElement {
        const input = document.createElement('input')
        if (this.dataType.value === PREFIX_XSD + 'dateTime') {
            input.type = 'datetime-local'
        }
        else {
            input.type = 'date'
        }
        return input
    }

    toRDFObject(): Literal | undefined {
        const value = (this.editor as HTMLInputElement).value
        if (value) {
            return DataFactory.literal(value, this.dataType)
        }
        return
    }
}

export class InputText extends InputBase {
    constructor(quads: Quad[], language: string | null, dataType: NamedNode) {
        super(quads, language, dataType)

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

    createEditor(quads: Quad[]): HTMLElement {
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
        const value = (this.editor as HTMLInputElement).value
        if (value) {
            if (this.nodeKind && this.nodeKind.id === `${PREFIX_SHACL}IRI`) {
                return DataFactory.namedNode(value)
            } else {
                return DataFactory.literal(value, this.dataType)
            }
        }
        return
    }
}

export class InputNumber extends InputBase {
    constructor(quads: Quad[], language: string | null, dataType: NamedNode) {
        super(quads, language, dataType)

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

    createEditor(quads: Quad[]): HTMLElement {
        const input = document.createElement('input')
        input.type = 'number'
        return input
    }

    toRDFObject(): Literal | undefined {
        const value = (this.editor as HTMLInputElement).value
        if (value) {
            return DataFactory.literal(parseFloat(value), this.dataType)
        }

        return
    }
}

export class InputList extends InputBase {
    constructor(quads: Quad[], language: string | null, dataType: NamedNode, list: Term[], config: Config) {
        super(quads, language, dataType)
        const select = this.editor as HTMLSelectElement
        if (!this.required) {
            const option = document.createElement('option')
            option.value = ''
            //option.hidden = true
            select.options.add(option)
        }
        for (const item of list) {
            const option = document.createElement('option')
            let label: string | null = null
            if (item.termType === "NamedNode") {
                label = this.findLabel(new NamedNode(item.value), config)
            }
            if (label) {
                option.innerHTML = label
                option.value = item.value
            } else {
                option.innerHTML = item.value
            }
            if (item.value === select.getAttribute('value')) {
                option.setAttribute('selected', 'true')
            }
            select.options.add(option)
        }
    }

    findLabel(subject: NamedNode, config: Config): string | null {
        const quads = config.shapesGraph.getQuads(subject, null, null, null)
        return findObjectValueByPredicate(quads, 'label', PREFIX_RDFS, config.language)
    }

    createEditor(quads: Quad[]): HTMLElement {
        return document.createElement('select')
    }

    toRDFObject(): Literal | NamedNode | undefined {
        const value = (this.editor as HTMLSelectElement).value
        if (value) {
            if (this.nodeKind && this.nodeKind.id === `${PREFIX_SHACL}IRI`) {
                return DataFactory.namedNode(value)
            } else {
                return DataFactory.literal(value)
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
                return new InputText(quads, config.language, dataType)
            case 'integer':
            case 'float':
            case 'double':
            case 'decimal':
                return new InputNumber(quads, config.language, dataType)
            case 'date':
            case 'dateTime':
                return new InputDate(quads, config.language, dataType)
        }
    }

    // check if it is a list
    const listSubject = findObjectValueByPredicate(quads, 'in')
    if (listSubject) {
        const list = config.lists[listSubject]
        if (list) {
            return new InputList(quads, config.language, dataType, list, config)
        }
        else {
            console.error('list not found:', listSubject, 'existing lists:', config.lists)
        }
    }

    // nothing found, fallback to 'text'
    return new InputText(quads, config.language, dataType)
}

window.customElements.define('input-date', InputDate)
window.customElements.define('input-text', InputText)
window.customElements.define('input-number', InputNumber)
window.customElements.define('input-list', InputList)
