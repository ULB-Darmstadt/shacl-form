# SHACL Form Generator

```console
npm i @ulb-darmstadt/shacl-form
```

HTML5 web component for editing/viewing [RDF](https://www.w3.org/RDF/) data that conform to [SHACL shapes](https://www.w3.org/TR/shacl/).

## [See demo here](https://ulb-darmstadt.github.io/shacl-form/)

### Basic usage

```html
<html>
  <head>
    <!-- load web component -->
    <script src="https://cdn.jsdelivr.net/npm/@ulb-darmstadt/shacl-form/dist/form-default.js" type="module"></script>
  </head>
  <body>
    <!--
      SHACL shapes can be defined on the attribute 'data-shapes'
      or can be loaded by setting attribute 'data-shapes-url'
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
          // get data graph as RDF triples and
          // log them to the browser console
          const triples = form.serialize() 
          console.log('entered form data', triples)
          // store the data somewhere, e.g. in a triple store
        }
      })
    </script>
  </body>
</html>
```

### Element attributes

Attribute | Description
---|---
data-shapes | SHACL shape definitions (e.g. a turtle string) to generate the form from
data-shapes-url | When `data-shapes` is not set, the SHACL shapes are loaded from this URL
data-shape-subject | Optional subject (id) of the SHACL node shape to use as root for the form. If not set, the first found node shape will be used
data-values | RDF triples (e.g. a turtle string) to use as existing data graph to fill the form
data-values-url | When `data-values` is not set, the data graph triples are loaded from this URL
data-values-subject | The subject (id) of the generated data. If this is not set, a blank node with a new UUID is created. If `data-values` or `data-values-url` is set, this id is also used to find the root node in the data graph to fill the form
data-values-namespace | RDF namespace to use when generating new RDF subjects. Default is empty, so that subjects will be blank nodes.
data-language | Language to use if shapes contain langStrings, e.g. in `sh:name` or `rdfs:label`. Default is [`navigator.language`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/language) with fallback to [`navigator.languages`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/languages)
data-loading | Text to display while the web component is initializing. Default: `"Loading..."`
data&#x2011;ignore&#x2011;owl&#x2011;imports | By default, `owl:imports` URLs are fetched and the resulting RDF triples are added to the shapes graph. Setting this attribute to any value disables this feature
data-view | When set, turns the web component into a viewer that displays the given data graph without editing functionality
data-collapse | When set, `sh:group`s and properties with `sh:node` and `sh:maxCount` != 1 are displayed in a collapsible accordion-like widget to reduce visual complexity of the form. The collapsible element is initially shown closed, except when this attribute's value is `"open"`
data-submit-button | [Ignored when `data-view` attribute is set] Whether to add a submit button to the form. The value of this attribute is used as the button label. `submit` events get emitted only when the form data validates
data-generate-node-shape-reference | When generating the RDF data graph, &lt;shacl-form&gt; can create a triple that references the root `sh:NodeShape` of the data. Suggested values for this attribute are `http://www.w3.org/1999/02/22-rdf-syntax-ns#type` or `http://purl.org/dc/terms/conformsTo`. Default is empty, so that no such triple is created
data-show-node-ids | When this attribute is set, shacl node shapes will have their subject id shown in the form

### Element functions

<a id="toRDF"></a>
```typescript
toRDF(graph?: Store): Store
```
Adds the form values as RDF triples to the given graph. If no graph object is provided, creates a new [N3 Store](https://github.com/rdfjs/N3.js#storing).

```typescript
serialize(format?: string, graph?: Store): string
```
Serializes the given RDF graph to the given format. If no graph object is provided, this function calls toRDF() (see above) to construct the form data graph. <a name="formats"></a>Supported formats:  `text/turtle` (default), `application/ld+json`, `application/n-triples`, `application/n-quads`, `application/trig`.

```typescript
validate(ignoreEmptyValues: boolean): Promise<boolean>
```
Validates the form data against the SHACL shapes graph and displays validation results as icons next to the respective input fields. If `ignoreEmptyValues` is true, empty form fields will not be marked as invalid. This function is also internally called on `change` and `submit` events.

```typescript
registerPlugin(plugin: Plugin)
```
Register a [plugin](./src/plugin.ts) to customize editing/viewing certain property values. Plugins handle specific RDF predicates or `xsd:datatype`s or both. Examples: [Leaflet](./src/plugins/leaflet.ts), [Mapbox](./src/plugins/mapbox.ts), [FixedList](./src/plugins/fixed-list.ts)

```typescript
setTheme(theme: Theme)
```
Set a design theme to use for rendering. See section [Theming](#Theming).

```typescript
setClassInstanceProvider((className: string) => Promise<string>)
```
Sets a callback function that is invoked when a SHACL property has an `sh:class` definition to retrieve class instances. See [below](#classInstanceProvider) for more information.

```typescript
setSharedShapesGraph(graph: Store)
```
Set an externally managed shapes graph to use. This improves performance When using multiple instances of `shacl-form` on the same page.

## Features

### Validation

In edit mode, `<shacl-form>` validates the constructed data graph using the library [shacl-engine](https://github.com/rdf-ext/shacl-engine) and displays validation results as icons next to the respective form fields.

### Data graph binding

`<shacl-form>` requires only a shapes graph as input via the attribute `data-shapes` (or `data-shapes-url`) to generate an empty form and create new RDF data from the form input fields. Using the attributes `data-values` (or `data-values-url`) and `data-values-subject`, you can also bind an existing data graph to the form. The given data graph is then used to fill the form input fields.

### Viewer mode

`<shacl-form>` not only is an RDF data editor, but can also be used as a viewer by setting attribute `data-view` and binding both, a shapes and a data graph. See the [demo](https://ulb-darmstadt.github.io/shacl-form/#viewer-mode) for an example.

### Providing additional data to the shapes graph

Apart from setting the element attributes `data-shapes` or `data-shapes-url`, there are two ways of adding RDF data to the shapes graph:
1. While parsing the triples of the shapes graph, any encountered `owl:imports` predicate that has a valid HTTP URL value will be tried to fetch with the HTTP Accept header set to all of the [supported](#formats) MIME types. A successful response will be parsed and added to the shapes graph. The [example shapes graph](https://ulb-darmstadt.github.io/shacl-form/#example) contains the following triples:
    ```
    example:Attribution
      owl:imports <https://w3id.org/nfdi4ing/metadata4ing/> ;
      sh:property [
        sh:name      "Role" ;
        sh:path      dcat:hadRole ;
        sh:class     prov:Role ;
      ] .
    ```
    In this case, the URL references an ontology which among other things defines instances of class `prov:Role` that are then used to populate the "Role" dropdown in the form.

2. <a id="classInstanceProvider"></a>The `<shacl-form>` element has a function `setClassInstanceProvider((className: string) => Promise<string>)` that registers a callback function which is invoked when a SHACL property has
an `sh:class` predicate. The expected return value is a (promise of a) string (e.g. in format `text/turtle`) that contains RDF class instance definitions of the given class. Instances can be defined e.g. like:
    - `example:Instance a example:Class`
    - `example:Instance a owl:NamedIndividual; skos:broader example:Class`
  
    Class hierarchies can be built using `rdfs:subClassOf` or `skos:broader`.
    
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
      }}
    )
    ```
    returns instances of the class `http://example.org/Material` that are then used to populate the "Artwork material" dropdown in the form.

    A more realistic use case of this feature is calling some API endpoint to fetch class instance definitions from existing ontologies.

### SHACL "or" constraint

`<shacl-form>` supports using [sh:or](https://www.w3.org/TR/shacl/#OrConstraintComponent) to let users select between different options on nodes or properties.
The [example shapes graph](https://ulb-darmstadt.github.io/shacl-form/#example) has the following triples:
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
When adding a new attribution, `<shacl-form>` renders a dropdown to let the user select between the two options Person/Organisation. After selecting one of the options, the dropdown is replaced by the input fields of the selected node shape.

When binding an existing data graph to the form, the `sh:or` constraint is tried to be resolved depending on the respective data value:
- For RDF literals, an `sh:or` option with a matching `sh:datatype` is chosen
- For blank nodes or named nodes, the `rdf:type` of the value is tried to be matched with a node shape having a corresponding `sh:targetClass` or with a property shape having a corresponding `sh:class`. If there is no `rdf:type` but a `sh:nodeKind` of `sh:IRI`, the id of the the node is used as the value.

### SHACL shape inheritance

SHACL defines two ways of inheriting shapes: [sh:and](https://www.w3.org/TR/shacl/#AndConstraintComponent)
and [sh:node](https://www.w3.org/TR/shacl/#NodeConstraintComponent). `<shacl-form>` supports both. In [this example](https://ulb-darmstadt.github.io/shacl-form/#example), node shape `example:ArchitectureModelDataset` extends `example:Dataset` by defining the following RDF triple:

```
example:ArchitectureModelDataset sh:node example:Dataset .
```

Properties of inherited shapes are displayed first.

### Plugins

Plugins can modify rendering of the form and add functionality to edit and view certain RDF datatypes or predicates (or a combination of both). As an example, the JavaScript of [this page](https://ulb-darmstadt.github.io/shacl-form/#example) contains the following code:
```typescript
import { LeafletPlugin } from '@ulb-darmstadt/shacl-form/plugins/leaflet.js'
const form = document.getElementById("shacl-form")
form.registerPlugin(new LeafletPlugin({ datatype: 'http://www.opengis.net/ont/geosparql#wktLiteral' }))
```
In effect, whenever a SHACL property has an `sh:datatype` of `http://www.opengis.net/ont/geosparql#wktLiteral`, the plugin is called to create the editor and/or viewer HTML elements. This specific plugin uses [Leaflet](https://leafletjs.com/) to edit or view geometry in format [well known text](http://giswiki.org/wiki/Well_Known_Text) on a map.
Custom plugins can be built by extending class [Plugin](https://github.com/ULB-Darmstadt/shacl-form/blob/main/src/plugin.ts#L40).

### Property grouping and collapsing

Properties can be grouped using [sh:group](https://www.w3.org/TR/shacl/#group) in the shapes graph. [This example](https://ulb-darmstadt.github.io/shacl-form/#example) defines a group "Physical properties" and assigns certain properties to it.

When the element attribute `data-collapse` is set, `<shacl-form>` creates an accordion-like widget that toggles the visibility of grouped properties in order to reduce the visual complexity of the form. If the grouped properties should initially be shown, set `data-collapse="open"`.

Apart from grouped properties, all properties having an `sh:node` predicate and `sh:maxCount` != 1 are collapsed.

### Use with Solid Pods

`<shacl-form>` can easily be integrated with [Solid Pods](https://solidproject.org/about). The output of `toRDF()` being a RDF/JS N3 Store, as explained [above](#toRDF), it can be presented to `solid-client`s `fromRdfJsDataset()` function, which converts the RDF graph into a Solid Dataset. The following example, based on Inrupt's basic [Solid Pod example](https://docs.inrupt.com/developer-tools/javascript/client-libraries/tutorial/getting-started/) shows how to merge data from a `<shacl-form>` with a Solid data resource at `readingListDataResourceURI`:
 
```js
  // Authentication is assumed, resulting in a fetch able to read and write into the Pod
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

### Theming

`<shacl-form>` comes in 3 different bundles, each providing a specific theme. See the [demo page](https://ulb-darmstadt.github.io/shacl-form/#theming) for an example.

Theme | Import statement
--- | ---
[Default]((./src/themes/default.ts)) (slightly customized default browser styles) | `import '@ulb-darmstadt/shacl-form/form-default.js'`
[Bootstrap](./src/themes/bootstrap.ts) [alpha status] | `import '@ulb-darmstadt/shacl-form/form-bootstrap.js'`
[Material Design](./src/themes/material.ts) [alpha status] | `import '@ulb-darmstadt/shacl-form/form-material.js'`

Custom themes can be employed by extending class [Theme](./src/theme.ts), then calling function `setTheme()` on the `<shacl-form>` element.
