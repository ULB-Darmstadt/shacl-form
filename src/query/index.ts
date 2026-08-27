import { Term } from '@rdfjs/types'
import { RANGE_DATATYPES } from '../constants.js'

export type QueryPathSegment = string | string[]

export type QueryField = {
    id: string
    path: QueryPathSegment[]
    shapePath?: string[]
    datatype?: string
    discrete?: boolean
}

export function isRangeQueryField(field: QueryField): boolean {
    return field.discrete !== true && field.datatype !== undefined && RANGE_DATATYPES.has(field.datatype)
}

export type QueryCriterion = {
    field: QueryField
    operator: 'contains' | 'equals' | 'range'
    value?: Term
    min?: Term
    max?: Term
}

export type Query = {
    rootShapeId: string
    targetClass?: string
    criteria: QueryCriterion[]
}

export type HeatmapGrid = {
    columns: number
    rows: number
    minX: number
    maxX: number
    minY: number
    maxY: number
    counts: number[][]
}

export type QueryFacet = {
    fieldId: string
    count: number
    /** The facet cannot offer a meaningful editor, regardless of an active criterion. */
    unavailable?: boolean
    buckets?: { value: Term; label?: string; count: number }[]
    min?: Term
    max?: Term
    heatmap?: HeatmapGrid
    error?: boolean
}

export type QueryFacetRequest = {
    query: Query
    fields: QueryField[]
    signal: AbortSignal
}

export interface QueryFacetProvider {
    getFacets(request: QueryFacetRequest): Promise<QueryFacet[]>
    /** Fields whose criteria became invalid while changing from the previous query to the new query. */
    invalidatedFields?(change: QueryChange): string[]
}

export type QueryChange = {
    previousQuery: Query
    query: Query
    fields: QueryField[]
}

export type QueryEditor = HTMLElement & {
    queryField: QueryField
    getQueryCriteria: () => QueryCriterion[]
    setQueryFacet: (facet?: QueryFacet) => void
    /** Optional so custom and plugin editors stay compatible with criterion invalidation. */
    clearQueryCriteria?: () => void
    unavailable?: boolean
}
