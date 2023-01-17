# SHACL Form Generator
```console
npm i @ulb-darmstadt/shacl-form 
```
This library provides an HTML5 web component that renders [SHACL shapes](https://www.w3.org/TR/shacl/) as a web form, outputting the entered data as RDF triples validated against these shapes.

## Demo
[Visit demo page](https://ulb-darmstadt.github.io/shacl-form/)

## Basic usage (standalone JavaScript)
```html
<html>
  <head>
    ...
    <!-- load webcomponent -->
    <script src="https://cdn.jsdelivr.net/npm/@ulb-darmstadt/shacl-form/dist/index.js" type="module"></script>
  </head>
  <body>
    ...
    <shacl-form id="my-form" data-shapes="..."></shacl-form>
    ...
  </body>
  <script>
    const form = document.getElementById("my-form")
    form.addEventListener('change', function (ev) {
      // check if form validates according to the SHACL shapes
      if (ev.detail?.valid) {
        // get data graph as RDF triples and log them to the browser console
        const data = form.toRDFTurtle()
        console.log('entered form data', data)
        // store the data somewhere, e.g. in a triple store
      }
    }
  </script>
</html>
```

## Theming
TBD

## Element data attributes
Attribute | Description | Example
---|---|---
data-shapes | SHACL shape definitions (e.g. a turtle string) to generate the form from |
data-values | RDF triples (e.g. a turtle string) to use as existing data values in the generated form
data-language | Language to use if shapes contain langstrings | `de` or `en`

## Element properties
Property | Description | Example
---|---|---
theme | Instance of class Theme |

