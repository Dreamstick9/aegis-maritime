/**
 * Voyage generator: a complete, deterministic, plausible random voyage for a scenario pack.
 * Everything here is a SCENARIO INPUT (synthetic): ports are drawn from the port table, cargo from
 * the origin's export list, dates from a 14-month window, the ocean from the season, and the storm,
 * scenario zones and fleet positions are laid out relative to the shortest navigable track so that
 * the engine, the replay and the copy all describe the same route. Reproducible from (pack, seed).
 */
import { FLEET, type FleetUnit } from '../data/fleet'
import { PORTS } from '../data/ports'
import type { ScenarioId } from '../data/scenarios'
import { approachFor, generateCorridor, routeFeasible, type CorridorRequest } from './corridors'
import { STORES_T } from './evaluate'
import { FUELS } from './fuels'
import { clamp, densify, destinationPoint, haversineNm, initialBearingDeg, pointAlong, pointInRing, polylineLengthNm, ringBBox } from './geo'
import { landmarksAlong, nearestOnTrack, regionsAlong, type Landmark } from './regions'
import { Rng, hashSeed } from './rng'
import type { Availability, FuelId, LatLon, Mission, OceanConfig, Port, StormConfig, StormTrackPoint, Vessel, Zone } from './types'
import { loadingCondition } from './vessel'
import { ZONES, coastDistanceNm, getScenarioZones, isLand, setScenarioZones } from './zones'

/** Chart region (mirrors src/components/chart/projection.ts CHART; the engine must not import UI code). */
export const REGION = { lon0: 63, lon1: 108, lat0: -7.5, lat1: 23.5 }

/** Minimum under-keel clearance assumed by the generator (DEFAULT_ENGINE.safety.minUkcM). */
export const MIN_UKC_M = 1.0
/** Bunkers + stores used for capacity and draught checks (same figure as optimizer.candidateVessels). */
export const BUNKERS_EST_T = 1500 + STORES_T
/** Planning speed for crossing times and arrival windows. */
export const PLANNING_SPEED_KN = 12
/**
 * Transit speed assumed when timing the storm crossing. Balanced plans slow-steam at 9 to 10 kn
 * inside the storm pack's wide arrival window; timed at 12 kn the vessel reached the crossing a
 * day late and the system (6 to 10 kn) had moved 150 to 350 nm on.
 */
export const STORM_TRANSIT_SPEED_KN = 10
const WINDOW_START_MS = Date.UTC(2026, 6, 1)
const WINDOW_END_MS = Date.UTC(2027, 8, 1)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const COMPASS8 = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']

/** Pack CONDITIONS: what a pack applies to any generated voyage (names never depend on the voyage). */
export interface PackConditions {
  name: string
  tagline: string
  weights: Mission['weights']
  allowedFuels: FuelId[]
  shorePower: Mission['shorePower']
  notes: string[]
}

export const PACK_CONDITIONS: Record<ScenarioId, PackConditions> = {
  normal: {
    name: 'Normal voyage',
    tagline: "Laden passage in the season's established monsoon conditions",
    weights: { fuel: 0.25, cost: 0.25, emissions: 0.25, risk: 0.15, time: 0.1 },
    allowedFuels: ['VLSFO', 'HFO', 'MGO', 'B30'],
    shorePower: 'auto',
    notes: ['Monsoon wind/current/wave fields are analytic approximations with seeded noise (synthetic).', 'Fuel prices, port congestion and shore-power tariffs are scenario inputs.'],
  },
  storm: {
    name: 'Cyclone forecast shift, rolling re-plan',
    tagline: 'A tropical system moves onto the planned corridor after departure',
    weights: { fuel: 0.2, cost: 0.2, emissions: 0.2, risk: 0.3, time: 0.1 },
    allowedFuels: ['VLSFO', 'HFO', 'MGO', 'B30'],
    shorePower: 'auto',
    notes: ['The storm track, intensity and forecast revision are synthetic scenario inputs.', 'Ground-truth track used for replay differs slightly from the updated forecast to show forecast error.'],
  },
  altfuel: {
    name: 'Alternative-fuel comparison',
    tagline: 'Energy- and lifecycle-aware fuel choice with shore power where offered',
    weights: { fuel: 0.15, cost: 0.25, emissions: 0.4, risk: 0.1, time: 0.1 },
    allowedFuels: ['VLSFO', 'HFO', 'MGO', 'LNG', 'MEOH', 'EMEOH', 'B30', 'NH3'],
    shorePower: 'auto',
    notes: ['Lifecycle factors are illustrative defaults; prices are scenario inputs.', 'Ammonia is allowed by the mission; where neither port can supply it the engine rejects it and says why.'],
  },
  fleet: {
    name: 'Fleet allocation: which hull carries the cargo',
    tagline: 'Discrete vessel choice across five hulls with capacity, draught and CII trade-offs',
    weights: { fuel: 0.2, cost: 0.35, emissions: 0.25, risk: 0.1, time: 0.1 },
    allowedFuels: ['VLSFO', 'HFO', 'MGO', 'LNG', 'B30'],
    shorePower: 'auto',
    notes: ['Fleet particulars are synthetic design inference; hire rates are scenario inputs.'],
  },
}

