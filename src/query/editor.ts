import { DataFactory, Literal } from 'n3'
import { Term } from '@rdfjs/types'
import { RokitInput, RokitSelect, RokitSlider, epochToDate } from '@ro-kit/ui-widgets'
import { PREFIX_XSD, RDF_OBJECT_LANG_STRING, XSD_DATATYPE_BOOLEAN } from '../constants.js'
import { isRangeQueryField, QueryEditor, QueryFacet, QueryField } from './index.js'
import { ShaclPropertyTemplate } from '../property-template.js'
import { createInputListEntries, findInstancesOf } from '../util.js'
import { InputListEntry } from '../theme.js'

type Choice = { term: Term; label: string; count?: number }

export function createQueryEditor(field: QueryField, template: ShaclPropertyTemplate): QueryEditor {
    const root = document.createElement('div') as unknown as QueryEditor
    const discrete = Boolean(template.in || template.class || template.datatype?.equals(XSD_DATATYPE_BOOLEAN))
    root.classList.add('query-editor')
    root.dataset.queryFieldId = field.id
    root.setAttribute('part', 'query-editor')

    const label = document.createElement('label')
    label.textContent = template.label
    if (template.description) {
        label.title = template.description.value
    }
    root.appendChild(label)

    const controls = document.createElement('div')
    controls.classList.add('query-controls')
    root.appendChild(controls)

    let facet: QueryFacet | undefined
    let choices = initialChoices(template)
    let lastUsableRangeBounds: [number, number] | undefined

    const createChoiceRow = (selected = '') => {
        const row = document.createElement('div')
        row.classList.add('query-value-row')
        const select = new RokitSelect()
        select.classList.add('editor', 'query-choice')
        select.clearable = true
        select.dense = template.config.theme.dense
        select.placeholder = ''
        select.setAttribute('exportparts', 'facet-count')
        const list = document.createElement('ul')
        for (const choice of choices) {
            const item = document.createElement('li')
            item.dataset.value = termKey(choice.term)
            item.textContent = choice.label
            if (choice.count !== undefined) {
                const count = document.createElement('span')
                count.classList.add('facet-count')
                count.setAttribute('part', 'facet-count')
                count.dataset.count = String(choice.count)
                item.append(' ', count)
            }
            list.appendChild(item)
        }
        select.appendChild(list)
        select.value = selected
        row.appendChild(select)
        return row
    }

    const renderDiscrete = (selectedValues: string[] = []) => {
        controls.replaceChildren()
        controls.appendChild(createChoiceRow(selectedValues[0] ?? ''))
    }

    const createBoundInput = (label: string, value = '') => {
        const input = new RokitInput()
        input.classList.add('editor', 'query-range-bound')
        input.type = inputType(template)
        input.label = label
        input.clearable = true
        input.dense = template.config.theme.dense
        input.value = value
        return input
    }

    const renderRange = (preserved?: { min?: Term; max?: Term }) => {
        controls.replaceChildren()
        const nextBounds = effectiveRangeBounds(template, facet)
        if (nextBounds && nextBounds[0] < nextBounds[1]) {
            lastUsableRangeBounds = nextBounds
        }
        const bounds = resolveRangeBounds(nextBounds, preserved && lastUsableRangeBounds)
        if (!bounds || bounds[0] === bounds[1]) {
            controls.append(
                createBoundInput('Minimum', preserved?.min?.value),
                createBoundInput('Maximum', preserved?.max?.value)
            )
            return
        }

        const slider = new RokitSlider()
        slider.classList.add('editor', 'query-range-slider')
        slider.dense = template.config.theme.dense
        slider.clearable = true
        slider.range = ''
        slider.setAttribute('range', '')
        // slider.setAttribute('sticky', '')
        slider.min = String(bounds[0])
        slider.max = String(bounds[1])
        slider.step = String(rangeStep(template, bounds))
        slider.labelFormatter = value => sliderLabel(value, template)
        const selectedMin = preserved?.min ? termToSliderValue(preserved.min, template) : bounds[0]
        const selectedMax = preserved?.max ? termToSliderValue(preserved.max, template) : bounds[1]
        slider.value = JSON.stringify([
            clamp(selectedMin ?? bounds[0], bounds[0], bounds[1]),
            clamp(selectedMax ?? bounds[1], bounds[0], bounds[1])
        ])
        slider.dataset.active = preserved?.min || preserved?.max ? 'true' : 'false'
        slider.addEventListener('change', () => {
            slider.dataset.active = 'true'
        })
        controls.appendChild(slider)
    }

    const createTextRow = () => {
        const row = document.createElement('div')
        row.classList.add('query-value-row')
        const input = new RokitInput()
        input.classList.add('editor', 'query-value')
        input.type = inputType(template)
        input.clearable = true
        input.dense = template.config.theme.dense
        let debounceTimer: ReturnType<typeof setTimeout> | undefined
        input.addEventListener('input', () => {
            clearTimeout(debounceTimer)
            debounceTimer = setTimeout(() => {
                root.dispatchEvent(new Event('change', { bubbles: true }))
            }, 300)
        })
        row.appendChild(input)
        if (template.datatype?.equals(RDF_OBJECT_LANG_STRING)) {
            const language = template.languageIn?.length
                ? document.createElement('select')
                : document.createElement('input')
            language.classList.add('lang-chooser', 'query-language')
            language.title = 'Language of the text'
            language.setAttribute('aria-label', 'Language of the text')
            if (language instanceof HTMLSelectElement) {
                for (const allowedLanguage of template.languageIn ?? []) {
                    const option = document.createElement('option')
                    option.value = allowedLanguage.value
                    option.textContent = allowedLanguage.value
                    language.appendChild(option)
                }
            } else {
                language.maxLength = 35
                language.placeholder = 'lang?'
                language.value = template.config.languages.find(candidate => candidate.length > 0) ?? ''
            }
            row.appendChild(language)
        }
        return row
    }

    const renderText = () => {
        controls.replaceChildren()
        controls.appendChild(createTextRow())
    }

    root.getQueryCriteria = () => {
        if (isRangeQueryField(field)) {
            const slider = controls.querySelector<RokitSlider>('rokit-slider')
            if (slider) {
                if (slider.dataset.active !== 'true') {
                    return []
                }
                const values = parseSliderValue(slider.value)
                if (!values) {
                    return []
                }
                return [{
                    field,
                    operator: 'range',
                    min: sliderValueToTerm(values[0], template),
                    max: sliderValueToTerm(values[1], template)
                }]
            }
            const inputs = controls.querySelectorAll<RokitInput>('rokit-input')
            const min = valueToTerm(inputs[0]?.value, template)
            const max = valueToTerm(inputs[1]?.value, template)
            return min || max ? [{ field, operator: 'range', min, max }] : []
        }
        if (discrete) {
            return Array.from(controls.querySelectorAll<RokitSelect>('rokit-select')).flatMap(select => {
                if (!select.value) {
                    return []
                }
                const term = choices.find(choice => termKey(choice.term) === select.value)?.term
                return term ? [{ field, operator: 'equals' as const, value: term }] : []
            })
        }
        const operator = isString(template) && !template.class && !template.nodeKind?.value.endsWith('#IRI') ? 'contains' as const : 'equals' as const
        return Array.from(controls.querySelectorAll<HTMLElement>('.query-value-row')).flatMap(row => {
            const input = row.querySelector<RokitInput>('.query-value')
            const language = row.querySelector<HTMLSelectElement | HTMLInputElement>('.query-language')?.value
            const value = valueToTerm(input?.value, template, language)
            return value ? [{ field, operator, value }] : []
        })
    }

    root.setQueryFacet = (nextFacet?: QueryFacet) => {
        const activeCriteria = root.getQueryCriteria()
        facet = nextFacet
        if (discrete && facet?.buckets) {
            const allowed = new Map(initialChoices(template).map(choice => [termKey(choice.term), choice]))
            const active = new Map(activeCriteria.flatMap(criterion => criterion.value ? [[termKey(criterion.value), criterion.value] as const] : []))
            choices = facet.buckets.flatMap(bucket => {
                const existing = allowed.get(termKey(bucket.value))
                if (template.in && !existing) {
                    return []
                }
                return [{ term: bucket.value, label: bucket.label ?? existing?.label ?? bucket.value.value, count: bucket.count }]
            })
            for (const [key, term] of active) {
                if (!choices.some(choice => termKey(choice.term) === key)) {
                    choices.push({ term, label: allowed.get(key)?.label ?? term.value, count: 0 })
                }
            }
            renderDiscrete([...active.keys()])
        } else if (isRangeQueryField(field)) {
            const criterion = activeCriteria[0]
            renderRange(criterion ? { min: criterion.min, max: criterion.max } : undefined)
        } else if (!nextFacet) {
            for (const input of controls.querySelectorAll<RokitInput>('.query-value')) {
                input.value = ''
            }
        }
    }

    if (isRangeQueryField(field)) {
        renderRange()
    } else if (discrete) {
        renderDiscrete()
    } else {
        renderText()
    }
    return root
}

