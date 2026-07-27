import { registerPlugin } from '../src/form.ts'
import { LeafletPlugin } from '../src/plugins/leaflet.ts'
import { SparqlQueryBuilder } from '../src/query/sparql.ts'
import datatypesUrl from './datatypes.ttl?url'
import complexExampleUrl from './complex-example.ttl?url'
import complexExampleDataUrl from './complex-example-data.ttl?url'
import { initDemoRouter } from './router.js'

registerPlugin(new LeafletPlugin({ datatype: 'http://www.opengis.net/ont/geosparql#wktLiteral' }))

initDemoRouter({
  assets: {
    datatypes: datatypesUrl,
    complexExample: complexExampleUrl,
    complexExampleData: complexExampleDataUrl
  },
  SparqlQueryBuilder
})

window.dispatchEvent(new Event('demo-ready'))
