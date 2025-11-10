import { describe, it, expect } from 'vitest'
import { Store, DataFactory } from 'n3'
import { Parser } from 'sparqljs'
import type { ConstructQuery, SelectQuery, FilterPattern, OperationExpression, LiteralTerm } from 'sparqljs'
import { buildQuery } from '../src/query'
import { SHAPES_GRAPH } from '../src/constants'

const { namedNode, blankNode, literal, quad } = DataFactory

describe('buildQuery', () => {
    const shapeIri = namedNode('http://example.org/ExampleShape')
    const propertyShape = blankNode('propertyShape')
    const namePredicate = namedNode('http://example.org/name')
    const rootInstance = namedNode('http://example.org/instance1')

    function createShapesStore(): Store {
        const store = new Store()
        store.addQuad(quad(shapeIri, namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), namedNode('http://www.w3.org/ns/shacl#NodeShape'), SHAPES_GRAPH))
        store.addQuad(quad(shapeIri, namedNode('http://www.w3.org/ns/shacl#property'), propertyShape, SHAPES_GRAPH))
        store.addQuad(quad(propertyShape, namedNode('http://www.w3.org/ns/shacl#path'), namePredicate, SHAPES_GRAPH))
        return store
    }

    function parseQuery(query: string): ConstructQuery | SelectQuery {
        const parser = new Parser()
        const parsed = parser.parse(query)
        if (parsed.type !== 'query') {
            throw new Error(`Unsupported query type: ${parsed.type}`)
        }

        return parsed as ConstructQuery | SelectQuery
    }

    function getFilterExpressions(parsed: ConstructQuery | SelectQuery): OperationExpression[] {
        const filters = (parsed.where ?? []).filter((pattern): pattern is FilterPattern => pattern.type === 'filter')
        return filters.map((pattern) => pattern.expression).filter((expression): expression is OperationExpression => 'operator' in expression)
    }

    function isTerm(input: unknown): input is { termType: string; value?: string } {
        return typeof input === 'object' && input !== null && 'termType' in input
    }

    it('generates a CONSTRUCT query with value patterns', () => {
        const shapesStore = createShapesStore()
        const valuesStore = new Store()
        valuesStore.addQuad(quad(rootInstance, namePredicate, literal('Test Name')))

        const query = buildQuery(shapesStore, shapeIri, valuesStore, rootInstance)
        const parsed = parseQuery(query)
        const filterExpressions = getFilterExpressions(parsed)

        expect(typeof query).toBe('string')
        expect(query).toContain('CONSTRUCT')
        expect(query).toContain('WHERE')
        expect(
            filterExpressions.some((expression) => {
                if (expression.operator !== '=') {
                    return false
                }

                const [variable, value] = expression.args ?? []
                return isTerm(variable) && variable.termType === 'Variable' && isTerm(value) && value.termType === 'Literal' && value.value === 'Test Name'
            })
        ).toBe(true)
    })

    it('falls back to a SELECT query when requested', () => {
        const shapesStore = createShapesStore()
        const valuesStore = new Store()

        const query = buildQuery(shapesStore, shapeIri, valuesStore, rootInstance, {
            type: 'select',
            distinct: false
        })
        const parsed = parseQuery(query)

        expect(typeof query).toBe('string')
        expect(query).toContain('SELECT')
        expect(query).not.toContain('DISTINCT')
        expect(parsed.queryType).toBe('SELECT')
    })

    it('omits value patterns when the form is empty', () => {
        const shapesStore = createShapesStore()
        const valuesStore = new Store()

        const query = buildQuery(shapesStore, shapeIri, valuesStore, rootInstance)
        const parsed = parseQuery(query)
        const filterExpressions = getFilterExpressions(parsed)

        expect(typeof query).toBe('string')
        expect(query.length).toBeGreaterThan(0)
        expect(filterExpressions.length).toBe(0)
    })

    it('aligns filters with variables produced by shape-to-query', () => {
        const shapesStore = createShapesStore()
        const valuesStore = new Store()
        valuesStore.addQuad(quad(rootInstance, namePredicate, literal('Aligned Name')))

        const query = buildQuery(shapesStore, shapeIri, valuesStore, rootInstance)
        const parsed = parseQuery(query)
        const filterExpressions = getFilterExpressions(parsed)

        const tripleVariable = (parsed.where ?? [])
            .filter((pattern) => pattern.type === 'bgp')
            .flatMap((pattern) => pattern.triples)
            .find((triple) => isTerm(triple.predicate) && triple.predicate.termType === 'NamedNode' && triple.predicate.value === namePredicate.value)?.object

        expect(tripleVariable && tripleVariable.termType === 'Variable').toBe(true)

        expect(
            filterExpressions.some((expression) => {
                if (expression.operator !== '=') {
                    return false
                }

                const [variable, value] = expression.args ?? []
                return isTerm(variable) && variable.termType === 'Variable' && variable.value === tripleVariable?.value && isTerm(value) && value.termType === 'Literal' && value.value === 'Aligned Name'
            })
        ).toBe(true)
    })

    it('wraps optional properties in OPTIONAL blocks when no value is provided', () => {
        const shapesStore = new Store()
        const nameShape = blankNode('requiredPropertyShape')
        const optionalShape = blankNode('optionalPropertyShape')
        const agePredicate = namedNode('http://example.org/age')

        shapesStore.addQuad(quad(shapeIri, namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), namedNode('http://www.w3.org/ns/shacl#NodeShape'), SHAPES_GRAPH))
        shapesStore.addQuad(quad(shapeIri, namedNode('http://www.w3.org/ns/shacl#property'), nameShape, SHAPES_GRAPH))
        shapesStore.addQuad(quad(shapeIri, namedNode('http://www.w3.org/ns/shacl#property'), optionalShape, SHAPES_GRAPH))
        shapesStore.addQuad(quad(nameShape, namedNode('http://www.w3.org/ns/shacl#path'), namePredicate, SHAPES_GRAPH))
        shapesStore.addQuad(quad(nameShape, namedNode('http://www.w3.org/ns/shacl#minCount'), literal('1', namedNode('http://www.w3.org/2001/XMLSchema#integer')), SHAPES_GRAPH))
        shapesStore.addQuad(quad(optionalShape, namedNode('http://www.w3.org/ns/shacl#path'), agePredicate, SHAPES_GRAPH))

        const valuesStore = new Store()
        valuesStore.addQuad(quad(rootInstance, namePredicate, literal('Test Name')))

        const query = buildQuery(shapesStore, shapeIri, valuesStore, rootInstance, {
            type: 'select'
        })
        const parsed = parseQuery(query) as SelectQuery

        expect(
            parsed.where?.some((pattern) => {
                if (pattern.type !== 'optional') {
                    return false
                }

                const bgp = pattern.patterns.find((inner) => inner.type === 'bgp')
                if (!bgp) {
                    return false
                }

                return bgp.triples.some((triple) => isTerm(triple.predicate) && triple.predicate.termType === 'NamedNode' && triple.predicate.value === 'http://example.org/age')
            })
        ).toBe(true)
    })

    it('uses IN filters for properties with multiple literal values', () => {
        const shapesStore = createShapesStore()
        const valuesStore = new Store()
        valuesStore.addQuad(quad(rootInstance, namePredicate, literal('First Value')))
        valuesStore.addQuad(quad(rootInstance, namePredicate, literal('Second Value')))

        const query = buildQuery(shapesStore, shapeIri, valuesStore, rootInstance, {
            type: 'select'
        })
        const parsed = parseQuery(query)
        const filterExpressions = getFilterExpressions(parsed)

        expect(
            filterExpressions.some((expression) => {
                if (expression.operator !== 'in') {
                    return false
                }

                const [, list] = expression.args ?? []
                if (!Array.isArray(list)) {
                    return false
                }

                const literalValues = list.filter((term): term is LiteralTerm => isTerm(term) && term.termType === 'Literal').map((term) => term.value)

                return literalValues.includes('First Value') && literalValues.includes('Second Value')
            })
        ).toBe(true)
    })
})