function effectiveRangeBounds(template: ShaclPropertyTemplate, facet?: QueryFacet): [number, number] | undefined {
    const facetMin = facet?.min ? termToSliderValue(facet.min, template) : undefined
    const facetMax = facet?.max ? termToSliderValue(facet.max, template) : undefined
    const shapeMin = template.minInclusive ?? (template.minExclusive !== undefined ? template.minExclusive + 1 : undefined)
    const shapeMax = template.maxInclusive ?? (template.maxExclusive !== undefined ? template.maxExclusive - 1 : undefined)
    const min = facetMin === undefined ? shapeMin : shapeMin === undefined ? facetMin : Math.max(facetMin, shapeMin)
    const max = facetMax === undefined ? shapeMax : shapeMax === undefined ? facetMax : Math.min(facetMax, shapeMax)
    return min !== undefined && max !== undefined && Number.isFinite(min) && Number.isFinite(max) && min <= max ? [min, max] : undefined
}

function rangeStep(template: ShaclPropertyTemplate, bounds: [number, number]): number {
    if (template.datatype?.value === `${PREFIX_XSD}integer`) {
        return 1
    }
    if (template.datatype?.value === `${PREFIX_XSD}date`) {
        return 86400
    }
    if (template.datatype?.value === `${PREFIX_XSD}dateTime`) {
        return 1
    }
    return Math.max((bounds[1] - bounds[0]) / 1000, Number.EPSILON)
}

