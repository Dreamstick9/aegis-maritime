import { beforeAll, describe, expect, it } from 'vitest'
import { FLEET, FLEET_BY_ID } from '../../data/fleet'
import { PORTS } from '../../data/ports'
import { PACK_IDS, SCENARIOS, buildScenario, type ScenarioId } from '../../data/scenarios'
import { densify, haversineNm, pointInRing, ringBBox } from '../geo'
import { interpolateTrack } from '../ocean'
import { nearestOnTrack } from '../regions'
import { generateVoyage, hullFeasible, REGION, STORM_TRANSIT_SPEED_KN } from '../voyage'
import { getOceanGrid, getScenarioZones, isLand } from '../zones'

/** 20 fixed seeds spread over the 32-bit range (a small LCG so the list is reproducible). */
const SEEDS: number[] = []
for (let i = 0, x = 12345; i < 20; i++) {
  x = (Math.imul(x, 1664525) + 1013904223) >>> 0
  SEEDS.push(x || i + 1)
}

const BAD_DASH = /[–—·]/

function monsoonOf(iso: string): 'SW' | 'NE' | 'transition' {
  const m = new Date(iso).getUTCMonth()
  if (m >= 5 && m <= 8) return 'SW'
  if (m >= 10 || m <= 1) return 'NE'
  return 'transition'
}

beforeAll(() => {
  getOceanGrid()
})

