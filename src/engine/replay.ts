/** Replay/timeline helpers: position, consumption and environment along an evaluated plan. */
import { interpolateGreatCircle } from './geo'
import { sampleEnv, type OceanOptions } from './ocean'
import { LANDMARKS_ALL, nearestOnTrack, regionName, type Landmark } from './regions'
import type { EnvSample, Evaluation, LatLon, OceanConfig, SegmentResult } from './types'
import { zonesAt } from './zones'

export interface ReplayState {
  tH: number
  position: LatLon
  headingDeg: number
  distanceDoneNm: number
  remainingNm: number
  fuelUsedT: number
  co2UsedT: number
  sogKn: number
  stwKn: number
  powerKw: number
  segment: SegmentResult | null
  progress: number
  env: EnvSample
  riskNow: number
  etaH: number
  finished: boolean
}

export interface ActivePlan {
  evaluation: Evaluation
  /** hours at which this plan took over (0 for the initial plan) */
  fromH: number
  /** totals consumed before this plan started */
  carried: { fuelT: number; co2T: number; distanceNm: number }
}

export function stateAt(plan: ActivePlan, tH: number, ocean: OceanConfig, opts: OceanOptions = { truth: true }): ReplayState {
  const segs = plan.evaluation.segments
  const total = segs.reduce((s, x) => s + x.distNm, 0)
  const last = segs[segs.length - 1]
  const etaH = last ? last.tEndH : tH
  let dist = 0
  let fuel = 0
  let co2 = 0
  let seg: SegmentResult | null = null
  let pos: LatLon = segs[0]?.from ?? { lat: 0, lon: 0 }
  let heading = segs[0]?.headingDeg ?? 0
  let finished = false
  if (tH >= etaH && last) {
    finished = true
    dist = total
    fuel = segs.reduce((s, x) => s + x.fuelT, 0)
    co2 = segs.reduce((s, x) => s + x.co2WtwT, 0)
    pos = last.to
    heading = last.headingDeg
    seg = last
  } else {
    for (const s of segs) {
      if (tH >= s.tEndH) {
        dist += s.distNm
        fuel += s.fuelT
        co2 += s.co2WtwT
        continue
      }
      if (tH < s.tStartH) {
        pos = s.from
        heading = s.headingDeg
        seg = s
        break
      }
      const f = (tH - s.tStartH) / Math.max(1e-6, s.tEndH - s.tStartH)
      pos = interpolateGreatCircle(s.from, s.to, f)
      heading = s.headingDeg
      dist += s.distNm * f
      fuel += s.fuelT * f
      co2 += s.co2WtwT * f
      seg = s
      break
    }
  }
  const env = sampleEnv(ocean, pos.lat, pos.lon, tH, opts)
  return {
    tH,
    position: pos,
    headingDeg: heading,
    distanceDoneNm: plan.carried.distanceNm + dist,
    remainingNm: Math.max(0, total - dist),
    fuelUsedT: plan.carried.fuelT + fuel,
    co2UsedT: plan.carried.co2T + co2,
    sogKn: finished ? 0 : seg?.sogKn ?? 0,
    stwKn: finished ? 0 : seg?.stwKn ?? 0,
    powerKw: finished ? 0 : seg?.powerKw ?? 0,
    segment: seg,
    progress: total ? Math.min(1, dist / total) : 1,
    env,
    riskNow: seg?.risk ?? 0,
    etaH,
    finished,
  }
}

/** Track split into travelled / remaining polylines at time tH */
export function splitTrack(plan: ActivePlan, tH: number): { travelled: LatLon[]; remaining: LatLon[] } {
  const travelled: LatLon[] = []
  const remaining: LatLon[] = []
  for (const s of plan.evaluation.segments) {
    if (tH >= s.tEndH) {
      travelled.push(s.from)
      continue
    }
    if (tH <= s.tStartH) {
      if (!remaining.length && travelled.length) remaining.push(travelled[travelled.length - 1] === s.from ? s.from : s.from)
      remaining.push(s.from)
      continue
    }
    const f = (tH - s.tStartH) / Math.max(1e-6, s.tEndH - s.tStartH)
    const p = interpolateGreatCircle(s.from, s.to, f)
    travelled.push(s.from, p)
    remaining.push(p)
  }
  const last = plan.evaluation.segments[plan.evaluation.segments.length - 1]
  if (last) {
    if (tH >= last.tEndH) travelled.push(last.to)
    else remaining.push(last.to)
  }
  return { travelled, remaining }
}

export type { Landmark }

/** Every named feature on the chart (see regions.ts). Kept under this name for compatibility. */
export const LANDMARKS: Landmark[] = LANDMARKS_ALL

export interface TimelineEvent {
  tH: number
  kind: 'departure' | 'waypoint' | 'forecast' | 'replan' | 'zone' | 'arrival' | 'hazard' | 'info'
  label: string
  detail?: string
  position?: LatLon
}

