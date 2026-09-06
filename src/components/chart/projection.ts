/**
 * Planar chart projection for the Command plate: Web-Mercator-shaped y, linear x, over the
 * corridor region (Arabian Sea to Singapore Strait). Units are "chart units" (roughly 10 per
 * degree of longitude) so stroke widths stay legible at every viewport.
 */
import type { LatLon } from '../../engine/types'

export const CHART = {
  lon0: 63,
  lon1: 108,
  lat0: -7.5,
  lat1: 23.5,
  scale: 10,
}

const mercY = (latDeg: number) => Math.log(Math.tan(Math.PI / 4 + (latDeg * Math.PI) / 360))
const Y1 = mercY(CHART.lat1)
const Y0 = mercY(CHART.lat0)
/** degrees-of-longitude equivalent of one mercator unit at the region's mid-latitude */
const K = (180 / Math.PI) * CHART.scale

export function px(lon: number): number {
  return (lon - CHART.lon0) * CHART.scale
}
export function py(lat: number): number {
  return (Y1 - mercY(lat)) * K
}
export function pt(p: LatLon): [number, number] {
  return [px(p.lon), py(p.lat)]
}

export const VIEW = {
  w: px(CHART.lon1),
  h: (Y1 - Y0) * K,
}

/** SVG path for a polyline of lat/lon points. */
export function pathOf(points: LatLon[]): string {
  if (points.length === 0) return ''
  let d = ''
  for (let i = 0; i < points.length; i++) {
    const [x, y] = pt(points[i])
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
  }
  return d
}

/** SVG path for a closed ring given as [lon, lat] tuples. */
export function ringPath(ring: number[][]): string {
  let d = ''
  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i]
    d += `${i === 0 ? 'M' : 'L'}${px(lon).toFixed(2)} ${py(lat).toFixed(2)}`
  }
  return d + 'Z'
}

/** Approximate chart-unit radius for a distance in nautical miles at a latitude. */
export function nmRadius(nm: number, lat: number): number {
  const degLon = nm / 60 / Math.max(0.35, Math.cos((lat * Math.PI) / 180))
  return degLon * CHART.scale
}

/** Inverse of `pt`: chart units back to lat/lon. */
export function unproject(x: number, y: number): LatLon {
  const m = Y1 - y / K
  const lat = ((2 * Math.atan(Math.exp(m)) - Math.PI / 2) * 180) / Math.PI
  return { lat, lon: x / CHART.scale + CHART.lon0 }
}
