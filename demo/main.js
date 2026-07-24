import { registerPlugin } from '../src/form.ts'
import { LeafletPlugin } from '../src/plugins/leaflet.ts'
import { SparqlQueryBuilder } from '../src/query/sparql.ts'
import datatypesUrl from './datatypes.ttl?url'
import complexExampleUrl from './complex-example.ttl?url'
import complexExampleDataUrl from './complex-example-data.ttl?url'

registerPlugin(new LeafletPlugin({ datatype: 'http://www.opengis.net/ont/geosparql#wktLiteral' }))

// Template scripts are executed when their demo section is opened. Expose the
// query builder here so those classic scripts use the same locally built module
// graph as the rest of the demo.
window.SparqlQueryBuilder = SparqlQueryBuilder
window.demoAssets = Object.freeze({
  datatypes: datatypesUrl,
  complexExample: complexExampleUrl,
  complexExampleData: complexExampleDataUrl
})
window.dispatchEvent(new Event('demo-ready'))