export interface GeneratedVoyage {
  packId: ScenarioId
  voyageSeed: number
  /** engine seed (departure date as yyyymmdd, the reference packs' convention) */
  seed: number
  origin: Port
  destination: Port
  mission: Mission
  ocean: OceanConfig
  autoReplanAtH?: number
  zones: Zone[]
  fleetUnits: FleetUnit[]
  landmarks: Landmark[]
  name: string
  tagline: string
  description: string
  notes: string[]
  /** shortest navigable track (approach chains included) used to lay out the storm and the zones; NOT the plan */
  referenceTrack: LatLon[]
  referenceDistanceNm: number
  greatCircleNm: number
  /** sea areas along the reference track, in order */
  regions: string[]
  /** hulls that can carry the cargo and pass both ports (mirrors the evaluator's checks) */
  feasibleVesselIds: string[]
  /** the hull treated as the mission vessel for fleet placement (the fixed hull, or the first feasible one) */
  primaryVesselId: string
  storm?: {
    crossing: LatLon
    crossingAtH: number
    basin: string
    /** lateral offset of the initial forecast from the route at the crossing time (nm) */
    initialOffsetNm: number
    /** side of the corridor the initial forecast kept the system on */
    initialSide: string
    /** direction the updated forecast shifted the track */
    shiftDirection: string
    peakKn: number
  }
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
const r2 = (x: number) => Math.round(x * 100) / 100
const fmtT = (t: number) => t.toLocaleString('en-US')

function isoHour(ms: number): string {
  return new Date(Math.round(ms / 3600e3) * 3600e3).toISOString().slice(0, 13) + ':00:00Z'
}

function compass(bearingDeg: number): string {
  return COMPASS8[Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8]
}

/** Closest approach (nm) of a track to a point. */
function distToTrackNm(p: LatLon, track: LatLon[]): number {
  return nearestOnTrack(track, p).distNm
}

/** Axis-aligned box ring ([lon, lat][]) of `sideNm` around a centre. */
export function boxRing(center: LatLon, sideNm: number): number[][] {
  const dLat = sideNm / 2 / 60
  const dLon = sideNm / 2 / (60 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)))
  return [
    [r2(center.lon - dLon), r2(center.lat - dLat)],
    [r2(center.lon + dLon), r2(center.lat - dLat)],
    [r2(center.lon + dLon), r2(center.lat + dLat)],
    [r2(center.lon - dLon), r2(center.lat + dLat)],
  ]
}

function ringCenter(ring: number[][]): LatLon {
  const [x0, y0, x1, y1] = ringBBox(ring)
  return { lat: (y0 + y1) / 2, lon: (x0 + x1) / 2 }
}

/** Corners, centre and edge midpoints of a box must all be at sea. */
export function boxAtSea(ring: number[][]): boolean {
  const [x0, y0, x1, y1] = ringBBox(ring)
  const xm = (x0 + x1) / 2
  const ym = (y0 + y1) / 2
  const pts: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [xm, ym], [xm, y0], [xm, y1], [x0, ym], [x1, ym]]
  return pts.every(([lon, lat]) => !isLand(lat, lon))
}

function insideRegion(p: LatLon): boolean {
  return p.lon >= REGION.lon0 && p.lon <= REGION.lon1 && p.lat >= REGION.lat0 && p.lat <= REGION.lat1
}

/** True if any berth, pilot station or approach point of any port lies within `marginNm` of the box. */
function touchesApproaches(ring: number[][], ports: Record<string, Port>, marginNm: number): boolean {
  const [x0, y0, x1, y1] = ringBBox(ring)
  const dLat = marginNm / 60
  const dLon = marginNm / (60 * Math.max(0.2, Math.cos((((y0 + y1) / 2) * Math.PI) / 180)))
  for (const p of Object.values(ports)) {
    for (const q of [p.position, p.pilotStation, ...p.approach]) {
      if (q.lon >= x0 - dLon && q.lon <= x1 + dLon && q.lat >= y0 - dLat && q.lat <= y1 + dLat) return true
    }
  }
  return false
}

function fuelAvailability(port: Port, f: FuelId): Availability {
  return port.scenario.fuelAvailability[f] ?? FUELS[f].availability[port.id] ?? 'none'
}

/** A hull can burn some mission-allowed fuel that at least one of the two ports can supply (evaluator rule). */
export function hullFuelOk(v: Vessel, origin: Port, destination: Port, allowed: FuelId[]): boolean {
  return v.fuels.some((f) => allowed.includes(f) && !(fuelAvailability(origin, f) === 'none' && fuelAvailability(destination, f) === 'none'))
}

function hullDimsOk(v: Vessel, p: Port): boolean {
  return v.loaM <= p.limits.maxLoaM && v.beamM <= p.limits.maxBeamM
}

/** Deepest sailing draught that clears the origin channel and the destination berth with tide and UKC. */
export function maxDraughtM(origin: Port, destination: Port): number {
  return Math.min(origin.limits.innerChannelDepthM + origin.limits.tidalRangeM, destination.limits.berthDepthM + destination.limits.tidalRangeM) - MIN_UKC_M - 0.05
}

/** Largest cargo (t, floored to 500) a hull can carry between two ports within deadweight and draught. */
export function maxCargoT(v: Vessel, origin: Port, destination: Port): number {
  const byDwt = v.dwt - BUNKERS_EST_T
  const byDraught = v.dwt - BUNKERS_EST_T - (v.designDraftM - maxDraughtM(origin, destination)) * v.tpc * 100
  return Math.max(0, Math.floor(Math.min(byDwt, byDraught) / 500) * 500)
}

