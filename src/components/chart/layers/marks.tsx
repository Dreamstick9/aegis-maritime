/**
 * Point marks for the flat chart: ports (open ring and dot), other fleet units (small hull
 * glyphs) and the mission vessel. The mission vessel is positioned on every animation frame from
 * the store (no React state per frame) and eases toward its target with an exponential approach
 * so scrubbing and fast replay stay fluid; its label text follows the board's quantised time.
 * Every colour comes from the active theme.
 */
import { useAnimationFrame } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { activePlanAt, useStore } from '../../../app/store'
import { FLEET_BY_ID } from '../../../data/fleet'
import { PORT_LIST } from '../../../data/ports'
import { stateAt } from '../../../engine/replay'
import type { ActivePlan } from '../../../engine/replay'
import { useChart } from '../context'
import { fleetInfo, infoAttr, portInfo, vesselInfo } from '../info'
import { followers, markBox, registerLabels, registerObstacles, type LabelItem } from '../labels'
import { nmRadius, pt } from '../projection'

/** Rounded, pointed hull outline: a 7-point polygon, bow at -y (north), `len` px long. */
function hullPath(len: number): string {
  const h = len / 2
  const w = len * 0.19
  const f = (n: number) => n.toFixed(2)
  return `M0 ${f(-h)} L${f(w)} ${f(-h * 0.42)} L${f(w)} ${f(h * 0.66)} L${f(w * 0.6)} ${f(h)} L${f(-w * 0.6)} ${f(h)} L${f(-w)} ${f(h * 0.66)} L${f(-w)} ${f(-h * 0.42)} Z`
}

const FLEET_HULL = hullPath(14)
const MISSION_HULL = hullPath(18)
const MISSION_BOW = 9
const HEADING_LINE_PX = 22
const RANGE_RING_NM = 30
/** exponential approach time constant for the vessel glyph, ms */
const SMOOTH_MS = 120

/* ----------------------------------------------------------------- ports */

/** ports other than the voyage's endpoints get their label from this zoom */
const OTHER_PORT_LABEL_ZOOM = 1.8
/** advance of one upper-case 12px mono glyph with the port label's 0.06em tracking, as a fraction of the size */
const PORT_CHAR_W = 0.66
/** invisible hit disc so a 4px dot is still easy to hover */
const PORT_HIT_PX = 9

/**
 * Port marks. Labels are not drawn here: each port registers a candidate with the shared label
 * pass (endpoints at priority 5 at every zoom, other ports at 2 from 1.8x) and its mark as an
 * obstacle; LabelLayer resolves collisions and draws them.
 */
export function PortLayer() {
  const { S, zoom, theme } = useChart()
  const labels = useStore((s) => s.ui.layers.labels)
  const originId = useStore((s) => s.mission.originId)
  const destinationId = useStore((s) => s.mission.destinationId)
  const endpoints = useMemo(() => new Set([originId, destinationId]), [originId, destinationId])
  const items: LabelItem[] = []
  const marks = PORT_LIST.map((p) => {
    const [x, y] = pt(p.position)
    const endpoint = endpoints.has(p.id)
    if (labels && (endpoint || zoom >= OTHER_PORT_LABEL_ZOOM)) {
      items.push({
        id: `port:${p.id}`,
        text: p.name.toUpperCase(),
        priority: endpoint ? 5 : 2,
        x,
        y,
        dx: (endpoint ? 10 : 7) * S,
        dyAbove: 8 * S,
        dyBelow: 17 * S,
        order: ['ra', 'rb', 'la', 'lb'],
        charW: PORT_CHAR_W,
        fallback: endpoint ? 'force' : 'clamp',
        className: 'chart-text chart-text--port',
        fill: endpoint ? theme.ink0 : theme.ink1,
      })
    }
    return markBox(x, y, endpoint ? 7 : 3, S)
  })
  registerLabels('ports', items)
  registerObstacles('port-marks', marks)
  return (
    <g data-layer="ports">
      {PORT_LIST.map((p) => {
        const [x, y] = pt(p.position)
        const endpoint = endpoints.has(p.id)
        return (
          <g key={p.id} {...infoAttr(portInfo(p))} data-port={endpoint ? 'endpoint' : 'other'}>
            <title>
              {p.name}, {p.country}
            </title>
            <circle cx={x} cy={y} r={PORT_HIT_PX * S} fill="transparent" stroke="none" />
            {endpoint ? (
              <>
                <circle cx={x} cy={y} r={6 * S} fill="none" stroke={theme.mark} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                <circle cx={x} cy={y} r={2 * S} fill={theme.mark} />
              </>
            ) : (
              <circle cx={x} cy={y} r={2 * S} fill={theme.mark} stroke={theme.water} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            )}
          </g>
        )
      })}
    </g>
  )
}

