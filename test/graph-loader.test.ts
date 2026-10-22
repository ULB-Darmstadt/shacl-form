import { expect } from '@open-wc/testing'
import { loadGraphs } from '../src/graph-loader'
import { SHAPES_GRAPH } from '../src/constants'

const ROOT_URL = 'https://example.org/root'
const IMPORT_URL = 'https://example.org/imported'
const NESTED_URL = 'https://example.org/nested'
const PREFIXES = `
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    @prefix owl: <http://www.w3.org/2002/07/owl#> .
`
const ROOT = `${PREFIXES}
    <${ROOT_URL}> a sh:NodeShape ;
        owl:imports <${IMPORT_URL}> ;
        sh:property [ sh:path <urn:direct> ; sh:class <urn:DirectClass> ] .
`
const RESOURCES: Record<string, string> = {
    [ROOT_URL]: ROOT,
    [IMPORT_URL]: `${PREFIXES}
        <${IMPORT_URL}> a sh:NodeShape ;
            owl:imports <${NESTED_URL}> ;
            sh:targetClass <urn:ImportedTarget> ;
            sh:property [ sh:path <urn:area> ; sh:class <urn:ImportedClass> ] .
    `,
    [NESTED_URL]: `${PREFIXES}
        <${NESTED_URL}> a sh:NodeShape ;
            owl:imports <${IMPORT_URL}> ;
            sh:property [ sh:path <urn:deep> ; sh:class <urn:DeepClass> ],
                        [ sh:path <urn:duplicate> ; sh:class <urn:DirectClass> ] .
    `
}
const EXPECTED_CLASSES = [
    'urn:DirectClass', 'urn:ImportedClass', 'urn:ImportedTarget', 'urn:DeepClass'
].sort()

describe('graph loader class instance provider', () => {
    it('collects classes and target classes from recursive imports once', async () => {
        const requests: string[][] = []
        const resolvedUrls: string[] = []
        const store = await loadGraphs({
            shapes: ROOT,
            loadOwlImports: true,
            rdfUrlResolver: async url => {
                resolvedUrls.push(url)
                return RESOURCES[url]
            },
            classInstanceProvider: async classes => {
                requests.push([...classes].sort())
                return '<urn:instance> a <urn:ImportedClass> .'
            }
        })

        expect(requests).to.deep.equal([EXPECTED_CLASSES])
        expect(resolvedUrls).to.deep.equal([IMPORT_URL, NESTED_URL])
        expect(store.countQuads('urn:instance', null, 'urn:ImportedClass', SHAPES_GRAPH)).to.equal(1)
    })

    it('does not request classes from disabled imports', async () => {
        const requests: string[][] = []
        await loadGraphs({
            shapes: ROOT,
            loadOwlImports: false,
            rdfUrlResolver: async () => {
                throw new Error('disabled imports should not be resolved')
            },
            classInstanceProvider: async classes => {
                requests.push([...classes])
                return ''
            }
        })

        expect(requests).to.deep.equal([['urn:DirectClass']])
    })

    for (const predicate of [
        'http://purl.org/dc/terms/conformsTo',
        'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
    ]) {
        it(`collects classes after fallback shape loading via ${predicate}`, async () => {
            const requests: string[][] = []
            const resolvedUrls: string[] = []
            const store = await loadGraphs({
                values: `<urn:record> <${predicate}> <${ROOT_URL}> .`,
                // conformsTo can infer the subject; rdf:type requires an explicit subject.
                valuesSubject: predicate.endsWith('#type') ? 'urn:record' : undefined,
                loadOwlImports: true,
                rdfUrlResolver: async url => {
                    resolvedUrls.push(url)
                    return RESOURCES[url]
                },
                classInstanceProvider: async classes => {
                    requests.push([...classes].sort())
                    return '<urn:instance> a <urn:ImportedClass> .'
                }
            })

            expect(requests).to.deep.equal([EXPECTED_CLASSES])
            expect(resolvedUrls).to.deep.equal([ROOT_URL, IMPORT_URL, NESTED_URL])
            expect(store.countQuads(ROOT_URL, null, null, SHAPES_GRAPH)).to.be.greaterThan(0)
            expect(store.countQuads('urn:instance', null, 'urn:ImportedClass', SHAPES_GRAPH)).to.equal(1)
        })
    }
})
