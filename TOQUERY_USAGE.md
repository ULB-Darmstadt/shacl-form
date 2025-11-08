# Using the toQuery() Function

## Overview

The `toQuery()` function is a new feature in shacl-form that generates SPARQL queries from SHACL-based forms. This enables using forms not just for data entry, but also as search interfaces to query SPARQL endpoints.

## Basic Usage

```javascript
// Get a reference to the shacl-form element
const form = document.querySelector('shacl-form');

// Generate a CONSTRUCT query (default)
const constructQuery = form.toQuery();
console.log(constructQuery);

// Generate a SELECT query
const selectQuery = form.toQuery('select');
console.log(selectQuery);
```

## How It Works

1. **Base Query Generation**: The function uses the SHACL shape to generate a base SPARQL query pattern using the [@hydrofoil/shape-to-query](https://www.npmjs.com/package/@hydrofoil/shape-to-query) library.

2. **Form Value Extraction**: It extracts the values entered in the form using the existing `toRDF()` method.

3. **Filter Addition**: The form values are added as FILTER clauses to the query, allowing you to search for data matching the form inputs.

4. **Query Type Selection**: You can choose between CONSTRUCT (returns triples) or SELECT (returns variables) query types.

## Example

### HTML Form Setup

```html
<shacl-form id="search-form" data-shapes="
  @prefix sh:   <http://www.w3.org/ns/shacl#> .
  @prefix ex:   <http://example.org#> .
  @prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .

  ex:PersonShape
    a sh:NodeShape ;
    sh:targetClass ex:Person ;
    sh:property [
      sh:name 'Name' ;
      sh:path ex:name ;
      sh:datatype xsd:string ;
    ] ;
    sh:property [
      sh:name 'Email' ;
      sh:path ex:email ;
      sh:datatype xsd:string ;
    ] .
"></shacl-form>
```

### JavaScript Usage

```javascript
// User fills in the form with:
// Name: "John Doe"
// Email: "john@example.org"

const form = document.getElementById('search-form');

// Generate a CONSTRUCT query
const query = form.toQuery('construct');

// Send the query to your SPARQL endpoint
fetch('https://your-sparql-endpoint.com/query', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/sparql-query',
    'Accept': 'application/n-triples'
  },
  body: query
})
.then(response => response.text())
.then(results => {
  console.log('Query results:', results);
})
.catch(error => {
  console.error('Query error:', error);
});
```

## Generated Query Example

If the form has values for name="John Doe" and email="john@example.org", the generated query might look like:

```sparql
CONSTRUCT {
  ?subject ex:name ?name .
  ?subject ex:email ?email .
}
WHERE {
  ?subject a ex:Person .
  ?subject ex:name ?name .
  ?subject ex:email ?email .
  FILTER(?name = "John Doe")
  FILTER(?email = "john@example.org")
}
```

## Important Notes

1. **Query Execution**: The `toQuery()` function only generates the query string. It does NOT execute the query. Query execution should be handled by your application's server-side code.

2. **Empty Forms**: If no values are entered in the form, the function returns a base query without any filter clauses.

3. **Query Types**:
   - `'construct'` (default): Returns a CONSTRUCT query that builds RDF triples
   - `'select'`: Returns a SELECT query that returns variable bindings

4. **Integration**: This function is designed to work with the existing form structure and does not modify the form's behavior for data entry.

## Use Cases

1. **Search Forms**: Create search interfaces where users can find data matching specific criteria
2. **Data Discovery**: Allow users to explore datasets by querying for patterns
3. **Filter Interfaces**: Build complex filter UIs that generate appropriate SPARQL queries
4. **API Integration**: Generate queries to send to SPARQL endpoints or triple stores

## Demo

See `demo/toQuery-example.html` for a complete working example.

## API Reference

### ShaclForm.toQuery(queryType?)

**Parameters:**
- `queryType` (optional): Either `'construct'` or `'select'`. Default is `'construct'`.

**Returns:**
- A string containing the generated SPARQL query

**Throws:**
- Error if the form is not initialized or no shape is loaded

**Example:**
```javascript
const form = document.querySelector('shacl-form');

// Get a CONSTRUCT query
const construct = form.toQuery('construct');

// Get a SELECT query  
const select = form.toQuery('select');
```

## Dependencies

The toQuery() function uses the following npm packages:
- [@hydrofoil/shape-to-query](https://www.npmjs.com/package/@hydrofoil/shape-to-query) - For generating base SPARQL patterns from SHACL shapes
- [rdf-sparql-builder](https://www.npmjs.com/package/rdf-sparql-builder) - For programmatic SPARQL query construction
- [clownface](https://www.npmjs.com/package/clownface) - For RDF graph traversal

All dependencies are bundled with the library.
