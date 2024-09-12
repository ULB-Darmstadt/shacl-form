import * as L from 'leaflet'
import 'leaflet-editable/src/Leaflet.Editable.js'
import leafletCss from 'leaflet/dist/leaflet.css'
import leafletFullscreenCss from 'leaflet.fullscreen/Control.FullScreen.css'
import 'leaflet.fullscreen/Control.FullScreen.js'
import { Term } from '@rdfjs/types'

import { Plugin, PluginOptions } from '../plugin'
import { Editor, fieldFactory } from '../theme'
import { ShaclPropertyTemplate } from '../property-template'
import { Geometry, geometryToWkt, wktToGeometry, worldBounds } from './map-util'

const css = `
#shaclMapDialog .closeButton { position: absolute; right: 0; top: 0; z-index: 1; padding: 6px 8px; cursor: pointer; border: 0; background-color: #FFFA; font-size: 24px; z-index: 1000; }
#shaclMapDialog { padding: 0; width:90vw; height: 90vh; margin: auto; }
#shaclMapDialog::backdrop { background-color: #0007; }
#shaclMapDialog .closeButton:hover { background-color: #FFF }
#shaclMapDialog .hint { position: absolute; right: 60px; top: 3px; z-index: 1; padding: 4px 6px; background-color: #FFFA; border-radius: 4px; z-index: 1000; pointer-events: none; }
.leaflet-container { min-height: 300px; }
.fullscreen-icon { background-image: url(data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjYgNTIiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTIwLjYgMzYuN0gxNmEuOS45IDAgMCAxLS44LS44di00LjVjMC0uMi4yLS40LjQtLjRoMS40Yy4zIDAgLjUuMi41LjR2M2gzYy4yIDAgLjQuMi40LjV2MS40YzAgLjItLjIuNC0uNC40em0tOS45LS44di00LjVjMC0uMi0uMi0uNC0uNC0uNEg4LjljLS4zIDAtLjUuMi0uNS40djNoLTNjLS4yIDAtLjQuMi0uNC41djEuNGMwIC4yLjIuNC40LjRIMTBjLjQgMCAuOC0uNC44LS44em0wIDEwLjdWNDJjMC0uNC0uNC0uOC0uOC0uOEg1LjRjLS4yIDAtLjQuMi0uNC40djEuNGMwIC4zLjIuNS40LjVoM3YzYzAgLjIuMi40LjUuNGgxLjRjLjIgMCAuNC0uMi40LS40em02LjkgMHYtM2gzYy4yIDAgLjQtLjIuNC0uNXYtMS40YzAtLjItLjItLjQtLjQtLjRIMTZjLS40IDAtLjguNC0uOC44djQuNWMwIC4yLjIuNC40LjRoMS40Yy4zIDAgLjUtLjIuNS0uNHpNNSAxMC4zVjUuOWMwLS41LjQtLjkuOS0uOWg0LjRjLjIgMCAuNC4yLjQuNFY3YzAgLjItLjIuNC0uNC40aC0zdjNjMCAuMi0uMi40LS40LjRINS40YS40LjQgMCAwIDEtLjQtLjR6bTEwLjMtNC45VjdjMCAuMi4yLjQuNC40aDN2M2MwIC4yLjIuNC40LjRoMS41Yy4yIDAgLjQtLjIuNC0uNFY1LjljMC0uNS0uNC0uOS0uOS0uOWgtNC40Yy0uMiAwLS40LjItLjQuNHptNS4zIDkuOUgxOWMtLjIgMC0uNC4yLS40LjR2M2gtM2MtLjIgMC0uNC4yLS40LjR2MS41YzAgLjIuMi40LjQuNGg0LjRjLjUgMCAuOS0uNC45LS45di00LjRjMC0uMi0uMi0uNC0uNC0uNHptLTkuOSA1LjNWMTljMC0uMi0uMi0uNC0uNC0uNGgtM3YtM2MwLS4yLS4yLS40LS40LS40SDUuNGMtLjIgMC0uNC4yLS40LjR2NC40YzAgLjUuNC45LjkuOWg0LjRjLjIgMCAuNC0uMi40LS40eiIgZmlsbD0iY3VycmVudENvbG9yIi8+PC9zdmc+); }
#shaclMapDialogContainer { width:100%; height: 100%; }
`
const dialogTemplate = `
<dialog id="shaclMapDialog" onclick="event.target==this && this.close()">
<div id="shaclMapDialogContainer"></div>
<div class="hint">&#x24D8; Draw a polygon or marker, then close dialog</div>
<button class="closeButton" type="button" onclick="this.parentElement.close()">&#x2715;</button>
</dialog>`

