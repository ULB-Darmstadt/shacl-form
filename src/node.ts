import { BlankNode, DataFactory, NamedNode, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { PREFIX_SHACL, SHAPES_GRAPH, RDF_PREDICATE_TYPE, DCTERMS_PREDICATE_CONFORMS_TO } from './constants'
import { ShaclProperty } from './property'
import { createShaclGroup } from './group'
import { v4 as uuidv4 } from 'uuid'
import { createShaclOrConstraint } from './constraints'
import { Config } from './config'

export class ShaclNode extends HTMLElement {
    shaclSubject: NamedNode
    nodeId: NamedNode | BlankNode
    targetClass: NamedNode | undefined
    config: Config

    constructor(shaclSubject: NamedNode, config: Config, valueSubject: NamedNode | BlankNode | undefined, nodeKind?: NamedNode, label?: string) {
        super()

        this.config = config
        this.shaclSubject = shaclSubject
        let nodeId: NamedNode | BlankNode | undefined = valueSubject
        if (!nodeId) {
            // if no value subject given, create new node id with a type depending on own nodeKind or given parent property nodeKind
            if (!nodeKind) {
                const spec = config.shapesGraph.getObjects(shaclSubject, `${PREFIX_SHACL}nodeKind`, SHAPES_GRAPH)
                if (spec.length) {
                    nodeKind = spec[0] as NamedNode
                }
            }
            // if nodeKind is not set, but a value namespace is configured or if nodeKind is sh:IRI, then create a NamedNode
            if ((nodeKind === undefined && config.attributes.valuesNamespace) || nodeKind?.id === `${PREFIX_SHACL}IRI`) {
                // no requirements on node type, so create a NamedNode and use configured value namespace
                nodeId = DataFactory.namedNode(config.attributes.valuesNamespace + uuidv4())
            } else {
                // otherwise create a BlankNode
                nodeId = DataFactory.blankNode(uuidv4())
            }
        }
        this.nodeId = nodeId

        // check if the form already contains the node/value pair to prevent recursion
        const id = JSON.stringify([shaclSubject, valueSubject])
        if (valueSubject && config.renderedNodes.has(id)) {
            // node/value pair is already rendered in the form, so just display a reference
            if (label && config.attributes.collapse === null) {
                const labelElem = document.createElement('label')
                labelElem.innerText = label
                this.appendChild(labelElem)
            }
            const span = document.createElement('span')
            span.innerText = valueSubject.id
            this.appendChild(span)
            this.style.flexDirection = 'row'
        } else {
            if (valueSubject) {
                config.renderedNodes.add(id)
            }
            this.dataset.nodeId = this.nodeId.id
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
                                // check if group element already exists, otherwise create it
                                let group = this.querySelector(`:scope > .shacl-group[data-subject='${groupSubject}']`) as HTMLElement
                                if (!group) {
                                    group = createShaclGroup(groupSubject, config)
                                    this.appendChild(group)
                                }
                                parent = group
                            } else {
                                console.warn('ignoring unknown group reference', groupRef[0])
                            }
                        }
                        const property = new ShaclProperty(quad.object as NamedNode | BlankNode, config, this.nodeId, valueSubject)
                        // do not add empty properties (i.e. properties with no instances). This can be the case e.g. in viewer mode when there is no data for the respective property.
                        if (property.childElementCount > 0) {
                            parent.appendChild(property)
                        }
                        break;
                    case `${PREFIX_SHACL}and`:
                        // inheritance via sh:and
                        list = config.lists[quad.object.value]
                        if (list?.length) {
                            for (const shape of list) {
                                this.prepend(new ShaclNode(shape as NamedNode, config, valueSubject))
                            }
                        }
                        else {
                            console.error('list not found:', quad.object.value, 'existing lists:', config.lists)
                        }
                        break;
                    case `${PREFIX_SHACL}node`:
                        // inheritance via sh:node
                        this.prepend(new ShaclNode(quad.object as NamedNode, config, valueSubject))
                        break;
                    case `${PREFIX_SHACL}targetClass`:
                        this.targetClass = quad.object as NamedNode
                        break;
                    case `${PREFIX_SHACL}or`:
                        list = config.lists[quad.object.value]
                        if (list?.length) {
                            this.appendChild(createShaclOrConstraint(list, this, config))
                        }
                        else {
                            console.error('list not found:', quad.object.value, 'existing lists:', config.lists)
                        }
                        break;
                }
            }

            if (label) {
                const header = document.createElement('h1')
                header.innerText = label
                this.prepend(header)
            }
        }
    }

    toRDF(graph: Store, subject?: NamedNode | BlankNode): (NamedNode | BlankNode) {
        if (!subject) {
            subject = this.nodeId
        }
        for (const shape of this.querySelectorAll(':scope > shacl-node, :scope > .shacl-group > shacl-node, :scope > shacl-property, :scope > .shacl-group > shacl-property')) {
            (shape as ShaclNode | ShaclProperty).toRDF(graph, subject)
        }
        if (this.targetClass) {
            graph.addQuad(subject, RDF_PREDICATE_TYPE, this.targetClass)
        }
        // if this is the root shacl node, check if we should add one of the rdf:type or dcterms:conformsTo predicates
        if (this.config.attributes.generateNodeShapeReference && !this.closest('shacl-node shacl-node')) {
            if (this.config.attributes.generateNodeShapeReference === 'rdf:type') {
                graph.addQuad(subject, RDF_PREDICATE_TYPE, this.shaclSubject)
            } else if (this.config.attributes.generateNodeShapeReference === 'dcterms:conformsTo') {
                graph.addQuad(subject, DCTERMS_PREDICATE_CONFORMS_TO, this.shaclSubject)
            }
        }
        return subject
    }
}

window.customElements.define('shacl-node', ShaclNode)
