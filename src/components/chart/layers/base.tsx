/**
 * Base chart layers: water and shelf tint, land and coast, graticule, operating zones.
 *
 * Everything here is geography in chart units. Geometry is projected once and memoised (zones
 * again whenever the voyage's scenario zones change); the graticule depends on zoom (adaptive
 * spacing) and zone labels on the on-screen size of their polygon. Colours come from the active
 * theme through useChart(); hairlines use vectorEffect="non-scaling-stroke" and text is
 * counter-scaled by S so it keeps a constant on-screen size.
 *
 * Zone symbology follows chart convention: regulatory limits (restricted areas, traffic
 * separation schemes, emission control overlays) in the theme's regulatory magenta, restricted
 * areas hatched, TSS lanes with direction chevrons, shallow water as a tinted fill with its depth,
 * anchorages as an anchor glyph. Every zone group carries `data-info` for the board's hover chip.
 */
import { useMemo } from 'react'
import { useStore, type LayerId } from '../../../app/store'
import { PORT_LIST } from '../../../data/ports'
import { pointInRing } from '../../../engine/geo'
import { allZones, isLand } from '../../../engine/zones'
import type { Zone } from '../../../engine/types'
import { useChart } from '../context'
import { infoAttr, zoneInfo } from '../info'
import { registerObstacles, textBox, type Box } from '../labels'
import { landPaths, landShelfPaths } from '../land'
import { CHART, VIEW, pt, px, py, ringPath, unproject } from '../projection'

function useLayer(id: LayerId) {
  return useStore((s) => s.ui.layers[id])
}

/* ------------------------------------------------------------------ water */

/** Stable clip id; the board renders a single chart so one definition is enough. */
const REGION_CLIP_ID = 'chart-region-clip'

/** Geographic band widths in chart units (about 10 units per degree of longitude). */
const SHELF_WIDTH = 18
const SHALLOW_WIDTH = 7
/** islets and atolls get a small halo instead of the wide bands */
const ISLET_SHELF_WIDTH = 4
const ISLET_SHALLOW_WIDTH = 2

/**
 * Open water plus a soft continental-shelf tint hugging every coast: the land fill path stroked
 * with two wide, scaled strokes (a geographic band, not a pixel one) and clipped to the region.
 * The inner half of each band is hidden under the land fill drawn by LandLayer. Rings are split by
 * size (see landShelfPaths) so atolls show a soft halo rather than concentric blobs.
 */
export function WaterLayer() {
  const { theme } = useChart()
  const { large, small } = useMemo(() => landShelfPaths(), [])
  return (
    <g aria-hidden="true">
      <defs>
        <clipPath id={REGION_CLIP_ID}>
          <rect x={0} y={0} width={VIEW.w} height={VIEW.h} />
        </clipPath>
      </defs>
      <rect x={0} y={0} width={VIEW.w} height={VIEW.h} fill={theme.water} />
      <g clipPath={`url(#${REGION_CLIP_ID})`} fill="none" strokeLinejoin="round" strokeLinecap="round">
        <path d={large} stroke={theme.shelf} strokeWidth={SHELF_WIDTH} />
        <path d={large} stroke={theme.shallow} strokeOpacity={0.6} strokeWidth={SHALLOW_WIDTH} />
        <path d={small} stroke={theme.shelf} strokeWidth={ISLET_SHELF_WIDTH} />
        <path d={small} stroke={theme.shallow} strokeOpacity={0.6} strokeWidth={ISLET_SHALLOW_WIDTH} />
      </g>
    </g>
  )
}

/* ------------------------------------------------------------------- land */

export function LandLayer() {
  const { theme } = useChart()
  const { fill, coast } = useMemo(() => landPaths(), [])
  return (
    <g aria-hidden="true">
      <path d={fill} fill={theme.land} stroke="none" />
      <path d={coast} fill="none" stroke={theme.coast} strokeWidth={1} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </g>
  )
}

/* -------------------------------------------------------------- graticule */

