/**
 * Operating-area layers: land mask (Natural Earth 1:50m, public domain, clipped to the
 * region), a coarse SYNTHETIC depth model, and scenario/approximated zones. None of this
 * is chart data: every zone carries a provenance tag shown in the UI.
 */
import region from '../data/geo/ne_50m_land_region.json'
import { pointInPolygon, pointInRing, ringBBox } from './geo'
import type { Zone } from './types'

export const ZONES: Zone[] = [
  {
    id: 'palk',
    name: 'Palk Strait / Adam’s Bridge shallows',
    kind: 'shallow',
    ring: [[78.9, 8.6], [80.4, 8.6], [80.4, 10.4], [78.9, 10.4]],
    depthM: 9,
    provenance: 'derived',
    note: 'Real feature (Palk Strait is too shallow for deep-draught ships) approximated as a box; depth value indicative.',
  },
  {
    id: 'one-fathom-bank',
    name: 'One Fathom Bank shoal area',
    kind: 'shallow',
    ring: [[100.2, 2.4], [101.4, 2.4], [101.4, 3.3], [100.2, 3.3]],
    depthM: 23,
    provenance: 'derived',
    note: 'Malacca Strait deep-water route restriction approximated; TSS design depth indicative.',
  },
  {
    id: 'singapore-strait',
    name: 'Singapore Strait TSS',
    kind: 'tss',
    ring: [[103.3, 1.05], [104.3, 1.05], [104.3, 1.4], [103.3, 1.4]],
    depthM: 22,
    provenance: 'derived',
    note: 'Traffic separation scheme exists (IMO adopted); polygon is a coarse approximation.',
  },
  {
    id: 'malacca-tss',
    name: 'Malacca Strait TSS (approx.)',
    kind: 'tss',
    ring: [[99.4, 4.4], [100.8, 4.4], [103.2, 1.6], [102.6, 1.2], [99.0, 3.9]],
    provenance: 'derived',
    note: 'Approximate footprint of the Malacca Strait traffic separation scheme.',
  },
  {
    id: 'karwar-exercise',
    name: 'Naval exercise area (scenario)',
    kind: 'restricted',
    ring: [[73.05, 13.9], [74.0, 13.9], [74.0, 14.85], [73.05, 14.85]],
    provenance: 'scenario',
    note: 'Hypothetical temporary exclusion area south of Goa used to demonstrate constraint handling.',
  },
  {
    id: 'andaman-nicobar',
    name: 'Andaman & Nicobar restricted waters (approx.)',
    kind: 'restricted',
    ring: [[91.8, 6.75], [94.6, 6.75], [94.6, 14.0], [91.8, 14.0]],
    provenance: 'derived',
    note: 'Foreign-flag traffic near the islands is regulated by India; polygon is a coarse scenario approximation leaving the Great Channel open.',
  },
  {
    id: 'sg-eca',
    name: 'Singapore approaches low-emission overlay (scenario)',
    kind: 'eca',
    ring: [[102.4, 0.7], [104.6, 0.7], [104.6, 2.3], [102.4, 2.3]],
    provenance: 'scenario',
    note: 'Hypothetical emission-control overlay: main engine switches to MGO inside. There is no IMO ECA in this region today.',
  },
  {
    id: 'mormugao-anchorage',
    name: 'Mormugao outer anchorage',
    kind: 'anchorage',
    ring: [[73.62, 15.32], [73.76, 15.32], [73.76, 15.5], [73.62, 15.5]],
    provenance: 'scenario',
    note: 'Indicative anchorage/top-up area.',
  },
  {
    id: 'sg-anchorage',
    name: 'Singapore eastern anchorages',
    kind: 'anchorage',
    ring: [[103.8, 1.2], [104.05, 1.2], [104.05, 1.32], [103.8, 1.32]],
    provenance: 'scenario',
    note: 'Indicative anchorage area.',
  },
]

export const GRID_SPEC = { lat0: -8, lon0: 62, res: 0.25, rows: 128, cols: 184 }

/** Zones generated for the current voyage (scenario inputs); replaced whenever the voyage changes. */
let scenarioZones: Zone[] = []
let zoneVersion = 0
export function setScenarioZones(zones: Zone[]): void {
  scenarioZones = zones.slice()
  zoneVersion++
}
export function getScenarioZones(): Zone[] {
  return scenarioZones
}
/** Every active zone: the fixed geographic layers plus the current voyage's scenario zones. */
export function allZones(): Zone[] {
  return scenarioZones.length ? [...ZONES, ...scenarioZones] : ZONES
}

export interface OceanGrid {
  lat0: number
  lon0: number
  res: number
  rows: number
  cols: number
  land: Uint8Array
  /** distance to nearest land cell, in cells (65535 = far) */
  coastCells: Uint16Array
  /** bit0 restricted, bit1 shallow, bit2 eca, bit3 tss */
  zoneMask: Uint8Array
  /** buildup time in ms (for the progress log) */
  buildMs: number
}

interface RegionPolys {
  polygons: number[][][][]
}

type PolyWithBox = { poly: number[][][]; box: [number, number, number, number] }
let polyCache: PolyWithBox[] | null = null
function landPolys(): PolyWithBox[] {
  if (!polyCache) {
    polyCache = (region as RegionPolys).polygons.map((poly) => ({ poly, box: ringBBox(poly[0]) }))
  }
  return polyCache
}

export function isLand(lat: number, lon: number): boolean {
  for (const { poly, box } of landPolys()) {
    if (lon < box[0] || lon > box[2] || lat < box[1] || lat > box[3]) continue
    if (pointInPolygon(lon, lat, poly)) return true
  }
  return false
}

