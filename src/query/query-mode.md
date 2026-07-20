# Query mode

Query mode turns a SHACL node shape into a search form. Instead of producing RDF data, the component exposes the active filters as a backend-neutral JavaScript object. The host application can translate that object into SPARQL, Solr, Elasticsearch, SQL, or another query language.

## Enable query mode

Provide shapes as usual and set `data-mode="query"`:

```html
<shacl-form
  data-mode="query"
  data-shapes-url=".../shapes.ttl"
  data-shape-subject="http://example.org/DocumentShape"
></shacl-form>
```

`data-shape-subject` selects the root node shape. If it is omitted, the component uses its normal root-shape resolution rules. `data-mode="edit"` is the default. Use `data-mode="view"`, or the legacy `data-view` attribute, for view mode.

Query mode uses the shape hierarchy, property labels, descriptions, datatypes, `sh:in`, `sh:class`, `sh:languageIn`, `sh:node`, and supported `sh:or` and `sh:xone` alternatives to build controls. Editing concerns such as required values, default values, minimum counts, and generated subjects do not create query criteria.

Listen for the `query` event to run a search:

```js
const form = document.querySelector('shacl-form')

form.addEventListener('query', event => {
  search(event.detail)
})
```

The event is emitted after the form initializes and whenever a criterion changes. Text input is debounced by 300 ms. It bubbles through the DOM and crosses the component's shadow boundary.

## The query object

`form.getQuery()` and `event.detail` have this structure (RDF values are RDF/JS `Term` objects):

```ts
type Query = {
  rootShapeId: string
  targetClass?: string
  criteria: QueryCriterion[]
}

type QueryCriterion = {
  field: QueryField
  operator: 'contains' | 'equals' | 'range'
  value?: Term
  min?: Term
  max?: Term
}

type QueryField = {
  id: string
  path: string[]
  shapePath?: string[]
  datatype?: string
}
```

- `rootShapeId` identifies the selected root node shape.
- `targetClass` is its `sh:targetClass`, when present.
- `criteria` contains only controls with an active value. An empty form therefore has an empty array.
- `field.id` is an opaque, form-generated identifier. Use it to correlate a field with facet results; do not derive backend meaning from it.
- `field.path` is the complete RDF predicate path from the root resource to the value. A nested field can therefore have a path such as `[ex:author, ex:name]`.
- `field.shapePath` identifies the property-shape branch. It distinguishes qualified or alternative branches that have the same RDF predicate path.
- `field.datatype` is the field's datatype IRI when the shape supplies one.

All criteria are combined with logical AND and apply to the same root resource. RDF path segments describe traversal from that root; intermediate resources are not result rows.

The built-in editors choose operators as follows:

| Shape/value kind | Control | Criterion |
| --- | --- | --- |
| String or language-tagged text | Text input, plus a language chooser for language-tagged text | `contains` with `value` |
| `sh:in`, `sh:class`, or boolean | Select | `equals` with `value` |
| Numeric, `xsd:date`, or `xsd:dateTime` | Min/max inputs or facet-backed slider | `range` with `min` and/or `max` |
| Other IRI or typed value | Text-compatible input | `equals` with `value` |

Language input produces a language-tagged RDF literal. `sh:languageIn` supplies the available language choices; otherwise the chooser starts with the form's preferred language and remains editable. Numeric and temporal bounds are typed literals. A range criterion may contain only one bound. A facet-backed slider is inactive until the user changes it, so merely displaying the full available range does not create a criterion.

Outside query mode, `getQuery()` still returns the root metadata when available but always returns an empty `criteria` array.

## Facets and field availability

A facet provider is optional. Without one, all shape-derived fields remain visible and query events still work. Register a provider to populate choices and ranges and hide filters that cannot match:

```js
form.setQueryFacetProvider({
  async getFacets({ query, fields, signal }) {
    const response = await fetch('/api/search/facets', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, fields }),
    })
    return response.json()
  },
})
```

The provider receives the current `query`, every queryable `field`, and an `AbortSignal`. Honor the signal when doing network work. When a criterion changes, the component emits `query`, aborts the preceding facet request, and requests fresh facets. Results from superseded requests are ignored.

Return one facet per field that the backend can describe:

```ts
type QueryFacet = {
  fieldId: string
  count: number
  buckets?: Array<{
    value: Term
    label?: string
    count: number
  }>
  min?: Term
  max?: Term
  error?: boolean
}
```

