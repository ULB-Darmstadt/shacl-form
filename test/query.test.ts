import { expect } from '@open-wc/testing'
import { DataFactory } from 'n3'
import { ShaclForm } from '../src/form'
import { isRangeQueryField, Query, QueryEditor, QueryFacetProvider } from '../src/query'
import { awaitFormLoaded, bind } from './util'
import { RokitInput, RokitSelect, RokitSlider } from '@ro-kit/ui-widgets'

const hasPath = (field: { path: string[] }, predicate: string) => field.path[field.path.length - 1] === predicate

const shapes = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix ex: <http://example.org/> .

ex:Root a sh:NodeShape ;
  sh:targetClass ex:Thing ;
  sh:property [ sh:path ex:title ; sh:name "Title" ; sh:datatype xsd:string ] ;
  sh:property [ sh:path ex:year ; sh:name "Year" ; sh:datatype xsd:integer ] ;
  sh:property [ sh:path ex:published ; sh:name "Published" ; sh:datatype xsd:date ] ;
  sh:property [ sh:path ex:kind ; sh:name "Kind" ; sh:in (ex:A ex:B) ] ;
  sh:property [ sh:path ex:child ; sh:name "Child" ; sh:node ex:Child ] .

ex:Child a sh:NodeShape ;
  sh:property [ sh:path ex:name ; sh:name "Name" ; sh:datatype xsd:string ] .
