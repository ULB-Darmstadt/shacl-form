import type { ShaclForm } from '../form.js'
import { ShaclNode } from '../node.js'
import { ShaclProperty, createRemoveButtonWrapper } from '../property.js'
import { createShaclOrConstraint } from '../constraints.js'
import { cloneProperty, mergeQuads, ShaclPropertyTemplate } from '../property-template.js'
import { findPlugin } from '../plugin.js'
import { createQueryEditor } from './editor.js'
import type { Query, QueryEditor, QueryFacet } from './index.js'
import queryModeCss from './mode.css?raw'
import { FRACTIONAL_DATATYPES, NUMERIC_DATATYPES } from '../constants.js'


let nextQueryFieldId = 0

export class QueryModeController {
    readonly stylesheet = new CSSStyleSheet()
    private readonly host: ShaclForm
    private facetAbortController?: AbortController
    private facetRequest = 0
    private facetsApplied = false

    constructor(host: ShaclForm) {
        this.host = host
        this.stylesheet.replaceSync(queryModeCss)
        if (host.config.queryFacetProvider) {
            this.setFacetsPending(true)
        }
    }

    async initialize(): Promise<void> {
        await this.emitQueryAndRefreshFacets()
    }

    handleChange(): void {
        void this.emitQueryAndRefreshFacets()
    }

    getQuery(): Query {
        const shape = this.host.shape
        if (!shape) {
            return { rootShapeId: '', criteria: [] }
        }
        return {
            rootShapeId: shape.template.id.value,
            targetClass: shape.template.targetClass?.value,
            criteria: Array.from(this.host.form.querySelectorAll<QueryEditor>('.query-editor'))
                .flatMap(editor => editor.getQueryCriteria())
        }
    }

    refreshFacets(): void {
        if (this.host.shape) {
            void this.requestFacets(this.getQuery())
        }
    }

    dispose(): void {
        this.facetAbortController?.abort()
        this.setFacetsPending(false)
        this.host.classList.remove('query-facets-empty')
    }

    private async emitQueryAndRefreshFacets(): Promise<void> {
        if (!this.host.shape) {
            return
        }
        const query = this.getQuery()
        this.host.dispatchEvent(new CustomEvent<Query>('query', { bubbles: true, composed: true, detail: query }))
        await this.requestFacets(query)
    }

    private async requestFacets(query: Query): Promise<void> {
        const provider = this.host.config.queryFacetProvider
        if (!provider) {
            return
        }
        this.facetAbortController?.abort()
        const controller = new AbortController()
        this.facetAbortController = controller
        const requestId = ++this.facetRequest
        if (!this.facetsApplied) {
            this.setFacetsPending(true)
        }
        try {
            const fields = Array.from(this.host.form.querySelectorAll<QueryEditor>('.query-editor'))
                .map(editor => editor.queryField)
            const facets = await provider.getFacets({ query, fields, signal: controller.signal })
            if (controller.signal.aborted || requestId !== this.facetRequest) {
                return
            }
            this.applyFacets(facets)
            this.facetsApplied = true
            this.setFacetsPending(false)
        } catch (error) {
            if (controller.signal.aborted) {
                return
            }
            this.setFacetsPending(false)
            this.host.dispatchEvent(new CustomEvent('queryerror', { bubbles: true, composed: true, detail: error }))
        }
    }

    private applyFacets(facets: QueryFacet[]): void {
        const byField = new Map(facets.map(facet => [facet.fieldId, facet]))
        for (const editor of Array.from(this.host.form.querySelectorAll<QueryEditor>('.query-editor'))) {
            const facet = byField.get(editor.queryField.id)
            const active = editor.getQueryCriteria().length > 0
            editor.setQueryFacet(facet)
            const property = editor.closest('shacl-property')
            property?.classList.toggle('query-unavailable', facet?.count === 0 && !active)
            property?.classList.toggle('query-facet-error', facet?.error === true)
        }
        const structuralProperties = Array.from(this.host.form.querySelectorAll('shacl-property')).reverse()
        for (const property of structuralProperties) {
            if (property.querySelector(':scope > .query-editor, :scope > .collapsible > .query-editor')) {
                continue
            }
            const hasAvailableLeaf = Array.from(property.querySelectorAll<QueryEditor>('.query-editor')).some(editor =>
                !editor.closest('shacl-property')?.classList.contains('query-unavailable')
            )
            property.classList.toggle('query-unavailable', !hasAvailableLeaf)
        }
        const hasAvailableFilter = Array.from(this.host.form.querySelectorAll<QueryEditor>('.query-editor')).some(editor =>
            !editor.closest('shacl-property')?.classList.contains('query-unavailable')
        )
        this.host.classList.toggle('query-facets-empty', !hasAvailableFilter)
    }

