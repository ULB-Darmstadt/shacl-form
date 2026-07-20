import * as L from 'leaflet'
import 'leaflet-editable/src/Leaflet.Editable.js'
import leafletCss from 'leaflet/dist/leaflet.css?raw'
import leafletFullscreenCss from 'leaflet.fullscreen/dist/Control.FullScreen.css?raw'
import 'leaflet.fullscreen'
import type {} from 'leaflet.heat'
import { Term } from '@rdfjs/types'
import { Point, Polygon } from 'geojson'
import 'leaflet.heat/dist/leaflet-heat.js'
import { RokitButton } from '@ro-kit/ui-widgets'

import { DataFactory } from 'n3'
import { Plugin, PluginOptions } from '../plugin.js'
import { Editor, fieldFactory } from '../theme.js'
import { ShaclPropertyTemplate } from '../property-template.js'
import type { QueryCriterion, QueryEditor, QueryFacet, QueryField, HeatmapGrid } from '../query/index.js'

const scopedLeafletFullscreenCss = leafletFullscreenCss.replace(':root', ':host')

const css = `
#shaclMapDialog .closeButton { position: absolute; right: 0; top: 0; z-index: 1000; padding: 6px 8px; cursor: pointer; border: 0; background-color: #FFFA; font-size: 24px; }
#shaclMapDialog { padding: 0; width:90vw; height: 90vh; margin: auto; }
#shaclMapDialog::backdrop { background-color: #0007; }
#shaclMapDialog .closeButton:hover { background-color: #FFF }
#shaclMapDialog .hint { position: absolute; right: 60px; top: 3px; z-index: 1000; padding: 4px 6px; background-color: #FFFA; border-radius: 4px; pointer-events: none; }
.leaflet-container { min-height: 300px; }
#shaclMapDialogContainer { width:100%; height: 100%; }
.query-editor .query-map { height: 250px; min-height: 250px; width: 100%; flex-basis: 100%; margin-top: 4px; }
.query-editor .query-map .leaflet-pane, .query-editor .query-map .leaflet-top { z-index: 0; }
.query-editor .query-map .leaflet-heatmap-layer { opacity: 0.5; }
.query-editor.query-map-editor { flex-wrap: wrap; align-items: stretch; }
.query-editor.query-map-editor > label { width: auto; flex-basis: 100%; padding-right: 0; }
.query-editor.query-map-editor > .query-controls { position: relative; flex-basis: 100%; }
.query-editor .query-map-clear { position: absolute; top: 8px; right: 8px; z-index: 1; }
.query-editor .query-map-clear::part(button) { background-color: rgba(255, 255, 255, 0.9); }
.query-editor .query-map-clear[hidden] { display: none; }
`
const dialogTemplate = `
<dialog id="shaclMapDialog">
<div id="shaclMapDialogContainer"></div>
<div class="hint">&#x24D8; Draw a polygon or marker, then close dialog</div>
<button class="closeButton" type="button">&#x2715;</button>
</dialog>`

const defaultCenter = { lng: 8.657238961696038, lat: 49.87627570549512 }
const attribution = '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
const tileSource = 'https://tile.openstreetmap.de/{z}/{x}/{y}.png'

