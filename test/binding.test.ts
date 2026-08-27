import { expect, waitUntil } from '@open-wc/testing'
import { DataFactory, Store } from 'n3'
import { ShaclForm } from '../src/form'
import type { ShaclNode } from '../src/node'
import type { ShaclProperty } from '../src/property'
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

    it('binds and serializes every RDF object term type and SHACL node-kind union', async () => {
        const cases = [
            { nodeKind: 'IRI', value: '<urn:example:iri>' },
            { nodeKind: 'BlankNode', value: '_:blank' },
            { nodeKind: 'Literal', value: '"plain literal"' },
            { nodeKind: 'Literal', value: '"language literal"@en' },
            { nodeKind: 'Literal', value: '"42"^^xsd:integer' },
            { nodeKind: 'BlankNodeOrIRI', value: '<urn:example:blank-or-iri>' },
            { nodeKind: 'BlankNodeOrIRI', value: '_:blankOrIri' },
            { nodeKind: 'BlankNodeOrLiteral', value: '_:blankOrLiteral' },
            { nodeKind: 'BlankNodeOrLiteral', value: '"blank or literal"' },
            { nodeKind: 'IRIOrLiteral', value: '<urn:example:iri-or-literal>' },
            { nodeKind: 'IRIOrLiteral', value: '"iri or literal"@de' }
        ]

        for (const { nodeKind, value } of cases) {
            const [shapesQuads, inputQuads] = await bind(form, `
                ${prefixes}
                <${shapeSubject}> a sh:NodeShape ;
                    sh:property [
                        sh:path :path ;
                        sh:nodeKind sh:${nodeKind} ;
                        sh:minCount 1 ;
                        sh:maxCount 1
                    ] .`,
                shapeSubject, `
                ${prefixes}
                <${valuesSubject}> :path ${value} .`,
                valuesSubject
            )

            await expectValid(form, shapesQuads)
            expectIsomorphic(inputQuads, form.toRDF().getQuads(null, null, null, null))
        }
    }).timeout(4000)

    it('keeps sh:class choices synchronized with generated nodes', async () => {
        await bind(form, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
                sh:property [
                    sh:path :people ;
                    sh:node :PersonShape ;
                    sh:minCount 1 ;
                    sh:maxCount 2
                ] ;
                sh:property [
                    sh:path :activity ;
                    sh:node :ActivityShape ;
                    sh:minCount 1 ;
                    sh:maxCount 1
                ] .

            :PersonShape a sh:NodeShape ;
                sh:targetClass :Agent .

            :ActivityShape a sh:NodeShape ;
                sh:property [
                    sh:path :associatedWith ;
                    sh:class :Agent ;
                    sh:minCount 1 ;
                    sh:maxCount 1
                ] .`,
            shapeSubject
        )

        const renderRoot = form.shadowRoot ?? form
        const properties = Array.from(renderRoot.querySelectorAll<ShaclProperty>('shacl-property'))
        const people = properties.find(property => property.template.path === 'http://example.org/people')!
        const associatedWith = properties.find(property => property.template.path === 'http://example.org/associatedWith')!
        const generatedPeople = () => Array.from(people.querySelectorAll<ShaclNode>(':scope > .property-instance > shacl-node'))
        const choices = () => Array.from(associatedWith.querySelectorAll<HTMLElement>(':scope > .property-instance > .editor > ul li'))

        expect(generatedPeople()).to.have.length(1)
        expect(choices().map(choice => choice.dataset.value)).to.deep.equal([generatedPeople()[0].nodeId.id])

        const editor = associatedWith.querySelector<HTMLElement & { value: string }>(':scope > .property-instance > .editor')!
        editor.value = generatedPeople()[0].nodeId.id
        const selected = form.toRDF().getObjects(null, 'http://example.org/associatedWith', null)[0]
        expect(selected.termType).to.equal('BlankNode')
        expect(selected.value).to.equal(generatedPeople()[0].nodeId.value)

        let changed = awaitNextFormChange(form)
        ;(people.querySelector(':scope > .add-button-wrapper > .add-button') as HTMLElement).click()
        await changed
        expect(generatedPeople()).to.have.length(2)
        expect(choices().map(choice => choice.dataset.value)).to.have.members(generatedPeople().map(node => node.nodeId.id))

        const secondPerson = people.querySelectorAll<HTMLElement>(':scope > .property-instance')[1]
        changed = awaitNextFormChange(form)
        ;(secondPerson.querySelector(':scope > .remove-button-wrapper > .remove-button') as HTMLElement).click()
        await changed
        expect(generatedPeople()).to.have.length(1)
        expect(choices().map(choice => choice.dataset.value)).to.deep.equal([generatedPeople()[0].nodeId.id])
    }).timeout(4000)

    it('links a person from an earlier sh:or property instance', async () => {
        await bind(form, `
            ${prefixes}
            @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

            <${shapeSubject}> a sh:NodeShape ;
                sh:property [
                    sh:path :attribution ;
                    sh:node :AttributionShape ;
                    sh:minCount 1 ;
                    sh:maxCount 2
                ] .

            :AttributionShape a sh:NodeShape ;
                sh:targetClass :Attribution ;
                sh:property [
                    sh:path :agent ;
                    sh:minCount 1 ;
                    sh:maxCount 1 ;
                    sh:or (
                        [ sh:class :Person ; sh:node :PersonShape ; rdfs:label "Person" ]
                        [ sh:class :Organisation ; sh:node :OrganisationShape ; rdfs:label "Organisation" ]
                    )
                ] .

            :PersonShape a sh:NodeShape ;
                sh:targetClass :Person ;
                sh:property [ sh:path rdfs:label ; sh:minCount 1 ; sh:maxCount 1 ] .

            :OrganisationShape a sh:NodeShape ;
                sh:targetClass :Organisation ;
                sh:property [ sh:path rdfs:label ; sh:minCount 1 ; sh:maxCount 1 ] .`,
            shapeSubject, `
            ${prefixes}
            @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
            <${valuesSubject}> :attribution _:first .
            _:first a :Attribution ; :agent _:jane .
            _:jane a :Person ; rdfs:label "Jane Doe" .`,
            valuesSubject
        )

        const renderRoot = form.shadowRoot ?? form
        const attribution = Array.from(renderRoot.querySelectorAll<ShaclProperty>('shacl-property'))
            .find(property => property.template.path === 'http://example.org/attribution')!
        ;(attribution.querySelector(':scope > .add-button-wrapper > .add-button') as HTMLElement).click()
        await new Promise(resolve => setTimeout(resolve, 0))

        const agentProperties = Array.from(renderRoot.querySelectorAll<ShaclProperty>('shacl-property'))
            .filter(property => property.template.path === 'http://example.org/agent')
        expect(agentProperties).to.have.length(2)
        const secondAgent = agentProperties[1]
        const chooser = secondAgent.querySelector<HTMLSelectElement>(':scope > .shacl-or-constraint .editor')!
        const chooserOptions = Array.from(chooser.querySelectorAll<HTMLElement>(':scope > ul > li'))
        expect(chooserOptions.map(option => option.innerText)).to.deep.equal(['Person', 'Organisation'])

        chooser.value = chooserOptions[0].dataset.value!
        await chooser.onchange!(new Event('change'))
        const selectedAgent = Array.from(renderRoot.querySelectorAll<ShaclProperty>('shacl-property'))
            .filter(property => property.template.path === 'http://example.org/agent')[1]
        expect(selectedAgent.querySelector(':scope > .add-button-wrapper > .link-button')).to.exist
        expect(selectedAgent.querySelector(':scope > .add-button-wrapper > .add-button')).to.exist
        ;(selectedAgent.querySelector(':scope > .add-button-wrapper > .link-button') as HTMLElement).click()
        await waitUntil(() => renderRoot.querySelector('.link-chooser .link-option'))
        const linkOption = Array.from(renderRoot.querySelectorAll<HTMLElement>('.link-chooser .link-option'))
            .find(option => option.innerText === 'Jane Doe')!
        linkOption.click()
        await new Promise(resolve => setTimeout(resolve, 0))

        const graph = form.toRDF()
        const attributions = graph.getObjects(null, 'http://example.org/attribution', null)
        expect(attributions).to.have.length(2)
        const agents = attributions.map(subject => graph.getObjects(subject, 'http://example.org/agent', null)[0])
        expect(agents[0].equals(agents[1])).to.be.true
        const linkedNode = selectedAgent.querySelector('shacl-node[part~="linked-node"]')!
        expect(linkedNode).to.exist
        expect(linkedNode.querySelector('.ref-link')?.textContent).to.equal('Jane Doe')
    }).timeout(4000)

    it('offers ResourceLinkProvider entities in an sh:or chooser', async () => {
        const providerForm = document.createElement('shacl-form') as ShaclForm
        providerForm.dataset.generateNodeShapeReference = ''
        document.body.appendChild(providerForm)
        providerForm.setResourceLinkProvider({
            lazyLoad: false,
            listConformingResources: async shapeIds => {
                expect(shapeIds).to.deep.equal(['http://example.org/PersonShape'])
                return { 'http://example.org/PersonShape': ['http://example.org/alice'] }
            },
            loadResources: async resourceIds => {
                expect(resourceIds).to.deep.equal(['http://example.org/alice'])
                return [{
                    resourceId: 'http://example.org/alice',
                    resourceRDF: `${prefixes} @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
                        :alice a :Person ; rdfs:label "External Alice" .`
                }]
            }
        })

        await bind(providerForm, `
            ${prefixes}
            @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
            <${shapeSubject}> a sh:NodeShape ;
                sh:property [
                    sh:path :agent ;
                    sh:minCount 1 ;
                    sh:maxCount 1 ;
                    sh:or (
                        [ sh:class :Person ; sh:node :PersonShape ; rdfs:label "Person" ]
                        [ sh:class :Organisation ; sh:node :OrganisationShape ; rdfs:label "Organisation" ]
                    )
                ] .
            :PersonShape a sh:NodeShape ; sh:targetClass :Person .
            :OrganisationShape a sh:NodeShape ; sh:targetClass :Organisation .`,
            shapeSubject
        )

        const renderRoot = providerForm.shadowRoot ?? providerForm
        const chooser = renderRoot.querySelector<HTMLSelectElement>('.shacl-or-constraint .editor')!
        const chooserOptions = Array.from(chooser.querySelectorAll<HTMLElement>(':scope > ul > li'))
        expect(chooserOptions.map(option => option.innerText)).to.deep.equal(['Person', 'Organisation'])
        chooser.value = chooserOptions[0].dataset.value!
        await chooser.onchange!(new Event('change'))
        const selectedAgent = renderRoot.querySelector<ShaclProperty>('shacl-property')!
        expect(selectedAgent.querySelector(':scope > .add-button-wrapper > .link-button')).to.exist
        expect(selectedAgent.querySelector(':scope > .add-button-wrapper > .add-button')).to.exist
        ;(selectedAgent.querySelector(':scope > .add-button-wrapper > .link-button') as HTMLElement).click()
        await new Promise(resolve => setTimeout(resolve, 0))
        const linkOption = Array.from(renderRoot.querySelectorAll<HTMLElement>('.link-chooser .link-option'))
            .find(option => option.innerText === 'External Alice')!
        linkOption.click()
        await new Promise(resolve => setTimeout(resolve, 0))

        const agent = providerForm.toRDF().getObjects(null, 'http://example.org/agent', null)[0]
        expect(agent.termType).to.equal('NamedNode')
        expect(agent.value).to.equal('http://example.org/alice')
        providerForm.remove()
    }).timeout(4000)

    it('loads lazy ResourceLinkProvider entities from an sh:or chooser', async () => {
        const providerForm = document.createElement('shacl-form') as ShaclForm
        document.body.appendChild(providerForm)
        providerForm.setResourceLinkProvider({
            lazyLoad: true,
            listConformingResources: async () => ({
                'http://example.org/PersonShape': ['http://example.org/bob']
            }),
            loadResources: async () => [{
                resourceId: 'http://example.org/bob',
                resourceRDF: `${prefixes} @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
                    :bob a :Person ; rdfs:label "External Bob" .`
            }]
        })
        await bind(providerForm, `
            ${prefixes}
            @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
            <${shapeSubject}> a sh:NodeShape ;
                sh:property [
                    sh:path :agent ;
                    sh:minCount 1 ;
                    sh:maxCount 1 ;
                    sh:or ([ sh:class :Person ; sh:node :PersonShape ; rdfs:label "Person" ])
                ] .
            :PersonShape a sh:NodeShape ; sh:targetClass :Person .`,
            shapeSubject
        )

        const renderRoot = providerForm.shadowRoot ?? providerForm
        const chooser = renderRoot.querySelector<HTMLSelectElement>('.shacl-or-constraint .editor')!
        const personOption = chooser.querySelector<HTMLElement>(':scope > ul > li')!
        expect(personOption.innerText).to.equal('Person')
        chooser.value = personOption.dataset.value!
        await chooser.onchange!(new Event('change'))
        const selectedAgent = renderRoot.querySelector<ShaclProperty>('shacl-property')!
        ;(selectedAgent.querySelector(':scope > .add-button-wrapper > .link-button') as HTMLElement).click()
        await waitUntil(() => renderRoot.querySelector('.link-chooser .link-option'))
        const options = Array.from(renderRoot.querySelectorAll<HTMLElement>('.link-chooser .link-option')).map(option => option.innerText)
        expect(options).to.deep.equal(['External Bob'])
        providerForm.remove()
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

    it('omits an optional unchecked xsd:boolean instead of serializing the checkbox value', async () => {
        await bind(form, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
            sh:property [
                sh:path :path ;
                sh:datatype xsd:boolean ;
                sh:maxCount 1 ;
            ] .`,
            shapeSubject
        )

        const renderRoot = form.shadowRoot ?? form
        const editor = renderRoot.querySelector('.editor') as HTMLInputElement
        expect(editor.type).to.equal('checkbox')
        expect(editor.checked).to.be.false
        expect(form.toRDF().getObjects(null, 'http://example.org/path', null)).to.be.empty

        editor.checked = true
        const literal = form.toRDF().getObjects(null, 'http://example.org/path', null)[0]
        expect(literal.value).to.equal('true')
        expect(literal.datatype.value).to.equal('http://www.w3.org/2001/XMLSchema#boolean')
    })

    it('serializes an unchecked required xsd:boolean as false', async () => {
        await bind(form, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
            sh:property [
                sh:path :path ;
                sh:datatype xsd:boolean ;
                sh:minCount 1 ;
                sh:maxCount 1 ;
            ] .`,
            shapeSubject
        )

        const literal = form.toRDF().getObjects(null, 'http://example.org/path', null)[0]
        expect(literal.value).to.equal('false')
        expect(literal.datatype.value).to.equal('http://www.w3.org/2001/XMLSchema#boolean')
    })

    for (const datatype of ['float', 'double', 'decimal']) {
        it(`accepts dot and comma decimal separators for xsd:${datatype}`, async () => {
            await bind(form, `
                ${prefixes}
                <${shapeSubject}> a sh:NodeShape ;
                sh:property [
                    sh:path :path ;
                    sh:datatype xsd:${datatype} ;
                    sh:minCount 1 ;
                    sh:maxCount 1 ;
                ] .`,
                shapeSubject
            )

            const renderRoot = form.shadowRoot ?? form
            const editor = renderRoot.querySelector('.editor') as HTMLElement & {
                inputElement: HTMLInputElement
                type: string
                updateComplete: Promise<boolean>
                value: string
                validationMessage: string
            }
            await editor.updateComplete
            expect(editor.type).to.equal('text')
            expect(editor.inputElement.inputMode).to.equal('decimal')

            for (const input of ['2.2', '2,2']) {
                editor.value = input
                await editor.updateComplete
                expect(editor.inputElement.checkValidity()).to.be.true
                editor.dispatchEvent(new Event('change', { bubbles: true }))
                const literal = form.toRDF().getObjects(null, 'http://example.org/path', null)[0]
                expect(literal?.value).to.equal('2.2')
                expect(literal?.datatype.value).to.equal(`http://www.w3.org/2001/XMLSchema#${datatype}`)
            }

            editor.value = '1e10'
            await editor.updateComplete
            editor.dispatchEvent(new Event('change', { bubbles: true }))
            const exponentLiteral = form.toRDF().getObjects(null, 'http://example.org/path', null)[0]
            if (datatype === 'decimal') {
                expect(exponentLiteral).to.be.undefined
            } else {
                expect(exponentLiteral?.value).to.equal('1e10')
                expect(exponentLiteral?.datatype.value).to.equal(`http://www.w3.org/2001/XMLSchema#${datatype}`)
            }

            editor.inputElement.value = 'not a number'
            editor.inputElement.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
            await editor.updateComplete
            expect(editor.inputElement.checkValidity()).to.be.false
            expect(editor.validationMessage).to.equal(`Value does not have datatype http://www.w3.org/2001/XMLSchema#${datatype}`)
        })
    }

    it('does not show a valid marker for an ORCID ID that violates sh:pattern', async () => {
        await bind(form, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
            sh:property [
                sh:path :path ;
                sh:datatype xsd:string ;
                sh:pattern "^https://orcid.org/\\\\d{4}-\\\\d{4}-\\\\d{4}-\\\\d{4}$" ;
                sh:maxCount 1 ;
            ] .`,
            shapeSubject
        )

        const renderRoot = form.shadowRoot ?? form
        const editor = renderRoot.querySelector('.editor') as HTMLElement & {
            inputElement: HTMLInputElement
            validity: ValidityState
        }
        const propertyInstance = editor.parentElement!
        propertyInstance.classList.add('valid')

        editor.inputElement.value = 'invalid'
        editor.inputElement.dispatchEvent(new Event('input', { bubbles: true }))
        expect(editor.validity.patternMismatch).to.be.true

        const validation = form.validate(true)
        expect(propertyInstance.classList.contains('valid')).to.be.false
        expect(propertyInstance.classList.contains('invalid')).to.be.true
        await validation
        expect(propertyInstance.classList.contains('invalid')).to.be.true
        expect(propertyInstance.querySelector<HTMLElement>('.validation-error')?.title.split('\n')).to.have.lengthOf(2)
    })

    it('prefers an explicit sh:message over the native validation message', async () => {
        await bind(form, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
            sh:property [
                sh:path :path ;
                sh:datatype xsd:string ;
                sh:pattern "^valid$" ;
                sh:message "Enter a valid identifier" ;
                sh:maxCount 1 ;
            ] .`,
            shapeSubject
        )

        const renderRoot = form.shadowRoot ?? form
        const editor = renderRoot.querySelector('.editor') as HTMLElement & {
            inputElement: HTMLInputElement
        }
        editor.inputElement.value = 'invalid'
        editor.inputElement.dispatchEvent(new Event('input', { bubbles: true }))

        await form.validate(true)
        expect(editor.parentElement?.querySelector<HTMLElement>('.validation-error')?.title).to.equal('Enter a valid identifier')
    })

    it('marks duplicate languages invalid through nested sh:node validation results', async () => {
        await bind(form, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
                sh:node :DatasetShape .
            :DatasetShape a sh:NodeShape ;
                sh:property [
                    sh:path :name ;
                    sh:datatype <http://www.w3.org/1999/02/22-rdf-syntax-ns#langString> ;
                    sh:uniqueLang true ;
                    sh:minCount 1 ;
                    sh:maxCount 2
                ] .`,
            shapeSubject, `
            ${prefixes}
            <${valuesSubject}> :name "First"@en, "Second"@en .`,
            valuesSubject
        )

        const report = await form.validate()
        const renderRoot = form.shadowRoot ?? form
        const instances = renderRoot.querySelectorAll<HTMLElement>(".property-instance[data-path='http://example.org/name']")

        expect(report.conforms).to.be.false
        expect(instances).to.have.lengthOf(2)
        for (const instance of instances) {
            expect(instance.classList.contains('valid')).to.be.false
            expect(instance.classList.contains('invalid')).to.be.true
            expect(instance.querySelector<HTMLElement>('.validation-error')?.title).to.contain('used more than once')
        }
    })

    it('focuses a cleared required list editor and shows its validation message on submit', async () => {
        const submitForm = document.createElement('shacl-form') as ShaclForm
        submitForm.dataset.generateNodeShapeReference = ''
        submitForm.dataset.submitButton = ''
        document.body.appendChild(submitForm)

        try {
            await bind(submitForm, `
                ${prefixes}
                <${shapeSubject}> a sh:NodeShape ;
                sh:property [
                    sh:path :license ;
                    sh:name "License" ;
                    sh:nodeKind sh:IRI ;
                    sh:in ( :license1 :license2 ) ;
                    sh:minCount 1 ;
                    sh:maxCount 1 ;
                ] .`,
                shapeSubject, `
                ${prefixes}
                <${valuesSubject}> :license :license1 .
                `,
                valuesSubject
            )

            const renderRoot = submitForm.shadowRoot ?? submitForm
            const editor = renderRoot.querySelector('.editor') as HTMLElement & {
                input: HTMLElement & { inputElement: HTMLInputElement, shadowRoot: ShadowRoot }
                selectItem(item: null, cacheValue?: boolean, userInteraction?: boolean): void
                updateComplete: Promise<boolean>
                value: string
            }
            editor.selectItem(null, true, true)
            await editor.updateComplete
            expect(editor.value).to.equal('')

            ;(renderRoot.querySelector('.submit-button') as HTMLElement).click()
            const propertyInstance = editor.parentElement!
            await waitUntil(() =>
                propertyInstance.classList.contains('invalid') &&
                propertyInstance.querySelector('.validation-error') !== null &&
                editor.input.shadowRoot.activeElement === editor.input.inputElement
            )

            expect(propertyInstance.querySelector<HTMLElement>('.validation-error')?.title).not.to.equal('')
        } finally {
            submitForm.remove()
        }
    })

    it('serializes overlapping validation runs', async () => {
        await bind(form, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
            sh:property [
                sh:path :path ;
                sh:datatype xsd:string ;
            ] .`,
            shapeSubject
        )

        const originalValidator = form.config.validator
        let activeValidations = 0
        let maxActiveValidations = 0
        let validationCalls = 0
        form.config.validator = {
            validate: async () => {
                validationCalls++
                activeValidations++
                maxActiveValidations = Math.max(maxActiveValidations, activeValidations)
                await new Promise(resolve => setTimeout(resolve, 20))
                activeValidations--
                return { conforms: true, results: [] }
            }
        } as typeof originalValidator

        try {
            await Promise.all([form.validate(), form.validate()])
            expect(validationCalls).to.equal(2)
            expect(maxActiveValidations).to.equal(1)
        } finally {
            form.config.validator = originalValidator
        }
    })

    it('aligns node shape validation markers with the first line of the node', async () => {
        await bind(form, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
                sh:node :RequiredShape ;
                sh:property [
                    sh:path :label ;
                    sh:datatype xsd:string ;
                    sh:minCount 1 ;
                    sh:maxCount 1
                ] .
            :RequiredShape a sh:NodeShape ;
                sh:class :RequiredClass .`,
            shapeSubject, `
            ${prefixes}
            <${valuesSubject}> :label "value" .`,
            valuesSubject
        )

        const report = await form.validate()
        const renderRoot = form.shadowRoot ?? form
        const node = renderRoot.querySelector<HTMLElement>(`shacl-node[data-node-id='${valuesSubject}']`)!
        const marker = node.querySelector<HTMLElement>(':scope > .validation-error.node')!

        expect(report.conforms).to.be.false
        expect(marker).to.exist
        expect(marker.getBoundingClientRect().top).to.be.greaterThan(node.getBoundingClientRect().top + 4)
    })

    it('xsd:dateTime binding preserves timezone offsets without shifting wall-clock time', async () => {
        const value = '"2026-06-03T10:30:00+02:00"^^xsd:dateTime'
        const [shapesQuads, inputQuads] = await bind(form, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
            sh:property [
                sh:path :path ;
                sh:datatype xsd:dateTime ;
                sh:minCount 1 ;
                sh:maxCount 1 ;
            ] .`,
            shapeSubject, `
            ${prefixes}
            <${valuesSubject}> :path ${value} .`,
            valuesSubject
        )
        const renderRoot = form.shadowRoot ?? form
        expect((renderRoot.querySelector('.editor') as HTMLInputElement).value).to.equal('2026-06-03T10:30:00')
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

    it('keeps projection-only serialization as the default', async () => {
        const projectionForm = document.createElement('shacl-form') as ShaclForm
        projectionForm.dataset.generateNodeShapeReference = ''
        document.body.appendChild(projectionForm)
        await bind(projectionForm, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
                sh:property [ sh:path :editable ; sh:maxCount 1 ] .
        `, shapeSubject, `
            ${prefixes}
            <${valuesSubject}> :editable "shown" ; :hidden "discarded" .
        `, valuesSubject)

        const output = projectionForm.toRDF()
        expect(output.getObjects(valuesSubject, 'http://example.org/editable', null)).to.have.length(1)
        expect(output.getObjects(valuesSubject, 'http://example.org/hidden', null)).to.be.empty
        projectionForm.remove()
    })

    it('preserves unmapped input while replacing form-managed values', async () => {
        const preservingForm = document.createElement('shacl-form') as ShaclForm
        preservingForm.dataset.preserveUnmappedValues = ''
        document.body.appendChild(preservingForm)
        await bind(preservingForm, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
                sh:targetClass :ManagedType ;
                sh:property [ sh:path :editable ; sh:datatype xsd:string ; sh:maxCount 1 ] .
        `, shapeSubject, `
            ${prefixes}
            @prefix dcterms: <http://purl.org/dc/terms/> .
            <${valuesSubject}> a :ManagedType, :OtherType ;
                dcterms:conformsTo <${shapeSubject}> ;
                :editable "old" ;
                :hidden "keep" .
            :unrelated :value "keep" .
            GRAPH :namedGraph { :namedSubject :value "keep" . }
        `, valuesSubject)

        const editable = Array.from(preservingForm.form.querySelectorAll<ShaclProperty>('shacl-property'))
            .find(property => property.template.path === 'http://example.org/editable')!
            .querySelector<HTMLElement & { value: string }>('.editor')!
        editable.value = 'new'
        await preservingForm.validate()
        await preservingForm.validate()

        const destination = new Store()
        destination.addQuad(
            DataFactory.namedNode('http://example.org/destination'),
            DataFactory.namedNode('http://example.org/value'),
            DataFactory.literal('keep')
        )
        const output = preservingForm.toRDF(destination)
        expect(output.getObjects(valuesSubject, 'http://example.org/editable', null).map(term => term.value)).to.deep.equal(['new'])
        expect(output.getObjects(valuesSubject, 'http://example.org/hidden', null).map(term => term.value)).to.deep.equal(['keep'])
        expect(output.getObjects(valuesSubject, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', null).map(term => term.value))
            .to.have.members(['http://example.org/ManagedType', 'http://example.org/OtherType'])
        expect(output.getObjects('http://example.org/unrelated', 'http://example.org/value', null).map(term => term.value)).to.deep.equal(['keep'])
        expect(output.getObjects('http://example.org/namedSubject', 'http://example.org/value', 'http://example.org/namedGraph').map(term => term.value))
            .to.deep.equal(['keep'])
        expect(output.getObjects('http://example.org/destination', 'http://example.org/value', null).map(term => term.value)).to.deep.equal(['keep'])
        expect(preservingForm.serialize('application/trig')).to.contain('namedGraph')

        editable.value = ''
        expect(preservingForm.toRDF().getObjects(valuesSubject, 'http://example.org/editable', null)).to.be.empty
        expect(preservingForm.toRDF().getObjects(valuesSubject, 'http://example.org/hidden', null).map(term => term.value)).to.deep.equal(['keep'])
        preservingForm.remove()
    }).timeout(4000)

    it('prunes only blank-node subgraphs orphaned by a form edit', async () => {
        const preservingForm = document.createElement('shacl-form') as ShaclForm
        preservingForm.dataset.generateNodeShapeReference = ''
        preservingForm.dataset.preserveUnmappedValues = ''
        document.body.appendChild(preservingForm)
        await bind(preservingForm, `
            ${prefixes}
            <${shapeSubject}> a sh:NodeShape ;
                sh:property [ sh:path :child ; sh:node :ChildShape ; sh:maxCount 1 ] ;
                sh:property [ sh:path :sharedChild ; sh:node :ChildShape ; sh:maxCount 1 ] .
            :ChildShape a sh:NodeShape ;
                sh:property [ sh:path :editable ; sh:maxCount 1 ] .
        `, shapeSubject, `
            ${prefixes}
            <${valuesSubject}> :child _:orphan ; :sharedChild _:shared .
            _:orphan :editable "old" ; :hidden _:orphanDetail .
            _:orphanDetail :value "remove" .
            _:shared :editable "old" ; :hidden _:sharedDetail .
            _:sharedDetail :value "keep" .
            :unrelated :alsoReferences _:shared .
        `, valuesSubject)

        const original = preservingForm.config.originalValues
        const orphan = original.getObjects(valuesSubject, 'http://example.org/child', null)[0]
        const orphanDetail = original.getObjects(orphan, 'http://example.org/hidden', null)[0]
        const shared = original.getObjects(valuesSubject, 'http://example.org/sharedChild', null)[0]
        const sharedDetail = original.getObjects(shared, 'http://example.org/hidden', null)[0]
        for (const property of preservingForm.form.querySelectorAll<ShaclProperty>('shacl-property')) {
            if (property.parent === preservingForm.shape &&
                ['http://example.org/child', 'http://example.org/sharedChild'].includes(property.template.path!)) {
                property.querySelector(':scope > .property-instance')?.remove()
            }
        }

        const output = preservingForm.toRDF()
        expect(output.getQuads(orphan, null, null, null)).to.be.empty
        expect(output.getQuads(orphanDetail, null, null, null)).to.be.empty
        expect(output.getQuads(shared, null, null, null)).not.to.be.empty
        expect(output.getQuads(sharedDetail, null, null, null)).not.to.be.empty
        expect(output.getObjects('http://example.org/unrelated', 'http://example.org/alsoReferences', null)[0].equals(shared)).to.be.true
        preservingForm.remove()
    }).timeout(4000)
})

function awaitNextFormChange(form: ShaclForm) {
    return new Promise<void>(resolve => form.addEventListener('change', () => resolve(), { once: true }))
}
