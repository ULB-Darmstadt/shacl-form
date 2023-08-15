# SHACL Form Generator

```
npm i @ulb-darmstadt/shacl-form
```

This library provides an HTML5 web component that renders [SHACL shapes](https://www.w3.org/TR/shacl/) as a web form, outputting the entered data as RDF triples validated against these shapes.

### [See demo here](https://ulb-darmstadt.github.io/shacl-form/)

## Basic usage
```html
<html>
  <head>
    ...
    <!-- load web component -->
    <script src="https://cdn.jsdelivr.net/npm/@ulb-darmstadt/shacl-form/dist/index.js" type="module"></script>
  </head>
  <body>
    ...
    <shacl-form id="my-form" data-shapes="..."></shacl-form>
    ...
  </body>
  <script>
    const form = document.getElementById("my-form")
    // submit events will only get dispatched when the entered data conforms to the shacl node shape
    form.addEventListener('submit', _ => {
      // get data graph as RDF triples and log them to the browser console.
      // you can also call form.toRDF() to get the entered data as a Quad[].
      const data = form.toRDFTurtle() 
      console.log('entered form data', data)
      // store the data somewhere, e.g. in a triple store
    }
  </script>
</html>
```

## Element data attributes
Attribute | Description
---|---
data-shapes | SHACL shape definitions (e.g. a turtle string) to generate the form from
data-shapes-url | When `data-shapes` is not set, load the shapes graph from this URL
data-shape-subject | Optional subject (id) of the shacl node shape to use as root for the form. If not set, the first found shacl node shape id will be used
data-values | RDF triples (e.g. a turtle string) to use as existing data values in the generated form
data-values-url | When `data-values` is not set, load the data graph from this URL
data-value-subject | The subject (id) in the data graph to fill in existing data into the form
data-language | Language to use if shapes contain langStrings
data-load-owl-imports | Whether to fetch RDF data from `owl:imports` statements. Default: `true`
data-submit-button-text | Text for the form submit button. Default: `Submit`

## Theming
TBD

