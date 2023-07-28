import { NamedNode, Quad, Quad_Object } from 'n3'
import { PREFIX_SHACL, PREFIX_OWL } from './prefixes'

export const SHAPES_GRAPH: NamedNode = new NamedNode("shapes")
export const OWL_IMPORTS: NamedNode = new NamedNode(`${PREFIX_OWL}imports`)

export function findObjectValueByPredicate(quads: Quad[], predicate: string, prefix: string = PREFIX_SHACL, language?: string | null): string {
    let result = ''
    const object = findObjectByPredicate(quads, predicate, prefix, language)
    if (object) {
        result = object.value
    }
    return result
}

export function findObjectByPredicate(quads: Quad[], predicate: string, prefix: string = PREFIX_SHACL, language?: string | null): Quad_Object | null {
    let candidate: Quad_Object | null = null
    const prefixedPredicate = prefix + predicate
    for (const quad of quads) {
        if (quad.predicate.value === prefixedPredicate) {
            if (language) {
                if (quad.object.id.endsWith(`@${language}`)) {
                    return quad.object
                }
                else if (quad.object.id.indexOf('@') < 0) {
                    candidate = quad.object
                } else if (!candidate) {
                    candidate = quad.object
                }
            }
            else {
                return quad.object
            }
        }
    }
    return candidate
}

export function focusFirstInputElement(context: HTMLElement) {
    (context.querySelector('input,select,textarea') as HTMLElement)?.focus()
}