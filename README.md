# SHACL Form Generator
An HTML5 web component to edit and view [RDF](https://www.w3.org/RDF/) data that conform to [SHACL shapes](https://www.w3.org/TR/shacl/).

## [See demo here](https://ulb-darmstadt.github.io/shacl-form/)

### Basic usage

```html
<html>
  <head>
    <!-- load the bundled web component (for app development, use: npm i @ulb-darmstadt/shacl-form) -->
    <script src="https://cdn.jsdelivr.net/npm/@ulb-darmstadt/shacl-form/dist/bundle.js" type="module"></script>
  </head>
  <body>
    <!--
      Provide SHACL shapes via the data-shapes attribute
      or load them from a URL with data-shapes-url.
    -->
    <shacl-form data-shapes="
      @prefix sh:   <http://www.w3.org/ns/shacl#> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      @prefix ex:   <http://example.org#> .

      ex:ExampleShape
        a sh:NodeShape, rdfs:Class ;
        sh:property [
          sh:name 'my value' ;
          sh:path ex:exampleValue ;
          sh:maxCount 3 ;
        ] .
    "></shacl-form>

    <script>
      const form = document.querySelector("shacl-form")
      form.addEventListener('change', event => {
        // check if form data validates according to the SHACL shapes
        if (event.detail?.valid) {
          // serialize the RDF graph and log it
          const triples = form.serialize()
          console.log('entered form data', triples)
          // store the data somewhere, e.g. in a triple store
        }
      })
    </script>
  </body>
</html>
```
## Install and use in your project

Install the package:

```console
npm i @ulb-darmstadt/shacl-form
```

This package has peer dependencies; install them in your app as well:

```console
npm i @ro-kit/ui-widgets jsonld leaflet leaflet-editable leaflet.fullscreen n3 rdfxml-streaming-parser shacl-engine uuid
```

Load the web component in your app. For a Vite/webpack-style project, import it once at startup:

```ts
import '@ulb-darmstadt/shacl-form'
```

Then use the element in your HTML:

```html
<shacl-form data-shapes="..."></shacl-form>
```

Alternatively, load the prebuilt bundle directly in a plain HTML page, as shown above:

```html
<script src="https://cdn.jsdelivr.net/npm/@ulb-darmstadt/shacl-form/dist/bundle.js" type="module"></script>
```

### Element attributes

Attribute | Description
---|---
data-shapes | SHACL shape definitions (e.g. Turtle) used to generate the form
data-shapes-url | When `data-shapes` is not set, load SHACL shapes from this URL
data-shape-subject | Optional subject IRI for the root node shape. If not set, the first node shape is used
data-values | RDF triples (e.g. Turtle) used to prefill the form
data-values-url | When `data-values` is not set, load RDF triples from this URL
data-values-subject | Subject (IRI or blank node id) for generated data. If not set, a blank node with a new UUID is created. If `data-values` or `data-values-url` is set, this id is used to find the root node in the data graph
data-values-namespace | RDF namespace used when generating new RDF subjects. Default is empty, which yields blank nodes
data-values-graph | If set, serialization creates a named graph with this IRI
data-language | Language for `langString` values (e.g. in `sh:name` or `rdfs:label`). Default is [`navigator.language`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/language) with fallback to [`navigator.languages`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/languages)
data-loading | Text displayed while the component initializes. Default is `"Loading..."`
data-ignore-owl-imports | By default, `owl:imports` URLs are fetched and merged into the shapes graph. Set this attribute to disable that behavior
data-view | When set, turns the component into a viewer that displays the data graph without editing
data-collapse | When set, `sh:group`s and properties with `sh:node` and `sh:maxCount` != 1 are rendered in a collapsible accordion. Use value `"open"` to start expanded
data-submit-button | [Ignored when `data-view` is set] Adds a submit button. The attribute value is used as the label. `submit` events fire only when the data validates
data-generate-node-shape-reference | When generating RDF data, adds a triple that references the root `sh:NodeShape`. Default predicate is `http://purl.org/dc/terms/conformsTo`. Set to an empty string to disable
data-show-node-ids | Show node shape subject ids in the form
data-show-root-shape-label | If set and the root shape has `rdfs:label` or `dcterms:title`, display that value as a heading
data-proxy | Proxy URL used when fetching resources (e.g. `owl:imports`). The resource URL is appended to the proxy value, e.g. `http://your-proxy.org/?url=`
data-dense | Boolean to render a compact form with smaller paddings and margins. Default is true
data-hierarchy-colors | Comma-separated list of CSS colors for nested hierarchy bars. If unset, a default palette is used
data-use-shadow-root | Boolean string indicating whether `<shacl-form>` renders into a shadow root. Default is `"true"`. Set to `"false"` to render into light DOM

### Element functions

<a id="toRDF"></a>
```typescript
toRDF(graph?: Store): Store
```
Adds the form values as RDF triples to the given graph. If no graph is provided, creates a new [N3 Store](https://github.com/rdfjs/N3.js#storing).

```typescript
serialize(format?: string, graph?: Store): string
```
Serializes the given RDF graph to the given format. If no graph is provided, this calls `toRDF()` to construct the form data graph in one of the supported [output formats](#output-formats) (default is `text/turtle`).

```typescript
validate(ignoreEmptyValues: boolean): Promise<boolean>
```
Validates form data against the SHACL shapes graph and displays validation results as icons next to the respective input fields. If `ignoreEmptyValues` is true, empty fields will not be marked invalid. This function is also invoked on `change` and `submit` events.

```typescript
registerPlugin(plugin: Plugin)
```
Registers a [plugin](./src/plugin.ts) to customize editing/viewing of certain values. Plugins handle specific RDF predicates, `xsd:datatype`s, or both. Example: [Leaflet](./src/plugins/leaflet.ts)

```typescript
setTheme(theme: Theme)
```
Sets the design theme used for rendering. See [Theming](#theming).

```typescript
setClassInstanceProvider((className: string) => Promise<string>)
```
Sets a callback that is invoked when a SHACL property has an `sh:class` definition to retrieve class instances. See [below](#classInstanceProvider) for details.

```typescript
setResourceLinkProvider(provider: ResourceLinkProvider)
```
Registers a callback provider that supplies existing resources for linking. The provider lists resources that conform to a node shape and loads RDF data for selected resources. See [below](#resourcelinkprovider).

## Features

### Validation

In edit mode, `<shacl-form>` validates the constructed data graph using [shacl-engine](https://github.com/rdf-ext/shacl-engine) and displays validation results as icons next to the relevant fields.

### Data graph binding

`<shacl-form>` requires only a shapes graph as input via `data-shapes` (or `data-shapes-url`) to generate an empty form and create new RDF data from user input. Using `data-values` (or `data-values-url`) and `data-values-subject`, you can also bind an existing data graph to the form and prefill the fields.

### Viewer mode

`<shacl-form>` is both an editor and a viewer. Set `data-view` and bind a shapes graph and a data graph to render a read-only view. See the [demo](https://ulb-darmstadt.github.io/shacl-form/#viewer-mode).

### Providing additional data to the shapes graph

Besides `data-shapes` and `data-shapes-url`, there are two ways to add RDF data to the shapes graph:

1. While parsing the shapes graph, any `owl:imports` predicate with a valid HTTP URL is fetched. The response is parsed (using one of the [supported](#formats) MIME types) and added to a named graph. This graph is scoped to the node where the `owl:import` is defined and its sub nodes.

   The [example shapes graph](https://ulb-darmstadt.github.io/shacl-form/#example) contains the following triples:

   ```
   example:Attribution
     sh:property [
       owl:imports <https://w3id.org/nfdi4ing/metadata4ing/> ;
       sh:name      "Role" ;
       sh:path      dcat:hadRole ;
       sh:class     prov:Role ;
     ] .
   ```

   In this case, the URL references an ontology that defines instances of `prov:Role`. These instances populate the "Role" dropdown. The imported ontology is available only for rendering and validating this specific property.

2. <a id="classInstanceProvider"></a>The `<shacl-form>` element exposes `setClassInstanceProvider((className: string) => Promise<string>)`, a callback invoked when a property has `sh:class`. The return value is a string (e.g. `text/turtle`) containing instance definitions of the given class.

   In [this example](https://ulb-darmstadt.github.io/shacl-form/#example), the code:

   ```typescript
   form.setClassInstanceProvider((clazz) => {
     if (clazz === 'http://example.org/Material') {
       return `
         <http://example.org/steel>   a <http://example.org/Material>; <http://www.w3.org/2000/01/rdf-schema#label> "Steel".
         <http://example.org/wood>    a <http://example.org/Material>; <http://www.w3.org/2000/01/rdf-schema#label> "Wood".
         <http://example.org/alloy>   a <http://example.org/Material>; <http://www.w3.org/2000/01/rdf-schema#label> "Alloy".
         <http://example.org/plaster> a <http://example.org/Material>; <http://www.w3.org/2000/01/rdf-schema#label> "Plaster".
       `
     }
   })
   ```

   returns instances of `http://example.org/Material`, which populate the "Artwork material" dropdown.

   A more realistic use case is calling an API endpoint to fetch class instances from existing ontologies.

### Use of SHACL sh:class

When a property shape has an `sh:class`, all available graphs are scanned for instances of that class so users can choose from them. `rdfs:subClassOf` is also considered when building the list of class instances.

`shacl-form` also supports class instance hierarchies modelled with `skos:broader` and/or `skos:narrower`. This is illustrated by the "Subject classification" property in the [example](https://ulb-darmstadt.github.io/shacl-form/#example).

### SHACL constraints sh:or and sh:xone

`<shacl-form>` supports [sh:or](https://www.w3.org/TR/shacl/#OrConstraintComponent) and [sh:xone](https://www.w3.org/TR/shacl/#XoneConstraintComponent) to let users choose between different options on nodes or properties. The [example shapes graph](https://ulb-darmstadt.github.io/shacl-form/#example) includes:

```
example:Attribution
  a sh:NodeShape ;
  sh:property [
    sh:maxCount  1 ;
    sh:minCount  1 ;
    sh:path prov:agent ;
    sh:or (
      [ sh:node example:Person ; rdfs:label "Person" ]
      [ sh:node example:Organisation ; rdfs:label "Organisation" ]
    )
  ] .
```

When adding a new attribution, `<shacl-form>` renders a dropdown to select Person/Organisation. After selection, the dropdown is replaced by the input fields of the chosen node shape.

When binding an existing data graph to the form, the constraint is resolved based on the data value:
- For RDF literals, an `sh:or` option with a matching `sh:datatype` is chosen
- For blank nodes or named nodes, the `rdf:type` is matched with a node shape having a corresponding `sh:targetClass` or with a property shape having a corresponding `sh:class`. If there is no `rdf:type` but a `sh:nodeKind` of `sh:IRI`, the node id is used as the value

### Linking existing data

When a node shape has a `sh:targetClass` and any graph contains instances of that class, those instances can be linked in the respective SHACL property. The generated data graph will then contain only a reference to the instance, not its full triples.

Graphs considered are:
- the shapes graph
- the data graph
- any graph loaded via `owl:imports`
- triples provided by [classInstanceProvider](#classInstanceProvider)

<a id="resourceLinkProvider"></a>
If your graphs only contain resource identifiers (IRIs) and not the full triples for linked resources, you can use `setResourceLinkProvider` to supply them on demand. The `ResourceLinkProvider` lets you:

* List resources that conform to a node shape so they can appear in the "Link existing ..." dialog.
* Load RDF data for selected resource IRIs so the `shacl-form` can resolve, display, and validate linked resources.

The provider supports eager loading (resolve resources during initialization) or lazy loading (resolve when the user opens the link dialog). See [here](https://github.com/ULB-Darmstadt/rdf-store/blob/main/frontend/src/editor.ts#L10) for an example implementation.

### SHACL shape inheritance

SHACL defines two ways of inheriting shapes: [sh:and](https://www.w3.org/TR/shacl/#AndConstraintComponent) and [sh:node](https://www.w3.org/TR/shacl/#NodeConstraintComponent). `<shacl-form>` supports both. In [this example](https://ulb-darmstadt.github.io/shacl-form/#example), node shape `example:ArchitectureModelDataset` extends `example:Dataset` by defining:

```
example:ArchitectureModelDataset sh:node example:Dataset .
```

Properties of inherited shapes are displayed first.

### Plugins

Plugins can modify rendering and add edit/view functionality for specific RDF datatypes or predicates (or both). For example, the JavaScript on [this page](https://ulb-darmstadt.github.io/shacl-form/#example) includes:

```typescript
import { LeafletPlugin } from '@ulb-darmstadt/shacl-form/plugins/leaflet.js'
const form = document.getElementById("shacl-form")
form.registerPlugin(new LeafletPlugin({ datatype: 'http://www.opengis.net/ont/geosparql#wktLiteral' }))
```

When a SHACL property has datatype `http://www.opengis.net/ont/geosparql#wktLiteral`, the plugin renders the editor/viewer elements. This plugin uses [Leaflet](https://leafletjs.com/) to edit or view geometry in [well known text](http://giswiki.org/wiki/Well_Known_Text) on a map.

Custom plugins can be built by extending [Plugin](https://github.com/ULB-Darmstadt/shacl-form/blob/main/src/plugin.ts#L40).

### Property grouping and collapsing

Properties can be grouped using [sh:group](https://www.w3.org/TR/shacl/#group) in the shapes graph. [This example](https://ulb-darmstadt.github.io/shacl-form/#example) defines a group "Physical properties" and assigns certain properties to it.

When `data-collapse` is set, `<shacl-form>` creates an accordion-like widget that toggles grouped properties to reduce visual complexity. If the grouped properties should start open, set `data-collapse="open"`.

In addition, all properties with `sh:node` and `sh:maxCount` != 1 are collapsed.

### Supported RDF formats
<a id="formats"></a>

#### Input formats
- text/turtle, application/n-triples, application/n-quads, application/trig using the [N3 parser](https://github.com/rdfjs/N3.js?tab=readme-ov-file#parsing)
- application/ld+json using [jsonld](https://github.com/digitalbazaar/jsonld.js)
- application/rdf+xml using [rdfxml-streaming-parser](https://github.com/rdfjs/rdfxml-streaming-parser.js)

#### Output formats
<a id="output-formats"></a>

- text/turtle, application/n-triples, application/n-quads, application/trig using the [N3 writer](https://github.com/rdfjs/N3.js?tab=readme-ov-file#writing)
- application/ld+json using [jsonld](https://github.com/digitalbazaar/jsonld.js)

### Theming

`<shacl-form>` has a built-in abstraction layer for theming the form controls. To use another theme (e.g. Bootstrap or Material Design), extend [Theme](./src/theme.ts) and call `setTheme()` on the element.

If you only want to restyle the existing widgets (without re-implementing internal behavior), you can use CSS in two ways:

1) Render into light DOM for global CSS:

```html
<shacl-form data-use-shadow-root="false"></shacl-form>
```

2) Use CSS variables and parts (works with Shadow DOM too). The following CSS variables are supported:

```css
shacl-form {
  --shacl-font-family: system-ui, sans-serif;
  --shacl-font-size: 14px;
  --shacl-text-color: #333;
  --shacl-muted-color: #555;
  --shacl-border-color: #ddd;
  --shacl-bg: #fff;
  --shacl-row-alt-bg: #f8f8f8;
  --shacl-error-color: #c00;
  --shacl-label-width: 10em;
}
```

And these parts are exposed for styling:

```css
shacl-form::part(form) { padding: 8px; }
shacl-form::part(field) { gap: 6px; }
shacl-form::part(label) { font-weight: 600; }
shacl-form::part(editor) { border-radius: 6px; }
shacl-form::part(button) { min-height: 32px; }
shacl-form::part(primary) { font-weight: 700; }
shacl-form::part(add-button) { }
shacl-form::part(remove-button) { }
shacl-form::part(link-button) { }
shacl-form::part(submit-button) { }
```

Available parts:
`form`, `node`, `linked-node`, `node-title`, `group`, `group-title`, `collapsible`, `property`, `property-instance`, `field`, `label`, `editor`, `lang-chooser`, `constraint`, `constraint-editor`, `add-controls`, `remove-controls`, `add-button`, `remove-button`, `link-button`, `submit-button`, `button`, `primary`.

Note: the [default widgets](https://gitlab.ulb.tu-darmstadt.de/rokit/ui-widgets) are provided by ULB Darmstadt. Those components expose their own `part` names; you can style them via `::part(...)` selectors on the respective elements. See the [README](https://gitlab.ulb.tu-darmstadt.de/rokit/ui-widgets) for documentation.

### Use with Solid Pods

`<shacl-form>` can be integrated with [Solid Pods](https://solidproject.org/about). Because `toRDF()` returns an RDF/JS N3 Store (see [above](#toRDF)), it can be passed to the Solid client `fromRdfJsDataset()` function to convert it into a Solid Dataset. The example below (based on Inrupt's [Solid Pod tutorial](https://docs.inrupt.com/sdk/javascript-sdk/tutorial)) shows how to merge data from a `<shacl-form>` with a Solid data resource at `readingListDataResourceURI`:

```js
  // Authentication is assumed, resulting in a fetch function able to read and write into the Pod
  try {
    // Get data out of the shacl-form
    const form = document.querySelector('shacl-form')

    // Extract the RDF graph from the form
    const shaclFormGraphStore = await form.toRDF()

    // Convert RDF store into a Solid dataset
    const shaclFormDataset = await fromRdfJsDataset(shaclFormGraphStore)

    // First get the current dataset
    myReadingList = await getSolidDataset(readingListDataResourceURI, { fetch: fetch })

    // get all things from the shaclFormDataset
    const shaclFormThings = getThingAll(shaclFormDataset)

    // add the things from ShaclForm to the existing set
    shaclFormThings.forEach((thing) => (myReadingList = setThing(myReadingList, thing)))

    // save the new dataset
    let savedReadingList = await saveSolidDatasetAt(readingListDataResourceURI, myReadingList, {
      fetch: fetch
    })

    // Other handling here

  } catch (err) {
    console.error(`Storing SHACL data from Form failed with error ${err}!`)
  }
```
