import { describe, expect, it } from 'vitest'
import { haversineNm, interpolateGreatCircle, pointInRing, pointAlong, initialBearingDeg, latLonToVec3 } from '../geo'

describe('geo', () => {
  it('haversine: Mormugao → Singapore great-circle is ~1,930 nm and symmetric', () => {
    const a = { lat: 15.41, lon: 73.8 }
    const b = { lat: 1.23, lon: 103.88 }
    const d = haversineNm(a, b)
    expect(d).toBeGreaterThan(1850)
    expect(d).toBeLessThan(2000)
    expect(haversineNm(b, a)).toBeCloseTo(d, 6)
  })
  it('one degree of latitude is 60 nm', () => {
    expect(haversineNm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(60.04, 1)
  })
  it('great-circle interpolation hits endpoints and midpoint distance', () => {
    const a = { lat: 10, lon: 70 }
    const b = { lat: 2, lon: 100 }
    expect(interpolateGreatCircle(a, b, 0)).toEqual(a)
    const m = interpolateGreatCircle(a, b, 0.5)
    expect(haversineNm(a, m)).toBeCloseTo(haversineNm(m, b), 3)
  })
  it('bearing east along the equator is 90°', () => {
    expect(initialBearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 3)
  })
  it('point in ring', () => {
    const ring = [[0, 0], [10, 0], [10, 10], [0, 10]]
    expect(pointInRing(5, 5, ring)).toBe(true)
    expect(pointInRing(15, 5, ring)).toBe(false)
  })
  it('pointAlong walks a polyline', () => {
    const pts = [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 0, lon: 2 }]
    const p = pointAlong(pts, 90)
    expect(p.legIndex).toBe(1)
    expect(p.pos.lon).toBeCloseTo(1.5, 1)
  })
  it('sphere mapping keeps unit radius and puts lon 0 on +x', () => {
    const [x, y, z] = latLonToVec3(0, 0, 1)
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6)
    expect(x).toBeCloseTo(1, 6)
    expect(Math.abs(z)).toBeLessThan(1e-6)
    expect(latLonToVec3(90, 0, 1)[1]).toBeCloseTo(1, 6)
  })
})