- `fieldId` must equal the corresponding `QueryField.id`.
- `count` is the number of matching root resources for which the field is available. Providers should count distinct roots when RDF joins can produce duplicates.
- `buckets` supplies discrete RDF values, optional display labels, and counts. For a field with `sh:in`, buckets outside the shape's allowed values are discarded. An active value missing from refreshed buckets remains selectable with count zero so the user can remove it.
- `min` and `max` supply typed bounds for numeric and temporal fields. When they form a usable interval, the two bound inputs become a range slider.
- `error: true` marks a field-level failure.

An inactive leaf with `count: 0` is given the `query-unavailable` class and hidden by the default theme. An active field remains visible even when its count becomes zero. Structural parent branches are hidden when they contain no available leaf. The host element receives `query-facets-empty` when no filter is available and affected properties receive `query-facet-error` for field-level failures.

If a provider is installed before initialization, the form has `query-facets-pending` and displays the configured loading text until the first facets arrive. Call `form.refreshQueryFacets()` after filters maintained outside the component change; it makes a new facet request without changing or emitting the query. The method is a no-op outside query mode.

If `getFacets` throws, the component emits a bubbling, composed `queryerror` event whose `detail` is the thrown value. Aborted requests do not emit this event.

## SPARQL support

The optional `@ulb-darmstadt/shacl-form/sparql` entry point exports `SparqlQueryProvider` and `SparqlQueryBuilder`. Despite its broad name, `SparqlQueryProvider` implements the form's `QueryFacetProvider` interface. It can also execute the result `SELECT` for the current query.

### Connect directly to an endpoint

Create the provider, register it with the form, and use the same provider to retrieve results:

```ts
import { SparqlQueryProvider } from '@ulb-darmstadt/shacl-form/sparql'

const form = document.querySelector('shacl-form')!
const sparql = new SparqlQueryProvider('/api/sparql')
let latestRequest = 0

form.setQueryFacetProvider(sparql)

form.addEventListener('query', async event => {
  const request = ++latestRequest
  try {
    const result = await sparql.select(event.detail, {
      orderBy: 'ASC(?root)',
      limit: 20,
      offset: 0,
    })
    if (request === latestRequest) {
      renderResults(result.results.bindings)
    }
  } catch (error) {
    if (request === latestRequest) {
      showSearchError(error)
    }
  }
})
```

The provider plays two roles:

1. On initialization and after every filter change, the form calls `sparql.getFacets(...)`. The returned counts, buckets, and bounds update the available controls.
2. The application can call `sparql.select(query, options)` to retrieve matching root resources. The form does not run this result query automatically. The request counter in the example prevents a slow, older request from replacing newer results.

An endpoint provider sends `POST` requests with an `application/x-www-form-urlencoded` body containing the generated `query`. It requests and parses `application/sparql-results+json`. The endpoint must therefore accept SPARQL query requests from the browser, including any required CORS and authentication configuration.

### Configure the endpoint provider

```ts
import { DataFactory } from 'n3'
import { SparqlQueryProvider } from '@ulb-darmstadt/shacl-form/sparql'

const sparql = new SparqlQueryProvider('/api/sparql', {
  headers: {
    authorization: 'Bearer token',
  },
  dataset: {
    type: 'named',
    graph: DataFactory.namedNode('http://example.org/data'),
  },
  bucketLimit: 50,
  caseSensitive: false,
  onError(error, field) {
    console.error(`Could not load facet ${field.id}`, error)
  },
})

form.setQueryFacetProvider(sparql)
```

The endpoint options are:

| Option | Meaning |
| --- | --- |
| `headers` | Additional request headers, for example an authorization header. They are merged with the provider's content type and accept headers. |
| `dataset` | Selects the default graph, one fixed named graph, or any named graph. See below. |
| `bucketLimit` | Maximum number of buckets per discrete field. The default is `100`. |
| `caseSensitive` | Whether `contains` comparisons preserve case. The default is `false`, which compares `LCASE(STR(...))` values. |
| `rootPattern` | Replaces the default SPARQL pattern that identifies root resources. |
| `onError` | Receives facet-loading errors and the affected field. |

`dataset` accepts the following values:

- `{ type: 'default' }` queries the endpoint's default graph. This is the default.
- `{ type: 'named', graph: DataFactory.namedNode('...') }` wraps the generated patterns in a `GRAPH <...>` clause.
- `{ type: 'named' }` wraps them in `GRAPH ?graph`, allowing any named graph to match.

### Choose the root resources

Every generated query starts with a pattern that selects `?root`. By default, the provider uses:

