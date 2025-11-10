import type { BlankNode, Literal, NamedNode, Term } from '@rdfjs/types'
import type { AnyPointer } from 'clownface'
import clownface from 'clownface'
import rdf from '@zazuko/env/web.js'
import { constructQuery } from '@hydrofoil/shape-to-query'
import type { Store } from 'n3'
import { PREFIX_XSD, SHAPES_GRAPH } from './constants'
import { Parser, Generator } from 'sparqljs'
import type { Pattern, BgpPattern, Triple, OptionalPattern, FilterPattern, OperationExpression, VariableTerm, LiteralTerm, Tuple, UnionPattern } from 'sparqljs'

export interface QueryBuildOptions {
    type?: 'construct' | 'select'
    subjectVariable?: string
    selectVariables?: string[]
    distinct?: boolean
}

interface PropertyMetadata {
    predicate: string
    optional: boolean
}

interface NormalizedData {
    patterns: Pattern[]
    literalFilters: Map<string, LiteralTerm[]>
    filledPredicates: Set<string>
    rootVariable: VariableTerm
}

interface OptionalGroup {
    pattern: OptionalPattern
    variables: Set<string>
}

interface OptionalExtraction {
    patterns: Pattern[]
    optionalGroups: OptionalGroup[]
}

const parser = new Parser()
const generator = new Generator()
const sh = rdf.namespace('http://www.w3.org/ns/shacl#')

export function buildQuery(store: Store, shapeSubject: NamedNode, data: Store, rootNode: NamedNode | BlankNode, options: QueryBuildOptions = {}): string {
    const subjectVariable = options.subjectVariable || 'resource'
    const shapePointer = createShapePointer(store, shapeSubject)
    const propertyMetadata = extractPropertyMetadata(shapePointer)
    const baseQuery = constructQuery(shapePointer, { subjectVariable })
    const parsed = parser.parse(baseQuery)
    if (parsed.type !== 'query') {
        throw new Error('Unexpected query type generated from shape')
    }

    const resolvedSubjectVariable = resolveSubjectVariableName(parsed.where, subjectVariable)
    const normalized = collectAndNormalizeData(data, rootNode, resolvedSubjectVariable)
    let wherePatterns: Pattern[] = parsed.where ? [...parsed.where] : []
    if (normalized.patterns.length) {
        wherePatterns = [...wherePatterns, ...normalized.patterns]
    }

    const optionalized = applyOptionalPredicates(wherePatterns, propertyMetadata, normalized.filledPredicates)
    wherePatterns = relocateFilters(optionalized.patterns, optionalized.optionalGroups)
    wherePatterns = removeDatatypeFilters(wherePatterns)

    const filterPatterns = buildValueFilters(wherePatterns, normalized.literalFilters)
    if (filterPatterns.length) {
        wherePatterns = [...wherePatterns, ...filterPatterns]
    }

    if (options.type === 'select') {
        const requestedVariables = options.selectVariables && options.selectVariables.length > 0 ? options.selectVariables : [subjectVariable]
        const variableNames = requestedVariables.map((value) => (value === subjectVariable ? resolvedSubjectVariable : value))
        const variables = variableNames.map((value) => rdf.variable(value))

        return generator.stringify({
            type: 'query',
            queryType: 'SELECT',
            variables,
            prefixes: parsed.prefixes,
            where: wherePatterns,
            distinct: options.distinct ?? true
        })
    }

    return generator.stringify({
        ...parsed,
        where: wherePatterns
    })
}

function createShapePointer(store: Store, shapeSubject: NamedNode) {
    const dataset = rdf.dataset()
    for (const quad of store.getQuads(null, null, null, SHAPES_GRAPH)) {
        dataset.add(rdf.quad(quad.subject, quad.predicate, quad.object))
    }
    return clownface({ dataset, term: rdf.namedNode(shapeSubject.value) })
}

function extractPropertyMetadata(shapePointer: AnyPointer): Map<string, PropertyMetadata> {
    const metadata = new Map<string, PropertyMetadata>()
    shapePointer.out(sh.property).forEach((property: AnyPointer) => {
        const pathTerm = property.out(sh.path).term
        if (!pathTerm || pathTerm.termType !== 'NamedNode') {
            return
        }

        const minCountLiteral = property.out(sh.minCount).term
        const minCount = minCountLiteral && minCountLiteral.termType === 'Literal' ? Number.parseInt(minCountLiteral.value, 10) : 0
        const existing = metadata.get(pathTerm.value)
        const optional = minCount > 0 ? false : true
        if (!existing) {
            metadata.set(pathTerm.value, { predicate: pathTerm.value, optional })
            return
        }

        if (minCount > 0) {
            metadata.set(pathTerm.value, { predicate: pathTerm.value, optional: false })
        }
    })
    return metadata
}

