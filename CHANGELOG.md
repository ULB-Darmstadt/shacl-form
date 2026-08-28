# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [3.6.0] - 2026-08-28

### Added

- Expose a property's `sh:hasValue` as `QueryField.fixedValue`, allowing facet
  providers to use shape-fixed metadata without creating a query criterion.
- Add `QueryFacet.initialValue` for selecting a discrete facet value when its
  first facet response arrives. The resulting query is emitted and refreshed
  once, while later facet responses do not reapply a value the user cleared.

## [3.5.2] - 2026-08-27

### Added

- Allow query facet providers to mark a facet as unavailable even while it has
  an active criterion.

### Fixed

- Show datatype-specific validation messages for malformed fractional numbers,
  and reject exponent notation when serializing `xsd:decimal` values while
  retaining exponent support for `xsd:float` and `xsd:double`.

## [3.5.1] - 2026-08-25

- range query facets with bounds min == max do not render now

## [3.5.0] - 2026-08-24

### Added

- `QueryFacetProvider.invalidatedFields()` lets providers declare criteria that
  became invalid after a query change. Invalid criteria are cleared before the
  final query event and facet request, for example when a numeric range no
  longer applies after changing its quantity unit.

### Changed

- Replace the linked-resource text glyph with a larger, vertically centered
  paperclip icon.
- Let the `ready` event bubble across shadow DOM boundaries so containing
  applications can observe completed form initialization.
- Keep an active range slider's domain and handle positions stable across facet
  refreshes. Clearing or invalidating the range releases the domain so new
  facet bounds can take effect.

### Fixed

- Avoid rendering linked values twice when a specific inherited property and
  its generic ancestor property use the same path.
