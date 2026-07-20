import { DataFactory, Literal, NamedNode } from 'n3'
import { Term } from '@rdfjs/types'
import { DCTERMS_PREDICATE_CONFORMS_TO, RDF_PREDICATE_TYPE } from '../constants.js'
import { isRangeQueryField, QueryFacet, QueryFacetRequest, QueryField, QueryFacetProvider, Query } from './index.js'

export type SparqlDatasetScope =
    | { type: 'default' }
    | { type: 'named'; graph?: NamedNode }

export type SparqlRootPatternContext = {
    query: Query
    rootVariable: string
    graphVariable?: string
}

export type SparqlQueryBuilderOptions = {
    dataset?: SparqlDatasetScope
    rootPattern?: (context: SparqlRootPatternContext) => string
    caseSensitive?: boolean
}

export type SparqlSelectOptions = {
    projection?: string[]
    distinct?: boolean
    orderBy?: string
    limit?: number
    offset?: number
}

export type SparqlBindingValue = {
    type: 'uri' | 'literal' | 'typed-literal' | 'bnode'
    value: string
    datatype?: string
    'xml:lang'?: string
}

export type SparqlSelectResult = {
    head?: { vars?: string[] }
    results: { bindings: Record<string, SparqlBindingValue>[] }
}

export type SparqlSelectExecutor = (query: string, signal: AbortSignal) => Promise<SparqlSelectResult>

export type SparqlQueryProviderOptions = SparqlQueryBuilderOptions & {
    bucketLimit?: number
    headers?: Record<string, string>
    onError?: (error: unknown, field: QueryField) => void
}

const ROOT_VARIABLE = '?root'

export class SparqlQueryBuilder {
    readonly options: SparqlQueryBuilderOptions

    constructor(options: SparqlQueryBuilderOptions = {}) {
        this.options = options
    }

    buildWhere(query: Query): string {
        const body = [this.rootPattern(query), ...this.criterionPatterns(query)].filter(Boolean).join('\n')
        return this.wrapDataset(body)
    }

    buildSelect(query: Query, options: SparqlSelectOptions = {}): string {
        const projection = options.projection?.length ? options.projection.join(' ') : ROOT_VARIABLE
        const distinct = options.distinct === false ? '' : 'DISTINCT '
        let result = `SELECT ${distinct}${projection} WHERE {\n${indent(this.buildWhere(query))}\n}`
        if (options.orderBy) {
            result += `\nORDER BY ${options.orderBy}`
        }
        if (options.limit !== undefined) {
            result += `\nLIMIT ${nonNegativeInteger(options.limit, 'limit')}`
        }
        if (options.offset !== undefined) {
            result += `\nOFFSET ${nonNegativeInteger(options.offset, 'offset')}`
        }
        return result
    }

    buildFacetSelect(request: QueryFacetRequest, field: QueryField, bucketLimit = 100): string {
        const facetVariable = '?facetValue'
        const body = [
            this.rootPattern(request.query),
            ...this.criterionPatterns(request.query),
            this.pathPattern(field.path, facetVariable, `facet_${safeId(field.id)}`)
        ].filter(Boolean).join('\n')
        const where = this.wrapDataset(body)
        if (isRangeQueryField(field)) {
            return `SELECT (COUNT(DISTINCT ${ROOT_VARIABLE}) AS ?count) (MIN(${facetVariable}) AS ?min) (MAX(${facetVariable}) AS ?max) WHERE {\n${indent(where)}\n}`
        }
        return `SELECT ${facetVariable} ?count ?total WHERE {\n  { SELECT ${facetVariable} (COUNT(DISTINCT ${ROOT_VARIABLE}) AS ?count) WHERE {\n${indent(indent(where))}\n  } GROUP BY ${facetVariable} }\n  { SELECT (COUNT(DISTINCT ${ROOT_VARIABLE}) AS ?total) WHERE {\n${indent(indent(where))}\n  } }\n}\nORDER BY DESC(?count)\nLIMIT ${nonNegativeInteger(bucketLimit, 'bucketLimit')}`
    }

