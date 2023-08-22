# SHACL Form Generator

```
npm i @ulb-darmstadt/shacl-form
```

This library provides an HTML5 web component that renders [SHACL shapes](https://www.w3.org/TR/shacl/) as a web form, outputting the entered data as RDF triples validated against these shapes.

## [See demo here](https://ulb-darmstadt.github.io/shacl-form/)

### Basic usage
```html
<html>
  <head>
    <!-- load web component -->
    <script src="https://cdn.jsdelivr.net/npm/@ulb-darmstadt/shacl-form/dist/index.js" type="module"></script>
  </head>
  <body>
    <shacl-form id="my-form" data-shapes="..."></shacl-form>

    <script>
      const form = document.getElementById("my-form")
      form.addEventListener('change', event => {
        // check if form validates according to the SHACL shapes
        if (event.detail?.valid) {
          // get data graph as RDF triples and log them to the browser console
          const data = form.serialize('application/ld+json') 
          console.log('entered form data', data)
          // store the data somewhere, e.g. in a triple store
        }
      })
    </script>
  </body>
</html>
```

### Element data attributes
Attribute | Description
---|---
data-shapes | SHACL shape definitions (e.g. a turtle string) to generate the form from
data-shapes-url | When `data-shapes` is not set, the shapes graph is loaded from this URL
data-shape-subject | Optional subject (id) of the shacl node shape to use as root for the form. If not set, the first found shacl node shape will be used
data-values | RDF triples (e.g. a turtle string) to use as existing data values in the generated form
data-values-url | When `data-values` is not set, the data graph is loaded from this URL
data-value-subject | The subject (id) of the generated data. If this is not set, a blank node with a new UUID will be used. If `data-values` or `data-values-url` is set, this id is also used to find existing data in the data graph to fill the form
data-language | Language to use if shapes contain langStrings, e.g. in `sh:name` or `rdfs:label`
data&#x2011;ignore&#x2011;owl&#x2011;imports | By default, `owl:imports` IRIs are fetched and the resulting triples added to the shapes graph. Set this attribute in order to disable this feature
data-submit-button | Whether to append a submit button to the form. The string value of this attribute is used as the button label. `submit` events will only fire after successful validation

### Element functions
```typescript
serialize(format?: string): string | []
```

Serializes the form data as RDF triples. Supported formats:  `text/turtle` (default), `application/ld+json`, `application/n-triples`, `application/n-quads`, `application/trig`. Format `application/ld+json` returns a JSON array, all other formats return a string.

```typescript
validate(ignoreEmptyValues: boolean): Promise<boolean>
```
Validates the form data against the SHACL shapes graph and displays validation results as icons next to the respective inut fields. If `ignoreEmptyValues` is true, empty form fields will not be marked as invalid. This function is also internally called on `change` and `submit` events.

```typescript
registerPlugin(plugin: Plugin)
```
WIP / TBD

```typescript
setClassInstanceProvider((className: string) => Promise<string>)
```
Sets a callback function that is called when a SHACL property has a `sh:class` definition. The expected return value is a string (e.g. in format `text/turtle`) that contains RDF instance definitions of the given class name.

