# SHACL Form Generator

```
npm i @ulb-darmstadt/shacl-form
```

An HTML5 web component for editing/viewing [RDF](https://www.w3.org/RDF/) data that conform to [SHACL shapes](https://www.w3.org/TR/shacl/).

## [See demo here](https://ulb-darmstadt.github.io/shacl-form/)

### Basic usage
```html
<html>
  <head>
    <!-- load web component -->
    <script src="https://cdn.jsdelivr.net/npm/@ulb-darmstadt/shacl-form/dist/index.js" type="module"></script>
  </head>
  <body>
    <!--
      SHACL shapes can be defined on the attribute 'data-shapes'
      or can be loaded by setting attribute 'data-shapes-url'
    -->
    <shacl-form data-shapes="
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      @prefix ex: <http://example.org#> .

      ex:ExampleShape
        a sh:NodeShape ;
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
          // get data graph as RDF triples (default format is 'text/turtle')
          // and log them to the browser console
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
data-value-subject | The subject (id) of the generated data. If this is not set, a blank node with a new UUID will be used. If `data-values` or `data-values-url` is set, this id is also used to find the root node in the data graph to fill the form
data-language | Language to use if shapes contain langStrings, e.g. in `sh:name` or `rdfs:label`. Default is [`navigator.language`](https://www.w3schools.com/jsref/prop_nav_language.asp)
data&#x2011;ignore&#x2011;owl&#x2011;imports | By default, `owl:imports` URLs are fetched and the resulting RDF triples are added to the shapes graph. Set this attribute to any value in order to disable this feature
data-mode | When set to `"view"`, turns the web component into a viewer that displays the given data graph without editing functionality
data-submit-button | Whether to add a submit button to the form. The value of this attribute is used as the button label. `submit` events will only fire after successful validation

### Element functions
```typescript
serialize(format?: string): string
```

Serializes the form data to RDF triples. Supported formats:  `text/turtle` (default), `application/ld+json`, `application/n-triples`, `application/n-quads`, `application/trig`.

```typescript
validate(ignoreEmptyValues: boolean): Promise<boolean>
```
Validates the form data against the SHACL shapes graph and displays validation results as icons next to the respective input fields. If `ignoreEmptyValues` is true, empty form fields will not be marked as invalid. This function is also internally called on `change` and `submit` events.

```typescript
registerPlugin(plugin: Plugin)
```
Register a [plugin](./src/plugin.ts) to customize editing/viewing certain property values. Plugins handle specific RDF predicates or `xsd:datatype`s or both. Examples: [Mapbox](./src/plugins/mapbox.ts), [FixedList](./src/plugins/fixed-list.ts)

```typescript
setTheme(theme: Theme)
```
Set a design theme to use for rendering. See section "Theming" below.
```typescript
setClassInstanceProvider((className: string) => Promise<string>)
```
Sets a callback function that is called when a SHACL property has an `sh:class` definition. The expected return value is a string (e.g. in format `text/turtle`) that contains RDF class instance definitions of the given class. Instances can be defined e.g. like:
- `example:Instance a example:Class`
- `example:Instance a owl:NamedIndividual; skos:broader example:Class`

You can also use `rdfs:subClassOf` or `skos:broader` to build class hierarchies.

## Theming
`<shacl-form>` comes in 3 different bundles, each providing a specific theme:

Theme | Import statement
--- | ---
Native (opinionated raw HTML) | `import '@ulb-darmstadt/shacl-form/index.js'`
[Bootstrap](./src/themes/bootstrap.ts) | `import '@ulb-darmstadt/shacl-form/bootstrap.js'`
[Material Design](./src/themes/material.ts) | `import '@ulb-darmstadt/shacl-form/material.js'`

Custom themes can be employed by implementing class [Theme](./src/theme.ts) yourself, then activating it with function `setTheme()` on the `<shacl-form>` element.