import { html, fixture, expect } from '@open-wc/testing'
import { ShaclForm } from '../src/form'
import '../src/form'

const listValues = ['<http://example.org>', '1000', '"2000"', '"string"@en', '"1900-01-01"^^xsd:date', '"http://example.org"^^xsd:anyUri']
const shapes = `
  @prefix :        <http://example.org/> .
  @prefix sh:      <http://www.w3.org/ns/shacl#> .
  @prefix xsd:     <http://www.w3.org/2001/XMLSchema#> .

  :TestShape
    a sh:NodeShape ;
    sh:property [
      sh:path :path ;
      sh:in ( ${listValues.join(' ')} )
    ] .
`
const data = (value: string) => `
  @prefix :        <http://example.org/> .
  @prefix xsd:     <http://www.w3.org/2001/XMLSchema#> .

  :data :path ${value} .
`

const awaitFormLoaded = (form: ShaclForm) => {
  return new Promise<void>(resolve => {
    const interval = setInterval(() => {
      if (form.getAttribute('loading') === null) {
        clearInterval(interval)
        resolve()
      }
    }, 150)
  })
}

describe('test sh:in value serialization', () => {
  let form: ShaclForm

  before(async () => {
    form = await fixture(html`
      <shacl-form
        data-shapes="${shapes}"
        data-shape-subject="http://example.org/TestShape"
      ></shacl-form>`)
  })

  it('list value serialize correctly', async () => {
    for (const value of listValues) {
      form.setAttribute('data-values-subject', 'http://example.org/data')
      form.setAttribute('data-values', data(value))
      await awaitFormLoaded(form)
      const report = await form.validate()
      expect(report.conforms, 'expect form to validate').to.be.true
      const rdf = form.serialize()
      expect(rdf.indexOf(value), `expect existance of value ${value} in:\n${rdf}`).to.be.greaterThan(-1)
    }
  })
})
