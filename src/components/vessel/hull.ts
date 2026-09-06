/**
 * Procedural bulk-carrier geometry. No external model is used: hull sections are lofted
 * from parametric station curves (flat bottom, bilge radius, parallel midbody, raked stem
 * with bulb, cut-away stern with a raised keel, skeg and transom). All dimensions come from
 * the vessel record (metres); x runs stern (−L/2) to bow (+L/2), y up from the keel, z to
 * starboard.
 */
import * as THREE from 'three'
import type { Vessel } from '../../engine/types'

export interface HullParams {
  L: number
  B: number
  D: number
  T: number
}

/** half-breadth factor along normalised length t (0 stern → 1 bow) at height fraction s (0 keel, 1 deck) */
function halfBreadthFactor(t: number, s: number): number {
  let f: number
  if (t >= 0.24 && t <= 0.8) f = 1
  else if (t > 0.8) {
    const u = (t - 0.8) / 0.2
    f = Math.pow(Math.max(0, 1 - Math.pow(u, 1.7)), 0.62)
    f *= 1 - 0.35 * (1 - s) * u // finer entrance low down
  } else {
    const u = (0.24 - t) / 0.24
    f = Math.pow(Math.max(0, 1 - Math.pow(u, 2.4)), 0.55)
    const transom = 0.32 + 0.4 * s // transom keeps width high up
    f = Math.max(f, transom * (1 - u * 0.15))
    f *= 1 - 0.62 * Math.pow(1 - s, 1.3) * u // run narrows to the skeg
  }
  return f
}

/** keel height (fraction of D): rises toward the stern for the propeller aperture */
function keelRise(t: number): number {
  if (t < 0.16) {
    const u = (0.16 - t) / 0.16
    return 0.55 * Math.pow(u, 1.6)
  }
  if (t > 0.985) return 0.25 * ((t - 0.985) / 0.015)
  return 0
}

/** deck sheer: a gentle rise toward the stem and a smaller one at the stern */
export function sheer(p: HullParams, t: number): number {
  const bow = Math.max(0, (t - 0.72) / 0.28)
  const stern = Math.max(0, (0.12 - t) / 0.12)
  return 0.007 * p.L * bow * bow + 0.002 * p.L * stern * stern
}

export function deckY(p: HullParams, t: number): number {
  return p.D + sheer(p, t)
}

/** fore-and-aft shift of a station point: raked stem (lower points move aft) and sloped transom */
function rake(p: HullParams, t: number, s: number): number {
  const kb = Math.max(0, (t - 0.86) / 0.14)
  const ks = Math.max(0, (0.1 - t) / 0.1)
  return -0.024 * p.L * kb * kb * (1 - s) + 0.016 * p.L * ks * ks * (1 - s)
}

/** a point on the hull surface: [x, y, half-breadth] at station t and height fraction s */
export function hullPoint(p: HullParams, t: number, s: number): [number, number, number] {
  const { L, B, D } = p
  const R = 0.17 * B
  const z0 = keelRise(t) * D
  const top = deckY(p, t)
  const y = z0 + s * (top - z0)
  let hb = (B / 2) * halfBreadthFactor(t, s)
  const hLocal = y - z0
  if (hLocal < R) {
    const flat = Math.max(0, hb - R)
    hb = flat + Math.sqrt(Math.max(0, R * R - (R - hLocal) * (R - hLocal)))
  }
  if (t > 0.86) {
    const k = (t - 0.86) / 0.14
    hb = hb * (1 - k) + hb * Math.pow(s, 0.9) * k
  }
  if (t >= 0.999) hb = 0
  const x = -L / 2 + t * L + rake(p, t, s)
  return [x, y, hb]
}

