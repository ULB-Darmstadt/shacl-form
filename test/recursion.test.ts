import { expect } from '@open-wc/testing'
import { ShaclForm } from '../src/form'
import { bind, expectIsomorphic, expectValid } from './util'
import '../src/form'
import { DataFactory, Quad } from 'n3'

const prefixes = '@prefix : <http://example.org/> . @prefix sh: <http://www.w3.org/ns/shacl#> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .'

describe('test recursion protection', () => {
    let form: ShaclForm

    before(() => {
        form = document.createElement('shacl-form') as ShaclForm
        form.dataset.generateNodeShapeReference = ''
        document.body.appendChild(form)
    })

    after(() => {
        form.remove()
    })

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

    it('does not auto-create recursive required nodes', async () => {
        await bind(form, `
            ${prefixes}
            :Human a sh:NodeShape ;
            sh:property [
                sh:path :loves ;
                sh:minCount 1 ;
                sh:node :Dog ;
            ] .
            :Dog a sh:NodeShape ;
            sh:property [
                sh:path :loves ;
                sh:minCount 1 ;
                sh:node :Human ;
            ] .`
        )
        expect(form.shadowRoot?.querySelectorAll('shacl-node').length).to.equal(2)
    })
})
