import { Literal, NamedNode, Prefixes, Quad, Store } from 'n3'
import { DATA_GRAPH, PREFIX_FOAF, PREFIX_RDF, PREFIX_RDFS, PREFIX_SHACL, PREFIX_SKOS, RDFS_PREDICATE_SUBCLASS_OF, RDF_PREDICATE_TYPE, SHAPES_GRAPH, SKOS_PREDICATE_BROADER, SKOS_PREDICATE_NARROWER } from './constants'
import { Term } from '@rdfjs/types'
import { InputListEntry } from './theme'
import { ShaclPropertyTemplate } from './property-template'
import { ShaclNodeTemplate } from './node-template'

export function findObjectValueByPredicate(quads: Quad[], predicate: string, prefix: string = PREFIX_SHACL, languages?: string[]): string {
    let result = ''
    const object = findObjectByPredicate(quads, predicate, prefix, languages)
    if (object) {
        result = object.value
    }
    return result
}

export function findObjectByPredicate(quads: Quad[], predicate: string, prefix: string = PREFIX_SHACL, languages?: string[]): Term | undefined {
    let candidate: Term | undefined
    const prefixedPredicate = prefix + predicate

    if (languages?.length) {
        for (const language of languages) {
            for (const quad of quads) {
                if (quad.predicate.value === prefixedPredicate) {
                    if (quad.object.id.endsWith(`@${language}`)) {
                        return quad.object
                    }
                    else if (quad.object.id.indexOf('@') < 0) {
                        candidate = quad.object
                    } else if (!candidate) {
                        candidate = quad.object
                    }
                }
            }
        }
    } else {
        for (const quad of quads) {
            if (quad.predicate.value === prefixedPredicate) {
                return quad.object
            }
        }
    }
    return candidate
}

export function focusFirstInputElement(context: HTMLElement) {
    (context.querySelector('.editor') as HTMLElement)?.focus()
}

export function findLabel(quads: Quad[], languages: string[]): string {
    return findObjectValueByPredicate(quads, 'prefLabel', PREFIX_SKOS, languages) ||
    findObjectValueByPredicate(quads, 'label', PREFIX_RDFS, languages) ||
    findObjectValueByPredicate(quads, 'name', PREFIX_FOAF, languages)
}

export function createInputListEntries(subjects: Term[], shapesGraph: Store, languages: string[]): InputListEntry[] {
    const entries: InputListEntry[] = []
    for (const subject of subjects) {
        entries.push({ value: subject, label: findLabel(shapesGraph.getQuads(subject, null, null, null), languages), children: [] })
    }
    return entries
}

export function removePrefixes(id: string, prefixes: Prefixes): string {
    for (const key in prefixes) {
        // @ts-expect-error need to ignore type check. 'prefix' is a string and not a NamedNode<string> (seems to be a bug in n3 typings)
        const prefix: string = prefixes[key]
        if (id.startsWith(prefix)) {
            id = id.slice(prefix.length)
        }

    }
    return id
}

function findClassInstancesFromOwlImports(clazz: NamedNode, context: ShaclNodeTemplate | ShaclPropertyTemplate, shapesGraph: Store, instances: Term[], alreadyCheckedImports = new Set<string>()) {
    for (const owlImport of context.owlImports) {
        if (!alreadyCheckedImports.has(owlImport.id)) {
            alreadyCheckedImports.add(owlImport.id)
            instances.push(...shapesGraph.getSubjects(RDF_PREDICATE_TYPE, clazz, owlImport))
        }
    }
    if (context.parent) {
        findClassInstancesFromOwlImports(clazz, context.parent, shapesGraph, instances, alreadyCheckedImports)
    }
}

export function findInstancesOf(clazz: NamedNode, template: ShaclPropertyTemplate): InputListEntry[] {
    // if template has sh:in, then just use that as class instances
    if (template.in) {
        const list = template.config.lists[template.in]
        return createInputListEntries(list?.length ? list : [], template.config.store, template.config.languages)
    } else {
        // find instances in the shapes graph
        const instances = template.config.store.getSubjects(RDF_PREDICATE_TYPE, clazz, SHAPES_GRAPH)
        // find instances in the data graph
        instances.push(...template.config.store.getSubjects(RDF_PREDICATE_TYPE, clazz, DATA_GRAPH))
        // find instances in imported taxonomies and shapes (these are scoped, depending on the location of the owl:imports statement)
        findClassInstancesFromOwlImports(clazz, template, template.config.store, instances)

        // initialize structures needed for building a class instance hierarchy
        const nodes = new Map<string, InputListEntry>() // URI -> InputListEntry
        const childToParent = new Map<string, string>() // URI -> parentURI

        // initialize all instances as InputListEntry's with no children
        for (const instance of instances) {
            nodes.set(instance.id, { value: instance, label: findLabel(template.config.store.getQuads(instance, null, null, null), template.config.languages), children: [] })
        }

        // record broader/narrower/subClassOf hierarchical relationships
        for (const instance of instances) {
            for (const parent of template.config.store.getObjects(instance, SKOS_PREDICATE_BROADER, null)) {
                if (nodes.has(parent.id)) {
                    childToParent.set(instance.id, parent.id)
                }
            }
            for (const child of template.config.store.getObjects(instance, SKOS_PREDICATE_NARROWER, null)) {
                if (nodes.has(child.id)) {
                    childToParent.set(child.id, instance.id)
                }
            }
            for (const parent of template.config.store.getObjects(instance, RDFS_PREDICATE_SUBCLASS_OF, null)) {
                if (nodes.has(parent.id)) {
                    childToParent.set(instance.id, parent.id)
                }
            }
        }

        // build hierarchy by nesting children under parents
        for (const [child, parent] of childToParent.entries()) {
            nodes.get(parent)?.children?.push(nodes.get(child)!)
        }

        // find root nodes (no parent relationship)
        const roots: InputListEntry[] = []
        for (const [uri, node] of nodes.entries()) {
            if (!childToParent.has(uri)) {
                roots.push(node)
            }
        }

        // add sub class instances
        for (const subClass of template.config.store.getSubjects(RDFS_PREDICATE_SUBCLASS_OF, clazz, null)) {
            roots.push(...findInstancesOf(subClass as NamedNode, template))
        }
        return roots
    }
}

