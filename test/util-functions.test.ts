import { expect } from '@open-wc/testing'
import { DataFactory, NamedNode, Prefixes, Store } from 'n3'
import { extractLists, isURL, prioritizeByLanguage, removePrefixes } from '../src/util'
import { PREFIX_RDF } from '../src/constants'

const { blankNode, literal, namedNode, quad } = DataFactory

describe('util functions', () => {
    it('removes configured prefixes from ids', () => {
        const prefixes: Prefixes = {
            // @ts-expect-error need to ignore type check. 'prefix' is a string and not a NamedNode<string> (seems to be a bug in n3 typings)
            'ex': 'http://example.com/',
            // @ts-expect-error need to ignore type check. 'prefix' is a string and not a NamedNode<string> (seems to be a bug in n3 typings)
            'full': 'urn:example:'
        }

        expect(removePrefixes('http://example.com/value', prefixes)).to.equal('value')
        expect(removePrefixes('urn:example:value', prefixes)).to.equal('value')
        expect(removePrefixes('http://other.example/value', prefixes)).to.equal('http://other.example/value')
    })

    it('validates URLs with http/https schemes', () => {
        expect(isURL('https://example.com')).to.be.true
        expect(isURL('http://example.com/test')).to.be.true
        expect(isURL('ftp://example.com')).to.be.false
        expect(isURL('not a url')).to.be.false
    })

    it('prioritizes literals based on language preference', () => {
        const languages = ['en', 'de']
        const english = literal('hello', 'en')
        const german = literal('hallo', 'de')

        expect(prioritizeByLanguage(languages, english, german)).to.equal(english)
        expect(prioritizeByLanguage(languages, undefined, german)).to.equal(german)
        expect(prioritizeByLanguage(languages, english, undefined)).to.equal(english)
    })

    it('extracts rdf lists even when rdf:type triples are present on list nodes', () => {
        const listHead = blankNode('b1')
        const listTail = blankNode('b2')
        const store = new Store([
            quad(namedNode('http://example.org/subject'), namedNode('http://example.org/predicate'), listHead),
            quad(listHead, namedNode(PREFIX_RDF + 'first'), namedNode('http://example.org/one')),
            quad(listHead, namedNode(PREFIX_RDF + 'rest'), listTail),
            quad(listTail, namedNode(PREFIX_RDF + 'first'), namedNode('http://example.org/two')),
            quad(listTail, namedNode(PREFIX_RDF + 'rest'), namedNode(PREFIX_RDF + 'nil')),
            quad(listHead, namedNode(PREFIX_RDF + 'type'), namedNode('http://example.org/ListNode'))
        ])

        const lists = extractLists(store)
        expect(lists[listHead.value]).to.deep.equal([
            namedNode('http://example.org/one'),
            namedNode('http://example.org/two')
        ])
    })

    it('removes rdf:first/rest quads when extractLists is called with remove', () => {
        const listHead = blankNode('b1')
        const store = new Store([
            quad(namedNode('http://example.org/subject'), namedNode('http://example.org/predicate'), listHead),
            quad(listHead, namedNode(PREFIX_RDF + 'first'), namedNode('http://example.org/one')),
            quad(listHead, namedNode(PREFIX_RDF + 'rest'), namedNode(PREFIX_RDF + 'nil'))
        ])

        const lists = extractLists(store, { remove: true })
        expect(lists[listHead.value]).to.deep.equal([
            namedNode('http://example.org/one')
        ])
        expect(store.getQuads(null, namedNode(PREFIX_RDF + 'first'), null, null)).to.have.lengthOf(0)
        expect(store.getQuads(null, namedNode(PREFIX_RDF + 'rest'), null, null)).to.have.lengthOf(0)
    })
})
