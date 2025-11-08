import { Store, NamedNode, Literal } from 'n3'
import clownface from 'clownface'
import { constructQuery } from '@hydrofoil/shape-to-query'

/**
 * Generates a SPARQL query from a SHACL shape and form values.
 * 
 * @param shapesStore - The N3 Store containing SHACL shapes
 * @param shapeSubject - The subject (IRI) of the root SHACL NodeShape
 * @param valuesStore - The N3 Store containing form values
 * @param queryType - Type of query to generate: 'construct' or 'select' (default: 'construct')
 * @returns A SPARQL query string
 */
export function generateQuery(
    shapesStore: Store,
    shapeSubject: NamedNode,
    valuesStore: Store,
    queryType: 'construct' | 'select' = 'construct'
): string {
    // Create a clownface pointer to the shape in the shapes graph
    const shapesDataset = clownface({ dataset: shapesStore })
    const shapePointer = shapesDataset.namedNode(shapeSubject.value)
    
    // Generate base query pattern from SHACL shape using @hydrofoil/shape-to-query
    const baseQuery = constructQuery(shapePointer)
    
    // Extract form values to add as filters
    const valueQuads = valuesStore.getQuads(null, null, null, null)
    
    // Start with the base query
    let finalQuery = baseQuery
    
    if (valueQuads.length === 0) {
        // No form values, but still need to apply query type conversion
        if (queryType === 'select' && finalQuery.includes('CONSTRUCT')) {
            finalQuery = finalQuery.replace(/CONSTRUCT\s*\{[\s\S]*?\}\s*WHERE/i, 'SELECT * WHERE')
        }
        return finalQuery
    }
    // Parse the generated CONSTRUCT query to extract patterns
    // We'll add filters based on form values
    
    // Extract predicates and their values from the form data
    const filters: string[] = []
    const predicateValues = new Map<string, Set<string>>()
    
    for (const quad of valueQuads) {
        const predicate = quad.predicate.value
        let objectValue: string
        
        if (quad.object.termType === 'Literal') {
            const literal = quad.object as Literal
            if (literal.language) {
                objectValue = `"${literal.value}"@${literal.language}`
            } else if (literal.datatype && literal.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string') {
                objectValue = `"${literal.value}"^^<${literal.datatype.value}>`
            } else {
                objectValue = `"${literal.value}"`
            }
        } else if (quad.object.termType === 'NamedNode') {
            objectValue = `<${quad.object.value}>`
        } else {
            // BlankNode - skip for now
            continue
        }
        
        if (!predicateValues.has(predicate)) {
            predicateValues.set(predicate, new Set())
        }
        predicateValues.get(predicate)!.add(objectValue)
    }
    
    // Build filter clauses
    for (const [predicate, values] of predicateValues.entries()) {
        if (values.size > 0) {
            const valuesArray = Array.from(values)
            const predicateVar = `?val_${predicate.replace(/[^a-zA-Z0-9]/g, '_')}`
            
            if (valuesArray.length === 1) {
                filters.push(`  FILTER(${predicateVar} = ${valuesArray[0]})`)
            } else {
                const valuesStr = valuesArray.join(', ')
                filters.push(`  FILTER(${predicateVar} IN (${valuesStr}))`)
            }
        }
    }
    
    // Modify the query to add filters
    
    if (filters.length > 0) {
        // Find WHERE clause and insert filters before the closing brace
        const whereMatch = finalQuery.match(/(WHERE\s*{[\s\S]*)(})/)
        if (whereMatch) {
            const beforeClosing = whereMatch[1]
            const closingBrace = whereMatch[2]
            finalQuery = finalQuery.replace(
                whereMatch[0],
                beforeClosing + '\n' + filters.join('\n') + '\n' + closingBrace
            )
        }
    }
    
    // Convert to SELECT if requested
    if (queryType === 'select') {
        // Match CONSTRUCT { ... } WHERE and replace with SELECT * WHERE
        // Handle both single-line and multi-line formats, including whitespace and newlines
        if (finalQuery.includes('CONSTRUCT')) {
            finalQuery = finalQuery.replace(/CONSTRUCT\s*\{[\s\S]*?\}\s*WHERE/i, 'SELECT * WHERE')
        }
    }
    
    return finalQuery
}
