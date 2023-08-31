import { Term } from '@rdfjs/types'
import { Plugin } from '../plugin'
import { ShaclPropertyTemplate } from '../property-template'
import { createTextEditor, Editor } from '../editors'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const dialogTemplate = '<dialog id="mapDialog" style="position: absolute; width:75vw; height: 75vh;" onclick="event.target==this && this.close()"><button id="closeButton" type="button" style="position: absolute; z-index: 1000;">Close</button></dialog>'

export class MapBoxPlugin extends Plugin {

    constructor(predicate: string, apiKey: string) {
        super(predicate)
        mapboxgl.accessToken = apiKey
    }

    createInstance(template: ShaclPropertyTemplate, value?: Term): HTMLElement {
        const instance = createTextEditor(template, value)
        const button = document.createElement('button')
        button.type = 'button'
        button.innerHTML = 'Open map...'
        button.style.marginLeft = '1em'

        button.onclick = () => {
            let initialLocation = { lng: 8.657238961696038, lat: 49.87627570549512 }
            let markerPos: mapboxgl.LngLat | undefined
            const editor = instance.querySelector('.editor') as Editor
            const matches = editor.value.match(/^POINT\(([+\-]?[0-9]*[.]?[0-9]+),([+\-]?[0-9]*[.]?[0-9]+)\)$/)
            if (matches?.length == 3) {
                markerPos = { lng: parseFloat(matches[1]), lat: parseFloat(matches[2]) }
            }

            let dialog = instance.querySelector('#mapDialog') as HTMLDialogElement
            if (!dialog) {
                instance.insertAdjacentHTML('beforeend', dialogTemplate)
                dialog = instance.querySelector('#mapDialog') as HTMLDialogElement
                instance['map'] = new mapboxgl.Map({
                    container: 'mapDialog',
                    style: 'mapbox://styles/mapbox/outdoors-v11',
                    zoom: 5,
                    center: markerPos || initialLocation
                })
                instance['map'].addControl(new mapboxgl.NavigationControl())
                instance['map'].on('idle', () => {
                    // this fixes wrong size of canvas
                    instance['map'].resize()
                })
                instance['map'].on('click', (e: mapboxgl.MapLayerTouchEvent) => {
                    this.setMarker(instance, e.lngLat)
                })
                dialog.querySelector('#closeButton')?.addEventListener('click', () => { dialog.close() })
            }

            this.setMarker(instance, markerPos)
            dialog.showModal()
        }
        instance.appendChild(button)
        return instance
    }

    setMarker(instance: HTMLElement, pos: mapboxgl.LngLat | undefined) {
        if (instance['currentMarker']) {
            instance['currentMarker'].remove()
        }
        if (pos) {
            instance['currentMarker'] = new mapboxgl.Marker().setLngLat(pos).addTo(instance['map'])
            const editor = instance.querySelector('.editor') as Editor
            editor.value = `POINT(${pos.lng},${pos.lat})`
        }
    }
}
