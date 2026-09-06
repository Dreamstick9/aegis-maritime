/** Natural Earth 1:50m land polygons (public domain) projected once into chart path data. */
import region50 from '../../data/geo/ne_50m_land_region.json'
import { CHART, px, py } from './projection'

interface PolySet {
  polygons: number[][][][]
  bbox?: { minLon: number; minLat: number; maxLon: number; maxLat: number }
}

interface LandData {
  fill: string
  coast: string
  /** closed rings whose bounding-box diagonal is at least SMALL_RING_DIAG chart units (mainland, big islands) */
  fillLarge: string
  /** closed rings below that size (atolls, islets): they get a narrow halo instead of the wide shelf band */
  fillSmall: string
}

/** Rings with a bbox diagonal below this (chart units, about 10 per degree) are treated as islets. */
export const SMALL_RING_DIAG = 2.5

let cached: LandData | null = null

function build(): LandData {
  const r = region50 as PolySet
  const bb = r.bbox ?? { minLon: 55, minLat: -20, maxLon: 125, maxLat: 35 }
  const onEdge = (p: number[]) => Math.abs(p[0] - bb.minLon) < 1e-6 || Math.abs(p[0] - bb.maxLon) < 1e-6 || Math.abs(p[1] - bb.minLat) < 1e-6 || Math.abs(p[1] - bb.maxLat) < 1e-6
  const inView = (p: number[]) => p[0] >= CHART.lon0 - 6 && p[0] <= CHART.lon1 + 6 && p[1] >= CHART.lat0 - 6 && p[1] <= CHART.lat1 + 6
  let fill = ''
  let coast = ''
  let fillLarge = ''
  let fillSmall = ''
  for (const poly of r.polygons) {
    for (const ring of poly) {
      if (!ring.some(inView)) continue
      let ringFill = ''
      let pen = false
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i]
        const xf = px(p[0])
        const yf = py(p[1])
        if (xf < minX) minX = xf
        if (xf > maxX) maxX = xf
        if (yf < minY) minY = yf
        if (yf > maxY) maxY = yf
        const x = xf.toFixed(1)
        const y = yf.toFixed(1)
        ringFill += `${i === 0 ? 'M' : 'L'}${x} ${y}`
        const prev = ring[(i - 1 + ring.length) % ring.length]
        const edgeRun = onEdge(p) && onEdge(prev) && (Math.abs(p[0] - prev[0]) < 1e-6 || Math.abs(p[1] - prev[1]) < 1e-6)
        if (!pen || edgeRun) {
          coast += `M${x} ${y}`
          pen = true
        } else coast += `L${x} ${y}`
      }
      ringFill += 'Z'
      fill += ringFill
      if (Math.hypot(maxX - minX, maxY - minY) < SMALL_RING_DIAG) fillSmall += ringFill
      else fillLarge += ringFill
    }
  }
  return { fill, coast, fillLarge, fillSmall }
}

/**
 * Two paths: `fill` closes every ring (land mass), `coast` omits the segments that run along the
 * clip bounding box so no artificial straight coastline appears at the data edge.
 */
export function landPaths(): { fill: string; coast: string } {
  if (!cached) cached = build()
  return cached
}

/**
 * The land fill split by ring size, so the shelf tint can be stroked per ring: wide bands around
 * the mainland and big islands, only a small halo around atolls and islets (a fixed-width band
 * around a point-sized island would read as a blob).
 */
export function landShelfPaths(): { large: string; small: string } {
  if (!cached) cached = build()
  return { large: cached.fillLarge, small: cached.fillSmall }
}
