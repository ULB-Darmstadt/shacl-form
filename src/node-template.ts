import { BlankNode, Literal, NamedNode, Quad } from "n3"
import { ShaclNode } from "./node"
import { Config } from "./config"
import { OWL_PREDICATE_IMPORTS, PREFIX_SHACL } from "./constants";
import { Term } from "@rdfjs/types";

const mappers: Record<string, (template: ShaclNodeTemplate, term: Term) => void> = {
    [`${PREFIX_SHACL}property`]:     (template, term) => { template.properties.push(term as (BlankNode | NamedNode)) },
    [`${PREFIX_SHACL}and`]:          (template, term) => { template.shaclAnd = term.value },
    [`${PREFIX_SHACL}node`]:         (template, term) => { template.node = term as NamedNode },
    [`${PREFIX_SHACL}targetClass`]:  (template, term) => { template.targetClass = term as NamedNode },
    [`${PREFIX_SHACL}or`]:           (template, term) => {
        const list = template.config.lists[term.value]
        console.log('--- sh:or node', term.value, list)
        if (list?.length) {
            template.shaclOr = list
        } else {
            console.error('list for sh:or not found:', term.value, 'existing lists:', template.config.lists)
        }
    },
    [`${PREFIX_SHACL}xone`]:         (template, term) => {
        const list = template.config.lists[term.value]
        if (list?.length) {
            template.shaclXone = list
        } else {
            console.error('list for sh:xone not found:', term.value, 'existing lists:', template.config.lists)
        }
    },
    [OWL_PREDICATE_IMPORTS.id]:      (template, term) => { template.owlImports.push(term as NamedNode) }
}

export class ShaclNodeTemplate {
    properties: (NamedNode | BlankNode)[] = []
    node: NamedNode | undefined
    shaclAnd: string | undefined    
    shaclOr: Term[] | undefined
    shaclXone: Term[] | undefined
    targetClass: NamedNode | undefined

    owlImports: NamedNode[] = []
    config: Config
    extendedShapes: NamedNode[] = []

    constructor(quads: Quad[], config: Config) {
        this.config = config
        this.merge(quads)
    }

    merge(quads: Quad[]): ShaclNodeTemplate {
        for (const quad of quads) {
            mappers[quad.predicate.id]?.call(this, this, quad.object)
        }
        // resolve extended shapes
        if (this.node || this.shaclAnd) {
            if (this.node) {
                this.extendedShapes.push(this.node)
            }
            if (this.shaclAnd) {
                const list = this.config.lists[this.shaclAnd]
                if (list?.length) {
                    for (const node of list) {
                        this.extendedShapes.push(node as NamedNode)
                    }
                }
            }
        }
        return this
    }

    clone(): ShaclNodeTemplate {
        const copy = Object.assign({}, this)
        // arrays are not cloned but referenced, so create them manually
        copy.owlImports = [ ...this.owlImports ]
        if (this.shaclOr) {
            copy.shaclOr = [ ...this.shaclOr ]
        }
        if (this.shaclXone) {
            copy.shaclXone = [ ...this.shaclXone ]
        }
        copy.merge = this.merge.bind(copy)
        copy.clone = this.clone.bind(copy)
        return copy
    }
}