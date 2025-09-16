import { html, fixture, expect } from '@open-wc/testing'
import { ShaclForm } from '../src/form'
import '../src/form'

const shapes = `
  @prefix sh:      <http://www.w3.org/ns/shacl#> .
  @prefix xsd:     <http://www.w3.org/2001/XMLSchema#> .
  @prefix ex:      <http://example.org/> .

  ex:TestShape
    a sh:NodeShape ;
    sh:property [
      sh:path ex:test ;
      sh:in ( <http://example.org> 1000 "2000" "string"@en "1900-01-01"^^xsd:date "http://example.org"^^xsd:anyUri )
    ] .
`

describe('MyElement', () => {
  it('has a default title "Hey there" and counter 5', async () => {
    const el: ShaclForm = await fixture(html`
      <shacl-form
        data-shapes="${shapes}"
        data-shape-subject="http://example.org/TestShape"
      ></shacl-form>`)

    expect(el.title).to.equal('Hey there');
    // expect(el.counter).to.equal(5);
  });

  it('can override the title via attribute', async () => {
    const el: ShaclForm = await fixture(html` <shacl-form></shacl-form> `);

    expect(el.title).to.equal('attribute title');
  });

  it('passes the a11y audit', async () => {
    const el: ShaclForm = await fixture(html` <shacl-form></shacl-form> `);

    await expect(el).shadowDom.to.be.accessible();
  });
});