/**
 * Mirror of the evaluator's hull gates (src/engine/evaluate.ts port-limit block and
 * optimizer.candidateVessels): capacity with bunkers, LOA/beam at both ports, a usable fuel,
 * sailing draught + UKC against origin inner channel + tide and destination berth + tide.
 */
export function hullFeasible(v: Vessel, cargoT: number, origin: Port, destination: Port, allowed: FuelId[]): boolean {
  const lc = loadingCondition(v, cargoT, BUNKERS_EST_T)
  if (!lc.capacityOk) return false
  if (!hullDimsOk(v, origin) || !hullDimsOk(v, destination)) return false
  if (!hullFuelOk(v, origin, destination, allowed)) return false
  const o = origin.limits
  const d = destination.limits
  if (lc.sailingDraftM + MIN_UKC_M > o.innerChannelDepthM + o.tidalRangeM) return false
  if (lc.sailingDraftM + MIN_UKC_M > d.berthDepthM + d.tidalRangeM) return false
  return true
}

/** Smallest laden draught in the fleet (+UKC): the depth a port pair must be navigable for. */
function smallestFleetDraughtM(fleet: Vessel[]): number {
  let d = Infinity
  for (const v of fleet) d = Math.min(d, loadingCondition(v, 0.6 * v.dwt, BUNKERS_EST_T).sailingDraftM)
  return (Number.isFinite(d) ? d : 12) + MIN_UKC_M
}

function corridorRequest(origin: Port, destination: Port, ocean: OceanConfig, requiredDepthM: number): CorridorRequest {
  return {
    origin: origin.position,
    destination: destination.position,
    approach: approachFor(origin, destination),
    ocean,
    oceanOpts: { planningTimeH: 0 },
    startTimeH: 0,
    assumedSpeedKn: PLANNING_SPEED_KN,
    requiredDepthM,
    kinds: ['shortest'],
    idPrefix: 'ref',
  }
}

function pairNavigable(origin: Port, destination: Port, requiredDepthM: number): boolean {
  return routeFeasible(origin, destination, requiredDepthM)
}

function monsoonFor(month: number): OceanConfig['monsoon'] {
  if (month >= 5 && month <= 8) return 'SW'
  if (month >= 10 || month <= 1) return 'NE'
  return 'transition'
}

function seasonPhrase(m: OceanConfig['monsoon']): string {
  return m === 'SW' ? 'the south-west monsoon' : m === 'NE' ? 'the north-east monsoon' : 'the inter-monsoon transition'
}

function pickDepartureMs(rng: Rng, packId: ScenarioId): number {
  let ms: number
  if (packId === 'storm' && rng.next() < 0.75) {
    // cyclone seasons inside the 14-month window: Oct/Nov 2026, Apr/May 2027
    const [y, m] = rng.pick([[2026, 9], [2026, 10], [2027, 3], [2027, 4]] as const)
    const m0 = Date.UTC(y, m, 1)
    const m1 = Date.UTC(y, m + 1, 1)
    ms = m0 + rng.next() * (m1 - m0)
  } else {
    ms = WINDOW_START_MS + rng.next() * (WINDOW_END_MS - WINDOW_START_MS)
  }
  return Math.floor(ms / 3600e3) * 3600e3
}

function listWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]
}

// ---------------------------------------------------------------------------------------------
// Storm
// ---------------------------------------------------------------------------------------------
interface StormPlan {
  storm: StormConfig
  autoReplanAtH: number
  meta: NonNullable<GeneratedVoyage['storm']>
}

