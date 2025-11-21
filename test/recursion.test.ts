import { html, fixture, expect } from '@open-wc/testing'
import { ShaclForm } from '../src/form'
import { bind, expectIsomorphic, expectValid } from './util'
import '../src/form'
import { DataFactory, Quad } from 'n3'

const prefixes = '@prefix : <http://example.org/> . @prefix sh: <http://www.w3.org/ns/shacl#> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .'

describe('test recustion protection', () => {
    let form: ShaclForm

    before(async () => { form = await fixture(html`<shacl-form data-generate-node-shape-reference=""></shacl-form>`) })

    it('parsing self-referencing shapes', async () => {
        await bind(form, `
            ${prefixes}
            :Human a sh:NodeShape ;
            sh:property [
                sh:path :loves ;
                sh:node :Dog ;
            ] .
            :Dog a sh:NodeShape ;
            sh:property [
                sh:path :loves ;
                sh:node :Human ;
            ] .            `
        )
        expect(form.shape?.template.id.value).to.equal('http://example.org/Human')
    })
})
