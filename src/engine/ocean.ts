/**
 * Digital-ocean simulator: environment state as a function of (lat, lon, time).
 * Fields are ANALYTIC + SEEDED NOISE approximations of Indian Ocean monsoon climatology
 * (design inference from published descriptions of the SW/NE monsoon wind reversal, the
 * Southwest/Northeast Monsoon Currents south of Sri Lanka and the West India Coastal
 * Current). They are not Copernicus/ERA5 data; the README explains how those products
 * would replace this module in production.
 */
import { fbm3, noise3 } from './rng'
import { KN_TO_MS, haversineNm, toDeg, toRad } from './geo'
import type { EnvSample, LatLon, OceanConfig, StormForecast, StormTrackPoint } from './types'
import { depthAt } from './zones'

const MS_TO_KN = 1 / KN_TO_MS

function smoothBand(x: number, lo: number, hi: number, soft: number): number {
  // 1 inside [lo,hi], smooth roll-off over `soft`
  const a = 0.5 + 0.5 * Math.tanh((x - lo) / soft)
  const b = 0.5 + 0.5 * Math.tanh((hi - x) / soft)
  return a * b
}

/** Base monsoon wind (m/s, u east, v north). */
export function baseWind(cfg: OceanConfig, lat: number, lon: number, tH: number): [number, number] {
  const n1 = fbm3(lon / 6 + 3, lat / 6, tH / 30, cfg.seed) * cfg.noiseAmp
  const n2 = fbm3(lon / 6 - 9, lat / 6 + 5, tH / 30 + 100, cfg.seed + 1) * cfg.noiseAmp
  let u: number
  let v: number
  if (cfg.monsoon === 'SW') {
    // south-westerlies, strongest over the central Arabian Sea, weaker in the Malacca Strait
    const arabian = smoothBand(lat, 4, 20, 3) * smoothBand(lon, 60, 78, 4)
    const bengal = smoothBand(lat, 2, 18, 3) * smoothBand(lon, 78, 96, 4)
    const strait = smoothBand(lon, 96, 106, 3)
    u = 9.5 * arabian + 7.0 * bengal + 1.5 * strait
    v = 6.5 * arabian + 4.5 * bengal + 0.5 * strait
  } else if (cfg.monsoon === 'NE') {
    const north = smoothBand(lat, 0, 22, 3)
    u = -4.5 * north - 1.0
    v = -3.5 * north - 0.5
  } else {
    u = 2.0 * Math.sin(lon / 15)
    v = 1.0 * Math.cos(lat / 8)
  }
  // equatorial weakening
  const eq = 1 - 0.5 * Math.exp(-((lat / 3) ** 2))
  return [(u * eq + n1 * 2.5) * cfg.windScale, (v * eq + n2 * 2.5) * cfg.windScale]
}

/** Base surface current (knots, u east, v north). */
export function baseCurrent(cfg: OceanConfig, lat: number, lon: number, tH: number): [number, number] {
  const n1 = noise3(lon / 4, lat / 4, tH / 48, cfg.seed + 7) * 0.25
  const n2 = noise3(lon / 4 + 50, lat / 4, tH / 48, cfg.seed + 8) * 0.25
  let u = 0
  let v = 0
  const sign = cfg.monsoon === 'SW' ? 1 : cfg.monsoon === 'NE' ? -1 : 0.2
  // Monsoon current south of Sri Lanka / across the southern Bay of Bengal
  const mc = smoothBand(lat, 2.5, 8.5, 1.2) * smoothBand(lon, 76, 96, 3)
  u += sign * 0.9 * mc
  // West India Coastal Current: equatorward in SW monsoon, poleward in NE monsoon
  const wicc = smoothBand(lon, 71.5, 75.5, 0.8) * smoothBand(lat, 8, 20, 2)
  v += -sign * 0.35 * wicc
  // Weak residual flow through the Malacca Strait
  const strait = smoothBand(lon, 98, 104, 1.5) * smoothBand(lat, 1, 6, 1)
  u += -0.15 * strait
  v += 0.1 * strait
  return [u + n1, v + n2]
}

export function interpolateTrack(track: StormTrackPoint[], tH: number): StormTrackPoint | null {
  if (track.length === 0) return null
  if (tH <= track[0].tH) return track[0]
  if (tH >= track[track.length - 1].tH) return track[track.length - 1]
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1]
    const b = track[i]
    if (tH <= b.tH) {
      const f = (tH - a.tH) / (b.tH - a.tH)
      return {
        tH,
        lat: a.lat + (b.lat - a.lat) * f,
        lon: a.lon + (b.lon - a.lon) * f,
        vmaxKn: a.vmaxKn + (b.vmaxKn - a.vmaxKn) * f,
        rmaxNm: a.rmaxNm + (b.rmaxNm - a.rmaxNm) * f,
      }
    }
  }
  return track[track.length - 1]
}

/** Latest forecast issued at or before planning time */
export function forecastFor(cfg: OceanConfig, planningTimeH: number): StormForecast | null {
  if (!cfg.storm) return null
  let best: StormForecast | null = null
  for (const f of cfg.storm.forecasts) if (f.issuedAtH <= planningTimeH && (!best || f.issuedAtH > best.issuedAtH)) best = f
  return best ?? cfg.storm.forecasts[0] ?? null
}