function collectAndNormalizeData(data: Store, rootNode: NamedNode | BlankNode, subjectVariable: string): NormalizedData {
    const rootVar = rdf.variable(subjectVariable)
    const blankNodeVars = new Map<string, VariableTerm>()
    const seen = new Set<string>()
    const literalFilters = new Map<string, LiteralTerm[]>()
    const filledPredicates = new Set<string>()
    const triples: Triple[] = []

    for (const quad of data.getQuads(null, null, null, null)) {
        const preparedObject = quad.object.termType === 'Literal' ? prepareLiteralValue(quad.object) : quad.object
        if (!preparedObject) {
            continue
        }

        const subjectTerm = toQueryTerm(quad.subject, rootNode, rootVar, blankNodeVars, subjectVariable)
        const predicateTerm = rdf.namedNode(quad.predicate.value)
        const objectTerm = toQueryTerm(preparedObject, rootNode, rootVar, blankNodeVars, subjectVariable)

        if (isRootVariable(subjectTerm, subjectVariable)) {
            filledPredicates.add(predicateTerm.value)
            if (objectTerm.termType === 'Literal') {
                const existing = literalFilters.get(predicateTerm.value) || []
                existing.push(objectTerm)
                literalFilters.set(predicateTerm.value, existing)
                continue
            }
        }

        const signature = `${termKey(subjectTerm)}|${termKey(predicateTerm)}|${termKey(objectTerm)}`
        if (seen.has(signature)) {
            continue
        }
        seen.add(signature)
        const triple: Triple = {
            subject: subjectTerm as Triple['subject'],
            predicate: predicateTerm as Triple['predicate'],
            object: objectTerm as Triple['object']
        }
        triples.push(triple)
    }

    if (!triples.length) {
        return {
            patterns: [],
            literalFilters,
            filledPredicates,
            rootVariable: rootVar
        }
    }

    const bgp: BgpPattern = {
        type: 'bgp',
        triples
    }

    return {
        patterns: [bgp],
        literalFilters,
        filledPredicates,
        rootVariable: rootVar
    }
}

function applyOptionalPredicates(patterns: Pattern[], propertyMetadata: Map<string, PropertyMetadata>, filledPredicates: Set<string>): OptionalExtraction {
    const result: Pattern[] = []
    const optionalGroups: OptionalGroup[] = []

    for (const pattern of patterns) {
        if (pattern.type !== 'bgp') {
            if (pattern.type === 'union') {
                const transformed = transformUnionPattern(pattern, propertyMetadata, filledPredicates)
                result.push(...transformed.patterns)
                optionalGroups.push(...transformed.optionalGroups)
                continue
            }

            result.push(pattern)
            continue
        }

        const transformed = extractOptionalGroups(pattern, propertyMetadata, filledPredicates)
        if (transformed.remaining.triples.length) {
            result.push(transformed.remaining)
        }
        if (transformed.optional.length) {
            for (const group of transformed.optional) {
                optionalGroups.push(group)
                result.push(group.pattern)
            }
        }
    }

    return {
        patterns: result,
        optionalGroups
    }
}

function extractOptionalGroups(pattern: BgpPattern, propertyMetadata: Map<string, PropertyMetadata>, filledPredicates: Set<string>): { remaining: BgpPattern; optional: OptionalGroup[] } {
    const optionalPatterns: OptionalGroup[] = []
    const remainingTriples: Triple[] = []
    const visited = new Set<number>()

    for (let index = 0; index < pattern.triples.length; index += 1) {
        if (visited.has(index)) {
            continue
        }

        const triple = pattern.triples[index]
        const predicateValue = getPredicateValue(triple.predicate)
        const metadata = predicateValue ? propertyMetadata.get(predicateValue) : undefined
        const shouldOptionalize = Boolean(metadata && metadata.optional && !filledPredicates.has(metadata.predicate))

        if (!shouldOptionalize) {
            remainingTriples.push(triple)
            continue
        }

        const group = collectConnectedTriples(pattern.triples, index)
        group.indices.forEach((value) => visited.add(value))
        optionalPatterns.push({
            pattern: {
                type: 'optional',
                patterns: [
                    {
                        type: 'bgp',
                        triples: group.triples
                    }
                ]
            },
            variables: new Set(group.variables)
        })
    }

    return {
        remaining: {
            type: 'bgp',
            triples: remainingTriples
        },
        optional: optionalPatterns
    }
}

