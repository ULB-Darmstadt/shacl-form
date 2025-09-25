import { BlankNode, DataFactory, NamedNode, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { PREFIX_SHACL, RDF_PREDICATE_TYPE, OWL_PREDICATE_IMPORTS, SHACL_PREDICATE_PROPERTY, SHACL_PREDICATE_NODE } from './constants'
import { ShaclProperty } from './property'
import { createShaclGroup } from './group'
import { v4 as uuidv4 } from 'uuid'
import { createShaclOrConstraint, resolveShaclOrConstraintOnNode } from './constraints'
import { Config } from './config'

export class ShaclNode extends HTMLElement {
    parent: ShaclNode | undefined
    shaclSubject: NamedNode
    nodeId: NamedNode | BlankNode
    targetClass: NamedNode | undefined
    owlImports: NamedNode[] = []
    config: Config
    linked: boolean

    constructor(shaclSubject: NamedNode, config: Config, valueSubject: NamedNode | BlankNode | undefined, parent?: ShaclNode, nodeKind?: NamedNode, label?: string, linked?: boolean) {
        super()

        this.parent = parent
        this.config = config
        this.shaclSubject = shaclSubject
        this.linked = linked || false
        let nodeId: NamedNode | BlankNode | undefined = valueSubject
        if (!nodeId) {
            // if no value subject given, create new node id with a type depending on own nodeKind or given parent property nodeKind
            if (!nodeKind) {
                const spec = config.store.getObjects(shaclSubject, `${PREFIX_SHACL}nodeKind`, null)
                if (spec.length) {
                    nodeKind = spec[0] as NamedNode
                }
            }
            // if nodeKind is not set, but a value namespace is configured or if nodeKind is sh:IRI, then create a NamedNode
            if ((nodeKind === undefined && config.attributes.valuesNamespace) || nodeKind?.value === `${PREFIX_SHACL}IRI`) {
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
            label = label || "Link"
            const labelElem = document.createElement('label')
            labelElem.innerText = label
            labelElem.classList.add('linked')
            this.appendChild(labelElem)

            const anchor = document.createElement('a')
            let refId = (valueSubject.termType === 'BlankNode') ? '_:' + valueSubject.value : valueSubject.value
            anchor.innerText = refId
            anchor.classList.add('ref-link')
            anchor.onclick = () => {
                // if anchor is clicked, scroll referenced shacl node into view
                this.config.form.querySelector(`shacl-node[data-node-id='${refId}']`)?.scrollIntoView()
            }
            this.appendChild(anchor)
            this.style.flexDirection = 'row'
        } else {
            if (valueSubject) {
                config.renderedNodes.add(id)
            }
            this.dataset.nodeId = this.nodeId.id
            if (this.config.attributes.showNodeIds !== null) {
                const div = document.createElement('div')
                div.innerText = `id: ${this.nodeId.id}`
                div.classList.add('node-id-display')
                this.appendChild(div)
            }

            // first initialize owl:imports, this is needed before adding properties to properly resolve class instances etc.
            for (const owlImport of config.store.getQuads(shaclSubject, OWL_PREDICATE_IMPORTS, null, null)) {
                this.owlImports.push(owlImport.object as NamedNode)
            }
            // now parse other node quads
            for (const quad of config.store.getQuads(shaclSubject, null, null, null)) {
                switch (quad.predicate.id) {
                    case SHACL_PREDICATE_PROPERTY.id:
                        this.addPropertyInstance(quad.object, config, valueSubject)
                        break;
                    case `${PREFIX_SHACL}and`:
                        // inheritance via sh:and
                        const list = config.lists[quad.object.value]
                        if (list?.length) {
                            for (const shape of list) {
                                this.prepend(new ShaclNode(shape as NamedNode, config, valueSubject, this))
                            }
                        }
                        else {
                            console.error('list not found:', quad.object.value, 'existing lists:', config.lists)
                        }
                        break;
                    case SHACL_PREDICATE_NODE.id:
                        // inheritance via sh:node
                        this.prepend(new ShaclNode(quad.object as NamedNode, config, valueSubject, this))
                        break;
                    case `${PREFIX_SHACL}targetClass`:
                        this.targetClass = quad.object as NamedNode
                        break;
                    case `${PREFIX_SHACL}or`:
                        this.tryResolve(quad.object, valueSubject, config)
                        break;
                    case `${PREFIX_SHACL}xone`:
                        this.tryResolve(quad.object, valueSubject, config)
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
        // output triples only if node is not a link
        if (!this.linked) {
            for (const shape of this.querySelectorAll(':scope > shacl-node, :scope > .shacl-group > shacl-node, :scope > shacl-property, :scope > .shacl-group > shacl-property')) {
                (shape as ShaclNode | ShaclProperty).toRDF(graph, subject)
            }
            if (this.targetClass) {
                graph.addQuad(subject, RDF_PREDICATE_TYPE, this.targetClass, this.config.valuesGraphId)
            }
            // if this is the root shacl node, check if we should add one of the rdf:type or dcterms:conformsTo predicates
            if (this.config.attributes.generateNodeShapeReference && !this.parent) {
                graph.addQuad(subject, DataFactory.namedNode(this.config.attributes.generateNodeShapeReference), this.shaclSubject, this.config.valuesGraphId)
            }
        }
        return subject
    }

    addPropertyInstance(shaclSubject: Term, config: Config, valueSubject: NamedNode | BlankNode | undefined) {
        let parentElement: HTMLElement = this
        // check if property belongs to a group
        const groupRef = config.store.getQuads(shaclSubject as Term, `${PREFIX_SHACL}group`, null, null)
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
        const property = new ShaclProperty(shaclSubject as NamedNode | BlankNode, this, config, valueSubject)
        // do not add empty properties (i.e. properties with no instances). This can be the case e.g. in viewer mode when there is no data for the respective property.
        if (property.childElementCount > 0) {
            parentElement.appendChild(property)
        }
    }

    tryResolve(subject: Term, valueSubject: NamedNode | BlankNode | undefined, config: Config) {
        const list = config.lists[subject.value]
        if (list?.length) {
            let resolved = false
            if (valueSubject) {
                const resolvedPropertySubjects = resolveShaclOrConstraintOnNode(list, valueSubject, config)
                if (resolvedPropertySubjects.length) {
                    for (const propertySubject of resolvedPropertySubjects) {
                        this.addPropertyInstance(propertySubject, config, valueSubject)
                    }
                    resolved = true
                }
            }
            if (!resolved) {
                this.appendChild(createShaclOrConstraint(list, this, config))
            }
        }
        else {
            console.error('list for sh:or/sh:xone not found:', subject, 'existing lists:', config.lists)
        }
    }
}

window.customElements.define('shacl-node', ShaclNode)