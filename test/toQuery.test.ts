/**
 * Test file for toQuery() functionality
 * 
 * This test demonstrates the usage of the toQuery() function to generate
 * SPARQL queries from SHACL-based forms.
 */

import { describe, it, expect } from 'vitest'
import { Store, DataFactory } from 'n3'
import { generateQuery } from '../src/query'

const { namedNode, literal, quad } = DataFactory

describe('toQuery', () => {
  it('should generate a basic CONSTRUCT query from a simple shape', () => {
    // Create a simple SHACL shape
    const shapesStore = new Store()
    const shapeIRI = namedNode('http://example.org/ExampleShape')
    
    shapesStore.addQuad(
      quad(
        shapeIRI,
        namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        namedNode('http://www.w3.org/ns/shacl#NodeShape')
      )
    )
    
    shapesStore.addQuad(
      quad(
        shapeIRI,
        namedNode('http://www.w3.org/ns/shacl#property'),
        namedNode('http://example.org/property1')
      )
    )
    
    shapesStore.addQuad(
      quad(
        namedNode('http://example.org/property1'),
        namedNode('http://www.w3.org/ns/shacl#path'),
        namedNode('http://example.org/name')
      )
    )
    
    // Create form values
    const valuesStore = new Store()
    valuesStore.addQuad(
      quad(
        namedNode('http://example.org/instance1'),
        namedNode('http://example.org/name'),
        literal('Test Name')
      )
    )
    
    // Generate query
    const query = generateQuery(shapesStore, shapeIRI, valuesStore, 'construct')
    
    // Verify the query is a string
    expect(typeof query).toBe('string')
    
    // Verify it's a CONSTRUCT query
    expect(query).toContain('CONSTRUCT')
    
    // Verify it has a WHERE clause
    expect(query).toContain('WHERE')
  })
  
  it('should generate a SELECT query when specified', () => {
    const shapesStore = new Store()
    const shapeIRI = namedNode('http://example.org/ExampleShape')
    
    shapesStore.addQuad(
      quad(
        shapeIRI,
        namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        namedNode('http://www.w3.org/ns/shacl#NodeShape')
      )
    )
    
    const valuesStore = new Store()
    
    // Generate SELECT query
    const query = generateQuery(shapesStore, shapeIRI, valuesStore, 'select')
    
    // Verify it's a SELECT query
    expect(typeof query).toBe('string')
    expect(query).toContain('SELECT')
  })
  
  it('should handle empty form values', () => {
    const shapesStore = new Store()
    const shapeIRI = namedNode('http://example.org/ExampleShape')
    
    shapesStore.addQuad(
      quad(
        shapeIRI,
        namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        namedNode('http://www.w3.org/ns/shacl#NodeShape')
      )
    )
    
    const valuesStore = new Store()
    
    // Generate query with no values
    const query = generateQuery(shapesStore, shapeIRI, valuesStore, 'construct')
    
    // Should still generate a valid query
    expect(typeof query).toBe('string')
    expect(query.length).toBeGreaterThan(0)
  })
})