function generateStorm(rng: Rng, track: LatLon[], refNm: number, latestArrivalH: number, voyageSeed: number): StormPlan {
  // crossing point at 45 to 60 percent along the reference track, north of 4.5 N where possible
  let f = rng.range(0.45, 0.6)
  let at = pointAlong(track, f * refNm)
  if (at.pos.lat < 4.5) {
    let best: { f: number; pos: LatLon; headingDeg: number } | null = null
    for (let g = 0.3; g <= 0.7001; g += 0.01) {
      const p = pointAlong(track, g * refNm)
      if (p.pos.lat < 4.5) continue
      if (!best || Math.abs(g - f) < Math.abs(best.f - f)) best = { f: g, pos: p.pos, headingDeg: p.headingDeg }
    }
    if (best) {
      f = best.f
      at = { pos: best.pos, headingDeg: best.headingDeg, legIndex: 0 }
    }
  }
  const crossing = at.pos
  const routeHeading = at.headingDeg
  const tc = (f * refNm) / STORM_TRANSIT_SPEED_KN

  const basin = crossing.lon < 78 ? 'Arabian Sea' : crossing.lon <= 92 ? 'Bay of Bengal' : 'Andaman Sea'
  // recurving track: WNW at first, turning towards the basin's late heading (NW to N; WNW in the Andaman Sea)
  const [e0, e1, l0, l1] = basin === 'Arabian Sea' ? [285, 300, 320, 360] : basin === 'Bay of Bengal' ? [280, 295, 330, 360] : [275, 290, 290, 310]
  let hEarly = rng.range(e0, e1)
  const hLate = rng.range(l0, l1)
  const speedKn = rng.range(6, 10)
  const t0 = Math.max(0, tc - 90)
  const times = [0, 1, 2, 3, 4, 5].map((i) => t0 + 36 * i)
  const tEnd = times[5]
  // A system moving ALONG the route rides the corridor for days and no re-plan can dodge it, so the
  // storm crosses the route on whichever of its two headings is the more transverse: it completes
  // the recurve before the crossing (east-west routes) or only starts turning after it (north-south).
  const along = (b: number) => Math.abs(Math.cos(((b - routeHeading) * Math.PI) / 180))
  const turnFirst = along((l0 + l1) / 2) < along((e0 + e1) / 2)
  const [tr0, tr1] = turnFirst ? [t0, tc] : [tc, tEnd]
  const bearingAt = (t: number) => hEarly + (hLate - hEarly) * clamp((t - tr0) / Math.max(1, tr1 - tr0), 0, 1)
  const advance = (p: LatLon, tFrom: number, tTo: number): LatLon => {
    const n = Math.max(1, Math.ceil(Math.abs(tTo - tFrom) / 6))
    const dt = (tTo - tFrom) / n
    let q = p
    for (let k = 0; k < n; k++) {
      const tMid = tFrom + (k + 0.5) * dt
      q = destinationPoint(q, bearingAt(tMid) + (dt < 0 ? 180 : 0), speedKn * Math.abs(dt))
    }
    return q
  }
  // integrate outwards from the crossing point in both directions so the storm is AT the crossing at tc
  const build = (): LatLon[] => {
    const out: LatLon[] = new Array(times.length)
    let p = crossing
    let tPrev = tc
    for (let i = 0; i < times.length; i++) {
      if (times[i] < tc) continue
      p = advance(p, tPrev, times[i])
      tPrev = times[i]
      out[i] = p
    }
    p = crossing
    tPrev = tc
    for (let i = times.length - 1; i >= 0; i--) {
      if (times[i] >= tc) continue
      p = advance(p, tPrev, times[i])
      tPrev = times[i]
      out[i] = p
    }
    return out
  }
  let positions = build()
  // the vortex model is northern-hemisphere only: turn the early heading towards west until every
  // point (the lead segment runs back towards the south-east) stays north of 4.5 N
  for (let k = 0; k < 12 && Math.min(...positions.map((q) => q.lat)) < 4.5; k++) {
    hEarly -= 4
    positions = build()
  }
  const keepIn = (q: LatLon): LatLon => ({
    lat: clamp(q.lat, Math.max(4.2, REGION.lat0 + 0.5), REGION.lat1 - 0.5),
    lon: clamp(q.lon, REGION.lon0 + 0.5, REGION.lon1 - 0.5),
  })
  const peakKn = Math.round(rng.range(55, 65))
  // flat-topped ramp: the vertex nearest the crossing (at most 18 h away) carries the full peak
  const vmaxAt = (t: number) => Math.max(25, Math.round(peakKn - (peakKn - 25) * Math.min(1, Math.max(0, Math.abs(t - tc) - 18) / 90) ** 1.2))
  const actual: StormTrackPoint[] = times.map((t, i) => {
    const q = keepIn(positions[i])
    return { tH: Math.round(t * 10) / 10, lat: r2(q.lat), lon: r2(q.lon), vmaxKn: vmaxAt(t), rmaxNm: Math.round(40 + (20 * i) / 5) }
  })
  // dissipation point so the track extends past the latest arrival (+24 h) rather than stopping mid-voyage
  const tTerm = Math.max(tEnd + 36, Math.ceil(latestArrivalH + 24))
  const term = keepIn(destinationPoint(positions[5], hLate, 60))
  actual.push({ tH: tTerm, lat: r2(term.lat), lon: r2(term.lon), vmaxKn: 20, rmaxNm: 60 })

  // initial forecast: the whole track displaced 150 to 210 nm to the side of the ROUTE that keeps the
  // displaced track farthest from it around the crossing (the wind field reaches well beyond the
  // radius of maximum winds, and a route that bends can meet a parallel copy of the track elsewhere)
  let offsetNm = rng.range(150, 210)
  let side: LatLon | null = null
  let sideBearing = routeHeading + 90
  const nearCrossing = actual.filter((pt) => Math.abs(pt.tH - tc) <= 48)
  const clearanceNm = (dLat: number, dLon: number) => Math.min(...nearCrossing.map((pt) => distToTrackNm(keepIn({ lat: pt.lat + dLat, lon: pt.lon + dLon }), track)))
  for (let tries = 0; tries < 8 && !side; tries++) {
    const cands = [routeHeading + 90, routeHeading - 90].map((b) => ({ b, q: destinationPoint(crossing, b, offsetNm) }))
    // a side is usable when the whole displaced track stays north of 4.2 N and inside the region
    const ok = cands.filter((c) => {
      const dLat = c.q.lat - crossing.lat
      const dLon = c.q.lon - crossing.lon
      return c.q.lat >= 4.5 && insideRegion(c.q) && actual.every((pt) => pt.lat + dLat >= 4.2 && insideRegion({ lat: pt.lat + dLat, lon: pt.lon + dLon }))
    })
    const pool = ok.length ? ok : cands
    let bestD = -1
    for (const c of pool) {
      const d = clearanceNm(c.q.lat - crossing.lat, c.q.lon - crossing.lon)
      if (d > bestD) {
        bestD = d
        side = c.q
        sideBearing = c.b
      }
    }
    if (bestD < 120) {
      side = null
      offsetNm += 20
    }
  }
  const sidePos = side ?? destinationPoint(crossing, sideBearing, offsetNm)
  const delta = { lat: sidePos.lat - crossing.lat, lon: sidePos.lon - crossing.lon }
  const initial = actual.map((pt) => {
    const q = keepIn({ lat: pt.lat + delta.lat, lon: pt.lon + delta.lon })
    return { ...pt, lat: r2(q.lat), lon: r2(q.lon), vmaxKn: Math.max(20, pt.vmaxKn - 10) }
  })
  const initialSide = compass(sideBearing)
  const shiftDirection = compass(sideBearing + 180)

  // rolling re-plan trigger: well before the vessel reaches the crossing
  let autoReplanAtH = clamp(Math.round(0.28 * tc), 18, 48)
  if (autoReplanAtH >= tc - 24) autoReplanAtH = Math.max(6, Math.floor(tc - 25))

  // forecast update at the re-plan time: the actual track with a 15 to 30 nm error per point
  const errRng = rng.fork('forecast-error')
  const update = actual.map((pt) => {
    const q = keepIn(destinationPoint(pt, errRng.range(0, 360), errRng.range(15, 30)))
    return { ...pt, lat: r2(q.lat), lon: r2(q.lon) }
  })

  const nn = String(1 + (Math.abs(voyageSeed) % 99)).padStart(2, '0')
  const storm: StormConfig = {
    name: `Cyclonic storm Scenario-${nn}`,
    forecasts: [
      { issuedAtH: 0, label: `Initial forecast (t+0 h): system expected to pass ${initialSide} of the corridor`, track: initial },
      { issuedAtH: autoReplanAtH, label: `Forecast update (t+${autoReplanAtH} h): track shifts ${shiftDirection} onto the corridor, intensifies to ${peakKn} kn`, track: update },
    ],
    actual,
  }
  return {
    storm,
    autoReplanAtH,
    meta: { crossing: { lat: r2(crossing.lat), lon: r2(crossing.lon) }, crossingAtH: Math.round(tc * 10) / 10, basin, initialOffsetNm: Math.round(distToTrackNm(sidePos, track)), initialSide, shiftDirection, peakKn },
  }
}

