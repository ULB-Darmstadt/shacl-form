import { Quad, Store, StreamParser } from "n3"
import { ShaclForm } from "../src/form"
import { expect } from "@open-wc/testing"
import { isomorphic } from "rdf-isomorphic"

export function awaitFormLoaded(form: ShaclForm) {
    return new Promise<void>(resolve => {
        const interval = setInterval(() => {
            if (form.getAttribute('loading') === null) {
                clearInterval(interval)
                resolve()
            }
        }, 150)
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
    }
    if (valuesSubject) {
        form.dataset.valuesSubject = valuesSubject
    }
    await awaitFormLoaded(form)
    return result
}

export function expectIsomorphic(inputQuads: Quad[], outputQuads: Quad[]) {
    try {
        expect(isomorphic(inputQuads, outputQuads), `expect equal input and output`).to.be.true
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