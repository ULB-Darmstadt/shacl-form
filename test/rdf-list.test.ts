import { expect } from '@open-wc/testing'
import { ShaclForm } from '../src/form'
import type { Editor } from '../src/theme'
import type { ShaclProperty } from '../src/property'
import { bind, expectIsomorphic, expectValid } from './util'
import '../src/form'

const prefixes = `
    @prefix : <http://example.org/> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .`
const shapeSubject = 'http://example.org/DiscreteNumericalVariableShape'
const valuesSubject = 'http://example.org/data'
const shapes = `
    ${prefixes}
    :DiscreteNumericalVariableShape a sh:NodeShape ;
        sh:property [
            sh:path :hasDiscreteValues ;
            sh:name "Discrete values" ;
            sh:minCount 1 ;
            sh:maxCount 1 ;
            sh:node :NumericalListShape
        ] .

    :NumericalListShape a sh:NodeShape ;
        sh:property [
            sh:path rdf:first ;
            sh:minCount 1 ;
            sh:maxCount 1 ;
            sh:datatype xsd:decimal
        ] ;
        sh:property [
            sh:path rdf:rest ;
            sh:minCount 1 ;
            sh:maxCount 1 ;
            sh:or (
                [ sh:hasValue rdf:nil ]
                [ sh:node :NumericalListShape ]
            )
        ] .`

