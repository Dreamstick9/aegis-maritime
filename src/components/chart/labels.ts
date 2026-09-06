/**
 * Shared label placement for the chart.
 *
 * Layers do not draw their own <text> for the five moving label kinds (endpoint ports, the
 * mission vessel, the storm, other ports, fleet units). Instead, during render, each layer
 * registers its candidate labels here (`registerLabels`) and its marks as fixed obstacles
 * (`registerObstacles`); zone labels, which must stay inside their polygons, are drawn by
 * ZoneLayer and registered as obstacles too. `LabelLayer` (rendered last inside the camera group)
 * resolves everything with `resolveLabels`, a pure greedy pass by priority: each label tries up to
 * four anchors around its mark (right-below, right-above, left-below, left-above), rejecting any
 * that overlaps a placed box or an obstacle or crosses the visible view; when nothing fits a label
 * is dropped (fleet) or clamped inside the view (ports, vessel). The storm label may fall back to
 * a shorter text before that.
 *
 * Registration is a plain module-level map written in render: layers render before LabelLayer in
 * the same pass, and LabelLayer subscribes to every store slice that changes a label, so it always
 * reads the current set. Boxes are in chart units; widths are estimated as charW x fontPx x chars
 * (scaled by S) since measuring text per render would be far more expensive.
 */

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export type AnchorSide = 'rb' | 'ra' | 'lb' | 'la'

export interface LabelItem {
  id: string
  text: string
  /** shorter text tried when the full one finds no free anchor */
  short?: string
  /** higher wins a slot first: endpoint ports 5, mission vessel 4, storm 3, other ports 2, fleet 1 */
  priority: number
  /** the mark's position in chart units */
  x: number
  y: number
  /** horizontal gap from the mark to the text, chart units */
  dx: number
  /** baseline distance above the mark, chart units (for 'ra' and 'la') */
  dyAbove: number
  /** baseline distance below the mark, chart units (for 'rb' and 'lb') */
  dyBelow: number
  /** anchors in order of preference (default right-below, right-above, left-below, left-above) */
  order?: AnchorSide[]
  fontPx?: number
  /** average glyph advance as a fraction of the font size (0.62 mono; 0.66 for tracked upper case) */
  charW?: number
  /**
   * when no anchor fits: 'drop' the label; 'clamp' it inside the view at the first anchor whose
   * box is free (else drop); 'force' the same but keep the first anchor even when it overlaps
   */
  fallback: 'drop' | 'clamp' | 'force'
  className: string
  fill: string
  /** the mission vessel label rides a per-frame follower group (see followers) */
  follow?: 'vessel'
}

export interface Placement {
  item: LabelItem
  text: string
  x: number
  y: number
  anchor: 'start' | 'end'
  box: Box
}

const DEFAULT_ORDER: AnchorSide[] = ['rb', 'ra', 'lb', 'la']
const FONT_PX = 12
const CHAR_W = 0.62
/** halo plus breathing room around every box, screen px */
const PAD_PX = 2
/** labels keep this far from the visible edge, screen px */
const EDGE_PX = 6

const registry = new Map<string, LabelItem[]>()
const obstacles = new Map<string, Box[]>()

/** Called in render by a layer: replaces that layer's candidate labels (pass [] when it has none). */
export function registerLabels(layer: string, items: LabelItem[]): void {
  registry.set(layer, items)
}

/** Called in render by a layer: replaces that layer's fixed obstacles (marks, zone labels). */
export function registerObstacles(layer: string, boxes: Box[]): void {
  obstacles.set(layer, boxes)
}

/** Groups LabelLayer renders that other layers move per frame (the vessel label follows its glyph). */
export const followers: { vessel: SVGGElement | null } = { vessel: null }

export const overlaps = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

/** A square obstacle around a mark, radius in screen px. */
export function markBox(x: number, y: number, rPx: number, S: number): Box {
  const r = rPx * S
  return { x0: x - r, y0: y - r, x1: x + r, y1: y + r }
}

