/**
 * Hover information for chart marks: the `data-info` convention.
 *
 * Any SVG element (or group) in a chart layer may carry a `data-info` attribute holding a JSON
 * `ChartInfo`. ChartBoard installs one delegated pointer listener on the plate's <svg>; when the
 * pointer is over an element with `data-info` (or inside one), it shows the `.plate__chip` HTML
 * chip next to the cursor with the content built by `chipContent()`. The chip never intercepts
 * pointer events, so drags and zooms through it still reach the chart.
 *
 * Layer authors spread `infoAttr(info)` onto the element:
 *
 *   <g {...infoAttr(zoneInfo(zone))}> ... </g>
 *   <circle {...infoAttr(portInfo(port))} ... />
 *
 * The element (or a descendant with a fill or stroke) must be hit-testable: groups that set
 * `pointerEvents="none"` for performance can re-enable it on the one element that carries the
 * info (`pointerEvents="visiblePainted"`), since pointer-events is inherited per element.
 *
 * Builders for the product's mark kinds live here so the copy stays in one place; a layer may
 * also pass a plain `{ kind, title, lines }` for anything else.
 */
import type { FleetUnit } from '../../data/fleet'
import type { Port, StormForecast, StormTrackPoint, Zone } from '../../engine/types'

export type ChartInfoKind = 'zone' | 'port' | 'fleet' | 'vessel' | 'storm' | 'waypoint' | 'track'

export interface ChartInfo {
  kind: ChartInfoKind
  /** first line of the chip, 13px sans */
  title: string
  /** mono lines under the title (already formatted, no dashes) */
  lines?: string[]
  /** zones only */
  note?: string
  provenance?: string
  depthM?: number
}

export const INFO_ATTR = 'data-info'

/** Spread onto the element that should show the chip. */
export function infoAttr(info: ChartInfo): { 'data-info': string; 'data-kind': ChartInfoKind } {
  return { 'data-info': JSON.stringify(info), 'data-kind': info.kind }
}

/** Reads the nearest `data-info` on or above an element; null when there is none or it is malformed. */
export function readInfo(el: Element | null): ChartInfo | null {
  const host = el?.closest?.(`[${INFO_ATTR}]`)
  const raw = host?.getAttribute(INFO_ATTR)
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<ChartInfo>
    if (!v || typeof v.title !== 'string' || typeof v.kind !== 'string') return null
    return v as ChartInfo
  } catch {
    return null
  }
}

/* --------------------------------------------------------------- wording */

const ZONE_KIND_WORD: Record<Zone['kind'], string> = {
  restricted: 'Restricted area',
  tss: 'Traffic separation scheme',
  eca: 'Emission control area',
  shallow: 'Shallow water',
  anchorage: 'Anchorage',
}

const PROVENANCE_WORD: Record<string, string> = {
  sourced: 'Sourced',
  derived: 'Derived',
  scenario: 'Scenario input',
  synthetic: 'Synthetic',
}

export function zoneKindWord(kind: Zone['kind']): string {
  return ZONE_KIND_WORD[kind]
}

/** Zone name without its bracketed provenance suffix; the chip states provenance on its own line. */
export function zoneTitle(z: Zone): string {
  return z.name.replace(/\s*\((scenario|approx\.)\)\s*$/i, '').trim()
}

/* --------------------------------------------------------------- builders */

export function zoneInfo(z: Zone): ChartInfo {
  return { kind: 'zone', title: zoneTitle(z), lines: [zoneKindWord(z.kind)], note: z.note, provenance: z.provenance, depthM: z.depthM }
}

export function portInfo(p: Port): ChartInfo {
  const fuels = Object.values(p.scenario.fuelAvailability)
  const offered = fuels.filter((a) => a && a !== 'none').length
  return {
    kind: 'port',
    title: p.name,
    lines: [p.country, `Berth depth ${p.limits.berthDepthM.toFixed(1)} m`, `Fuels: ${offered} of ${fuels.length} offered`],
  }
}

export function fleetInfo(u: FleetUnit, vesselName: string): ChartInfo {
  const speed = u.speedKn > 0 ? `${u.speedKn.toFixed(1)} kn, heading ${Math.round(u.headingDeg)}` : 'stopped'
  return { kind: 'fleet', title: vesselName, lines: [u.status, speed, `Bound for ${u.destination}`] }
}

export function vesselInfo(name: string, sogKn: number, headingDeg: number, segmentRisk: number | null): ChartInfo {
  const lines = [`SOG ${sogKn.toFixed(1)} kn`, `Heading ${Math.round(headingDeg).toString().padStart(3, '0')}`]
  if (segmentRisk !== null) lines.push(`Segment risk ${segmentRisk.toFixed(2)}`)
  return { kind: 'vessel', title: name, lines }
}

export function stormInfo(name: string, center: StormTrackPoint, forecast: StormForecast): ChartInfo {
  return {
    kind: 'storm',
    title: name,
    lines: [`Vmax ${Math.round(center.vmaxKn)} kn`, `Rmax ${Math.round(center.rmaxNm)} nm`, `Forecast issued t+${forecast.issuedAtH} h`],
  }
}

export function waypointInfo(index: number, p: { lat: number; lon: number }): ChartInfo {
  return { kind: 'waypoint', title: `Waypoint ${index}`, lines: [formatLatLon(p)] }
}

export function formatLatLon(p: { lat: number; lon: number }): string {
  const lat = `${Math.abs(p.lat).toFixed(2)}${p.lat >= 0 ? 'N' : 'S'}`
  const lon = `${Math.abs(p.lon).toFixed(2)}${p.lon >= 0 ? 'E' : 'W'}`
  return `${lat} ${lon}`
}

/* ------------------------------------------------------------------ chip */

export interface ChipContent {
  title: string
  lines: string[]
}

/** Title and mono lines the board prints in the chip. */
export function chipContent(info: ChartInfo): ChipContent {
  if (info.kind === 'zone') {
    // zoneInfo() stores the spelled-out kind as the first line; depth, provenance and the note follow
    const lines: string[] = info.lines ? info.lines.slice() : []
    if (info.depthM !== undefined) lines.push(`Depth ${info.depthM} m`)
    if (info.provenance) lines.push(PROVENANCE_WORD[info.provenance] ?? info.provenance)
    if (info.note) lines.push(info.note)
    return { title: info.title, lines }
  }
  return { title: info.title, lines: info.lines ?? [] }
}