function transformUnionPattern(pattern: UnionPattern, propertyMetadata: Map<string, PropertyMetadata>, filledPredicates: Set<string>): OptionalExtraction {
    if (!pattern.patterns.every((branch) => branch.type === 'bgp')) {
        return { patterns: [pattern], optionalGroups: [] }
    }

    const requiredTriples: Triple[] = []
    const optionalPatterns: OptionalGroup[] = []
    let transformed = false

    for (const branch of pattern.patterns as BgpPattern[]) {
        const evaluated = extractOptionalGroups(branch, propertyMetadata, filledPredicates)
        if (evaluated.remaining.triples.length) {
            appendTriplesUnique(requiredTriples, evaluated.remaining.triples)
        }
        if (evaluated.optional.length) {
            optionalPatterns.push(...evaluated.optional)
        }
        transformed = transformed || evaluated.optional.length > 0 || evaluated.remaining.triples.length !== branch.triples.length
    }

    if (!transformed) {
        return { patterns: [pattern], optionalGroups: [] }
    }

    const merged: Pattern[] = []
    if (requiredTriples.length) {
        merged.push({
            type: 'bgp',
            triples: requiredTriples
        })
    }
    if (optionalPatterns.length) {
        for (const group of optionalPatterns) {
            merged.push(group.pattern)
        }
    }

    if (!merged.length) {
        return { patterns: [pattern], optionalGroups: [] }
    }

    return {
        patterns: merged,
        optionalGroups: optionalPatterns
    }
}

function collectConnectedTriples(triples: Triple[], startIndex: number): { indices: number[]; triples: Triple[]; variables: Set<string> } {
    const queue: number[] = [startIndex]
    const collected = new Set<number>()
    const variables = new Set<string>()

    while (queue.length) {
        const index = queue.shift()
        if (index === undefined || collected.has(index)) {
            continue
        }

        collected.add(index)
        const triple = triples[index]
        addVariablesFromTerm(triple.subject, variables)
        addVariablesFromTerm(triple.object, variables)

        for (let candidateIndex = 0; candidateIndex < triples.length; candidateIndex += 1) {
            if (collected.has(candidateIndex)) {
                continue
            }

            const candidate = triples[candidateIndex]
            if (sharesVariable(candidate, variables)) {
                queue.push(candidateIndex)
            }
        }
    }

    const ordered = Array.from(collected).sort((a, b) => a - b)
    const collectedTriples = ordered.map((index) => triples[index])
    const collectedVariables = new Set<string>()
    for (const triple of collectedTriples) {
        addVariablesFromTerm(triple.subject, collectedVariables)
        addVariablesFromTerm(triple.object, collectedVariables)
    }
    return {
        indices: ordered,
        triples: collectedTriples,
        variables: collectedVariables
    }
}

function appendTriplesUnique(target: Triple[], triples: Triple[]): void {
    const existing = new Set(target.map(tripleKey))
    for (const triple of triples) {
        const key = tripleKey(triple)
        if (existing.has(key)) {
            continue
        }
        existing.add(key)
        target.push(triple)
    }
}

function tripleKey(triple: Triple): string {
    return `${termKey(triple.subject)}|${predicateKey(triple.predicate)}|${termKey(triple.object)}`
}

function predicateKey(predicate: Triple['predicate']): string {
    if (isNamedNode(predicate) || isVariableTerm(predicate)) {
        return termKey(predicate as unknown as Term)
    }
    return JSON.stringify(predicate)
}