/** Estimated on-screen box of a text run, chart units, with the halo padding. */
export function textBox(x: number, y: number, anchor: 'start' | 'end', text: string, S: number, fontPx = FONT_PX, charW = CHAR_W): Box {
  const w = charW * fontPx * text.length * S
  const pad = PAD_PX * S
  return {
    x0: (anchor === 'start' ? x : x - w) - pad,
    x1: (anchor === 'start' ? x + w : x) + pad,
    y0: y - (fontPx - 1) * S - pad,
    y1: y + 3 * S + pad,
  }
}

function anchorPoint(it: LabelItem, side: AnchorSide): { x: number; y: number; anchor: 'start' | 'end' } {
  const right = side === 'rb' || side === 'ra'
  const below = side === 'rb' || side === 'lb'
  return { x: right ? it.x + it.dx : it.x - it.dx, y: below ? it.y + it.dyBelow : it.y - it.dyAbove, anchor: right ? 'start' : 'end' }
}

const inside = (b: Box, bounds: Box) => b.x0 >= bounds.x0 && b.x1 <= bounds.x1 && b.y0 >= bounds.y0 && b.y1 <= bounds.y1

/**
 * Greedy resolution by priority. `view` is the visible viewport in chart units. Pure: reads the
 * registry and returns the placements; it never touches the DOM.
 */
export function resolveLabels(view: Box, S: number): Placement[] {
  const edge = EDGE_PX * S
  const bounds: Box = { x0: view.x0 + edge, y0: view.y0 + edge, x1: view.x1 - edge, y1: view.y1 - edge }
  const placed: Box[] = []
  for (const list of obstacles.values()) for (const b of list) placed.push(b)
  const items: LabelItem[] = []
  for (const list of registry.values()) for (const it of list) items.push(it)
  items.sort((a, b) => b.priority - a.priority)
  const out: Placement[] = []
  for (const it of items) {
    // a label belongs to a visible mark: off-view marks are not labelled at the edge
    if (it.x < view.x0 || it.x > view.x1 || it.y < view.y0 || it.y > view.y1) continue
    const order = it.order ?? DEFAULT_ORDER
    const texts = it.short ? [it.text, it.short] : [it.text]
    let hit: Placement | null = null
    for (const text of texts) {
      for (const side of order) {
        const p = anchorPoint(it, side)
        const box = textBox(p.x, p.y, p.anchor, text, S, it.fontPx, it.charW)
        if (!inside(box, bounds)) continue
        if (placed.some((b) => overlaps(b, box))) continue
        hit = { item: it, text, x: p.x, y: p.y, anchor: p.anchor, box }
        break
      }
      if (hit) break
    }
    if (!hit && it.fallback !== 'drop') {
      // shove each anchor's box inside the view and take the first that is free; else force the first
      const text = texts[texts.length - 1]
      let forced: Placement | null = null
      for (const side of order) {
        const p = anchorPoint(it, side)
        let box = textBox(p.x, p.y, p.anchor, text, S, it.fontPx, it.charW)
        const sx = box.x0 < bounds.x0 ? bounds.x0 - box.x0 : box.x1 > bounds.x1 ? bounds.x1 - box.x1 : 0
        const sy = box.y0 < bounds.y0 ? bounds.y0 - box.y0 : box.y1 > bounds.y1 ? bounds.y1 - box.y1 : 0
        box = { x0: box.x0 + sx, x1: box.x1 + sx, y0: box.y0 + sy, y1: box.y1 + sy }
        const cand = { item: it, text, x: p.x + sx, y: p.y + sy, anchor: p.anchor, box }
        if (!forced) forced = cand
        if (!placed.some((b) => overlaps(b, box))) {
          hit = cand
          break
        }
      }
      if (!hit && it.fallback === 'force') hit = forced
    }
    if (!hit) continue
    placed.push(hit.box)
    out.push(hit)
  }
  return out
}