/** Zone kinds that get an entry event from the geometry; ECA entries come from the evaluator's hazard (fuel switch rule). */
const EVENT_ZONE_KINDS = new Set(['tss', 'restricted', 'shallow'])

/**
 * Timeline events derived from an evaluated plan: departure and sea-area changes, landmarks abeam
 * (closest approach of each segment to the feature, any route), zone entries from the active zone
 * set (fixed layers plus the voyage's scenario zones), hazards and arrival.
 */
export function planEvents(plan: ActivePlan, landmarks: Landmark[] = LANDMARKS_ALL): TimelineEvent[] {
  const out: TimelineEvent[] = []
  const segs = plan.evaluation.segments
  if (!segs.length) return out
  const seen = new Set<string>()
  let ecaIn = false
  let stormIn = false
  // the departure event itself is added by the timeline (it owns pilot-away wording); sea-area changes start here
  let region = regionName(segs[0].from)
  let zoneIds = new Set(zonesAt(segs[0].from.lat, segs[0].from.lon).map((z) => z.id))
  for (const s of segs) {
    const durH = Math.max(1e-6, s.tEndH - s.tStartH)
    for (const lm of landmarks) {
      if (seen.has(lm.name)) continue
      const n = nearestOnTrack([s.from, s.to], lm.position)
      if (n.distNm < lm.radiusNm) {
        seen.add(lm.name)
        const f = s.distNm > 0 ? Math.min(1, n.alongNm / s.distNm) : 1
        out.push({ tH: s.tStartH + f * durH, kind: 'waypoint', label: lm.name, detail: `${n.distNm.toFixed(0)} nm off`, position: interpolateGreatCircle(s.from, s.to, f) })
      }
    }
    const here = zonesAt(s.to.lat, s.to.lon)
    for (const z of here) {
      if (zoneIds.has(z.id) || !EVENT_ZONE_KINDS.has(z.kind)) continue
      out.push({ tH: s.tEndH, kind: 'zone', label: `Enter ${z.name}`, detail: z.note, position: s.to })
    }
    zoneIds = new Set(here.map((z) => z.id))
    const r = regionName(s.to)
    if (r !== region) {
      region = r
      out.push({ tH: s.tEndH, kind: 'info', label: `Enter ${r}`, position: s.to })
    }
    const eca = s.hazards.some((h) => h.startsWith('Emission-control'))
    if (eca && !ecaIn) {
      ecaIn = true
      out.push({ tH: s.tStartH, kind: 'zone', label: 'Enter emission-control overlay', detail: 'Main engine switches to MGO (scenario rule)', position: s.from })
    }
    const storm = s.hazards.some((h) => h.startsWith('Storm field'))
    if (storm && !stormIn) {
      stormIn = true
      out.push({ tH: s.tStartH, kind: 'hazard', label: 'Storm wind field reached', detail: s.hazards.find((h) => h.startsWith('Storm field')), position: s.from })
    }
    if (!storm) stormIn = false
    if (s.hsM > 4.5 && !seen.has('heavy')) {
      seen.add('heavy')
      out.push({ tH: s.tStartH, kind: 'hazard', label: `Heavy seas Hs ${s.hsM.toFixed(1)} m`, position: s.from })
    }
  }
  const last = segs[segs.length - 1]
  out.push({ tH: last.tEndH, kind: 'arrival', label: 'Arrival, pilot station', position: last.to })
  out.sort((a, b) => a.tH - b.tH)
  return out
}

/** Re-evaluate a plan's segments as "actual" (truth track + small seeded machinery noise) for prediction-vs-actual analytics. */
export function dailySeries(pred: Evaluation, actual: Evaluation): { day: number; predictedFuelT: number; actualFuelT: number; predictedSogKn: number; actualSogKn: number }[] {
  const days = Math.max(Math.ceil(pred.totals.timeH / 24), Math.ceil(actual.totals.timeH / 24))
  const out: { day: number; predictedFuelT: number; actualFuelT: number; predictedSogKn: number; actualSogKn: number }[] = []
  const t0 = pred.segments[0]?.tStartH ?? 0
  for (let d = 0; d < days; d++) {
    const a = t0 + d * 24
    const b = a + 24
    const acc = (e: Evaluation) => {
      let fuel = 0
      let dist = 0
      let hours = 0
      for (const s of e.segments) {
        const lo = Math.max(a, s.tStartH)
        const hi = Math.min(b, s.tEndH)
        if (hi <= lo) continue
        const f = (hi - lo) / Math.max(1e-6, s.tEndH - s.tStartH)
        fuel += s.fuelT * f
        dist += s.distNm * f
        hours += hi - lo
      }
      return { fuel, sog: hours ? dist / hours : 0 }
    }
    const p = acc(pred)
    const q = acc(actual)
    out.push({ day: d + 1, predictedFuelT: p.fuel, actualFuelT: q.fuel, predictedSogKn: p.sog, actualSogKn: q.sog })
  }
  return out
}
