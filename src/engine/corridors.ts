/**
 * Safe route generator: A* over the operating-area grid with land, coastal buffer,
 * under-keel and restricted-zone constraints, run K times with different cost
 * weightings to produce candidate corridors. Fixed pilotage/approach waypoints handle
 * the narrow Malacca/Singapore approaches the 0.25° grid cannot resolve; two ports whose
 * chains meet on the same fairway are spliced along it without a search.
 */
import { haversineNm, initialBearingDeg, polylineLengthNm } from './geo'
import { currentAlongTrack, sampleEnv, type OceanOptions } from './ocean'
import { nearestOnTrack } from './regions'
import type { Corridor, CorridorKind, LatLon, OceanConfig, Port } from './types'
import { cellCenter, cellIndex, depthAt, getOceanGrid, zoneBits, type OceanGrid } from './zones'

export interface ApproachPlan {
  /** waypoints from the origin berth to the open-sea A* start (inclusive of start) */
  departure: LatLon[]
  /** waypoints from the A* goal to the destination berth (inclusive of goal) */
  arrival: LatLon[]
}

/**
 * Approach plan for a port pair from the ports' own pilotage chains (berth to open sea): the
 * departure chain runs seaward from the origin, the arrival chain runs inward to the destination.
 * Implementations may splice the two chains where they share a fairway (see generateCorridor).
 */
export function approachFor(origin: Port, destination: Port): ApproachPlan {
  return { departure: origin.approach.slice(), arrival: destination.approach.slice().reverse() }
}

/** 16-direction moves (king + knight) for straighter grid paths */
const MOVES: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
  [-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1],
]

class MinHeap {
  private keys: number[] = []
  private vals: number[] = []
  get size() {
    return this.keys.length
  }
  push(key: number, val: number) {
    const k = this.keys
    const v = this.vals
    k.push(key)
    v.push(val)
    let i = k.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (k[p] <= k[i]) break
      ;[k[p], k[i]] = [k[i], k[p]]
      ;[v[p], v[i]] = [v[i], v[p]]
      i = p
    }
  }
  pop(): number {
    const k = this.keys
    const v = this.vals
    const top = v[0]
    const lk = k.pop() as number
    const lv = v.pop() as number
    if (k.length) {
      k[0] = lk
      v[0] = lv
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < k.length && k[l] < k[m]) m = l
        if (r < k.length && k[r] < k[m]) m = r
        if (m === i) break
        ;[k[m], k[i]] = [k[i], k[m]]
        ;[v[m], v[i]] = [v[i], v[m]]
        i = m
      }
    }
    return top
  }
}

export interface AStarOptions {
  kind: CorridorKind
  ocean: OceanConfig
  oceanOpts: OceanOptions
  startTimeH: number
  assumedSpeedKn: number
  requiredDepthM: number
  /** extra penalty multiplier for cells within N cells of land */
  coastBufferCells: number
  /** penalise cells near a previous corridor to diversify (optional) */
  avoid?: { points: LatLon[]; radiusNm: number; weight: number }
}

export interface AStarResult {
  path: LatLon[]
  expanded: number
  costNm: number
}

function blocked(g: OceanGrid, i: number, requiredDepthM: number, lat: number, lon: number): boolean {
  if (g.land[i]) return true
  if (g.coastCells[i] <= 1) return true
  if (g.zoneMask[i] & 1) return true
  if (g.zoneMask[i] & 2) {
    // shallow zone: check depth from the zone model
    if (depthAt(lat, lon) < requiredDepthM) return true
  }
  return false
}

export function hazardPenalty(hsM: number, windKn: number, stormWindKn: number): number {
  let p = 0
  if (hsM > 2.5) p += ((hsM - 2.5) / 2.5) ** 2 * 1.5
  if (windKn > 25) p += ((windKn - 25) / 15) ** 2 * 0.8
  if (stormWindKn > 20) p += ((stormWindKn - 20) / 20) ** 2 * 3
  return p
}