const markerIcon = L.icon({
    iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAApCAYAAADAk4LOAAAFgUlEQVR4Aa1XA5BjWRTN2oW17d3YaZtr2962HUzbDNpjszW24mRt28p47v7zq/bXZtrp/lWnXr337j3nPCe85NcypgSFdugCpW5YoDAMRaIMqRi6aKq5E3YqDQO3qAwjVWrD8Ncq/RBpykd8oZUb/kaJutow8r1aP9II0WmLKLIsJyv1w/kqw9Ch2MYdB++12Onxee/QMwvf4/Dk/Lfp/i4nxTXtOoQ4pW5Aj7wpici1A9erdAN2OH64x8OSP9j3Ft3b7aWkTg/Fm91siTra0f9on5sQr9INejH6CUUUpavjFNq1B+Oadhxmnfa8RfEmN8VNAsQhPqF55xHkMzz3jSmChWU6f7/XZKNH+9+hBLOHYozuKQPxyMPUKkrX/K0uWnfFaJGS1QPRtZsOPtr3NsW0uyh6NNCOkU3Yz+bXbT3I8G3xE5EXLXtCXbbqwCO9zPQYPRTZ5vIDXD7U+w7rFDEoUUf7ibHIR4y6bLVPXrz8JVZEql13trxwue/uDivd3fkWRbS6/IA2bID4uk0UpF1N8qLlbBlXs4Ee7HLTfV1j54APvODnSfOWBqtKVvjgLKzF5YdEk5ewRkGlK0i33Eofffc7HT56jD7/6U+qH3Cx7SBLNntH5YIPvODnyfIXZYRVDPqgHtLs5ABHD3YzLuespb7t79FY34DjMwrVrcTuwlT55YMPvOBnRrJ4VXTdNnYug5ucHLBjEpt30701A3Ts+HEa73u6dT3FNWwflY86eMHPk+Yu+i6pzUpRrW7SNDg5JHR4KapmM5Wv2E8Tfcb1HoqqHMHU+uWDD7zg54mz5/2BSnizi9T1Dg4QQXLToGNCkb6tb1NU+QAlGr1++eADrzhn/u8Q2YZhQVlZ5+CAOtqfbhmaUCS1ezNFVm2imDbPmPng5wmz+gwh+oHDce0eUtQ6OGDIyR0uUhUsoO3vfDmmgOezH0mZN59x7MBi++WDL1g/eEiU3avlidO671bkLfwbw5XV2P8Pzo0ydy4t2/0eu33xYSOMOD8hTf4CrBtGMSoXfPLchX+J0ruSePw3LZeK0juPJbYzrhkH0io7B3k164hiGvawhOKMLkrQLyVpZg8rHFW7E2uHOL888IBPlNZ1FPzstSJM694fWr6RwpvcJK60+0HCILTBzZLFNdtAzJaohze60T8qBzyh5ZuOg5e7uwQppofEmf2++DYvmySqGBuKaicF1blQjhuHdvCIMvp8whTTfZzI7RldpwtSzL+F1+wkdZ2TBOW2gIF88PBTzD/gpeREAMEbxnJcaJHNHrpzji0gQCS6hdkEeYt9DF/2qPcEC8RM28Hwmr3sdNyht00byAut2k3gufWNtgtOEOFGUwcXWNDbdNbpgBGxEvKkOQsxivJx33iow0Vw5S6SVTrpVq11ysA2Rp7gTfPfktc6zhtXBBC+adRLshf6sG2RfHPZ5EAc4sVZ83yCN00Fk/4kggu40ZTvIEm5g24qtU4KjBrx/BTTH8ifVASAG7gKrnWxJDcU7x8X6Ecczhm3o6YicvsLXWfh3Ch1W0k8x0nXF+0fFxgt4phz8QvypiwCCFKMqXCnqXExjq10beH+UUA7+nG6mdG/Pu0f3LgFcGrl2s0kNNjpmoJ9o4B29CMO8dMT4Q5ox8uitF6fqsrJOr8qnwNbRzv6hSnG5wP+64C7h9lp30hKNtKdWjtdkbuPA19nJ7Tz3zR/ibgARbhb4AlhavcBebmTHcFl2fvYEnW0ox9xMxKBS8btJ+KiEbq9zA4RthQXDhPa0T9TEe69gWupwc6uBUphquXgf+/FrIjweHQS4/pduMe5ERUMHUd9xv8ZR98CxkS4F2n3EUrUZ10EYNw7BWm9x1GiPssi3GgiGRDKWRYZfXlON+dfNbM+GgIwYdwAAAAASUVORK5CYII=',
    shadowUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACkAAAApCAQAAAACach9AAACMUlEQVR4Ae3ShY7jQBAE0Aoz/f9/HTMzhg1zrdKUrJbdx+Kd2nD8VNudfsL/Th///dyQN2TH6f3y/BGpC379rV+S+qqetBOxImNQXL8JCAr2V4iMQXHGNJxeCfZXhSRBcQMfvkOWUdtfzlLgAENmZDcmo2TVmt8OSM2eXxBp3DjHSMFutqS7SbmemzBiR+xpKCNUIRkdkkYxhAkyGoBvyQFEJEefwSmmvBfJuJ6aKqKWnAkvGZOaZXTUgFqYULWNSHUckZuR1HIIimUExutRxwzOLROIG4vKmCKQt364mIlhSyzAf1m9lHZHJZrlAOMMztRRiKimp/rpdJDc9Awry5xTZCte7FHtuS8wJgeYGrex28xNTd086Dik7vUMscQOa8y4DoGtCCSkAKlNwpgNtphjrC6MIHUkR6YWxxs6Sc5xqn222mmCRFzIt8lEdKx+ikCtg91qS2WpwVfBelJCiQJwvzixfI9cxZQWgiSJelKnwBElKYtDOb2MFbhmUigbReQBV0Cg4+qMXSxXSyGUn4UbF8l+7qdSGnTC0XLCmahIgUHLhLOhpVCtw4CzYXvLQWQbJNmxoCsOKAxSgBJno75avolkRw8iIAFcsdc02e9iyCd8tHwmeSSoKTowIgvscSGZUOA7PuCN5b2BX9mQM7S0wYhMNU74zgsPBj3HU7wguAfnxxjFQGBE6pwN+GjME9zHY7zGp8wVxMShYX9NXvEWD3HbwJf4giO4CFIQxXScH1/TM+04kkBiAAAAAElFTkSuQmCC',

    iconSize: [25, 41],
    shadowSize: [41, 41],
    iconAnchor: [12, 41],
    shadowAnchor: [14, 41],
    popupAnchor: [-3, -76]
})

