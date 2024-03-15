import { NamedNode, Prefixes, Quad, Store } from 'n3'
import { OWL_OBJECT_NAMED_INDIVIDUAL, PREFIX_RDFS, PREFIX_SHACL, PREFIX_SKOS, RDFS_PREDICATE_SUBCLASS_OF, RDF_PREDICATE_TYPE, SHAPES_GRAPH, SKOS_PREDICATE_BROADER } from './constants'
import { Term } from '@rdfjs/types'
import { InputListEntry } from './theme'
import { Config } from './config'

export function findObjectValueByPredicate(quads: Quad[], predicate: string, prefix: string = PREFIX_SHACL, language?: string): string {
    let result = ''
    const object = findObjectByPredicate(quads, predicate, prefix, language)
    if (object) {
        result = object.value
    }
    return result
}

export function findObjectByPredicate(quads: Quad[], predicate: string, prefix: string = PREFIX_SHACL, language?: string): Term | undefined {
    let candidate: Term | undefined
    const prefixedPredicate = prefix + predicate
    for (const quad of quads) {
        if (quad.predicate.value === prefixedPredicate) {
            if (language) {
                if (quad.object.id.endsWith(`@${language}`)) {
                    return quad.object
                }
                else if (quad.object.id.indexOf('@') < 0) {
                    candidate = quad.object
                } else if (!candidate) {
                    candidate = quad.object
                }
            }
            else {
                return quad.object
            }
        }
    }
    return candidate
}

export function focusFirstInputElement(context: HTMLElement) {
    (context.querySelector('input,select,textarea') as HTMLElement)?.focus()
}

export function findLabel(quads: Quad[], language?: string): string {
    let label = findObjectValueByPredicate(quads, 'prefLabel', PREFIX_SKOS, language)
    if (label) {
        return label
    }
    return findObjectValueByPredicate(quads, 'label', PREFIX_RDFS, language)
}

export function createInputListEntries(subjects: Term[], shapesGraph: Store, language: string): InputListEntry[] {
    const entries: InputListEntry[] = []
    for (const subject of subjects) {
        entries.push({ value: subject, label: findLabel(shapesGraph.getQuads(subject, null, null, null), language) })
    }
    return entries
}

export function removePrefixes(id: string, prefixes: Prefixes): string {
    for (const key in prefixes) {
        // need to ignore type check. 'prefix' is a string and not a NamedNode<string> (seems to be a bug in n3 typings)
        // @ts-ignore
        id = id.replace(prefixes[key], '')
    }
    return id
}

export function findInstancesOf(clazz: NamedNode, config: Config): InputListEntry[] {
    const instances: Term[] = config.shapesGraph.getSubjects(RDF_PREDICATE_TYPE, clazz, null)
    const entries = createInputListEntries(instances, config.shapesGraph, config.attributes.language)
    for (const subClass of config.shapesGraph.getSubjects(RDFS_PREDICATE_SUBCLASS_OF, clazz, null)) {
        entries.push(...findInstancesOf(subClass as NamedNode, config))
    }
    if (config.shapesGraph.has(new Quad(clazz, RDF_PREDICATE_TYPE, OWL_OBJECT_NAMED_INDIVIDUAL, SHAPES_GRAPH))) {
        entries.push(...createInputListEntries([ clazz ], config.shapesGraph, config.attributes.language))
        for (const subClass of config.shapesGraph.getSubjects(SKOS_PREDICATE_BROADER, clazz, null)) {
            entries.push(...findInstancesOf(subClass as NamedNode, config))
        }
    }
    return entries
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
