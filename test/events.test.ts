import { expect } from '@open-wc/testing'
import '../src/form'

describe('form events', () => {
    it('dispatches ready through containing shadow roots', async () => {
        const host = document.createElement('div')
        const shadowRoot = host.attachShadow({ mode: 'open' })
        const form = document.createElement('shacl-form')
        shadowRoot.appendChild(form)

        const ready = new Promise<Event>(resolve => host.addEventListener('ready', resolve, { once: true }))
        document.body.appendChild(host)
        const event = await ready

        expect(event.bubbles).to.equal(true)
        expect(event.composed).to.equal(true)
        expect(event.target).to.equal(host)
        host.remove()
    })
})