type EditableMap = L.Map & {
    editTools: {
        startPolygon(latLng?: L.LatLng, options?: L.PolylineOptions): L.Polygon
        startMarker(latLng?: L.LatLng, options?: L.MarkerOptions): L.Marker
    }
}

type ExtendedMapOptions = L.MapOptions & {
    editable?: boolean
    fullscreenControl?: boolean
}

function createMap(container: HTMLElement, options: ExtendedMapOptions): L.Map {
    return L.map(container, {
        ...options,
        layers: [L.tileLayer(tileSource)]
    } as ExtendedMapOptions)
}

function createHeatLayer(points: L.HeatLatLngTuple[], maxZoom: number): L.HeatLayer {
    const leafletGlobal = (window as Window & { L: typeof L }).L
    return leafletGlobal.heatLayer(points, { maxZoom })
}

function createEditControl(title: string, content: string, startDrawing: () => void): L.Control {
    return new (L.Control.extend({
        options: { position: 'topleft' },
        onAdd: () => {
            const container = L.DomUtil.create('div', 'leaflet-control leaflet-bar')
            const link = L.DomUtil.create('a', '', container)
            link.href = '#'
            link.title = title
            link.innerHTML = content
            L.DomEvent.on(link, 'click', L.DomEvent.stop).on(link, 'click', startDrawing)
            return container
        }
    }))()
}

export class LeafletPlugin extends Plugin {
    map: L.Map | undefined
    currentEditor: Editor | undefined
    createdGeometry: Geometry | undefined
    displayedShape: L.Polygon | L.Marker | undefined

    constructor(options: PluginOptions) {
        super(options, leafletCss + '\n' + scopedLeafletFullscreenCss + '\n' + css)
    }

