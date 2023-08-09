import { Literal, NamedNode, Quad } from 'n3'
import { Term } from '@rdfjs/types'
import { PREFIX_DASH, PREFIX_RDF, PREFIX_SHACL, SHAPES_GRAPH } from './constants'
import { Config } from './config'
import { findLabel } from './util'
import { InputListEntry } from './inputs'

const mappers: Record<string, (spec: ShaclPropertySpec, term: Term) => void> = {
    [`${PREFIX_SHACL}name`]:         (spec, term) => { if (!spec.names) {spec.names = []}; spec.names.push(term as Literal) },
    [`${PREFIX_SHACL}description`]:  (spec, term) => { if (!spec.descriptions) {spec.descriptions = []}; spec.descriptions.push(term as Literal) },
    [`${PREFIX_SHACL}path`]:         (spec, term) => { spec.path = term.value },
    [`${PREFIX_SHACL}node`]:         (spec, term) => { spec.node = term as NamedNode },
    [`${PREFIX_SHACL}datatype`]:     (spec, term) => { spec.datatype = term as NamedNode },
    [`${PREFIX_SHACL}nodeKind`]:     (spec, term) => { spec.nodeKind = term as NamedNode },
    [`${PREFIX_SHACL}minCount`]:     (spec, term) => { spec.minCount = parseInt(term.value) },
    [`${PREFIX_SHACL}maxCount`]:     (spec, term) => { spec.maxCount = parseInt(term.value) },
    [`${PREFIX_SHACL}minLength`]:    (spec, term) => { spec.minLength = parseInt(term.value) },
    [`${PREFIX_SHACL}maxLength`]:    (spec, term) => { spec.maxLength = parseInt(term.value) },
    [`${PREFIX_SHACL}minInclusive`]: (spec, term) => { spec.minInclusive = parseInt(term.value) },
    [`${PREFIX_SHACL}maxInclusive`]: (spec, term) => { spec.maxInclusive = parseInt(term.value) },
    [`${PREFIX_SHACL}minExclusive`]: (spec, term) => { spec.minExclusive = parseInt(term.value) },
    [`${PREFIX_SHACL}maxExclusive`]: (spec, term) => { spec.maxExclusive = parseInt(term.value) },
    [`${PREFIX_SHACL}pattern`]:      (spec, term) => { spec.pattern = term.value },
    [`${PREFIX_SHACL}order`]:        (spec, term) => { spec.order = term.value },
    [`${PREFIX_DASH}singleLine`]:    (spec, term) => { spec.singleLine = term.value === 'true' },
    [`${PREFIX_SHACL}in`]:           (spec, term) => { spec.shaclIn = term.value },
    [`${PREFIX_SHACL}languageIn`]:   (spec, term) => { spec.languageIn = spec.config.lists[term.value] },
    [`${PREFIX_SHACL}defaultValue`]:     (spec, term) => { spec.defaultValue = term },
    [`${PREFIX_SHACL}hasValue`]:     (spec, term) => { spec.hasValue = term },
    [`${PREFIX_SHACL}class`]:        (spec, term) => {
        spec.class = term as NamedNode
        // try to find node shape that has requested target class.
        const nodeShapes = spec.config.shapesGraph.getQuads(null, `${PREFIX_SHACL}targetClass`, term, SHAPES_GRAPH)
        if (nodeShapes.length > 0) {
            spec.node = nodeShapes[0].subject as NamedNode
        }
        else {
            // try to resolve class instances from loaded ontologies
            const ontologyInstances = spec.config.shapesGraph.getQuads(null, `${PREFIX_RDF}type`, term, null)
            if (ontologyInstances.length) {
                spec.classInstances = []
                for (const ontologyInstance of ontologyInstances) {
                    const ontologyInstanceQuads = spec.config.shapesGraph.getQuads(ontologyInstance.subject, null, null, null)
                    spec.classInstances.push({
                        value: ontologyInstance.subject.value,
                        label: findLabel(ontologyInstanceQuads, spec.config.language)
                    })
                }
            } else {
                console.warn('class', spec.class.value, 'has no instances in the shapes graph. the generated RDF triples will not validate.')
            }
        }},
    [`${PREFIX_SHACL}or`]:           (spec, term) => {
        const list = spec.config.lists[term.value]
        if (list?.length) {
            spec.shaclOr = list
        }
        else {
            console.error('list not found:', term.value, 'existing lists:', spec.config.lists)
        }
    }
}

export class ShaclPropertySpec  {
    name: string
    description: string | undefined
    names: Literal[] | undefined
    descriptions: Literal[] | undefined
    classInstances: Array<InputListEntry> | undefined
    path: string | undefined
    node: NamedNode | undefined
    class: NamedNode | undefined
    minCount: number | undefined
    maxCount: number | undefined
    minLength: number | undefined
    maxLength: number | undefined
    minInclusive: number | undefined
    maxInclusive: number | undefined
    minExclusive: number | undefined
    maxExclusive: number | undefined
    singleLine: boolean | undefined
    defaultValue: Term | undefined
    pattern: string | undefined
    order: string | undefined
    nodeKind: NamedNode | undefined
    shaclIn: string | undefined
    shaclOr: Term[] | undefined
    languageIn: Term[] | undefined
    datatype: NamedNode | undefined
    hasValue: Term | undefined

    config: Config

    constructor(quads: Quad[], config: Config) {
        this.config = config
        mergeQuads(this, quads)

        let name = findLangstring(this.names, config.language)
        if (!name) {
            name = findLabel(quads, config.language)
        }
        if (!name) {
            name = this.path
        }
        if (!name) {
            name = 'unknown'
        }
        this.name = name

        this.description = findLangstring(this.descriptions, config.language)
    }
}

export function mergeQuads(spec: ShaclPropertySpec, quads: Quad[]) {
    for (const quad of quads) {
        mappers[quad.predicate.id]?.call(spec, spec, quad.object)
    }
}

function findLangstring(options: Literal[] | undefined, language: string | null): string | undefined {
    if (!options?.length) {
        return
    }
    if (language) {
        for (const literal of options) {
            if (literal.language === language) {
                return literal.value
            }
        }
    }
    return options[0].value
}
