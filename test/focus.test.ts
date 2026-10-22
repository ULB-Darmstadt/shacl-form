import { expect, waitUntil } from '@open-wc/testing'
import { sendKeys } from '@web/test-runner-commands'
import { ShaclForm } from '../src/form'
import type { ShaclProperty } from '../src/property'
import { awaitFormLoaded } from './util'
import '../src/form'

function focusedElement(): Element | null {
    let element = document.activeElement
    while (element?.shadowRoot?.activeElement) {
        element = element.shadowRoot.activeElement
    }
    return element
}

describe('add instance focus', () => {
    let form: ShaclForm
    let property: ShaclProperty
    let button: HTMLButtonElement

    async function addInstance() {
        const count = property.instanceCount()
        button.click()
        await waitUntil(() => property.instanceCount() > count)
        const instance = property.querySelectorAll<HTMLElement>(':scope > .property-instance')[count]
        await waitUntil(() => instance.classList.contains('fadeIn') && instance.querySelectorAll('.editor').length === 2)
        return instance
    }

    async function animationFinished(instance: HTMLElement) {
        await waitUntil(() => !instance.classList.contains('fadeIn'))
    }

    afterEach(() => form.remove())

    for (const useShadowRoot of [false, true]) {
        describe(`with form shadow DOM ${useShadowRoot ? 'enabled' : 'disabled'}`, () => {
            beforeEach(async () => {
                form = document.createElement('shacl-form') as ShaclForm
                form.dataset.useShadowRoot = String(useShadowRoot)
                form.dataset.shapeSubject = 'urn:Root'
                form.dataset.shapes = `
                    @prefix sh: <http://www.w3.org/ns/shacl#> .
                    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
                    <urn:Root> a sh:NodeShape ;
                        sh:property [ sh:path <urn:child> ; sh:node <urn:Child> ] .
                    <urn:Child> a sh:NodeShape ;
                        sh:property [ sh:path <urn:first> ; sh:datatype xsd:string ; sh:order 1 ],
                                    [ sh:path <urn:second> ; sh:datatype xsd:string ; sh:order 2 ] .
                `
                const ready = awaitFormLoaded(form)
                document.body.appendChild(form)
                await ready
                property = (form.shadowRoot ?? form).querySelector<ShaclProperty>('shacl-property')!
                const addButton = property.querySelector<HTMLElement>('.add-button')!
                await waitUntil(() => !!addButton.shadowRoot?.querySelector('button'))
                button = addButton.shadowRoot!.querySelector('button')!
                button.focus()
                expect(focusedElement()).to.equal(button)
            })

            it('focuses the first editor after adding an instance', async () => {
                const instance = await addInstance()
                await animationFinished(instance)
                expect(instance.querySelector('.editor')!.matches(':focus-within')).to.equal(true)
            })

            it('focuses the first editor after keyboard activation', async () => {
                await sendKeys({ press: 'Enter' })
                await waitUntil(() => property.instanceCount() === 1)
                const instance = property.querySelector<HTMLElement>(':scope > .property-instance')!
                await waitUntil(() => instance.querySelector('.editor')!.matches(':focus-within'))
            })

            it('preserves focus when the user moves to the second editor', async () => {
                const instance = await addInstance()
                const editor = instance.querySelectorAll<HTMLElement>('.editor')[1]
                editor.focus()
                const focused = focusedElement()
                expect(editor.matches(':focus-within')).to.equal(true)
                await animationFinished(instance)
                expect(focusedElement()).to.equal(focused)
            })

            it('only focuses the latest instance after rapid additions', async () => {
                const first = await addInstance()
                let firstFocused = false
                first.addEventListener('focusin', () => { firstFocused = true })
                const second = await addInstance()
                await animationFinished(first)
                await animationFinished(second)
                expect(firstFocused).to.equal(false)
                expect(second.querySelector('.editor')!.matches(':focus-within')).to.equal(true)
            })

            it('preserves focus changes while instance creation is awaiting', async () => {
                const existing = (await property.addPropertyInstance())!
                const editors = existing.querySelectorAll<HTMLElement>('.editor')
                await waitUntil(() => !!editors[0].shadowRoot?.querySelector('input'))
                editors[0].focus()
                const originalAdd = property.addPropertyInstance
                let resume!: () => void
                const gate = new Promise<void>(resolve => { resume = resolve })
                property.addPropertyInstance = async (...args) => {
                    await gate
                    return originalAdd.apply(property, args)
                }
                try {
                    // Programmatic activation leaves focus in the existing editor.
                    const added = addInstance()
                    editors[1].focus()
                    const focused = focusedElement()
                    expect(editors[1].matches(':focus-within')).to.equal(true)
                    resume()
                    await animationFinished(await added)
                    expect(focusedElement()).to.equal(focused)
                } finally {
                    resume()
                    property.addPropertyInstance = originalAdd
                }
            })

            it('does not autofocus an instance pending removal', async () => {
                const instance = await addInstance()
                const editor = instance.querySelector<HTMLElement>('.editor')!
                let focused = false
                editor.addEventListener('focusin', () => { focused = true })
                instance.querySelector<HTMLElement>(':scope > .remove-button-wrapper > .remove-button')!.click()
                await animationFinished(instance)
                expect(focused).to.equal(false)
            })

            it('does not try to focus a disconnected instance', async () => {
                const instance = await addInstance()
                let focusCalls = 0
                instance.querySelector<HTMLElement>('.editor')!.focus = () => { focusCalls++ }
                instance.remove()
                await animationFinished(instance)
                expect(focusCalls).to.equal(0)
            })
        })
    }
})