describe('voyage generator', () => {
  it('is deterministic: the same pack and seed rebuild a deep-equal voyage', () => {
    for (const id of PACK_IDS) {
      const a = generateVoyage(id, 4242)
      const b = generateVoyage(id, 4242)
      expect(b).toEqual(a)
      expect(generateVoyage(id, 4243).mission).not.toEqual(a.mission)
    }
  })

  it('seed 0 returns the fixed reference pack unchanged', () => {
    for (const id of PACK_IDS) {
      expect(buildScenario(id, 0)).toEqual(SCENARIOS[id])
      expect(buildScenario(id, 0).mission.originId).toBe('INMRM')
    }
  })

  it('memoises by (pack, seed) and leaves the active scenario zones untouched', () => {
    const before = getScenarioZones()
    const a = buildScenario('normal', 777)
    expect(buildScenario('normal', 777)).toBe(a)
    expect(getScenarioZones()).toEqual(before)
  })

  it('produces valid missions for 20 seeds x 4 packs', () => {
    let exerciseZones = 0
    let total = 0
    for (const seed of SEEDS) {
      for (const id of PACK_IDS) {
        total++
        const v = generateVoyage(id, seed)
        const o = PORTS[v.mission.originId]
        const d = PORTS[v.mission.destinationId]
        expect(o, `${id}/${seed} origin`).toBeDefined()
        expect(d, `${id}/${seed} destination`).toBeDefined()
        expect(o.id).not.toBe(d.id)
        expect(haversineNm(o.position, d.position)).toBeGreaterThanOrEqual(350)

        const dep = Date.parse(v.mission.departure)
        const early = Date.parse(v.mission.arrivalEarliest)
        const late = Date.parse(v.mission.arrivalLatest)
        expect(dep).toBeGreaterThanOrEqual(Date.UTC(2026, 6, 1))
        expect(dep).toBeLessThan(Date.UTC(2027, 8, 1))
        expect(early).toBeGreaterThan(dep)
        expect(late).toBeGreaterThan(early)
        // the latest arrival must be reachable at 12 kn along the reference track with slack
        expect((late - dep) / 3600e3).toBeGreaterThan((v.referenceDistanceNm / 12) * 1.3)

        expect(v.mission.cargoT).toBeGreaterThan(0)
        expect(v.mission.cargoT % 500).toBe(0)
        expect(o.exports.some((e) => e.cargoType === v.mission.cargoType)).toBe(true)
        expect(FLEET.some((h) => hullFeasible(h, v.mission.cargoT, o, d, v.mission.allowedFuels)), `${id}/${seed} no hull`).toBe(true)
        if (v.mission.vesselId !== 'auto') expect(hullFeasible(FLEET_BY_ID[v.mission.vesselId], v.mission.cargoT, o, d, v.mission.allowedFuels)).toBe(true)
        expect(v.mission.vesselId === 'auto').toBe(id === 'altfuel' || id === 'fleet')

        expect(v.ocean.monsoon).toBe(monsoonOf(v.mission.departure))
        expect(v.ocean.windScale).toBeGreaterThanOrEqual(0.85)
        expect(v.ocean.windScale).toBeLessThanOrEqual(1.15)
        expect(!!v.ocean.storm).toBe(id === 'storm')
        expect(v.autoReplanAtH !== undefined).toBe(id === 'storm')

        expect(v.name).toContain(o.name)
        expect(v.name).toContain(d.name)
        expect(v.description).toContain(o.name)
        for (const s of [v.name, v.tagline, v.description, ...v.notes]) expect(s).not.toMatch(BAD_DASH)
        expect(v.regions.length).toBeGreaterThan(0)

        // zones: synthetic, unique ids, no land at the centre, restricted box on the track at sea
        const ids = new Set(v.zones.map((z) => z.id))
        expect(ids.size).toBe(v.zones.length)
        for (const z of v.zones) {
          expect(z.provenance).toBe('scenario')
          const [x0, y0, x1, y1] = ringBBox(z.ring)
          expect(isLand((y0 + y1) / 2, (x0 + x1) / 2), `${z.id} centre on land`).toBe(false)
          for (const [x, y] of z.ring) expect(isLand(y, x), `${z.id} corner on land`).toBe(false)
          expect(pointInRing(o.position.lon, o.position.lat, z.ring)).toBe(false)
          expect(pointInRing(d.position.lon, d.position.lat, z.ring)).toBe(false)
        }
        const ex = v.zones.find((z) => z.kind === 'restricted')
        if (ex) {
          exerciseZones++
          const [x0, y0, x1, y1] = ringBBox(ex.ring)
          const c = { lat: (y0 + y1) / 2, lon: (x0 + x1) / 2 }
          const n = nearestOnTrack(v.referenceTrack, c)
          expect(n.distNm).toBeLessThan(20)
          expect(n.alongNm / v.referenceDistanceNm).toBeGreaterThan(0.2)
          expect(n.alongNm / v.referenceDistanceNm).toBeLessThan(0.45)
        }
        expect(v.zones.some((z) => z.kind === 'eca') || d.id === 'SGSIN').toBe(true)

        // fleet: four other hulls, at sea, bound for real ports, no arrows in notes
        expect(v.fleetUnits.length).toBe(FLEET.length - 1)
        expect(v.fleetUnits.some((u) => u.vesselId === v.primaryVesselId)).toBe(false)
        for (const u of v.fleetUnits) {
          expect(isLand(u.position.lat, u.position.lon), `${id}/${seed} ${u.vesselId} on land`).toBe(false)
          expect(u.position.lat).toBeGreaterThanOrEqual(REGION.lat0)
          expect(u.position.lon).toBeLessThanOrEqual(REGION.lon1)
          expect(Object.values(PORTS).some((p) => p.name === u.destination)).toBe(true)
          expect(u.note).not.toMatch(/→|->/)
          if (u.status === 'at anchor') expect(u.speedKn).toBe(0)
          else expect(u.speedKn).toBeGreaterThan(8)
        }
      }
    }
    // the exercise box needs sea room and clear approaches; it must exist on the large majority of voyages
    expect(exerciseZones / total).toBeGreaterThan(0.8)
  })

  it('storm pack: the actual track crosses the reference track mid-voyage, the initial forecast keeps clear', () => {
    for (const seed of SEEDS) {
      const v = generateVoyage('storm', seed)
      const storm = v.ocean.storm!
      const meta = v.storm!
      expect(storm.name).toMatch(/^Cyclonic storm Scenario-\d\d$/)
      const track = densify(v.referenceTrack, 10)
      const tc = meta.crossingAtH
      const total = v.referenceDistanceNm / STORM_TRANSIT_SPEED_KN
      expect(tc / total).toBeGreaterThan(0.28)
      expect(tc / total).toBeLessThan(0.72)

      const at = interpolateTrack(storm.actual, tc)!
      expect(nearestOnTrack(track, at).distNm, `seed ${seed} crossing off track`).toBeLessThan(60)
      expect(nearestOnTrack(track, meta.crossing).distNm).toBeLessThan(5)

      const initial = storm.forecasts[0]
      const update = storm.forecasts[1]
      expect(initial.issuedAtH).toBe(0)
      expect(update.issuedAtH).toBe(v.autoReplanAtH)
      expect(nearestOnTrack(track, interpolateTrack(initial.track, tc)!).distNm, `seed ${seed} initial forecast too close`).toBeGreaterThan(100)
      expect(nearestOnTrack(track, interpolateTrack(update.track, tc)!).distNm).toBeLessThan(60)
      expect(initial.label).toMatch(/pass (north|south|east|west|north-east|north-west|south-east|south-west) of the corridor/)
      expect(update.label).toMatch(/onto the corridor/)

      expect(v.autoReplanAtH!).toBeGreaterThanOrEqual(6)
      expect(v.autoReplanAtH!).toBeLessThan(tc - 24)

      const latestH = (Date.parse(v.mission.arrivalLatest) - Date.parse(v.mission.departure)) / 3600e3
      for (const tr of [storm.actual, initial.track, update.track]) {
        for (let i = 1; i < tr.length; i++) expect(tr[i].tH).toBeGreaterThan(tr[i - 1].tH)
        for (const p of tr) {
          expect(p.lat).toBeGreaterThanOrEqual(4)
          expect(p.lat).toBeLessThanOrEqual(REGION.lat1)
          expect(p.lon).toBeGreaterThanOrEqual(REGION.lon0)
          expect(p.lon).toBeLessThanOrEqual(REGION.lon1)
          expect(p.vmaxKn).toBeLessThanOrEqual(68)
        }
        expect(tr[tr.length - 1].tH).toBeGreaterThanOrEqual(latestH + 24)
      }
      const peak = Math.max(...storm.actual.map((p) => p.vmaxKn))
      expect(peak).toBeGreaterThanOrEqual(55)
      expect(peak).toBeLessThanOrEqual(65)
      expect(Math.max(...initial.track.map((p) => p.vmaxKn))).toBe(peak - 10)
    }
  })

  it('materialises a pack through buildScenario with the generator output', () => {
    const p = buildScenario('storm', SEEDS[3])
    expect(p.voyageSeed).toBe(SEEDS[3])
    expect(p.ocean.storm).toBeDefined()
    expect(p.autoReplanAtH).toBeDefined()
    expect(p.zones.length).toBeGreaterThan(0)
    expect(p.fleetUnits.length).toBe(4)
    expect(p.name).toBe(`${SCENARIOS.storm.name}: ${PORTS[p.mission.originId].name} to ${PORTS[p.mission.destinationId].name}`)
  })

  it('builds a voyage in well under 400 ms once the grid is warm', () => {
    const ids: ScenarioId[] = ['normal', 'storm', 'altfuel', 'fleet']
    let worst = 0
    for (let i = 0; i < 8; i++) {
      const t0 = performance.now()
      buildScenario(ids[i % 4], 500000 + i)
      worst = Math.max(worst, performance.now() - t0)
    }
    expect(worst).toBeLessThan(400)
  })
})
