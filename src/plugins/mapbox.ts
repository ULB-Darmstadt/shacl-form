import { Term } from '@rdfjs/types'
import { Plugin, PluginOptions } from '../plugin'
import { ShaclPropertyTemplate } from '../property-template'
import { createTextEditor, Editor } from '../editors'
import mapboxgl from 'mapbox-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import 'mapbox-gl/dist/mapbox-gl.css'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'

const dialogTemplate = '<style>#shaclMapDialog .closeButton { position: absolute; right: 0; top: 0; z-index: 1; padding: 6px 8px; cursor: pointer; border: 0; background-color: #FFFA; font-size: 24px; }\
#shaclMapDialog { padding: 0 } \
#shaclMapDialog .closeButton:hover { background-color: #FFF }\
#shaclMapDialog .hint { position: absolute; right: 60px; top: 3px; z-index: 1; padding: 4px 6px; background-color: #FFFA; border-radius: 4px; }\
#shaclMapDialogContainer { width:100%; height: 100% }\
</style><dialog id="shaclMapDialog" onclick="event.target==this && this.close()">\
<div id="shaclMapDialogContainer"></div>\
<div class="hint">&#x24D8; Draw a polygon or point, then close map</div>\
<button class="closeButton" type="button" onclick="this.parentElement.close()">&#x2715;</button>\
</dialog>'

export class MapBoxPlugin extends Plugin {
    map: mapboxgl.Map
    dialog: HTMLDialogElement
    currentEditor: Editor | undefined
    currentMarker: mapboxgl.Marker | undefined
    draw: MapboxDraw

    constructor(options: PluginOptions, apiKey: string) {
        super(options)
        mapboxgl.accessToken = apiKey

        this.dialog = document.querySelector('#shaclMapDialog') as HTMLDialogElement
        if (!this.dialog) {
            document.querySelector('shacl-form')?.insertAdjacentHTML('beforeend', dialogTemplate)
            this.dialog = document.querySelector('#shaclMapDialog') as HTMLDialogElement
        }
        this.dialog.addEventListener('close', () => {
            const scrollY = document.body.style.top
            document.body.style.position = ''
            document.body.style.top = ''
            window.scrollTo(0, parseInt(scrollY || '0') * -1)
            this.setEditorValue()
        })
        this.map = new mapboxgl.Map({
            container: 'shaclMapDialogContainer',
            // style: 'mapbox://styles/mapbox/outdoors-v11',
            style: 'mapbox://styles/mapbox/satellite-streets-v11',
            zoom: 5,
            center: { lng: 8.657238961696038, lat: 49.87627570549512 }
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
    }

    createInstance(template: ShaclPropertyTemplate, value?: Term): HTMLElement {
        const instance = createTextEditor(template, value)
        const button = document.createElement('button')
        button.type = 'button'
        button.innerHTML = 'Open map...'
        button.style.marginLeft = '5px'
        button.classList.add('open-map-button')

        button.onclick = () => {
            this.currentEditor = instance.querySelector('.editor') as Editor
            this.draw.deleteAll()

            const geometry = this.getEditorValue()
            if (geometry && geometry.coordinates?.length) {
                this.draw.add(geometry)
                if (typeof geometry.coordinates[0] === 'number') {
                    // e.g. Point
                    this.map.setCenter(geometry.coordinates as mapboxgl.LngLatLike)
                    this.map.setZoom(15)
                } else {
                    // e.g. Polygon
                    const bounds = geometry.coordinates[0].reduce((bounds, coord) => {
                        return bounds.extend(coord as mapboxgl.LngLatLike)
                    }, new mapboxgl.LngLatBounds(geometry.coordinates[0][0] as mapboxgl.LngLatLike, geometry.coordinates[0][0] as mapboxgl.LngLatLike))
                    this.map.fitBounds(bounds, { padding: 20, animate: false })
                }
            } else {
                this.map.setZoom(5)
            }
            document.body.style.top = `-${window.scrollY}px`
            document.body.style.position = 'fixed'
            this.dialog.showModal()
        }
        instance.appendChild(button)
        return instance
    }

    deleteAllButLastDrawing() {
        const data = this.draw.getAll()
        for (let i = 0; i < data.features.length - 1; i++) {
            this.draw.delete(data.features[i].id as string)
        }
    }

    getEditorValue() {
        if (this.currentEditor) {
            const pointCoords = this.currentEditor.value.match(/^POINT\((.*)\)$/)
            if (pointCoords?.length == 2) {
                const xy = pointCoords[1].split(' ')
                if (xy.length === 2) {
                    return { type: 'Point', coordinates: [parseFloat(xy[0]), parseFloat(xy[1])] }
                }
            }
            const polygonCoords = this.currentEditor.value.match(/^POLYGON[(]{2}(.*)[)]{2}$/)
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
        }
        return undefined
    }

    setEditorValue() {
        if (this.currentEditor) {
            let value = ''
            const data = this.draw.getAll()
            if (data.features.length) {
                const geometry = data.features[0].geometry
                if (geometry.coordinates?.length) {
                    if (geometry.type === 'Point') {
                        value = `POINT(${geometry.coordinates.join(' ')})`
                    } else if (geometry.type === 'Polygon') {
                        value = `POLYGON((${geometry.coordinates[0].map(item => { return item.join(' ') }).join(',')}))`
                    }
                }
            }
            this.currentEditor.value = value
            this.currentEditor.dispatchEvent(new Event('change', { bubbles: true }))
        }
    }
}
