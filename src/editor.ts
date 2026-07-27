import { Term } from '@rdfjs/types'
import { BlankNode, DataFactory, Literal, NamedNode, Term as N3Term, termFromId, termToId } from 'n3'
import type { Editor } from './theme.js'
import { FRACTIONAL_DATATYPES, PREFIX_SHACL, PREFIX_XSD, XSD_DATATYPE_STRING } from './constants.js'
import { serializeXsdDateTimeValue, serializeXsdDateValue } from './util.js'

export type EditorTerm = NamedNode | BlankNode | Literal

type EditorTermState = {
    value: string
    language?: string
    checked?: boolean
    binaryData?: string
}

export function bindEditorTerm(editor: Editor, term: Term | null | undefined): void {
    editor.rdfTerm = term ?? undefined
    editor.rdfTermState = term ? editorState(editor) : undefined
}

export function bindEditorTerms(editor: Editor, terms: Iterable<Term>): void {
    editor.rdfTerms = new Map()
    for (const term of terms) {
        editor.rdfTerms.set(rdfTermId(term), term)
    }
}

export function rdfTermId(term: Term): string {
    return termToId(term as unknown as N3Term)
}

export function readEditorTerm(editor: Editor): EditorTerm | undefined {
    const selected = editor.rdfTerms?.get(editor.value)
    if (selected) {
        return selected as unknown as EditorTerm
    }
    if (!editor.rdfTerm || !sameState(editor.rdfTermState, editorState(editor))) {
        return undefined
    }
    return editor.rdfTerm as unknown as EditorTerm
}

export function editorToTerm(editor: Editor): EditorTerm | undefined {
    const boundTerm = readEditorTerm(editor)
    if (boundTerm) {
        return boundTerm
    }

    let languageOrDatatype: NamedNode<string> | string | undefined = editor.shaclDatatype
    // Retain support for custom themes using the legacy dataset representation.
    let value: number | string = editor.dataset.value || editor.value
    if ((editor.type === 'file' || editor.getAttribute('type') === 'file') && editor.binaryData) {
        value = editor.binaryData
    } else if (editor.type === 'checkbox' || editor.getAttribute('type') === 'checkbox') {
        // Emit boolean false only when required.
        if (editor.checked || parseInt(editor.dataset.minCount || '0') > 0) {
            return DataFactory.literal(editor.checked ? 'true' : 'false', languageOrDatatype)
        }
        return undefined
    }
    if (!value) {
        return undefined
    }

    const nodeKind = editor.dataset.nodeKind
    const term = parseRdfTerm(value)
    if (editor.dataset.link) {
        return DataFactory.fromTerm(JSON.parse(editor.dataset.link)) as unknown as EditorTerm
    } else if (editor.dataset.class) {
        return term instanceof NamedNode || term instanceof BlankNode ? term : DataFactory.namedNode(value)
    } else if (nodeKind === PREFIX_SHACL + 'IRI') {
        return term instanceof NamedNode ? term : DataFactory.namedNode(value)
    } else if (nodeKind === PREFIX_SHACL + 'BlankNode') {
        return term instanceof BlankNode ? term : DataFactory.blankNode(value)
    } else if (nodeKind === PREFIX_SHACL + 'BlankNodeOrIRI') {
        return term instanceof NamedNode || term instanceof BlankNode ? term : DataFactory.namedNode(value)
    } else if (term instanceof NamedNode || term instanceof BlankNode) {
        return term
    } else if (term instanceof Literal && !editor.dataset.lang && (!languageOrDatatype || (languageOrDatatype instanceof NamedNode && XSD_DATATYPE_STRING.equals(languageOrDatatype)))) {
        return term
    }

    if (editor.dataset.lang) {
        languageOrDatatype = editor.dataset.lang
    } else if (languageOrDatatype instanceof NamedNode && FRACTIONAL_DATATYPES.has(languageOrDatatype.value)) {
        const normalizedValue = normalizeFractionalNumber(value)
        if (normalizedValue === undefined) {
            return undefined
        }
        value = normalizedValue
    } else if (editor.type === 'number') {
        value = parseFloat(value)
    } else if (editor.type === 'datetime-local') {
        value = serializeXsdDateTimeValue(value, editor.dataset.xsdTemporalSuffix)
    } else if (editor.type === 'date' && languageOrDatatype instanceof NamedNode && languageOrDatatype.value === PREFIX_XSD + 'date') {
        value = serializeXsdDateValue(value, editor.dataset.xsdTemporalSuffix)
    }
    return DataFactory.literal(value, languageOrDatatype)
}

function parseRdfTerm(value: string): EditorTerm | undefined {
    let id = value
    if (value.startsWith('<') && value.endsWith('>')) {
        id = value.slice(1, -1)
    } else if (!value.startsWith('_:') && !value.startsWith('"')) {
        return undefined
    }
    const term = termFromId(id, DataFactory)
    return term instanceof NamedNode || term instanceof BlankNode || term instanceof Literal ? term : undefined
}

function normalizeFractionalNumber(value: string): string | undefined {
    const normalized = value.replace(',', '.')
    return /^[-+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$/.test(normalized)
        ? normalized
        : undefined
}

function editorState(editor: Editor): EditorTermState {
    return {
        value: editor.value,
        language: editor.dataset.lang,
        checked: editor.checked,
        binaryData: editor.binaryData
    }
}

function sameState(left: EditorTermState | undefined, right: EditorTermState): boolean {
    return left?.value === right.value &&
        left.language === right.language &&
        left.checked === right.checked &&
        left.binaryData === right.binaryData
}
