import { Literal, NamedNode, Prefixes, Quad, Term as N3Term, Store } from 'n3'
import { DATA_GRAPH, PREFIX_FOAF, PREFIX_RDFS, PREFIX_SHACL, PREFIX_SKOS, RDFS_PREDICATE_SUBCLASS_OF, RDF_PREDICATE_TYPE, SHAPES_GRAPH, SKOS_PREDICATE_BROADER, SKOS_PREDICATE_NARROWER } from './constants'
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

export function findInstancesOf(clazz: NamedNode, template: ShaclPropertyTemplate): InputListEntry[] {
    // if template has sh:in, then just use that as class instances
    if (template.shaclIn) {
        const list = template.config.lists[template.shaclIn]
        return createInputListEntries(list?.length ? list : [], template.config.store, template.config.languages)
    } else {
        const instances = template.config.store.getSubjects(RDF_PREDICATE_TYPE, clazz, SHAPES_GRAPH)
        // find instances in the data graph
        instances.push(...template.config.store.getSubjects(RDF_PREDICATE_TYPE, clazz, DATA_GRAPH))
        // find instances in imported taxonomies
        findClassInstancesFromOwlImports(clazz, template, template.config.store, instances)

        // structures needed for build a class instance hierarchy
        const nodes = new Map<string, InputListEntry>()   // URI -> InputListEntry
        const childToParent = new Map<string, string>() // URI -> parentURI

        // Step 1: Initialize all instances as InputListEntry's with no children
        for (const instance of instances) {
            nodes.set(instance.id, { value: instance, label: findLabel(template.config.store.getQuads(instance, null, null, null), template.config.languages), children: [] })
        }

        // Step 2: Record broader/narrower relationships (child -> parent)
        for (const instance of instances) {
            appendSkosBroaderNarrower(instance, nodes, childToParent, template)
        }

        // Step 3: Build hierarchy by nesting children under parents
        for (const [child, parent] of childToParent.entries()) {
            nodes.get(parent)!.children!.push(nodes.get(child)!)
        }

        // Step 4: Find root nodes (no broader relationship)
        const roots: InputListEntry[] = []
        for (const [uri, node] of nodes.entries()) {
            if (!childToParent.has(uri)) {
                roots.push(node)
            }
        }

        // Step 5: Add sub class instances
        for (const subClass of template.config.store.getSubjects(RDFS_PREDICATE_SUBCLASS_OF, clazz, null)) {
            roots.push(...findInstancesOf(subClass as NamedNode, template))
        }
        return roots
    }
}

function appendSkosBroaderNarrower(subject: N3Term, nodes: Map<string, InputListEntry>, childToParent: Map<string, string>, template: ShaclPropertyTemplate) {
    for (const parent of template.config.store.getObjects(subject, SKOS_PREDICATE_BROADER, null)) {
        childToParent.set(subject.id, parent.id)
        if (!nodes.has(parent.id)) {
            nodes.set(parent.id, { value: parent, label: findLabel(template.config.store.getQuads(parent, null, null, null), template.config.languages), children: [] })
        }
        appendSkosBroaderNarrower(parent, nodes, childToParent, template)
    }
    for (const child of template.config.store.getObjects(subject, SKOS_PREDICATE_NARROWER, null)) {
        childToParent.set(child.id, subject.id)
        if (!nodes.has(child.id)) {
            nodes.set(child.id, { value: child, label: findLabel(template.config.store.getQuads(child, null, null, null), template.config.languages), children: [] })
        }
        appendSkosBroaderNarrower(child, nodes, childToParent, template)
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