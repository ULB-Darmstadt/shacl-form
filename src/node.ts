import { BlankNode, DataFactory, NamedNode, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { PREFIX_SHACL, RDF_PREDICATE_TYPE } from './constants'
import { ShaclProperty } from './property'
import { createShaclGroup } from './group'
import { v4 as uuidv4 } from 'uuid'
import { createShaclOrConstraint, resolveShaclOrConstraintOnNode } from './constraints'
import { Config } from './config'
import { ShaclNodeTemplate } from './node-template'
import { ShaclPropertyTemplate } from './property-template'

export class ShaclNode extends HTMLElement {
    nodeId: NamedNode | BlankNode
    template: ShaclNodeTemplate
    linked: boolean

    constructor(template: ShaclNodeTemplate, valueSubject: NamedNode | BlankNode | undefined, nodeKind?: NamedNode, label?: string, linked?: boolean) {
        super()
        this.template = template
        this.linked = linked ?? false
        let nodeId: NamedNode | BlankNode | undefined = valueSubject
        if (!nodeId) {
            // if no value subject given, create new node id with a type depending on own nodeKind or given parent property nodeKind
            if (!nodeKind && template.nodeKind) {
                nodeKind = template.nodeKind
            }
            // if nodeKind is not set, but a value namespace is configured or if nodeKind is sh:IRI, then create a NamedNode
            if ((nodeKind === undefined && template.config.attributes.valuesNamespace) || nodeKind?.value === `${PREFIX_SHACL}IRI`) {
                // no requirements on node type, so create a NamedNode and use configured value namespace
                nodeId = DataFactory.namedNode(template.config.attributes.valuesNamespace + uuidv4())
            } else {
                // otherwise create a BlankNode
                nodeId = DataFactory.blankNode(uuidv4())
            }
        }
        this.nodeId = nodeId

        // check if the form already contains the node/value pair to prevent recursion
        const id = JSON.stringify([template.id, valueSubject])
        if (valueSubject && template.config.renderedNodes.has(id)) {
            // node/value pair is already rendered in the form, so just display a reference
            label = label || "Link"
            const labelElem = document.createElement('label')
            labelElem.innerText = label
            labelElem.classList.add('linked')
            this.appendChild(labelElem)

            const anchor = document.createElement('a')
            const refId = (valueSubject.termType === 'BlankNode') ? '_:' + valueSubject.value : valueSubject.value
            anchor.innerText = refId
            anchor.classList.add('ref-link')
            anchor.onclick = () => {
                // if anchor is clicked, scroll referenced shacl node into view
                this.template.config.form.querySelector(`shacl-node[data-node-id='${refId}']`)?.scrollIntoView()
            }
            this.appendChild(anchor)
            this.style.flexDirection = 'row'
        } else {
            if (valueSubject) {
                template.config.renderedNodes.add(id)
            }
            this.dataset.nodeId = this.nodeId.id
            if (this.template.config.attributes.showNodeIds !== null) {
                const div = document.createElement('div')
                div.innerText = `id: ${this.nodeId.id}`
                div.classList.add('node-id-display')
                this.appendChild(div)
            }
            (async () => {
                // first output this shape's properties and then create extended shapes. this ensures that the values graph is bound to the most specific property.
                for (const [_, properties] of Object.entries(template.properties)) {
                    for (const property of properties) {
                        await this.addPropertyInstance(property, valueSubject, properties.length > 1)
                    }
                }
                for (const shape of template.extendedShapes) {
                    this.prepend(new ShaclNode(shape, valueSubject, undefined, undefined, linked))
                }
                if (template.or?.length) {
                    await this.tryResolve(template.or, valueSubject, template.config)
                }
                if (template.xone?.length) {
                    await this.tryResolve(template.xone, valueSubject, template.config)
                }
                if (label) {
                    const header = document.createElement('h1')
                    header.innerText = label
                    this.prepend(header)
                }
            })()
        }
    }

    toRDF(graph: Store, subject?: NamedNode | BlankNode, generateNodeShapeReference = ''): (NamedNode | BlankNode) {
        if (!subject) {
            subject = this.nodeId
        }
        // output triples only if node is not a link
        if (!this.linked) {
            for (const shape of this.querySelectorAll(':scope > shacl-node, :scope > .shacl-group > shacl-node, :scope > shacl-property, :scope > .shacl-group > shacl-property')) {
                (shape as ShaclNode | ShaclProperty).toRDF(graph, subject)
            }
            if (this.template.targetClass) {
                graph.addQuad(subject, RDF_PREDICATE_TYPE, this.template.targetClass, this.template.config.valuesGraphId)
            }
            // if this is the root shacl node, add e.g. dcterms:conformsTo predicate
            if (generateNodeShapeReference) {
                graph.addQuad(subject, DataFactory.namedNode(generateNodeShapeReference), this.template.id as NamedNode, this.template.config.valuesGraphId)
            }
        }
        return subject
    }

    async addPropertyInstance(template: ShaclPropertyTemplate, valueSubject: NamedNode | BlankNode | undefined, multiValuedPath?: boolean) {
        let container: HTMLElement | null = null
        // check if property belongs to a group
        if (template.group) {
            if (template.config.groups.indexOf(template.group) > -1) {
                // check if group element already exists, otherwise create it
                let group = this.querySelector(`:scope > .shacl-group[data-subject='${template.group}']`) as HTMLElement
                if (!group) {
                    group = createShaclGroup(template.group, template.config)
                    this.appendChild(group)
                }
                container = group
            } else {
                console.warn('ignoring unknown group reference', template.group, 'existing groups:', template.config.groups)
            }
        }
        const property = new ShaclProperty(template, this)
        await property.bindValues(valueSubject, multiValuedPath)

        // do not add empty properties (i.e. properties with no instances). This can be the case e.g. in viewer mode when there is no data for the respective property.
        if (template.config.editMode || property.instanceCount() > 0) {
            if (container) {
                container.appendChild(property)
            } else {
                this.appendChild(property)
            }
            property.updateControls()
        }
    }

    async tryResolve(options: Term[], valueSubject: NamedNode | BlankNode | undefined, config: Config) {
        let resolved = false
        if (valueSubject) {
            const resolvedPropertySubjects = resolveShaclOrConstraintOnNode(options, valueSubject, config)
            if (resolvedPropertySubjects.length) {
                for (const propertySubject of resolvedPropertySubjects) {
                   await this.addPropertyInstance(config.getPropertyTemplate(propertySubject, this.template), valueSubject)
                }
                resolved = true
            }
        }
        if (!resolved) {
            this.appendChild(createShaclOrConstraint(options, this, config))
        }
    }
}

window.customElements.define('shacl-node', ShaclNode)