`

describe('query mode', () => {
    let form: ShaclForm

    beforeEach(() => {
        form = new ShaclForm()
        form.dataset.mode = 'query'
        document.body.appendChild(form)
    })

    afterEach(() => form.remove())

    it('builds typed criteria with nested RDF paths', async () => {
        await bind(form, shapes, 'http://example.org/Root')
        const editors = form.form.querySelectorAll<RokitInput>('.query-value')
        const title = Array.from(editors).find(input => input.closest('.query-editor')?.textContent?.includes('Title'))!
        const name = Array.from(editors).find(input => input.closest('.query-editor')?.textContent?.includes('Name'))!
        const year = Array.from(form.form.querySelectorAll<RokitInput>('.query-range-bound'))

        title.value = 'bridge'
        name.value = 'Alice'
        year[0].value = '1990'
        year[1].value = '2020'

        const query = form.getQuery()
        expect(query.targetClass).to.equal('http://example.org/Thing')
        expect(query.criteria.map(criterion => criterion.operator)).to.deep.equal(['contains', 'range', 'contains'])
        expect(query.criteria[2].field.path).to.deep.equal(['http://example.org/child', 'http://example.org/name'])
        expect(query.criteria[1].min?.value).to.equal('1990')
        expect(query.criteria[1].max?.value).to.equal('2020')
    })

    it('distinguishes qualified branches that share the same RDF path', async () => {
        const qualifiedShapes = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
ex:Root a sh:NodeShape ; sh:property ex:temperatureProperty, ex:timeProperty .
ex:temperatureProperty sh:path ex:part ; sh:name "Target temperature" ; sh:qualifiedValueShape ex:Temperature .
ex:timeProperty sh:path ex:part ; sh:name "Heating duration" ; sh:qualifiedValueShape ex:Time .
ex:Temperature a sh:NodeShape ; sh:property ex:temperatureKindProperty .
ex:Time a sh:NodeShape ; sh:property ex:timeKindProperty .
ex:temperatureKindProperty sh:path ex:quantityKind ; sh:name "Temperature kind" .
ex:timeKindProperty sh:path ex:quantityKind ; sh:name "Time kind" .
`
        await bind(form, qualifiedShapes, 'http://example.org/Root')
        const editors = Array.from(form.form.querySelectorAll<QueryEditor>('.query-editor'))
        const temperature = editors.find(editor => editor.textContent?.includes('Temperature kind'))!.queryField
        const time = editors.find(editor => editor.textContent?.includes('Time kind'))!.queryField

        expect(temperature.path).to.deep.equal(['http://example.org/part', 'http://example.org/quantityKind'])
        expect(time.path).to.deep.equal(temperature.path)
        expect(temperature.shapePath).to.deep.equal([
            'http://example.org/temperatureProperty',
            'http://example.org/quantityKind',
        ])
        expect(time.shapePath).to.deep.equal([
            'http://example.org/timeProperty',
            'http://example.org/quantityKind',
        ])
    })

    it('renders one simple built-in control per field', async () => {
        await bind(form, shapes, 'http://example.org/Root')
        const title = Array.from(form.form.querySelectorAll('.query-editor')).find(editor => editor.textContent?.includes('Title'))!
        const kind = Array.from(form.form.querySelectorAll('.query-editor')).find(editor => editor.textContent?.includes('Kind'))!

        expect(title.querySelectorAll('rokit-input.query-value')).to.have.length(1)
        expect(kind.querySelectorAll('rokit-select.query-choice')).to.have.length(1)
        expect(form.form.querySelectorAll('.query-add, .query-remove')).to.have.length(0)
        expect(kind.querySelector('li:nth-child(1)')?.textContent).to.equal('http://example.org/A')
        expect(kind.querySelector('li:nth-child(2)')?.textContent).to.equal('http://example.org/B')
    })

    it('keeps the initial query form hidden until facets are applied', async () => {
        let resolveFacets!: () => void
        let markFacetsRequested!: () => void
        const facetsRequested = new Promise<void>(resolve => {
            markFacetsRequested = resolve
        })
        form.setQueryFacetProvider({
            getFacets: request => new Promise(resolve => {
                markFacetsRequested()
                resolveFacets = () => resolve(request.fields.map(field => ({ fieldId: field.id, count: 1 })))
            }),
        })

        const firstNodeRendered = new Promise<HTMLElement>(resolve => {
            const observer = new MutationObserver(() => {
                const node = form.form.querySelector<HTMLElement>(':scope > shacl-node')
                if (node) {
                    observer.disconnect()
                    resolve(node)
                }
            })
            observer.observe(form.form, { childList: true })
        })
        const loaded = bind(form, shapes, 'http://example.org/Root')
        const graphLoadingStyle = getComputedStyle(form.form)
        const graphLoadingTypography = {
            color: graphLoadingStyle.color,
            fontFamily: graphLoadingStyle.fontFamily,
            fontSize: graphLoadingStyle.fontSize,
        }
        const initialNode = await firstNodeRendered

        expect(form.hasAttribute('loading')).to.be.true
        expect(form.form.querySelector('[part~="loading"]')?.textContent).to.equal('Loading…')
        expect(getComputedStyle(initialNode).display).to.equal('none')
        const facetLoadingStyle = getComputedStyle(form.form)
        expect({
            color: facetLoadingStyle.color,
            fontFamily: facetLoadingStyle.fontFamily,
            fontSize: facetLoadingStyle.fontSize,
        }).to.deep.equal(graphLoadingTypography)

        await facetsRequested
        resolveFacets()
        await loaded

        expect(form.hasAttribute('loading')).to.be.false
        expect(form.form.querySelector('[part~="loading"]')).to.be.null
        expect(getComputedStyle(form.form.querySelector('shacl-node')!).display).not.to.equal('none')
    })

    it('emits query events and applies facet availability and buckets', async () => {
        await bind(form, shapes, 'http://example.org/Root')
        let requestedFields = 0
        const provider: QueryFacetProvider = {
            getFacets: async request => {
                requestedFields = request.fields.length
                return request.fields.map(field => hasPath(field, 'http://example.org/year')
                    ? { fieldId: field.id, count: 0 }
                    : hasPath(field, 'http://example.org/kind')
                        ? { fieldId: field.id, count: 2, buckets: [{ value: DataFactory.namedNode('http://example.org/A'), label: 'A label', count: 2 }] }
                        : { fieldId: field.id, count: 1 })
            },
        }
        const facetsApplied = new Promise<void>(resolve => setTimeout(resolve, 0))
        form.setQueryFacetProvider(provider)
        await facetsApplied

        expect(requestedFields).to.equal(5)
        const yearProperty = Array.from(form.form.querySelectorAll('shacl-property')).find(property => property.textContent?.includes('Year'))!
        expect(yearProperty.classList.contains('query-unavailable')).to.be.true
        const kindSelect = Array.from(form.form.querySelectorAll<RokitSelect>('rokit-select')).find(select => select.closest('.query-editor')?.textContent?.includes('Kind'))!
        expect(kindSelect.querySelectorAll('li')).to.have.length(1)
        expect(kindSelect.querySelector('li:last-child')?.textContent).to.equal('A label ')
        expect(kindSelect.querySelector<HTMLElement>('.facet-count')?.dataset.count).to.equal('2')

        const event = new Promise<Query>(resolve => form.addEventListener('query', ev => resolve((ev as CustomEvent<Query>).detail), { once: true }))
        const title = Array.from(form.form.querySelectorAll<RokitInput>('.query-value')).find(input => input.closest('.query-editor')?.textContent?.includes('Title'))!
        title.value = 'test'
        title.dispatchEvent(new Event('change', { bubbles: true }))
        expect((await event).criteria[0].value?.value).to.equal('test')
    })

    it('hides node-shape branches without an available filter down the tree', async () => {
        const nestedShapes = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix ex: <http://example.org/> .
ex:Root a sh:NodeShape ;
  sh:property [ sh:path ex:hidden ; sh:name "Hidden branch" ; sh:node ex:Hidden ] ;
  sh:property [ sh:path ex:visible ; sh:name "Visible branch" ; sh:node ex:Visible ] .
ex:Hidden a sh:NodeShape ;
  sh:property [ sh:path ex:middle ; sh:name "Middle" ; sh:node ex:Middle ] .
ex:Middle a sh:NodeShape ;
  sh:property [ sh:path ex:hiddenLeaf ; sh:name "Hidden leaf" ; sh:datatype xsd:string ] .
ex:Visible a sh:NodeShape ;
  sh:property [ sh:path ex:visibleLeaf ; sh:name "Visible leaf" ; sh:datatype xsd:string ] .
`
        await bind(form, nestedShapes, 'http://example.org/Root')
        let visibleCount = 1
        form.setQueryFacetProvider({
            getFacets: async request => request.fields.map(field => ({
                fieldId: field.id,
                count: hasPath(field, 'http://example.org/visibleLeaf') ? visibleCount : 0,
            })),
        })
        await new Promise(resolve => setTimeout(resolve, 0))

        const properties = Array.from(form.form.querySelectorAll('shacl-property'))
        const hiddenBranch = properties.find(property => property.textContent?.includes('Hidden branch'))!
        const middle = properties.find(property => property.textContent?.includes('Middle'))!
        const visibleBranch = properties.find(property => property.textContent?.includes('Visible branch'))!

        expect(hiddenBranch.classList.contains('query-unavailable')).to.be.true
        expect(middle.classList.contains('query-unavailable')).to.be.true
        expect(getComputedStyle(hiddenBranch.querySelector('shacl-node')!).display).to.equal('none')
        expect(visibleBranch.classList.contains('query-unavailable')).to.be.false
        expect(getComputedStyle(visibleBranch.querySelector('shacl-node')!).display).not.to.equal('none')
        expect(form.classList.contains('query-facets-empty')).to.be.false

        visibleCount = 0
        form.refreshQueryFacets()
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(form.classList.contains('query-facets-empty')).to.be.true

        visibleCount = 1
        form.refreshQueryFacets()
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(form.classList.contains('query-facets-empty')).to.be.false
    })

    it('uses a ro-kit range slider when facet bounds are available', async () => {
        await bind(form, shapes, 'http://example.org/Root')
        form.setQueryFacetProvider({
            getFacets: async request => request.fields.map(field => hasPath(field, 'http://example.org/year') ? {
                fieldId: field.id,
                count: 10,
                min: DataFactory.literal('1990', DataFactory.namedNode('http://www.w3.org/2001/XMLSchema#integer')),
                max: DataFactory.literal('2020', DataFactory.namedNode('http://www.w3.org/2001/XMLSchema#integer')),
            } : { fieldId: field.id, count: 10 }),
        })
        await new Promise(resolve => setTimeout(resolve, 0))

        const slider = form.form.querySelector<RokitSlider>('rokit-slider.query-range-slider')!
        expect(slider).to.be.instanceOf(RokitSlider)
        expect(slider.min).to.equal('1990')
        expect(slider.max).to.equal('2020')
        slider.value = '[2000,2010]'
        slider.dataset.active = 'true'

        const criterion = form.getQuery().criteria.find(candidate => hasPath(candidate.field, 'http://example.org/year'))!
        expect(criterion.min?.value).to.equal('2000')
        expect(criterion.max?.value).to.equal('2010')
    })

    it('keeps a date slider when refreshed facets collapse to one date', async () => {
        await bind(form, shapes, 'http://example.org/Root')
        let requests = 0
        form.setQueryFacetProvider({
            getFacets: async request => {
                requests++
                return request.fields.map(field => hasPath(field, 'http://example.org/published') ? {
                    fieldId: field.id,
                    count: 1,
                    min: DataFactory.literal(requests === 1 ? '2020-01-01' : '2022-01-01', DataFactory.namedNode('http://www.w3.org/2001/XMLSchema#date')),
                    max: DataFactory.literal(requests === 1 ? '2024-01-01' : '2022-01-01', DataFactory.namedNode('http://www.w3.org/2001/XMLSchema#date')),
                } : { fieldId: field.id, count: 1 })
            },
        })
        await new Promise(resolve => setTimeout(resolve, 0))

        const published = Array.from(form.form.querySelectorAll('.query-editor')).find(editor => editor.textContent?.includes('Published'))!
        const slider = published.querySelector<RokitSlider>('rokit-slider.query-range-slider')!
        slider.value = JSON.stringify([
            Date.parse('2021-01-01') / 1000,
            Date.parse('2023-01-01') / 1000,
        ])
        slider.dispatchEvent(new Event('change', { bubbles: true }))
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(requests).to.equal(2)
        expect(published.querySelector('rokit-slider.query-range-slider')).to.be.instanceOf(RokitSlider)
        expect(published.querySelectorAll('rokit-input.query-range-bound')).to.have.length(0)
    })

    it('allows hosts to refresh facets after external filters change', async () => {
        await bind(form, shapes, 'http://example.org/Root')
        let requests = 0
        form.setQueryFacetProvider({
            getFacets: async request => {
                requests++
                return request.fields.map(field => ({ fieldId: field.id, count: 1 }))
            },
        })
        await new Promise(resolve => setTimeout(resolve, 0))
        form.refreshQueryFacets()
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(requests).to.equal(2)
    })

    it('rejects RDF APIs in query mode and keeps data-view compatibility', async () => {
        await bind(form, shapes, 'http://example.org/Root')
        expect(() => form.toRDF()).to.throw('use getQuery')
        expect(() => form.serialize()).to.throw('use getQuery')
        let validationError: unknown
        try { await form.validate() } catch (error) { validationError = error }
        expect(String(validationError)).to.contain('use getQuery')

        // getQuery returns empty query in non-query mode
        const viewer = new ShaclForm()
        viewer.dataset.view = ''
        document.body.appendChild(viewer)
        const loaded = awaitFormLoaded(viewer)
        viewer.dataset.shapes = shapes
        viewer.dataset.shapeSubject = 'http://example.org/Root'
        await loaded
        expect(viewer.config.mode).to.equal('view')
        expect(viewer.getQuery().criteria).to.have.length(0)
        expect(() => viewer.refreshQueryFacets()).to.not.throw()
        viewer.remove()
    })

    it('emits queryerror when provider throws', async () => {
        await bind(form, shapes, 'http://example.org/Root')
        const error = new Error('network failure')
        form.setQueryFacetProvider({
            getFacets: async () => { throw error },
        })
        const queryError = new Promise<unknown>(resolve =>
            form.addEventListener('queryerror', ev => resolve((ev as CustomEvent).detail), { once: true })
        )
        await queryError
        const title = Array.from(form.form.querySelectorAll<RokitInput>('.query-value')).find(input => input.closest('.query-editor')?.textContent?.includes('Title'))!
        title.value = 'x'
        title.dispatchEvent(new Event('change', { bubbles: true }))
        const subsequentError = new Promise<unknown>(resolve =>
            form.addEventListener('queryerror', ev => resolve((ev as CustomEvent).detail), { once: true })
        )
        expect(await subsequentError).to.equal(error)
    })

    it('builds text criteria for fields with language constraints', async () => {
        const langShapes = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix ex: <http://example.org/> .
ex:Root a sh:NodeShape ;
  sh:targetClass ex:Thing ;
  sh:property [ sh:path ex:label ; sh:name "Label" ; sh:languageIn ( "en" "de" ) ] .
`
        await bind(form, langShapes, 'http://example.org/Root')
        const label = Array.from(form.form.querySelectorAll<RokitInput>('.query-value')).find(input => input.closest('.query-editor')?.textContent?.includes('Label'))!
        const language = label.closest('.query-value-row')!.querySelector<HTMLSelectElement>('.query-language')!
        expect(Array.from(language.options).map(option => option.value)).to.deep.equal(['en', 'de'])
        language.value = 'de'
        label.value = 'hello'
        const query = form.getQuery()
        expect(query.criteria).to.have.length(1)
        expect(query.criteria[0].operator).to.equal('contains')
        expect(query.criteria[0].value!.value).to.equal('hello')
        expect((query.criteria[0].value as any).language).to.equal('de')
    })

    it('handles OR constraints in query mode by rendering chooser', async () => {
        const orShapes = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix ex: <http://example.org/> .
ex:Root a sh:NodeShape ;
  sh:targetClass ex:Thing ;
  sh:property [
    sh:path ex:item ;
    sh:name "Item" ;
    sh:or (
      [ sh:node ex:TypeA ; rdfs:label "Type A" ]
      [ sh:node ex:TypeB ; rdfs:label "Type B" ]
    ) ] .
ex:TypeA a sh:NodeShape ;
  sh:property [ sh:path ex:alpha ; sh:name "Alpha" ; sh:datatype xsd:string ] .
ex:TypeB a sh:NodeShape ;
  sh:property [ sh:path ex:beta ; sh:name "Beta" ; sh:datatype xsd:string ] .
`
        await bind(form, orShapes, 'http://example.org/Root')
        const orConstraint = form.form.querySelector('.shacl-or-constraint')
        expect(orConstraint).to.not.be.null

        const chooser = orConstraint!.querySelector('.editor') as HTMLInputElement
        const queryChanged = new Promise<void>(resolve =>
            form.addEventListener('query', () => resolve(), { once: true })
        )
        chooser.value = '0'
        chooser.dispatchEvent(new Event('change'))
        await queryChanged

        const alpha = Array.from(form.form.querySelectorAll<RokitInput>('.query-value'))
            .find(input => input.closest('.query-editor')?.textContent?.includes('Alpha'))!
        expect(alpha).to.not.be.undefined
        alpha.value = 'nested'
        const criterion = form.getQuery().criteria.find(candidate => hasPath(candidate.field, 'http://example.org/alpha'))!
        expect(criterion.field.path).to.deep.equal(['http://example.org/item', 'http://example.org/alpha'])
    })

    it('preserves nested inherited numeric query context', async () => {
        const nestedInheritedShapes = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix ex: <http://example.org/> .
ex:Root a sh:NodeShape ;
  sh:property [ sh:path ex:child ; sh:name "Child" ; sh:node ex:Derived ] .
ex:Derived a sh:NodeShape ; sh:node ex:Base .
ex:Base a sh:NodeShape ;
  sh:property [ sh:path ex:score ; sh:name "Score" ; sh:datatype xsd:decimal ] .
`
        await bind(form, nestedInheritedShapes, 'http://example.org/Root')
        const bounds = Array.from(form.form.querySelectorAll<RokitInput>('.query-range-bound'))
        bounds[0].value = '1.5'
        bounds[1].value = '9.5'

        const criterion = form.getQuery().criteria.find(candidate => hasPath(candidate.field, 'http://example.org/score'))!
        expect(criterion.operator).to.equal('range')
        expect(criterion.field.path).to.deep.equal(['http://example.org/child', 'http://example.org/score'])
    })

    it('collapses numeric xone datatypes into one range slider', async () => {
        const numericAlternativeShapes = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix ex: <http://example.org/> .
ex:Root a sh:NodeShape ;
  sh:property [
    sh:path ex:value ;
    sh:name "Numerical Value" ;
    sh:xone (
      [ sh:datatype xsd:integer ]
      [ sh:datatype xsd:double ]
    )
  ] .
`
        await bind(form, numericAlternativeShapes, 'http://example.org/Root')
        expect(form.form.querySelector('.shacl-or-constraint')).to.be.null
        form.setQueryFacetProvider({
            getFacets: async request => request.fields.map(field => ({
                fieldId: field.id,
                count: 2,
                min: DataFactory.literal('333', DataFactory.namedNode('http://www.w3.org/2001/XMLSchema#double')),
                max: DataFactory.literal('444', DataFactory.namedNode('http://www.w3.org/2001/XMLSchema#double')),
            })),
        })
        await new Promise(resolve => setTimeout(resolve, 0))

        const slider = form.form.querySelector<RokitSlider>('rokit-slider.query-range-slider')!
        expect(slider).to.be.instanceOf(RokitSlider)
        expect(slider.min).to.equal('333')
        expect(slider.max).to.equal('444')
        expect(isRangeQueryField(Array.from(form.form.querySelectorAll<QueryEditor>('.query-editor'))[0].queryField)).to.be.true
        expect(form.getQuery().criteria).to.have.length(0)
    })

    it('renders inherited properties from sh:node on NodeShape', async () => {
        const inheritShapes = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix ex: <http://example.org/> .
ex:Base a sh:NodeShape ;
  sh:targetClass ex:Thing ;
  sh:property [ sh:path ex:title ; sh:name "Title" ; sh:datatype xsd:string ] .
ex:Derived a sh:NodeShape ;
  sh:node ex:Base ;
  sh:property [ sh:path ex:author ; sh:name "Author" ; sh:datatype xsd:string ] .
`
        await bind(form, inheritShapes, 'http://example.org/Derived')
        const labels = Array.from(form.form.querySelectorAll('.query-editor'))
            .map(e => e.textContent?.trim())
        expect(labels.some(l => l?.includes('Title'))).to.be.true
        expect(labels.some(l => l?.includes('Author'))).to.be.true
        const title = Array.from(form.form.querySelectorAll<RokitInput>('.query-value'))
            .find(input => input.closest('.query-editor')?.textContent?.includes('Title'))!
        title.value = 'test'
        const query = form.getQuery()
        expect(query.criteria[0].field.path).to.deep.equal(['http://example.org/title'])
        expect(query.criteria[0].value?.value).to.equal('test')
    })

    it('renders properties from sh:and on NodeShape', async () => {
        const andShapes = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix ex: <http://example.org/> .
ex:ShapeA a sh:NodeShape ;
  sh:property [ sh:path ex:alpha ; sh:name "Alpha" ; sh:datatype xsd:string ] .
ex:ShapeB a sh:NodeShape ;
  sh:property [ sh:path ex:beta ; sh:name "Beta" ; sh:datatype xsd:integer ] .
ex:Combined a sh:NodeShape ;
  sh:targetClass ex:Thing ;
  sh:and ( ex:ShapeA ex:ShapeB ) .
`
        await bind(form, andShapes, 'http://example.org/Combined')
        const labels = Array.from(form.form.querySelectorAll('.query-editor'))
            .map(e => e.textContent?.trim())
        expect(labels.some(l => l?.includes('Alpha'))).to.be.true
        expect(labels.some(l => l?.includes('Beta'))).to.be.true
    })

    it('renders multi-level inheritance chains with correct paths', async () => {
        const chainShapes = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix ex: <http://example.org/> .
ex:Base a sh:NodeShape ;
  sh:property [ sh:path ex:id ; sh:name "ID" ; sh:datatype xsd:integer ] .
ex:Middle a sh:NodeShape ;
  sh:node ex:Base ;
  sh:property [ sh:path ex:name ; sh:name "Name" ; sh:datatype xsd:string ] .
ex:Top a sh:NodeShape ;
  sh:targetClass ex:Thing ;
  sh:node ex:Middle ;
  sh:property [ sh:path ex:label ; sh:name "Label" ; sh:datatype xsd:string ] .
`
        await bind(form, chainShapes, 'http://example.org/Top')
        const editors = form.form.querySelectorAll('.query-editor')
        expect(editors.length).to.equal(3)
        const labels = Array.from(editors).map(e => e.textContent?.trim())
        expect(labels.some(l => l?.includes('ID'))).to.be.true
        expect(labels.some(l => l?.includes('Name'))).to.be.true
        expect(labels.some(l => l?.includes('Label'))).to.be.true
        // enter values and verify paths
        const id = Array.from(form.form.querySelectorAll<RokitInput>('.query-range-bound'))
        id[0].value = '1'
        id[1].value = '100'
        const name = Array.from(form.form.querySelectorAll<RokitInput>('.query-value'))
            .find(input => input.closest('.query-editor')?.textContent?.includes('Name'))!
        name.value = 'test'
        const label = Array.from(form.form.querySelectorAll<RokitInput>('.query-value'))
            .find(input => input.closest('.query-editor')?.textContent?.includes('Label'))!
        label.value = 'x'
        const query = form.getQuery()
        expect(query.criteria).to.have.length(3)
        expect(query.targetClass).to.equal('http://example.org/Thing')
    })

    it('renders sh:and on PropertyShape as nested query fields', async () => {
        const propAndShapes = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix ex: <http://example.org/> .
ex:Root a sh:NodeShape ;
  sh:targetClass ex:Thing ;
  sh:property [
    sh:path ex:person ;
    sh:name "Person" ;
    sh:and (
      [ sh:property [ sh:path ex:firstName ; sh:name "First Name" ; sh:datatype xsd:string ] ]
      [ sh:property [ sh:path ex:lastName ; sh:name "Last Name" ; sh:datatype xsd:string ] ]
    ) ] .
`
        await bind(form, propAndShapes, 'http://example.org/Root')
        const labels = Array.from(form.form.querySelectorAll('.query-editor'))
            .map(e => e.textContent?.trim())
        expect(labels.some(l => l?.includes('First Name'))).to.be.true
        expect(labels.some(l => l?.includes('Last Name'))).to.be.true
        const firstName = Array.from(form.form.querySelectorAll<RokitInput>('.query-value'))
            .find(input => input.closest('.query-editor')?.textContent?.includes('First Name'))!
        firstName.value = 'Alice'
        const query = form.getQuery()
        const firstNameCriterion = query.criteria.find(c => hasPath(c.field, 'http://example.org/firstName'))
        expect(firstNameCriterion).to.not.be.undefined
        expect(firstNameCriterion!.field.path).to.deep.equal(['http://example.org/person', 'http://example.org/firstName'])
    })
})
