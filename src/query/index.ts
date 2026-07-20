import { Term } from '@rdfjs/types'
import { RANGE_DATATYPES } from '../constants.js'

export type QueryField = {
    id: string
    path: string[]
    shapePath?: string[]
    datatype?: string
}

export function isRangeQueryField(field: QueryField): boolean {
    return field.datatype !== undefined && RANGE_DATATYPES.has(field.datatype)
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
}

export type QueryEditor = HTMLElement & {
    queryField: QueryField
    getQueryCriteria: () => QueryCriterion[]
    setQueryFacet: (facet?: QueryFacet) => void
}