- `?root rdf:type <targetClass>` when the root shape declares `sh:targetClass`; or
- `?root dcterms:conformsTo <rootShapeId>` otherwise.

Use `rootPattern` if the dataset identifies searchable resources differently:

```ts
const sparql = new SparqlQueryProvider('/api/sparql', {
  rootPattern: ({ rootVariable }) => {
    return `${rootVariable} <http://example.org/status> <http://example.org/Published> .`
  },
})
```

Return a SPARQL graph pattern without surrounding braces. The context also contains the current `query` and, for `{ type: 'named' }`, `graphVariable: '?graph'`. The provider adds the configured `GRAPH` wrapper.

### How SPARQL facets are calculated

For each refresh, the provider builds one request containing a `UNION` branch for every queryable field and executes it as a single SPARQL query. Each branch includes the root pattern, all active criteria, and the path of the field being faceted.

- Discrete fields are grouped by value. Bucket counts and the total field count use `COUNT(DISTINCT ?root)`.
- Numeric and temporal fields return `COUNT(DISTINCT ?root)`, `MIN(?facetValue)`, and `MAX(?facetValue)`.
- `bucketLimit` is applied independently to each discrete field.
- Nested `field.path` values become a sequence of triple patterns from `?root` to the facet value.

Because all active criteria are included, facet results describe the already-filtered result set. This includes a criterion on the field currently being faceted.

The SPARQL builder translates `field.path`, but not `field.shapePath`. If multiple qualified shape branches use the same RDF predicate path, they generate the same SPARQL traversal. Use a custom facet provider or query translation when the backend must distinguish those branches using additional type or shape conditions.

Facet failures are handled as field-level availability errors: `getFacets()` returns `{ count: 0, error: true }` for every requested field and invokes `onError(error, field)` for each field. It does not rethrow the endpoint error, so these failures do not produce the form's `queryerror` event. By contrast, `select()` rejects when its endpoint request fails; handle that rejection in the application.

### Use a custom SPARQL transport

Construct `SparqlQueryProvider` directly when requests must go through an SDK, server-side proxy, or custom authentication flow. The executor receives the generated SPARQL string and an `AbortSignal`, and must return SPARQL Results JSON:

```ts
import { SparqlQueryProvider } from '@ulb-darmstadt/shacl-form/sparql'

const sparql = new SparqlQueryProvider(async (query, signal) => {
  const response = await fetch('/api/run-sparql', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!response.ok) {
    throw new Error(`SPARQL request failed: ${response.status}`)
  }
  return response.json()
}, {
  bucketLimit: 50,
})

form.setQueryFacetProvider(sparql)
```

Pass the supplied signal to abortable I/O. A newer form query aborts the previous facet request. Calls to `select()` use the same executor but are not cancelled when the form changes.

### Build SPARQL without the provider

Use `SparqlQueryBuilder` when the application manages transport itself:

```ts
import { SparqlQueryBuilder } from '@ulb-darmstadt/shacl-form/sparql'

const builder = new SparqlQueryBuilder({
  dataset: { type: 'default' },
})

const select = builder.buildSelect(form.getQuery(), {
  projection: ['?root'],
  limit: 20,
})
const where = builder.buildWhere(form.getQuery())
```

By default, `buildSelect` returns distinct `?root` bindings. Its options are `projection`, `distinct`, `orderBy`, `limit`, and `offset`; `select()` returns the endpoint's SPARQL Results JSON unchanged. `buildWhere` returns only the graph pattern. `buildFacetSelect(request, field, bucketLimit)` builds one field's facet query, while `buildFacetsSelect(request, bucketLimit)` combines all requested fields. User-provided `projection` and `orderBy` strings are inserted as SPARQL syntax and should not be populated directly from untrusted input.

## Custom query editors

Registered form plugins may provide `createQueryEditor(field, template)` for specialized query controls. The returned element must expose:

```ts
{
  queryField: QueryField
  getQueryCriteria(): QueryCriterion[]
  setQueryFacet(facet?: QueryFacet): void
}
```

The editor should emit a bubbling `change` event when its criteria change. The component then emits the new query and refreshes facets. If no plugin supplies a query editor, the built-in editor described above is used.

## Differences from edit and view modes

Query mode does not bind form controls to `data-values`, construct RDF, validate SHACL constraints, or submit data. The following methods throw an error in query mode:

- `toRDF()`
- `serialize()`
- `validate()`

Use `getQuery()` to read filters, the `query` event to react to changes, and the facet provider only to describe current availability. Result retrieval remains the responsibility of the hosting application.
