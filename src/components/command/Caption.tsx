import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CHART_EASE } from '../chart/theme'
import { fmt } from '../../app/format'
import { activePlanAt, planEtaH, useStore } from '../../app/store'
import { regionName } from '../../engine/regions'
import { stateAt } from '../../engine/replay'
import { useTimelineEvents } from './useTimelineEvents'

/** One or two sentences describing the replay moment, written from computed state. */
export default function Caption() {
  const plans = useStore((s) => s.plans)
  // half-hour quantisation, snapped to the exact ETA once the clock has reached it so the arrival
  // caption is not floored away
  const tH = useStore((s) => {
    const eta = planEtaH(s.plans)
    return eta > 0 && s.timeline.tH >= eta ? eta : Math.floor(s.timeline.tH * 2) / 2
  })
  const playing = useStore((s) => s.timeline.playing)
  // shown while the world moves and for six seconds after a seek; `settledT` catches up with the
  // clock asynchronously so visibility never depends on wall time during render
  const [settledT, setSettledT] = useState(tH)
  useEffect(() => {
    const id = window.setTimeout(() => setSettledT(tH), 6000)
    return () => window.clearTimeout(id)
  }, [tH])
  const scenario = useStore((s) => s.scenario)
  const planCorridors = useStore((s) => s.planCorridors)
  const history = useStore((s) => s.replan.history)
  const units = useStore((s) => s.ui.units)
  const reduced = useStore((s) => s.ui.reducedMotion)
  const events = useTimelineEvents()
  const active = activePlanAt(plans, tH)
  const text = useMemo(() => {
    if (!active) return null
    const st = stateAt(active, tH, scenario.ocean, { truth: true })
    const corridor = planCorridors[active.evaluation.decision.corridorId]
    const passed = events.filter((e) => e.tH <= tH && e.tH > tH - 6 && (e.kind === 'waypoint' || e.kind === 'departure' || e.kind === 'zone'))
    const lastEv = passed[passed.length - 1]
    const recent = history.find((h) => tH >= h.atH && tH < h.atH + 8)
    const region = regionName(st.position)
    if (st.finished) {
      return { kicker: 'Arrived', body: `Pilot station reached. ${fmt.num(st.fuelUsedT, 0)} t of fuel and ${fmt.num(st.co2UsedT, 0)} t CO₂e over ${fmt.dist(st.distanceDoneNm, units)}.` }
    }
    const wind = `wind ${Math.round(st.env.windKn)} kn from ${fmt.deg(st.env.windFromDeg)}`
    const sea = `Hs ${st.env.hsM.toFixed(1)} m`
    const assist = st.segment ? `${st.segment.currentAssistKn >= 0 ? '+' : '−'}${Math.abs(st.segment.currentAssistKn).toFixed(1)} kn current` : ''
    const phase = st.env.stormWindKn > 18 ? `Inside the storm wind field (${Math.round(st.env.stormWindKn)} kn), ${region}` : lastEv ? lastEv.label : `Open sea, ${region}`
    let body: string
    if (recent) {
      const dDist = recent.newPlan.evaluation.totals.distanceNm - recent.ifContinued.totals.distanceNm
      const dTime = recent.newPlan.evaluation.totals.timeH - recent.ifContinued.totals.timeH
      const dFuel = recent.newPlan.evaluation.totals.fuelT - recent.ifContinued.totals.fuelT
      const sgn = (x: number, d: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`
      body = `Re-planned at T+${recent.atH.toFixed(0)} h after the forecast update: ${sgn(dDist, 0)} nm and ${sgn(dTime, 1)} h on the ${(planCorridors[recent.newPlan.evaluation.decision.corridorId]?.name ?? 'new corridor').toLowerCase()} for ${sgn(dFuel, 0)} t of fuel, taking peak risk from ${recent.ifContinued.totals.riskMax.toFixed(2)} to ${recent.newPlan.evaluation.totals.riskMax.toFixed(2)}. Now ${fmt.num(st.sogKn, 1)} kn over ground; ${wind}, ${sea}.`
    } else {
      body = `${phase}. Making ${fmt.num(st.sogKn, 1)} kn over ground on the ${(corridor?.name ?? 'planned corridor').toLowerCase()} at ${fmt.int(st.powerKw)} kW; ${wind}, ${sea}${assist ? `, ${assist}` : ''}.`
    }
    return { kicker: recent ? 'Rolling re-plan' : region, body }
  }, [active, tH, scenario, planCorridors, events, history, units])
  const recentReplan = history.some((h) => tH >= h.atH && tH < h.atH + 8)
  const finished = active ? stateAt(active, tH, scenario.ocean, { truth: true }).finished : false
  const visible = playing || recentReplan || finished || tH !== settledT
  const announce = recentReplan || finished ? text?.body ?? '' : ''
  return (
    <>
      <span className="sr-only" role="status">
        {announce}
      </span>
      <AnimatePresence initial={false}>
        {text && visible && (
          <motion.div
            key="caption"
            className="overlay caption on-k"
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: CHART_EASE }}
          >
            <div className="caption__kicker">{text.kicker}</div>
            <p className="narrative">{text.body}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