export interface StormField {
  u: number
  v: number
  windKn: number
  distNm: number
  center: StormTrackPoint
}

/** Modified Rankine vortex wind field (m/s) for a cyclone at time tH. */
export function stormWind(track: StormTrackPoint[], lat: number, lon: number, tH: number): StormField | null {
  const c = interpolateTrack(track, tH)
  if (!c || c.vmaxKn <= 0) return null
  const p: LatLon = { lat, lon }
  const r = haversineNm(p, c)
  const rmax = Math.max(10, c.rmaxNm)
  const vmax = c.vmaxKn * KN_TO_MS
  const vt = r <= rmax ? vmax * (r / rmax) : vmax * Math.pow(rmax / r, 0.6)
  if (vt < 0.5) return { u: 0, v: 0, windKn: 0, distNm: r, center: c }
  // tangential (counter-clockwise, northern hemisphere) + 20° inflow
  const dx = (lon - c.lon) * Math.cos(toRad(lat))
  const dy = lat - c.lat
  const ang = Math.atan2(dy, dx)
  const inflow = toRad(20)
  const dir = ang + Math.PI / 2 + inflow
  return { u: vt * Math.cos(dir), v: vt * Math.sin(dir), windKn: vt * MS_TO_KN, distNm: r, center: c }
}

export interface OceanOptions {
  /** hours since departure at which the plan is made (selects forecast issue) */
  planningTimeH?: number
  /** use ground-truth storm track instead of a forecast */
  truth?: boolean
  /** ensemble perturbation: multiplies wind, shifts storm track */
  perturb?: { windScale: number; trackShiftLat: number; trackShiftLon: number; intensity: number; swellShift: number }
}

/** Sample the environment at (lat, lon, tH). */
export function sampleEnv(cfg: OceanConfig, lat: number, lon: number, tH: number, opts: OceanOptions = {}): EnvSample {
  const per = opts.perturb
  let [u, v] = baseWind(cfg, lat, lon, tH)
  if (per) {
    u *= per.windScale
    v *= per.windScale
  }
  let stormDistNm = Infinity
  let stormWindKn = 0
  if (cfg.storm) {
    let track: StormTrackPoint[] = opts.truth ? cfg.storm.actual : (forecastFor(cfg, opts.planningTimeH ?? 0)?.track ?? cfg.storm.actual)
    if (per && (per.trackShiftLat || per.trackShiftLon || per.intensity !== 1)) {
      track = track.map((p) => ({ ...p, lat: p.lat + per.trackShiftLat, lon: p.lon + per.trackShiftLon, vmaxKn: p.vmaxKn * per.intensity }))
    }
    const s = stormWind(track, lat, lon, tH)
    if (s) {
      u += s.u
      v += s.v
      stormDistNm = s.distNm
      stormWindKn = s.windKn
    }
  }
  const windMs = Math.hypot(u, v)
  const windKn = windMs * MS_TO_KN
  const windFromDeg = (toDeg(Math.atan2(u, v)) + 180 + 360) % 360

  const [cu, cv] = baseCurrent(cfg, lat, lon, tH)
  const curKn = Math.hypot(cu, cv)

  // waves: swell + wind sea (fully developed approximation Hs ≈ 0.0248·U10²), storm seas capped
  const swellBase = cfg.swellM * (0.6 + 0.4 * smoothBand(lon, 60, 92, 5)) * (1 - 0.7 * smoothBand(lon, 97, 106, 2))
  const swell = Math.max(0.3, swellBase + (per?.swellShift ?? 0) + noise3(lon / 5, lat / 5, tH / 24, cfg.seed + 21) * 0.4)
  const windSea = Math.min(11, 0.0248 * windMs ** 2)
  const hsM = Math.sqrt(swell ** 2 + windSea ** 2)
  const wavePeriodS = 6 + 0.9 * hsM
  // wave direction follows wind for wind sea, swell from SW in SW monsoon
  const swellFrom = cfg.monsoon === 'SW' ? 225 : cfg.monsoon === 'NE' ? 45 : 200
  const wWind = windSea ** 2 / (hsM ** 2 + 1e-9)
  const waveFromDeg = (windFromDeg * wWind + swellFrom * (1 - wWind) + 360) % 360

  return {
    windU: u,
    windV: v,
    windKn,
    windFromDeg,
    curU: cu,
    curV: cv,
    curKn,
    hsM,
    wavePeriodS,
    waveFromDeg,
    depthM: depthAt(lat, lon),
    stormDistNm,
    stormWindKn,
  }
}

/** Along-track current component (kn, positive = assisting) */
export function currentAlongTrack(env: EnvSample, headingDeg: number): number {
  const h = toRad(headingDeg)
  return env.curU * Math.sin(h) + env.curV * Math.cos(h)
}

export function stormCenterAt(cfg: OceanConfig, tH: number, opts: OceanOptions = {}): StormTrackPoint | null {
  if (!cfg.storm) return null
  const track = opts.truth ? cfg.storm.actual : (forecastFor(cfg, opts.planningTimeH ?? 0)?.track ?? cfg.storm.actual)
  return interpolateTrack(track, tH)
}
