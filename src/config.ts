import { DataFactory, NamedNode, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { DCTERMS_PREDICATE_CONFORMS_TO, PREFIX_SHACL, RDF_PREDICATE_TYPE } from './constants'
import { ClassInstanceProvider, ResourceLinkProvider } from './plugin'
import { Theme } from './theme'
import { extractLists } from './util'
import { DefaultTheme } from './theme.default'
import { Validator } from 'shacl-engine'
import { ShaclNodeTemplate } from './node-template'
import { ShaclPropertyTemplate } from './property-template'

export class ElementAttributes {
    shapes: string | null = null
    shapesUrl: string | null = null
    shapeSubject: string | null = null
    values: string | null = null
    valuesUrl: string | null = null
    /**
     * @deprecated Use valuesSubject instead
     */
    valueSubject: string | null = null // for backward compatibility
    valuesSubject: string | null = null
    valuesNamespace = ''
    valuesGraph: string | null = null
    view: string | null = null
    language: string | null = null
    loading: string = 'Loading\u2026'
    proxy: string | null = null
    ignoreOwlImports: string | null = null
    collapse: string | null = null
    hierarchyColors: string | null = null
    submitButton: string | null = null
    generateNodeShapeReference: string = DCTERMS_PREDICATE_CONFORMS_TO.value
    showNodeIds: string | null = null
    showRootShapeLabel: string | null = null
    dense: string = 'true'
    useShadowRoot: string = 'true'
}

const defaultHierarchyColorPalette = '#4c93d785, #f85e9a85, #00327385, #87001f85'

export class Config {
    attributes = new ElementAttributes()
    classInstanceProvider: ClassInstanceProvider | undefined
    resourceLinkProvider: ResourceLinkProvider | undefined
    editMode = true
    languages: string[]

    lists: Record<string, Term[]> = {}
    groups: string[] = []
    form: HTMLElement
    renderedNodes = new Set<string>()
    valuesGraphId: NamedNode | undefined
    hierarchyColorsStyleSheet: CSSStyleSheet | undefined
    private _store = new Store()
    private _theme: Theme
    // templates are stored here to prevent recursion errors
    private _nodeTemplates: Record<string, ShaclNodeTemplate> = {}
    private _propertyTemplates: Record<string, ShaclPropertyTemplate> = {}
    validator = new Validator(this._store, { details: true, factory: DataFactory })
    // shape id -> conforming resource ids
    providedConformingResourceIds: Record<string, Set<string>> = {}
    // resource id -> resource RDF
    providedResources: Record<string, string> = {}

    constructor(form: HTMLElement) {
        this.form = form
        this._theme = new DefaultTheme()
        this.languages = [...new Set(navigator.languages.flatMap(lang => {
            if (lang.length > 2) {
                // for each 5 letter lang code (e.g. de-DE) append its corresponding 2 letter code (e.g. de) directly afterwards
                return [lang.toLocaleLowerCase(), lang.substring(0, 2)]
            }
            return lang
        })), ''] // <-- append empty string to accept RDF literals with no language
    }

    reset() {
        this.lists = {}
        this.groups = []
        this.renderedNodes.clear()
        this.providedConformingResourceIds = {}
        this.providedResources = {}
        this._nodeTemplates = {}
        this._propertyTemplates = {}
    }

    updateAttributes(elem: HTMLElement) {
        const atts = new ElementAttributes();
        (Object.keys(atts) as Array<keyof ElementAttributes>).forEach(key => {
            const value = elem.dataset[key]
            if (value !== undefined) {
                atts[key] = value
            }
        })
        this.editMode = atts.view === null
        this.theme.setDense(atts.dense === 'true')
        this.attributes = atts
        // for backward compatibility
        if (this.attributes.valueSubject && !this.attributes.valuesSubject) {
            this.attributes.valuesSubject = this.attributes.valueSubject
        }
        if (atts.language) {
            const index = this.languages.indexOf(atts.language)
            if (index > -1) {
                // remove preferred language from the list of languages
                this.languages.splice(index, 1)
            }
            // now prepend preferred language at start of the list of languages
            this.languages.unshift(atts.language)
        }
        if (atts.valuesGraph) {
            this.valuesGraphId = DataFactory.namedNode(atts.valuesGraph)
        }
        if (atts.hierarchyColors != null) {
            const palette = atts.hierarchyColors.length ? atts.hierarchyColors : defaultHierarchyColorPalette
            let css = `:host { --hierarchy-colors: ${palette}; --hierarchy-colors-length: ${palette.split(',').length} }`
            // generate hierarchy level css variables
            for (let level = 8; level >= 0; level--) {
                let rule = `shacl-property { --hierarchy-level: ${level} }`
                for (let i = 0; i < level; i++) {
                    rule = 'shacl-property ' + rule
                }
                css = css + '\n' + rule
            }
            this.hierarchyColorsStyleSheet = new CSSStyleSheet()
            this.hierarchyColorsStyleSheet.replaceSync(css)
        }
    }

    static dataAttributes(): Array<string> {
        const atts = new ElementAttributes()
        return Object.keys(atts).map(key => {
            // convert camelcase key to kebap case
            key = key.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
            return 'data-' + key
        })
    }

    // we're not caching templates on their ID alone, but on the complete parent ID hierarchy to allow for property overriding
    private buildTemplateKey(id: Term, parent?: ShaclNodeTemplate | ShaclPropertyTemplate): string {
        let key = id.value
        if (parent) {
            if (parent instanceof ShaclPropertyTemplate) {
                key += '*' + parent.id.value
            } else {
                key += '*' + this.buildTemplateKey(parent.id, parent.parent)
            }
        }
        return key
    }

    registerNodeTemplate(template: ShaclNodeTemplate) {
        this._nodeTemplates[this.buildTemplateKey(template.id, template.parent)] = template
    }

    registerPropertyTemplate(template: ShaclPropertyTemplate) {
        this._propertyTemplates[this.buildTemplateKey(template.id, template.parent)] = template
    }

    getNodeTemplateIds() {
        const templateIds = new Set<string>()
        for (const template of Object.values(this._nodeTemplates)) {
            templateIds.add(template.id.value)
        }
        return templateIds
    }

    getNodeTemplate(id: Term, parent: ShaclNodeTemplate | ShaclPropertyTemplate) {
        const key = this.buildTemplateKey(id, parent)
        let shape = this._nodeTemplates[key]
        if (!shape) {
            shape = new ShaclNodeTemplate(id, this, parent)
            // dont' need to register the new shape in _nodeTemplates because this is done in the constructor
        }
        return shape
    }

    getPropertyTemplate(id: Term, parent: ShaclNodeTemplate) {
        const key = this.buildTemplateKey(id, parent)
        let shape = this._propertyTemplates[key]
        if (!shape) {
            shape = new ShaclPropertyTemplate(id, parent)
            // dont' need to register the new shape in _propertyTemplates because this is done in the constructor
        }
        return shape
    }

    get nodeTemplates() {
        return Object.values(this._nodeTemplates)
    }

    get theme() {
        return this._theme
    }

    set theme(theme: Theme) {
        this._theme = theme
        theme.setDense(this.attributes.dense === 'true')
    }

    get store() {
        return this._store
    }

    set store(store: Store) {
        this._store = store
        this.lists = extractLists(store, { ignoreErrors: true })
        this.groups = []
        store.forSubjects(subject => {
            this.groups.push(subject.id)
        }, RDF_PREDICATE_TYPE, `${PREFIX_SHACL}PropertyGroup`, null)
        this.validator = new Validator(store, { details: true, factory: DataFactory })
    }
}
