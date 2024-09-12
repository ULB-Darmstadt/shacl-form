import { BlankNode, DataFactory, NamedNode, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { PREFIX_SHACL, RDF_PREDICATE_TYPE, OWL_PREDICATE_IMPORTS } from './constants'
import { ShaclProperty } from './property'
import { createShaclGroup } from './group'
import { v4 as uuidv4 } from 'uuid'
import { createShaclOrConstraint } from './constraints'
import { Config } from './config'

export class ShaclNode extends HTMLElement {
    parent: ShaclNode | undefined
    shaclSubject: NamedNode
    nodeId: NamedNode | BlankNode
    targetClass: NamedNode | undefined
    owlImports: NamedNode[] = []
    config: Config

    constructor(shaclSubject: NamedNode, config: Config, valueSubject: NamedNode | BlankNode | undefined, parent?: ShaclNode, nodeKind?: NamedNode, label?: string) {
        super()

        this.parent = parent
        this.config = config
        this.shaclSubject = shaclSubject
        let nodeId: NamedNode | BlankNode | undefined = valueSubject
        if (!nodeId) {
            // if no value subject given, create new node id with a type depending on own nodeKind or given parent property nodeKind
            if (!nodeKind) {
                const spec = config.shapesGraph.getObjects(shaclSubject, `${PREFIX_SHACL}nodeKind`, null)
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
            const anchor = document.createElement('a')
            anchor.innerText = valueSubject.id
            anchor.classList.add('ref-link')
            anchor.onclick = () => {
                // if anchor is clicked, scroll referenced shacl node into view
                this.config.form.querySelector(`shacl-node[data-node-id='${this.nodeId.id}']`)?.scrollIntoView()
            }
            this.appendChild(anchor)
            this.style.flexDirection = 'row'
        } else {
            if (valueSubject) {
                config.renderedNodes.add(id)
            }
            this.dataset.nodeId = this.nodeId.id
            const quads = config.shapesGraph.getQuads(shaclSubject, null, null, null)
            let list: Term[] | undefined

            if (this.config.attributes.showNodeIds !== null) {
                const div = document.createElement('div')
                div.innerText = `id: ${this.nodeId.id}`
                div.classList.add('node-id-display')
                this.appendChild(div)
            }

            for (const quad of quads) {
                switch (quad.predicate.id) {
                    case `${PREFIX_SHACL}property`:
                        let parentElement: HTMLElement = this
                        // check if property belongs to a group
                        const groupRef = config.shapesGraph.getQuads(quad.object as Term, `${PREFIX_SHACL}group`, null, null)
                        if (groupRef.length > 0) {
                            const groupSubject = groupRef[0].object.value
                            if (config.groups.indexOf(groupSubject) > -1) {
                                // check if group element already exists, otherwise create it
                                let group = this.querySelector(`:scope > .shacl-group[data-subject='${groupSubject}']`) as HTMLElement
                                if (!group) {
                                    group = createShaclGroup(groupSubject, config)
                                    this.appendChild(group)
                                }
                                parentElement = group
                            } else {
                                console.warn('ignoring unknown group reference', groupRef[0], 'existing groups:', config.groups)
                            }
                        }
                        // delay creating/appending the property until we finished parsing the node.
                        // This is needed to have possible owlImports parsed before creating the property.
                        setTimeout(() => {
                            const property = new ShaclProperty(quad.object as NamedNode | BlankNode, this, config, valueSubject)
                            // do not add empty properties (i.e. properties with no instances). This can be the case e.g. in viewer mode when there is no data for the respective property.
                            if (property.childElementCount > 0) {
                                parentElement.appendChild(property)
                            }
                        })
                        break;
                    case `${PREFIX_SHACL}and`:
                        // inheritance via sh:and
                        list = config.lists[quad.object.value]
                        if (list?.length) {
                            for (const shape of list) {
                                this.prepend(new ShaclNode(shape as NamedNode, config, valueSubject, this))
                            }
                        }
                        else {
                            console.error('list not found:', quad.object.value, 'existing lists:', config.lists)
                        }
                        break;
                    case `${PREFIX_SHACL}node`:
                        // inheritance via sh:node
                        this.prepend(new ShaclNode(quad.object as NamedNode, config, valueSubject, this))
                        break;
                    case `${PREFIX_SHACL}targetClass`:
                        this.targetClass = quad.object as NamedNode
                        break;
                    case OWL_PREDICATE_IMPORTS.id:
                        this.owlImports.push(quad.object as NamedNode)
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
        if (this.config.attributes.generateNodeShapeReference && !this.parent) {
            graph.addQuad(subject, DataFactory.namedNode(this.config.attributes.generateNodeShapeReference), this.shaclSubject)
        }
        return subject
    }
}

window.customElements.define('shacl-node', ShaclNode)