export function astar(start: LatLon, goal: LatLon, opts: AStarOptions): AStarResult | null {
  const g = getOceanGrid()
  const si = cellIndex(g, start.lat, start.lon)
  const gi = cellIndex(g, goal.lat, goal.lon)
  if (si < 0 || gi < 0) return null
  const n = g.rows * g.cols
  const gScore = new Float64Array(n).fill(Infinity)
  const tScore = new Float64Array(n).fill(0)
  const came = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  const heap = new MinHeap()
  gScore[si] = 0
  heap.push(haversineNm(start, goal), si)
  const goalC = cellCenter(g, gi)
  let expanded = 0
  const avoid = opts.avoid
  while (heap.size) {
    const cur = heap.pop()
    if (closed[cur]) continue
    closed[cur] = 1
    expanded++
    if (cur === gi) break
    const r = Math.floor(cur / g.cols)
    const c = cur % g.cols
    const here = cellCenter(g, cur)
    for (const [dr, dc] of MOVES) {
        const rr = r + dr
        const cc = c + dc
        if (rr < 0 || rr >= g.rows || cc < 0 || cc >= g.cols) continue
        const nb = rr * g.cols + cc
        if (closed[nb]) continue
        const nc = cellCenter(g, nb)
        if (nb !== gi && blocked(g, nb, opts.requiredDepthM, nc.lat, nc.lon)) continue
        if (Math.abs(dr) + Math.abs(dc) === 3) {
          // knight move: both intermediate cells must be free
          const m1 = (r + Math.sign(dr)) * g.cols + (c + Math.sign(dc))
          const m2 = (r + (Math.abs(dr) === 2 ? Math.sign(dr) : 0)) * g.cols + (c + (Math.abs(dc) === 2 ? Math.sign(dc) : 0))
          const p1 = cellCenter(g, m1)
          const p2 = cellCenter(g, m2)
          if (blocked(g, m1, opts.requiredDepthM, p1.lat, p1.lon) || blocked(g, m2, opts.requiredDepthM, p2.lat, p2.lon)) continue
        }
      {
        const stepNm = haversineNm(here, nc)
        const tArr = opts.startTimeH + (gScore[cur] + stepNm) / opts.assumedSpeedKn
        let mult = 1
        // gentle coastal preference for all corridors, stronger for the offshore corridor
        const coast = g.coastCells[nb]
        if (coast <= opts.coastBufferCells) mult += (opts.kind === 'offshore' ? 0.9 : 0.12) * (opts.coastBufferCells + 1 - coast)
        if (opts.kind === 'weather' || opts.kind === 'current' || opts.kind === 'offshore') {
          const env = sampleEnv(opts.ocean, nc.lat, nc.lon, tArr, opts.oceanOpts)
          if (opts.kind === 'weather') mult += hazardPenalty(env.hsM, env.windKn, env.stormWindKn)
          else if (opts.kind === 'offshore') mult += 0.4 * hazardPenalty(env.hsM, env.windKn, env.stormWindKn)
          else {
            // current corridor: reward assisting current (cost ∝ time), keep light storm avoidance
            const heading = initialBearingDeg(here, nc)
            const assist = currentAlongTrack(env, heading)
            mult *= opts.assumedSpeedKn / Math.max(4, opts.assumedSpeedKn + assist)
            mult += 0.5 * hazardPenalty(env.hsM, env.windKn, env.stormWindKn)
          }
        }
        if (avoid) {
          let dmin = Infinity
          for (const p of avoid.points) {
            const d = haversineNm(nc, p)
            if (d < dmin) dmin = d
          }
          if (dmin < avoid.radiusNm) mult += avoid.weight * (1 - dmin / avoid.radiusNm)
        }
        const tentative = gScore[cur] + stepNm * mult
        if (tentative < gScore[nb]) {
          gScore[nb] = tentative
          tScore[nb] = tArr
          came[nb] = cur
          heap.push(tentative + haversineNm(nc, goalC), nb)
        }
      }
    }
  }
  if (came[gi] < 0 && gi !== si) return null
  const cells: number[] = []
  for (let i = gi; i >= 0; i = came[i]) {
    cells.push(i)
    if (i === si) break
  }
  cells.reverse()
  const path = cells.map((i) => cellCenter(g, i))
  path[0] = start
  path[path.length - 1] = goal
  return { path, expanded, costNm: gScore[gi] }
}