// ---------------------------------------------------------------------------------------------
// Scenario zones
// ---------------------------------------------------------------------------------------------
function placeExerciseZone(rng: Rng, track: LatLon[], refNm: number, ports: Record<string, Port>, req: CorridorRequest): Zone | null {
  for (let attempt = 0; attempt < 10; attempt++) {
    const g = rng.range(0.25, 0.4)
    const side = Math.round(rng.range(35, 60))
    const c = pointAlong(track, g * refNm).pos
    const ring = boxRing(c, side)
    if (!boxAtSea(ring)) continue
    if (touchesApproaches(ring, ports, 10)) continue
    const zone: Zone = {
      id: 'scn-exercise',
      name: 'Naval exercise area (scenario)',
      kind: 'restricted',
      ring,
      provenance: 'scenario',
      note: `Synthetic temporary exclusion area of ${side} nm placed on the direct track for this voyage so the planner must divert; not a real notice to mariners.`,
    }
    // the direct route must still exist with the box active (a box in a narrow strait would block it)
    setScenarioZones([zone])
    const alt = generateCorridor('shortest', req)
    setScenarioZones([])
    if (!alt || alt.distanceNm > refNm * 1.35) continue
    return zone
  }
  return null
}

function fixedAnchorageNear(p: LatLon): boolean {
  return ZONES.some((z) => z.kind === 'anchorage' && haversineNm(ringCenter(z.ring), p) < 25)
}

function seawardBearing(port: Port): number {
  const chain = port.approach
  if (chain.length >= 2) return initialBearingDeg(chain[0], chain[chain.length - 1])
  return initialBearingDeg(port.position, port.pilotStation)
}

function placeOuterAnchorage(port: Port, role: 'origin' | 'destination'): Zone | null {
  if (fixedAnchorageNear(port.pilotStation)) return null
  const seaward = seawardBearing(port)
  const tries: [number, number][] = [[0, 6], [40, 6], [-40, 6], [0, 10], [60, 8], [-60, 8], [90, 7], [-90, 7], [0, 14]]
  for (const [db, dist] of tries) {
    const c = destinationPoint(port.pilotStation, seaward + db, dist)
    const ring = boxRing(c, 8)
    if (!boxAtSea(ring)) continue
    if (pointInRing(port.position.lon, port.position.lat, ring)) continue
    return {
      id: `scn-anchorage-${port.id.toLowerCase()}`,
      name: `${port.name} outer anchorage (scenario)`,
      kind: 'anchorage',
      ring,
      provenance: 'scenario',
      note: `Indicative ${role} anchorage placed seaward of the ${port.name} pilot station for this voyage (synthetic).`,
    }
  }
  return null
}

function placeTemporaryAnchorage(rng: Rng, destination: Port, ports: Record<string, Port>): Zone | null {
  const chain = destination.approach
  if (chain.length < 2) return null
  const seaEnd = chain[chain.length - 1]
  const leg = initialBearingDeg(chain[chain.length - 2], seaEnd)
  const first = rng.next() < 0.5 ? 90 : -90
  for (const sgn of [first, -first]) {
    for (const dist of [18, 24]) {
      const c = destinationPoint(seaEnd, leg + sgn, dist)
      const ring = boxRing(c, 15)
      if (!boxAtSea(ring)) continue
      if (touchesApproaches(ring, ports, 4)) continue
      return {
        id: 'scn-temp-anchorage',
        name: 'Temporary anchorage (scenario)',
        kind: 'anchorage',
        ring,
        provenance: 'scenario',
        note: `Synthetic temporary anchorage off the ${destination.name} approach used when the arrival window is missed (scenario input).`,
      }
    }
  }
  return null
}

