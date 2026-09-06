/**
 * Drives the optimiser generator on the main thread in time slices so the UI stays
 * responsive, and orchestrates rolling re-plans from the live replay position.
 */
import { FLEET } from '../data/fleet'
import { PORTS } from '../data/ports'
import { approachFor } from '../engine/corridors'
import { evaluateDecision } from '../engine/evaluate'
import { forecastFor } from '../engine/ocean'
import { runOptimizer, type OptimizerProblem } from '../engine/optimizer'
import { stateAt, type ActivePlan } from '../engine/replay'
import { explainReplan } from '../engine/narrative'
import type { Corridor, OptimizerRunResult, ProgressEvent, StartState } from '../engine/types'
import { polylineLengthNm } from '../engine/geo'
import { activePlanAt, useStore, type AppState } from './store'

let runToken = 0
/** minimum wall time per yielded generation so progress is legible (display pacing, reported separately) */
const PACE_MS = 55

/** Scheduler that is not subject to timer clamping/background throttling for zero-delay steps. */
const channel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null
const pending: (() => void)[] = []
if (channel) {
  channel.port1.onmessage = () => {
    const fn = pending.shift()
    if (fn) fn()
  }
}
function schedule(fn: () => void, delayMs: number) {
  const visible = typeof document === 'undefined' || document.visibilityState === 'visible'
  if (delayMs > 0 && visible) {
    setTimeout(fn, delayMs)
    return
  }
  if (channel) {
    pending.push(fn)
    channel.port2.postMessage(null)
  } else setTimeout(fn, 0)
}

export function buildProblem(s: AppState, over: Partial<OptimizerProblem> = {}): OptimizerProblem {
  const sc = s.scenario
  return {
    vessels: FLEET,
    ports: PORTS,
    mission: s.mission,
    ocean: sc.ocean,
    settings: s.engine,
    start: { position: PORTS[s.mission.originId].position, tH: 0, fuelUsedT: 0, co2UsedT: 0, costUsedUsd: 0, distanceDoneNm: 0 },
    planningTimeH: 0,
    approach: approachFor(PORTS[s.mission.originId], PORTS[s.mission.destinationId]),
    ...over,
  }
}

interface DriveHandlers {
  onProgress: (ev: ProgressEvent) => void
  onDone: (r: OptimizerRunResult, computeMs: number, wallMs: number) => void
  onError: (e: unknown) => void
}

function drive(problem: OptimizerProblem, h: DriveHandlers, token: number) {
  const gen = runOptimizer(problem)
  const wall0 = performance.now()
  let computeMs = 0
  const step = () => {
    if (token !== runToken) return
    const t0 = performance.now()
    try {
      for (;;) {
        const n = gen.next()
        if (n.done) {
          computeMs += performance.now() - t0
          h.onDone(n.value, computeMs, performance.now() - wall0)
          return
        }
        h.onProgress(n.value)
        if (n.value.phase === 'search' || n.value.phase === 'cvar' || performance.now() - t0 > 12) break
      }
    } catch (e) {
      h.onError(e)
      return
    }
    const spent = performance.now() - t0
    computeMs += spent
    schedule(step, Math.max(0, PACE_MS - spent))
  }
  schedule(step, 0)
}

const emptyRunState = (): AppState['run'] => ({ status: 'idle', progress: null, log: [], result: null, error: null, computeMs: 0, wallMs: 0 })

export function startOptimizerRun() {
  const s = useStore.getState()
  if (s.run.status === 'running') return
  if (s.mission.originId === s.mission.destinationId) {
    useStore.setState({ run: { ...emptyRunState(), status: 'error', error: `Origin and destination are both ${PORTS[s.mission.originId]?.name ?? s.mission.originId}; choose two different ports in Routes.` } })
    return
  }
  const token = ++runToken
  useStore.setState({ run: { status: 'running', progress: null, log: [], result: null, error: null, computeMs: 0, wallMs: 0 }, plans: [], selectedSolutionId: null, replan: { status: 'idle', progress: null, history: [], error: null, resumeAfter: false }, timeline: { tH: 0, playing: false } })
  drive(buildProblem(s), {
    onProgress: (ev) => useStore.setState((st) => ({ run: { ...st.run, progress: ev, log: [...st.run.log.slice(-60), `${(ev.elapsedMs / 1000).toFixed(1)}s  ${ev.message}`] } })),
    onDone: (result, computeMs, wallMs) => {
      const balanced = result.named[0] ?? result.archive[0]
      useStore.setState((st) => ({
        run: { ...st.run, status: 'done', result, computeMs, wallMs },
        selectedSolutionId: balanced?.id ?? null,
        plans: balanced ? [{ evaluation: balanced, fromH: 0, carried: { fuelT: 0, co2T: 0, distanceNm: 0 } }] : [],
        planCorridors: Object.fromEntries(result.corridors.map((c) => [c.id, c])),
        selectedVesselId: balanced?.decision.vesselId ?? st.selectedVesselId,
        timeline: { tH: 0, playing: false },
      }))
    },
    onError: (e) => useStore.setState((st) => ({ run: { ...st.run, status: 'error', error: e instanceof Error ? e.message : String(e) } })),
  }, token)
}

