import { describe, it, expect } from 'vitest'
import { Store, DataFactory } from 'n3'
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

    it('generates a CONSTRUCT query with value patterns', () => {
        const shapesStore = createShapesStore()
        const valuesStore = new Store()
        valuesStore.addQuad(quad(rootInstance, namePredicate, literal('Test Name')))

        const query = buildQuery(shapesStore, shapeIri, valuesStore, rootInstance)

        expect(typeof query).toBe('string')
        expect(query).toContain('CONSTRUCT')
        expect(query).toContain('WHERE')
        expect(query).toContain('<http://example.org/name> "Test Name"')
    })

    it('falls back to a SELECT query when requested', () => {
        const shapesStore = createShapesStore()
        const valuesStore = new Store()

        const query = buildQuery(shapesStore, shapeIri, valuesStore, rootInstance, {
            type: 'select',
            distinct: false
        })

        expect(typeof query).toBe('string')
        expect(query).toContain('SELECT')
        expect(query).not.toContain('DISTINCT')
    })

    it('omits value patterns when the form is empty', () => {
        const shapesStore = createShapesStore()
        const valuesStore = new Store()

        const query = buildQuery(shapesStore, shapeIri, valuesStore, rootInstance)

        expect(typeof query).toBe('string')
        expect(query.length).toBeGreaterThan(0)
        expect(query).not.toContain('"Test Name"')
    })
})