    initEditMode(form: HTMLElement): HTMLDialogElement {
        form.insertAdjacentHTML('beforeend', dialogTemplate)
        const container = form.querySelector('#shaclMapDialogContainer') as HTMLElement
        this.map = createMap(container, {
            fullscreenControl: true,
            editable: true,
            zoom: 5,
            maxBounds: worldBounds,
            center: defaultCenter
        })
        this.map.attributionControl.addAttribution(attribution)

        const editableMap = this.map as EditableMap
        this.map.addControl(createEditControl('Create a new polygon', '▰', () => {
            this.displayedShape?.remove()
            this.displayedShape = editableMap.editTools.startPolygon()
        }))
        this.map.addControl(createEditControl('Create a new marker', '•', () => {
            this.displayedShape?.remove()
            this.displayedShape = editableMap.editTools.startMarker(undefined, { icon: markerIcon })
        }))
        this.map.on('editable:drawing:end editable:vertex:dragend', () => {
            this.saveChanges()
        })

        const dialog = form.querySelector('#shaclMapDialog') as HTMLDialogElement
        dialog.addEventListener('click', event => {
            if (event.target === dialog) {
                dialog.close()
            }
        })
        dialog.querySelector('.closeButton')?.addEventListener('click', () => dialog.close())
        dialog.addEventListener('close', () => {
            const scrollY = document.body.style.top
            document.body.style.position = ''
            document.body.style.top = ''
            window.scrollTo(0, parseInt(scrollY || '0') * -1)
            if (this.currentEditor && this.createdGeometry) {
                this.currentEditor.value = geometryToWkt(this.createdGeometry)
                this.currentEditor.dispatchEvent(new Event('change', { bubbles: true }))
            }
        })
        return dialog
    }

    createEditor(template: ShaclPropertyTemplate, value?: Term): HTMLElement {
        let dialog = template.config.form.querySelector('#shaclMapDialog') as HTMLDialogElement
        if (!dialog) {
            dialog = this.initEditMode(template.config.form)
        }
        const button = template.config.theme.createButton('Open&#160;map...', false)
        button.style.marginLeft = '5px'
        button.classList.add('open-map-button')
        button.onclick = () => {
            this.currentEditor = instance.querySelector('.editor') as Editor
            this.createdGeometry = undefined
            this.displayedShape?.remove()
            this.drawAndZoomToGeometry(wktToGeometry(this.currentEditor.value || ''), this.map!)

            document.body.style.top = `-${window.scrollY}px`
            document.body.style.position = 'fixed'
            dialog.showModal()
        }
        const instance = fieldFactory(template, value || null, true)
        instance.appendChild(button)
        return instance
    }

    createQueryEditor(field: QueryField, template: ShaclPropertyTemplate): QueryEditor {
        const root = document.createElement('div') as unknown as QueryEditor
        root.classList.add('query-editor', 'query-map-editor')
        root.dataset.queryFieldId = field.id
        root.setAttribute('part', 'query-editor')

        const label = document.createElement('label')
        label.textContent = template.label
        if (template.description) {
            label.title = template.description.value
        }
        root.appendChild(label)

        const controls = document.createElement('div')
        controls.classList.add('query-controls')
        root.appendChild(controls)

        const mapContainer = document.createElement('div')
        mapContainer.classList.add('query-map')
        controls.appendChild(mapContainer)

        const clearButton = new RokitButton()
        clearButton.classList.add('clear', 'query-map-clear')
        clearButton.title = 'Clear'
        clearButton.dense = template.config.theme.dense
        clearButton.icon = true
        clearButton.hidden = true
        controls.appendChild(clearButton)

        let active = false
        let criterionWkt: string | undefined

        const map = createMap(mapContainer, {
            attributionControl: false,
            fullscreenControl: true,
            maxBoundsViscosity: 1,
            trackResize: false,
            zoom: 0
        })
        map.fitBounds(worldBounds as unknown as L.LatLngBoundsExpression).setMaxBounds(worldBounds as unknown as L.LatLngBoundsExpression)
        map.on('moveend', () => {
            active = map.getZoom() > 0
            clearButton.hidden = !active
            const nextCriterionWkt = active ? boundsToWkt(map.getBounds()) : undefined
            if (nextCriterionWkt !== criterionWkt) {
                criterionWkt = nextCriterionWkt
                root.dispatchEvent(new Event('change', { bubbles: true }))
            }
        })
        clearButton.addEventListener('click', event => {
            event.stopPropagation()
            map.fitBounds(worldBounds as unknown as L.LatLngBoundsExpression, { animate: false })
        })
        let pendingFacet: QueryFacet | undefined
        const facetLayer = L.featureGroup().addTo(map)

        const renderFacet = (facet?: QueryFacet) => {
            facetLayer.clearLayers()
            pendingFacet = undefined
            if (!facet) {
                return
            }
            if (facet.heatmap) {
                if (!isMapVisible(map, mapContainer)) {
                    pendingFacet = facet
                    return
                }
                const points = heatmapPoints(facet.heatmap)
                if (points.length) {
                    createHeatLayer(points, map.getZoom() || 0).addTo(facetLayer)
                }
            } else {
                addBucketLayers(facet, facetLayer)
            }
        }

        new ResizeObserver(() => {
            if (mapContainer.clientWidth <= 0 || mapContainer.clientHeight <= 0) {
                return
            }
            map.invalidateSize({ debounceMoveend: true })
            if (pendingFacet) {
                renderFacet(pendingFacet)
            }
        }).observe(mapContainer)

        root.getQueryCriteria = (): QueryCriterion[] => {
            if (!active || !criterionWkt) {
                return []
            }
            return [{ field, operator: 'equals', value: DataFactory.literal(criterionWkt, template.datatype) }]
        }

        root.setQueryFacet = renderFacet

        return root
    }