    private setFacetsPending(pending: boolean): void {
        this.host.toggleAttribute('loading', pending)
        const loading = this.host.form.querySelector('[part~="loading"]')
        if (!pending) {
            loading?.remove()
        } else if (!loading) {
            const indicator = document.createElement('div')
            indicator.setAttribute('part', 'loading')
            indicator.textContent = this.host.config.attributes.loading
            this.host.form.prepend(indicator)
        }
    }
}

export async function initializeQueryProperty(property: ShaclProperty): Promise<void> {
    const template = property.template
    if (template.or?.length || template.xone?.length) {
        const numericAlternative = resolveNumericAlternative(template)
        if (numericAlternative) {
            property.container.appendChild(createQueryLeaf(numericAlternative, property.parent))
            return
        }
        const options = template.or?.length ? template.or : template.xone!
        property.container.appendChild(createShaclOrConstraint(options, property, template.config))
        return
    }
    if (!template.nodeShapes.size) {
        property.container.appendChild(createQueryLeaf(template, property.parent))
        return
    }
    for (const shape of template.nodeShapes) {
        const ancestorShapeIds = new Set(property.parent.ancestorShapeIds)
        ancestorShapeIds.add(property.parent.template.id.value)
        if (ancestorShapeIds.has(shape.id.value)) {
            continue
        }
        const context = property.parent.queryContext ?? { path: [], shapePath: [] }
        const node = new ShaclNode(shape, undefined, template.nodeKind, template.label, false, ancestorShapeIds, {
            path: [...context.path, template.path!],
            shapePath: [...context.shapePath, queryShapePathSegment(template)]
        })
        const instance = document.createElement('div')
        instance.classList.add('property-instance', 'query-structure')
        instance.setAttribute('part', 'property-instance')
        if (template.config.hierarchyColorsStyleSheet !== undefined) {
            instance.appendChild(createRemoveButtonWrapper(true))
        }
        instance.appendChild(node)
        property.container.appendChild(instance)
        await node.ready
    }
}

function createQueryLeaf(template: ShaclPropertyTemplate, parent: ShaclNode): QueryEditor {
    const context = parent.queryContext ?? { path: [], shapePath: [] }
    const field = {
        id: `qf${(nextQueryFieldId++).toString(36)}`,
        path: [...context.path, template.path!],
        shapePath: [...context.shapePath, queryShapePathSegment(template)],
        datatype: template.datatype?.value
    }
    const plugin = findPlugin(template.path, template.datatype?.value)
    const editor = plugin?.createQueryEditor?.(field, template) ?? createQueryEditor(field, template)
    editor.queryField = field
    editor.classList.add('property-instance', 'query-editor')
    editor.dataset.path = template.path
    return editor
}

export async function activateNodeConstraintOption(
    properties: ShaclProperty[],
    constraintElement: HTMLElement
): Promise<void> {
    if (!properties.length) {
        return
    }
    for (const property of properties) {
        await property.initializeQuery()
    }
    let lastAddedProperty = properties[0]
    constraintElement.replaceWith(lastAddedProperty)
    for (let i = 1; i < properties.length; i++) {
        lastAddedProperty.after(properties[i])
        lastAddedProperty = properties[i]
    }
    lastAddedProperty.dispatchEvent(new Event('change', { bubbles: true }))
}

export async function activatePropertyConstraintOption(
    template: ShaclPropertyTemplate,
    context: ShaclProperty,
    constraintElement: HTMLElement
): Promise<void> {
    template.or = undefined
    template.xone = undefined
    const property = new ShaclProperty(template, context.parent)
    await property.initializeQuery()
    constraintElement.replaceWith(property)
    property.dispatchEvent(new Event('change', { bubbles: true }))
}

function resolveNumericAlternative(template: ShaclPropertyTemplate): ShaclPropertyTemplate | undefined {
    const options = template.or ?? template.xone
    if (!options?.length) {
        return undefined
    }
    const datatypes = options.map(option => {
        const branch = cloneProperty(template)
        branch.or = undefined
        branch.xone = undefined
        mergeQuads(branch, template.config.store.getQuads(option, null, null, null))
        return branch.nodeShapes.size === 0 ? branch.datatype : undefined
    })
    if (datatypes.some(datatype => !datatype || !NUMERIC_DATATYPES.has(datatype.value))) {
        return undefined
    }
    const merged = cloneProperty(template)
    merged.or = undefined
    merged.xone = undefined
    merged.datatype = datatypes.find(datatype => datatype && FRACTIONAL_DATATYPES.has(datatype.value)) ?? datatypes[0]
    return merged
}

function queryShapePathSegment(template: ShaclPropertyTemplate): string {
    return template.qualifiedValueShape ? template.id.value : template.path!
}