    buildFacetsSelect(request: QueryFacetRequest, bucketLimit = 100): string {
        const branches = request.fields.map(field => {
            const facetVariable = '?facetValue'
            const body = [
                this.rootPattern(request.query),
                ...this.criterionPatterns(request.query),
                this.pathPattern(field.path, facetVariable, `facet_${safeId(field.id)}`)
            ].filter(Boolean).join('\n')
            const where = this.wrapDataset(body)
            const fieldId = `BIND(${sparqlString(field.id)} AS ?fieldId)`
            if (isRangeQueryField(field)) {
                return `{\n  ${fieldId}\n  { SELECT (COUNT(DISTINCT ${ROOT_VARIABLE}) AS ?count) (MIN(${facetVariable}) AS ?min) (MAX(${facetVariable}) AS ?max) WHERE {\n${indent(indent(where))}\n  } }\n}`
            }
            return `{\n  ${fieldId}\n  { SELECT ${facetVariable} (COUNT(DISTINCT ${ROOT_VARIABLE}) AS ?count) WHERE {\n${indent(indent(where))}\n  } GROUP BY ${facetVariable} ORDER BY DESC(?count) LIMIT ${nonNegativeInteger(bucketLimit, 'bucketLimit')} }\n  { SELECT (COUNT(DISTINCT ${ROOT_VARIABLE}) AS ?total) WHERE {\n${indent(indent(where))}\n  } }\n}`
        })
        return `SELECT ?fieldId ?facetValue ?count ?total ?min ?max WHERE {\n${branches.map(indent).join('\nUNION\n')}\n}`
    }

    private rootPattern(query: Query): string {
        if (this.options.rootPattern) {
            return this.options.rootPattern({
                query,
                rootVariable: ROOT_VARIABLE,
                graphVariable: this.options.dataset?.type === 'named' && !this.options.dataset.graph ? '?graph' : undefined
            })
        }
        if (query.targetClass) {
            return `${ROOT_VARIABLE} ${termToSparql(RDF_PREDICATE_TYPE)} ${termToSparql(DataFactory.namedNode(query.targetClass))} .`
        }
        return `${ROOT_VARIABLE} ${termToSparql(DCTERMS_PREDICATE_CONFORMS_TO)} ${termToSparql(DataFactory.namedNode(query.rootShapeId))} .`
    }

    /**
     * Builds SPARQL patterns for each criterion. Variable names are scoped by prefix:
     * - `criterion_{fieldIndex}_{pathHop}` for intermediate path nodes
     * - `value_{criterionIndex}` for the terminal bound variable
     * These prefixes ensure no collision with facet variables (`facet_{fieldId}_{pathHop}`).
     */
    private criterionPatterns(query: Query): string[] {
        return query.criteria.flatMap((criterion, index) => {
            const variable = `?value_${index}`
            const pattern = this.pathPattern(criterion.field.path, variable, `criterion_${index}`)
            if (criterion.operator === 'equals' && criterion.value) {
                return [pattern, `VALUES ${variable} { ${termToSparql(criterion.value)} }`]
            }
            if (criterion.operator === 'contains' && criterion.value) {
                const needle = sparqlString(criterion.value.value)
                const valueExpression = this.options.caseSensitive ? `STR(${variable})` : `LCASE(STR(${variable}))`
                const needleExpression = this.options.caseSensitive ? needle : `LCASE(${needle})`
                const filters = [`FILTER(CONTAINS(${valueExpression}, ${needleExpression}))`]
                if (criterion.value.termType === 'Literal' && criterion.value.language) {
                    filters.push(`FILTER(LANGMATCHES(LANG(${variable}), ${sparqlString(criterion.value.language)}))`)
                }
                return [pattern, ...filters]
            }
            if (criterion.operator === 'range') {
                const filters: string[] = []
                if (criterion.min) {
                    filters.push(`FILTER(${variable} >= ${termToSparql(criterion.min)})`)
                }
                if (criterion.max) {
                    filters.push(`FILTER(${variable} <= ${termToSparql(criterion.max)})`)
                }
                return [pattern, ...filters]
            }
            return []
        })
    }

    private pathPattern(path: string[], targetVariable: string, prefix: string): string {
        let subject = ROOT_VARIABLE
        return path.map((predicate, index) => {
            const object = index === path.length - 1 ? targetVariable : `?${prefix}_${index}`
            const triple = `${subject} ${termToSparql(DataFactory.namedNode(predicate))} ${object} .`
            subject = object
            return triple
        }).join('\n')
    }

    private wrapDataset(body: string): string {
        const dataset = this.options.dataset ?? { type: 'default' }
        if (dataset.type === 'default') {
            return body
        }
        const graph = dataset.graph ? termToSparql(dataset.graph) : '?graph'
        return `GRAPH ${graph} {\n${indent(body)}\n}`
    }
}

export class SparqlQueryProvider implements QueryFacetProvider {
    readonly builder: SparqlQueryBuilder
    readonly executor: SparqlSelectExecutor
    readonly bucketLimit: number
    readonly onError?: (error: unknown, field: QueryField) => void

    constructor(endpoint: string, options?: SparqlQueryProviderOptions)
    constructor(executor: SparqlSelectExecutor, options?: SparqlQueryProviderOptions)
    constructor(
        source: string | SparqlSelectExecutor,
        options: SparqlQueryProviderOptions = {}
    ) {
        this.builder = new SparqlQueryBuilder(options)
        this.executor = typeof source === 'string'
            ? endpointExecutor(source, options.headers)
            : source
        this.bucketLimit = Math.max(0, Math.floor(options.bucketLimit ?? 100))
        this.onError = options.onError
    }