/** pixel bands along the visible edges reserved for fixed chrome; pinned labels skip them */
const LON_LABEL_LEFT_PX = 230
const LAT_LABEL_TOP_PX = 100
const LAT_LABEL_BOTTOM_PX = 40

function gratSpacing(zoom: number): number {
  if (zoom < 1.6) return 10
  if (zoom < 3.5) return 5
  if (zoom < 6) return 2
  return 1
}

function stepsBetween(a: number, b: number, step: number): number[] {
  const out: number[] = []
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(v)
  return out
}

function latLabel(lat: number): string {
  if (lat === 0) return '0°'
  return `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`
}
function lonLabel(lon: number): string {
  return `${Math.abs(lon)}°${lon >= 0 ? 'E' : 'W'}`
}

/**
 * Adaptive graticule. Lines are clamped to the region rect and only those crossing the visible
 * box (plus a margin) are rendered; labels sit along the visible bottom and left edges so they
 * survive a fit or a pan, and only for lines inside the visible box.
 */
export function GraticuleLayer() {
  const { S, zoom, theme, view } = useChart()
  const labels = useLayer('labels')
  const spacing = gratSpacing(zoom)
  const all = useMemo(() => {
    const lons = stepsBetween(CHART.lon0, CHART.lon1, spacing).map((lon) => ({ lon, x: px(lon) }))
    const lats = stepsBetween(CHART.lat0, CHART.lat1, spacing).map((lat) => ({ lat, y: py(lat) }))
    return { lons, lats }
  }, [spacing])
  // visible box clamped to the region; a margin keeps lines in place while the camera settles
  const vx0 = Math.max(view.x0, 0)
  const vy0 = Math.max(view.y0, 0)
  const vx1 = Math.min(view.x1, VIEW.w)
  const vy1 = Math.min(view.y1, VIEW.h)
  const grid = useMemo(() => {
    const mx = (vx1 - vx0) * 0.25
    const my = (vy1 - vy0) * 0.25
    return {
      lons: all.lons.filter(({ x }) => x >= vx0 - mx && x <= vx1 + mx),
      lats: all.lats.filter(({ y }) => y >= vy0 - my && y <= vy1 + my),
    }
  }, [all, vx0, vy0, vx1, vy1])
  const labelY = vy1 - 6 * S
  const labelX = vx0 + 6 * S
  // fixed chrome sits over the stage edges (scale bar and cursor readout bottom-left, the scenario
  // and layers row top-left): keep pinned labels out of those pixel bands, measured from the raw
  // view (the stage), not the region-clamped box
  const lonVisible = ({ x }: { x: number }) => x >= vx0 && x >= view.x0 + LON_LABEL_LEFT_PX * S && x <= vx1
  const latVisible = ({ y }: { y: number }) => y >= vy0 && y >= view.y0 + LAT_LABEL_TOP_PX * S && y <= vy1 && y <= view.y1 - LAT_LABEL_BOTTOM_PX * S
  // pinned graticule labels are obstacles for the shared label pass
  registerObstacles(
    'grat',
    labels
      ? [
          ...grid.lons.filter(lonVisible).map(({ lon, x }) => textBox(x + 4 * S, labelY, 'start', lonLabel(lon), S)),
          ...grid.lats.filter(latVisible).map(({ lat, y }) => textBox(labelX, y - 4 * S, 'start', latLabel(lat), S)),
        ]
      : [],
  )
  return (
    <g aria-hidden="true">
      {grid.lons.map(({ lon, x }) => (
        <line key={`lon${lon}`} x1={x} x2={x} y1={0} y2={VIEW.h} stroke={theme.grat} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {grid.lats.map(({ lat, y }) => (
        <line key={`lat${lat}`} x1={0} x2={VIEW.w} y1={y} y2={y} stroke={theme.grat} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {labels &&
        grid.lons
          .filter(lonVisible)
          .map(({ lon, x }) => (
            <text key={`tl${lon}`} className="chart-text chart-text--grat" x={x + 4 * S} y={labelY} fontSize={12 * S} fill={theme.gratText}>
              {lonLabel(lon)}
            </text>
          ))}
      {labels &&
        grid.lats
          .filter(latVisible)
          .map(({ lat, y }) => (
            <text key={`tt${lat}`} className="chart-text chart-text--grat" x={labelX} y={y - 4 * S} fontSize={12 * S} fill={theme.gratText}>
              {latLabel(lat)}
            </text>
          ))}
    </g>
  )
}

/* ------------------------------------------------------------------ zones */

type ZoneKind = Zone['kind']

/** hatch pitch in chart units (about 0.22 deg): scales with zoom, stays airy at every level */
const HATCH_PITCH = 2.2
const HATCH_ID = 'chart-hatch-reg'
const HATCH_ALARM_ID = 'chart-hatch-alarm'
/** approximate mono glyph advance as a fraction of the font size, for the label fit test */
const GLYPH_ADVANCE = 0.62
const LABEL_PX = 12
/** slack around a label before it is allowed inside its polygon */
const LABEL_SLACK_PX = 16
/** a zone label is only worth drawing when the polygon is at least this tall on screen */
const LABEL_MIN_HEIGHT_PX = 18
/** a zone too small on screen for its label gets a dot marker instead (larger ones are visible as they are) */
const DOT_MAX_PX = 40
/** label slots as fractions of the polygon's extent along (first) and across (second) its long axis, tried in order */
const LABEL_SLOTS: [number, number][] = [
  [0, 0],
  [0.25, 0],
  [-0.25, 0],
  [0, 0.25],
  [0, -0.25],
  [0.45, 0],
  [-0.45, 0],
  [0.25, 0.25],
  [-0.25, -0.25],
]
/** an elongated polygon (long axis this many times its width) whose axis is not near-horizontal gets its label along the axis */
const ROTATE_ASPECT = 1.5
const ROTATE_MIN_DEG = 15
/** TSS chevrons appear from this zoom */
const CHEVRON_ZOOM = 2.5
/** on-screen distance between chevrons along a lane */
const CHEVRON_STEP_PX = 64
/** anchor glyph, pixel units, centred on the origin; drawn under scale(S) */
const ANCHOR_GLYPH = 'M0 -4.4 a1.4 1.4 0 1 0 0.01 0 M0 -3 V5.4 M-3.2 -0.4 H3.2 M-4.8 2.2 A4.8 4.8 0 0 0 4.8 2.2'
/** chevron, pixel units, pointing to -y (forward under rotate(axis)); drawn under scale(S) */
const CHEVRON_GLYPH = 'M-4 2.6 L0 -2.2 L4 2.6'
/** draw order: large overlays first so smaller zones stay on top and hit-testable */
const KIND_ORDER: Record<ZoneKind, number> = { eca: 0, shallow: 1, restricted: 2, tss: 3, anchorage: 4 }

interface ZoneItem {
  z: Zone
  d: string
  /** bounding box in chart units */
  w: number
  h: number
  /** label anchor (centroid, or a water point along the long axis when the centroid is on land) */
  ax: number
  ay: number
  /** long-axis unit vector and the polygon's extent along it and across it (chart units) */
  ux: number
  uy: number
  len: number
  wid: number
  label: string
  info: ReturnType<typeof infoAttr>
}

/**
 * Short display name: strip provenance suffixes and generic tails so the label fits inside its
 * polygon. "Andaman & Nicobar restricted waters (approx.)" becomes "Andaman & Nicobar",
 * "Palk Strait / Adam's Bridge shallows" becomes "Palk Strait".
 */
function displayName(z: Zone): string {
  let n = z.name
  n = n.replace(/\s*\((scenario|approx\.?)\)\s*/gi, ' ')
  n = n.replace(/\s*\/.*$/, '')
  n = n.replace(/\s*\b(restricted (waters|area)|shoal area|shallows|shallow area|low-emission overlay|exclusion (zone|area))\b\s*$/i, '')
  n = n.replace(/\s{2,}/g, ' ').trim()
  return n || z.name
}

/** Shoelace centroid in chart units (falls back to the vertex mean for degenerate rings). */
function centroidOf(pts: [number, number][]): [number, number] {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % pts.length]
    const f = x0 * y1 - x1 * y0
    a += f
    cx += (x0 + x1) * f
    cy += (y0 + y1) * f
  }
  if (Math.abs(a) < 1e-9) {
    const n = pts.length
    return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n]
  }
  return [cx / (3 * a), cy / (3 * a)]
}

/** Principal axis of the ring's vertices: unit vector plus the extent along it and across it. */
function longAxis(pts: [number, number][], cx: number, cy: number): { ux: number; uy: number; len: number; wid: number } {
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (const [x, y] of pts) {
    const dx = x - cx
    const dy = y - cy
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const ux = Math.cos(ang)
  const uy = Math.sin(ang)
  let lo = Infinity
  let hi = -Infinity
  let plo = Infinity
  let phi = -Infinity
  for (const [x, y] of pts) {
    const t = (x - cx) * ux + (y - cy) * uy
    const p = -(x - cx) * uy + (y - cy) * ux
    if (t < lo) lo = t
    if (t > hi) hi = t
    if (p < plo) plo = p
    if (p > phi) phi = p
  }
  return { ux, uy, len: hi - lo, wid: phi - plo }
}

const onLand = (x: number, y: number) => {
  const ll = unproject(x, y)
  return isLand(ll.lat, ll.lon)
}

/**
 * Label anchor: the centroid, unless it falls on land; then the middle of the longest run of
 * water among nine samples along the long axis (cheap, and enough for the coastal boxes here).
 */
function labelAnchor(cx: number, cy: number, ax: { ux: number; uy: number; len: number }, ring: number[][]): [number, number] {
  if (!onLand(cx, cy)) return [cx, cy]
  const n = 9
  const water: boolean[] = []
  const at = (i: number): [number, number] => {
    const t = ((i / (n - 1)) * 0.8 - 0.4) * ax.len
    return [cx + ax.ux * t, cy + ax.uy * t]
  }
  for (let i = 0; i < n; i++) {
    const [x, y] = at(i)
    const ll = unproject(x, y)
    water.push(pointInRing(ll.lon, ll.lat, ring) && !isLand(ll.lat, ll.lon))
  }
  let best = -1
  let bestLen = 0
  let run = 0
  for (let i = 0; i < n; i++) {
    run = water[i] ? run + 1 : 0
    if (run > bestLen) {
      bestLen = run
      best = i
    }
  }
  if (best < 0) return [cx, cy]
  return at(best - Math.floor((bestLen - 1) / 2))
}

function buildItems(list: Zone[]): ZoneItem[] {
  return list
    .map((z) => {
      const pts = z.ring.map(([lon, lat]) => [px(lon), py(lat)] as [number, number])
      const xs = pts.map((p) => p[0])
      const ys = pts.map((p) => p[1])
      const [cx, cy] = centroidOf(pts)
      const ax = longAxis(pts, cx, cy)
      const [ax0, ay0] = labelAnchor(cx, cy, ax, z.ring)
      return {
        z,
        d: ringPath(z.ring),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
        ax: ax0,
        ay: ay0,
        ux: ax.ux,
        uy: ax.uy,
        len: ax.len,
        wid: ax.wid,
        label: z.kind === 'eca' ? 'ECA' : displayName(z),
        info: infoAttr(zoneInfo(z)),
      }
    })
    .sort((a, b) => KIND_ORDER[a.z.kind] - KIND_ORDER[b.z.kind] || b.w * b.h - a.w * a.h)
}

/** approximate on-screen width of a chart label in pixels */
const labelWidthPx = (text: string) => GLYPH_ADVANCE * LABEL_PX * text.length + LABEL_SLACK_PX

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

interface ZoneLabel {
  x: number
  y: number
  /** text rotation in degrees (0 for horizontal; along the long axis for elongated polygons) */
  deg: number
  name: boolean
  depth: boolean
  /** axis-aligned box in chart units, registered as an obstacle for the shared label pass */
  box: Box
}

/** long-axis angle normalised so text never reads upside down: [-90, 90), vertical reads bottom to top */
function uprightDeg(ux: number, uy: number): number {
  let deg = (Math.atan2(uy, ux) * 180) / Math.PI
  if (deg >= 90) deg -= 180
  if (deg < -90) deg += 180
  return deg
}

/**
 * Label placement for the visible zones, cheap and deterministic: small zones first so nested
 * ones (a shoal inside a TSS) keep their centroid; each label then tries a few slots along the
 * polygon's long axis until its box lies inside the ring on water and clears every placed label
 * and port mark. Zones whose label does not fit are left to the hover chip (and a dot if small).
 */
function placeZoneLabels(items: ZoneItem[], S: number, obstacles: Box[]): Map<string, ZoneLabel> {
  const out = new Map<string, ZoneLabel>()
  const boxes = obstacles.slice()
  const order = items.slice().sort((a, b) => a.w * a.h - b.w * b.h)
  // the polygon's bounding box in units, for the lenient pass
  const bboxOf = (it: ZoneItem): Box => {
    const xs = it.z.ring.map(([lon]) => px(lon))
    const ys = it.z.ring.map(([, lat]) => py(lat))
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
  }
  for (const it of order) {
    const axisDeg = uprightDeg(it.ux, it.uy)
    const rotated = it.len > ROTATE_ASPECT * it.wid && Math.abs(axisDeg) > ROTATE_MIN_DEG
    // room for the text: along the long axis when rotated, else the bounding box
    const availW = (rotated ? it.len : it.w) / S
    const availH = (rotated ? it.wid : it.h) / S
    const tall = availH >= LABEL_MIN_HEIGHT_PX
    const depth = it.z.kind === 'shallow' && it.z.depthM !== undefined ? `${it.z.depthM} m` : null
    let name = tall && availW >= labelWidthPx(it.label)
    const showDepth = depth !== null && tall && availW >= labelWidthPx(depth)
    if (!name && !showDepth) continue
    const deg = rotated ? axisDeg : 0
    const ux = rotated ? it.ux * Math.sign(Math.cos((axisDeg * Math.PI) / 180) || 1) : 1
    const uy = rotated ? it.uy * Math.sign(Math.cos((axisDeg * Math.PI) / 180) || 1) : 0
    const vx = -uy
    const vy = ux
    const bbox = bboxOf(it)
    const inside = (b: Box, o: Box) => b.x0 >= o.x0 && b.x1 <= o.x1 && b.y0 >= o.y0 && b.y1 <= o.y1
    const textW = (chars: number) => GLYPH_ADVANCE * LABEL_PX * chars * S
    /** the label box (rotated corners) at a centre; null when it collides, leaves the ring or sits on land */
    const fits = (cx: number, cy: number, w: number, h: number, strict: boolean): Box | null => {
      const corners: [number, number][] = [
        [cx - ux * (w / 2) - vx * (h / 2), cy - uy * (w / 2) - vy * (h / 2)],
        [cx + ux * (w / 2) - vx * (h / 2), cy + uy * (w / 2) - vy * (h / 2)],
        [cx + ux * (w / 2) + vx * (h / 2), cy + uy * (w / 2) + vy * (h / 2)],
        [cx - ux * (w / 2) + vx * (h / 2), cy - uy * (w / 2) + vy * (h / 2)],
      ]
      const box: Box = {
        x0: Math.min(...corners.map((c) => c[0])),
        x1: Math.max(...corners.map((c) => c[0])),
        y0: Math.min(...corners.map((c) => c[1])),
        y1: Math.max(...corners.map((c) => c[1])),
      }
      if (boxes.some((b) => overlaps(b, box))) return null
      if (!inside(box, bbox)) return null
      if (strict) {
        for (const [x, y] of corners) {
          const ll = unproject(x, y)
          if (!pointInRing(ll.lon, ll.lat, it.z.ring)) return null
        }
      }
      const c = unproject(cx, cy)
      if (!pointInRing(c.lon, c.lat, it.z.ring) || isLand(c.lat, c.lon)) return null
      return box
    }
    const tryPlace = (w: number, h: number): { box: Box; x: number; y: number } | null => {
      // strict (every corner in the ring) first; rotated labels never take the lenient pass
      for (const strict of rotated ? [true] : [true, false]) {
        for (const [fa, fp] of LABEL_SLOTS) {
          const cx = it.ax + it.ux * fa * it.len - it.uy * fp * it.wid
          const cy = it.ay + it.uy * fa * it.len + it.ux * fp * it.wid
          const box = fits(cx, cy, w, h, strict)
          if (box) return { box, x: cx, y: cy }
        }
      }
      return null
    }
    let placed = tryPlace(textW(Math.max(name ? it.label.length : 0, showDepth ? depth!.length : 0)), (name && showDepth ? 26 : 12) * S)
    if (!placed && name && showDepth) {
      // the pair does not fit; the depth alone is short and still worth printing
      name = false
      placed = tryPlace(textW(depth!.length), 12 * S)
    }
    if (!placed) continue
    boxes.push(placed.box)
    out.set(it.z.id, { x: placed.x, y: placed.y, deg, name, depth: showDepth, box: placed.box })
  }
  return out
}

/** port marks (and the endpoint labels above right of them) as obstacles for zone labels */
function portObstacles(S: number, endpoints: Set<string>): Box[] {
  const out: Box[] = []
  for (const p of PORT_LIST) {
    const [x, y] = pt(p.position)
    const r = 8 * S
    out.push({ x0: x - r, y0: y - r, x1: x + r, y1: y + r })
    if (endpoints.has(p.id)) out.push({ x0: x + 10 * S, y0: y - 22 * S, x1: x + (10 + p.name.length * 7.9) * S, y1: y - 4 * S })
  }
  return out
}

/** the restricted zones the active plans actually enter (their hazard segments start, end or pass inside) */
function breachedZoneIds(items: ZoneItem[], plans: { evaluation: { segments: { from: { lat: number; lon: number }; to: { lat: number; lon: number }; hazards: string[] }[] } }[]): Set<string> {
  const out = new Set<string>()
  const restricted = items.filter((it) => it.z.kind === 'restricted')
  if (!restricted.length) return out
  for (const p of plans) {
    for (const seg of p.evaluation.segments) {
      if (!seg.hazards.includes('Restricted zone')) continue
      const mid = { lat: (seg.from.lat + seg.to.lat) / 2, lon: (seg.from.lon + seg.to.lon) / 2 }
      for (const it of restricted) {
        if (out.has(it.z.id)) continue
        if (pointInRing(seg.from.lon, seg.from.lat, it.z.ring) || pointInRing(seg.to.lon, seg.to.lat, it.z.ring) || pointInRing(mid.lon, mid.lat, it.z.ring)) out.add(it.z.id)
      }
    }
  }
  return out
}

export function ZoneLayer() {
  const { S, zoom, theme, view } = useChart()
  const zonesOn = useLayer('zones')
  const shallowOn = useLayer('shallow')
  const ecaOn = useLayer('eca')
  const labels = useLayer('labels')
  // the materialised voyage's zones: re-project as soon as a new voyage is generated
  const scenarioZones = useStore((s) => s.scenario.zones)
  const plans = useStore((s) => s.plans)
  // restricted areas turn alarm red only when the active plan actually enters one (a computed breach)
  const breach = useStore((s) => s.plans.some((p) => p.evaluation.segments.some((seg) => seg.hazards.includes('Restricted zone'))))
  const originId = useStore((s) => s.mission.originId)
  const destinationId = useStore((s) => s.mission.destinationId)
  const items = useMemo(() => {
    void scenarioZones
    return buildItems(allZones())
  }, [scenarioZones])
  const visible = useMemo(
    () => items.filter((it) => (it.z.kind === 'shallow' ? shallowOn : it.z.kind === 'eca' ? ecaOn : zonesOn)),
    [items, zonesOn, shallowOn, ecaOn],
  )
  const placedLabels = useMemo(() => {
    if (!labels) return new Map<string, ZoneLabel>()
    return placeZoneLabels(
      visible.filter((it) => it.z.kind !== 'anchorage'),
      S,
      portObstacles(S, new Set([originId, destinationId])),
    )
  }, [labels, visible, S, originId, destinationId])
  // zone labels stay inside their polygons, so the shared pass treats them as fixed obstacles
  registerObstacles('zone-labels', Array.from(placedLabels.values(), (l) => l.box))
  const breached = useMemo(() => {
    if (!breach) return new Set<string>()
    const ids = breachedZoneIds(items, plans)
    // the hazard was computed but no ring matched the sampled points: flag every restricted area
    return ids.size ? ids : new Set(items.filter((it) => it.z.kind === 'restricted').map((it) => it.z.id))
  }, [breach, items, plans])
  if (!zonesOn && !shallowOn && !ecaOn) return null
  const fs = LABEL_PX * S
  const chevrons = zoom >= CHEVRON_ZOOM
  return (
    <g data-layer="zones">
      <defs>
        <pattern id={HATCH_ID} patternUnits="userSpaceOnUse" width={HATCH_PITCH} height={HATCH_PITCH} patternTransform="rotate(45)">
          <line className="chart-hatch" x1={HATCH_PITCH / 2} y1={0} x2={HATCH_PITCH / 2} y2={HATCH_PITCH} stroke={theme.hatch} strokeOpacity={0.55} strokeWidth={S} />
        </pattern>
        <pattern id={HATCH_ALARM_ID} patternUnits="userSpaceOnUse" width={HATCH_PITCH} height={HATCH_PITCH} patternTransform="rotate(45)">
          <line className="chart-hatch chart-hatch--alarm" x1={HATCH_PITCH / 2} y1={0} x2={HATCH_PITCH / 2} y2={HATCH_PITCH} stroke={theme.alarm} strokeOpacity={0.6} strokeWidth={S} />
        </pattern>
      </defs>
      {visible.map((it) => {
        const { z } = it
        const alarm = z.kind === 'restricted' && breached.has(z.id)
        const reg = alarm ? theme.alarm : theme.regulatory
        const depth = z.kind === 'shallow' && z.depthM !== undefined ? `${z.depthM} m` : null
        const placedLab = placedLabels.get(z.id)
        // a zone label cut by the view edge is worse than none: hide it until the camera moves on
        const lab = placedLab && placedLab.box.x0 >= view.x0 && placedLab.box.x1 <= view.x1 && placedLab.box.y0 >= view.y0 && placedLab.box.y1 <= view.y1 ? placedLab : undefined
        const showName = !!lab?.name
        const showDepth = !!lab?.depth
        // no room for the label and the polygon itself is small on screen: a dot marks it
        const showDot = labels && z.kind !== 'anchorage' && !lab && Math.min(it.w, it.h) / S < DOT_MAX_PX
        const lx = lab?.x ?? it.ax
        const ly = lab?.y ?? it.ay
        const rot = lab && lab.deg !== 0 ? `rotate(${lab.deg.toFixed(1)} ${lx.toFixed(2)} ${ly.toFixed(2)})` : undefined
        const labelFill = z.kind === 'shallow' ? theme.ink1 : reg
        const labelClass = z.kind === 'shallow' ? 'chart-text chart-text--zone' : 'chart-text chart-text--zone chart-text--reg'
        return (
          <g key={z.id} {...it.info} data-zone={z.kind}>
            <title>{it.label}</title>
            {z.kind === 'restricted' && (
              <>
                {alarm && <path d={it.d} fill={theme.alarm} fillOpacity={0.12} stroke="none" />}
                <path d={it.d} fill={`url(#${alarm ? HATCH_ALARM_ID : HATCH_ID})`} stroke="none" />
                <path d={it.d} fill="none" stroke={reg} strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </>
            )}
            {z.kind === 'tss' && (
              <>
                <path d={it.d} fill={theme.regulatoryFill} fillOpacity={0.06} stroke={theme.regulatory} strokeWidth={1.2} strokeDasharray="5 3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                {chevrons && <TssChevrons it={it} S={S} color={theme.regulatory} />}
              </>
            )}
            {z.kind === 'eca' && (
              <path d={it.d} fill="none" pointerEvents="visibleFill" stroke={theme.regulatory} strokeOpacity={0.7} strokeWidth={1} strokeDasharray="7 4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            )}
            {z.kind === 'shallow' && (
              <path d={it.d} fill={theme.shallow} fillOpacity={0.7} stroke={theme.ink2} strokeWidth={1} strokeDasharray="1 3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            )}
            {z.kind === 'anchorage' && (
              <>
                <path d={it.d} fill={theme.ink2} fillOpacity={0.06} stroke="none" />
                <path
                  d={ANCHOR_GLYPH}
                  transform={`translate(${it.ax.toFixed(2)} ${it.ay.toFixed(2)}) scale(${S})`}
                  fill="none"
                  stroke={theme.ink2}
                  strokeWidth={1.1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}
            {showName && (
              <text className={labelClass} x={lx} y={showDepth ? ly - 2 * S : ly + 4 * S} fontSize={fs} textAnchor="middle" fill={labelFill} transform={rot}>
                {it.label}
              </text>
            )}
            {showDepth && (
              <text className="chart-text chart-text--zone chart-text--depth" x={lx} y={showName ? ly + 13 * S : ly + 4 * S} fontSize={fs} textAnchor="middle" fill={theme.shallowText} transform={rot}>
                {depth}
              </text>
            )}
            {showDot && <circle cx={it.ax} cy={it.ay} r={2 * S} fill={z.kind === 'shallow' ? theme.ink2 : reg} />}
          </g>
        )
      })}
    </g>
  )
}

/**
 * Two lanes of direction chevrons along a TSS polygon's long axis, opposite directions, each on
 * the starboard side of the centreline as ships keep to the right of the separation line.
 */
function TssChevrons({ it, S, color }: { it: ZoneItem; S: number; color: string }) {
  const n = Math.max(2, Math.min(6, Math.floor(it.len / S / CHEVRON_STEP_PX)))
  const off = it.wid * 0.22
  // screen axes: +y is south, so the perpendicular (-uy, ux) is starboard for traffic heading +u
  const pxv = -it.uy
  const pyv = it.ux
  const deg = (Math.atan2(it.uy, it.ux) * 180) / Math.PI + 90
  const marks: { x: number; y: number; rot: number; key: string }[] = []
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n - 0.5) * it.len * 0.78
    marks.push({ key: `a${i}`, x: it.ax + it.ux * t + pxv * off, y: it.ay + it.uy * t + pyv * off, rot: deg })
    marks.push({ key: `b${i}`, x: it.ax + it.ux * t - pxv * off, y: it.ay + it.uy * t - pyv * off, rot: deg + 180 })
  }
  return (
    <g pointerEvents="none">
      {marks.map((m) => (
        <path
          key={m.key}
          d={CHEVRON_GLYPH}
          transform={`translate(${m.x.toFixed(2)} ${m.y.toFixed(2)}) rotate(${m.rot.toFixed(1)}) scale(${S})`}
          fill="none"
          stroke={color}
          strokeOpacity={0.8}
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  )
}