const defaultCenter = { lng: 8.657238961696038, lat: 49.87627570549512 }
const attribution = '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
const tileSource = 'https://tile.openstreetmap.de/{z}/{x}/{y}.png'
// const tileSource = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

const markerIcon = L.icon({
    iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAApCAYAAADAk4LOAAAFgUlEQVR4Aa1XA5BjWRTN2oW17d3YaZtr2962HUzbDNpjszW24mRt28p47v7zq/bXZtrp/lWnXr337j3nPCe85NcypgSFdugCpW5YoDAMRaIMqRi6aKq5E3YqDQO3qAwjVWrD8Ncq/RBpykd8oZUb/kaJutow8r1aP9II0WmLKLIsJyv1w/kqw9Ch2MYdB++12Onxee/QMwvf4/Dk/Lfp/i4nxTXtOoQ4pW5Aj7wpici1A9erdAN2OH64x8OSP9j3Ft3b7aWkTg/Fm91siTra0f9on5sQr9INejH6CUUUpavjFNq1B+Oadhxmnfa8RfEmN8VNAsQhPqF55xHkMzz3jSmChWU6f7/XZKNH+9+hBLOHYozuKQPxyMPUKkrX/K0uWnfFaJGS1QPRtZsOPtr3NsW0uyh6NNCOkU3Yz+bXbT3I8G3xE5EXLXtCXbbqwCO9zPQYPRTZ5vIDXD7U+w7rFDEoUUf7ibHIR4y6bLVPXrz8JVZEql13trxwue/uDivd3fkWRbS6/IA2bID4uk0UpF1N8qLlbBlXs4Ee7HLTfV1j54APvODnSfOWBqtKVvjgLKzF5YdEk5ewRkGlK0i33Eofffc7HT56jD7/6U+qH3Cx7SBLNntH5YIPvODnyfIXZYRVDPqgHtLs5ABHD3YzLuespb7t79FY34DjMwrVrcTuwlT55YMPvOBnRrJ4VXTdNnYug5ucHLBjEpt30701A3Ts+HEa73u6dT3FNWwflY86eMHPk+Yu+i6pzUpRrW7SNDg5JHR4KapmM5Wv2E8Tfcb1HoqqHMHU+uWDD7zg54mz5/2BSnizi9T1Dg4QQXLToGNCkb6tb1NU+QAlGr1++eADrzhn/u8Q2YZhQVlZ5+CAOtqfbhmaUCS1ezNFVm2imDbPmPng5wmz+gwh+oHDce0eUtQ6OGDIyR0uUhUsoO3vfDmmgOezH0mZN59x7MBi++WDL1g/eEiU3avlidO671bkLfwbw5XV2P8Pzo0ydy4t2/0eu33xYSOMOD8hTf4CrBtGMSoXfPLchX+J0ruSePw3LZeK0juPJbYzrhkH0io7B3k164hiGvawhOKMLkrQLyVpZg8rHFW7E2uHOL888IBPlNZ1FPzstSJM694fWr6RwpvcJK60+0HCILTBzZLFNdtAzJaohze60T8qBzyh5ZuOg5e7uwQppofEmf2++DYvmySqGBuKaicF1blQjhuHdvCIMvp8whTTfZzI7RldpwtSzL+F1+wkdZ2TBOW2gIF88PBTzD/gpeREAMEbxnJcaJHNHrpzji0gQCS6hdkEeYt9DF/2qPcEC8RM28Hwmr3sdNyht00byAut2k3gufWNtgtOEOFGUwcXWNDbdNbpgBGxEvKkOQsxivJx33iow0Vw5S6SVTrpVq11ysA2Rp7gTfPfktc6zhtXBBC+adRLshf6sG2RfHPZ5EAc4sVZ83yCN00Fk/4kggu40ZTvIEm5g24qtU4KjBrx/BTTH8ifVASAG7gKrnWxJDcU7x8X6Ecczhm3o6YicvsLXWfh3Ch1W0k8x0nXF+0fFxgt4phz8QvypiwCCFKMqXCnqXExjq10beH+UUA7+nG6mdG/Pu0f3LgFcGrl2s0kNNjpmoJ9o4B29CMO8dMT4Q5ox8uitF6fqsrJOr8qnwNbRzv6hSnG5wP+64C7h9lp30hKNtKdWjtdkbuPA19nJ7Tz3zR/ibgARbhb4AlhavcBebmTHcFl2fvYEnW0ox9xMxKBS8btJ+KiEbq9zA4RthQXDhPa0T9TEe69gWupwc6uBUphquXgf+/FrIjweHQS4/pduMe5ERUMHUd9xv8ZR98CxkS4F2n3EUrUZ10EYNw7BWm9x1GiPssi3GgiGRDKWRYZfXlON+dfNbM+GgIwYdwAAAAASUVORK5CYII=',
    shadowUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACkAAAApCAQAAAACach9AAACMUlEQVR4Ae3ShY7jQBAE0Aoz/f9/HTMzhg1zrdKUrJbdx+Kd2nD8VNudfsL/Th///dyQN2TH6f3y/BGpC379rV+S+qqetBOxImNQXL8JCAr2V4iMQXHGNJxeCfZXhSRBcQMfvkOWUdtfzlLgAENmZDcmo2TVmt8OSM2eXxBp3DjHSMFutqS7SbmemzBiR+xpKCNUIRkdkkYxhAkyGoBvyQFEJEefwSmmvBfJuJ6aKqKWnAkvGZOaZXTUgFqYULWNSHUckZuR1HIIimUExutRxwzOLROIG4vKmCKQt364mIlhSyzAf1m9lHZHJZrlAOMMztRRiKimp/rpdJDc9Awry5xTZCte7FHtuS8wJgeYGrex28xNTd086Dik7vUMscQOa8y4DoGtCCSkAKlNwpgNtphjrC6MIHUkR6YWxxs6Sc5xqn222mmCRFzIt8lEdKx+ikCtg91qS2WpwVfBelJCiQJwvzixfI9cxZQWgiSJelKnwBElKYtDOb2MFbhmUigbReQBV0Cg4+qMXSxXSyGUn4UbF8l+7qdSGnTC0XLCmahIgUHLhLOhpVCtw4CzYXvLQWQbJNmxoCsOKAxSgBJno75avolkRw8iIAFcsdc02e9iyCd8tHwmeSSoKTowIgvscSGZUOA7PuCN5b2BX9mQM7S0wYhMNU74zgsPBj3HU7wguAfnxxjFQGBE6pwN+GjME9zHY7zGp8wVxMShYX9NXvEWD3HbwJf4giO4CFIQxXScH1/TM+04kkBiAAAAAElFTkSuQmCC',

    iconSize:     [25, 41], // size of the icon
    shadowSize:   [41, 41], // size of the shadow
    iconAnchor:   [12, 41], // point of the icon which will correspond to marker's location
    shadowAnchor: [14, 41],  // the same for the shadow
    popupAnchor:  [-3, -76] // point from which the popup should open relative to the iconAnchor
})