/** closed outline of the hull section at a given height above the keel, as [x, z] pairs (starboard then port) */
export function waterlineOutline(p: HullParams, level: number, stations = 140): [number, number][] {
  const stbd: [number, number][] = []
  const port: [number, number][] = []
  for (let i = 0; i <= stations; i++) {
    const t = i / stations
    const z0 = keelRise(t) * p.D
    const top = deckY(p, t)
    const s = Math.min(1, Math.max(0, (level - z0) / (top - z0)))
    if (level < z0) continue
    const [x, , hb] = hullPoint(p, t, s)
    stbd.push([x, hb])
    port.push([x, -hb])
  }
  return [...stbd, ...port.reverse()]
}

export function buildHullGeometry(p: HullParams, stations = 110, samples = 20): THREE.BufferGeometry {
  const verts: number[] = []
  const idx: number[] = []
  const ring: number[][] = []
  const deckEdge: [number, number, number][] = []
  for (let i = 0; i <= stations; i++) {
    const t = i / stations
    const indices: number[] = []
    for (let j = 0; j <= samples; j++) {
      const s = 1 - j / samples
      const [x, y, hb] = hullPoint(p, t, s)
      if (j === 0) deckEdge.push([x, y, hb])
      indices.push(verts.length / 3)
      verts.push(x, y, -hb)
    }
    for (let j = samples - 1; j >= 0; j--) {
      const src = indices[j]
      indices.push(verts.length / 3)
      verts.push(verts[src * 3], verts[src * 3 + 1], -verts[src * 3 + 2])
    }
    ring.push(indices)
  }
  const per = ring[0].length
  for (let i = 0; i < stations; i++) {
    for (let j = 0; j < per - 1; j++) {
      const a = ring[i][j]
      const b = ring[i][j + 1]
      const c = ring[i + 1][j]
      const d = ring[i + 1][j + 1]
      idx.push(a, c, b, b, c, d)
    }
  }
  // deck plate with a small camber
  const deckStart = verts.length / 3
  const camber = 0.012 * p.B
  for (let i = 0; i <= stations; i++) {
    const [x, y, hb] = deckEdge[i]
    verts.push(x, y, -hb)
    verts.push(x, y + camber, 0)
    verts.push(x, y, hb)
  }
  for (let i = 0; i < stations; i++) {
    const a = deckStart + i * 3
    idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3)
    idx.push(a + 1, a + 2, a + 4, a + 2, a + 5, a + 4)
  }
  // transom cap (stern station fan)
  const stern = ring[0]
  const cx = verts.length / 3
  const [sx, sy] = hullPoint(p, 0, 0.5)
  verts.push(sx, sy, 0)
  for (let j = 0; j < stern.length - 1; j++) idx.push(cx, stern[j + 1], stern[j])
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

export type BoxShape = 'box' | 'hold' | 'topside' | 'hopper'

export interface Box {
  id: string
  region: string
  label: string
  position: [number, number, number]
  size: [number, number, number]
  shape?: BoxShape
}

export interface VesselLayout {
  params: HullParams
  holds: Box[]
  regions: Box[]
  hatches: Box[]
  accommodation: Box
  bridge: Box
  funnel: { position: [number, number, number]; radius: number; height: number }
  forecastle: Box
  propeller: { position: [number, number, number]; diameter: number }
  rudder: Box
  bulb: { position: [number, number, number]; radius: [number, number, number] }
  masts: { position: [number, number, number]; height: number }[]
  /** raised hatch coaming height above the deck */
  coamingH: number
  /** cross-section of a cargo hold in the (z, y) plane, starboard half mirrored */
  holdSection: [number, number][]
  topsideSection: [number, number][]
  hopperSection: [number, number][]
  lifeboat: { position: [number, number, number]; length: number; angle: number }
  bollards: [number, number, number][]
  vents: [number, number, number][]
  anchors: { position: [number, number, number]; side: 1 | -1 }[]
  crane: { position: [number, number, number]; height: number; reach: number }
  flagstaff: [number, number, number]
}

