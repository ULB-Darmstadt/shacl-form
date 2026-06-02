import { expect } from '@open-wc/testing'
import { ShaclForm } from '../src/form'
import { bind, expectIsomorphic, expectValid } from './util'
import '../src/form'

const prefixes = '@prefix : <http://example.org/> . @prefix sh: <http://www.w3.org/ns/shacl#> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .'
const shapeSubject = 'http://example.org/TestShape'
const valuesSubject = 'http://example.org/data'

describe('test value binding', () => {
    let form: ShaclForm

    before(() => {
        form = document.createElement('shacl-form') as ShaclForm
        form.dataset.generateNodeShapeReference = ''
        document.body.appendChild(form)
    })

    after(() => {
        form.remove()
    })

    it('sh:in binding', async () => {
        const listValues = [
            '<http://example.org/term>',
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
    }).timeout(4000)

    it('rdf:langString with sh:languageIn binding', async () => {
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

    it('xsd:base64Binary datatype binding', async () => {
        const value = '"aGVsbG8K"^^xsd:base64Binary'
        const [shapesQuads, inputQuads] = await bind(form, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
            sh:property [
                sh:path :path ;
                sh:datatype xsd:base64Binary ;
                sh:minCount 1 ;
                sh:maxCount 1 ;
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

    it('binds sh:hasValue properties after selecting a sh:xone node option', async () => {
        const [shapesQuads, _] = await bind(form, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
            sh:xone (
                [
                    sh:property [
                        sh:name "Foo" ;
                        sh:path :foo ;
                        sh:datatype xsd:string ;
                        sh:hasValue "fixed foo" ;
                        sh:minCount 1 ;
                        sh:maxCount 1 ;
                    ] ;
                    sh:property [
                        sh:name "Bar" ;
                        sh:path :bar ;
                        sh:datatype xsd:string ;
                        sh:hasValue "fixed bar" ;
                        sh:minCount 1 ;
                        sh:maxCount 1 ;
                    ] ;
                ]
                [
                    sh:property [
                        sh:name "Baz" ;
                        sh:path :baz ;
                        sh:datatype xsd:string ;
                        sh:hasValue "fixed baz" ;
                        sh:minCount 1 ;
                        sh:maxCount 1 ;
                    ] ;
                ]
            ) .`,
            shapeSubject
        )

        const renderRoot = form.shadowRoot ?? form
        const chooser = renderRoot.querySelector('.shacl-or-constraint .editor') as HTMLInputElement | null
        expect(chooser, 'expected xone chooser to be rendered').to.exist

        chooser!.value = '0'
        chooser!.dispatchEvent(new Event('change'))
        await new Promise(resolve => setTimeout(resolve, 0))

        const fooEditor = renderRoot.querySelector(`[data-path='http://example.org/foo'] .editor`) as HTMLInputElement | null
        const barEditor = renderRoot.querySelector(`[data-path='http://example.org/bar'] .editor`) as HTMLInputElement | null
        expect(fooEditor, 'expected first selected property to be created').to.exist
        expect(barEditor, 'expected second selected property to be created').to.exist
        expect(fooEditor!.value).to.equal('fixed foo')
        expect(barEditor!.value).to.equal('fixed bar')
        expect(fooEditor!.disabled).to.equal(true)
        expect(barEditor!.disabled).to.equal(true)

        await expectValid(form, shapesQuads)
        const outputQuads = form.toRDF().getQuads(null, null, null, null)
        expect(outputQuads.some(quad => quad.predicate.value === 'http://example.org/foo' && quad.object.value === 'fixed foo')).to.be.true
        expect(outputQuads.some(quad => quad.predicate.value === 'http://example.org/bar' && quad.object.value === 'fixed bar')).to.be.true
    })

    it('sh:hasValue binding', async () => {
        const values = [
            '<http://example.org/term>',
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
        for (const value of values) {
            const [shapesQuads, _] = await bind(form, `
                ${prefixes}
                <${shapeSubject}> a sh:NodeShape ;
                sh:property [
                    sh:path :path ;
                    sh:hasValue ${value} ;
                    sh:minCount 1 ;
                    sh:maxCount 1 ;
                ] .`,
                shapeSubject
            )
            await expectValid(form, shapesQuads)
        }
    }).timeout(5000)

    it('infers values subject from dcterms:conformsTo', async () => {
        const autoForm = document.createElement('shacl-form') as ShaclForm
        document.body.appendChild(autoForm)
        const values = `
            ${prefixes} @prefix dcterms: <http://purl.org/dc/terms/> .
            <${valuesSubject}> dcterms:conformsTo <http://example.org/OtherShape> ;
                :title "Example title" .`
        const [shapesQuads, inputQuads] = await bind(autoForm, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
            sh:property [
                sh:path :name ;
                sh:minCount 1 ;
                sh:maxCount 1 ;
            ] .
            <http://example.org/OtherShape> a sh:NodeShape ;
            sh:property [
                sh:path :title ;
                sh:minCount 1 ;
                sh:maxCount 1 ;
            ] .`,
            undefined,
            values
        )
        await expectValid(autoForm, shapesQuads)
        expect(autoForm.config.attributes.valuesSubject).to.equal(valuesSubject)
        expectIsomorphic(inputQuads, autoForm.toRDF().getQuads(null, null, null, null))
        autoForm.remove()
    })

    it('uses dcterms:conformsTo node shape as root shape', async () => {
        const autoForm = document.createElement('shacl-form') as ShaclForm
        document.body.appendChild(autoForm)
        const [shapesQuads, _] = await bind(autoForm, `
            ${prefixes} @prefix dcterms: <http://purl.org/dc/terms/> .
            <${shapeSubject}> a sh:NodeShape ;
                sh:targetClass :RootClass ;
                sh:property [
                    sh:path :name ;
                    sh:minCount 1 ;
                    sh:maxCount 1 ;
                ] .
            <http://example.org/OtherShape> a sh:NodeShape ;
                sh:property [
                    sh:path :title ;
                    sh:minCount 1 ;
                    sh:maxCount 1 ;
                ] .`,
            undefined, `
            ${prefixes} @prefix dcterms: <http://purl.org/dc/terms/> .
            <${valuesSubject}> a :RootClass ;
                dcterms:conformsTo <http://example.org/OtherShape> ;
                :title "Example title" .`
        )
        await expectValid(autoForm, shapesQuads)
        expect(autoForm.shape?.template.id.value).to.equal('http://example.org/OtherShape')
        autoForm.remove()
    })
})