export class LeafletPlugin extends Plugin {
    map: L.Map | undefined
    currentEditor: Editor | undefined
    createdGeometry: Geometry | undefined
    displayedShape: L.Polygon | L.Marker | undefined

    constructor(options: PluginOptions) {
        super(options, leafletCss + '\n' + leafletFullscreenCss + '\n' + css)
    }

    initEditMode(form: HTMLElement): HTMLDialogElement {
        form.insertAdjacentHTML('beforeend', dialogTemplate)
        const container = form.querySelector('#shaclMapDialogContainer') as HTMLElement
        this.map = L.map(container, {
            fullscreenControl: true,
            editable: true,
            layers: [ L.tileLayer(tileSource) ],
            zoom: 5,
            maxBounds: worldBounds,
            center: defaultCenter
        })
        this.map.attributionControl.addAttribution(attribution)

        const EditControl = L.Control.extend({ options: { position: 'topleft', callback: null, kind: '', html: '' },
            onAdd: function (map: L.Map) {
                let container = L.DomUtil.create('div', 'leaflet-control leaflet-bar')
                let link = L.DomUtil.create('a', '', container)
                link.href = '#';
                link.title = 'Create a new ' + this.options.kind;
                link.innerHTML = this.options.html;
                L.DomEvent.on(link, 'click', L.DomEvent.stop).on(link, 'click', () => {
                    // @ts-ignore
                    window.LAYER = this.options.callback.call(map.editTools)
                }, this)
                return container
            }
        })
        this.map.addControl(new (EditControl.extend({
            options: {
                callback: () => {
                    this.displayedShape?.remove()
                    this.displayedShape = this.map?.editTools.startPolygon()
                },
                kind: 'polygon',
                html: '▰'
            }
        }))())
        this.map.addControl(new (EditControl.extend({
            options: {
                callback: () => {
                    this.displayedShape?.remove()
                    this.displayedShape = this.map?.editTools.startMarker(undefined, { icon: markerIcon })
                },
                kind: 'marker',
                html: '•'
            }
        }))())
        this.map.on('editable:drawing:end', () => { this.saveChanges() })
        this.map.on('editable:vertex:dragend', () => { this.saveChanges() })

        const dialog = form.querySelector('#shaclMapDialog') as HTMLDialogElement
        dialog.addEventListener('close', () => {
            const scrollY = document.body.style.top
            document.body.style.position = ''
            document.body.style.top = ''
            window.scrollTo(0, parseInt(scrollY || '0') * -1)
            // set wkt in editor
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
        const instance = fieldFactory(template, value || null)
        instance.appendChild(button)
        return instance
    }

    createViewer(template: ShaclPropertyTemplate, value: Term): HTMLElement {
        const container = document.createElement('div')
        const geometry = wktToGeometry(value.value)
        if (geometry?.coordinates?.length) {
            const map = L.map(container, {
                fullscreenControl: true,
                layers: [ L.tileLayer(tileSource) ],
                zoom: 5,
                center: defaultCenter,
                maxBounds: worldBounds
            })
            map.attributionControl.addAttribution(attribution)
            this.drawAndZoomToGeometry(geometry, map)
        }
        return container
    }

    drawAndZoomToGeometry(geometry: Geometry | undefined, map: L.Map) {
        setTimeout(() => { map.invalidateSize() })
        if (geometry?.type === 'Point') {
            const coords = { lng: geometry.coordinates[0], lat: geometry.coordinates[1] }
            this.displayedShape = L.marker(coords, { icon: markerIcon }).addTo(map)
            map.setView(coords, 15, { animate: false })
        } else if (geometry?.type === 'Polygon') {
            const coords = geometry.coordinates[0].map((pos) => { return { lng: pos[0], lat: pos[1] }})
            const polygon =  L.polygon(coords).addTo(map)
            this.displayedShape = polygon
            map.fitBounds(polygon.getBounds(), { animate: false })
            setTimeout(() => {
                map.fitBounds(polygon.getBounds(), { animate: false })
                map.setView(polygon.getCenter(), undefined, { animate: false })
            }, 1)
        } else {
            map.setZoom(5)
        }
    }

    saveChanges() {
        if (this.displayedShape instanceof L.Marker) {
            const pos = this.displayedShape.getLatLng()
            this.createdGeometry = { type: 'Point', coordinates: [pos.lng, pos.lat] }
        } else if (this.displayedShape instanceof L.Polygon) {
            const positions = this.displayedShape.getLatLngs() as L.LatLng[][]
            // force closed polygon
            if (!positions[0][0].equals(positions[0][positions[0].length - 1])) {
                positions[0].push(positions[0][0])
            }
            this.createdGeometry = { type: 'Polygon', coordinates: [positions[0].map((pos) => { return [ pos.lng, pos.lat ] })] }
        } else {
            this.createdGeometry = undefined
        }
    }
}