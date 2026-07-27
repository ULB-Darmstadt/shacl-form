const MATERIAL_INSTANCES = `
  <http://example.org/steel> a <http://example.org/Material>; <http://www.w3.org/2000/01/rdf-schema#label> "Steel".
  <http://example.org/wood> a <http://example.org/Material>; <http://www.w3.org/2000/01/rdf-schema#label> "Wood".
  <http://example.org/alloy> a <http://example.org/Material>; <http://www.w3.org/2000/01/rdf-schema#label> "Alloy".
  <http://example.org/plaster> a <http://example.org/Material>; <http://www.w3.org/2000/01/rdf-schema#label> "Plaster".
`

const QUERY_SHAPES = `
@prefix sh:  <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix ex:  <http://example.org/> .

ex:DatasetShape
  a sh:NodeShape ;
  sh:targetClass ex:Dataset ;
  sh:property [
    sh:name "Title" ;
    sh:path ex:title ;
    sh:datatype xsd:string
  ] ;
  sh:property [
    sh:name "Category" ;
    sh:path ex:category ;
    sh:in (ex:Research ex:Teaching ex:Administration)
  ] ;
  sh:property [
    sh:name "Publication year" ;
    sh:path ex:publicationYear ;
    sh:datatype xsd:integer ;
    sh:minInclusive 1995 ;
    sh:maxInclusive 2026
  ] .
`

function setClassInstanceProvider(form) {
  form.setClassInstanceProvider(classes => {
    if (classes.has('http://example.org/Material')) return MATERIAL_INSTANCES
    return ''
  })
}

function updateOutput(output, form, valid) {
  output.classList.toggle('valid', valid)
  output.classList.toggle('invalid', !valid)
  output.querySelector('pre').innerText = form.serialize()
}

function listenForFormChanges(form, output) {
  form.addEventListener('change', event => {
    updateOutput(output, form, Boolean(event.detail?.valid))
  })
}

function listenForExport(form) {
  form.addEventListener('submit', () => {
    const link = document.createElement('a')
    link.href = window.URL.createObjectURL(new Blob([form.serialize()], { type: 'text/turtle' }))
    link.download = 'metadata.ttl'
    link.click()
  })
}

async function fetchText(url) {
  return fetch(url).then(response => response.text())
}

function initIntro(root) {
  const form = root.querySelector('shacl-form')
  form.addEventListener('change', event => {
    if (event.detail?.valid) {
      console.log('entered form data', form.serialize())
    }
  })
}

async function initDatatypes(root, { assets }) {
  const form = root.querySelector('#shacl-form')
  const shapes = root.querySelector('#shacl-shape-input')
  const output = root.querySelector('#shacl-output')
  listenForFormChanges(form, output)

  const text = await fetchText(assets.datatypes)
  shapes.innerText = text
  form.dataset.shapes = text
}

async function initEditMode(root, { assets }) {
  const form = root.querySelector('#shacl-form')
  const shapes = root.querySelector('#shacl-shape-input')
  const data = root.querySelector('#shacl-data-input')
  const output = root.querySelector('#shacl-output')

  listenForFormChanges(form, output)
  form.addEventListener('submit', () => updateOutput(output, form, true))
  setClassInstanceProvider(form)

  const [shapesTTL, dataTTL] = await Promise.all([
    fetchText(assets.complexExample),
    fetchText(assets.complexExampleData)
  ])
  shapes.innerText = shapesTTL
  data.innerText = dataTTL
  form.dataset.shapes = shapesTTL
  form.dataset.values = dataTTL
}

async function initViewerMode(root, { assets }) {
  const form = root.querySelector('#shacl-form')
  const shapes = root.querySelector('#shacl-shape-input')
  const data = root.querySelector('#shacl-data-input')
  setClassInstanceProvider(form)

  const [shapesTTL, dataTTL] = await Promise.all([
    fetchText(assets.complexExample),
    fetchText(assets.complexExampleData)
  ])
  shapes.innerText = shapesTTL
  data.innerText = dataTTL
  form.dataset.shapes = shapesTTL
  form.dataset.values = dataTTL
}