    createViewer(_: ShaclPropertyTemplate, value: Term): HTMLElement {
        const container = document.createElement('div')
        const geometry = wktToGeometry(value.value)
        if (geometry) {
            const map = createMap(container, {
                fullscreenControl: true,
                zoom: 5,
                center: defaultCenter,
                maxBounds: worldBounds
            })
            map.attributionControl.addAttribution(attribution)
            drawGeometry(geometry, map)
        }
        return container
    }

    drawAndZoomToGeometry(geometry: Geometry | undefined, map: L.Map) {
        this.displayedShape = drawGeometry(geometry, map)
    }

    saveChanges() {
        if (this.displayedShape instanceof L.Marker) {
            const { lng, lat } = this.displayedShape.getLatLng()
            this.createdGeometry = { type: 'Point', coordinates: [lng, lat] }
            return
        }
        if (this.displayedShape instanceof L.Polygon) {
            const positions = (this.displayedShape.getLatLngs() as L.LatLng[][])[0]
            if (!positions.length) {
                this.createdGeometry = undefined
                return
            }
            const ring = positions.map(({ lng, lat }) => [lng, lat])
            if (!positions[0].equals(positions[positions.length - 1])) {
                ring.push([...ring[0]])
            }
            this.createdGeometry = { type: 'Polygon', coordinates: [ring] }
            return
        }
        this.createdGeometry = undefined
    }
}

function isMapVisible(map: L.Map, container: HTMLElement): boolean {
    const bounds = container.getBoundingClientRect()
    const size = map.getSize()
    return bounds.width > 0 && bounds.height > 0 && size.x > 0 && size.y > 0
}