/* ----------------------------------------------------------------- fleet */

export function FleetLayer() {
  const { S, zoom, theme, tH } = useChart()
  const on = useStore((s) => s.ui.layers.fleet)
  const labels = useStore((s) => s.ui.layers.labels)
  const plans = useStore((s) => s.plans)
  const fleetUnits = useStore((s) => s.scenario.fleetUnits)
  const missionVesselId = useMemo(() => activePlanAt(plans, tH)?.evaluation.decision.vesselId ?? null, [plans, tH])
  const units = on ? fleetUnits.filter((u) => u.vesselId !== missionVesselId) : []
  // labels go through the shared pass (priority 1, dropped when nothing fits); hulls are obstacles
  registerLabels(
    'fleet',
    labels && zoom >= 1.6
      ? units.map((u) => {
          const [x, y] = pt(u.position)
          return {
            id: `fleet:${u.vesselId}`,
            text: `${FLEET_BY_ID[u.vesselId]?.name ?? u.vesselId}, ${u.status}`,
            priority: 1,
            x,
            y,
            dx: 10 * S,
            dyAbove: 8 * S,
            dyBelow: 15 * S,
            fallback: 'drop',
            className: 'chart-text chart-text--fleet',
            fill: theme.ink2,
          } satisfies LabelItem
        })
      : [],
  )
  registerObstacles(
    'fleet-marks',
    units.map((u) => {
      const [x, y] = pt(u.position)
      return markBox(x, y, 8, S)
    }),
  )
  if (!on) return null
  return (
    <g>
      {units.map((u) => {
        const v = FLEET_BY_ID[u.vesselId]
        const [x, y] = pt(u.position)
        const name = v?.name ?? u.vesselId
        return (
          <g key={u.vesselId} {...infoAttr(fleetInfo(u, name))}>
            <title>
              {name}, {u.status}: {u.note.replace(/\s*→\s*/g, ' to ')}
            </title>
            {/* filled hull with a 1 px water casing so it pops on both grounds */}
            {u.status === 'at anchor' ? (
              <g>
                <circle cx={x} cy={y} r={4.5 * S} fill={theme.fleet} stroke={theme.water} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                <circle cx={x} cy={y} r={1.4 * S} fill={theme.water} />
              </g>
            ) : (
              <g transform={`translate(${x} ${y}) rotate(${u.headingDeg}) scale(${S})`}>
                <path d={FLEET_HULL} fill={theme.fleet} stroke={theme.water} strokeWidth={1} strokeLinejoin="round" />
              </g>
            )}
          </g>
        )
      })}
    </g>
  )
}

/* -------------------------------------------------------- mission vessel */

interface Pose {
  x: number
  y: number
  h: number
}
interface Target extends Pose {
  tH: number
  plan: ActivePlan
  lat: number
}

