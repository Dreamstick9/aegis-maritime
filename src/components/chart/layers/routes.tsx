/**
 * Route symbology for the flat chart: corridors, the baseline and classical references, the
 * Pareto alternatives, superseded tracks from re-plans, and the selected plan drawn as a cased
 * line (a water-coloured casing under the core) so it reads over land, zones and field glyphs on
 * both grounds. Every colour comes from the active theme; nothing here loops.
 *
 * Draw-in: when a plan begins the remaining track draws from the vessel toward the destination.
 * The animated paths use S-scaled stroke widths (user space) so the browser's pathLength
 * normalisation is exact at every zoom; once the draw-in completes they are replaced by plain
 * non-scaling-stroke paths without any dasharray, so nothing can ever show gaps.
 */
import { animate, motion, useMotionValue } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { activePlanAt, useStore } from '../../../app/store'
import { splitTrack } from '../../../engine/replay'
import type { Evaluation, LatLon } from '../../../engine/types'
import { useChart } from '../context'
import { pathOf, pt } from '../projection'
import { CHART_EASE, type ChartTheme } from '../theme'

const DRAW_IN_S = 1.2
const FADE_S = 2.6
const CORE_PX = 3
const CASING_PX = 5

function evalPoints(e: Evaluation): LatLon[] {
  const pts: LatLon[] = e.segments.map((s) => s.from)
  const last = e.segments[e.segments.length - 1]
  if (last) pts.push(last.to)
  return pts
}

/** The remaining track: casing plus core, drawn in once per plan then left as plain paths. */
function DrawnTrack({ d, theme, S, reduced }: { d: string; theme: ChartTheme; S: number; reduced: boolean }) {
  const [done, setDone] = useState(reduced)
  const progress = useMotionValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    const controls = animate(progress, 1, { duration: DRAW_IN_S, ease: CHART_EASE, onComplete: () => setDone(true) })
    return () => controls.stop()
  }, [progress, reduced])

  if (done || reduced) {
    return (
      <>
        <path d={d} fill="none" stroke={theme.water} strokeOpacity={0.9} strokeWidth={CASING_PX} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={d} fill="none" stroke={theme.plan} strokeWidth={CORE_PX} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </>
    )
  }
  return (
    <>
      <motion.path d={d} fill="none" stroke={theme.water} strokeOpacity={0.9} strokeWidth={CASING_PX * S} strokeLinejoin="round" strokeLinecap="round" style={{ pathLength: progress }} />
      <motion.path d={d} fill="none" stroke={theme.plan} strokeWidth={CORE_PX * S} strokeLinejoin="round" strokeLinecap="round" style={{ pathLength: progress }} />
    </>
  )
}

export function RouteLayer() {
  const { S, theme, reduced, tH } = useChart()
  const result = useStore((s) => s.run.result)
  const plans = useStore((s) => s.plans)
  const planCorridors = useStore((s) => s.planCorridors)
  const history = useStore((s) => s.replan.history)
  const selectedId = useStore((s) => s.selectedSolutionId)
  const selectedSegment = useStore((s) => s.selectedSegment)
  const showBaseline = useStore((s) => s.ui.layers.baseline)
  const showClassical = useStore((s) => s.ui.layers.classical)
  const showPareto = useStore((s) => s.ui.layers.pareto)
  const showCorridors = useStore((s) => s.ui.layers.corridors)

  const baseline = useMemo(() => (result ? pathOf(evalPoints(result.baseline)) : ''), [result])
  const classical = useMemo(() => (result ? pathOf(evalPoints(result.classical)) : ''), [result])
  const pareto = useMemo(() => (result ? result.named.filter((n) => n.id !== selectedId).map((n) => ({ id: n.id, d: pathOf(evalPoints(n)) })) : []), [result, selectedId])
  const corridors = useMemo(() => (result && showCorridors ? result.corridors.map((c) => ({ id: c.id, d: pathOf(c.waypoints) })) : []), [result, showCorridors])

  const active = useMemo(() => activePlanAt(plans, tH), [plans, tH])
  const split = useMemo(() => (active ? splitTrack(active, tH) : null), [active, tH])
  const travelled = useMemo(() => (split && split.travelled.length > 1 ? pathOf(split.travelled) : ''), [split])
  const remaining = useMemo(() => (split && split.remaining.length > 1 ? pathOf(split.remaining) : ''), [split])
  const waypoints = useMemo(() => {
    if (!active) return []
    const c = planCorridors[active.evaluation.decision.corridorId]
    return c ? c.waypoints.slice(1, -1).map((w) => pt(w)) : []
  }, [active, planCorridors])
  const superseded = useMemo(() => history.map((h) => ({ key: h.fadeStartMs, d: pathOf(splitTrack(h.oldPlan, h.atH).remaining) })), [history])
  const segment = useMemo(() => {
    if (selectedSegment === null || !active) return null
    const s = active.evaluation.segments[selectedSegment]
    if (!s) return null
    return { d: pathOf([s.from, s.to]), a: pt(s.from), b: pt(s.to) }
  }, [selectedSegment, active])

  if (!result && plans.length === 0) return null

  const drawKey = active ? `${active.fromH}-${selectedId ?? 'plan'}` : 'none'

  return (
    <g aria-hidden="true">
      {corridors.map((c) => (
        <path key={c.id} d={c.d} fill="none" stroke={theme.ink3} strokeWidth={1} strokeDasharray="1 3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ))}
      {showBaseline && baseline && <path d={baseline} fill="none" stroke={theme.ink2} strokeWidth={1} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
      {showClassical && classical && <path d={classical} fill="none" stroke={theme.ink2} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />}
      {showPareto && pareto.map((p) => <path key={p.id} d={p.d} fill="none" stroke={theme.ink2} strokeWidth={1} strokeOpacity={0.35} vectorEffect="non-scaling-stroke" />)}
      {superseded.map((h) => (
        <motion.path
          key={h.key}
          d={h.d}
          fill="none"
          stroke={theme.ink1}
          strokeWidth={1.2}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
          initial={{ opacity: reduced ? 0.3 : 0.9 }}
          animate={{ opacity: 0.3 }}
          transition={{ duration: reduced ? 0 : FADE_S, ease: 'easeOut' }}
        />
      ))}
      {travelled && <path d={travelled} fill="none" stroke={theme.water} strokeOpacity={0.9} strokeWidth={CASING_PX} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      {remaining && <DrawnTrack key={drawKey} d={remaining} theme={theme} S={S} reduced={reduced} />}
      {travelled && <path d={travelled} fill="none" stroke={theme.travelled} strokeWidth={CORE_PX} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      {waypoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3.5 * S} fill={theme.water} stroke={theme.mark} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      ))}
      {segment && (
        <motion.g key={`seg-${selectedSegment}`} initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.24, ease: CHART_EASE }}>
          <path d={segment.d} fill="none" stroke={theme.ink0} strokeWidth={6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={segment.d} fill="none" stroke={theme.plan} strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <circle cx={segment.a[0]} cy={segment.a[1]} r={4 * S} fill={theme.water} stroke={theme.ink0} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <circle cx={segment.b[0]} cy={segment.b[1]} r={4 * S} fill={theme.water} stroke={theme.ink0} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </motion.g>
      )}
    </g>
  )
}
