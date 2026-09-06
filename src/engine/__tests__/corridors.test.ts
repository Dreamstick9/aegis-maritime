import { beforeAll, describe, expect, it } from 'vitest'
import { MALACCA_FAIRWAY, PORTS, PORT_LIST } from '../../data/ports'
import { approachFor, findSplice, generateCorridor, generateCorridors, routeFeasible, type CorridorRequest } from '../corridors'
import { haversineNm, interpolateGreatCircle } from '../geo'
import { LANDMARKS_ALL, landmarksAlong, nearestOnTrack, regionName } from '../regions'
import type { LatLon, OceanConfig } from '../types'
import { cellIndex, getOceanGrid, isLand, zoneBits } from '../zones'

const ocean: OceanConfig = { seed: 0, monsoon: 'SW', windScale: 1, swellM: 1, noiseAmp: 0 }

/**
 * Ordered pairs that are genuinely impossible on the 0.25 degree grid at 12 m draught. Empty: every
 * pair of the current port set routes. Keep this list at two entries or fewer (see the brief).
 */
const SKIP: string[] = []

function request(a: string, b: string, requiredDepthM = 12): CorridorRequest {
  return {
    origin: PORTS[a].position,
    destination: PORTS[b].position,
    approach: approachFor(PORTS[a], PORTS[b]),
    ocean,
    oceanOpts: {},
    startTimeH: 0,
    assumedSpeedKn: 12.5,
    requiredDepthM,
    kinds: ['shortest'],
  }
}

/** first land hit when sampling a polyline every `stepNm`, or null */
function landHit(points: LatLon[], stepNm = 5): LatLon | null {
  for (let k = 1; k < points.length; k++) {
    const n = Math.max(1, Math.ceil(haversineNm(points[k - 1], points[k]) / stepNm))
    for (let s = 0; s <= n; s++) {
      const q = interpolateGreatCircle(points[k - 1], points[k], s / n)
      if (isLand(q.lat, q.lon)) return q
    }
  }
  return null
}

beforeAll(() => {
  getOceanGrid()
})

describe('port data', () => {
  it('has at least 12 ports, all inside the grid and off land, with valid pilotage chains', () => {
    expect(PORT_LIST.length).toBeGreaterThanOrEqual(12)
    const g = getOceanGrid()
    for (const p of PORT_LIST) {
      expect(p.approach.length, p.id).toBeGreaterThanOrEqual(3)
      expect(p.approach[0], p.id).toEqual(p.position)
      expect(p.approach[1], p.id).toEqual(p.pilotStation)
      expect(isLand(p.position.lat, p.position.lon), `${p.id} berth on land`).toBe(false)
      expect(isLand(p.pilotStation.lat, p.pilotStation.lon), `${p.id} pilot on land`).toBe(false)
      expect(landHit(p.approach), `${p.id} chain crosses land`).toBeNull()
      const e = p.approach[p.approach.length - 1]
      const i = cellIndex(g, e.lat, e.lon)
      expect(i, `${p.id} endpoint off grid`).toBeGreaterThanOrEqual(0)
      expect(g.coastCells[i], `${p.id} endpoint too close to land`).toBeGreaterThanOrEqual(3)
      expect(zoneBits(e.lat, e.lon) & 3, `${p.id} endpoint in a restricted or shallow zone`).toBe(0)
      expect(p.exports.length, p.id).toBeGreaterThanOrEqual(2)
      for (const x of p.exports) expect(x.maxT, `${p.id} ${x.cargoType}`).toBeGreaterThan(x.minT)
      for (const f of p.facts) if (f.provenance === 'sourced') expect(['INMRM', 'SGSIN'], `${p.id} invents a sourced fact`).toContain(p.id)
    }
  })
  it('strait ports share the Malacca fairway and leave through its north entrance', () => {
    const entrance = MALACCA_FAIRWAY[0]
    for (const id of ['SGSIN', 'MYPKG', 'MYPEN', 'IDBLW']) {
      const chain = PORTS[id].approach
      expect(chain[chain.length - 1], id).toEqual(entrance)
      const onFairway = chain.filter((p) => MALACCA_FAIRWAY.some((n) => n.lat === p.lat && n.lon === p.lon))
      expect(onFairway.length, id).toBeGreaterThanOrEqual(2)
    }
    // Singapore keeps its original waypoints
    const sg = PORTS.SGSIN.approach.map((p) => `${p.lat},${p.lon}`)
    for (const w of ['1.23,103.88', '1.17,103.72', '1.25,103.45', '1.55,102.9', '2.2,101.95', '2.9,101.05', '3.6,100.3', '4.6,99.2']) expect(sg).toContain(w)
  })
})