function boundsToWkt(bounds: L.LatLngBounds): string {
    const south = clamp(bounds.getSouth(), -90, 90)
    const west = clamp(bounds.getWest(), -180, 180)
    const north = clamp(bounds.getNorth(), -90, 90)
    const east = clamp(bounds.getEast(), -180, 180)
    return `POLYGON((${west} ${south},${east} ${south},${east} ${north},${west} ${north},${west} ${south}))`
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

function addBucketLayers(facet: QueryFacet, layer: L.FeatureGroup): void {
    if (!facet.buckets?.length) {
        return
    }
    const maxCount = Math.max(...facet.buckets.map(bucket => bucket.count))
    for (const bucket of facet.buckets) {
        const geometry = wktToGeometry(bucket.value.value)
        if (!geometry) {
            continue
        }
        const weight = maxCount > 0 ? bucket.count / maxCount : 0
        if (geometry.type === 'Point') {
            const [lng, lat] = geometry.coordinates
            L.circleMarker({ lat, lng }, {
                radius: 4 + weight * 16,
                fillColor: '#3388ff',
                fillOpacity: 0.4 + weight * 0.4,
                color: '#3388ff',
                weight: 1
            }).addTo(layer)
        } else {
            L.polygon(toLatLngs(geometry.coordinates[0]), {
                fillColor: '#3388ff',
                fillOpacity: 0.15 + weight * 0.35,
                color: '#3388ff',
                weight: 1
            }).addTo(layer)
        }
    }
}

function toLatLngs(positions: number[][]): L.LatLngLiteral[] {
    return positions.map(([lng, lat]) => ({ lat, lng }))
}

function drawGeometry(geometry: Geometry | undefined, map: L.Map): L.Marker | L.Polygon | undefined {
    setTimeout(() => map.invalidateSize())
    if (geometry?.type === 'Point') {
        const [lng, lat] = geometry.coordinates
        const position = { lng, lat }
        const marker = L.marker(position, { icon: markerIcon }).addTo(map)
        map.setView(position, 15, { animate: false })
        return marker
    }
    if (geometry?.type === 'Polygon') {
        const polygon = L.polygon(toLatLngs(geometry.coordinates[0])).addTo(map)
        const bounds = polygon.getBounds()
        map.fitBounds(bounds, { animate: false })
        setTimeout(() => {
            map.fitBounds(bounds, { animate: false })
            map.setView(polygon.getCenter(), undefined, { animate: false })
        }, 1)
        return polygon
    }
    map.setZoom(5)
}

export type Geometry = Point | Polygon

export const worldBounds: [number, number][] = [[-90, -180], [90, 180]]

export function wktToGeometry(wkt: string): Geometry | undefined {
    const point = wkt.match(/^POINT\s*\(\s*([^()]+)\s*\)$/i)
    if (point) {
        const position = parsePosition(point[1])
        return position ? { type: 'Point', coordinates: position } : undefined
    }
    const polygon = wkt.match(/^POLYGON\s*\(\(\s*(.*?)\s*\)\)$/i)
    if (!polygon) {
        return undefined
    }
    const ring = polygon[1].split(',').map(parsePosition)
    if (ring.length < 3 || ring.some(position => !position)) {
        return undefined
    }
    return { type: 'Polygon', coordinates: [ring as number[][]] }
}

function parsePosition(value: string): number[] | undefined {
    const position = value.trim().split(/\s+/).map(Number)
    return position.length === 2 && position.every(Number.isFinite) ? position : undefined
}

export function geometryToWkt(geometry: Geometry): string {
    if (geometry.type === 'Point') {
        return `POINT(${geometry.coordinates.join(' ')})`
    }
    return `POLYGON((${geometry.coordinates[0].map(position => position.join(' ')).join(',')}))`
}

function heatmapPoints(grid: HeatmapGrid): L.HeatLatLngTuple[] {
    const heatData: [number, number, number][] = []
    if (grid.columns <= 0 || grid.rows <= 0 ||
        !Number.isFinite(grid.minX) || !Number.isFinite(grid.maxX) ||
        !Number.isFinite(grid.minY) || !Number.isFinite(grid.maxY)) {
        return heatData
    }
    const dLng = (grid.maxX - grid.minX) / grid.columns
    const dLat = (grid.maxY - grid.minY) / grid.rows
    for (let y = 0; y < Math.min(grid.rows, grid.counts.length); y++) {
        const row = grid.counts[y]
        if (row === null) {
            continue
        }
        for (let x = 0; x < Math.min(grid.columns, row.length); x++) {
            if (!Number.isFinite(row[x]) || row[x] <= 0) {
                continue
            }
            const lat = grid.maxY - (y + 0.5) * dLat
            const lng = grid.minX + (x + 0.5) * dLng
            heatData.push([lat, lng, row[x]])
        }
    }
    return heatData
}
