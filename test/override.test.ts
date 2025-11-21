import { html, fixture, expect } from '@open-wc/testing'
import { ShaclForm } from '../src/form'
import { bind, expectIsomorphic, expectValid } from './util'
import '../src/form'

const prefixes = '@prefix : <http://example.org/> . @prefix sh: <http://www.w3.org/ns/shacl#> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .'
const shapeSubject = 'http://example.org/TestShape'
const valuesSubject = 'http://example.org/data'

describe('test property overriding', () => {
    let form: ShaclForm

    before(async () => { form = await fixture(html`<shacl-form data-generate-node-shape-reference=""></shacl-form>`) })

    it('test horizontal property merge', async () => {
        await bind(form, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
            sh:property [
                sh:path :pathToMerge ;
                sh:datatype xsd:string ;
                sh:maxCount 1 ;
            ] , [
                sh:path :pathToMerge ;
                sh:maxLength 3 ;
            ] , [
                sh:path :pathToMerge ;
                sh:qualifiedValueShape [
                    a sh:NodeShape ;
                    sh:property [
                        sh:path :dummy ;
                    ] ;
                ] ;
            ]  .
            `
        )
        expect(form.shape?.template.properties['http://example.org/pathToMerge'].length).to.equal(2)
    })

    it('sh:qualifiedValueShape multiple override with sh:in', async () => {
        const [shapesQuads, inputQuads] = await bind(form, `
            ${prefixes}
            :BaseShape  a sh:NodeShape ;
            sh:property [
                sh:path :pathToOverride ;
                sh:maxCount 1;
                sh:class :ExampleClass ;
            ] .
            :MiddleShape1  a sh:NodeShape ;
            sh:node :BaseShape ;
            sh:property [
                sh:path :pathToOverride ;
                sh:in (:instance1 :instance2) ;
            ] .
            :MiddleShape2  a sh:NodeShape ;
            sh:node :BaseShape ;
            sh:property [
                sh:path :pathToOverride ;
                sh:in (:instance3 :instance4) ;
            ] .
            <${shapeSubject}> a sh:NodeShape ;
            sh:property [
                sh:path :dummy ;
                sh:qualifiedValueShape :MiddleShape1 ;
                sh:qualifiedMinCount 1 ;
                sh:qualifiedMaxCount 1 ;
            ], [
                sh:path :dummy ;
                sh:qualifiedValueShape :MiddleShape2 ;
                sh:qualifiedMinCount 1 ;
                sh:qualifiedMaxCount 1 ;
            ] .
            :instance1 a :ExampleClass .
            :instance2 a :ExampleClass .
            :instance3 a :ExampleClass .
            :instance4 a :ExampleClass .
            `,
            shapeSubject, `
            ${prefixes}
            <${valuesSubject}> :dummy [ :pathToOverride :instance1 ] ; :dummy [ :pathToOverride :instance3 ] .`,
            valuesSubject
        )
        await expectValid(form, shapesQuads)
        expectIsomorphic(inputQuads, form.toRDF().getQuads(null, null, null, null))
    })

    it('sh:qualifiedValueShape multiple override with sh:hasValue', async () => {
        const [shapesQuads, inputQuads] = await bind(form, `
            ${prefixes}
            :BaseShape  a sh:NodeShape ;
            sh:property [
                sh:path :pathToOverride ;
                sh:maxCount 1;
                sh:class :ExampleClass ;
            ] .
            :MiddleShape1  a sh:NodeShape ;
            sh:node :BaseShape ;
            sh:property [
                sh:path :pathToOverride ;
                sh:hasValue :instance1 ;
            ] .
            :MiddleShape2  a sh:NodeShape ;
            sh:node :BaseShape ;
            sh:property [
                sh:path :pathToOverride ;
                sh:hasValue :instance2 ;
            ] .
            <${shapeSubject}> a sh:NodeShape ;
            sh:property [
                sh:path :dummy ;
                sh:qualifiedValueShape :MiddleShape1 ;
                sh:qualifiedMinCount 1 ;
                sh:qualifiedMaxCount 1 ;
            ], [
                sh:path :dummy ;
                sh:qualifiedValueShape :MiddleShape2 ;
                sh:qualifiedMinCount 1 ;
                sh:qualifiedMaxCount 1 ;
            ] .
            :instance1 a :ExampleClass .
            :instance2 a :ExampleClass .
            `,
            shapeSubject, `
            ${prefixes}
            <${valuesSubject}> :dummy [ :pathToOverride :instance1 ] ; :dummy [ :pathToOverride :instance2 ] .`,
            valuesSubject
        )
        await expectValid(form, shapesQuads)
        expectIsomorphic(inputQuads, form.toRDF().getQuads(null, null, null, null))
    })
})