export function zoneBits(lat: number, lon: number): number {
  let m = 0
  for (const z of allZones()) {
    if (!pointInRing(lon, lat, z.ring)) continue
    if (z.kind === 'restricted') m |= 1
    else if (z.kind === 'shallow') m |= 2
    else if (z.kind === 'eca') m |= 4
    else if (z.kind === 'tss') m |= 8
  }
  return m
}

export function zonesAt(lat: number, lon: number): Zone[] {
  return allZones().filter((z) => pointInRing(lon, lat, z.ring))
}

let gridCache: OceanGrid | null = null
let gridZoneVersion = -1

/**
 * Zone mask for every cell. Shallow, ECA and TSS bits follow the cell centre; the restricted bit is
 * conservative: it is also set when any corner or edge midpoint of the cell (pulled 1% inward so a
 * shared boundary is not a hit) lies inside a restricted ring. The corridor search then keeps a
 * whole cell of clearance, so a straight leg between two free cell centres can never clip a box
 * corner that the evaluator's exact point-in-ring test would flag as a restricted-zone entry.
 */
function fillZoneMask(mask: Uint8Array, lat0: number, lon0: number, res: number, rows: number, cols: number): void {
  const restricted = allZones().filter((z) => z.kind === 'restricted').map((z) => ({ ring: z.ring, box: ringBBox(z.ring) }))
  const h = 0.49 * res
  for (let r = 0; r < rows; r++) {
    const lat = lat0 + (r + 0.5) * res
    for (let c = 0; c < cols; c++) {
      const lon = lon0 + (c + 0.5) * res
      let m = zoneBits(lat, lon)
      if (!(m & 1)) {
        for (const z of restricted) {
          if (lon + h < z.box[0] || lon - h > z.box[2] || lat + h < z.box[1] || lat - h > z.box[3]) continue
          if (
            pointInRing(lon - h, lat - h, z.ring) || pointInRing(lon + h, lat - h, z.ring) || pointInRing(lon + h, lat + h, z.ring) || pointInRing(lon - h, lat + h, z.ring) ||
            pointInRing(lon, lat - h, z.ring) || pointInRing(lon, lat + h, z.ring) || pointInRing(lon - h, lat, z.ring) || pointInRing(lon + h, lat, z.ring)
          ) {
            m |= 1
            break
          }
        }
      }
      mask[r * cols + c] = m
    }
  }
}

export function getOceanGrid(): OceanGrid {
  if (gridCache && gridZoneVersion === zoneVersion) return gridCache
  if (gridCache) {
    // land and coast distances never change; only the zone mask follows the voyage
    const g = gridCache
    fillZoneMask(g.zoneMask, g.lat0, g.lon0, g.res, g.rows, g.cols)
    gridZoneVersion = zoneVersion
    return g
  }
  const t0 = performance.now()
  const { lat0, lon0, res, rows, cols } = GRID_SPEC
  const land = new Uint8Array(rows * cols)
  const zoneMask = new Uint8Array(rows * cols)
  for (let r = 0; r < rows; r++) {
    const lat = lat0 + (r + 0.5) * res
    for (let c = 0; c < cols; c++) land[r * cols + c] = isLand(lat, lon0 + (c + 0.5) * res) ? 1 : 0
  }
  fillZoneMask(zoneMask, lat0, lon0, res, rows, cols)
  // multi-source BFS distance to land (Chebyshev, in cells)
  const coastCells = new Uint16Array(rows * cols).fill(65535)
  const queue: number[] = []
  for (let i = 0; i < land.length; i++) {
    if (land[i]) {
      coastCells[i] = 0
      queue.push(i)
    }
  }
  let head = 0
  while (head < queue.length) {
    const i = queue[head++]
    const r = Math.floor(i / cols)
    const c = i % cols
    const d = coastCells[i] + 1
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue
        const rr = r + dr
        const cc = c + dc
        if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue
        const j = rr * cols + cc
        if (coastCells[j] > d) {
          coastCells[j] = d
          queue.push(j)
        }
      }
    }
  }
  gridCache = { lat0, lon0, res, rows, cols, land, coastCells, zoneMask, buildMs: performance.now() - t0 }
  gridZoneVersion = zoneVersion
  return gridCache
}

export function cellIndex(g: OceanGrid, lat: number, lon: number): number {
  const r = Math.floor((lat - g.lat0) / g.res)
  const c = Math.floor((lon - g.lon0) / g.res)
  if (r < 0 || r >= g.rows || c < 0 || c >= g.cols) return -1
  return r * g.cols + c
}

export function cellCenter(g: OceanGrid, i: number): { lat: number; lon: number } {
  const r = Math.floor(i / g.cols)
  const c = i % g.cols
  return { lat: g.lat0 + (r + 0.5) * g.res, lon: g.lon0 + (c + 0.5) * g.res }
}

/** Nautical miles to the nearest coastline cell (approx.) */
export function coastDistanceNm(lat: number, lon: number): number {
  const g = getOceanGrid()
  const i = cellIndex(g, lat, lon)
  if (i < 0) return 300
  const cells = g.coastCells[i]
  return cells === 65535 ? 300 : cells * 15
}

/**
 * SYNTHETIC depth model (metres): shallow-zone depth if inside one, otherwise a smooth
 * function of distance to the coast. Only the < 30 m regime matters for under-keel checks.
 */
export function depthAt(lat: number, lon: number): number {
  for (const z of allZones()) {
    if (z.depthM !== undefined && pointInRing(lon, lat, z.ring)) return z.depthM
  }
  const d = coastDistanceNm(lat, lon)
  if (d <= 0) return 0
  if (d < 30) return 25 + 2.5 * d
  return Math.min(4500, 100 + (d - 30) * 60)
}