describe('feasibility', () => {
  it('routeFeasible is true for every ordered pair at 12 m draught (minus the skip list)', () => {
    const t0 = performance.now()
    const fails: string[] = []
    let pairs = 0
    for (const a of PORT_LIST) {
      for (const b of PORT_LIST) {
        if (a === b || SKIP.includes(`${a.id}->${b.id}`)) continue
        pairs++
        if (!routeFeasible(a, b, 12)) fails.push(`${a.id}->${b.id}`)
      }
    }
    expect(pairs).toBeGreaterThanOrEqual(12 * 11)
    expect(fails).toEqual([])
    expect(performance.now() - t0).toBeLessThan(8000)
  })
})

describe('shortest corridors', () => {
  it('never cross land (sampled every 5 nm) and never need the relaxed-depth fallback', () => {
    const problems: string[] = []
    for (const a of PORT_LIST) {
      for (const b of PORT_LIST) {
        if (a === b || SKIP.includes(`${a.id}->${b.id}`)) continue
        const c = generateCorridor('shortest', request(a.id, b.id))
        if (!c) {
          problems.push(`${a.id}->${b.id}: null`)
          continue
        }
        expect(c.waypoints[0]).toEqual(a.position)
        expect(c.waypoints[c.waypoints.length - 1]).toEqual(b.position)
        const hit = landHit(c.waypoints)
        if (hit) problems.push(`${a.id}->${b.id}: land at ${hit.lat.toFixed(2)},${hit.lon.toFixed(2)}`)
        if (c.description.includes('WARNING')) problems.push(`${a.id}->${b.id}: relaxed depth`)
        if (c.distanceNm < haversineNm(a.position, b.position) * 0.99) problems.push(`${a.id}->${b.id}: shorter than great circle`)
      }
    }
    expect(problems).toEqual([])
  })
  it('the reference Mormugao to Singapore corridor has a plausible length', () => {
    const c = generateCorridor('shortest', request('INMRM', 'SGSIN', 16))
    expect(c).not.toBeNull()
    expect(c!.distanceNm).toBeGreaterThan(2100)
    expect(c!.distanceNm).toBeLessThan(2450)
  })
})

