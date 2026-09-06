/**
 * Where-am-I helpers for any route on the chart: named sea areas (coarse polygons over the whole
 * operating region, first match wins) and a catalogue of navigational landmarks (capes, channels,
 * banks, islands, lights) with approximate positions. Positions are from general knowledge and are
 * rounded; they name places for captions and replay events and are NOT chart data.
 */
import { haversineNm, pointInRing, toRad } from './geo'
import type { LatLon } from './types'

export interface Landmark {
  name: string
  position: LatLon
  radiusNm: number
}

interface SeaArea {
  name: string
  /** [lon, lat][] ring; may overlap land (land is never queried) */
  ring: number[][]
}

/**
 * Sea areas in precedence order (specific straits and gulfs before the open seas). Limits follow the
 * IHO "Limits of Oceans and Seas" in spirit: Dondra Head to Pulau Weh closes the Bay of Bengal,
 * Dondra Head to Addu Atoll closes the Laccadive Sea, Pedropunt to Phuket opens the Malacca Strait.
 */
const SEA_AREAS: SeaArea[] = [
  { name: 'Gulf of Kutch', ring: [[68.9, 22.2], [70.6, 22.2], [70.6, 23.3], [68.9, 23.3]] },
  { name: 'Singapore Strait', ring: [[103.3, 0.95], [104.6, 0.95], [104.6, 1.5], [103.3, 1.5]] },
  { name: 'Malacca Strait', ring: [[95.4, 5.65], [98.3, 7.75], [101.5, 5.0], [103.4, 1.5], [103.4, 0.9], [102.6, 0.8], [100.5, 2.0], [98.0, 3.6], [95.4, 5.2]] },
  { name: 'Gulf of Martaban', ring: [[94.3, 15.0], [98.2, 15.0], [98.2, 17.5], [94.3, 17.5]] },
  { name: 'Andaman Sea', ring: [[93.9, 5.65], [99.0, 5.65], [99.0, 16.2], [94.2, 16.2], [92.7, 14.2], [92.5, 10.0]] },
  { name: 'Palk Bay', ring: [[78.95, 9.1], [80.3, 9.1], [80.3, 10.45], [78.95, 10.45]] },
  { name: 'Gulf of Mannar', ring: [[77.4, 7.6], [79.9, 7.6], [79.9, 9.1], [78.95, 9.1], [78.6, 9.4], [77.4, 9.4]] },
  { name: 'Bay of Bengal', ring: [[80.6, 5.9], [95.3, 5.65], [95.3, 16.2], [94.3, 16.2], [94.3, 23.5], [79.9, 23.5], [79.9, 9.1], [80.6, 9.1]] },
  { name: 'Laccadive Sea', ring: [[72.1, 14.8], [77.4, 14.8], [77.4, 7.6], [79.9, 7.6], [80.6, 5.9], [73.2, -0.7], [72.3, -0.7], [72.1, 5.0]] },
  { name: 'Arabian Sea', ring: [[61.5, 4.0], [77.5, 4.0], [77.5, 24.5], [61.5, 24.5]] },
  { name: 'South China Sea approaches', ring: [[104.3, 0.9], [108.5, 0.9], [108.5, 24.5], [104.3, 24.5]] },
  { name: 'Java Sea approaches', ring: [[102.5, -8.5], [108.5, -8.5], [108.5, 0.95], [102.5, 0.95]] },
]

/** Name of the sea area containing a point; 'Indian Ocean' when no named area matches. */
export function regionName(p: LatLon): string {
  for (const a of SEA_AREAS) if (pointInRing(p.lon, p.lat, a.ring)) return a.name
  return 'Indian Ocean'
}

/** Names of the sea areas visited by a track, in order, without consecutive repeats. */
export function regionsAlong(track: LatLon[]): string[] {
  const out: string[] = []
  for (const p of track) {
    const r = regionName(p)
    if (out[out.length - 1] !== r) out.push(r)
  }
  return out
}

/**
 * Named features across the region. Radii are the distance within which a passing vessel is
 * "abeam" of the feature for captions and events (channels use the channel half-width plus margin).
 */