/** Truncate a corridor so it starts at the vessel's live position. */
export function truncateCorridor(c: Corridor, plan: ActivePlan, tH: number): Corridor {
  const st = stateAt(plan, tH, useStore.getState().scenario.ocean, { truth: true })
  const legIndex = st.segment?.legIndex ?? 0
  const waypoints = [st.position, ...c.waypoints.slice(legIndex + 1)]
  return { ...c, id: `${c.id}-from-${Math.round(tH)}`, waypoints, distanceNm: polylineLengthNm(waypoints), generatedAtH: tH }
}

export function startReplan(reason: 'auto' | 'manual', resumeAfter?: boolean) {
  const s = useStore.getState()
  if (s.replan.status === 'running' || !s.run.result || !s.plans.length) return
  const sc = s.scenario
  const tH = s.timeline.tH
  const active = activePlanAt(s.plans, tH)
  if (!active) return
  const live = stateAt(active, tH, sc.ocean, { truth: true })
  if (live.finished) return
  const token = ++runToken
  const wasPlaying = resumeAfter ?? s.timeline.playing
  useStore.setState({ replan: { ...s.replan, status: 'running', progress: null, error: null, resumeAfter: wasPlaying }, timeline: { tH, playing: false } })
  const start: StartState = { position: live.position, tH, fuelUsedT: live.fuelUsedT, co2UsedT: live.co2UsedT, costUsedUsd: 0, distanceDoneNm: live.distanceDoneNm }
  const n = s.replan.history.length + 1
  const problem = buildProblem(s, {
    start,
    planningTimeH: tH,
    fixed: { vesselId: active.evaluation.decision.vesselId, fuelId: active.evaluation.decision.fuelId },
    idPrefix: `rp${n}`,
    iterations: Math.max(10, Math.round(s.engine.iterations * 0.5)),
  })
  drive(problem, {
    onProgress: (ev) => useStore.setState((st) => ({ replan: { ...st.replan, progress: ev } })),
    onDone: (result) => {
      const st = useStore.getState()
      const chosen = result.named[0] ?? result.archive[0]
      if (!chosen) {
        // say why: the top violation across the search explains the empty archive
        const top = result.violationTally[0]
        // the tally counts one hit per violating segment, so it can exceed the number of evaluations
        const why = top ? `: ${top.reason.charAt(0).toLowerCase()}${top.reason.slice(1)} (${top.count.toLocaleString()} segment violations across ${result.evaluations.toLocaleString()} evaluations). The current plan continues; re-plan again later or widen the safety limits in Settings.` : '.'
        useStore.setState({ replan: { ...st.replan, status: 'error', error: `Re-plan found no feasible solution from the live position${why}` } })
        return
      }
      // what happens if we do not re-plan: old corridor from the live position under the new forecast
      const oldCorridor = st.planCorridors[active.evaluation.decision.corridorId]
      const trunc = truncateCorridor(oldCorridor, active, tH)
      const ifContinued = evaluateDecision(
        { ...active.evaluation.decision, corridorId: trunc.id },
        { vessels: Object.fromEntries(FLEET.map((v) => [v.id, v])), corridors: { [trunc.id]: trunc }, ports: PORTS, mission: st.mission, ocean: sc.ocean, oceanOpts: { planningTimeH: tH }, settings: st.engine, start },
      )
      const newPlan: ActivePlan = { evaluation: chosen, fromH: tH, carried: { fuelT: live.fuelUsedT, co2T: live.co2UsedT, distanceNm: live.distanceDoneNm } }
      const forecast = forecastFor(sc.ocean, tH)
      const newCorridor = result.corridors.find((c) => c.id === chosen.decision.corridorId) ?? result.corridors[0]
      const explanation = explainReplan({
        tH,
        forecastLabel: forecast ? forecast.label : reason === 'auto' ? 'Scheduled forecast refresh' : 'Manual re-plan requested from the console',
        ifContinued,
        newPlan: chosen,
        oldCorridor,
        newCorridor,
        alpha: st.engine.cvarAlpha,
      })
      const record = { atH: tH, oldPlan: active, newPlan, ifContinued, explanation, forecastLabel: forecast?.label ?? 'Forecast refresh', fadeStartMs: performance.now(), result }
      useStore.setState({
        replan: { status: 'done', progress: null, history: [...st.replan.history, record], error: null, resumeAfter: false },
        plans: [...st.plans, newPlan],
        planCorridors: { ...st.planCorridors, ...Object.fromEntries(result.corridors.map((c) => [c.id, c])) },
        timeline: { tH, playing: st.replan.resumeAfter },
      })
    },
    onError: (e) => useStore.setState((st) => ({ replan: { ...st.replan, status: 'error', error: e instanceof Error ? e.message : String(e) } })),
  }, token)
}
