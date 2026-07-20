import { expect } from '@open-wc/testing'
import { DataFactory } from 'n3'
import { Query, QueryField } from '../src/query'
import { SparqlQueryBuilder, SparqlQueryProvider, termToSparql } from '../src/query/sparql'

const field: QueryField = {
    id: 'title', path: ['http://example.org/child', 'http://example.org/title']
}

const query: Query = {
    rootShapeId: 'http://example.org/Shape', targetClass: 'http://example.org/Thing',
    criteria: [{ field, operator: 'contains', value: DataFactory.literal('A "quoted" value') }]
}

describe('SPARQL query support', () => {
    it('builds safe nested SELECT queries and pagination', () => {
        const sparql = new SparqlQueryBuilder().buildSelect(query, { orderBy: 'ASC(?root)', limit: 10, offset: 20 })
        expect(sparql).to.contain('?root <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://example.org/Thing>')
        expect(sparql).to.contain('?root <http://example.org/child> ?criterion_0_0')
        expect(sparql).to.contain('LCASE("A \\"quoted\\" value")')
        expect(sparql).to.contain('ORDER BY ASC(?root)\nLIMIT 10\nOFFSET 20')
    })

    it('restricts language-tagged text criteria to their language', () => {
        const languageQuery: Query = {
            ...query,
            criteria: [{ field, operator: 'contains', value: DataFactory.literal('Brücke', 'de') }],
        }
        const sparql = new SparqlQueryBuilder().buildWhere(languageQuery)

        expect(sparql).to.contain('FILTER(LANGMATCHES(LANG(?value_0), "de"))')
    })

    it('supports fixed and variable named graphs and root overrides', () => {
        const fixed = new SparqlQueryBuilder({ dataset: { type: 'named', graph: DataFactory.namedNode('http://example.org/graph') } }).buildWhere(query)
        expect(fixed).to.match(/^GRAPH <http:\/\/example.org\/graph>/)
        const variable = new SparqlQueryBuilder({
            dataset: { type: 'named' },
            rootPattern: context => `${context.rootVariable} <http://example.org/indexed> true .`,
        }).buildWhere({ ...query, targetClass: undefined })
        expect(variable).to.contain('GRAPH ?graph')
        expect(variable).to.contain('?root <http://example.org/indexed> true')
    })

    it('parses discrete facets through a bounded executor', async () => {
        let calls = 0
        const provider = new SparqlQueryProvider(async sparql => {
            calls++
            expect(sparql).to.contain('LIMIT 5')
            return { results: { bindings: [{
                fieldId: { type: 'literal', value: 'title' },
                facetValue: { type: 'literal', value: 'hello' },
                count: { type: 'literal', value: '3' },
                total: { type: 'literal', value: '2' },
            }] } }
        }, {
            bucketLimit: 5,
        })
        const facets = await provider.getFacets({ query: { ...query, criteria: [] }, fields: [field], signal: new AbortController().signal })
        expect(calls).to.equal(1)
        expect(facets[0].count).to.equal(2)
        expect(facets[0].buckets?.[0].value.value).to.equal('hello')
        expect(facets[0].buckets?.[0].count).to.equal(3)
    })

    it('batches multiple facets into one executor call', async () => {
        let calls = 0
        const secondField: QueryField = { id: 'year', path: ['http://example.org/year'] }
        const provider = new SparqlQueryProvider(async sparql => {
            calls++
            expect(sparql).to.contain('UNION')
            return { results: { bindings: [
                {
                    fieldId: { type: 'literal', value: 'title' },
                    facetValue: { type: 'literal', value: 'hello' },
                    count: { type: 'literal', value: '3' },
                    total: { type: 'literal', value: '2' },
                },
                {
                    fieldId: { type: 'literal', value: 'year' },
                    facetValue: { type: 'literal', value: '2026' },
                    count: { type: 'literal', value: '1' },
                    total: { type: 'literal', value: '1' },
                },
            ] } }
        })
        const facets = await provider.getFacets({ query: { ...query, criteria: [] }, fields: [field, secondField], signal: new AbortController().signal })
        expect(calls).to.equal(1)
        expect(facets.map(facet => facet.fieldId)).to.deep.equal(['title', 'year'])
        expect(facets[1].buckets?.[0].value.value).to.equal('2026')
    })

    it('escapes special characters in IRIs and blank nodes', () => {
        const iri = termToSparql(DataFactory.namedNode('http://example.org/path with spaces'))
        expect(iri).to.equal('<http://example.org/path%20with%20spaces>')
        const bnode = termToSparql(DataFactory.blankNode('node-id.1'))
        expect(bnode).to.equal('_:node-id.1')
    })

    it('returns error facets when executor fails', async () => {
        const provider = new SparqlQueryProvider(async () => { throw new Error('endpoint down') })
        const facets = await provider.getFacets({ query: { ...query, criteria: [] }, fields: [field], signal: new AbortController().signal })
        expect(facets).to.have.length(1)
        expect(facets[0].error).to.be.true
        expect(facets[0].count).to.equal(0)
    })

    it('creates a provider from an endpoint URL', async () => {
        let capturedUrl = ''
        let capturedBody = ''
        const provider = new SparqlQueryProvider('http://example.org/sparql', {
            headers: { 'authorization': 'Bearer token' },
        })
        // patch executor to capture calls
        const original = provider.executor
        ;(provider as any).executor = async (sparql: string, signal: AbortSignal) => {
            capturedBody = sparql
            return { results: { bindings: [] } }
        }
        await provider.getFacets({ query: { ...query, criteria: [] }, fields: [field], signal: new AbortController().signal })
        expect(capturedBody).to.contain('SELECT')
    })

    it('executes a result SELECT query', async () => {
        let capturedQuery = ''
        const provider = new SparqlQueryProvider(async sparql => {
            capturedQuery = sparql
            return { results: { bindings: [{ root: { type: 'uri', value: 'http://example.org/item1' } }] } }
        })
        const result = await provider.select(query, { limit: 10 })
        expect(capturedQuery).to.contain('LIMIT 10')
        expect(result.results.bindings[0].root.value).to.equal('http://example.org/item1')
    })
})
