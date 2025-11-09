# Using the `toQuery()` Function

## Overview

`toQuery()` turns the current `<shacl-form>` state into a SPARQL query. Use it to reuse a form as a filter/search UI against a SPARQL endpoint. The implementation lives in `src/form.ts` and `src/query.ts`.

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

1. **Base query from shapes** – [`@hydrofoil/shape-to-query`](https://www.npmjs.com/package/@hydrofoil/shape-to-query) produces the initial CONSTRUCT query, including all mandatory triples.
2. **Form state to RDF** – `ShaclForm.toRDF()` captures the current editors as an `n3.Store`.
3. **Value injection** – `src/query.ts` walks the store, maps blank nodes to fresh variables, and augments the base WHERE clause:
    - Filled required properties stay as straight triple patterns.
    - Optional properties without values are wrapped into `OPTIONAL { ... }` blocks.
    - Literal inputs become `FILTER(?var = "value")` clauses, or `FILTER(?var IN (...))` when several values are present.
4. **Variable alignment** – Shape-to-query may rename the focus variable (for example `?resource1`). The builder detects that name and keeps any extra triples/filters in sync so the query remains connected. Passing `subjectVariable` lets you request a prefix; `toQuery()` still binds to the actual generated name.
5. **Query type switch** – When `options.type === 'select'`, the WHERE clause is reused and the SELECT projection is built from `selectVariables` (defaulting to the resolved focus variable). Otherwise the enriched CONSTRUCT query is returned.

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

With `name` set to `John Doe`, `email` set to `john@example.org`, and `age` left empty, the resulting CONSTRUCT looks like:

```sparql
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
CONSTRUCT {
    ?resource1 a <http://example.org#Person> .
    ?resource1 <http://example.org#name> ?resource2 .
    ?resource1 <http://example.org#email> ?resource3 .
    ?resource1 <http://example.org#age> ?resource4 .
}
WHERE {
    ?resource1 a <http://example.org#Person> ;
                         <http://example.org#name> ?resource2 ;
                         <http://example.org#email> ?resource3 .
    OPTIONAL { ?resource1 <http://example.org#age> ?resource4 }
    FILTER(?resource2 = "John Doe")
    FILTER(?resource3 = "john@example.org"^^xsd:string)
}
```

Notice how the focus variable coming from shape-to-query became `?resource1`; `toQuery()` reuses that same name for all added filters so the graph stays connected.

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
4. **Structural vs value logic** – The builder keeps structural triples intact and adds equality-style filters. Layer your own FILTERs if you need partial matches or advanced conditions.
5. **Literal behaviour** – Straight equality and `IN` filters are emitted for exact matches. Add your own regex or range filters on top if you need partial search.
6. **No dev server requirement** – The demos run as standalone HTML pages. `npm run dev` is optional and only needed if you want Vite’s live reload.
7. **Validation still applies** – `toQuery()` doesn’t bypass SHACL validation. Use `validate()` first if you depend on clean data before fetching.

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
