import { Quad, StreamParser } from "n3"
import { ShaclForm } from "../src/form"
import { expect } from "@open-wc/testing"

export function awaitFormLoaded(form: ShaclForm) {
    return new Promise<void>(resolve => {
        // const timeout = setTimeout(resolve, initTimeout * 40)
        form.addEventListener('ready', () => {
            // clearTimeout(timeout)
            resolve()
        }, { once: true })
    })
}

export async function bind(form: ShaclForm, shapes?: string, shapeSubject?: string, values?: string, valuesSubject?: string): Promise<[Quad[], Quad[]]> {
    const result: [Quad[], Quad[]] = [[], []]
    if (shapes) {
        form.dataset.shapes = shapes
        result[0] = parse(shapes)
    }
    if (shapeSubject) {
        form.dataset.shapeSubject = shapeSubject
    }
    if (values) {
        form.dataset.values = values
        result[1] = parse(values)
    } else {
        form.dataset.values
    }
    if (valuesSubject) {
        form.dataset.valuesSubject = valuesSubject
    } else {
        delete form.dataset.valuesSubject
    }
    await awaitFormLoaded(form)
    return result
}

export function expectIsomorphic(inputQuads: Quad[], outputQuads: Quad[]) {
    try {
        expect(areIsomorphic(inputQuads, outputQuads), `expect equal input and output`).to.be.true
    } catch (e) {
        console.error('quads are not isomorphic.\n\ninput was:')
        printQuads(inputQuads)
        console.error('\noutput was:')
        printQuads(outputQuads)
        throw e
    }
}

export async function expectValid(form: ShaclForm, shapesQuads: Quad[]) {
    try {
        expect((await form.validate()).conforms, `expect to validate`).to.be.true
    } catch (e) {
        console.error('form output does not validate.\n\nshapes where:')
        printQuads(shapesQuads)
        console.error('\noutput was:\n', form.serialize())
        throw e
    }
}

function parse(rdf: string) {
    const quads: Quad[] =  []
    const parser = new StreamParser()
    parser.on('data', (quad: Quad) => {
        quads.push(new Quad(quad.subject, quad.predicate, quad.object, undefined))
    }).on('error', (error) => {
        throw Error(`failed parsing rdf (${error.message}):\n${rdf}`)
    })
    parser.write(rdf)
    parser.end()
    return quads
}

function printQuads(quads: Quad[]) {
    for (const quad of quads) {
        console.log(quad.subject.id, quad.predicate.id, quad.object.id)
    }
}

function areIsomorphic(left: Quad[], right: Quad[]) {
    if (left.length !== right.length) {
        return false
    }

    const leftBlankNodes = collectBlankNodes(left)
    const rightBlankNodes = collectBlankNodes(right)

    if (leftBlankNodes.length !== rightBlankNodes.length) {
        return false
    }

    const leftGround = left.filter(quad => !quadHasBlankNode(quad)).map(serializeGroundQuad).sort()
    const rightGround = right.filter(quad => !quadHasBlankNode(quad)).map(serializeGroundQuad).sort()
    if (leftGround.join('\n') !== rightGround.join('\n')) {
        return false
    }

    const rightCandidates = new Map(rightBlankNodes.map(id => [id, blankNodeSignature(right, id)]))
    const candidateMap = new Map(leftBlankNodes.map(id => [
        id,
        rightBlankNodes.filter(candidate => rightCandidates.get(candidate) === blankNodeSignature(left, id))
    ]))

    if ([...candidateMap.values()].some(candidates => candidates.length === 0)) {
        return false
    }

    const leftOrdered = [...leftBlankNodes].sort((a, b) => candidateMap.get(a)!.length - candidateMap.get(b)!.length)
    return matchBlankNodes(left, right, leftOrdered, candidateMap, new Map(), new Set())
}

function matchBlankNodes(
    left: Quad[],
    right: Quad[],
    remaining: string[],
    candidates: Map<string, string[]>,
    mapping: Map<string, string>,
    used: Set<string>
): boolean {
    if (remaining.length === 0) {
        return serializeMappedQuads(left, mapping) === serializeMappedQuads(right, new Map())
    }

    const [current, ...rest] = remaining
    for (const candidate of candidates.get(current) || []) {
        if (used.has(candidate)) {
            continue
        }
        mapping.set(current, candidate)
        used.add(candidate)
        if (matchBlankNodes(left, right, rest, candidates, mapping, used)) {
            return true
        }
        mapping.delete(current)
        used.delete(candidate)
    }

    return false
}

function serializeMappedQuads(quads: Quad[], mapping: Map<string, string>) {
    return quads.map(quad => {
        return [
            serializeTerm(quad.subject, mapping),
            serializeTerm(quad.predicate, mapping),
            serializeTerm(quad.object, mapping),
            serializeTerm(quad.graph, mapping)
        ].join(' ')
    }).sort().join('\n')
}

function serializeGroundQuad(quad: Quad) {
    return serializeMappedQuads([quad], new Map())
}

function serializeTerm(term: { termType: string, value: string, language?: string, datatype?: { value: string } }, mapping: Map<string, string>) {
    if (term.termType === 'BlankNode') {
        return `_:${mapping.get(term.value) || term.value}`
    }
    if (term.termType === 'Literal') {
        const language = term.language ? `@${term.language}` : ''
        const datatype = term.datatype && term.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string' ? `^^${term.datatype.value}` : ''
        return `"${term.value}"${language}${datatype}`
    }
    return `${term.termType}:${term.value}`
}

function collectBlankNodes(quads: Quad[]) {
    return [...new Set(quads.flatMap(quad => [quad.subject, quad.object, quad.graph]
        .filter(term => term.termType === 'BlankNode')
        .map(term => term.value)))]
}

function quadHasBlankNode(quad: Quad) {
    return quad.subject.termType === 'BlankNode' || quad.object.termType === 'BlankNode' || quad.graph.termType === 'BlankNode'
}

function blankNodeSignature(quads: Quad[], id: string) {
    return quads.flatMap(quad => {
        const signatures: string[] = []
        if (quad.subject.termType === 'BlankNode' && quad.subject.value === id) {
            signatures.push(`s|${quad.predicate.value}|${termShape(quad.object)}`)
        }
        if (quad.object.termType === 'BlankNode' && quad.object.value === id) {
            signatures.push(`o|${quad.predicate.value}|${termShape(quad.subject)}`)
        }
        if (quad.graph.termType === 'BlankNode' && quad.graph.value === id) {
            signatures.push(`g|${termShape(quad.subject)}|${quad.predicate.value}|${termShape(quad.object)}`)
        }
        return signatures
    }).sort().join('\n')
}

function termShape(term: { termType: string, value: string, language?: string, datatype?: { value: string } }) {
    if (term.termType === 'BlankNode') {
        return 'BlankNode'
    }
    return serializeTerm(term, new Map())
}
