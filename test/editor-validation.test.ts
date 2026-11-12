import { expect, waitUntil } from '@open-wc/testing'
import { RokitInput, RokitTextArea } from '@ro-kit/ui-widgets'
import { ShaclForm } from '../src/form'
import { bind } from './util'
import type { Editor } from '../src/theme'
import '../src/form'

describe('validation after programmatic editor updates', () => {
    let form: ShaclForm

    async function createEditor(datatype = 'string', multiline = false, constraints = '') {
        form = document.createElement('shacl-form') as ShaclForm
        form.dataset.submitButton = 'Submit'
        document.body.appendChild(form)
        await bind(form, `
            @prefix sh: <http://www.w3.org/ns/shacl#> .
            @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
            <urn:Root> a sh:NodeShape ; sh:property [
                sh:path <urn:value> ; sh:datatype xsd:${datatype} ;
                sh:minCount 1 ; sh:maxCount 1 ;
                <http://datashapes.org/dash#singleLine> ${!multiline} ${constraints}
            ] .
        `, 'urn:Root')
        const editor = form.form.querySelector<RokitInput | RokitTextArea>('.editor')!
        await editor.updateComplete
        return editor
    }

    afterEach(() => form.remove())

    for (const multiline of [false, true]) {
        it(`waits for ${multiline ? 'multiline' : 'single-line'} editor updates in validate()`, async () => {
            const editor = await createEditor('string', multiline)
            expect(editor.validity.valueMissing).to.equal(true)
            editor.value = 'valid value'
            const report = await form.validate()

            expect(report.conforms).to.equal(true)
            expect(editor.validity.valid).to.equal(true)
            expect(editor.parentElement!.classList.contains('invalid')).to.equal(false)
            expect(editor.parentElement!.querySelector('.validation-error')).to.equal(null)
        })
    }

    it('waits for editor updates on a synthetic change event', async () => {
        const editor = await createEditor()
        const changed = new Promise<CustomEvent>(resolve => form.addEventListener('change', event => resolve(event as CustomEvent), { once: true }))
        editor.value = 'valid value'
        editor.dispatchEvent(new Event('change', { bubbles: true }))
        const event = await changed

        expect(event.detail.valid).to.equal(true)
        expect(editor.parentElement!.classList.contains('invalid')).to.equal(false)
        expect(editor.parentElement!.querySelector('.validation-error')).to.equal(null)
    })

    it('submits after filling a required editor without waiting in the caller', async () => {
        const editor = await createEditor()
        let submitted = false
        form.addEventListener('submit', () => { submitted = true })
        editor.value = 'valid value'
        form.form.querySelector<HTMLElement>('.submit-button')!.click()

        await waitUntil(() => submitted)
        expect(editor.validity.valid).to.equal(true)
        expect(editor.parentElement!.classList.contains('invalid')).to.equal(false)
    })

    it('still blocks submission after clearing a required editor', async () => {
        const editor = await createEditor()
        editor.value = 'valid value'
        await editor.updateComplete
        let submitted = false
        form.addEventListener('submit', () => { submitted = true })
        editor.value = ''
        form.form.querySelector<HTMLElement>('.submit-button')!.click()

        await waitUntil(() => !!editor.parentElement!.querySelector('.validation-error'))
        expect(editor.validity.valueMissing).to.equal(true)
        expect(submitted).to.equal(false)
    })

    for (const datatype of ['decimal', 'double', 'float']) {
        it(`clears stale xsd:${datatype} errors after a programmatic correction`, async () => {
            const editor = await createEditor(datatype) as RokitInput
            editor.inputElement.value = 'not-a-number'
            editor.inputElement.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
            await editor.updateComplete
            expect(editor.validity.customError).to.equal(true)

            editor.value = '1.5'
            const report = await form.validate()

            expect(report.conforms).to.equal(true)
            expect(editor.validity.valid).to.equal(true)
            expect(editor.validationMessage).to.equal('')
            expect(editor.parentElement!.querySelector('.validation-error')).to.equal(null)
        })
    }

    it('sets the datatype error for a programmatically invalid decimal', async () => {
        const editor = await createEditor('decimal')
        editor.value = 'not-a-number'
        await form.validate()

        expect(editor.validity.patternMismatch).to.equal(true)
        expect(editor.validationMessage).to.contain('Value does not have datatype')
        expect(editor.parentElement!.classList.contains('invalid')).to.equal(true)
    })

    it('preserves application custom errors on decimal inputs during validation and submit', async () => {
        const editor = await createEditor('decimal') as RokitInput
        editor.value = '1.5'
        await editor.updateComplete
        const message = 'Application rejected this value'
        editor.setCustomValidity(message, editor.inputElement)
        await form.validate()

        expect(editor.validity.customError).to.equal(true)
        expect(editor.validationMessage).to.equal(message)
        let submitted = false
        form.addEventListener('submit', () => { submitted = true })
        form.form.querySelector<HTMLElement>('.submit-button')!.click()
        await waitUntil(() => editor.shadowRoot?.activeElement === editor.inputElement)
        expect(submitted).to.equal(false)
        expect(editor.validationMessage).to.equal(message)
    })

    it('does not replace application errors when a decimal also has a pattern mismatch', async () => {
        const editor = await createEditor('decimal') as RokitInput
        editor.value = 'not-a-number'
        await editor.updateComplete
        editor.setCustomValidity('Application error', editor.inputElement)
        await form.validate()

        expect(editor.validity.patternMismatch).to.equal(true)
        expect(editor.validationMessage).to.equal('Application error')
    })

    it('preserves newer SHACL errors when a replaced editor finishes updating', async () => {
        const original = await createEditor('string', false, '; sh:pattern "^valid$"')
        const pending = document.createElement('input') as HTMLInputElement & Editor
        pending.className = 'editor'
        pending.value = 'valid'
        pending.shaclDatatype = original.shaclDatatype
        let resume!: () => void
        pending.updateComplete = new Promise<void>(resolve => { resume = resolve })
        original.replaceWith(pending)
        const first = form.validate()
        const replacement = document.createElement('input') as HTMLInputElement & Editor
        replacement.className = 'editor'
        replacement.shaclDatatype = original.shaclDatatype
        replacement.value = 'invalid'
        pending.replaceWith(replacement)
        try {
            const latest = await form.validate()
            expect(latest.conforms).to.equal(false)
            const instance = replacement.parentElement!
            expect(instance.classList.contains('invalid')).to.equal(true)
            const message = instance.querySelector('.validation-error')
            expect(message).not.to.equal(null)
            resume()
            const earlier = await first

            expect(earlier.conforms).to.equal(false)
            expect(earlier.results).to.have.length.greaterThan(0)
            expect(instance.classList.contains('invalid')).to.equal(true)
            expect(instance.querySelector('.validation-error')).to.equal(message)
        } finally {
            resume()
            await first
        }
    })

    it('does not add stale required-node markers after a newer validation', async () => {
        await createEditor()
        await bind(form, `
            @prefix sh: <http://www.w3.org/ns/shacl#> .
            <urn:Root> a sh:NodeShape ; sh:property [
                sh:path <urn:child> ; sh:node <urn:Root> ; sh:minCount 1
            ] .
        `, 'urn:Root')
        const pending = document.createElement('input') as HTMLInputElement & Editor
        pending.className = 'editor'
        let resume!: () => void
        pending.updateComplete = new Promise<void>(resolve => { resume = resolve })
        form.form.appendChild(pending)
        const first = form.validate()
        pending.remove()
        try {
            await form.validate(true)
            expect(form.form.querySelector('.validation-error')).to.equal(null)
            resume()
            expect((await first).conforms).to.equal(false)
            expect(form.form.querySelector('.validation-error')).to.equal(null)
            expect(form.form.querySelector('.add-button-wrapper.invalid')).to.equal(null)
        } finally {
            resume()
            await first
        }
    })
})
