import { NamedNode, Prefixes, Quad, Store } from 'n3'
import { OWL_OBJECT_NAMED_INDIVIDUAL, PREFIX_RDFS, PREFIX_SHACL, PREFIX_SKOS, RDFS_PREDICATE_SUBCLASS_OF, RDF_PREDICATE_TYPE, SHAPES_GRAPH, SKOS_PREDICATE_BROADER } from './constants'
import { Term } from '@rdfjs/types'
import { InputListEntry } from './theme'
import { ShaclPropertyTemplate } from './property-template'
import { ShaclNode } from './node'

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
    (context.querySelector('input,select,textarea') as HTMLElement)?.focus()
}

export function findLabel(quads: Quad[], languages: string[]): string {
    let label = findObjectValueByPredicate(quads, 'prefLabel', PREFIX_SKOS, languages)
    if (label) {
        return label
    }
    return findObjectValueByPredicate(quads, 'label', PREFIX_RDFS, languages)
}

export function createInputListEntries(subjects: Term[], shapesGraph: Store, languages: string[], indent?: number): InputListEntry[] {
    const entries: InputListEntry[] = []
    for (const subject of subjects) {
        entries.push({ value: subject, label: findLabel(shapesGraph.getQuads(subject, null, null, null), languages), indent: indent })
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

function findClassInstancesFromOwlImports(clazz: NamedNode, context: ShaclNode | ShaclPropertyTemplate, shapesGraph: Store, instances: Term[], alreadyCheckedImports = new Set<string>()) {
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

export function findInstancesOf(clazz: NamedNode, template: ShaclPropertyTemplate, indent = 0): InputListEntry[] {
    // find instances in the shapes graph
    const instances: Term[] = template.config.shapesGraph.getSubjects(RDF_PREDICATE_TYPE, clazz, SHAPES_GRAPH)
    // find instances in the data graph
    instances.push(...template.config.dataGraph.getSubjects(RDF_PREDICATE_TYPE, clazz, null))
    // find instances in imported taxonomies
    findClassInstancesFromOwlImports(clazz, template, template.config.shapesGraph, instances)
    
    const entries = createInputListEntries(instances, template.config.shapesGraph, template.config.languages, indent)
    for (const subClass of template.config.shapesGraph.getSubjects(RDFS_PREDICATE_SUBCLASS_OF, clazz, null)) {
        entries.push(...findInstancesOf(subClass as NamedNode, template, indent + 1))
    }
    if (template.config.shapesGraph.has(new Quad(clazz, RDF_PREDICATE_TYPE, OWL_OBJECT_NAMED_INDIVIDUAL))) {
        entries.push(...createInputListEntries([ clazz ], template.config.shapesGraph, template.config.languages, indent))
        for (const subClass of template.config.shapesGraph.getSubjects(SKOS_PREDICATE_BROADER, clazz, null)) {
            entries.push(...findInstancesOf(subClass as NamedNode, template, indent + 1))
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