export function isURL(input: string): boolean {
    let url: URL
    try {
        url = new URL(input)
    } catch (_) {
        return false
    }
    return url.protocol === 'http:' || url.protocol === 'https:'
}

export function prioritizeByLanguage(languages: string[], text1?: Literal, text2?: Literal): Literal | undefined {
    if (text1 === undefined) {
        return text2
    }
    if (text2 === undefined) {
        return text1
    }
    const index1 = languages.indexOf(text1.language)
    if (index1 < 0) {
        return text2
    }
    const index2 = languages.indexOf(text2.language)
    if (index2 < 0) {
        return text1
    }
    return index2 > index1 ? text1 : text2
}

/*
 This code is taken from https://github.com/rdfjs/N3.js/blob/main/src/N3Store.js and adapted to allow rdf:type triples in lists.
 Can be removed as soon as https://github.com/rdfjs/N3.js/issues/546 is fixed.
*/
export function extractLists(store: Store, { remove = false, ignoreErrors = false } = {}) {
    const lists: Record<string, Term[]> = {} // has scalar keys so could be a simple Object
    const onError = ignoreErrors ? (() => true) :
                  ((node: Term, message: string) => { throw new Error(`${node.value} ${message}`) })

    // Traverse each list from its tail
    const tails = store.getQuads(null, PREFIX_RDF + 'rest', PREFIX_RDF + 'nil', null)
    const toRemove = remove ? [...tails] : []
    tails.forEach(tailQuad => {
      const items = [] // the members found as objects of rdf:first quads
      let malformed = false // signals whether the current list is malformed
      let head // the head of the list (_:b1 in above example)
      let headPos: string // set to subject or object when head is set
      const graph = tailQuad.graph // make sure list is in exactly one graph

      // Traverse the list from tail to end
      let current: Term | null = tailQuad.subject
      while (current && !malformed) {
        const objectQuads = store.getQuads(null, null, current, null)
        const subjectQuads = store.getQuads(current, null, null, null).filter(quad => !quad.predicate.equals(RDF_PREDICATE_TYPE))
        let quad, first = null, rest = null, parent = null

        // Find the first and rest of this list node
        for (let i = 0; i < subjectQuads.length && !malformed; i++) {
          quad = subjectQuads[i]
          if (!quad.graph.equals(graph))
            malformed = onError(current, 'not confined to single graph')
          else if (head)
            malformed = onError(current, 'has non-list arcs out')

          // one rdf:first
          else if (quad.predicate.value === PREFIX_RDF + 'first') {
            if (first)
              malformed = onError(current, 'has multiple rdf:first arcs')
            else
              toRemove.push(first = quad)
          }

          // one rdf:rest
          else if (quad.predicate.value === PREFIX_RDF + 'rest') {
            if (rest)
              malformed = onError(current, 'has multiple rdf:rest arcs')
            else
              toRemove.push(rest = quad)
          }

          // alien triple
          else if (objectQuads.length)
            malformed = onError(current, 'can\'t be subject and object')
          else {
            head = quad // e.g. { (1 2 3) :p :o }
            headPos = 'subject'
          }
        }

        // { :s :p (1 2) } arrives here with no head
        // { (1 2) :p :o } arrives here with head set to the list.
        for (let i = 0; i < objectQuads.length && !malformed; ++i) {
          quad = objectQuads[i]
          if (head)
            malformed = onError(current, 'can\'t have coreferences')
          // one rdf:rest
          else if (quad.predicate.value === PREFIX_RDF + 'rest') {
            if (parent)
              malformed = onError(current, 'has incoming rdf:rest arcs')
            else
              parent = quad
          }
          else {
            head = quad // e.g. { :s :p (1 2) }
            headPos = 'object'
          }
        }

        // Store the list item and continue with parent
        if (!first)
          malformed = onError(current, 'has no list head')
        else
          items.unshift(first.object)
        current = parent && parent.subject
      }

      // Don't remove any quads if the list is malformed
      if (malformed)
        remove = false
      // Store the list under the value of its head
      else if (head) {
        // @ts-expect-error using strings to index object
        lists[head[headPos].value] = items
      }
    })

    // Remove list quads if requested
    if (remove)
      store.removeQuads(toRemove)
    return lists
  }