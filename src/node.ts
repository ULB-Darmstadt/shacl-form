import { BlankNode, NamedNode, Store } from 'n3'
import { PREFIX_SHACL, PREFIX_RDF, PREFIX_RDFS } from './prefixes'
import { ShaclProperty } from './property'
import { ShaclForm } from './form'
import { findObjectValueByPredicate } from './util'
import { ShaclGroup } from './group'
import { v4 as uuidv4 } from 'uuid'

export class ShaclNode extends HTMLElement {
    shaclSubject: NamedNode
    exportValueSubject: NamedNode | BlankNode
    targetClass: NamedNode | undefined
    parent: ShaclNode | ShaclProperty | undefined
    form: ShaclForm

    constructor(form: ShaclForm, shaclSubject: NamedNode, parent: ShaclNode | ShaclProperty | undefined, valueSubject: NamedNode | BlankNode | undefined) {
        super()

        this.form = form
        this.parent = parent
        this.shaclSubject = shaclSubject
        const quads = form.config.shapesGraph.getQuads(shaclSubject, null, null, null)
        const targetClass = findObjectValueByPredicate(quads, 'targetClass')
        if (targetClass) {
            this.targetClass = new NamedNode(targetClass)
        }
        if (valueSubject) {
            this.exportValueSubject = valueSubject
        }
        else {
            this.exportValueSubject = new BlankNode(uuidv4())
        }
        this.dataset.nodeId = this.exportValueSubject.id

        const shaclProperties = form.config.shapesGraph.getQuads(shaclSubject, `${PREFIX_SHACL}property`, null, null)
        if (shaclProperties.length == 0) {
            console.warn('node shape', shaclSubject, 'has no shacl properties')
        }
        else {
            if (parent instanceof ShaclProperty) {
                let label = parent.name
                if (!label) {
                    label = findObjectValueByPredicate(quads, 'label', PREFIX_RDFS, form.config.language)
                    if (!label) {
                        label = targetClass ? targetClass : shaclSubject.value
                    }
                }
                const header = document.createElement('h1')
                header.innerText = label
                this.appendChild(header)
            }

            const inheritedShapes: NamedNode[] = []
            // check shape inheritance via sh:and
            const listSubject = findObjectValueByPredicate(quads, 'and')
            if (listSubject) {
                const list = form.config.lists[listSubject]
                if (list) {
                    inheritedShapes.push(...list as NamedNode[])
                }
                else {
                    console.error('list not found:', listSubject, 'existing lists:', form.config.lists)
                }
            }
            // check shape inheritance via sh:node
            const nodes = form.config.shapesGraph.getQuads(shaclSubject, `${PREFIX_SHACL}node`, null, null)
            for (const node of nodes) {
                inheritedShapes.push(node.object as NamedNode)
            }

            for (const shape of inheritedShapes) {
                this.appendChild(new ShaclNode(form, shape as NamedNode, this, valueSubject))
            }

            for (const shaclProperty of shaclProperties) {
                if (shaclProperty.object instanceof NamedNode || shaclProperty.object instanceof BlankNode) {
                    let parent: HTMLElement = this
                    // check if property belongs to a group
                    const groupRef = form.config.shapesGraph.getQuads(shaclProperty.object, `${PREFIX_SHACL}group`, null, null)
                    if (groupRef.length > 0) {
                        const groupSubject = groupRef[0].object.value
                        if (form.config.groups.indexOf(groupSubject) > -1) {
                            let group = this.querySelector(`:scope > shacl-group[data-subject='${groupSubject}']`) as ShaclGroup
                            if (!group) {
                                group = new ShaclGroup(groupSubject, form.config)
                                this.appendChild(group)
                            }
                            parent = group
                        } else {
                            console.warn('ignoring unknown group reference', groupRef[0])
                        }
                    }

                    parent.appendChild(new ShaclProperty(form, shaclProperty.object, valueSubject))
                }
                else {
                    console.warn('ignoring unexpected property type', shaclProperty.object)
                }
            }
        }
    }

    toRDF(graph: Store, subject?: NamedNode | BlankNode): (NamedNode | BlankNode) {
        if (!subject) {
            subject = this.exportValueSubject
        }
        const quadCount = graph.size
        for (const shape of this.querySelectorAll(':scope > shacl-node, :scope > shacl-group > shacl-node, :scope > shacl-property, :scope > shacl-group > shacl-property')) {
            (shape as ShaclNode | ShaclProperty).toRDF(graph, subject)
        }
        if (this.targetClass) {
            graph.addQuad(subject, new NamedNode(PREFIX_RDF + "type"), this.targetClass)
        }
        if (!this.parent) {
            graph.addQuad(subject, new NamedNode(PREFIX_RDF + "type"), this.shaclSubject)
        }
        return subject
    }
}

window.customElements.define('shacl-node', ShaclNode)
