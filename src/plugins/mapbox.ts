import { Term } from '@rdfjs/types'
import { Plugin, PluginOptions } from '../plugin'
import { ShaclPropertyTemplate } from '../property-template'
import { Editor, fieldFactory } from '../theme'
import mapboxgl from 'mapbox-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import mapboxGlCss from 'mapbox-gl/dist/mapbox-gl.css'
import mapboxGlDrawCss from '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'

const css = `
#shaclMapDialog .closeButton { position: absolute; right: 0; top: 0; z-index: 1; padding: 6px 8px; cursor: pointer; border: 0; background-color: #FFFA; font-size: 24px; }
#shaclMapDialog { padding: 0; width:90vw; height: 90vh; margin: auto; }
#shaclMapDialog::backdrop { background-color: #0007; }
#shaclMapDialog .closeButton:hover { background-color: #FFF }
#shaclMapDialog .hint { position: absolute; right: 60px; top: 3px; z-index: 1; padding: 4px 6px; background-color: #FFFA; border-radius: 4px; }
.mapboxgl-map { min-height: 300px; }
#shaclMapDialogContainer { width:100%; height: 100% }
`
const dialogTemplate = `
<dialog id="shaclMapDialog" onclick="event.target==this && this.close()">
<div id="shaclMapDialogContainer"></div>
<div class="hint">&#x24D8; Draw a polygon or point, then close dialog</div>
<button class="closeButton" type="button" onclick="this.parentElement.close()">&#x2715;</button>
</dialog>`

export class MapBoxPlugin extends Plugin {
    map: mapboxgl.Map
    draw: MapboxDraw
    currentEditor: Editor | undefined

    constructor(options: PluginOptions, apiKey: string) {
        super(options, mapboxGlCss + '\n' + mapboxGlDrawCss + '\n' + css)
        mapboxgl.accessToken = apiKey
    }

    initEditMode(form: HTMLElement): HTMLDialogElement {
        form.insertAdjacentHTML('beforeend', dialogTemplate)
        const dialog = form.querySelector('#shaclMapDialog') as HTMLDialogElement
        const container = form.querySelector('#shaclMapDialogContainer')
        dialog.addEventListener('close', () => {
            const scrollY = document.body.style.top
            document.body.style.position = ''
            document.body.style.top = ''
            window.scrollTo(0, parseInt(scrollY || '0') * -1)
            // set wkt in editor
            const data = this.draw.getAll()
            if (data.features.length && this.currentEditor) {
                const geometry = data.features[0].geometry
                if (geometry.coordinates?.length) {
                    const wkt = this.geometryToWkt(geometry)
                    this.currentEditor.value = wkt
                    this.currentEditor.dispatchEvent(new Event('change', { bubbles: true }))
                }
            }
        })
        this.map = new mapboxgl.Map({
            container: container,
            style: 'mapbox://styles/mapbox/satellite-streets-v11',
            zoom: 5,
            center: { lng: 8.657238961696038, lat: 49.87627570549512 },
            attributionControl: false
        })

        this.draw = new MapboxDraw({
            displayControlsDefault: false,
            controls: { point: true, polygon: true }
        })
        this.map.addControl(new mapboxgl.NavigationControl(), 'top-left')
        this.map.addControl(this.draw, 'top-left')

        this.map.on('idle', () => {
            // this fixes wrong size of canvas
            this.map.resize()
        })
        this.map.on('draw.create', () => this.deleteAllButLastDrawing())
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
            this.draw.deleteAll()

            const wkt = this.currentEditor.value || ''
            const geometry = this.wktToGeometry(wkt)
            if (geometry && geometry.coordinates?.length) {
                this.draw.add(geometry)
                this.fitToGeometry(this.map, geometry)
            } else {
                this.map.setZoom(5)
            }
            document.body.style.top = `-${window.scrollY}px`
            document.body.style.position = 'fixed'
            dialog.showModal()
        }
        const instance = fieldFactory(template, value || null)
        instance.appendChild(button)
        return instance
    }

    createViewer(template: ShaclPropertyTemplate, value: Term): HTMLElement {
        const container = document.createElement('div')
        const geometry = this.wktToGeometry(value.value)
        if (geometry && geometry.coordinates?.length) {
            // wait for container to be available in DOM
            setTimeout(() => {
                const draw = new MapboxDraw({ displayControlsDefault: false })
                const map = new mapboxgl.Map({
                    container: container,
                    style: 'mapbox://styles/mapbox/satellite-streets-v11',
                    zoom: 5,
                    attributionControl: false
                })
                map.addControl(draw)
                map.addControl(new mapboxgl.FullscreenControl())
                draw.add(geometry)
                this.fitToGeometry(map, geometry)
            })
        }
        return container
    }

    fitToGeometry(map, geometry) {
        if (typeof geometry.coordinates[0] === 'number') {
            // e.g. Point
            map.setCenter(geometry.coordinates as mapboxgl.LngLatLike)
            map.setZoom(15)
        } else {
            // e.g. Polygon
            const bounds = geometry.coordinates[0].reduce((bounds, coord) => {
                return bounds.extend(coord as mapboxgl.LngLatLike)
            }, new mapboxgl.LngLatBounds(geometry.coordinates[0][0] as mapboxgl.LngLatLike, geometry.coordinates[0][0] as mapboxgl.LngLatLike))
            map.fitBounds(bounds, { padding: 20, animate: false })
        }
    }

    deleteAllButLastDrawing() {
        const data = this.draw.getAll()
        for (let i = 0; i < data.features.length - 1; i++) {
            this.draw.delete(data.features[i].id as string)
        }
    }

    wktToGeometry(wkt: string): any {
        const pointCoords = wkt.match(/^POINT\((.*)\)$/)
        if (pointCoords?.length == 2) {
            const xy = pointCoords[1].split(' ')
            if (xy.length === 2) {
                return { type: 'Point', coordinates: [parseFloat(xy[0]), parseFloat(xy[1])] }
            }
        }
        const polygonCoords = wkt.match(/^POLYGON[(]{2}(.*)[)]{2}$/)
        if (polygonCoords?.length == 2) {
            const split = polygonCoords[1].split(',')
            if (split.length > 2) {
                const coords: number[][][] = []
                const outer: number[][] = []
                coords.push(outer)
                for (const coord of split) {
                    const xy = coord.split(' ')
                    if (xy.length === 2) {
                        outer.push([parseFloat(xy[0]), parseFloat(xy[1])])
                    }
                }
                return { type: 'Polygon', coordinates: coords }
            }
        }
        return undefined
    }

    geometryToWkt(geometry: any): string {
        if (geometry.type === 'Point') {
            return `POINT(${geometry.coordinates.join(' ')})`
        } else if (geometry.type === 'Polygon') {
            return `POLYGON((${geometry.coordinates[0].map(item => { return item.join(' ') }).join(',')}))`
        } else {
            return ''
        }
    }
}
