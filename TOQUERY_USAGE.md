# Using the `toQuery()` Function

## Overview

`toQuery()` turns the current `<shacl-form>` state into a SPARQL query. The method complements the existing serialization helpers so that a form can double as a search/filter UI against a SPARQL endpoint.

The feature now ships with this repository. The public API mirrors `src/form.ts` and the builder logic in `src/query.ts`.

## Basic Usage

```javascript
// Reference your form element
const form = document.querySelector('shacl-form')

// Default: generate a CONSTRUCT query
const constructQuery = form.toQuery()

// Generate a SELECT query and tweak the projection
const selectQuery = form.toQuery({
    type: 'select',
    selectVariables: ['resource', 'name', 'email'],
    distinct: true
})
```

`toQuery()` throws if the form has not completed initialization (no SHACL shape loaded).

## How It Works

1. **Base query from shapes** – We load the active SHACL `NodeShape` into [`@hydrofoil/shape-to-query`](https://www.npmjs.com/package/@hydrofoil/shape-to-query) to generate an initial SPARQL CONSTRUCT query.
2. **Form values to RDF** – `ShaclForm.toRDF()` captures the current editors as an `n3.Store`.
3. **Value patterns** – The builder from `src/query.ts` walks the store and injects triple patterns for populated values (blank nodes become fresh variables, literals keep their datatype/language). No FILTERs are added; existing triples are reused.
4. **Query type switch** – When `options.type === 'select'`, the WHERE clause is preserved but SELECT variables come from `options.selectVariables` (defaulting to the main subject variable). Otherwise the CONSTRUCT query returned by `shape-to-query` is re-stringified with the augmented WHERE.

## Minimal Example

HTML (using `String.raw` to keep Turtle quoting intact):

```html
<shacl-form id="search-form"></shacl-form>
<script type="module">
    const form = document.getElementById('search-form')
    form.dataset.shapes = String.raw`
@prefix sh:   <http://www.w3.org/ns/shacl#> .
@prefix ex:   <http://example.org#> .
@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .

ex:PersonShape
    a sh:NodeShape ;
    sh:targetClass ex:Person ;
    sh:property [
        sh:name "Name" ;
        sh:path ex:name ;
        sh:datatype xsd:string ;
    ] ;
    sh:property [
        sh:name "Email" ;
        sh:path ex:email ;
        sh:datatype xsd:string ;
        sh:pattern "^[^\s@]+@[^\s@]+\.[^\s@]+$" ;
    ] .
`
</script>
```

JavaScript:

```javascript
const form = document.getElementById('search-form')

// Wait for the component to load its shapes
form.addEventListener('shacl-form-loaded', () => {
    const query = form.toQuery()
    console.log(query)
})
```

### Posting the query

```javascript
const query = form.toQuery({ type: 'select', distinct: true })

await fetch('https://example.org/sparql', {
    method: 'POST',
    headers: {
        'content-type': 'application/sparql-query',
        accept: 'application/sparql-results+json'
    },
    body: query
})
```

## Generated Query Snapshot

With `name` set to `John Doe` and `email` set to `john@example.org`, `toQuery()` returns a CONSTRUCT like:

```sparql
CONSTRUCT {
  ?resource <http://example.org#name> ?resource_name_1 .
  ?resource <http://example.org#email> ?resource_email_1 .
}
WHERE {
  ?resource a <http://example.org#Person> .
  ?resource <http://example.org#name> "John Doe" .
  ?resource <http://example.org#email> "john@example.org" .
}
```

Literal values appear directly in the WHERE clause instead of FILTER expressions, matching the form’s data graph.

## Important Notes

1. **No execution** – The method returns a query string. Dispatch it to your endpoint or client library yourself.
2. **Empty forms** – If the form has no values, the result is the bare shape-driven query (still valid to run).
3. **QueryBuildOptions** – `src/query.ts` exports:

   ```ts
   interface QueryBuildOptions {
       type?: 'construct' | 'select'
       subjectVariable?: string
       selectVariables?: string[]
       distinct?: boolean
   }
   ```

   `subjectVariable` defaults to `resource`. Blank nodes in the form become fresh variables derived from that name.
4. **Patterns vs FILTERs** – The local implementation emits triple patterns. Add extra filters manually if you need partial matches.
5. **Validation still applies** – `toQuery()` doesn’t bypass SHACL validation. Use `validate()` first if you depend on clean data before fetching.

## Use Cases

- Build a faceted search form powered by SHACL shapes
- Offer editable forms that can also pre-filter results lists
- Reuse form state in downstream data synchronization scripts

## Demo and Tests

- `demo/toQuery-example.html` – interactive example styled like the main demo site
- `test/toQuery.test.ts` – Vitest coverage for CONSTRUCT/SELECT output and empty-form behaviour

## Dependencies

- [`@hydrofoil/shape-to-query`](https://www.npmjs.com/package/@hydrofoil/shape-to-query)
- [`rdf-sparql-builder`](https://www.npmjs.com/package/rdf-sparql-builder)
- [`clownface`](https://www.npmjs.com/package/clownface)
- [`@zazuko/env`](https://www.npmjs.com/package/@zazuko/env)

All required packages are already declared in this repository’s `package.json`.