/** Douglas-Peucker simplification in degree space (tolerance in degrees). */
export function simplify(points: LatLon[], tolDeg: number): LatLon[] {
  if (points.length <= 2) return points
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number]
    let maxD = 0
    let idx = -1
    const ax = points[a].lon
    const ay = points[a].lat
    const bx = points[b].lon
    const by = points[b].lat
    const len = Math.hypot(bx - ax, by - ay) || 1e-9
    for (let i = a + 1; i < b; i++) {
      const px = points[i].lon
      const py = points[i].lat
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (maxD > tolDeg && idx > 0) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

/** Simplify, then re-insert original vertices wherever a straight leg would cross a blocked cell. */
export function simplifySafe(points: LatLon[], tolDeg: number, isBlocked: (lat: number, lon: number) => boolean): LatLon[] {
  let out = simplify(points, tolDeg)
  for (let iter = 0; iter < 6; iter++) {
    let changed = false
    const next: LatLon[] = [out[0]]
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1]
      const b = out[i]
      const n = Math.max(2, Math.ceil(haversineNm(a, b) / 8))
      let bad = false
      for (let k = 1; k < n; k++) {
        const f = k / n
        const lat = a.lat + (b.lat - a.lat) * f
        const lon = a.lon + (b.lon - a.lon) * f
        if (isBlocked(lat, lon)) {
          bad = true
          break
        }
      }
      if (bad) {
        // re-insert the original path vertex that lies between a and b, nearest to the midpoint
        const ia = points.indexOf(a)
        const ib = points.indexOf(b)
        if (ia >= 0 && ib > ia + 1) {
          next.push(points[Math.floor((ia + ib) / 2)])
          changed = true
        }
      }
      next.push(b)
    }
    out = next
    if (!changed) break
  }
  return out
}

const KIND_META: Record<CorridorKind, { name: string; description: string }> = {
  shortest: { name: 'Direct corridor', description: 'Shortest navigable track: A* on distance with coastal buffer, under-keel and zone constraints only.' },
  weather: { name: 'Weather-routed corridor', description: 'A* with forecast sea-state, wind and storm-proximity penalties evaluated at the estimated time of arrival in each cell.' },
  offshore: { name: 'Offshore corridor', description: 'Keeps extra sea room from coasts and shoals (deep-water preference) with moderate weather penalties.' },
  current: { name: 'Current-assisted corridor', description: 'Minimises estimated transit time by rewarding favourable surface currents along the heading.' },
}

export interface CorridorRequest {
  origin: LatLon
  destination: LatLon
  approach: ApproachPlan
  ocean: OceanConfig
  oceanOpts: OceanOptions
  startTimeH: number
  assumedSpeedKn: number
  requiredDepthM: number
  kinds: CorridorKind[]
  /** if re-planning from sea, override departure approach with the current position */
  fromPosition?: LatLon
  idPrefix?: string
}

/** Two pilotage chains closer than this (nm) share a fairway and are spliced instead of searched. */
export const SPLICE_NM = 12

/** Under-keel requirement used by the last-resort search when no corridor exists at the requested depth. */
export const RELAXED_DEPTH_M = 12

export interface Splice {
  /** index on the departure chain (kept up to and including i) */
  i: number
  /** index on the arrival chain (kept from j to the end) */
  j: number
  /** total length of the spliced track (nm) */
  lengthNm: number
}

/**
 * Closest pair of points between the two chains within SPLICE_NM. When several pairs qualify (two
 * ports on the same fairway share every node from the junction outward) the pair giving the
 * shortest spliced track wins, so a Klang to Singapore corridor turns south at Klang's own node
 * instead of running north to the entrance and back. Identical open-sea endpoints splice too.
 */
