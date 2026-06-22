import { expect } from '@open-wc/testing'
import { DataFactory } from 'n3'
import { ShaclForm } from '../src/form'
import { loadGraphs } from '../src/graph-loader'
import { awaitFormLoaded } from './util'
import '../src/form'

const RDF_TYPE = DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
const IMPORTED_CLASS = DataFactory.namedNode('http://example.org/ImportedClass')
const FIRST_IMPORT = 'http://example.org/imports/one'
const SECOND_IMPORT = 'http://example.org/imports/two'
const SHAPES_URL = 'http://example.org/shapes'
const VALUES_URL = 'http://example.org/values'

describe('test rdf url resolver', () => {
    let originalFetch: typeof fetch

    before(() => {
        originalFetch = globalThis.fetch
    })

    afterEach(() => {
        globalThis.fetch = originalFetch
    })

    it('setRdfUrlResolver resolves recursive owl:imports without fetch', async () => {
        globalThis.fetch = (() => {
            throw new Error('fetch should not be called when rdfUrlResolver is configured')
        }) as typeof fetch

        const form = document.createElement('shacl-form') as ShaclForm
        form.dataset.shapes = `
            @prefix : <http://example.org/> .
            @prefix sh: <http://www.w3.org/ns/shacl#> .
            @prefix owl: <http://www.w3.org/2002/07/owl#> .

            :RootShape a sh:NodeShape ;
                sh:property [
                    sh:path :path ;
                    sh:class :ImportedClass ;
                    owl:imports <${FIRST_IMPORT}> ;
                ] .
        `
        form.dataset.shapeSubject = 'http://example.org/RootShape'

        const calls: string[] = []
        form.setRdfUrlResolver(async (url) => {
            calls.push(url)
            if (url === FIRST_IMPORT) {
                return `
                    @prefix : <http://example.org/> .
                    @prefix owl: <http://www.w3.org/2002/07/owl#> .

                    <${FIRST_IMPORT}> owl:imports <${SECOND_IMPORT}> .
                    :first a :ImportedClass .
                `
            }
            if (url === SECOND_IMPORT) {
                return `
                    @prefix : <http://example.org/> .

                    :second a :ImportedClass .
                `
            }
            throw new Error(`unexpected import URL: ${url}`)
        })

        document.body.appendChild(form)
        try {
            await awaitFormLoaded(form)

            expect(calls).to.deep.equal([FIRST_IMPORT, SECOND_IMPORT])
            expect(form.config.store.countQuads(
                DataFactory.namedNode('http://example.org/first'),
                RDF_TYPE,
                IMPORTED_CLASS,
                DataFactory.namedNode(FIRST_IMPORT)
            )).to.equal(1)
            expect(form.config.store.countQuads(
                DataFactory.namedNode('http://example.org/second'),
                RDF_TYPE,
                IMPORTED_CLASS,
                DataFactory.namedNode(SECOND_IMPORT)
            )).to.equal(1)
        } finally {
            form.remove()
        }
    })

    it('setRdfUrlResolver is used for shapesUrl and valuesUrl', async () => {
        globalThis.fetch = (() => {
            throw new Error('fetch should not be called when rdfUrlResolver is configured')
        }) as typeof fetch

        const calls: string[] = []
        const store = await loadGraphs({
            shapesUrl: SHAPES_URL,
            valuesUrl: VALUES_URL,
            valuesSubject: 'http://example.org/data',
            loadOwlImports: true,
            rdfUrlResolver: async (url) => {
                calls.push(url)
                if (url === SHAPES_URL) {
                    return `
                        @prefix : <http://example.org/> .
                        @prefix sh: <http://www.w3.org/ns/shacl#> .

                        :RootShape a sh:NodeShape ;
                            sh:property [
                                sh:path :path ;
                                sh:class :ImportedClass ;
                            ] .
                    `
                }
                if (url === VALUES_URL) {
                    return `
                        @prefix : <http://example.org/> .

                        <http://example.org/data> :path :value .
                    `
                }
                throw new Error(`unexpected RDF URL: ${url}`)
            }
        })

        expect(calls).to.deep.equal([SHAPES_URL, VALUES_URL])
        expect(store.countQuads(
            DataFactory.namedNode('http://example.org/data'),
            DataFactory.namedNode('http://example.org/path'),
            DataFactory.namedNode('http://example.org/value'),
            null
        )).to.equal(1)
    })

    it('loadGraphs falls back to fetch for owl:imports when no rdfUrlResolver is configured', async () => {
        const calls: string[] = []
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            calls.push(String(input))
            return {
                ok: true,
                text: async () => `
                    @prefix : <http://example.org/> .
                    :fetched a :ImportedClass .
                `
            } as Response
        }) as typeof fetch

        const store = await loadGraphs({
            shapes: `
                @prefix : <http://example.org/> .
                @prefix sh: <http://www.w3.org/ns/shacl#> .
                @prefix owl: <http://www.w3.org/2002/07/owl#> .

                :RootShape a sh:NodeShape ;
                    sh:property [
                        sh:path :path ;
                        sh:class :ImportedClass ;
                        owl:imports <${FIRST_IMPORT}> ;
                    ] .
            `,
            loadOwlImports: true
        })

        expect(calls).to.deep.equal([FIRST_IMPORT])
        expect(store.countQuads(
            DataFactory.namedNode('http://example.org/fetched'),
            RDF_TYPE,
            IMPORTED_CLASS,
            DataFactory.namedNode(FIRST_IMPORT)
        )).to.equal(1)
    })
})