/** (z, y) polygon of the bulk-carrier hold section: double bottom, hopper, side shell, topside tank */
function holdSectionFor(B: number, D: number): [number, number][] {
  const db = 0.09 * D
  const hopH = 0.2 * D
  const hopW = 0.19 * B
  const side = 0.5 * B - 0.035 * B
  const tsBottom = D - 0.2 * D
  const tsInner = 0.27 * B
  const top = D - 0.03 * D
  const half: [number, number][] = [
    [0, db],
    [side - hopW, db],
    [side, db + hopH],
    [side, tsBottom],
    [tsInner, top],
    [0, top],
  ]
  const mirrored = half
    .slice(1, -1)
    .reverse()
    .map(([z, y]) => [-z, y] as [number, number])
  return [...half, ...mirrored]
}

export function layoutFor(v: Vessel): VesselLayout {
  const L = v.loaM
  const B = v.beamM
  const D = v.depthM
  const T = v.designDraftM
  const p: HullParams = { L, B, D, T }
  const x = (t: number) => -L / 2 + t * L
  const holdStart = 0.2
  const holdEnd = 0.905
  const n = v.holds
  const holdLen = ((holdEnd - holdStart) * L) / n
  const holds: Box[] = []
  const hatches: Box[] = []
  const coamingH = 1.35
  const vents: [number, number, number][] = []
  for (let i = 0; i < n; i++) {
    const t0 = holdStart + ((holdEnd - holdStart) * i) / n
    const cx = x(t0) + holdLen / 2
    const tc = (cx + L / 2) / L
    const dy = deckY(p, tc)
    holds.push({ id: `hold-${i + 1}`, region: 'cargo', label: `No. ${i + 1} hold`, position: [cx, D * 0.52, 0], size: [holdLen * 0.92, D * 0.84, B * 0.82], shape: 'hold' })
    hatches.push({ id: `hatch-${i + 1}`, region: 'cargo', label: `No. ${i + 1} hatch`, position: [cx, dy + coamingH / 2, 0], size: [holdLen * 0.62, coamingH, B * 0.5] })
    // a pair of mushroom ventilators at the aft corners of each hatch
    vents.push([cx - holdLen * 0.36, dy, B * 0.3], [cx - holdLen * 0.36, dy, -B * 0.3])
  }
  const accLen = 0.085 * L
  const accX = x(0.055) + accLen / 2
  const accH = 15
  const accW = B * 0.62
  const accommodation: Box = { id: 'accommodation', region: 'bridge', label: 'Accommodation block', position: [accX, D + accH / 2, 0], size: [accLen, accH, accW] }
  const bridge: Box = { id: 'bridge', region: 'bridge', label: 'Navigation bridge', position: [accX + accLen * 0.1, D + accH + 1.8, 0], size: [accLen * 0.7, 3.4, B * 0.98] }
  const side = 0.5 * B - 0.035 * B
  const regions: Box[] = [
    { id: 'engine', region: 'engine', label: 'Engine room', position: [x(0.03) + (0.13 * L) / 2, D * 0.5, 0], size: [0.13 * L, D * 0.78, B * 0.72] },
    { id: 'fuel-deep', region: 'fuel', label: 'Deep fuel tanks', position: [x(0.165) + (0.035 * L) / 2, D * 0.5, 0], size: [0.035 * L, D * 0.8, B * 0.8] },
    { id: 'fuel-db', region: 'fuel', label: 'Double-bottom bunker tanks (aft)', position: [x(0.2) + (0.12 * L) / 2, D * 0.05, 0], size: [0.12 * L, D * 0.08, B * 0.72] },
    { id: 'ballast-p', region: 'ballast', label: 'Topside ballast tanks (port)', position: [x(holdStart) + ((holdEnd - holdStart) * L) / 2, D * 0.9, -(side + 0.27 * B) / 2], size: [(holdEnd - holdStart) * L, D * 0.18, side - 0.27 * B], shape: 'topside' },
    { id: 'ballast-s', region: 'ballast', label: 'Topside ballast tanks (starboard)', position: [x(holdStart) + ((holdEnd - holdStart) * L) / 2, D * 0.9, (side + 0.27 * B) / 2], size: [(holdEnd - holdStart) * L, D * 0.18, side - 0.27 * B], shape: 'topside' },
    { id: 'hopper-p', region: 'ballast', label: 'Hopper ballast tanks (port)', position: [x(holdStart) + ((holdEnd - holdStart) * L) / 2, D * 0.19, -(side - 0.095 * B)], size: [(holdEnd - holdStart) * L, D * 0.2, 0.19 * B], shape: 'hopper' },
    { id: 'hopper-s', region: 'ballast', label: 'Hopper ballast tanks (starboard)', position: [x(holdStart) + ((holdEnd - holdStart) * L) / 2, D * 0.19, side - 0.095 * B], size: [(holdEnd - holdStart) * L, D * 0.2, 0.19 * B], shape: 'hopper' },
    { id: 'ballast-db', region: 'ballast', label: 'Double-bottom ballast (cargo length)', position: [x(0.32) + ((holdEnd - 0.32) * L) / 2, D * 0.05, 0], size: [(holdEnd - 0.32) * L, D * 0.08, B * 0.72] },
    { id: 'bow', region: 'bow', label: 'Forecastle & bow', position: [x(0.955), D * 0.7, 0], size: [0.07 * L, D * 0.5, B * 0.45] },
  ]
  const fcY = deckY(p, 0.955)
  const bollards: [number, number, number][] = []
  for (const [t, zf] of [
    [0.93, 0.36],
    [0.965, 0.26],
    [0.02, 0.24],
    [0.05, 0.3],
    [0.35, 0.47],
    [0.66, 0.47],
  ] as [number, number][]) {
    const dy = deckY(p, t) + (t > 0.92 ? 3.2 : 0)
    bollards.push([x(t), dy, B * zf], [x(t), dy, -B * zf])
  }
  const anchorT = 0.945
  const [ax, ay, ahb] = hullPoint(p, anchorT, 0.86)
  return {
    params: p,
    holds,
    regions,
    hatches,
    accommodation,
    bridge,
    funnel: { position: [accX - accLen * 0.3, D + accH, 0], radius: 2.4, height: 10 },
    forecastle: { id: 'forecastle', region: 'bow', label: 'Forecastle deck', position: [x(0.955), fcY + 1.6, 0], size: [0.07 * L, 3.2, B * 0.5] },
    propeller: { position: [x(0.028), D * 0.22, 0], diameter: Math.min(0.42 * T, 10.2) },
    rudder: { id: 'rudder', region: 'propulsion', label: 'Semi-spade rudder', position: [x(0.012), D * 0.23, 0], size: [0.02 * L, D * 0.38, 0.7] },
    bulb: { position: [L / 2 - 0.012 * L - 0.046 * L, T * 0.34, 0], radius: [0.046 * L, T * 0.22, B * 0.105] },
    masts: [
      { position: [x(0.975), fcY + 3.2, 0], height: 15 },
      { position: [accX + accLen * 0.22, D + accH + 3.5, 0], height: 10 },
    ],
    coamingH,
    holdSection: holdSectionFor(B, D),
    topsideSection: [
      [side, D - 0.2 * D],
      [side, D - 0.02 * D],
      [0.27 * B, D - 0.02 * D],
    ],
    hopperSection: [
      [side - 0.19 * B, 0.09 * D],
      [side, 0.09 * D],
      [side, 0.09 * D + 0.2 * D],
    ],
    lifeboat: { position: [accX - accLen * 0.5 - 2, D + 7.5, 0], length: 9.5, angle: 0.55 },
    bollards,
    vents,
    anchors: [
      { position: [ax, ay, ahb], side: 1 },
      { position: [ax, ay, -ahb], side: -1 },
    ],
    crane: { position: [accX + accLen * 0.5 + 6, D, B * 0.22], height: 7, reach: 9 },
    flagstaff: [x(0.004), deckY(p, 0.004), 0],
  }
}
