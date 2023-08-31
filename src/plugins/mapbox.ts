import { Term } from '@rdfjs/types'
import { Plugin } from '../plugin'
import { ShaclPropertyTemplate } from '../property-template'
import { createTextEditor, Editor } from '../editors'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const dialogTemplate = '<dialog id="mapDialog" style="width:75vw; height: 75vh; margin: auto;" onclick="event.target==this && this.close()"><button id="closeButton" type="button" style="position: absolute; z-index: 1000; margin: 2px; padding: 6px 10px; background: white; border-radius: 4px; border: 0; cursor: pointer;">Close</button></dialog>'

export class MapBoxPlugin extends Plugin {
    map: mapboxgl.Map
    dialog: HTMLDialogElement
    currentEditor: Editor | undefined
    currentMarker: mapboxgl.Marker | undefined

    constructor(predicate: string, apiKey: string) {
        super(predicate)
        mapboxgl.accessToken = apiKey

        document.body.insertAdjacentHTML('beforeend', dialogTemplate)
        this.dialog = document.querySelector('#mapDialog') as HTMLDialogElement
        this.dialog.addEventListener('close', () => {
            const scrollY = document.body.style.top
            document.body.style.position = ''
            document.body.style.top = ''
            window.scrollTo(0, parseInt(scrollY || '0') * -1)
        })
        this.map = new mapboxgl.Map({
            container: 'mapDialog',
            // style: 'mapbox://styles/mapbox/outdoors-v11',
            style: 'mapbox://styles/mapbox/satellite-streets-v11',
            zoom: 5,
            center: { lng: 8.657238961696038, lat: 49.87627570549512 }
        })
        this.map.addControl(new mapboxgl.NavigationControl())
        this.map.on('idle', () => {
            // this fixes wrong size of canvas
            this.map.resize()
        })
        this.map.on('click', (e: mapboxgl.MapLayerTouchEvent) => {
            this.setMarker(e.lngLat)
        })
        this.dialog.querySelector('#closeButton')?.addEventListener('click', () => { this.dialog.close() })
    }

    createInstance(template: ShaclPropertyTemplate, value?: Term): HTMLElement {
        const instance = createTextEditor(template, value)
        const button = document.createElement('button')
        button.type = 'button'
        button.innerHTML = 'Open map...'
        button.style.marginLeft = '5px'

        button.onclick = () => {
            this.currentEditor = instance.querySelector('.editor') as Editor
            let markerPos: mapboxgl.LngLat | undefined
            const matches = this.currentEditor.value.match(/^POINT\(([+\-]?[0-9]*[.]?[0-9]+),([+\-]?[0-9]*[.]?[0-9]+)\)$/)
            if (matches?.length == 3) {
                markerPos = { lng: parseFloat(matches[1]), lat: parseFloat(matches[2]) }
            }
    
            this.setMarker(markerPos)
            if (markerPos) {
                this.map.setZoom(15)
                this.map.setCenter(markerPos)
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

    setMarker(pos: mapboxgl.LngLat | undefined) {
        if (this.currentMarker) {
            this.currentMarker.remove()
        }
        if (this.currentEditor && pos) {
            this.currentMarker = new mapboxgl.Marker().setLngLat(pos).addTo(this.map)
            this.currentEditor.value = `POINT(${pos.lng},${pos.lat})`
        }
    }
}
