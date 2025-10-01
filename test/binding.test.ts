import { html, fixture, expect } from '@open-wc/testing'
import { ShaclForm } from '../src/form'
import { bind, expectIsomorphic, expectValid } from './util'
import '../src/form'

const prefixes = '@prefix : <http://example.org/> . @prefix sh: <http://www.w3.org/ns/shacl#> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .'
const shapeSubject = 'http://example.org/TestShape'
const valuesSubject = 'http://example.org/data'

describe('test value binding', () => {
    let form: ShaclForm

    before(async () => { form = await fixture(html`<shacl-form></shacl-form>`) })

    it('sh:in binding', async () => {
        const listValues = [
            '<http://example.org/path/>',
            '1000',
            '3.141592654',
            '"2000"',
            false,
            '"lang string"@en',
            '"1900-01-01"^^xsd:date',
            '"http://example.org"^^xsd:anyUri',
            true,
            '"aGVsbG8K"^^xsd:base64Binary'
        ]
        const [shapesQuads, _] = await bind(form, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
            sh:property [
                sh:path :path ;
                sh:minCount 1 ;
                sh:maxCount 1 ;
                sh:in ( ${listValues.join(' ')} )
            ] .`,
            shapeSubject
        )
        for (const value of listValues) {
            const [_, inputQuads] = await bind(form, undefined, undefined, `
                ${prefixes}
                <${valuesSubject}> :path ${value} .`,
                valuesSubject
            )
            await expectValid(form, shapesQuads)
            expectIsomorphic(inputQuads, form.toRDF().getQuads(null, null, null, null))
        }
    })

    it('xsd:langString with sh:languageIn binding', async () => {
        const value = '"example string"@en'
        const [shapesQuads, inputQuads] = await bind(form, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
            sh:property [
                sh:path :path ;
                sh:minCount 1 ;
                sh:maxCount 1 ;
                sh:languageIn ( "en" "de" ) ;
            ] .`,
            shapeSubject, `
            ${prefixes}
            <${valuesSubject}> :path ${value} .`,
            valuesSubject
        )
        await expectValid(form, shapesQuads)
        expectIsomorphic(inputQuads, form.toRDF().getQuads(null, null, null, null))
    })

    it('sh:qualifiedValueShape binding', async () => {
        const [shapesQuads, inputQuads] = await bind(form, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
            sh:property [
                sh:path :path ;
                sh:qualifiedValueShape [
                    sh:class :Class
                ] ;
                sh:qualifiedMinCount 1 ;
                sh:qualifiedMaxCount 1 ;
            ] .
            :instance a :Class .`,
            shapeSubject, `
            ${prefixes}
            <${valuesSubject}> :path :instance .`,
            valuesSubject
        )
        await expectValid(form, shapesQuads)
        expectIsomorphic(inputQuads, form.toRDF().getQuads(null, null, null, null))
    })

    it('sh:or binding', async () => {
        const [shapesQuads, inputQuads] = await bind(form, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
            sh:property [
                sh:path :path ;
                sh:minCount 1 ;
                sh:maxCount 1 ;
                sh:or (
                    [ sh:class :Class ]
                    [ sh:datatype xsd:integer ]
                ) ;
            ] .
            :instance a :Class .`,
            shapeSubject, `
            ${prefixes}
            <${valuesSubject}> :path 7 .`,
            valuesSubject
        )
        await expectValid(form, shapesQuads)
        expectIsomorphic(inputQuads, form.toRDF().getQuads(null, null, null, null))
    })

    it('sh:xone binding', async () => {
        const [shapesQuads, inputQuads] = await bind(form, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
            sh:property [
                sh:path :path ;
                sh:minCount 1 ;
                sh:maxCount 1 ;
                sh:xone (
                    [ sh:class :Class ]
                    [ sh:datatype xsd:integer ]
                ) ;
            ] .
            :instance a :Class .`,
            shapeSubject, `
            ${prefixes}
            <${valuesSubject}> :path :instance .`,
            valuesSubject
        )
        await expectValid(form, shapesQuads)
        expectIsomorphic(inputQuads, form.toRDF().getQuads(null, null, null, null))
    })
})