- Serialize `rdf:type` predicates as JSON-LD `@type` entries regardless of RDF
  term object identity ([#70](https://github.com/ULB-Darmstadt/shacl-form/pull/70)).

## [3.4.2] - 2026-08-11

### Added

- Support `dash:facet` in query mode. Property shapes marked with
  `dash:facet true` render as discrete facet dropdowns; structured properties
  facet over their referenced resources instead of recursively exposing nested
  fields. A referenced node shape may provide the same default for all incoming
  properties, while `dash:facet true` or `dash:facet false` on an individual
  property overrides that node-shape default.

### Fixed

- Prevent HTML and script injection through untrusted button labels by rendering
  button content as text instead of assigning it as HTML ([#69](https://github.com/ULB-Darmstadt/shacl-form/pull/69)).

## [3.4.1] - 2026-08-07

### Fixed

- Emit the most specific property shape id for qualified branches merged into
  their generic base shape, so queries resolve to the per-quantity-kind fields
  the indexer writes instead of a single merged Solr field.

## [3.4.0] - 2026-07-27

### Added

- Add opt-in `data-preserve-unmapped-values` support for editing a SHACL-defined
  projection without discarding unrelated triples from the original values dataset.

### Fixed

- Vertically align labels and field and node-shape validation markers with
  `@ro-kit/ui-widgets` controls while keeping multiline fields aligned with
  their first text line.
- Respect editor constraint validity when displaying field state, so values that
  violate `sh:pattern` are marked invalid instead of receiving a valid marker.
- Show and merge native editor and SHACL validation messages, prefer an explicit
  `sh:message` over the native message, and focus the actual input of an invalid
  select when submission is blocked.
- Serialize overlapping validation runs and prevent stale results from
  overwriting the latest field state.
- Apply nested validation results from composite constraints such as `sh:node`
  to their affected fields, including `sh:uniqueLang` violations.
- Keep initially empty required widget inputs invalid for form submission while
  deferring their initial error styling, and synchronize pattern and select
  validity across value and constraint changes.

## [3.3.0] - 2026-07-27

### Added

- Support predicate-only `sh:alternativePath` property paths in edit, view, and
  query modes, including per-value predicate selection, branch-specific
  companion property constraints, and SPARQL unions.

### Fixed

- Keep an explicitly configured scalar editor such as `sh:in` when a separate
  same-path property shape contributes a validation-only `sh:node` constraint.
- Merge display metadata (`sh:name` and `sh:description`) deterministically across same-path property shapes,
  while retaining more-specific metadata for inherited property overrides.
- Combine `sh:minCount` and `sh:qualifiedMinCount` using the highest minimum,
  and `sh:maxCount` and `sh:qualifiedMaxCount` using the lowest maximum.
- Keep keyboard tab order aligned with the visual `sh:order` of properties and
  groups, including within nested node shapes.
- Keep the initial query form hidden until its first facet response is applied,
  preventing the unfiltered form from flashing before facet-based controls render.
- Apply form theme styles during initialization so graph-loading and facet-loading
  messages have consistent typography and colors.
- Let applications style the visible facet-count text through the exported
  `facet-count` CSS part.
- Use the `loading` host attribute as the single state for graph and initial
  facet loading so applications can style both phases consistently.

## [3.2.1] - 2026-07-22

### Changed

- Allow N3 2.x as a peer dependency while retaining support for N3 1.x.
- Update `@ro-kit/ui-widgets` to 1.0.50 for enhanced select controls.

### Fixed

- Bundle N3 into the optional SPARQL entry point so `sparql.js` can be loaded
  directly in browsers without an additional import map.


## [3.2.0] - 2026-07-20

### Added

- Add query mode for creating backend-neutral search criteria from SHACL node shapes.
- Add query events and the `getQuery()`, `setQueryFacetProvider()`, and
  `refreshQueryFacets()` APIs.
- Add optional facet support for discrete values, numeric and temporal ranges,
  field availability, and field-level errors.
- Add the `@ulb-darmstadt/shacl-form/sparql` entry point with
  `SparqlQueryBuilder` and `SparqlQueryProvider`.
- Add `data-mode` with explicit `edit`, `view`, and `query` values while retaining
  compatibility with `data-view`.
- Add Leaflet query filters with geometry buckets and heatmap facets.
- Add human-readable labels for resources supplied by a resource link provider.

### Changed

- Allow the same resource to be linked more than once where the shape permits it.
- Collapse compatible numeric `sh:or` and `sh:xone` alternatives into one range
  filter in query mode.
- Prune `sh:or` and `sh:xone` alternatives ruled out by an overriding
  `sh:datatype`, `sh:class`, or `sh:nodeKind` constraint while preserving the
  surviving branch's constraints.
- Update `shacl-engine`, `@ro-kit/ui-widgets`, Leaflet fullscreen, and the build
  toolchain.
- Add `leaflet.heat` as a peer dependency for Leaflet heatmap facets.
- Make published TypeScript declarations compatible with NodeNext, bundler, and
  legacy TypeScript module resolution.

### Fixed

- Produce correctly language-tagged RDF literals for language-constrained query
  fields and apply their language in generated SPARQL.
- Preserve labels for lazily loaded resources in the resource-linking interface.
- Keep constraints from the uniquely compatible branch of an overridden
  `sh:or` or `sh:xone` property.
- Merge inherited `sh:qualifiedValueShape` properties when both their containing
  shapes and value shapes form matching specialization chains.
- Accept both dot and comma decimal separators in `xsd:float`, `xsd:double`, and
  `xsd:decimal` editors regardless of the browser locale.
- Omit optional unchecked `xsd:boolean` fields instead of serializing the native
  checkbox value `"on"`.

## Reconstructed release history

The entries below were reconstructed from Git tags, commit messages, and the
diffs between releases. They are less detailed than entries maintained at the
time of release.

## [3.1.0](https://github.com/ULB-Darmstadt/shacl-form/releases/tag/v3.1.0) - 2026-06-22

### Added

- Add a general `RdfUrlResolver` callback for loading RDF, replacing the more
  narrowly scoped import-provider API.

### Changed

- Expand the documentation for RDF loading and external resource resolution.

## [3.0.7](https://github.com/ULB-Darmstadt/shacl-form/releases/tag/v3.0.7) - 2026-06-03

### Fixed

- Preserve timezone information when binding and serializing `xsd:date` and
  `xsd:dateTime` values.
- Correct a logical error in the serializer.

### Changed

- Update the CI and publishing environment to Node.js 24.

## [3.0.6](https://github.com/ULB-Darmstadt/shacl-form/releases/tag/v3.0.6) - 2026-06-02

### Added

- Add value binding for `xsd:base64Binary` data.

### Fixed

- Fix binding existing values to `sh:or` and `sh:xone` properties.
- Ensure properties of lazily instantiated node shapes are merged correctly.

## [3.0.5](https://github.com/ULB-Darmstadt/shacl-form/releases/tag/v3.0.5) - 2026-05-07

### Added

- Restore the geolocation demonstration.
- Support language-tagged validation messages.

### Fixed

- Bind `sh:defaultValue` correctly for `sh:class` and `sh:in` lists.
- Allow arbitrary decimal precision in non-integer numeric editors.
- Require a language tag only when a language-string editor contains a value.

## [3.0.4](https://github.com/ULB-Darmstadt/shacl-form/releases/tag/v3.0.4) - 2026-03-27

### Added

- Use `dcterms:conformsTo` to discover both the values subject and root shape.

### Changed

- Update GitHub workflows and dependencies to address security warnings.

## [3.0.3](https://github.com/ULB-Darmstadt/shacl-form/releases/tag/v3.0.3) - 2026-03-27

### Fixed

- Strengthen recursion protection when required nested nodes are generated.
- Fix `sh:or` handling on node shapes.
- Avoid unsafe `innerHTML` usage in form rendering.

## [3.0.2](https://github.com/ULB-Darmstadt/shacl-form/releases/tag/v3.0.2) - 2026-02-18

### Fixed

- Bind boolean `sh:defaultValue` values correctly.
- Fix hierarchy coloring for linked resources in edit mode.
- Show labels on all `sh:or` and `sh:xone` property instances.

## [3.0.1](https://github.com/ULB-Darmstadt/shacl-form/releases/tag/v3.0.1) - 2026-02-10

### Added

- Export shadow-DOM parts so applications can style component internals.

### Fixed

- Fix add-button styling in collapsible groups.

## [3.0.0](https://github.com/ULB-Darmstadt/shacl-form/releases/tag/v3.0.0) - 2026-02-09

### Added

- Add a redesigned resource-link provider with lazy loading of external
  resources.
- Add optional light-DOM rendering alongside the default shadow DOM.
- Add `sh:qualifiedMaxCount` handling and label resolution for node shapes used
  in `sh:or` and `sh:xone` lists.

### Changed

- Improve initialization, validation, and resource-loading race handling.
- Apply dense-mode styling consistently to generated controls.

### Fixed

- Avoid unnecessary remove controls and `sh:or` selectors in viewer mode.
- Support proxied loading of `urn:` resources.

## [2.0.8](https://github.com/ULB-Darmstadt/shacl-form/releases/tag/v2.0.8) - 2026-01-24

### Added

- Add project linting and broaden JSON-LD top-level array support.
- Expose bound values after the `ready` event, including in viewer mode.

### Fixed

- Correct datatype and language handling during serialization.
- Fix removal controls for linked resources and prefix removal from identifiers.

## [2.0.7](https://github.com/ULB-Darmstadt/shacl-form/releases/tag/v2.0.7) - 2026-01-13

### Added

- Export SHACL property mapper functions so applications can customize mapping.

## [2.0.6](https://github.com/ULB-Darmstadt/shacl-form/releases/tag/v2.0.6) - 2026-01-13

### Changed

- Support hierarchy colors in viewer mode.
- Repair package-lock metadata.

## [2.0.5](https://github.com/ULB-Darmstadt/shacl-form/releases/tag/v2.0.5) - 2026-01-12

### Fixed

- Correct minimum-count handling on overridden properties.

## [2.0.4](https://github.com/ULB-Darmstadt/shacl-form/releases/tag/v2.0.4) - 2026-01-12

### Fixed

- Restore a compatible N3 dependency version and correct package metadata.

## [2.0.3](https://github.com/ULB-Darmstadt/shacl-form/releases/tag/v2.0.3) - 2026-01-09

### Added

- Preserve and handle named graphs in bound RDF data.

### Fixed

- Fix removal of bound values and controls for linked resources.
- Propagate linked-resource state through inherited shapes.

## [2.0.2](https://github.com/ULB-Darmstadt/shacl-form/releases/tag/v2.0.2) - 2025-12-19

### Fixed

- Filter invalid values only when a node shape defines multiple properties on
  the same path.

## [2.0.1](https://github.com/ULB-Darmstadt/shacl-form/releases/tag/v2.0.1) - 2025-12-09

### Added

- Add an option to display the root shape label as a form heading.

### Fixed

- Correct the import map used by the demo.

## [2.0.0](https://github.com/ULB-Darmstadt/shacl-form/releases/tag/v2.0.0) - 2025-11-21

### Added

- Add property refinement through `sh:node` and `sh:and`.
- Add horizontal and vertical merging of overridden properties.
- Add nested hierarchy color bars and configurable dense mode.
- Add RDF caching and validation-assisted binding for qualified value shapes.

### Changed

- Overhaul the build and bundle, including a bundle with all runtime
  dependencies.
- Remove the Bootstrap and Material Design alpha themes.
- Change `data-generate-node-shape-reference` semantics to avoid unnecessary
  `dcterms:conformsTo` statements.
- Bind values from the most specific property downward to prevent duplicates.

### Fixed

- Improve root-shape selection, property overriding, qualified-value-shape
  handling, literal serialization, and `sh:hasValue` binding.

## 1.10 series - 2025-08-26 to 2025-09-12

- Replace the shared-shapes-graph option with configurable proxy-based loading.
- Fix RDF-list value binding, serialization, and named-node selection.

## 1.9 series - 2025-07-21 to 2025-07-31

- Add RDF/XML loading and fix parser reuse across multiple loads.
- Improve npm packaging and update UI dependencies.

## 1.8 series - 2025-07-09 to 2025-07-18

- Add hierarchical RDF instance selection, including `skos:broader` and
  `skos:narrower` relationships.
- Improve form controls and general UI behavior.

## 1.7 series - 2025-04-30 to 2025-07-01

- Return validation reports from `validate()` and attach them to change events.
- Introduce qualified value shapes and `sh:xone` support.
- Bind values on node shapes using `sh:or` and `sh:xone`.

## 1.6 series - 2024-09-11 to 2025-04-23

- Add named-graph serialization through `data-values-graph`.
- Add read-only properties using `dash:readonly`.
- Improve map polygon drawing, themes, required-field styling, and the build.

## 1.5 series - 2024-08-01 to 2024-08-06

- Add `data-generate-node-shape-reference`.
- Fix asynchronous loading of external references.
- Switch SHACL validation to `rdf-ext/shacl-engine`.

## 1.4 series - 2024-03-15 to 2024-07-24

- Improve plugin registration and disable editors for `sh:hasValue` properties.
- Rename `valueSubject` to `valuesSubject`.
- Fix date-time generation, preferred-language labels, RDF language strings,
  and circular-reference recursion.

## 1.3 series - 2023-11-03 to 2024-03-05

- Improve theming, layout, inherited-shape headings, and documentation.
- Fix browser and SHACL validation ordering and Mapbox coordinate order.
- Add and repair GitHub Actions publishing workflows.

## 1.2 series - 2023-10-30 to 2023-11-01

- Improve theming and documentation and correct the demo bundle URL.

## 1.1 series - 2023-08-17 to 2023-10-19

- Add recursive `rdfs:subClassOf` instance resolution.
- Improve `sh:or` cardinality, data binding, and validation feedback.
- Improve the Mapbox plugin, CDN demo, and documentation.

## 1.0 series - 2023-01-10 to 2023-07-28

- Establish the initial package build, publishing setup, and demonstration site.

[Unreleased]: https://github.com/ULB-Darmstadt/shacl-form/compare/v3.3.1...HEAD
[3.3.1]: https://github.com/ULB-Darmstadt/shacl-form/compare/v3.3.0...v3.3.1
[3.3.0]: https://github.com/ULB-Darmstadt/shacl-form/compare/v3.2.1...v3.3.0
[3.2.1]: https://github.com/ULB-Darmstadt/shacl-form/compare/v3.2.0...v3.2.1
[3.2.0]: https://github.com/ULB-Darmstadt/shacl-form/compare/v3.1.0...v3.2.0
