/**
 * Weather layers for the flat 2D chart: the sparse environmental fields (wind, current, waves)
 * and the cyclone (forecast track, core, envelope, spiral arms, ground truth).
 *
 * Fields are sampled on an adaptive grid (4 deg / 2 deg / 1 deg by zoom) that skips land cells,
 * and re-render only when the quantised replay time `tH` changes. The storm is the one thing in
 * the product allowed to loop: its spiral arms rotate slowly via useAnimationFrame writing a
 * transform attribute on a ref; the centre eases between quantised time steps with motion's
 * animate(). Both are skipped when reduced motion is on.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { animate, useAnimationFrame, type AnimationPlaybackControls } from 'motion/react'
import { forecastFor, interpolateTrack, sampleEnv } from '../../../engine/ocean'
import { isLand } from '../../../engine/zones'
import type { OceanConfig } from '../../../engine/types'
import { useStore, type LayerId } from '../../../app/store'
import { useChart } from '../context'
import { infoAttr, stormInfo } from '../info'
import { registerLabels, registerObstacles, textBox } from '../labels'
import { CHART_EASE } from '../theme'
import { nmRadius, pathOf, pt, px, py } from '../projection'

export type FieldKind = 'wind' | 'current' | 'waves'

/* ----------------------------------------------------------------- hooks */

function useOcean(): OceanConfig {
  return useStore((s) => s.scenario.ocean)
}
function useLayer(id: LayerId): boolean {
  return useStore((s) => s.ui.layers[id])
}

/* ------------------------------------------------------------------ grid */

const REGION = { lat0: -7, lat1: 23, lon0: 63, lon1: 108 }

interface Cell {
  lat: number
  lon: number
  x: number
  y: number
}

/** Grid spacing in degrees for a camera zoom: sparse when the whole region is in view. */
function spacingFor(zoom: number): number {
  if (zoom < 1.5) return 4
  if (zoom < 3) return 2
  return 1
}

const gridCache = new Map<number, Cell[]>()