export function findSplice(departure: LatLon[], arrival: LatLon[]): Splice | null {
  if (!departure.length || !arrival.length) return null
  const depCum: number[] = [0]
  for (let i = 1; i < departure.length; i++) depCum[i] = depCum[i - 1] + haversineNm(departure[i - 1], departure[i])
  const arrTail: number[] = new Array(arrival.length).fill(0)
  for (let j = arrival.length - 2; j >= 0; j--) arrTail[j] = arrTail[j + 1] + haversineNm(arrival[j], arrival[j + 1])
  let best: Splice | null = null
  for (let i = 0; i < departure.length; i++) {
    for (let j = 0; j < arrival.length; j++) {
      const d = haversineNm(departure[i], arrival[j])
      if (d >= SPLICE_NM) continue
      const lengthNm = depCum[i] + d + arrTail[j]
      if (!best || lengthNm < best.lengthNm) best = { i, j, lengthNm }
    }
  }
  return best
}

function dedupeConsecutive(points: LatLon[]): LatLon[] {
  const out: LatLon[] = []
  for (const p of points) {
    const q = out[out.length - 1]
    if (q && haversineNm(p, q) < 0.05) continue
    out.push(p)
  }
  return out
}

function corridorOf(kind: CorridorKind, req: CorridorRequest, waypoints: LatLon[], extraDescription = ''): Corridor {
  const meta = KIND_META[kind]
  return {
    id: `${req.idPrefix ?? 'c'}-${kind}`,
    name: meta.name,
    kind,
    waypoints,
    distanceNm: polylineLengthNm(waypoints),
    description: meta.description + extraDescription,
    generatedAtH: req.startTimeH,
  }
}

/** A vessel re-planning within this distance (nm) of a pilotage-chain leg is still in pilotage waters. */
export const CHAIN_REJOIN_NM = 10

/**
 * Departure chain for a request: the port's chain, or the live position when re-planning from sea.
 * A vessel still inside the pilotage chain (within CHAIN_REJOIN_NM of one of its legs) keeps
 * following the chain to its open-sea endpoint, where the grid search starts; a bare search from
 * inside a strait the 0.25 degree grid cannot resolve would find no path at all.
 */
function departureChain(req: CorridorRequest): LatLon[] {
  const pos = req.fromPosition
  if (!pos) return req.approach.departure
  const chain = req.approach.departure
  let best = { i: -1, d: Infinity }
  for (let i = 1; i < chain.length; i++) {
    const d = nearestOnTrack([chain[i - 1], chain[i]], pos).distNm
    if (d < best.d) best = { i, d }
  }
  if (best.i < 0 || best.d > CHAIN_REJOIN_NM) return [pos]
  return dedupeConsecutive([pos, ...chain.slice(best.i)])
}

export function generateCorridor(kind: CorridorKind, req: CorridorRequest, avoidPoints?: LatLon[]): Corridor | null {
  const dep = departureChain(req)
  const arr = req.approach.arrival
  if (!dep.length || !arr.length) return null

  // 1. Shared fairway (both ports in the same strait) or coincident open-sea endpoints: no search.
  const splice = findSplice(dep, arr)
  if (splice) {
    const waypoints = dedupeConsecutive([...dep.slice(0, splice.i + 1), ...arr.slice(splice.j)])
    if (waypoints.length < 2) waypoints.push(arr[arr.length - 1])
    return corridorOf(kind, req, waypoints, ' Both ends lie on the same fairway: the pilotage chains are spliced at their junction, no open-sea search.')
  }

  // 2. A* between the open-sea endpoints, with fallbacks when the grid offers no path.
  const start = dep[dep.length - 1]
  const goal = arr[0]
  const base: Omit<AStarOptions, 'requiredDepthM' | 'coastBufferCells'> = {
    kind,
    ocean: req.ocean,
    oceanOpts: req.oceanOpts,
    startTimeH: req.startTimeH,
    assumedSpeedKn: req.assumedSpeedKn,
    avoid: avoidPoints ? { points: avoidPoints, radiusNm: 40, weight: 0.25 } : undefined,
  }
  let requiredDepthM = req.requiredDepthM
  let warning = ''
  let res = astar(start, goal, { ...base, requiredDepthM, coastBufferCells: 3 })
  if (!res) res = astar(start, goal, { ...base, requiredDepthM, coastBufferCells: 2 })
  if (!res && requiredDepthM > RELAXED_DEPTH_M) {
    requiredDepthM = RELAXED_DEPTH_M
    res = astar(start, goal, { ...base, requiredDepthM, coastBufferCells: 2 })
    if (res) warning = ` WARNING: no corridor exists on the grid at the required ${req.requiredDepthM.toFixed(1)} m; the under-keel constraint was relaxed to ${RELAXED_DEPTH_M} m for this search. Verify the sailing draught against the shallow zones on the track.`
  }
  if (!res) return null
  const depthForCheck = requiredDepthM
  // straight legs are checked against the grid AND the exact restricted rings the evaluator uses
  const open = simplifySafe(res.path, 0.2, (lat, lon) => {
    const g = getOceanGrid()
    const i = cellIndex(g, lat, lon)
    return (i >= 0 && blocked(g, i, depthForCheck, lat, lon)) || (zoneBits(lat, lon) & 1) !== 0
  })
  const waypoints = dedupeConsecutive([...dep.slice(0, -1), ...open, ...arr.slice(1)])
  return corridorOf(kind, req, waypoints, warning)
}

