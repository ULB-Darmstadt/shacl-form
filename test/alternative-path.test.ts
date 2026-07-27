import { expect, waitUntil } from '@open-wc/testing'
import { ShaclForm } from '../src/form'
import type { ShaclProperty } from '../src/property'
import { Plugin } from '../src/plugin'
import type { ShaclPropertyTemplate } from '../src/property-template'
import type { Term } from '@rdfjs/types'
import { bind, expectIsomorphic } from './util'
import '../src/form'

const prefixes = `
@prefix : <http://example.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
`
const shapeSubject = 'http://example.org/TestShape'
const valuesSubject = 'http://example.org/data'

function alternativeShape(extra = '') {
    return `
${prefixes}
<${shapeSubject}> a sh:NodeShape ;
    sh:property [
        sh:path [ sh:alternativePath ( :foo :bar ) ] ;
        sh:name "Alternative value" ;
        sh:datatype xsd:string ;
        ${extra}
    ] .
`
}

describe('sh:alternativePath', () => {
    let form: ShaclForm

    beforeEach(() => {
        form = document.createElement('shacl-form') as ShaclForm
        form.dataset.generateNodeShapeReference = ''
        document.body.appendChild(form)
    })

    afterEach(() => form.remove())

    it('binds every predicate and preserves each source predicate', async () => {
        const values = `
${prefixes}
<${valuesSubject}>
    :foo "foo", "shared" ;
    :bar "bar", "shared" .
`
        const [, inputQuads] = await bind(form, alternativeShape('sh:maxCount 4'), shapeSubject, values, valuesSubject)
        const property = form.form.querySelector<ShaclProperty>('shacl-property')!
        const instances = Array.from(property.querySelectorAll<HTMLElement>('.property-instance'))

        expect(property.template.path).to.equal('http://example.org/foo')
        expect(property.template.pathAlternatives).to.deep.equal([
            'http://example.org/foo',
            'http://example.org/bar'
        ])
        expect(instances.map(instance => instance.dataset.predicate)).to.have.members([
            'http://example.org/foo',
            'http://example.org/foo',
            'http://example.org/bar',
            'http://example.org/bar'
        ])
        expectIsomorphic(inputQuads, form.toRDF().getQuads(null, null, null, null))
    })

    it('requires a path choice for a new value and serializes the selected predicate', async () => {
        await bind(form, alternativeShape(), shapeSubject, undefined, valuesSubject)
        const property = form.form.querySelector<ShaclProperty>('shacl-property')!
        const chooser = property.querySelector<HTMLElement>('.alternative-path-constraint')!
        const select = chooser.querySelector<HTMLElement & { value: string, onchange: (event: Event) => void }>('.editor')!

        expect(property.querySelector('.property-instance')).to.be.null
        expect(Array.from(chooser.querySelectorAll('li')).map(option => option.textContent)).to.deep.equal([
            'http://example.org/foo',
            'http://example.org/bar'
        ])
        expect(form.toRDF().countQuads(null, null, null, null)).to.equal(0)

        select.value = '1'
        await select.onchange(new Event('change'))
        const instance = property.querySelector<HTMLElement>('.property-instance')!
        const editor = instance.querySelector<HTMLElement & { value: string }>('.editor')!
        editor.value = 'new value'

        expect(instance.dataset.predicate).to.equal('http://example.org/bar')
        expect(form.toRDF().getObjects(valuesSubject, 'http://example.org/bar', null)[0].value).to.equal('new value')
        expect(form.toRDF().countQuads(valuesSubject, 'http://example.org/foo', null)).to.equal(0)

        const remove = instance.querySelector<HTMLElement>('.remove-button.persistent')!
        expect(remove).to.exist
        remove.click()
        await waitUntil(() => property.querySelector('.alternative-path-constraint'))
        expect(property.querySelector('.property-instance')).to.be.null
    })

    it('marks an incomplete required path chooser invalid', async () => {
        await bind(form, alternativeShape('sh:minCount 1 ; sh:maxCount 1'), shapeSubject, undefined, valuesSubject)
        const chooser = form.form.querySelector('.alternative-path-constraint')!

        expect((await form.validate()).conforms).to.be.false
        expect(chooser.classList.contains('invalid')).to.be.true
    })

    it('applies a default only after its path is selected', async () => {
        await bind(form, alternativeShape('sh:defaultValue "default"'), shapeSubject, undefined, valuesSubject)
        const select = form.form.querySelector<HTMLElement & { value: string, onchange: (event: Event) => void }>('.alternative-path-constraint .editor')!

        expect(form.toRDF().countQuads(null, null, null, null)).to.equal(0)
        select.value = '0'
        await select.onchange(new Event('change'))

        expect(form.toRDF().getObjects(valuesSubject, 'http://example.org/foo', null)[0].value).to.equal('default')
    })

    it('asks for a path before adding a missing sh:hasValue', async () => {
        await bind(form, alternativeShape('sh:hasValue "fixed"'), shapeSubject, undefined, valuesSubject)
        const select = form.form.querySelector<HTMLElement & { value: string, onchange: (event: Event) => void }>('.alternative-path-constraint .editor')!

        expect(form.toRDF().countQuads(null, null, null, null)).to.equal(0)
        select.value = '1'
        await select.onchange(new Event('change'))

        expect(form.toRDF().getObjects(valuesSubject, 'http://example.org/bar', null)[0].value).to.equal('fixed')
    })

    it('serializes a newly created nested node through the selected path', async () => {
        await bind(form, `
${prefixes}
<${shapeSubject}> a sh:NodeShape ;
    sh:property [
        sh:path [ sh:alternativePath ( :childA :childB ) ] ;
        sh:name "Child" ;
        sh:node :ChildShape
    ] .
:ChildShape a sh:NodeShape ;
    sh:property [ sh:path :name ; sh:name "Name" ] .
`, shapeSubject, undefined, valuesSubject)
        const property = form.form.querySelector<ShaclProperty>('shacl-property')!
        await property.addPropertyInstance()
        const select = property.querySelector<HTMLElement & { value: string, onchange: (event: Event) => void }>('.alternative-path-constraint .editor')!
        select.value = '1'
        await select.onchange(new Event('change'))
        const editor = property.querySelector<HTMLElement & { value: string }>('shacl-node .editor')!
        editor.value = 'Nested name'

        const graph = form.toRDF()
        const child = graph.getObjects(valuesSubject, 'http://example.org/childB', null)[0]
        expect(child.termType).to.equal('BlankNode')
        expect(graph.getObjects(child, 'http://example.org/name', null)[0].value).to.equal('Nested name')
    })

    it('preserves alternative predicates in view mode without rendering a chooser', async () => {
        form.dataset.mode = 'view'
        const values = `
${prefixes}
<${valuesSubject}> :bar "viewed" .
`
        const [, inputQuads] = await bind(form, alternativeShape(), shapeSubject, values, valuesSubject)

        expect(form.form.querySelector('.alternative-path-constraint')).to.be.null
        expectIsomorphic(inputQuads, form.toRDF().getQuads(null, null, null, null))
    })

    it('folds direct-path sibling shapes into predicate-specific alternative branches', async () => {
        await bind(form, `
${prefixes}
<${shapeSubject}> a sh:NodeShape ;
    sh:property [
        sh:path [ sh:alternativePath ( :parentMap :parent ) ] ;
        sh:name "parentMap/parent" ;
        sh:minCount 1 ;
        sh:maxCount 1
    ] ;
    sh:property [
        sh:path :parentMap ;
        sh:name "parentMap" ;
        sh:nodeKind sh:BlankNodeOrIRI
    ] ;
    sh:property [
        sh:path :parent ;
        sh:name "parent" ;
        sh:nodeKind sh:Literal
    ] .
`, shapeSubject, undefined, valuesSubject)
        const properties = form.form.querySelectorAll<ShaclProperty>('shacl-property')
        const property = properties[0]

        expect(properties).to.have.length(1)
        expect(Object.keys(property.template.pathAlternativeBranches!)).to.deep.equal([
            'http://example.org/parentMap',
            'http://example.org/parent'
        ])

        let select = property.querySelector<HTMLElement & { value: string, onchange: (event: Event) => void }>('.alternative-path-constraint .editor')!
        select.value = '0'
        await select.onchange(new Event('change'))
        let instance = property.querySelector<HTMLElement>('.property-instance')!
        let editor = instance.querySelector<HTMLElement & { value: string }>('.editor')!
        expect(instance.querySelector('label')?.textContent).to.equal('parentMap')
        expect(editor.dataset.nodeKind).to.equal('http://www.w3.org/ns/shacl#BlankNodeOrIRI')
        editor.value = '_:selectedParentMap'
        expect(form.toRDF().getObjects(valuesSubject, 'http://example.org/parentMap', null)[0].termType).to.equal('BlankNode')

        instance.querySelector<HTMLElement>('.remove-button')!.click()
        await waitUntil(() => property.querySelector('.alternative-path-constraint'))
        select = property.querySelector<HTMLElement & { value: string, onchange: (event: Event) => void }>('.alternative-path-constraint .editor')!
        select.value = '1'
        await select.onchange(new Event('change'))
        instance = property.querySelector<HTMLElement>('.property-instance')!
        editor = instance.querySelector<HTMLElement & { value: string }>('.editor')!
        expect(instance.querySelector('label')?.textContent).to.equal('parent')
        expect(editor.dataset.nodeKind).to.equal('http://www.w3.org/ns/shacl#Literal')
        editor.value = 'selected parent'
        expect(form.toRDF().getObjects(valuesSubject, 'http://example.org/parent', null)[0].termType).to.equal('Literal')
    })

    it('uses a folded branch when binding an existing alternative value', async () => {
        await bind(form, `
${prefixes}
<${shapeSubject}> a sh:NodeShape ;
    sh:property [
        sh:path [ sh:alternativePath ( :parentMap :parent ) ] ;
        sh:maxCount 1
    ] ;
    sh:property [ sh:path :parentMap ; sh:name "parentMap" ; sh:nodeKind sh:BlankNodeOrIRI ] ;
    sh:property [ sh:path :parent ; sh:name "parent" ; sh:nodeKind sh:Literal ] .
`, shapeSubject, `
${prefixes}
<${valuesSubject}> :parentMap "invalid parent map" .
`, valuesSubject)
        const properties = form.form.querySelectorAll<ShaclProperty>('shacl-property')
        const instance = properties[0].querySelector<HTMLElement>('.property-instance')!
        const editor = instance.querySelector<HTMLElement & { value: string }>('.editor')!

        expect(properties).to.have.length(1)
        expect(instance.querySelector('label')?.textContent).to.equal('parentMap')
        expect(editor.dataset.nodeKind).to.equal('http://www.w3.org/ns/shacl#BlankNodeOrIRI')
        expect(form.form.querySelector('.alternative-path-constraint')).to.be.null
        expect((await form.validate()).conforms).to.be.false
        expect(instance.classList.contains('invalid')).to.be.true
    })

    it('keeps companion properties separate when they have independent cardinality', async () => {
        await bind(form, `
${prefixes}
<${shapeSubject}> a sh:NodeShape ;
    sh:property [
        sh:path [ sh:alternativePath ( :foo :bar ) ] ;
        sh:minCount 1 ;
        sh:maxCount 1
    ] ;
    sh:property [ sh:path :foo ; sh:minCount 1 ; sh:nodeKind sh:IRI ] ;
    sh:property [ sh:path :bar ; sh:nodeKind sh:Literal ] .
`, shapeSubject, undefined, valuesSubject)

        expect(form.form.querySelectorAll('shacl-property')).to.have.length(3)
    })

    it('carries the selected predicate through a property sh:or chooser', async () => {
        await bind(form, `
${prefixes}
<${shapeSubject}> a sh:NodeShape ;
    sh:property [
        sh:path [ sh:alternativePath ( :choiceA :choiceB ) ] ;
        sh:name "Choice" ;
        sh:maxCount 2 ;
        sh:or (
            [ sh:datatype xsd:string ]
            [ sh:nodeKind sh:IRI ]
        )
    ] .
`, shapeSubject, undefined, valuesSubject)
        const property = form.form.querySelector<ShaclProperty>('shacl-property')!
        const pathSelect = property.querySelector<HTMLElement & { value: string, onchange: (event: Event) => void }>('.alternative-path-constraint .editor')!
        pathSelect.value = '1'
        await pathSelect.onchange(new Event('change'))

        const typeSelect = property.querySelector<HTMLElement & { value: string, onchange: (event: Event) => void }>('.shacl-or-constraint .editor')!
        typeSelect.value = '0'
        await typeSelect.onchange(new Event('change'))
        const instance = property.querySelector<HTMLElement>('.property-instance')!
        const editor = instance.querySelector<HTMLElement & { value: string }>('.editor')!
        editor.value = 'chosen'

        expect(instance.dataset.predicate).to.equal('http://example.org/choiceB')
        expect(form.toRDF().getObjects(valuesSubject, 'http://example.org/choiceB', null)[0].value).to.equal('chosen')

        const remove = instance.querySelector<HTMLElement>('.remove-button.persistent')!
        expect(remove).to.exist
        remove.click()
        await waitUntil(() => property.querySelector('.alternative-path-constraint'))
        expect(property.querySelector('.shacl-or-constraint')).to.be.null
    })

    it('uses the effective predicate for predicate-specific plugins', async () => {
        class AlternativePlugin extends Plugin {
            constructor() {
                super({ predicate: 'http://example.org/pluginB' })
            }

            createEditor(_: ShaclPropertyTemplate, value?: Term): HTMLElement {
                const wrapper = document.createElement('div')
                wrapper.classList.add('selected-plugin')
                const editor = document.createElement('input')
                editor.classList.add('editor')
                editor.value = value?.value ?? ''
                wrapper.appendChild(editor)
                return wrapper
            }
        }
        form.registerPlugin(new AlternativePlugin())
        await bind(form, `
${prefixes}
<${shapeSubject}> a sh:NodeShape ;
    sh:property [
        sh:path [ sh:alternativePath ( :pluginA :pluginB ) ] ;
        sh:name "Plugin value"
    ] .
`, shapeSubject, undefined, valuesSubject)
        const select = form.form.querySelector<HTMLElement & { value: string, onchange: (event: Event) => void }>('.alternative-path-constraint .editor')!
        select.value = '1'
        await select.onchange(new Event('change'))

        expect(form.form.querySelector('.selected-plugin')).to.exist
    })

    it('ignores alternative paths containing unsupported nested paths', async () => {
        await bind(form, `
${prefixes}
<${shapeSubject}> a sh:NodeShape ;
    sh:property [
        sh:path [ sh:alternativePath ( :foo [ sh:inversePath :bar ] ) ] ;
        sh:name "Unsupported"
    ] .
`, shapeSubject)

        expect(form.form.querySelector('shacl-property')).to.be.null
    })
})
