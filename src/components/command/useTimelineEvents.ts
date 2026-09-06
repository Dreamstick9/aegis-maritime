import { useMemo } from 'react'
import { useStore } from '../../app/store'
import { planEvents, type ActivePlan, type Landmark, type TimelineEvent } from '../../engine/replay'

/**
 * planEvents(plan, landmarks?) is the phase 2 contract (the optional landmarks parameter is added by
 * the replay owner); the cast keeps this call valid on both sides of that change.
 */
const planEventsFor = planEvents as (plan: ActivePlan, landmarks?: Landmark[]) => TimelineEvent[]

export function useTimelineEvents(): TimelineEvent[] {
  const plans = useStore((s) => s.plans)
  const scenario = useStore((s) => s.scenario)
  const history = useStore((s) => s.replan.history)
  return useMemo(() => {
    if (!plans.length) return []
    const evs: TimelineEvent[] = [{ tH: 0, kind: 'departure', label: 'Departure, pilot away' }]
    for (const f of scenario.ocean.storm?.forecasts ?? []) if (f.issuedAtH > 0) evs.push({ tH: f.issuedAtH, kind: 'forecast', label: 'Forecast update', detail: f.label })
    for (const h of history) evs.push({ tH: h.atH, kind: 'replan', label: 'Rolling re-plan', detail: h.forecastLabel })
    plans.forEach((p, i) => {
      const until = plans[i + 1]?.fromH ?? Infinity
      for (const e of planEventsFor(p, scenario.landmarks)) if (e.tH >= p.fromH - 1e-6 && e.tH <= until) evs.push(e)
    })
    return evs.sort((a, b) => a.tH - b.tH)
  }, [plans, scenario, history])
}