const FEASIBILITY_OCEAN: OceanConfig = { seed: 0, monsoon: 'SW', windScale: 1, swellM: 1, noiseAmp: 0 }

/**
 * Cheap yes/no for a port pair: true when the chains share a fairway, else whether a single
 * distance-only A* finds a path between the open-sea endpoints at the required depth (no fallbacks,
 * no environment sampling). Used by the voyage generator to reject impossible pairs.
 */
export function routeFeasible(origin: Port, destination: Port, requiredDepthM: number): boolean {
  const ap = approachFor(origin, destination)
  if (!ap.departure.length || !ap.arrival.length) return false
  if (findSplice(ap.departure, ap.arrival)) return true
  const start = ap.departure[ap.departure.length - 1]
  const goal = ap.arrival[0]
  return astar(start, goal, { kind: 'shortest', ocean: FEASIBILITY_OCEAN, oceanOpts: {}, startTimeH: 0, assumedSpeedKn: 12, requiredDepthM, coastBufferCells: 3 }) !== null
}

/** Mean lateral separation (nm) between two corridors, sampled along the first. */
export function corridorSeparationNm(a: Corridor, b: Corridor): number {
  let acc = 0
  let n = 0
  for (let i = 0; i < a.waypoints.length; i += Math.max(1, Math.floor(a.waypoints.length / 12))) {
    const p = a.waypoints[i]
    let dmin = Infinity
    for (const q of b.waypoints) {
      const d = haversineNm(p, q)
      if (d < dmin) dmin = d
    }
    acc += dmin
    n++
  }
  return n ? acc / n : 0
}

export function generateCorridors(req: CorridorRequest): Corridor[] {
  const out: Corridor[] = []
  // A spliced pair has exactly one track whatever the weighting: return it once.
  if (findSplice(departureChain(req), req.approach.arrival)) {
    const c = generateCorridor(req.kinds[0] ?? 'shortest', req)
    return c ? [c] : []
  }
  for (const kind of req.kinds) {
    const c = generateCorridor(kind, req)
    if (!c) continue
    // If practically identical to an existing corridor, try a diversified variant
    const twin = out.find((o) => corridorSeparationNm(c, o) < 12 && Math.abs(o.distanceNm - c.distanceNm) < 15)
    if (twin) {
      const alt = generateCorridor(kind, req, twin.waypoints)
      if (alt && !out.some((o) => corridorSeparationNm(alt, o) < 12)) {
        alt.description += ' Diversified away from the ' + twin.name.toLowerCase() + ' to widen the candidate set.'
        out.push(alt)
        continue
      }
    }
    out.push(c)
  }
  return out
}

/** Great-circle reference distance (for the "baseline" comparison in the UI). */
export function greatCircleNm(a: LatLon, b: LatLon): number {
  return haversineNm(a, b)
}