function resolveSubjectVariableName(patterns: Pattern[] | undefined, fallback: string): string {
    if (!patterns || !patterns.length) {
        return fallback
    }

    const discovered: string[] = []
    const queue: Pattern[] = [...patterns]

    while (queue.length) {
        const current = queue.shift()
        if (!current) {
            continue
        }

        if (current.type === 'bgp') {
            for (const triple of current.triples) {
                if (triple.subject.termType === 'Variable') {
                    const name = triple.subject.value
                    if (name === fallback) {
                        return fallback
                    }
                    discovered.push(name)
                }
            }
        }

        if ('patterns' in current && Array.isArray((current as { patterns?: Pattern[] }).patterns)) {
            queue.push(...(current as { patterns: Pattern[] }).patterns)
        }

        if ((current as { type: string }).type === 'query') {
            const subQuery = current as unknown as { where?: Pattern[] }
            if (Array.isArray(subQuery.where) && subQuery.where.length) {
                queue.push(...subQuery.where)
            }
        }
    }

    const prefixed = discovered.find((value) => value.startsWith(fallback))
    if (prefixed) {
        return prefixed
    }

    return discovered[0] || fallback
}

function sharesVariable(triple: Triple, variables: Set<string>): boolean {
    return hasVariable(triple.subject, variables) || hasVariable(triple.object, variables)
}

function hasVariable(term: Term, variables: Set<string>): boolean {
    return term.termType === 'Variable' && variables.has(term.value)
}

function addVariablesFromTerm(term: Term, set: Set<string>): void {
    if (term.termType === 'Variable') {
        set.add(term.value)
    }
}

function buildValueFilters(patterns: Pattern[], literalFilters: Map<string, LiteralTerm[]>): FilterPattern[] {
    if (!literalFilters.size) {
        return []
    }

    const predicateVariables = mapPredicateVariables(patterns)
    const filters: FilterPattern[] = []

    for (const [predicate, values] of literalFilters.entries()) {
        const variables = predicateVariables.get(predicate)
        if (!variables || !variables.length) {
            continue
        }

        const uniqueValues = deduplicateTerms(values)
        if (!uniqueValues.length) {
            continue
        }

        const expression = uniqueValues.length === 1 ? buildEqualsExpression(variables[0], uniqueValues[0]) : buildInExpression(variables[0], uniqueValues)

        filters.push({
            type: 'filter',
            expression
        })
    }

    return filters
}

function buildEqualsExpression(variable: VariableTerm, value: LiteralTerm): OperationExpression {
    return {
        type: 'operation',
        operator: '=',
        args: [variable, value]
    }
}

function buildInExpression(variable: VariableTerm, values: LiteralTerm[]): OperationExpression {
    const tuple: Tuple = values.map((term) => term) as Tuple
    return {
        type: 'operation',
        operator: 'in',
        args: [variable, tuple]
    }
}

function mapPredicateVariables(patterns: Pattern[]): Map<string, VariableTerm[]> {
    const mapping = new Map<string, VariableTerm[]>()

    for (const pattern of patterns) {
        if (pattern.type !== 'bgp') {
            continue
        }

        for (const triple of pattern.triples) {
            const predicateValue = getPredicateValue(triple.predicate)
            if (!predicateValue) {
                continue
            }

            if (triple.object.termType !== 'Variable') {
                continue
            }

            const existing = mapping.get(predicateValue) || []
            existing.push(triple.object)
            mapping.set(predicateValue, existing)
        }
    }

    return mapping
}

function relocateFilters(patterns: Pattern[], optionalGroups: OptionalGroup[]): Pattern[] {
    if (!optionalGroups.length || !patterns.length) {
        return patterns
    }

    const relocated: Pattern[] = []

    for (const pattern of patterns) {
        if (pattern.type === 'filter') {
            const variables = new Set<string>()
            collectExpressionVariables(pattern.expression, variables)
            if (variables.size) {
                const target = optionalGroups.find((group) => isSubset(variables, group.variables))
                if (target) {
                    target.pattern.patterns.push(pattern)
                    continue
                }
            }

            relocated.push(pattern)
            continue
        }

        relocated.push(pattern)
    }

    return relocated
}

function collectExpressionVariables(node: unknown, target: Set<string>): void {
    if (!node) {
        return
    }

    if (Array.isArray(node)) {
        for (const item of node) {
            collectExpressionVariables(item, target)
        }
        return
    }

    if (typeof node !== 'object') {
        return
    }

    if ('termType' in (node as Record<string, unknown>)) {
        const term = node as Term
        if (term.termType === 'Variable') {
            target.add((term as VariableTerm).value)
        }
        return
    }

    for (const value of Object.values(node as Record<string, unknown>)) {
        collectExpressionVariables(value, target)
    }
}

function isSubset(subset: Set<string>, superset: Set<string>): boolean {
    for (const value of subset) {
        if (!superset.has(value)) {
            return false
        }
    }
    return true
}

