import { expect } from '@open-wc/testing'
import { ShaclForm } from '../src/form'
import { bind } from './util'
import '../src/form'

const prefixes = `
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
    @prefix owl: <http://www.w3.org/2002/07/owl#> .
`

describe('root shape fallback', () => {
    let form: ShaclForm

    beforeEach(() => {
        form = document.createElement('shacl-form') as ShaclForm
        document.body.appendChild(form)
    })

    afterEach(() => form.remove())

    it('follows named property shapes to their child shapes', async () => {
        await bind(form, `
            ${prefixes}
            <urn:Child> a sh:NodeShape .
            <urn:Root> a sh:NodeShape ; sh:property <urn:Property> .
            <urn:Property> a sh:PropertyShape ; sh:path <urn:child> ; sh:node <urn:Child> .
        `)
        expect(form.shape?.template.id.value).to.equal('urn:Root')
    })

    it('keeps an anonymous root that contains a named child shape', async () => {
        await bind(form, `
            ${prefixes}
            _:root a sh:NodeShape ;
                sh:property [ sh:path <urn:child> ; sh:node <urn:Child> ] .
            <urn:Child> a sh:NodeShape .
        `)
        expect(form.shape?.template.id.termType).to.equal('BlankNode')
    })

    it('counts references to anonymous node shapes when ranking roots', async () => {
        await bind(form, `
            ${prefixes}
            <urn:Auxiliary> a sh:NodeShape .
            <urn:Root> a sh:NodeShape ; sh:property [ sh:path <urn:child> ; sh:node _:child ] .
            _:child a sh:NodeShape .
        `)
        expect(form.shape?.template.id.value).to.equal('urn:Root')
    })

    it('follows named RDF list nodes in logical constraints', async () => {
        await bind(form, `
            ${prefixes}
            <urn:Child> a sh:NodeShape .
            <urn:Root> a sh:NodeShape ; sh:and <urn:List> .
            <urn:List> rdf:first <urn:Child> ; rdf:rest rdf:nil .
        `)
        expect(form.shape?.template.id.value).to.equal('urn:Root')
    })

    it('keeps the importing root when the document URL differs from its shape IRIs', async () => {
        const importedUrl = 'https://example.org/shapes.ttl'
        const resolvedUrls: string[] = []
        form.setRdfUrlResolver(async url => {
            resolvedUrls.push(url)
            return `${prefixes}
                <urn:Imported> a sh:NodeShape ;
                    sh:property [ sh:path <urn:child> ; sh:node <urn:Child> ] .
                <urn:Child> a sh:NodeShape .
            `
        })
        await bind(form, `${prefixes}
            <urn:Root> a sh:NodeShape ; owl:imports <${importedUrl}> .
        `)
        expect(resolvedUrls).to.deep.equal([importedUrl])
        expect(form.shape?.template.id.value).to.equal('urn:Root')
    })

    it('keeps the local root when the ontology header imports auxiliary shapes', async () => {
        form.setRdfUrlResolver(async () => `${prefixes}
            <urn:Imported> a sh:NodeShape ;
                sh:property [ sh:path <urn:child> ; sh:node <urn:Child> ] .
            <urn:Child> a sh:NodeShape .
        `)
        await bind(form, `${prefixes}
            <urn:Root> a sh:NodeShape .
            <urn:Ontology> a owl:Ontology ; owl:imports <https://example.org/shapes.ttl> .
        `)
        expect(form.shape?.template.id.value).to.equal('urn:Root')
    })

    it('retains local root candidates also declared in an imported document', async () => {
        form.setRdfUrlResolver(async () => `${prefixes}
            <urn:Root> a sh:NodeShape .
            <urn:Imported> a sh:NodeShape ;
                sh:property [ sh:path <urn:child> ; sh:node <urn:Child> ] .
            <urn:Child> a sh:NodeShape .
        `)
        await bind(form, `${prefixes}
            <urn:Root> a sh:NodeShape .
            <urn:Ontology> a owl:Ontology ; owl:imports <https://example.org/shapes.ttl> .
        `)
        expect(form.shape?.template.id.value).to.equal('urn:Root')
    })

    it('can select an imported root when no local node shapes exist', async () => {
        form.setRdfUrlResolver(async () => `${prefixes}
            <urn:Child> a sh:NodeShape .
            <urn:Imported> a sh:NodeShape ;
                sh:property [ sh:path <urn:child> ; sh:node <urn:Child> ] .
        `)
        await bind(form, `${prefixes}
            <urn:Ontology> a owl:Ontology ; owl:imports <https://example.org/shapes.ttl> .
        `)
        expect(form.shape?.template.id.value).to.equal('urn:Imported')
    })

    it('follows ontology header imports from the source graph and handles import cycles', async () => {
        const firstUrl = 'https://example.org/first.ttl'
        const secondUrl = 'https://example.org/second.ttl'
        const documents: Record<string, string> = {
            [firstUrl]: `${prefixes}
                <${firstUrl}> a owl:Ontology ; owl:imports <${secondUrl}> .
                <urn:Imported> a sh:NodeShape .
            `,
            [secondUrl]: `${prefixes}
                <${secondUrl}> a owl:Ontology ; owl:imports <${firstUrl}> .
                <urn:Nested> a sh:NodeShape ;
                    sh:property [ sh:path <urn:child> ; sh:node <urn:Child> ] .
                <urn:Child> a sh:NodeShape .
            `
        }
        const resolvedUrls: string[] = []
        form.setRdfUrlResolver(async url => {
            resolvedUrls.push(url)
            return documents[url]
        })
        await bind(form, `${prefixes}
            <urn:Root> a sh:NodeShape .
            <urn:Ontology> a owl:Ontology ; owl:imports <${firstUrl}> .
        `)
        expect(resolvedUrls).to.deep.equal([firstUrl, secondUrl])
        expect(form.shape?.template.id.value).to.equal('urn:Root')
    })

    it('chooses the unreferenced shape that references the most other shapes', async () => {
        await bind(form, `
            ${prefixes}
            <urn:Auxiliary> a sh:NodeShape ;
                sh:targetClass <urn:AuxiliaryClass> .
            <urn:Root> a sh:NodeShape ;
                sh:node <urn:Child> ;
                sh:property [
                    sh:path <urn:owner> ;
                    sh:node <urn:Person>
                ] .
            <urn:Child> a sh:NodeShape ;
                sh:property [ sh:path <urn:name> ; sh:datatype xsd:string ] .
            <urn:Person> a sh:NodeShape ;
                sh:property [ sh:path <urn:name> ; sh:datatype xsd:string ] .
        `)
        expect(form.shape?.template.id.value).to.equal('urn:Root')
    })

    it('does not treat shapes referenced by qualified or logical constraints as roots', async () => {
        await bind(form, `
            ${prefixes}
            <urn:QualifiedChild> a sh:NodeShape ;
                sh:property [ sh:path <urn:name> ; sh:datatype xsd:string ] .
            <urn:ListChild> a sh:NodeShape ;
                sh:property [ sh:path <urn:name> ; sh:datatype xsd:string ] .
            <urn:Parent> a sh:NodeShape ;
                sh:property [
                    sh:path <urn:items> ;
                    sh:qualifiedValueShape <urn:QualifiedChild> ;
                    sh:qualifiedMinCount 1
                ] ;
                sh:or (
                    [ a sh:NodeShape ; sh:node <urn:ListChild> ]
                ) .
        `)
        expect(form.shape?.template.id.value).to.equal('urn:Parent')
    })
})
