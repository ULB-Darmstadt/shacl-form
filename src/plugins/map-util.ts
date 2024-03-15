import { Point, Polygon } from 'geojson'

export type Geometry = Point | Polygon

export const worldBounds: [number, number][] = [[-90, -180], [90, 180]]

export function wktToGeometry(wkt: string): Geometry | undefined {
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
}

export function geometryToWkt(geometry: Geometry): string {
    if (geometry.type === 'Point') {
        return `POINT(${geometry.coordinates.join(' ')})`
    } else if (geometry.type === 'Polygon') {
        return `POLYGON((${geometry.coordinates[0].map(item => { return item.join(' ') }).join(',')}))`
    } else {
        return ''
    }
}