    async getFacets(request: QueryFacetRequest): Promise<QueryFacet[]> {
        const fields = [...request.fields]
        if (fields.length === 0) {
            return []
        }
        if (request.signal.aborted) {
            throw new DOMException('Facet request aborted', 'AbortError')
        }
        try {
            const sparql = this.builder.buildFacetsSelect(request, this.bucketLimit)
            const result = await this.executor(sparql, request.signal)
            const bindings = result.results?.bindings ?? []
            const bindingsByField = new Map<string, typeof bindings>()
            for (const binding of bindings) {
                const fieldId = binding.fieldId?.value
                if (fieldId) {
                    const fieldBindings = bindingsByField.get(fieldId) ?? []
                    fieldBindings.push(binding)
                    bindingsByField.set(fieldId, fieldBindings)
                }
            }
            return fields.map(field => parseFacet(field, {
                results: { bindings: bindingsByField.get(field.id) ?? [] }
            }))
        } catch (error) {
            if (request.signal.aborted) {
                throw error
            }
            return fields.map(field => {
                this.onError?.(error, field)
                return { fieldId: field.id, count: 0, error: true }
            })
        }
    }

    async select(query: Query, options: SparqlSelectOptions = {}, signal = new AbortController().signal): Promise<SparqlSelectResult> {
        return this.executor(this.builder.buildSelect(query, options), signal)
    }
}

function endpointExecutor(url: string, extraHeaders: Record<string, string> = {}): SparqlSelectExecutor {
    const headers: Record<string, string> = {
        'content-type': 'application/x-www-form-urlencoded',
        'accept': 'application/sparql-results+json',
        ...extraHeaders
    }
    return async (query, signal) => {
        const response = await fetch(url, {
            method: 'POST',
            signal,
            headers,
            body: new URLSearchParams({ query })
        })
        if (!response.ok) {
            throw new Error(`SPARQL request failed: ${response.status}`)
        }
        return response.json()
    }
}

export function termToSparql(term: Term): string {
    if (term.termType === 'NamedNode') {
        return `<${escapeIri(term.value)}>`
    }
    if (term.termType === 'BlankNode') {
        return `_:${escapeBlankNode(term.value)}`
    }
    if (term.termType === 'Literal') {
        const literal = term as Literal
        const value = sparqlString(literal.value)
        if (literal.language) {
            return `${value}@${literal.language.replace(/[^A-Za-z0-9-]/g, '')}`
        }
        if (literal.datatype) {
            return `${value}^^<${escapeIri(literal.datatype.value)}>`
        }
        return value
    }
    throw new Error(`Unsupported RDF term in SPARQL query: ${term.termType}`)
}

function parseFacet(field: QueryField, result: SparqlSelectResult): QueryFacet {
    const bindings = result.results?.bindings ?? []
    if (isRangeQueryField(field)) {
        const binding = bindings[0] ?? {}
        return {
            fieldId: field.id,
            count: parseCount(binding.count),
            min: binding.min ? bindingToTerm(binding.min) : undefined,
            max: binding.max ? bindingToTerm(binding.max) : undefined
        }
    }
    const buckets = bindings.flatMap(binding => binding.facetValue ? [{
        value: bindingToTerm(binding.facetValue),
        count: parseCount(binding.count)
    }] : [])
    return { fieldId: field.id, count: parseCount(bindings[0]?.total), buckets }
}

function bindingToTerm(binding: SparqlBindingValue): Term {
    if (binding.type === 'uri') {
        return DataFactory.namedNode(binding.value)
    }
    if (binding.type === 'bnode') {
        return DataFactory.blankNode(binding.value)
    }
    if (binding['xml:lang']) {
        return DataFactory.literal(binding.value, binding['xml:lang'])
    }
    if (binding.datatype) {
        return DataFactory.literal(binding.value, DataFactory.namedNode(binding.datatype))
    }
    return DataFactory.literal(binding.value)
}

function parseCount(binding?: SparqlBindingValue): number {
    const count = Number(binding?.value ?? 0)
    return Number.isFinite(count) ? count : 0
}

function sparqlString(value: string): string {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`
}

function escapeIri(value: string): string {
    return value.replace(/[^A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]/g, char =>
        '%' + char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'))
}

function escapeBlankNode(value: string): string {
    return value.replace(/[^A-Za-z0-9\-_.]/g, char =>
        '_' + char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'))
}

function indent(value: string): string {
    return value.split('\n').map(line => `  ${line}`).join('\n')
}

function safeId(value: string): string {
    return value.replace(/[^A-Za-z0-9_]/g, '_')
}

function nonNegativeInteger(value: number, name: string): number {
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${name} must be a non-negative integer`)
    }
    return value
}