function initQueryMode(root, { SparqlQueryBuilder }) {
  const form = root.querySelector('#shacl-form')
  const shapesOutput = root.querySelector('#shacl-shape-input')
  const queryOutput = root.querySelector('#shacl-output pre')
  const sparql = new SparqlQueryBuilder()

  form.addEventListener('query', event => {
    const query = event.detail
    const displayQuery = {
      rootShapeId: query.rootShapeId,
      targetClass: query.targetClass,
      criteria: query.criteria.map(criterion => ({
        path: criterion.field.path,
        operator: criterion.operator,
        value: criterion.value?.value,
        min: criterion.min?.value,
        max: criterion.max?.value
      }))
    }
    queryOutput.textContent = `${JSON.stringify(displayQuery, null, 2)}\n\n${sparql.buildSelect(query, { limit: 20 })}`
  })

  shapesOutput.textContent = QUERY_SHAPES.trim()
  form.dataset.shapes = QUERY_SHAPES
  form.dataset.shapeSubject = 'http://example.org/DatasetShape'
}

function initTryYourOwn(root) {
  const form = root.querySelector('#shacl-form')
  const shapes = root.querySelector('textarea')
  const output = root.querySelector('#shacl-output')

  shapes.addEventListener('change', () => {
    form.dataset.shapes = shapes.value
    output.querySelector('pre').innerText = ''
    output.classList.remove('valid', 'invalid')
    buildShareLink(root, shapes)
  })
  listenForFormChanges(form, output)
  listenForExport(form)

  const query = window.location.hash.includes('?')
    ? window.location.hash.slice(window.location.hash.indexOf('?') + 1)
    : undefined
  if (query) {
    try {
      shapes.value = atob(query)
      shapes.dispatchEvent(new Event('change'))
    } catch (error) {
      console.error(error)
    }
  }
  shapes.focus()
}

function buildShareLink(root, shapes) {
  const linkContainer = root.querySelector('#share-link')
  linkContainer.replaceChildren()
  if (!shapes.value) return

  const link = new URL(window.location.toString())
  link.hash = `try-your-own?${btoa(shapes.value)}`
  const button = document.createElement('rokit-button')
  button.innerHTML = '&#x1F4CB; Copy share link to clipboard'
  button.style.marginTop = '20px'
  button.addEventListener('click', () => {
    navigator.clipboard.writeText(link.href)
    const message = document.createElement('span')
    message.innerText = 'Copied!'
    message.classList.add('green')
    button.after(message)
    setTimeout(() => message.remove(), 1000)
  })
  linkContainer.append(button)
}

function initMps(root) {
  const form = root.querySelector('#shacl-form')
  const shapes = root.querySelector('#shacl-shape-input')
  const shapeSelector = root.querySelector('#shacl-shape-selector')
  const output = root.querySelector('#shacl-output')

  shapeSelector.addEventListener('change', () => {
    shapes.value = shapeSelector.value
    shapes.dispatchEvent(new Event('change'))
  })
  shapes.addEventListener('change', () => {
    form.dataset.shapes = shapes.value
    output.querySelector('pre').innerText = ''
    output.classList.remove('valid', 'invalid')
  })
  listenForFormChanges(form, output)
  listenForExport(form)

  fetch('https://pg4aims.ulb.tu-darmstadt.de/AIMS/application-profiles/?query=&language=EN&includeDefinition=true&state=public')
    .then(response => response.json())
    .then(profiles => {
      const list = document.createElement('ul')
      for (const profile of profiles) {
        const item = document.createElement('li')
        item.innerText = profile.name
        item.dataset.value = profile.definition
        list.appendChild(item)
      }
      shapeSelector.appendChild(list)
    })
    .catch(error => console.error(error))
}

export const initializers = {
  intro: initIntro,
  datatypes: initDatatypes,
  'edit-mode': initEditMode,
  'viewer-mode': initViewerMode,
  'query-mode': initQueryMode,
  'try-your-own': initTryYourOwn,
  mps: initMps
}