describe('RDF list properties', () => {
    let form: ShaclForm

    beforeEach(() => {
        form = document.createElement('shacl-form') as ShaclForm
        form.dataset.generateNodeShapeReference = ''
        document.body.appendChild(form)
    })

    afterEach(() => form.remove())

    it('renders list members as repeatable item editors and serializes an RDF collection', async () => {
        const [shapesQuads] = await bind(form, shapes, shapeSubject)
        const property = form.form.querySelector<ShaclProperty>('shacl-property')!

        expect(property.template.path).to.equal('http://example.org/hasDiscreteValues')
        expect(property.querySelectorAll(':scope > .property-instance')).to.have.length(1)
        expect(property.querySelector('shacl-node')).not.to.exist
        expect(property.querySelector('.shacl-or-constraint')).not.to.exist

        const first = property.querySelector<Editor>(':scope > .property-instance > .editor')!
        first.value = '1.5'
        ;(property.querySelector(':scope > .add-button-wrapper > .add-button') as HTMLElement).click()
        await new Promise(resolve => setTimeout(resolve, 0))
        const editors = property.querySelectorAll<Editor>(':scope > .property-instance > .editor')
        expect(editors).to.have.length(2)
        editors[1].value = '2.75'

        const graph = form.toRDF()
        const head = graph.getObjects(form.shape!.nodeId, 'http://example.org/hasDiscreteValues', null)[0]
        const tail = graph.getObjects(head, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest', null)[0]
        expect(graph.getObjects(head, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first', null)[0].value).to.equal('1.5')
        expect(graph.getObjects(tail, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first', null)[0].value).to.equal('2.75')
        expect(graph.getObjects(tail, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest', null)[0].value)
            .to.equal('http://www.w3.org/1999/02/22-rdf-syntax-ns#nil')
        await expectValid(form, shapesQuads)
    })

    it('binds an existing RDF collection without exposing its first/rest nodes', async () => {
        const values = `
            ${prefixes}
            <${valuesSubject}> :hasDiscreteValues (1.5 2.75 4.0) .`
        const [shapesQuads, inputQuads] = await bind(form, shapes, shapeSubject, values, valuesSubject)
        const property = form.form.querySelector<ShaclProperty>('shacl-property')!
        const editors = property.querySelectorAll<Editor>(':scope > .property-instance > .editor')

        expect(Array.from(editors).map(editor => editor.value)).to.deep.equal(['1.5', '2.75', '4.0'])
        expect(property.querySelector('shacl-node')).not.to.exist
        expect(property.querySelector('.shacl-or-constraint')).not.to.exist
        await expectValid(form, shapesQuads)
        expectIsomorphic(inputQuads, form.toRDF().getQuads(null, null, null, null))
    })

    it('removes stale collection cells when preserving unmapped values', async () => {
        form.dataset.preserveUnmappedValues = ''
        const values = `
            ${prefixes}
            <${valuesSubject}> :hasDiscreteValues _:head ; :unmapped "keep me" .
            _:head rdf:first 1.5 ; rdf:rest _:tail .
            _:tail rdf:first _:item ; rdf:rest rdf:nil ; :note _:details .
            _:item :itemMetadata "remove me" .
            _:details :detail "remove me too" .`
        await bind(form, shapes, shapeSubject, values, valuesSubject)
        const property = form.form.querySelector<ShaclProperty>('shacl-property')!
        const second = property.querySelectorAll<HTMLElement>(':scope > .property-instance')[1]
        second.remove()

        const graph = form.toRDF()
        const head = graph.getObjects(valuesSubject, 'http://example.org/hasDiscreteValues', null)[0]
        expect(graph.getObjects(head, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest', null)[0].value)
            .to.equal('http://www.w3.org/1999/02/22-rdf-syntax-ns#nil')
        expect(graph.getObjects(valuesSubject, 'http://example.org/unmapped', null)[0].value).to.equal('keep me')
        expect(graph.getQuads(null, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first', null, null)).to.have.length(1)
        expect(graph.getQuads(null, 'http://example.org/note', null, null)).to.have.length(0)
        expect(graph.getQuads(null, 'http://example.org/itemMetadata', null, null)).to.have.length(0)
        expect(graph.getQuads(null, 'http://example.org/detail', null, null)).to.have.length(0)
    })

    it('keeps multiple list heads lossless instead of flattening invalid input', async () => {
        const values = `
            ${prefixes}
            <${valuesSubject}> :hasDiscreteValues (1.5 2.75), (4.0 8.0) .`
        const [, inputQuads] = await bind(form, shapes, shapeSubject, values, valuesSubject)
        const property = form.form.querySelector<ShaclProperty>('shacl-property')!

        expect(property.querySelectorAll(':scope > .property-instance > .editor')).to.have.length(4)
        expect(property.classList.contains('may-add')).to.be.false
        expectIsomorphic(inputQuads, form.toRDF().getQuads(null, null, null, null))
        expect((await form.validate()).conforms).to.be.false
    })

    it('does not offer generic resource linking for a list property', async () => {
        let listRequests = 0
        form.setResourceLinkProvider({
            lazyLoad: false,
            listConformingResources: async () => {
                listRequests++
                return { 'http://example.org/NumericalListShape': ['http://example.org/list'] }
            },
            loadResources: async () => []
        })
        await bind(form, shapes, shapeSubject)
        const property = form.form.querySelector<ShaclProperty>('shacl-property')!

        expect(property.querySelector('.link-button')).not.to.exist
        expect(listRequests).to.equal(0)
    })

    it('keeps an externally supplied list read-only and serializes its head link', async () => {
        form.setResourceLinkProvider({
            lazyLoad: false,
            listConformingResources: async () => ({}),
            loadResources: async resourceIds => resourceIds.map(resourceId => ({
                resourceId,
                resourceRDF: `${prefixes} <${resourceId}> rdf:first 1.5 ; rdf:rest rdf:nil .`
            }))
        })
        await bind(form, shapes, shapeSubject, `
            ${prefixes}
            <${valuesSubject}> :hasDiscreteValues <http://example.org/list> .`, valuesSubject)
        const property = form.form.querySelector<ShaclProperty>('shacl-property')!

        expect(property.querySelector(':scope > .property-instance.linked')).to.exist
        expect(property.classList.contains('may-add')).to.be.false
        const graph = form.toRDF()
        expect(graph.getObjects(valuesSubject, 'http://example.org/hasDiscreteValues', null)[0].value).to.equal('http://example.org/list')
        expect(graph.getQuads(null, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first', null, null)).to.have.length(0)
    })

    it('does not flatten list shapes with additional list-cell properties', async () => {
        const additionalProperties = [
            'sh:property [ sh:path :note ; sh:minCount 1 ; sh:maxCount 1 ] ;',
            'sh:property [ sh:path rdf:first ; sh:datatype xsd:integer ] ;'
        ]
        for (const additionalProperty of additionalProperties) {
            const extendedShape = shapes.replace(
                ':NumericalListShape a sh:NodeShape ;',
                `:NumericalListShape a sh:NodeShape ; ${additionalProperty}`
            )
            await bind(form, extendedShape, shapeSubject)
            const property = Array.from(form.form.querySelectorAll<ShaclProperty>('shacl-property'))
                .find(candidate => candidate.template.path === 'http://example.org/hasDiscreteValues')!

            expect(property.querySelector(':scope > .property-instance > shacl-node')).to.exist
        }
    })

    it('does not flatten list items with constraints that require property-level handling', async () => {
        const unsupportedFirstConstraints = [
            'sh:or ( [ sh:datatype xsd:decimal ] [ sh:datatype xsd:integer ] )',
            'sh:xone ( [ sh:datatype xsd:decimal ] [ sh:datatype xsd:integer ] )',
            'sh:hasValue 1.5'
        ]
        for (const constraint of unsupportedFirstConstraints) {
            await bind(form, shapes.replace('sh:datatype xsd:decimal', constraint), shapeSubject)
            const property = Array.from(form.form.querySelectorAll<ShaclProperty>('shacl-property'))
                .find(candidate => candidate.template.path === 'http://example.org/hasDiscreteValues')!

            expect(property.querySelector(':scope > .property-instance > shacl-node')).to.exist
        }
    })

    it('supports resource node kinds and classes on the outer list property', async () => {
        const nodeKinds = [
            { value: 'IRI', expectedTermType: 'NamedNode' },
            { value: 'BlankNode', expectedTermType: 'BlankNode' },
            { value: 'BlankNodeOrIRI', expectedTermType: 'BlankNode' }
        ]
        for (const nodeKind of nodeKinds) {
            form.dataset.valuesNamespace = 'urn:list:'
            const constrainedShape = shapes.replace(
                'sh:node :NumericalListShape',
                `sh:node :NumericalListShape ; sh:nodeKind sh:${nodeKind.value} ; sh:class :ListClass`
            )
            const [shapesQuads] = await bind(form, constrainedShape, shapeSubject)
            const property = form.form.querySelector<ShaclProperty>('shacl-property')!
            property.querySelector<Editor>(':scope > .property-instance > .editor')!.value = '1.5'

            const graph = form.toRDF()
            const head = graph.getObjects(form.shape!.nodeId, 'http://example.org/hasDiscreteValues', null)[0]
            expect(head.termType).to.equal(nodeKind.expectedTermType)
            expect(graph.countQuads(head, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', 'http://example.org/ListClass', null)).to.equal(1)
            await expectValid(form, shapesQuads)
        }
    })

    it('creates and binds class-constrained nested list members', async () => {
        const petListShapes = `${shapes.replace(
            'sh:datatype xsd:decimal',
            'sh:class :Pet ; sh:node :PetShape'
        )}
            :PetShape a sh:NodeShape ;
                sh:targetClass :Pet ;
                sh:property [
                    sh:path :name ;
                    sh:minCount 1 ;
                    sh:maxCount 1
                ] .`
        const [shapesQuads] = await bind(form, petListShapes, shapeSubject)
        let property = Array.from(form.form.querySelectorAll<ShaclProperty>('shacl-property'))
            .find(candidate => candidate.template.path === 'http://example.org/hasDiscreteValues')!
        let pet = property.querySelector<HTMLElement>(':scope > .property-instance > shacl-node')!
        pet.querySelector<Editor>('.editor')!.value = 'Fido'

        let graph = form.toRDF()
        let head = graph.getObjects(form.shape!.nodeId, 'http://example.org/hasDiscreteValues', null)[0]
        let member = graph.getObjects(head, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first', null)[0]
        expect(graph.countQuads(member, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', 'http://example.org/Pet', null)).to.equal(1)
        expect(graph.getObjects(member, 'http://example.org/name', null)[0].value).to.equal('Fido')
        await expectValid(form, shapesQuads)

        const values = `${prefixes}
            <${valuesSubject}> :hasDiscreteValues ( _:pet ) .
            _:pet a :Pet ; :name "Sparky" .`
        const [, inputQuads] = await bind(form, petListShapes, shapeSubject, values, valuesSubject)
        property = Array.from(form.form.querySelectorAll<ShaclProperty>('shacl-property'))
            .find(candidate => candidate.template.path === 'http://example.org/hasDiscreteValues')!
        pet = property.querySelector<HTMLElement>(':scope > .property-instance > shacl-node')!
        expect(pet.querySelector<Editor>('.editor')!.value).to.equal('Sparky')
        graph = form.toRDF()
        expectIsomorphic(inputQuads, graph.getQuads(null, null, null, null))
    })

    it('removes a replaced blank-node member subgraph when preserving unmapped values', async () => {
        form.dataset.preserveUnmappedValues = ''
        const classListShapes = shapes.replace('sh:datatype xsd:decimal', 'sh:class :Pet')
        await bind(form, classListShapes, shapeSubject, `${prefixes}
            <${valuesSubject}> :hasDiscreteValues ( _:oldPet ) .
            _:oldPet a :Pet ; :oldMetadata "remove me" .
            :newPet a :Pet ; :newMetadata "keep me" .`, valuesSubject)
        const property = form.form.querySelector<ShaclProperty>('shacl-property')!
        property.querySelector<Editor>(':scope > .property-instance > .editor')!.value = 'http://example.org/newPet'

        const graph = form.toRDF()
        const head = graph.getObjects(valuesSubject, 'http://example.org/hasDiscreteValues', null)[0]
        expect(graph.getObjects(head, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first', null)[0].value).to.equal('http://example.org/newPet')
        expect(graph.countQuads(null, 'http://example.org/oldMetadata', null, null)).to.equal(0)
        expect(graph.getObjects('http://example.org/newPet', 'http://example.org/newMetadata', null)[0].value).to.equal('keep me')
    })
})
