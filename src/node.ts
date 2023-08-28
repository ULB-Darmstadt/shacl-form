import { BlankNode, DataFactory, NamedNode, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { PREFIX_SHACL, SHAPES_GRAPH, RDF_PREDICATE_TYPE } from './constants'
import { ShaclProperty, ShaclPropertyInstance } from './property'
import { ShaclGroup } from './group'
import { v4 as uuidv4 } from 'uuid'
import { ShaclOrConstraint } from './constraints'
import { Config } from './config'

export class ShaclNode extends HTMLElement {
    shaclSubject: NamedNode
    nodeId: NamedNode | BlankNode
    targetClass: NamedNode | undefined
    parent: ShaclNode | ShaclPropertyInstance | undefined
    config: Config

    constructor(shaclSubject: NamedNode, config: Config, parent: ShaclNode | ShaclPropertyInstance | undefined, valueSubject: NamedNode | BlankNode | undefined) {
        super()

        this.config = config
        this.parent = parent
        this.shaclSubject = shaclSubject
        this.nodeId = valueSubject || DataFactory.blankNode(uuidv4())
        const quads = config.shapesGraph.getQuads(shaclSubject, null, null, SHAPES_GRAPH)
        let list: Term[] | undefined

        for (const quad of quads) {
            switch (quad.predicate.id) {
                case `${PREFIX_SHACL}property`:
                    let parent: HTMLElement = this
                    // check if property belongs to a group
                    const groupRef = config.shapesGraph.getQuads(quad.object as Term, `${PREFIX_SHACL}group`, null, SHAPES_GRAPH)
                    if (groupRef.length > 0) {
                        const groupSubject = groupRef[0].object.value
                        if (config.groups.indexOf(groupSubject) > -1) {
                            // check if group element already exists
                            let group = this.querySelector(`:scope > shacl-group[data-subject='${groupSubject}']`) as ShaclGroup
                            if (!group) {
                                group = new ShaclGroup(groupSubject, config)
                                this.appendChild(group)
                            }
                            parent = group
                        } else {
                            console.warn('ignoring unknown group reference', groupRef[0])
                        }
                    }
                    parent.appendChild(new ShaclProperty(quad.object as NamedNode | BlankNode, config, this.nodeId, valueSubject))
                    break;
                case `${PREFIX_SHACL}and`:
                    // inheritance via sh:and
                    list = config.lists[quad.object.value]
                    if (list?.length) {
                        for (const shape of list) {
                            this.prepend(new ShaclNode(shape as NamedNode, config, this, valueSubject))
                        }
                    }
                    else {
                        console.error('list not found:', quad.object.value, 'existing lists:', config.lists)
                    }
                    break;
                case `${PREFIX_SHACL}node`:
                    // inheritance via sh:node
                    this.prepend(new ShaclNode(quad.object as NamedNode, config, this, valueSubject))
                    break;
                case `${PREFIX_SHACL}targetClass`:
                    this.targetClass = quad.object as NamedNode
                    break;
                case `${PREFIX_SHACL}or`:
                    list = config.lists[quad.object.value]
                    if (list?.length) {
                        this.appendChild(new ShaclOrConstraint(list, this, config))
                    }
                    else {
                        console.error('list not found:', quad.object.value, 'existing lists:', config.lists)
                    }
                    break;
            }
        }

        if (parent instanceof ShaclPropertyInstance) {
            const header = document.createElement('h1')
            header.innerText = parent.template.label
            this.prepend(header)
        }
    }

    toRDF(graph: Store, subject?: NamedNode | BlankNode): (NamedNode | BlankNode) {
        if (!subject) {
            subject = this.nodeId
        }
        for (const shape of this.querySelectorAll(':scope > shacl-node, :scope > shacl-group > shacl-node, :scope > shacl-property, :scope > shacl-group > shacl-property, :scope > shacl-or-constraint > shacl-node, :scope > shacl-or-constraint > shacl-property')) {
            (shape as ShaclNode | ShaclProperty).toRDF(graph, subject)
        }
        if (this.targetClass) {
            graph.addQuad(subject, RDF_PREDICATE_TYPE, this.targetClass)
        }
        if (!this.parent) {
            graph.addQuad(subject, RDF_PREDICATE_TYPE, this.shaclSubject)
        }
        return subject
    }
}

window.customElements.define('shacl-node', ShaclNode)
