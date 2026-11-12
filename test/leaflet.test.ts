import { expect } from '@open-wc/testing'
import { geometryToWkt, wktToGeometry } from '../src/plugins/leaflet'
import { LeafletPlugin } from '../src/plugins/leaflet'
import { ShaclForm, registerPlugin } from '../src/form'
import { RokitInput } from '@ro-kit/ui-widgets'
import { bind } from './util'

describe('Leaflet geometry conversion', () => {
    it('parses and serializes points', () => {
        const geometry = wktToGeometry('POINT ( 8.65  49.87 )')

        expect(geometry).to.deep.equal({ type: 'Point', coordinates: [8.65, 49.87] })
        expect(geometry && geometryToWkt(geometry)).to.equal('POINT(8.65 49.87)')
    })

    it('parses and serializes polygon rings', () => {
        const wkt = 'POLYGON((8 49,9 49,9 50,8 49))'
        const geometry = wktToGeometry(wkt)

        expect(geometry).to.deep.equal({
            type: 'Polygon',
            coordinates: [[[8, 49], [9, 49], [9, 50], [8, 49]]]
        })
        expect(geometry && geometryToWkt(geometry)).to.equal(wkt)
    })

    it('rejects malformed or non-finite coordinates', () => {
        expect(wktToGeometry('POINT(foo 49)')).to.equal(undefined)
        expect(wktToGeometry('POLYGON((8 49,9 49))')).to.equal(undefined)
    })
})

describe('Leaflet editor validation', () => {
    it('clears the required-field error after a geometry is chosen in the dialog', async () => {
        const plugin = new LeafletPlugin({ predicate: 'urn:leaflet-test-geometry' })
        registerPlugin(plugin)
        const form = document.createElement('shacl-form') as ShaclForm
        document.body.appendChild(form)
        try {
            await bind(form, `
                @prefix sh: <http://www.w3.org/ns/shacl#> .
                <urn:Root> a sh:NodeShape ; sh:property [
                    sh:path <urn:leaflet-test-geometry> ;
                    sh:datatype <http://www.opengis.net/ont/geosparql#wktLiteral> ;
                    sh:minCount 1 ; sh:maxCount 1
                ] .
            `, 'urn:Root')
            const editor = form.form.querySelector<RokitInput>('.editor')!
            await editor.updateComplete
            expect(editor.validity.valueMissing).to.equal(true)
            plugin.currentEditor = editor
            plugin.createdGeometry = { type: 'Point', coordinates: [8.65, 49.87] }
            const changed = new Promise<CustomEvent>(resolve => form.addEventListener('change', event => resolve(event as CustomEvent), { once: true }))
            form.form.querySelector('dialog')!.dispatchEvent(new Event('close'))
            const event = await changed

            expect(editor.value).to.equal('POINT(8.65 49.87)')
            expect(editor.validity.valid).to.equal(true)
            expect(event.detail.valid).to.equal(true)
            expect(editor.parentElement!.classList.contains('invalid')).to.equal(false)
            expect(editor.parentElement!.querySelector('.validation-error')).to.equal(null)
        } finally {
            plugin.map?.remove()
            form.remove()
        }
    })
})