function sliderLabel(value: number, template: ShaclPropertyTemplate): string {
    if (template.datatype?.value === `${PREFIX_XSD}date`) {
        return epochToDate(value, true)
    }
    if (template.datatype?.value === `${PREFIX_XSD}dateTime`) {
        return epochToDate(value)
    }
    return String(Math.round(value * 1e3) / 1e3)
}

function termToSliderValue(term: Term, template: ShaclPropertyTemplate): number | undefined {
    if (template.datatype?.value === `${PREFIX_XSD}date` || template.datatype?.value === `${PREFIX_XSD}dateTime`) {
        const milliseconds = Date.parse(term.value)
        return Number.isFinite(milliseconds) ? milliseconds / 1000 : undefined
    }
    const value = Number(term.value)
    return Number.isFinite(value) ? value : undefined
}

function sliderValueToTerm(value: number, template: ShaclPropertyTemplate): Term {
    const datatype = template.datatype
    if (datatype?.value === `${PREFIX_XSD}date`) {
        return DataFactory.literal(epochToDate(value, true), datatype)
    }
    if (datatype?.value === `${PREFIX_XSD}dateTime`) {
        return DataFactory.literal(epochToDate(value), datatype)
    }
    return DataFactory.literal(String(value), datatype)
}

function parseSliderValue(value: string): [number, number] | undefined {
    try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) && parsed.length === 2 && parsed.every(Number.isFinite) ? [Number(parsed[0]), Number(parsed[1])] : undefined
    } catch {
        return undefined
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

function resolveRangeBounds(
    next: [number, number] | undefined,
    fallback: [number, number] | undefined
): [number, number] | undefined {
    if (next && next[0] < next[1]) {
        return next
    }
    if (fallback) {
        return fallback
    }
    return next
}

function initialChoices(template: ShaclPropertyTemplate): Choice[] {
    if (template.datatype?.equals(XSD_DATATYPE_BOOLEAN)) {
        return [
            { term: DataFactory.literal('true', XSD_DATATYPE_BOOLEAN), label: 'true' },
            { term: DataFactory.literal('false', XSD_DATATYPE_BOOLEAN), label: 'false' }
        ]
    }
    let entries: InputListEntry[] = []
    if (template.in) {
        entries = createInputListEntries(template.config.lists[template.in] ?? [], template.config.store, template.config.languages)
    } else if (template.class) {
        entries = findInstancesOf(template.class, template)
    }
    return flattenEntries(entries)
}

function flattenEntries(entries: InputListEntry[]): Choice[] {
    return entries.flatMap(entry => {
        const own = typeof entry.value === 'string' ? [] : [{ term: entry.value, label: entry.label || entry.value.value }]
        return [...own, ...flattenEntries(entry.children ?? [])]
    })
}

function valueToTerm(value: string | undefined, template: ShaclPropertyTemplate, language?: string): Term | undefined {
    if (!value) {
        return undefined
    }
    if (template.class || template.nodeKind?.value.endsWith('#IRI')) {
        return DataFactory.namedNode(value)
    }
    if (template.datatype?.equals(RDF_OBJECT_LANG_STRING)) {
        return language ? DataFactory.literal(value, language) : undefined
    }
    if (template.datatype) {
        return DataFactory.literal(value, template.datatype)
    }
    return DataFactory.literal(value)
}

function isString(template: ShaclPropertyTemplate): boolean {
    return !template.datatype || template.datatype.value === `${PREFIX_XSD}string` || template.datatype.equals(RDF_OBJECT_LANG_STRING)
}

function inputType(template: ShaclPropertyTemplate): string {
    const datatype = template.datatype?.value
    if ([`${PREFIX_XSD}integer`, `${PREFIX_XSD}float`, `${PREFIX_XSD}double`, `${PREFIX_XSD}decimal`].includes(datatype ?? '')) {
        return 'number'
    }
    if (datatype === `${PREFIX_XSD}date`) {
        return 'date'
    }
    if (datatype === `${PREFIX_XSD}dateTime`) {
        return 'datetime-local'
    }
    return 'text'
}

function termKey(term: Term): string {
    if (term.termType === 'Literal') {
        const literal = term as Literal
        return `${term.termType}:${term.value}:${literal.language}:${literal.datatype?.value}`
    }
    return `${term.termType}:${term.value}`
}
