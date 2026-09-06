/** Geodesy helpers (spherical Earth, nautical miles). */
import type { LatLon } from './types'

export const EARTH_RADIUS_NM = 3440.065
export const NM_TO_KM = 1.852
export const KN_TO_MS = 0.514444

export const toRad = (d: number) => (d * Math.PI) / 180
export const toDeg = (r: number) => (r * 180) / Math.PI

export function haversineNm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const la1 = toRad(a.lat)
  const la2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function initialBearingDeg(a: LatLon, b: LatLon): number {
  const la1 = toRad(a.lat)
  const la2 = toRad(b.lat)
  const dLon = toRad(b.lon - a.lon)
  const y = Math.sin(dLon) * Math.cos(la2)
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** Great-circle interpolation (slerp) between a and b, f in [0,1] */
export function interpolateGreatCircle(a: LatLon, b: LatLon, f: number): LatLon {
  const la1 = toRad(a.lat)
  const lo1 = toRad(a.lon)
  const la2 = toRad(b.lat)
  const lo2 = toRad(b.lon)
  const d = haversineNm(a, b) / EARTH_RADIUS_NM
  if (d < 1e-9) return { ...a }
  const A = Math.sin((1 - f) * d) / Math.sin(d)
  const B = Math.sin(f * d) / Math.sin(d)
  const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2)
  const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2)
  const z = A * Math.sin(la1) + B * Math.sin(la2)
  return { lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), lon: toDeg(Math.atan2(y, x)) }
}

export function destinationPoint(a: LatLon, bearingDeg: number, distNm: number): LatLon {
  const d = distNm / EARTH_RADIUS_NM
  const br = toRad(bearingDeg)
  const la1 = toRad(a.lat)
  const lo1 = toRad(a.lon)
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br))
  const lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2))
  return { lat: toDeg(la2), lon: ((toDeg(lo2) + 540) % 360) - 180 }
}

export function polylineLengthNm(points: LatLon[]): number {
  let s = 0
  for (let i = 1; i < points.length; i++) s += haversineNm(points[i - 1], points[i])
  return s
}

/** Densify a polyline with great-circle points roughly every `stepNm` */
export function densify(points: LatLon[], stepNm: number): LatLon[] {
  const out: LatLon[] = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const d = haversineNm(a, b)
    const n = Math.max(1, Math.ceil(d / stepNm))
    for (let k = 0; k < n; k++) out.push(interpolateGreatCircle(a, b, k / n))
  }
  out.push(points[points.length - 1])
  return out
}

/** Point at distance `s` nm along a polyline (clamped). Returns position and heading. */
export function pointAlong(points: LatLon[], s: number): { pos: LatLon; headingDeg: number; legIndex: number } {
  if (points.length === 1) return { pos: points[0], headingDeg: 0, legIndex: 0 }
  let acc = 0
  for (let i = 1; i < points.length; i++) {
    const d = haversineNm(points[i - 1], points[i])
    if (acc + d >= s || i === points.length - 1) {
      const f = d > 0 ? Math.min(1, Math.max(0, (s - acc) / d)) : 0
      return {
        pos: interpolateGreatCircle(points[i - 1], points[i], f),
        headingDeg: initialBearingDeg(points[i - 1], points[i]),
        legIndex: i - 1,
      }
    }
    acc += d
  }
  return { pos: points[points.length - 1], headingDeg: 0, legIndex: points.length - 2 }
}

/** Ray-casting point-in-ring. ring: [lon, lat][] */
export function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** polygon: [outerRing, ...holes] with [lon, lat] coordinates */
export function pointInPolygon(lon: number, lat: number, polygon: number[][][]): boolean {
  if (!pointInRing(lon, lat, polygon[0])) return false
  for (let h = 1; h < polygon.length; h++) if (pointInRing(lon, lat, polygon[h])) return false
  return true
}

export function ringBBox(ring: number[][]): [number, number, number, number] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of ring) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return [minX, minY, maxX, maxY]
}

/**
 * Map lat/lon to a three.js sphere position consistent with an equirectangular texture
 * on THREE.SphereGeometry (u=0 at lon −180).
 */
export function latLonToVec3(lat: number, lon: number, r = 1): [number, number, number] {
  const phi = toRad(lon + 180)
  const theta = toRad(90 - lat)
  return [-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta)]
}

/** Relative angle (deg, 0..180) between a heading and a direction the flow/wind comes FROM. */
export function relativeAngleDeg(headingDeg: number, fromDeg: number): number {
  // 0 = coming from dead ahead (head wind/sea), 180 = from astern (following)
  return Math.abs((((headingDeg - fromDeg) % 360) + 540) % 360 - 180)
}

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