export function MissionVesselLayer() {
  const { S, zoom, theme, reduced, tH } = useChart()
  const ocean = useStore((s) => s.scenario.ocean)
  const plans = useStore((s) => s.plans)
  const labels = useStore((s) => s.ui.layers.labels)
  const selectedVesselId = useStore((s) => s.selectedVesselId)

  const active = useMemo(() => activePlanAt(plans, tH), [plans, tH])
  const state = useMemo(() => (active ? stateAt(active, tH, ocean, { truth: true }) : null), [active, tH, ocean])
  const hasVessel = state !== null

  const glyph = useRef<SVGGElement>(null)
  const ring = useRef<SVGCircleElement>(null)
  const sRef = useRef(S)
  const cur = useRef<Pose | null>(null)
  const target = useRef<Target | null>(null)
  const applied = useRef<(Pose & { S: number }) | null>(null)
  useEffect(() => {
    sRef.current = S
  }, [S])

  const step = useCallback(
    (_t: number, deltaMs: number) => {
      const el = glyph.current
      if (!el) return
      const s = useStore.getState()
      const plan = activePlanAt(s.plans, s.timeline.tH)
      if (!plan) return
      let t = target.current
      if (!t || t.tH !== s.timeline.tH || t.plan !== plan) {
        const st = stateAt(plan, s.timeline.tH, ocean, { truth: true })
        const [x, y] = pt(st.position)
        t = { tH: s.timeline.tH, plan, x, y, h: st.headingDeg, lat: st.position.lat }
        target.current = t
      }
      let c = cur.current
      if (!c || reduced) {
        c = { x: t.x, y: t.y, h: t.h }
        cur.current = c
      } else {
        const a = 1 - Math.exp(-Math.min(deltaMs, 100) / SMOOTH_MS)
        const dh = ((t.h - c.h + 540) % 360) - 180
        c.x += (t.x - c.x) * a
        c.y += (t.y - c.y) * a
        c.h = (((c.h + dh * a) % 360) + 360) % 360
        if (Math.abs(t.x - c.x) < 1e-3 && Math.abs(t.y - c.y) < 1e-3 && Math.abs(dh) * (1 - a) < 0.02) {
          c.x = t.x
          c.y = t.y
          c.h = t.h
        }
      }
      const scale = sRef.current
      const ap = applied.current
      const changed = !ap || ap.x !== c.x || ap.y !== c.y || ap.h !== c.h || ap.S !== scale
      if (changed) applied.current = { x: c.x, y: c.y, h: c.h, S: scale }
      if (changed || !el.hasAttribute('transform')) {
        el.setAttribute('transform', `translate(${c.x.toFixed(3)} ${c.y.toFixed(3)}) rotate(${c.h.toFixed(2)}) scale(${scale})`)
      }
      // the label lives in LabelLayer's follower group; keep it riding the smoothed glyph
      const lg = followers.vessel
      if (lg && (changed || !lg.hasAttribute('transform'))) lg.setAttribute('transform', `translate(${c.x.toFixed(3)} ${c.y.toFixed(3)})`)
      const rg = ring.current
      if (rg && (changed || !rg.hasAttribute('r'))) {
        rg.setAttribute('cx', c.x.toFixed(3))
        rg.setAttribute('cy', c.y.toFixed(3))
        rg.setAttribute('r', nmRadius(RANGE_RING_NM, t.lat).toFixed(3))
      }
    },
    [ocean, reduced],
  )
  useAnimationFrame(step)
  // snap into place before the first paint of a (new) vessel so it never flashes at the origin
  useLayoutEffect(() => {
    cur.current = null
    target.current = null
    step(0, 0)
  }, [step, hasVessel])

  const vesselId = active?.evaluation.decision.vesselId ?? selectedVesselId
  const vessel = FLEET_BY_ID[vesselId]
  // the label (priority 4, always placed) and the glyph obstacle go through the shared pass; the
  // text itself is drawn by LabelLayer in a follower group moved per frame above
  const [tx, ty] = state ? pt(state.position) : [0, 0]
  registerLabels(
    'vessel',
    state && labels
      ? [
          {
            id: 'vessel',
            text: `${vessel?.name ?? vesselId}, ${state.sogKn.toFixed(1)} kn`,
            priority: 4,
            x: tx,
            y: ty,
            dx: 16 * S,
            dyAbove: 12 * S,
            dyBelow: 20 * S,
            fallback: 'force',
            follow: 'vessel',
            className: 'chart-text chart-text--ship',
            fill: theme.ink0,
          },
        ]
      : [],
  )
  registerObstacles('vessel-mark', state ? [markBox(tx, ty, 12, S)] : [])
  if (!active || !state) return null

  return (
    <g>
      {zoom >= 2 && <circle ref={ring} fill="none" stroke={theme.ink3} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      <g ref={glyph} data-testid="mission-vessel" {...infoAttr(vesselInfo(vessel?.name ?? vesselId, state.sogKn, state.headingDeg, state.segment?.risk ?? null))}>
        <title>
          {vessel?.name ?? vesselId}, heading {Math.round(state.headingDeg)}, {state.sogKn.toFixed(1)} kn
        </title>
        <line x1={0} y1={-MISSION_BOW} x2={0} y2={-MISSION_BOW - HEADING_LINE_PX} stroke={theme.vessel} strokeOpacity={0.7} strokeWidth={1.2} strokeLinecap="round" />
        <path d={MISSION_HULL} fill={theme.vessel} stroke={theme.vesselStroke} strokeWidth={1.5} strokeLinejoin="round" />
      </g>
    </g>
  )
}