/** Sea cells of the region at a spacing; built once per spacing (land tests are the costly part). */
function gridFor(spacing: number): Cell[] {
  const hit = gridCache.get(spacing)
  if (hit) return hit
  const cells: Cell[] = []
  const latStart = Math.ceil(REGION.lat0 / spacing) * spacing
  const lonStart = Math.ceil(REGION.lon0 / spacing) * spacing
  for (let lat = latStart; lat <= REGION.lat1; lat += spacing) {
    for (let lon = lonStart; lon <= REGION.lon1; lon += spacing) {
      if (isLand(lat, lon)) continue
      cells.push({ lat, lon, x: px(lon), y: py(lat) })
    }
  }
  gridCache.set(spacing, cells)
  return cells
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Glyph geometry in pixel units; drawn under translate/rotate/scale(S). */
interface Glyph {
  key: number
  x: number
  y: number
  rot: number
  d: string
  /** waves only: dot radius in px */
  r: number
  /** 0 = field, 1 = fieldStrong, 2 = alarm */
  tone: 0 | 1 | 2
}

/** Wind feather: a line along the direction the wind blows to, with a tiny barb at the tail. */
function featherPath(len: number): string {
  const h = len / 2
  return `M0 ${h.toFixed(1)} V${(-h).toFixed(1)} M0 ${h.toFixed(1)} L3 ${(h - 3).toFixed(1)}`
}

/** Current arrow: a line with an open chevron at the head. */
function arrowPath(len: number): string {
  const h = len / 2
  return `M0 ${h.toFixed(1)} V${(-h).toFixed(1)} M-2.4 ${(-h + 2.8).toFixed(1)} L0 ${(-h).toFixed(1)} L2.4 ${(-h + 2.8).toFixed(1)}`
}

/* ----------------------------------------------------------------- field */

export function FieldLayer({ kind }: { kind: FieldKind }) {
  const { S, zoom, theme, tH } = useChart()
  const on = useLayer(kind)
  const ocean = useOcean()
  const truth = useStore((s) => s.ui.showTruthStorm)
  const spacing = spacingFor(zoom)

  const glyphs = useMemo<Glyph[]>(() => {
    if (!on) return []
    const cells = gridFor(spacing)
    const opts = truth ? { truth: true } : { planningTimeH: tH }
    const out: Glyph[] = []
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]
      const env = sampleEnv(ocean, c.lat, c.lon, tH, opts)
      if (kind === 'wind') {
        const len = 8 + 10 * clamp01(env.windKn / 50)
        const tone: Glyph['tone'] = env.windKn >= 48 ? 2 : env.windKn >= 25 ? 1 : 0
        out.push({ key: i, x: c.x, y: c.y, rot: env.windFromDeg + 180, d: featherPath(len), r: 0, tone })
      } else if (kind === 'current') {
        const len = 6 + 14 * clamp01((env.curKn - 0.3) / 2.2)
        const rot = (Math.atan2(env.curU, env.curV) * 180) / Math.PI
        out.push({ key: i, x: c.x, y: c.y, rot, d: arrowPath(len), r: 0, tone: 0 })
      } else {
        const r = 2 + 5 * clamp01(env.hsM / 6)
        out.push({ key: i, x: c.x, y: c.y, rot: 0, d: '', r, tone: env.hsM >= 5 ? 2 : 0 })
      }
    }
    return out
  }, [on, ocean, tH, kind, truth, spacing])

  if (!on) return null

  const tones = [theme.field, theme.fieldStrong, theme.alarm]

  if (kind === 'waves') {
    return (
      <g aria-hidden="true" pointerEvents="none" data-layer="field-waves">
        {glyphs.map((g) => (
          <circle key={g.key} cx={g.x} cy={g.y} r={g.r * S} fill={tones[g.tone]} fillOpacity={0.35} />
        ))}
      </g>
    )
  }

  return (
    <g aria-hidden="true" pointerEvents="none" opacity={0.9} data-layer={`field-${kind}`}>
      {glyphs.map((g) => (
        <path
          key={g.key}
          d={g.d}
          transform={`translate(${g.x.toFixed(2)} ${g.y.toFixed(2)}) rotate(${g.rot.toFixed(1)}) scale(${S})`}
          fill="none"
          stroke={tones[g.tone]}
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  )
}

/* ----------------------------------------------------------------- storm */

function spiralPath(r: number, turns = 1.4, phase = 0): string {
  let d = ''
  const n = 40
  for (let i = 0; i <= n; i++) {
    const f = i / n
    const a = phase + f * turns * Math.PI * 2
    const rr = r * (0.18 + 0.82 * f)
    d += `${i === 0 ? 'M' : 'L'}${(Math.cos(a) * rr).toFixed(2)} ${(Math.sin(a) * rr).toFixed(2)}`
  }
  return d
}

/** Spiral arm rotation, degrees per second (the product's one loop; calm). */
const SPIN_DEG_PER_S = 8
const EASE_S = 0.3
const NO_POS = Number.NaN

/** the storm's short name for the compact label: "Cyclonic storm “Scenario-07”" becomes "Scenario-07" */
function shortStormName(name: string): string {
  return name.replace(/^\s*(tropical|cyclonic|severe)?\s*(storm|cyclone)\s*/i, '').replace(/[“”"]/g, '').trim() || name
}

export function StormLayer() {
  const { S, zoom, theme, reduced, tH } = useChart()
  const on = useLayer('storm')
  const labels = useLayer('labels')
  const truthToggle = useStore((s) => s.ui.showTruthStorm)
  const ocean = useOcean()

  const forecast = on && ocean.storm ? forecastFor(ocean, tH) : null
  const raw = forecast ? interpolateTrack(forecast.track, tH) : null
  const center = raw && raw.vmaxKn > 0 ? raw : null
  const live = center !== null
  const cx = center ? px(center.lon) : NO_POS
  const cy = center ? py(center.lat) : NO_POS

  // Spiral arms: the only loop. Written straight to the DOM, never through React state.
  const spin = useRef<SVGGElement>(null)
  const angle = useRef(0)
  useAnimationFrame((_, dt) => {
    if (reduced || !spin.current) return
    angle.current = (angle.current - (dt / 1000) * SPIN_DEG_PER_S) % 360
    spin.current.setAttribute('transform', `rotate(${angle.current.toFixed(2)})`)
  })

  // Eased centre: the group's translate tweens from the last drawn position to the new target.
  const eased = useRef<SVGGElement>(null)
  const pos = useRef({ x: NO_POS, y: NO_POS })
  const tween = useRef<AnimationPlaybackControls | null>(null)
  useLayoutEffect(() => {
    const g = eased.current
    if (!g || !live) return
    const from = { ...pos.current }
    const jump = reduced || Number.isNaN(from.x)
    tween.current?.stop()
    if (jump) {
      pos.current = { x: cx, y: cy }
      g.setAttribute('transform', `translate(${cx.toFixed(2)} ${cy.toFixed(2)})`)
      return
    }
    // Keep the pre-commit position for the first paint, then ease.
    g.setAttribute('transform', `translate(${from.x.toFixed(2)} ${from.y.toFixed(2)})`)
    tween.current = animate(0, 1, {
      duration: EASE_S,
      ease: CHART_EASE,
      onUpdate: (f) => {
        const x = from.x + (cx - from.x) * f
        const y = from.y + (cy - from.y) * f
        pos.current = { x, y }
        g.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`)
      },
    })
  }, [cx, cy, live, reduced])
  useEffect(() => () => tween.current?.stop(), [])

  const r1 = center ? nmRadius(center.rmaxNm, center.lat) : 0
  // the label goes through the shared pass (priority 3; the short form when the long one does not
  // fit); the core is an obstacle so no label sits on the eye
  const storm = ocean.storm
  registerLabels(
    'storm',
    center && storm && forecast && labels
      ? [
          {
            id: 'storm',
            text: `${storm.name}, ${Math.round(center.vmaxKn)} kn, forecast t+${forecast.issuedAtH} h`,
            short: `${shortStormName(storm.name)}, ${Math.round(center.vmaxKn)} kn`,
            priority: 3,
            x: cx,
            y: cy,
            // clear of the core box (an obstacle): beside the eye, a little above or below centre
            dx: r1 + 6 * S,
            dyAbove: r1 * 0.5 + 6 * S,
            dyBelow: r1 * 0.5 + 14 * S,
            order: ['ra', 'rb', 'la', 'lb'],
            fallback: 'force',
            className: 'chart-text',
            fill: theme.ink1,
          },
        ]
      : [],
  )
  const track = on && forecast ? forecast.track : []
  const showTimes = on && labels && zoom >= 1.4
  // the core and the track's time stamps are obstacles so no label sits on the eye or a stamp
  registerObstacles('storm-core', [
    ...(center ? [{ x0: cx - r1, y0: cy - r1, x1: cx + r1, y1: cy + r1 }] : []),
    ...(showTimes
      ? track
          .filter((_, i) => i % 2 === 0)
          .map((p) => {
            const [x, y] = pt(p)
            return textBox(x + 5 * S, y - 5 * S, 'start', `t+${p.tH}h`, S)
          })
      : []),
  ])
  if (!on || !storm || !forecast) return null
  const truth = truthToggle ? interpolateTrack(storm.actual, tH) : null
  const trackD = pathOf(track.map((p) => ({ lat: p.lat, lon: p.lon })))
  const fs = 12 * S

  return (
    <g aria-hidden="true" pointerEvents="none" data-layer="storm">
      {/* forecast track */}
      <path d={trackD} fill="none" stroke={theme.ink2} strokeWidth={1} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
      {track.map((p, i) => {
        const [x, y] = pt(p)
        return (
          <g key={p.tH}>
            <circle cx={x} cy={y} r={2.6 * S} fill="none" stroke={theme.ink2} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            {showTimes && i % 2 === 0 && (
              <text className="chart-text" x={x + 5 * S} y={y - 5 * S} fontSize={fs} fill={theme.ink3}>
                {`t+${p.tH}h`}
              </text>
            )}
          </g>
        )
      })}

      {/* eased centre: core, envelope rings, spiral arms, label */}
      {center && (
        <g ref={eased}>
          <circle r={r1} fill={theme.alarm} fillOpacity={0.1} stroke={theme.alarm} strokeWidth={1.3} vectorEffect="non-scaling-stroke" pointerEvents="visiblePainted" {...infoAttr(stormInfo(storm.name, center, forecast))} />
          <circle r={r1 * 1.5} fill="none" stroke={theme.alarm} strokeWidth={1} opacity={0.35} vectorEffect="non-scaling-stroke" />
          <circle r={r1 * 2} fill="none" stroke={theme.alarm} strokeWidth={1} opacity={0.25} vectorEffect="non-scaling-stroke" />
          <circle r={r1 * 2.5} fill="none" stroke={theme.alarm} strokeWidth={1} opacity={0.15} vectorEffect="non-scaling-stroke" />
          <circle r={r1 * 2.5} fill="none" stroke={theme.ink1} strokeWidth={1} strokeDasharray="4 3" opacity={0.6} vectorEffect="non-scaling-stroke" />
          <g ref={spin}>
            {[0, 1, 2].map((i) => (
              <path
                key={i}
                d={spiralPath(r1 * 1.5, 1.4, (i * Math.PI * 2) / 3)}
                fill="none"
                stroke={theme.alarm}
                strokeWidth={1}
                opacity={0.6}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        </g>
      )}

      {/* ground truth */}
      {truth && truth.vmaxKn > 0 && (
        <circle
          cx={px(truth.lon)}
          cy={py(truth.lat)}
          r={nmRadius(truth.rmaxNm, truth.lat)}
          fill="none"
          stroke={theme.ink0}
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.85}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  )
}