function placeEcaOverlay(destination: Port, dense: LatLon[]): Zone | null {
  if (ZONES.some((z) => z.kind === 'eca' && pointInRing(destination.pilotStation.lon, destination.pilotStation.lat, z.ring))) return null
  const seaward = seawardBearing(destination)
  const candidates: { c: LatLon; side: number }[] = []
  // open-coast ports: a 60 nm box off the pilot station (shrinking and moving seaward as needed)
  for (const [off, side] of [[35, 60], [45, 60], [40, 50], [50, 50], [30, 45], [55, 45], [60, 60], [25, 40]] as const) candidates.push({ c: destinationPoint(destination.pilotStation, seaward, off), side })
  // strait and gulf ports: smaller boxes centred on the pilotage chain, from the open-sea end inward
  const chain = destination.approach.slice(1).reverse()
  for (const side of [30, 20, 15]) for (const node of chain) candidates.push({ c: node, side })
  for (const { c, side } of candidates) {
    const ring = boxRing(c, side)
    if (!boxAtSea(ring)) continue
    if (pointInRing(destination.position.lon, destination.position.lat, ring)) continue
    if (!dense.some((p) => pointInRing(p.lon, p.lat, ring))) continue
    return {
      id: `scn-eca-${destination.id.toLowerCase()}`,
      name: 'Emission-control overlay (scenario)',
      kind: 'eca',
      ring,
      provenance: 'scenario',
      note: `Hypothetical ${side} nm low-emission overlay on the ${destination.name} approaches: the main engine switches to MGO inside. There is no IMO ECA in this region today.`,
    }
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// Fleet units
// ---------------------------------------------------------------------------------------------
function randomSeaPosition(rng: Rng): LatLon {
  for (let i = 0; i < 80; i++) {
    const lat = r2(rng.range(REGION.lat0 + 1, REGION.lat1 - 1))
    const lon = r2(rng.range(REGION.lon0 + 1, REGION.lon1 - 1))
    if (isLand(lat, lon)) continue
    if (coastDistanceNm(lat, lon) < 40) continue
    return { lat, lon }
  }
  return { lat: 5, lon: 88 }
}

function anchoragePosition(rng: Rng, port: Port): LatLon {
  for (let i = 0; i < 24; i++) {
    const q = destinationPoint(port.pilotStation, rng.range(0, 360), rng.range(1.5, 10))
    const lat = r2(q.lat)
    const lon = r2(q.lon)
    if (!isLand(lat, lon)) return { lat, lon }
  }
  return { ...port.pilotStation }
}

/**
 * Synthetic positions for the hulls that are not on the mission: laden or in ballast at sea (at least
 * 40 nm from land) bound for a port in the table, or at anchor within 12 nm of a port's pilot station.
 */
export function makeFleetUnits(rng: Rng, ports: Record<string, Port>, excludeVesselId: string, fleet: Vessel[] = FLEET): FleetUnit[] {
  const portList = Object.values(ports)
  const out: FleetUnit[] = []
  for (const v of fleet) {
    if (v.id === excludeVesselId) continue
    const roll = rng.next()
    const status: FleetUnit['status'] = roll < 0.45 ? 'laden' : roll < 0.8 ? 'ballast' : 'at anchor'
    const dest = rng.pick(portList)
    if (status === 'at anchor') {
      out.push({
        vesselId: v.id,
        status,
        position: anchoragePosition(rng, dest),
        headingDeg: Math.round(rng.range(0, 360)),
        speedKn: 0,
        destination: dest.name,
        note: `Awaiting berth off ${dest.name} (synthetic)`,
      })
      continue
    }
    const position = randomSeaPosition(rng)
    const heading = Math.round((initialBearingDeg(position, dest.position) + rng.gauss() * 8 + 360) % 360)
    const speedKn = Math.round(rng.range(10.5, 13.8) * 10) / 10
    if (status === 'laden') {
      const others = portList.filter((p) => p.id !== dest.id)
      const from = others.length ? rng.pick(others) : dest
      const cargo = from.exports.length ? rng.pick(from.exports).cargoType : 'Bulk cargo'
      out.push({ vesselId: v.id, status, position, headingDeg: heading, speedKn, destination: dest.name, note: `${cargo}, ${from.name} to ${dest.name} (synthetic)` })
    } else {
      out.push({ vesselId: v.id, status, position, headingDeg: heading, speedKn, destination: dest.name, note: `Ballast leg to load at ${dest.name} (synthetic)` })
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------------------------
export function generateVoyage(packId: ScenarioId, voyageSeed: number, ports: Record<string, Port> = PORTS, fleet: Vessel[] = FLEET): GeneratedVoyage {
  const rng = new Rng(hashSeed(`${packId}-${voyageSeed}`))
  const pack = PACK_CONDITIONS[packId]
  // the reference track and the zone checks must see the fixed layers only, not a previous voyage's zones
  const prevZones = getScenarioZones()
  setScenarioZones([])
  try {
    return generate(rng, packId, pack, voyageSeed, ports, fleet)
  } finally {
    setScenarioZones(prevZones)
  }
}

function generate(rng: Rng, packId: ScenarioId, pack: PackConditions, voyageSeed: number, ports: Record<string, Port>, fleet: Vessel[]): GeneratedVoyage {
  const portList = Object.values(ports)
  const minGcNm = packId === 'storm' ? 800 : 350
  const smallestDraught = smallestFleetDraughtM(fleet)
  // The voyage's identity (ports and cargo) is drawn from the seed alone, under the base fuel menu,
  // so every pack applies its conditions to the SAME voyage (the pack picker and the Analytics
  // comparison promise this). A pack that needs a longer passage (storm, 800 nm) walks the same
  // sequence on to the next qualifying pair, so it differs only when the seed's pair is too short.
  const identity = new Rng(hashSeed(`voyage-${voyageSeed}`))
  const baseFuels = PACK_CONDITIONS.normal.allowedFuels

  // 1. port pair
  let origin: Port | null = null
  let destination: Port | null = null
  const pairRng = identity.fork('ports')
  for (let attempt = 0; attempt < 40 && portList.length >= 2; attempt++) {
    const o = pairRng.pick(portList)
    const d = pairRng.pick(portList)
    if (o.id === d.id) continue
    if (haversineNm(o.position, d.position) < minGcNm) continue
    const hulls = fleet.filter((v) => hullDimsOk(v, o) && hullDimsOk(v, d) && hullFuelOk(v, o, d, baseFuels))
    if (!hulls.length) continue
    if (Math.max(...hulls.map((v) => maxCargoT(v, o, d))) < 20000) continue
    if (!pairNavigable(o, d, smallestDraught)) continue
    origin = o
    destination = d
    break
  }
  if (!origin || !destination) {
    origin = ports.INMRM ?? portList[0]
    destination = ports.SGSIN ?? portList[1] ?? portList[0]
  }
  const gcNm = haversineNm(origin.position, destination.position)

  // 2. departure, season, ocean
  const depRng = rng.fork('departure')
  const departureMs = pickDepartureMs(depRng, packId)
  const dep = new Date(departureMs)
  const month = dep.getUTCMonth()
  const monsoon = monsoonFor(month)
  const swellM = r2(monsoon === 'SW' ? depRng.range(2.0, 2.6) : monsoon === 'NE' ? depRng.range(1.2, 1.6) : depRng.range(1.4, 1.9))
  const ocean: OceanConfig = { seed: 1 + depRng.int(999999), monsoon, windScale: r2(depRng.range(0.85, 1.15)), swellM, noiseAmp: r2(depRng.range(0.9, 1.1)) }
  const seed = dep.getUTCFullYear() * 10000 + (month + 1) * 100 + dep.getUTCDate()

  // 3. cargo and hull(s)
  const cargoRng = identity.fork('cargo')
  const exportsList = origin.exports.length ? origin.exports : [{ cargoType: 'Bulk cargo', minT: 40000, maxT: 120000 }]
  const exp = cargoRng.pick(exportsList)
  const compatible = fleet.filter((v) => hullDimsOk(v, origin) && hullDimsOk(v, destination) && hullFuelOk(v, origin, destination, baseFuels))
  const fleetMax = compatible.length ? Math.max(...compatible.map((v) => maxCargoT(v, origin, destination))) : 0
  let cargoT = Math.round(cargoRng.range(exp.minT, exp.maxT) / 500) * 500
  if (fleetMax > 0) cargoT = Math.min(cargoT, fleetMax)
  const feasible = fleet.filter((v) => hullFeasible(v, cargoT, origin, destination, pack.allowedFuels))
  const fixedHull = packId === 'normal' || packId === 'storm'
  const vesselId = fixedHull ? (feasible.length ? cargoRng.pick(feasible).id : fleet[0].id) : 'auto'
  const primaryVesselId = vesselId !== 'auto' ? vesselId : (feasible[0]?.id ?? fleet[0].id)
  // the optimizer sizes the corridor depth from every usable hull (capacity + fuel), or the fixed hull
  const usable = vesselId === 'auto' ? fleet.filter((v) => loadingCondition(v, cargoT, BUNKERS_EST_T).capacityOk && hullFuelOk(v, origin, destination, pack.allowedFuels)) : fleet.filter((v) => v.id === vesselId)
  const reqDepth = (usable.length ? Math.max(...usable.map((v) => loadingCondition(v, cargoT, BUNKERS_EST_T).sailingDraftM)) : smallestDraught - MIN_UKC_M) + MIN_UKC_M

  // 4. reference track (shortest navigable, approach chains included)
  const req = corridorRequest(origin, destination, ocean, reqDepth)
  const ref = generateCorridor('shortest', req) ?? generateCorridor('shortest', { ...req, requiredDepthM: smallestDraught })
  const referenceTrack = ref ? ref.waypoints : densify([...origin.approach, ...destination.approach.slice().reverse()], 30)
  const refNm = ref ? ref.distanceNm : Math.max(polylineLengthNm(referenceTrack), gcNm * 1.15)
  const dense = densify(referenceTrack, 15)

  // 5. arrival window from the reference track length at the planning speed
  const baselineH = refNm / PLANNING_SPEED_KN
  const latestFactor = packId === 'storm' ? 1.35 * 1.2 : 1.35
  const latestArrivalH = latestFactor * baselineH + 24
  const mission: Mission = {
    originId: origin.id,
    destinationId: destination.id,
    cargoT,
    cargoType: exp.cargoType,
    departure: isoHour(departureMs),
    arrivalEarliest: isoHour(departureMs + 0.9 * baselineH * 3600e3),
    arrivalLatest: isoHour(departureMs + latestArrivalH * 3600e3),
    weights: { ...pack.weights },
    safetyProfile: 'standard',
    allowedFuels: pack.allowedFuels.slice(),
    shorePower: pack.shorePower,
    vesselId,
  }

  // 6. storm (storm pack only)
  let autoReplanAtH: number | undefined
  let stormMeta: GeneratedVoyage['storm']
  if (packId === 'storm') {
    const plan = generateStorm(rng.fork('storm'), referenceTrack, refNm, latestArrivalH, voyageSeed)
    ocean.storm = plan.storm
    autoReplanAtH = plan.autoReplanAtH
    stormMeta = plan.meta
  }

  // 7. scenario zones
  const zoneRng = rng.fork('zones')
  const zones: Zone[] = []
  const exercise = placeExerciseZone(zoneRng, referenceTrack, refNm, ports, req)
  if (exercise) zones.push(exercise)
  const oa = placeOuterAnchorage(origin, 'origin')
  if (oa) zones.push(oa)
  const da = placeOuterAnchorage(destination, 'destination')
  if (da) zones.push(da)
  if (zoneRng.next() < 0.5) {
    const ta = placeTemporaryAnchorage(zoneRng, destination, ports)
    if (ta) zones.push(ta)
  }
  const eca = placeEcaOverlay(destination, dense)
  if (eca) zones.push(eca)

  // 8. fleet units, landmarks, regions
  const fleetUnits = makeFleetUnits(rng.fork('fleet'), ports, primaryVesselId, fleet)
  const landmarks = landmarksAlong(referenceTrack, 90)
  const regions = regionsAlong(dense)
  const regionsUnique = regions.filter((r, i) => regions.indexOf(r) === i)

  // 9. copy
  const tonnage = fmtT(cargoT)
  const cargoLower = exp.cargoType.toLowerCase()
  const season = seasonPhrase(monsoon)
  const dateStr = `${dep.getUTCDate()} ${MONTHS[month]} ${dep.getUTCFullYear()}`
  const vessel = fleet.find((v) => v.id === vesselId)
  const who = vessel ? vessel.name : 'Any fleet hull may be assigned; the mission'
  const regionText = listWithAnd(regionsUnique.map((r) => (r.startsWith('The ') ? r : `the ${r}`)))
  const s1 = `${who} loads ${tonnage} t of ${cargoLower} at ${origin.name} and sails for ${destination.name} on ${dateStr}.`
  const s2 = `${MONTHS[month]} falls in ${season}; the reference track of about ${fmtT(Math.round(refNm))} nm crosses ${regionText}.`
  let s3: string
  let tagline: string
  const sp = destination.scenario.shorePower.available
  switch (packId) {
    case 'storm':
      s3 = stormMeta ? `A cyclonic storm over the ${stormMeta.basin} is first forecast to pass ${stormMeta.initialSide} of the corridor; the t+${autoReplanAtH} h update moves it ${stormMeta.shiftDirection} onto the track, which the vessel would meet about ${Math.round(stormMeta.crossingAtH)} h out.` : ''
      tagline = `${stormMeta?.basin ?? 'Tropical'} system moves onto the planned corridor after departure`
      break
    case 'altfuel':
      s3 = `Vessel selection is open so the engine trades LNG, VLSFO, B30 and methanol options on price per GJ, WtW intensity, tank capacity and port availability${sp ? `, and decides on shore power at ${destination.name}` : `; ${destination.name} offers no shore power`}.`
      tagline = `Energy- and lifecycle-aware fuel choice${sp ? ` with shore power at ${destination.name}` : ' where shore power is not offered'}`
      break
    case 'fleet': {
      const excl = fleet.length - feasible.length
      s3 = excl > 0 ? `The engine may assign any fleet vessel: ${excl} of ${fleet.length} hulls cannot carry ${tonnage} t within the ${origin.limits.innerChannelDepthM} m ${origin.name} channel and the ${destination.limits.berthDepthM} m ${destination.name} berth, so capacity, hire rate, consumption and CII decide.` : `The engine may assign any fleet vessel: all ${fleet.length} hulls can carry ${tonnage} t past the ${origin.limits.innerChannelDepthM} m ${origin.name} channel and the ${destination.limits.berthDepthM} m ${destination.name} berth, so hire rate, consumption and CII decide.`
      tagline = `Discrete vessel choice across ${fleet.length} hulls with capacity, draught and CII trade-offs`
      break
    }
    default:
      s3 = monsoon === 'SW' ? 'Fresh south-westerlies and long swell dominate the open-sea legs.' : monsoon === 'NE' ? 'Lighter north-easterlies with the monsoon current reversed.' : 'Light and variable winds with convective squalls.'
      tagline = `Laden ${cargoLower} passage, ${tonnage} t, in ${season}`
  }
  const description = [s1, s2, s3].filter(Boolean).join(' ')
  const notes = [...pack.notes, `Ports, cargo, dates, storm and scenario zones for this voyage are drawn from voyage seed ${voyageSeed} (synthetic scenario inputs).`]

  return {
    packId,
    voyageSeed,
    seed,
    origin,
    destination,
    mission,
    ocean,
    autoReplanAtH,
    zones,
    fleetUnits,
    landmarks,
    name: `${pack.name}: ${origin.name} to ${destination.name}`,
    tagline,
    description,
    notes,
    referenceTrack,
    referenceDistanceNm: Math.round(refNm),
    greatCircleNm: Math.round(gcNm),
    regions: regionsUnique,
    feasibleVesselIds: feasible.map((v) => v.id),
    primaryVesselId,
    storm: stormMeta,
  }
}