export const LANDMARKS_ALL: Landmark[] = [
  { name: 'Dwarka light (Gulf of Kutch entrance)', position: { lat: 22.24, lon: 68.95 }, radiusNm: 30 },
  { name: 'Bombay High field', position: { lat: 19.4, lon: 71.3 }, radiusNm: 45 },
  { name: 'Sacrifice Rock', position: { lat: 11.48, lon: 75.53 }, radiusNm: 25 },
  { name: 'Kalpeni', position: { lat: 10.08, lon: 73.65 }, radiusNm: 35 },
  { name: 'Minicoy', position: { lat: 8.28, lon: 73.05 }, radiusNm: 40 },
  { name: 'Cape Comorin', position: { lat: 8.08, lon: 77.55 }, radiusNm: 40 },
  { name: 'Mannar', position: { lat: 8.98, lon: 79.9 }, radiusNm: 30 },
  { name: 'Kalpitiya', position: { lat: 8.23, lon: 79.76 }, radiusNm: 30 },
  { name: 'Dondra Head', position: { lat: 5.92, lon: 80.59 }, radiusNm: 45 },
  { name: 'Point Calimere', position: { lat: 10.29, lon: 79.87 }, radiusNm: 30 },
  { name: 'Pulicat', position: { lat: 13.42, lon: 80.32 }, radiusNm: 30 },
  { name: 'Godavari Point', position: { lat: 16.95, lon: 82.3 }, radiusNm: 35 },
  { name: 'Puri', position: { lat: 19.8, lon: 85.85 }, radiusNm: 35 },
  { name: 'Sandheads', position: { lat: 20.9, lon: 88.2 }, radiusNm: 45 },
  { name: 'Coco Channel', position: { lat: 14.1, lon: 93.4 }, radiusNm: 40 },
  { name: 'Preparis Channel', position: { lat: 15.1, lon: 94.0 }, radiusNm: 40 },
  { name: 'Little Andaman', position: { lat: 10.75, lon: 92.5 }, radiusNm: 45 },
  { name: 'Ten Degree Channel', position: { lat: 10.0, lon: 92.6 }, radiusNm: 50 },
  { name: 'Sombrero Channel', position: { lat: 7.65, lon: 93.6 }, radiusNm: 40 },
  { name: 'Great Channel', position: { lat: 6.2, lon: 94.6 }, radiusNm: 60 },
  { name: 'Pulau Weh', position: { lat: 5.85, lon: 95.3 }, radiusNm: 40 },
  { name: 'Diamond Point', position: { lat: 5.25, lon: 97.5 }, radiusNm: 35 },
  { name: 'Pulau Pinang', position: { lat: 5.4, lon: 100.27 }, radiusNm: 25 },
  { name: 'One Fathom Bank', position: { lat: 2.87, lon: 100.98 }, radiusNm: 25 },
  { name: 'Raffles Light', position: { lat: 1.16, lon: 103.74 }, radiusNm: 12 },
  { name: 'Horsburgh Light', position: { lat: 1.33, lon: 104.41 }, radiusNm: 20 },
]

/**
 * Closest approach of a polyline to a point: distance (nm) and the along-track distance (nm) of the
 * closest point. Local equirectangular projection around the point (adequate for the region).
 */
export function nearestOnTrack(track: LatLon[], p: LatLon): { distNm: number; alongNm: number } {
  if (!track.length) return { distNm: Infinity, alongNm: 0 }
  const k = Math.cos(toRad(p.lat)) * 60
  const X = (q: LatLon) => (q.lon - p.lon) * k
  const Y = (q: LatLon) => (q.lat - p.lat) * 60
  let best = { distNm: Math.hypot(X(track[0]), Y(track[0])), alongNm: 0 }
  let acc = 0
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1]
    const b = track[i]
    const ax = X(a)
    const ay = Y(a)
    const bx = X(b)
    const by = Y(b)
    const dx = bx - ax
    const dy = by - ay
    const l2 = dx * dx + dy * dy
    const t = l2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / l2)) : 0
    const d = Math.hypot(ax + t * dx, ay + t * dy)
    const segNm = haversineNm(a, b)
    if (d < best.distNm) best = { distNm: d, alongNm: acc + t * segNm }
    acc += segNm
  }
  return best
}

/** Landmarks whose position lies within `marginNm` of the track, ordered by along-track distance. */
export function landmarksAlong(track: LatLon[], marginNm: number, landmarks: Landmark[] = LANDMARKS_ALL): Landmark[] {
  const hits: { lm: Landmark; along: number }[] = []
  for (const lm of landmarks) {
    const n = nearestOnTrack(track, lm.position)
    if (n.distNm <= marginNm) hits.push({ lm, along: n.alongNm })
  }
  hits.sort((a, b) => a.along - b.along)
  return hits.map((h) => h.lm)
}
