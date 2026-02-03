import { DataFactory, Store } from "n3";
import { Config } from "./config";
import { DATA_GRAPH, SHAPES_GRAPH } from "./constants";
import { importRDF, LoaderContext, parseRDF } from "./loader";
import { createPropertyInstance, ShaclProperty } from "./property";
import { filterOutExistingItems, findLabel } from "./util";
import { Term } from "@rdfjs/types";
import { RokitDialog } from "@ro-kit/ui-widgets";
import { ShaclPropertyTemplate } from "./property-template";
import { InputListEntry } from "./theme";

export async function createLinker(property: ShaclProperty): Promise<HTMLElement | undefined> {
    // we only link to resources that must conform to a SHACL node shape
    if (property.template.nodeShapes.size === 0) {
        return
    }
    const provider = property.template.config.resourceLinkProvider
    if (!provider || (provider && !provider.lazyLoad)) {
        await loadConformingResources(property.template)
        if (findLinkCandidates(property).length === 0) {
            // no linkable resources found
            return
        }
    }

    const linkButton = property.template.config.theme.createButton(property.template.label, false)
    linkButton.title = 'Link existing ' + property.template.label
    linkButton.classList.add('link-button')
    linkButton.setAttribute('text', '')
    linkButton.addEventListener('click', async () => {
        if (provider?.lazyLoad) {
            linkButton.classList.add('loading')
            await loadConformingResources(property.template)
            linkButton.classList.remove('loading')
        }
        const candidates = findLinkCandidates(property)
        if (candidates.length === 0) {
            linkButton.innerText = 'No linkable resources found'
            linkButton.setAttribute('disabled', '')
            setTimeout(() => linkButton.remove(), 2000)
        } else {
            let dialog: RokitDialog | null = property.template.config.form.querySelector('#dialog')
            if (!dialog) {
                dialog = new RokitDialog()
                dialog.classList.add('link-chooser')
                dialog.closable = true
                property.template.config.form.appendChild(dialog)
            }
            dialog.title = 'Link existing ' + property.template.label
            buildLinkDialogContent(dialog, property, candidates)
            dialog.open = true
        }
    })
    return linkButton
}

function buildLinkDialogContent(dialog: RokitDialog, property: ShaclProperty, candidates: InputListEntry[]) {
    const content = document.createElement('div')
    for (const candidate of candidates) {
        const option = document.createElement('div')
        option.classList.add('link-option')
        option.title = 'Link this resource'
        option.innerText = candidate.label || candidate.value as string
        option.addEventListener('click', () => {
            addLink((candidate.value as string), property)
            dialog.open = false
        })
        content.appendChild(option)
    }
    dialog.replaceChildren(content)
}

export function findLinkCandidates(property: ShaclProperty): InputListEntry[] {
    const result: InputListEntry[] = []
    if (property.template.config.resourceLinkProvider) {
        for (const shape of property.template.nodeShapes) {
            if (property.template.config.providedConformingResourceIds[shape.id.value]) {
                for (const resourceId of property.template.config.providedConformingResourceIds[shape.id.value]) {
                    // check if already bound as value
                    if (property.querySelector(`:scope > .property-instance > shacl-node[data-node-id='${resourceId}'], :scope > .collapsible > .property-instance > shacl-node[data-node-id='${resourceId}']`) === null) {
                        result.push({ value: resourceId, label: findLabel(property.template.config.store.getQuads(DataFactory.namedNode(resourceId), null, null, null), property.template.config.languages), children: [] })
                    }
                }
            }
        }
    }
    return result
}

async function addLink(resourceId: string, property: ShaclProperty) {
    const id = DataFactory.namedNode(resourceId)
    if (isLinkCandidate(id, property.template.config.store)) {
        // import resource if not already done
        if (property.template.config.providedResources[resourceId]?.length > 0) {
            const ctx: LoaderContext = { store: property.template.config.store, importedUrls: [], atts: { loadOwlImports: false }}
            await importRDF(parseRDF(property.template.config.providedResources[resourceId]), ctx, SHAPES_GRAPH)
            property.template.config.providedResources[resourceId] = ''
        }
        const instance = await createPropertyInstance(property.template, id, true, true)
        property.container.insertBefore(instance, property.querySelector(':scope > .add-button-wrapper'))
        await property.updateControls()
    }
}

export async function loadConformingResources(property: ShaclPropertyTemplate) {
    const provider = property.config.resourceLinkProvider
    if (!provider) {
        return
    }
    const shapeIds = new Set(Array.from(property.nodeShapes).map(shape => shape.id.value))
    if (shapeIds.size === 0) {
        return
    }
    // remove already requested shape ids
    const filteredShapes = filterOutExistingItems(Object.keys(property.config.providedConformingResourceIds), shapeIds)
    if (filteredShapes.length === 0) {
        return
    }
    try {
        const result: Record<string, { resourceId: string, resourceRDF: string}[]> = {}
        const conformingResources = await provider.listConformingResources(filteredShapes, property)
        if (conformingResources) {
            for (const shapeId of Object.keys(conformingResources)) {
                const resourceIds = new Set(conformingResources[shapeId])
                property.config.providedConformingResourceIds[shapeId] = resourceIds
                if (!result[shapeId]) {
                    result[shapeId] = []
                }
                result[shapeId].push(...await loadResources(resourceIds, false, property.config))
            }
        }
    } catch(e) {
        console.error('failed loading conforming resources', e)
    }
}

export async function loadResources(ids: Set<string>, addToStore: boolean, config: Config) {
    if (config.resourceLinkProvider && ids.size > 0) {
        const filteredIds: string[] = []
        for (const id of ids) {
            if (!config.providedResources[id]) {
                filteredIds.push(id)
            }
        }
        try {
            const resources = await config.resourceLinkProvider.loadResources(filteredIds)
            if (resources) {
                const ctx: LoaderContext = {
                    store: config.store,
                    importedUrls: [],
                    atts: { loadOwlImports: false }
                }
                for (const resource of resources) {
                    // cache resource
                    config.providedResources[resource.resourceId] = resource.resourceRDF
                    if (addToStore) {
                        await importRDF(parseRDF(resource.resourceRDF), ctx, SHAPES_GRAPH)
                    }
                }
                return resources
            }
            // mark ids not returned by provider as loaded to prevent requesting them again
            for (const id of filteredIds) {
                if (!config.providedResources[id]) {
                    config.providedResources[id] = ''
                }
            }
        } catch(e) {
            console.error('failed loading resources', e)
        }
    }
    return []
}

export async function loadUnresolvedValues(config: Config) {
    const candidates = new Set<string>()
    for (const q of config.store.getQuads(null, null, null, DATA_GRAPH)) {
        if (isLinkCandidate(q.object, config.store)) {
            candidates.add(q.object.value)
        }
    }
    await loadResources(candidates, true, config)
}

function isLinkCandidate(id: Term, store: Store) {
    if (id.termType === 'NamedNode' && store.countQuads(id, null, null, null) === 0) {
        return true
    }
    return false
}