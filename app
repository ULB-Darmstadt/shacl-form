 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/src/property.ts b/src/property.ts
index 2c34b5d100842ed5a104e61fdcb786c5e1be1822..be764a4653973684b6cda98dfa4893f2180d886b 100644
--- a/src/property.ts
+++ b/src/property.ts
@@ -1,38 +1,41 @@
 import { BlankNode, DataFactory, Literal, NamedNode, Quad, Store } from 'n3'
 import { Term } from '@rdfjs/types'
 import { ShaclNode } from './node'
 import { createShaclOrConstraint, resolveShaclOrConstraintOnProperty } from './constraints'
 import { focusFirstInputElement } from './util'
 import { aggregatedMaxCount, aggregatedMinCount, cloneProperty, mergeQuads, ShaclPropertyTemplate } from './property-template'
 import { Editor, fieldFactory } from './theme'
 import { toRDF } from './serialize'
 import { findPlugin } from './plugin'
 import { DATA_GRAPH } from './constants'
 import { RokitButton, RokitCollapsible } from '@ro-kit/ui-widgets'
 import { createLinker } from './linker'
 
+const ADD_BUTTON_SELECTOR = ':scope > .add-button-wrapper, :scope > .collapsible > .add-button-wrapper'
+const PROPERTY_INSTANCE_SELECTOR = ':scope > .property-instance, :scope > .shacl-or-constraint, :scope > shacl-node, :scope > .collapsible > .property-instance'
+
 export class ShaclProperty extends HTMLElement {
     template: ShaclPropertyTemplate
     container: HTMLElement
     parent: ShaclNode
 
     constructor(template: ShaclPropertyTemplate, parent: ShaclNode) {
         super()
         this.template = template
         this.parent = parent
         this.container = this
         if (this.template.nodeShapes.size && this.template.config.attributes.collapse !== null && (this.template.maxCount === undefined || this.template.maxCount > 1)) {
             const collapsible = new RokitCollapsible()
             collapsible.classList.add('collapsible', 'shacl-group');
             collapsible.open = template.config.attributes.collapse === 'open';
             collapsible.label = this.template.label;
             this.container = collapsible
             this.appendChild(this.container)
         }
 
         if (this.template.order !== undefined) {
             this.style.order = `${this.template.order}`
         }
         if (this.template.cssClass) {
             this.classList.add(this.template.cssClass)
         }
@@ -73,134 +76,132 @@ export class ShaclProperty extends HTMLElement {
         }
     }
 
     async addPropertyInstance(value?: Term, linked?: boolean, forceRemovable = false): Promise<HTMLElement | undefined> {
         let instance: HTMLElement | undefined
         if (this.template.or?.length || this.template.xone?.length) {
             const options = this.template.or?.length ? this.template.or : this.template.xone as Term[]
             let resolved = false
             if (value) {
                 const resolvedOptions = resolveShaclOrConstraintOnProperty(options, value, this.template.config)
                 if (resolvedOptions.length) {
                     const merged = mergeQuads(cloneProperty(this.template), resolvedOptions)
                     instance = await createPropertyInstance(merged, value, !this.parent.linked, this.parent.linked)
                     resolved = true
                 }
             }
             // prevent creating constraint chooser in view mode
             if (!resolved && this.template.config.editMode) {
                 instance = createShaclOrConstraint(options, this, this.template.config)
                 appendRemoveButton(instance, '', this.template.config.theme.dense, this.template.config.hierarchyColorsStyleSheet !== undefined)
             }
         } else {
             instance = await createPropertyInstance(this.template, value, forceRemovable, linked || this.parent.linked)
         }
         if (instance) {
-            this.container.insertBefore(instance, this.querySelector(':scope > .add-button-wrapper, :scope > .collapsible > .add-button-wrapper'))
+            this.container.insertBefore(instance, this.querySelector(ADD_BUTTON_SELECTOR))
         }
         return instance
     }
 
     async updateControls() {
-        if (this.template.config.editMode && !this.parent.linked && !this.querySelector(':scope > .add-button-wrapper, :scope > .collapsible > .add-button-wrapper')) {
+        if (this.template.config.editMode && !this.parent.linked && !this.querySelector(ADD_BUTTON_SELECTOR)) {
             this.container.appendChild(await this.createAddControls())
         }
         const minCount = aggregatedMinCount(this.template)
         const literal = this.template.nodeShapes.size === 0
         const noLinkableResources = this.querySelector(':scope > .add-button-wrapper > .link-button, :scope > .collapsible > .add-button-wrapper > .link-button') === null
         let instanceCount = this.instanceCount()
         if (instanceCount === 0 && (literal || (noLinkableResources && minCount > 0))) {
-                this.addPropertyInstance()
-                instanceCount = 1
+            await this.addPropertyInstance()
+            instanceCount = 1
         }
         if (!literal) {
-            this.querySelector(':scope > .add-button-wrapper, :scope > .collapsible > .add-button-wrapper')?.classList.toggle('required', instanceCount < minCount)
+            this.querySelector(ADD_BUTTON_SELECTOR)?.classList.toggle('required', instanceCount < minCount)
         }
 
         let mayRemove: boolean
         if (minCount > 0) {
             mayRemove = instanceCount > minCount
         } else {
             mayRemove = !literal || instanceCount > 1
         }
 
         const mayAdd = instanceCount < aggregatedMaxCount(this.template)
         this.classList.toggle('may-remove', mayRemove)
         this.classList.toggle('may-add', mayAdd)
     }
 
     instanceCount() {
-        return this.querySelectorAll(":scope > .property-instance, :scope > .shacl-or-constraint, :scope > shacl-node, :scope > .collapsible > .property-instance").length
+        return this.querySelectorAll(PROPERTY_INSTANCE_SELECTOR).length
     }
 
     toRDF(graph: Store, subject: NamedNode | BlankNode) {
         const pathNode = DataFactory.namedNode(this.template.path!)
         for (const instance of this.querySelectorAll(':scope > .property-instance, :scope > .collapsible > .property-instance')) {
             if (instance.firstChild instanceof ShaclNode) {
                 const shapeSubject = instance.firstChild.toRDF(graph)
                 graph.addQuad(subject, pathNode, shapeSubject, this.template.config.valuesGraphId)
             } else {
                 if (this.template.config.editMode) {
                     for (const editor of instance.querySelectorAll<Editor>(':scope > .editor')) {
                         const value = toRDF(editor)
                         if (value) {
                             graph.addQuad(subject, pathNode, value, this.template.config.valuesGraphId)
                         }
                     }
                 }
                 else {
                     const value = toRDF(instance as Editor)
                     if (value) {
                         graph.addQuad(subject, pathNode, value, this.template.config.valuesGraphId)
                     }
                 }
             }
         }
     }
 
     async filterValidValues(values: Quad[], valueSubject: NamedNode | BlankNode) {
         // if this property is a sh:qualifiedValueShape, then filter values by validating against this shape
         let nodeShapeToValidate = this.template.id
         let dataSubjectsToValidate = [valueSubject]
         if (this.template.qualifiedValueShape) {
             nodeShapeToValidate = this.template.qualifiedValueShape.id
             dataSubjectsToValidate = []
             for (const value of values) {
                 dataSubjectsToValidate.push(value.object as NamedNode)
             }
         }
         const report = await this.template.config.validator.validate({ dataset: this.template.config.store, terms: dataSubjectsToValidate }, [{ terms: [nodeShapeToValidate] }])
-        const invalidTerms: string[] = []
+        const invalidTerms = new Set<string>()
         for (const result of report.results) {
             const reportObject = this.template.qualifiedValueShape ? result.focusNode : result.value
             if (reportObject?.ptrs?.length) {
-                invalidTerms.push(reportObject.ptrs[0]._term.id)
+                invalidTerms.add(reportObject.ptrs[0]._term.id)
             }
         }
-        return values.filter(value => {
-            return invalidTerms.indexOf(value.object.id) === -1
-        })
+        return values.filter(value => !invalidTerms.has(value.object.id))
     }
 
     async createAddControls() {
         const wrapper = document.createElement('div')
         wrapper.classList.add('add-button-wrapper')
 
         const linker = await createLinker(this)
         if (linker) {
             wrapper.appendChild(linker)
         }
 
         const addButton = this.template.config.theme.createButton(this.template.label, false)
         addButton.title = 'Add ' + this.template.label
         addButton.classList.add('add-button')
         addButton.setAttribute('text', '')
         addButton.addEventListener('click', async () => {
             const instance = await this.addPropertyInstance()
             if (instance) {
                 instance.classList.add('fadeIn')
                 await this.updateControls()
                 setTimeout(() => {
                     focusFirstInputElement(instance)
                     instance.classList.remove('fadeIn')
                 }, 200)
             }
 
EOF
)
