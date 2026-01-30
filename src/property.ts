import { BlankNode, DataFactory, Literal, NamedNode, Quad, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from './node'
import { createShaclOrConstraint, resolveShaclOrConstraintOnProperty } from './constraints'
import { filterOutExistingItems, findLinkCandidates, focusFirstInputElement } from './util'
import { aggregatedMinCount, cloneProperty, mergeQuads, ShaclPropertyTemplate } from './property-template'
import { Editor, fieldFactory } from './theme'
import { toRDF } from './serialize'
import { findPlugin } from './plugin'
import { DATA_GRAPH } from './constants'
import { RokitButton, RokitCollapsible, RokitSelect } from '@ro-kit/ui-widgets'
import { loadClassInstances, loadShapeInstances } from './loader'

export class ShaclProperty extends HTMLElement {
    template: ShaclPropertyTemplate
    container: HTMLElement
    parent: ShaclNode

    constructor(template: ShaclPropertyTemplate, parent: ShaclNode) {
        super()
        this.template = template
        this.parent = parent
        this.container = this
        if (this.template.nodeShapes.size && this.template.config.attributes.collapse !== null && (this.template.maxCount === undefined || this.template.maxCount > 1)) {
            const collapsible = new RokitCollapsible()
            collapsible.classList.add('collapsible', 'shacl-group');
            collapsible.open = template.config.attributes.collapse === 'open';
            collapsible.label = this.template.label;
            this.container = collapsible
            this.appendChild(this.container)
        }

        if (this.template.order !== undefined) {
            this.style.order = `${this.template.order}`
        }
        if (this.template.cssClass) {
            this.classList.add(this.template.cssClass)
        }
        if (template.config.editMode && !parent.linked) {
            this.container.appendChild(this.createAddButton())
            this.addEventListener('change', () => { this.updateControls() })
        }
    }

    // binds data graph triples to form fields and (if present) creates missing sh:hasValue form field
    async bindValues(valueSubject: NamedNode | BlankNode | undefined, multiValuedPath?: boolean) {
        if (this.template.path) {
            let valuesContainHasValue = false
            if (valueSubject) {
                // for linked resource, get values in all graphs, otherwise only from data graph
                let values = this.template.config.store.getQuads(valueSubject, this.template.path, null, this.parent.linked ? null : DATA_GRAPH)
                // if we have values, conditionally invoke data provider to load class and/or shape instances
                if (values.length > 0) {
                    await this.loadInstances(this.getInstancesToLoad())
                }
                if (multiValuedPath) {
                    // ignore values that do not conform to this property. this might be the case when there are multiple properties with the same sh:path in a NodeShape (i.e. sh:qualifiedValueShape).
                    values = await this.filterValidValues(values, valueSubject)
                }
                for (const value of values) {
                    // remove quad from data graph to prevent double binding if value is not linked
                    if (!this.parent.linked) {
                        this.template.config.store.delete(value)
                    }
                    // if value is not in data graph, then it is a linked resource
                    await this.addPropertyInstance(value.object, !DATA_GRAPH.equals(value.graph))
                    if (this.template.hasValue && value.object.equals(this.template.hasValue)) {
                        valuesContainHasValue = true
                    }
                }
            }
            if (this.template.config.editMode) {
                if (this.template.hasValue && !valuesContainHasValue && !this.parent.linked) {
                    // sh:hasValue is defined in shapes graph, but does not exist in data graph, so force it
                    await this.addPropertyInstance(this.template.hasValue)
                }
                this.updateControls()
            }
        }
    }

    async addPropertyInstance(value?: Term, linked?: boolean): Promise<HTMLElement> {
        let instance: HTMLElement
        if (this.template.or?.length || this.template.xone?.length) {
            const options = this.template.or?.length ? this.template.or : this.template.xone as Term[]
            let resolved = false
            if (value) {
                const resolvedOptions = resolveShaclOrConstraintOnProperty(options, value, this.template.config)
                if (resolvedOptions.length) {
                    const merged = mergeQuads(cloneProperty(this.template), resolvedOptions)
                    instance = await createPropertyInstance(merged, value, !this.parent.linked, this.parent.linked)
                    resolved = true
                }
            }
            if (!resolved) {
                instance = createShaclOrConstraint(options, this, this.template.config)
                appendRemoveButton(instance, '', this.template.config.theme.dense, this.template.config.hierarchyColorsStyleSheet !== undefined)
            }
        } else {
            instance = await createPropertyInstance(this.template, value, false, linked || this.parent.linked)
        }
        const addButton = this.querySelector(':scope > .add-button')
        if (addButton) {
            this.container.insertBefore(instance!, addButton)
        } else {
            this.container.appendChild(instance!)
        }
        return instance!
    }

    updateControls() {
        // setTimeout() is needed to let a newly added instance to arrive in the DOM first
        setTimeout(() => {
            const minCount = aggregatedMinCount(this.template)
            const literal = this.template.nodeShapes.size === 0
            let instanceCount = this.instanceCount()
            if (instanceCount === 0 && literal) {
                    this.addPropertyInstance()
                    instanceCount = 1
            }
            if (!literal) {
                this.querySelector(':scope > .add-button')?.classList.toggle('required', instanceCount < minCount)
            }

            let mayRemove: boolean
            if (minCount > 0) {
                mayRemove = instanceCount > minCount
            } else {
                mayRemove = this.template.nodeShapes.size > 0 || instanceCount > 1
            }

            const mayAdd = this.template.maxCount === undefined || instanceCount < this.template.maxCount
            this.classList.toggle('may-remove', mayRemove)
            this.classList.toggle('may-add', mayAdd)
        })
    }

    instanceCount() {
        return this.querySelectorAll(":scope > .property-instance, :scope > .shacl-or-constraint, :scope > shacl-node, :scope > .collapsible > .property-instance").length
    }

    toRDF(graph: Store, subject: NamedNode | BlankNode) {
        const pathNode = DataFactory.namedNode(this.template.path!)
        for (const instance of this.querySelectorAll(':scope > .property-instance, :scope > .collapsible > .property-instance')) {
            if (instance.firstChild instanceof ShaclNode) {
                const shapeSubject = instance.firstChild.toRDF(graph)
                graph.addQuad(subject, pathNode, shapeSubject, this.template.config.valuesGraphId)
            } else {
                if (this.template.config.editMode) {
                    for (const editor of instance.querySelectorAll<Editor>(':scope > .editor')) {
                        const value = toRDF(editor)
                        if (value) {
                            graph.addQuad(subject, pathNode, value, this.template.config.valuesGraphId)
                        }
                    }
                }
                else {
                    const value = toRDF(instance as Editor)
                    if (value) {
                        graph.addQuad(subject, pathNode, value, this.template.config.valuesGraphId)
                    }
                }
            }
        }
    }

    async filterValidValues(values: Quad[], valueSubject: NamedNode | BlankNode) {
        // if this property is a sh:qualifiedValueShape, then filter values by validating against this shape
        let nodeShapeToValidate = this.template.id
        let dataSubjectsToValidate = [valueSubject]
        if (this.template.qualifiedValueShape) {
            nodeShapeToValidate = this.template.qualifiedValueShape.id
            dataSubjectsToValidate = []
            for (const value of values) {
                dataSubjectsToValidate.push(value.object as NamedNode)
            }
        }
        const report = await this.template.config.validator.validate({ dataset: this.template.config.store, terms: dataSubjectsToValidate }, [{ terms: [nodeShapeToValidate] }])
        const invalidTerms: string[] = []
        for (const result of report.results) {
            const reportObject = this.template.qualifiedValueShape ? result.focusNode : result.value
            if (reportObject?.ptrs?.length) {
                invalidTerms.push(reportObject.ptrs[0]._term.id)
            }
        }
        return values.filter(value => {
            return invalidTerms.indexOf(value.object.id) === -1
        })
    }

    createAddButton() {
        const applyButtonLogic = () => {
            // load potential value candidates for linking and filter out already bound ones
            const instances = findLinkCandidates(this.template).filter(instance => {
                const id = (instance.value as NamedNode | BlankNode).id
                return this.querySelector(`:scope > .property-instance > shacl-node[data-node-id='${id}'], :scope > .collapsible > .property-instance > shacl-node[data-node-id='${id}']`) === null
            })
            if (instances.length === 0) {
                // no class instances found, so create an add button that creates a new instance
                const addButton = this.template.config.theme.createButton('+ ' + this.template.label, false)
                addButton.title = 'Add ' + this.template.label
                addButton.classList.add('add-button')
                addButton.setAttribute('text', '')
                addButton.addEventListener('click', async () => {
                    const instance = await this.addPropertyInstance()
                    instance.classList.add('fadeIn')
                    this.updateControls()
                    setTimeout(() => {
                        focusFirstInputElement(instance)
                        instance.classList.remove('fadeIn')
                    }, 200)
                })
                return addButton
            } else {
                const addButton = new RokitSelect()
                addButton.label = "+ " + this.template.label
                addButton.title = 'Add ' + this.template.label
                addButton.dense = this.template.config.theme.dense
                addButton.autoGrowLabelWidth = true
                addButton.classList.add('add-button')

                // some instances found, so create an add button that can create a new instance or link existing ones
                const ul = document.createElement('ul')
                const newItem = document.createElement('li')
                newItem.innerHTML = '&#xFF0B; Create new ' + this.template.label + '...'
                newItem.dataset.value = 'new'
                newItem.classList.add('large')
                ul.appendChild(newItem)
                const divider = document.createElement('li')
                divider.classList.add('divider')
                ul.appendChild(divider)
                const header = document.createElement('li')
                header.classList.add('header')
                header.innerText = 'Or link existing:'
                ul.appendChild(header)
                for (const instance of instances) {
                    const li = document.createElement('li')
                    const itemValue = (typeof instance.value === 'string') ? instance.value : instance.value.value
                    li.innerText = instance.label ? instance.label : itemValue
                    li.dataset.value = JSON.stringify(instance.value)
                    ul.appendChild(li)
                }
                addButton.appendChild(ul)
                addButton.collapsibleWidth = '250px'
                addButton.collapsibleOrientationLeft = ''
                addButton.addEventListener('change', async () => {
                    if (addButton.value === 'new') {
                        // user wants to create a new instance
                        this.addPropertyInstance()
                    } else {
                        // user wants to link existing instance
                        const value = JSON.parse(addButton.value) as Term
                        const instance = await createPropertyInstance(this.template, value, true, true)
                        this.container.insertBefore(instance, addButton)
                    }
                    addButton.value = ''
                })
                return addButton
            }
        }

        const instancesToLoad = this.getInstancesToLoad()
        if (instancesToLoad) {
            const btn = this.template.config.theme.createButton('+ ' + this.template.label, false)
            btn.title = 'Add ' + this.template.label
            btn.classList.add('add-button')
            btn.setAttribute('text', '')
            btn.addEventListener('click', async () => {
                btn.classList.add('loading')
                btn.title = 'Loading...'
                setTimeout(async () => {
                    await this.loadInstances(instancesToLoad)
                    const addButton = applyButtonLogic()
                    btn.replaceWith(addButton)
                    setTimeout(() => {
                        addButton.focus()
                        addButton.click()
                        this.updateControls()
                    })
                })
            })
            return btn
        } else {
            return applyButtonLogic()
        }
    }

    getInstancesToLoad() {
        if (!this.template.config.dataProvider?.lazyLoad) {
            return
        }
        let shapeInstancesToLoad = new Set<string>()
        if (this.template.nodeShapes.size > 0 && this.template.config.dataProvider?.shapeInstances !== undefined) {
            shapeInstancesToLoad = filterOutExistingItems(Object.keys(this.template.config.loadedShapeInstances), new Set([...this.template.nodeShapes].map(shape => shape.id.value)))
        }

        let classInstancesToLoad = new Set<string>()
        if (this.template.class) {
            classInstancesToLoad = filterOutExistingItems(this.template.config.loadedClassInstances, new Set([this.template.class.id]))
        }
        return { shapes: shapeInstancesToLoad, classes: classInstancesToLoad }
    }

    async loadInstances(instances: {shapes: Set<string>, classes: Set<string>} | undefined) {
        if (instances) {
            await loadClassInstances(instances.classes, this.template.config)
            await loadShapeInstances(instances.shapes, this.template.config)
        }
    }

}

export async function createPropertyInstance(template: ShaclPropertyTemplate, value?: Term, forceRemovable = false, linked = false): Promise<HTMLElement> {
    let instance: HTMLElement
    if (template.nodeShapes.size) {
        instance = document.createElement('div')
        instance.classList.add('property-instance')
        for (const shape of template.nodeShapes) {
            const node = new ShaclNode(shape, value as NamedNode | BlankNode | undefined, template.nodeKind, template.label, linked)
            instance.appendChild(node)
            await node.ready
        }
    } else {
        const plugin = findPlugin(template.path, template.datatype?.value)
        if (plugin) {
            if (template.config.editMode && !linked) {
                instance = plugin.createEditor(template, value)
            } else {
                instance = plugin.createViewer(template, value!)
            }
        } else {
            instance = fieldFactory(template, value || null, template.config.editMode && !linked)
        }
        // count as property-instance only if not empty
        if (instance.childNodes.length > 0) {
            instance.classList.add('property-instance')
        }
        if (linked) {
            instance.classList.add('linked')
        }
    }
    if (template.config.editMode && (!linked || forceRemovable)) {
        appendRemoveButton(instance, template.label, template.config.theme.dense, template.config.hierarchyColorsStyleSheet !== undefined, forceRemovable)
    } else if (!template.config.editMode && template.config.hierarchyColorsStyleSheet !== undefined) {
        // in colorized view mode, add remove button wrapper only
        instance.appendChild(createRemoveButtonWrapper(true))
    }

    if (value && !template.config.editMode) {
        // in view mode, still enable RDF serialization of the form
        if (value instanceof Literal) {
            instance.dataset.value = value.value
            if (value.language.length > 0) {
                instance.dataset.lang = value.language
            } else {
                (instance as Editor).shaclDatatype = value.datatype
            }
        } else {
            // assuming NamedNodes here
            instance.dataset.value = '<' + value.value + '>'
        }
    }

    instance.dataset.path = template.path
    return instance
}

function appendRemoveButton(instance: HTMLElement, label: string, dense: boolean, colorize: boolean, forceRemovable = false) {
    const wrapper = createRemoveButtonWrapper(colorize)
    const removeButton = new RokitButton()
    removeButton.classList.add('remove-button', 'clear')
    removeButton.title = 'Remove ' + label
    removeButton.dense = dense
    removeButton.icon = true
    removeButton.addEventListener('click', () => {
        instance.classList.remove('fadeIn')
        instance.classList.add('fadeOut')
        setTimeout(() => {
            const parent = instance.parentElement
            instance.remove()
            parent?.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
        }, 200)
    })
    if (forceRemovable) {
        removeButton.classList.add('persistent')
    }
    wrapper.appendChild(removeButton)
    instance.appendChild(wrapper)
}

function createRemoveButtonWrapper(colorize: boolean) {
    const wrapper = document.createElement('div')
    wrapper.className = 'remove-button-wrapper'
    if (colorize) {
        wrapper.classList.add('colorize')
    }
    return wrapper
}

window.customElements.define('shacl-property', ShaclProperty)
