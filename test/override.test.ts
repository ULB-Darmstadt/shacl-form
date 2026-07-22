import { expect } from '@open-wc/testing'
import { ShaclForm } from '../src/form'
import { bind, expectIsomorphic, expectValid } from './util'
import '../src/form'

const prefixes = '@prefix : <http://example.org/> . @prefix sh: <http://www.w3.org/ns/shacl#> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .'
const shapeSubject = 'http://example.org/TestShape'
const valuesSubject = 'http://example.org/data'

describe('test property overriding', () => {
    let form: ShaclForm

    before(() => {
        form = document.createElement('shacl-form') as ShaclForm
        form.dataset.generateNodeShapeReference = ''
        document.body.appendChild(form)
    })

    after(() => {
        form.remove()
    })

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

    it('keeps the scalar editor when same-path sh:node shapes are validation-only', async () => {
        await bind(form, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
            sh:property [
                sh:path :license ;
                sh:maxCount 5 ;
            ] , [
                sh:path :license ;
                sh:name "License" ;
                sh:minCount 1 ;
                sh:nodeKind sh:IRIOrLiteral ;
            ] , [
                sh:path :license ;
                sh:in (:license1 :license2) ;
                sh:maxCount 3 ;
            ] , [
                sh:path :license ;
                sh:node :LicenseConstraint ;
                sh:minCount 2 ;
                sh:maxCount 4 ;
            ] .

            :LicenseConstraint a sh:NodeShape ;
                sh:xone (
                    [ sh:nodeKind sh:IRI ]
                    [ sh:datatype xsd:string ]
                ) .
        `)

        const property = form.shape?.template.properties['http://example.org/license']?.[0]
        expect(property).to.exist
        expect(property?.label).to.equal('License')
        expect(property?.minCount).to.equal(2)
        expect(property?.maxCount).to.equal(3)
        expect(property?.nodeShapes.size).to.equal(0)

        const renderRoot = form.shadowRoot ?? form
        const editors = renderRoot.querySelectorAll(`.property-instance[data-path='http://example.org/license'] > .editor`)
        expect(editors.length).to.equal(1)
        const renderedProperty = editors[0].closest('shacl-property')
        expect(renderedProperty?.querySelector('shacl-node')).to.equal(null)
        expect(renderedProperty?.querySelector('.shacl-or-constraint')).to.equal(null)
    })

    it('merges qualified properties with matching node shape specialization chains', async () => {
        await bind(form, `
            ${prefixes}
            :GenericConfig a sh:NodeShape ;
                sh:property [
                    sh:path :assignedParameterSet ;
                    sh:name "generic parameter set" ;
                    sh:qualifiedValueShape :GenericParameterSet ;
                    sh:qualifiedMinCount 1 ;
                    sh:qualifiedMaxCount 5 ;
                ] .

            :DeviceConfig a sh:NodeShape ;
                sh:node :GenericConfig ;
                sh:property [
                    sh:path :assignedParameterSet ;
                    sh:name "device parameter set" ;
                    sh:qualifiedValueShape :DeviceParameterSet ;
                    sh:qualifiedMinCount 2 ;
                    sh:qualifiedMaxCount 3 ;
                ] .

            :GenericParameterSet a sh:NodeShape .
            :IntermediateParameterSet a sh:NodeShape ; sh:node :GenericParameterSet .
            :DeviceParameterSet a sh:NodeShape ; sh:node :IntermediateParameterSet .
            `,
            'http://example.org/DeviceConfig'
        )

        const root = form.shape!.template
        const genericConfig = [...root.extendedShapes][0]
        const merged = genericConfig.properties['http://example.org/assignedParameterSet'][0]

        expect(root.properties['http://example.org/assignedParameterSet']).to.equal(undefined)
        expect(merged.label).to.equal('device parameter set')
        expect(merged.qualifiedValueShape?.id.value).to.equal('http://example.org/DeviceParameterSet')
        expect(merged.qualifiedMinCount).to.equal(2)
        expect(merged.qualifiedMaxCount).to.equal(3)
        expect([...merged.nodeShapes].map(shape => shape.id.value)).to.deep.equal(['http://example.org/DeviceParameterSet'])

        const renderRoot = form.shadowRoot ?? form
        expect(renderRoot.querySelectorAll(`[data-path='http://example.org/assignedParameterSet']`).length).to.equal(1)
    })

    it('keeps qualified properties separate when their value shapes are not specializations', async () => {
        await bind(form, `
            ${prefixes}
            :GenericConfig a sh:NodeShape ;
                sh:property [
                    sh:path :assignedParameterSet ;
                    sh:qualifiedValueShape :GenericParameterSet ;
                    sh:qualifiedMinCount 1 ;
                    sh:maxCount 1 ;
                ] .

            :DeviceConfig a sh:NodeShape ;
                sh:node :GenericConfig ;
                sh:property [
                    sh:path :assignedParameterSet ;
                    sh:qualifiedValueShape :UnrelatedParameterSet ;
                    sh:qualifiedMinCount 1 ;
                ] .

            :GenericParameterSet a sh:NodeShape .
            :UnrelatedParameterSet a sh:NodeShape .
            `,
            'http://example.org/DeviceConfig'
        )

        const root = form.shape!.template
        const genericConfig = [...root.extendedShapes][0]
        expect(root.properties['http://example.org/assignedParameterSet'].length).to.equal(1)
        expect(genericConfig.properties['http://example.org/assignedParameterSet'].length).to.equal(1)

        const renderRoot = form.shadowRoot ?? form
        expect(renderRoot.querySelectorAll(`[data-path='http://example.org/assignedParameterSet']`).length).to.equal(2)
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

    it('merges overridden properties for lazily resolved sh:xone node shapes', async () => {
        const previousView = form.dataset.view
        form.dataset.view = 'true'
        try {
            const [shapesQuads, inputQuads] = await bind(form, `
                ${prefixes}
                @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

                :RootShape a sh:NodeShape ;
                sh:xone (
                    [
                        sh:property [
                            sh:name "Child 1" ;
                            sh:path :entry ;
                            sh:qualifiedValueShape :ChildShape ;
                            sh:qualifiedMinCount 1 ;
                            sh:qualifiedMaxCount 1 ;
                        ] ;
                    ]
                    [
                        sh:property [
                            sh:name "Child 2" ;
                            sh:path :entry ;
                            sh:qualifiedValueShape :ChildShape2 ;
                            sh:qualifiedMinCount 1 ;
                            sh:qualifiedMaxCount 1 ;
                        ] ;
                    ]
                ) .

                :ChildShape a sh:NodeShape ;
                sh:node :BaseShape ;
                sh:property [
                    sh:name "child label" ;
                    sh:path rdfs:label ;
                    sh:hasValue "Fixed label" ;
                ] .

                :ChildShape2 a sh:NodeShape ;
                sh:node :BaseShape ;
                sh:property [
                    sh:name "child label 2" ;
                    sh:path rdfs:label ;
                    sh:hasValue "Another fixed label" ;
                ] .

                :BaseShape a sh:NodeShape ;
                sh:property [
                    sh:path rdfs:label ;
                    sh:name "label" ;
                    sh:datatype xsd:string ;
                    sh:minCount 1 ;
                    sh:maxCount 1 ;
                ] .
                `,
                'http://example.org/RootShape', `
                ${prefixes}
                @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

                <${valuesSubject}> :entry [
                    rdfs:label "Fixed label" ;
                ] .`,
                valuesSubject
            )

            await expectValid(form, shapesQuads)
            expectIsomorphic(inputQuads, form.toRDF().getQuads(null, null, null, null))

            const renderRoot = form.shadowRoot ?? form
            const childNode = renderRoot.querySelector('shacl-node shacl-node') as HTMLElement | null
            expect(childNode, 'expected nested child node to be rendered').to.exist

            const labelInstances = childNode!.querySelectorAll(`[data-path='http://www.w3.org/2000/01/rdf-schema#label']`)
            expect(labelInstances.length, 'expected overridden label property to be merged').to.equal(1)

            const labels = Array.from(childNode!.querySelectorAll('.property-instance > label')).map(label => label.textContent?.trim())
            expect(labels).to.deep.equal(['child label:'])
        } finally {
            if (previousView === undefined) {
                delete form.dataset.view
            } else {
                form.dataset.view = previousView
            }
        }
    })

    it('filters incompatible sh:xone branches after overriding a property datatype', async () => {
        await bind(form, `
            ${prefixes}
            :BaseShape a sh:NodeShape ;
            sh:property [
                sh:path :value ;
                sh:maxCount 1 ;
                sh:xone (
                    [ sh:datatype xsd:string ; sh:maxLength 20 ]
                    [ sh:datatype xsd:integer ]
                ) ;
            ] .

            :ChildShape a sh:NodeShape ;
            sh:node :BaseShape ;
            sh:property [
                sh:path :value ;
                sh:datatype xsd:string ;
            ] .

            <${shapeSubject}> a sh:NodeShape ;
            sh:property [
                sh:path :entry ;
                sh:qualifiedValueShape :ChildShape ;
                sh:qualifiedMinCount 1 ;
                sh:qualifiedMaxCount 1 ;
            ] .
            `,
            shapeSubject
        )

        const childShape = form.shape?.template.properties['http://example.org/entry']?.[0].qualifiedValueShape
        const mergedShape = childShape ? Array.from(childShape.extendedShapes)[0] : undefined
        const property = mergedShape?.properties['http://example.org/value']?.[0]

        expect(property).to.exist
        expect(property?.datatype?.value).to.equal('http://www.w3.org/2001/XMLSchema#string')
        expect(property?.maxLength).to.equal(20)
        expect(property?.xone).to.equal(undefined)
    })
})
