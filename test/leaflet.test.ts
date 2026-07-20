import { expect } from '@open-wc/testing'
import { geometryToWkt, wktToGeometry } from '../src/plugins/leaflet'

describe('Leaflet geometry conversion', () => {
    it('parses and serializes points', () => {
        const geometry = wktToGeometry('POINT ( 8.65  49.87 )')

        expect(geometry).to.deep.equal({ type: 'Point', coordinates: [8.65, 49.87] })
        expect(geometry && geometryToWkt(geometry)).to.equal('POINT(8.65 49.87)')
    })

    it('parses and serializes polygon rings', () => {
        const wkt = 'POLYGON((8 49,9 49,9 50,8 49))'
        const geometry = wktToGeometry(wkt)

        expect(geometry).to.deep.equal({
            type: 'Polygon',
            coordinates: [[[8, 49], [9, 49], [9, 50], [8, 49]]]
        })
        expect(geometry && geometryToWkt(geometry)).to.equal(wkt)
    })

    it('rejects malformed or non-finite coordinates', () => {
        expect(wktToGeometry('POINT(foo 49)')).to.equal(undefined)
        expect(wktToGeometry('POLYGON((8 49,9 49))')).to.equal(undefined)
    })
})