function removeDatatypeFilters(patterns: Pattern[]): Pattern[] {
    const result: Pattern[] = []

    for (const pattern of patterns) {
        if (pattern.type === 'filter' && containsDatatypeFunction(pattern.expression)) {
            continue
        }

        if ('patterns' in pattern) {
            const nested = (pattern as { patterns?: Pattern[] }).patterns
            if (Array.isArray(nested)) {
                ;(pattern as { patterns: Pattern[] }).patterns = removeDatatypeFilters(nested)
            }
        }

        if ('pattern' in pattern) {
            const nestedPattern = (pattern as { pattern?: Pattern }).pattern
            if (nestedPattern) {
                const stripped = removeDatatypeFilters([nestedPattern])
                ;(pattern as { pattern?: Pattern }).pattern = stripped.length ? stripped[0] : nestedPattern
            }
        }

        result.push(pattern)
    }

    return result
}

function containsDatatypeFunction(node: unknown): boolean {
    if (!node) {
        return false
    }

    if (Array.isArray(node)) {
        return node.some((value) => containsDatatypeFunction(value))
    }

    if (typeof node !== 'object') {
        return false
    }

    const record = node as Record<string, unknown>
    if (typeof record.operator === 'string' && record.operator.toLowerCase() === 'datatype') {
        return true
    }

    for (const value of Object.values(record)) {
        if (containsDatatypeFunction(value)) {
            return true
        }
    }

    return false
}

function prepareLiteralValue(literal: Literal): Literal | null {
    const trimmed = literal.value.trim()
    if (!trimmed) {
        return null
    }

    if (trimmed === literal.value) {
        return literal
    }

    if (literal.language) {
        return rdf.literal(trimmed, literal.language)
    }

    const datatype = literal.datatype ? rdf.namedNode(literal.datatype.value) : null
    return datatype ? rdf.literal(trimmed, datatype) : rdf.literal(trimmed)
}

function getPredicateValue(predicate: Triple['predicate']): string | null {
    if (isNamedNode(predicate)) {
        return predicate.value
    }
    return null
}

function deduplicateTerms<T extends Term>(terms: T[]): T[] {
    const seen = new Set<string>()
    const result: T[] = []
    for (const term of terms) {
        const key = termKey(term)
        if (seen.has(key)) {
            continue
        }
        seen.add(key)
        result.push(term)
    }
    return result
}

function toQueryTerm(term: Term, rootNode: NamedNode | BlankNode, rootVar: VariableTerm, blankNodeVars: Map<string, VariableTerm>, subjectVariable: string): Term {
    if ('equals' in term && term.equals(rootNode)) {
        return rootVar
    }

    if (term.termType === 'BlankNode') {
        let variable = blankNodeVars.get(term.value)
        if (!variable) {
            variable = rdf.variable(`${subjectVariable}_${blankNodeVars.size + 1}`)
            blankNodeVars.set(term.value, variable)
        }
        return variable
    }

    if (term.termType === 'NamedNode') {
        return rdf.namedNode(term.value)
    }

    if (term.termType === 'Literal') {
        return toLiteral(term)
    }

    return rdf.namedNode(term.value)
}

function toLiteral(term: Literal): LiteralTerm {
    if (term.language) {
        return rdf.literal(term.value, term.language)
    }

    const datatype = term.datatype && term.datatype.value !== `${PREFIX_XSD}string` ? rdf.namedNode(term.datatype.value) : undefined
    return datatype ? rdf.literal(term.value, datatype) : rdf.literal(term.value)
}

function termKey(term: Term): string {
    switch (term.termType) {
        case 'Literal':
            return `Literal:${term.value}@${term.language || ''}^^${term.datatype ? term.datatype.value : ''}`
        default:
            return `${term.termType}:${term.value}`
    }
}

function isRootVariable(term: Term, subjectVariable: string): term is VariableTerm {
    return term.termType === 'Variable' && term.value === subjectVariable
}

function isNamedNode(value: unknown): value is NamedNode {
    return Boolean(value) && typeof value === 'object' && 'termType' in (value as Record<string, unknown>) && (value as { termType: string }).termType === 'NamedNode'
}

function isVariableTerm(value: unknown): value is VariableTerm {
    return Boolean(value) && typeof value === 'object' && 'termType' in (value as Record<string, unknown>) && (value as { termType: string }).termType === 'Variable'
}
