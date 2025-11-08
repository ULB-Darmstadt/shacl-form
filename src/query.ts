import type { BlankNode, NamedNode, Term } from '@rdfjs/types';
import clownface from 'clownface';
import rdf from '@zazuko/env/web.js';
import { constructQuery } from '@hydrofoil/shape-to-query';
import type { Store } from 'n3';
import { PREFIX_XSD, SHAPES_GRAPH } from './constants';
import * as sparqlBuilder from 'rdf-sparql-builder';
import { Parser, Generator } from 'sparqljs';

export interface QueryBuildOptions {
    type?: 'construct' | 'select';
    subjectVariable?: string;
    selectVariables?: string[];
    distinct?: boolean;
}

const parser = new Parser();
const generator = new Generator();

export function buildQuery(
    store: Store,
    shapeSubject: NamedNode,
    data: Store,
    rootNode: NamedNode | BlankNode,
    options: QueryBuildOptions = {}
): string {
    const subjectVariable = options.subjectVariable || 'resource';
    const shapePointer = createShapePointer(store, shapeSubject);
    const baseQuery = constructQuery(shapePointer, { subjectVariable });
    const parsed = parser.parse(baseQuery);
    if (parsed.type !== 'query') {
        throw new Error('Unexpected query type generated from shape');
    }

    const wherePatterns = parsed.where ? [...parsed.where] : [];
    const valuePatterns = buildValuePatterns(data, rootNode, subjectVariable);
    if (valuePatterns.length) {
        wherePatterns.push(...valuePatterns);
    }

    if (options.type === 'select') {
        const variables = (
            options.selectVariables && options.selectVariables.length > 0
                ? options.selectVariables
                : [subjectVariable]
        ).map((value) => rdf.variable(value));

        return generator.stringify({
            type: 'query',
            queryType: 'SELECT',
            variables,
            prefixes: parsed.prefixes,
            where: wherePatterns,
            distinct: options.distinct ?? true,
        });
    }

    return generator.stringify({
        ...parsed,
        where: wherePatterns,
    });
}

function createShapePointer(store: Store, shapeSubject: NamedNode) {
    const dataset = rdf.dataset();
    for (const quad of store.getQuads(null, null, null, SHAPES_GRAPH)) {
        dataset.add(rdf.quad(quad.subject, quad.predicate, quad.object));
    }
    return clownface({ dataset, term: rdf.namedNode(shapeSubject.value) });
}

function buildValuePatterns(data: Store, rootNode: NamedNode | BlankNode, subjectVariable: string) {
    const triples: [Term, Term, Term][] = [];
    const rootVar = rdf.variable(subjectVariable);
    const blankNodeVars = new Map<string, Term>();
    const seen = new Set<string>();

    for (const quad of data.getQuads(null, null, null, null)) {
        if (quad.object.termType === 'Literal' && quad.object.value === '') {
            continue;
        }

        const subjectTerm = toQueryTerm(
            quad.subject,
            rootNode,
            rootVar,
            blankNodeVars,
            subjectVariable
        );
        const predicateTerm = rdf.namedNode(quad.predicate.value);
        const objectTerm = toQueryTerm(
            quad.object,
            rootNode,
            rootVar,
            blankNodeVars,
            subjectVariable
        );

        const key = `${termKey(subjectTerm)}|${termKey(predicateTerm)}|${termKey(objectTerm)}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        triples.push([subjectTerm, predicateTerm, objectTerm]);
    }

    if (!triples.length) {
        return [];
    }

    const builder = sparqlBuilder.select([rootVar]).where(triples);
    const parsed = parser.parse(builder.toString());
    if (parsed.type !== 'query') {
        return [];
    }
    return parsed.where ? [...parsed.where] : [];
}

function toQueryTerm(
    term: Term,
    rootNode: NamedNode | BlankNode,
    rootVar: Term,
    blankNodeVars: Map<string, Term>,
    subjectVariable: string
): Term {
    if ('equals' in term && term.equals(rootNode)) {
        return rootVar;
    }

    if (term.termType === 'BlankNode') {
        let variable = blankNodeVars.get(term.value);
        if (!variable) {
            variable = rdf.variable(`${subjectVariable}_${blankNodeVars.size + 1}`);
            blankNodeVars.set(term.value, variable);
        }
        return variable;
    }

    if (term.termType === 'NamedNode') {
        return rdf.namedNode(term.value);
    }

    if (term.termType === 'Literal') {
        return toLiteral(term);
    }

    return rdf.namedNode(term.value);
}

function toLiteral(term: Term): Term {
    if (term.termType !== 'Literal') {
        throw new Error('Expected literal term');
    }
    if (term.language) {
        return rdf.literal(term.value, term.language);
    }
    const datatype =
        term.datatype && term.datatype.value !== `${PREFIX_XSD}string`
            ? rdf.namedNode(term.datatype.value)
            : undefined;
    return datatype ? rdf.literal(term.value, datatype) : rdf.literal(term.value);
}

function termKey(term: Term): string {
    switch (term.termType) {
        case 'Literal':
            return `Literal:${term.value}@${term.language || ''}^^${
                term.datatype ? term.datatype.value : ''
            }`;
        default:
            return `${term.termType}:${term.value}`;
    }
}