describe('fairway splice', () => {
  it('Klang to Singapore runs down the strait without an A* detour north', () => {
    const c = generateCorridor('shortest', request('MYPKG', 'SGSIN', 16))
    expect(c).not.toBeNull()
    const gc = haversineNm(PORTS.MYPKG.position, PORTS.SGSIN.position)
    expect(c!.distanceNm).toBeLessThan(1.4 * gc)
    expect(Math.max(...c!.waypoints.map((w) => w.lat))).toBeLessThan(3.1)
    expect(c!.description).toMatch(/spliced/)
  })
  it('Singapore to Penang and Penang to Belawan stay inside the strait', () => {
    const sp = generateCorridor('shortest', request('SGSIN', 'MYPEN', 16))!
    expect(Math.max(...sp.waypoints.map((w) => w.lat))).toBeLessThan(5.7)
    // the strait bends and Penang joins the fairway at the 4.6N node, so allow a curved-strait margin
    expect(sp.distanceNm).toBeLessThan(1.45 * haversineNm(PORTS.SGSIN.position, PORTS.MYPEN.position))
    const pb = generateCorridor('shortest', request('MYPEN', 'IDBLW', 16))!
    expect(pb.distanceNm).toBeLessThan(1.5 * haversineNm(PORTS.MYPEN.position, PORTS.IDBLW.position))
  })
  it('a spliced pair yields a single corridor from generateCorridors', () => {
    const all = generateCorridors({ ...request('MYPKG', 'SGSIN', 16), kinds: ['shortest', 'weather', 'offshore', 'current'] })
    expect(all.length).toBe(1)
    const open = generateCorridors({ ...request('INMRM', 'SGSIN', 16), kinds: ['shortest', 'weather'] })
    expect(open.length).toBe(2)
  })
  it('identical open-sea endpoints splice directly and a live position inside the strait splices too', () => {
    const a = { lat: 13.1, lon: 80.3 }
    const e = { lat: 13.0, lon: 81.0 }
    const b = { lat: 17.68, lon: 83.28 }
    const c = generateCorridor('shortest', { ...request('INMAA', 'INVTZ'), approach: { departure: [a, e], arrival: [e, b] } })
    expect(c!.waypoints).toEqual([a, e, b])
    expect(findSplice([a, e], [e, b])).toEqual({ i: 1, j: 0, lengthNm: haversineNm(a, e) + haversineNm(e, b) })
    const live = generateCorridor('shortest', { ...request('MYPEN', 'SGSIN', 16), fromPosition: { lat: 3.62, lon: 100.28 } })
    expect(live!.waypoints[0]).toEqual({ lat: 3.62, lon: 100.28 })
    expect(live!.description).toMatch(/spliced/)
    expect(live!.distanceNm).toBeLessThan(320)
  })
  it('chains further apart than 12 nm do not splice', () => {
    expect(findSplice(PORTS.THHKT.approach, approachFor(PORTS.THHKT, PORTS.SGSIN).arrival)).toBeNull()
  })
})

describe('regions and landmarks', () => {
  it('names sea areas across the chart', () => {
    const cases: [number, number, string][] = [
      [15.4, 73.5, 'Arabian Sea'],
      [22.7, 69.5, 'Gulf of Kutch'],
      [10, 75.5, 'Laccadive Sea'],
      [6.5, 80.2, 'Laccadive Sea'],
      [8.3, 78.6, 'Gulf of Mannar'],
      [9.8, 79.5, 'Palk Bay'],
      [13, 82, 'Bay of Bengal'],
      [6.2, 94.6, 'Andaman Sea'],
      [16, 96, 'Gulf of Martaban'],
      [4, 100, 'Malacca Strait'],
      [1.2, 103.8, 'Singapore Strait'],
      [2, 106, 'South China Sea approaches'],
      [-4, 106, 'Java Sea approaches'],
      [-3, 80, 'Indian Ocean'],
      [5.5, 80.5, 'Indian Ocean'],
    ]
    for (const [lat, lon, name] of cases) expect(regionName({ lat, lon }), `${lat},${lon}`).toBe(name)
    for (const p of PORT_LIST) expect(regionName(p.position)).not.toBe('Indian Ocean')
  })
  it('lists landmarks along a track in order', () => {
    expect(LANDMARKS_ALL.length).toBeGreaterThanOrEqual(25)
    const c = generateCorridor('shortest', request('INMRM', 'SGSIN', 16))!
    const names = landmarksAlong(c.waypoints, 45).map((l) => l.name)
    expect(names).toContain('Dondra Head')
    expect(names).toContain('Great Channel')
    expect(names).toContain('One Fathom Bank')
    expect(names.indexOf('Dondra Head')).toBeLessThan(names.indexOf('Great Channel'))
    expect(names.indexOf('Great Channel')).toBeLessThan(names.indexOf('One Fathom Bank'))
    expect(names).not.toContain('Bombay High field')
    const n = nearestOnTrack([{ lat: 0, lon: 70 }, { lat: 0, lon: 72 }], { lat: 1, lon: 71 })
    expect(n.distNm).toBeCloseTo(60, 0)
    expect(n.alongNm).toBeCloseTo(60, 0)
  })
})
