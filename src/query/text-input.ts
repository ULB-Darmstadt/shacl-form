import { html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { RokitInput } from '@ro-kit/ui-widgets'

type TextSuggestion = { value: string; label?: string }

// The native input and its datalist must share a shadow root. Keep the list
// inside the input component so suggestions never constrain free text entry.
@customElement('shacl-query-text-input')
export class QueryTextInput extends RokitInput {
    @property({ attribute: false })
        suggestions: TextSuggestion[] = []

    private committedValue?: string

    constructor() {
        super()
        this.addEventListener('change', event => {
            if (this.committedValue === this.value) {
                event.stopImmediatePropagation()
                return
            }
            this.committedValue = this.value
        })
    }

    private handleSuggestionInput = (event: Event) => {
        this.committedValue = undefined
        // Datalist selection can arrive as a plain input event or as a text
        // replacement. Ordinary typing/pasting must not commit a filter.
        if (event instanceof InputEvent && event.inputType !== 'insertReplacementText') {
            return
        }
        if (this.suggestions.some(suggestion => suggestion.value === this.inputElement.value)) {
            this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
            // End the native picker interaction so refreshed facet values do
            // not leave the suggestions open after the selection was applied.
            this.inputElement.blur()
        }
    }

    firstUpdated() {
        super.firstUpdated()
        this.inputElement.setAttribute('list', 'query-suggestions')
        this.inputElement.addEventListener('input', this.handleSuggestionInput)
    }

    disconnectedCallback() {
        this.inputElement?.removeEventListener('input', this.handleSuggestionInput)
        super.disconnectedCallback()
    }

    renderInput() {
        const values = new Set<string>()
        const suggestions = this.suggestions.filter(suggestion => {
            if (values.has(suggestion.value)) {
                return false
            }
            values.add(suggestion.value)
            return true
        })
        return html`${super.renderInput()}
            <datalist id="query-suggestions">
                ${suggestions.map(suggestion => html`
                    <option value="${suggestion.value}" label="${suggestion.label ?? suggestion.value}"></option>
                `)}
            </datalist>`
    }
}
