import { useMemo } from 'react'
import { fmt } from '../../app/format'
import { startOptimizerRun, startReplan } from '../../app/runner'
import { activePlanAt, planEtaH, useStore } from '../../app/store'
import { stateAt, type TimelineEvent } from '../../engine/replay'
import { useTimelineEvents } from './useTimelineEvents'
import { Cell, Segmented } from '../ui/primitives'
import { SkipBack } from '@phosphor-icons/react'

const EVENT_COLOR: Record<TimelineEvent['kind'], string> = {
  departure: 'var(--ink1)',
  waypoint: 'var(--ink2)',
  forecast: 'var(--ink1)',
  replan: 'var(--ink1)',
  zone: 'var(--ink1)',
  arrival: 'var(--ink0)',
  hazard: 'var(--red)',
  info: 'var(--ink3)',
}

export default function Strip() {
  const plans = useStore((s) => s.plans)
  // 0.1 h quantisation matches the scrubber step and stops the strip re-rendering on every animation
  // frame; once the clock has reached the ETA the exact ETA is used so the arrived state is not
  // rounded away (the ticker parks the clock at the ETA, which is rarely a multiple of 0.1 h)
  const tH = useStore((s) => {
    const eta = planEtaH(s.plans)
    return eta > 0 && s.timeline.tH >= eta ? eta : Math.round(s.timeline.tH * 10) / 10
  })
  const playing = useStore((s) => s.timeline.playing)
  const speed = useStore((s) => s.ui.timelineSpeed)
  const setSpeed = useStore((s) => s.setSpeed)
  const setTime = useStore((s) => s.setTime)
  const setPlaying = useStore((s) => s.setPlaying)
  const units = useStore((s) => s.ui.units)
  const mission = useStore((s) => s.mission)
  const scenario = useStore((s) => s.scenario)
  const run = useStore((s) => s.run)
  const replan = useStore((s) => s.replan)
  const events = useTimelineEvents()
  const eta = planEtaH(plans)
  const active = activePlanAt(plans, tH)
  const state = useMemo(() => (active ? stateAt(active, tH, scenario.ocean, { truth: true }) : null), [active, tH, scenario.ocean])
  const hasPlan = plans.length > 0
  const pct = eta ? Math.min(100, (tH / eta) * 100) : 0
  const days = eta ? Math.ceil(eta / 24) : 0
  const riskTone = state ? (state.riskNow > 0.6 ? 'crit' : state.riskNow > 0.35 ? 'warn' : undefined) : undefined

  return (
    <section className="strip on-k" style={{ ['--cells' as string]: 6 }} aria-label="Replay controls and vital state">
      <div className="scrub">
        {hasPlan ? (
          <>
            <div className="scrub__ticks" aria-hidden="true">
              {Array.from({ length: days + 1 }, (_, d) => (
                <span key={d} className="scrub__tick" style={{ left: `${Math.min(100, ((d * 24) / eta) * 100)}%` }} />
              ))}
              {Array.from({ length: days + 1 }, (_, d) => (
                <span key={`d${d}`} className={`scrub__day ${d === 0 ? 'scrub__day--first' : d === days ? 'scrub__day--last' : ''}`} style={{ left: `${Math.min(100, ((d * 24) / eta) * 100)}%` }}>
                  {`D${d}`}
                </span>
              ))}
              <span className="scrub__fill" style={{ width: `${pct}%` }} />
            </div>
            {events.map((e, i) => (
              <button
                key={`${e.kind}-${i}`}
                type="button"
                className={`scrub__event scrub__event--${e.kind}`}
                style={{ left: `${Math.min(100, (e.tH / eta) * 100)}%`, ['--c' as string]: EVENT_COLOR[e.kind] }}
                title={`${e.label}, T+${e.tH.toFixed(1)} h${e.detail ? `. ${e.detail}` : ''}`}
                aria-label={`Seek to ${e.label} at T+${e.tH.toFixed(1)} hours`}
                onClick={() => setTime(e.tH)}
              />
            ))}
            <input type="range" className="scrub__input" min={0} max={eta || 1} step={0.1} value={Math.min(tH, eta)} onChange={(e) => setTime(Number(e.target.value))} aria-label="Replay time, hours since departure" aria-valuetext={`${tH.toFixed(1)} hours since departure`} />
          </>
        ) : run.status === 'running' && run.progress ? (
          <div className="scrub__ticks">
            <span className="scrub__fill" style={{ width: `${Math.round(run.progress.progress * 100)}%`, background: 'var(--sea)' }} />
          </div>
        ) : null}
      </div>
      <div className="strip__cells">
        <div className="strip__controls">
          {!hasPlan ? (
            <button key="run" type="button" className="btn btn--primary" onClick={startOptimizerRun} disabled={run.status === 'running'}>
              {run.status === 'running' ? `Optimising ${Math.round((run.progress?.progress ?? 0) * 100)}%` : 'Run optimisation'}
            </button>
          ) : (
            <>
              <button key="restart" type="button" className="btn btn--icon btn--outline" onClick={() => setTime(0)} aria-label="Restart replay" title="Restart">
                <SkipBack size={16} weight="fill" aria-hidden="true" />
              </button>
              <button type="button" className={`btn ${playing ? 'btn--outline' : 'btn--primary'}`} onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause replay' : 'Play replay'} disabled={!!state?.finished && !playing} style={{ minWidth: 96, height: 40 }}>
                {playing ? 'Pause' : state?.finished ? 'Arrived' : 'Play'}
              </button>
              <Segmented label="Replay speed (simulated hours per second)" value={speed} onChange={setSpeed} options={[{ value: 1, label: '1×' }, { value: 4, label: '4×' }, { value: 16, label: '16×' }]} />
              <button type="button" className="btn btn--outline" onClick={() => startReplan('manual')} disabled={replan.status === 'running' || !state || state.finished} title="Re-optimise the remaining voyage from the live position with the forecast known now">
                {replan.status === 'running' ? `Re-planning ${Math.round((replan.progress?.progress ?? 0) * 100)}%` : 'Re-plan'}
              </button>
            </>
          )}
        </div>
        <Cell label="Elapsed" value={hasPlan ? `T+${tH.toFixed(0)} h` : '···'} unit={hasPlan ? fmt.utcShort(Date.parse(mission.departure) + tH * 3600e3) : undefined} ghost={!hasPlan} />
        <Cell label="SOG" value={state ? fmt.num(state.sogKn, 1) : '···'} unit={fmt.speedUnit(units)} ghost={!state} />
        <Cell label="Fuel used" value={state ? fmt.num(state.fuelUsedT, 0) : '···'} unit="t" ghost={!state} />
        <Cell label="CO₂e WtW" value={state ? fmt.num(state.co2UsedT, 0) : '···'} unit="t" ghost={!state} />
        <Cell label="Risk index, 0 to 1" value={state ? state.riskNow.toFixed(2) : '···'} unit={riskTone === 'crit' ? 'critical' : riskTone === 'warn' ? 'elevated' : state ? 'nominal' : undefined} tone={riskTone} ghost={!state} title="Combined sea-state, wind, storm-proximity, under-keel and traffic risk for the current segment; above 0.35 is elevated, above 0.60 critical" />
        <Cell label="To arrival" value={hasPlan ? fmt.hours(Math.max(0, eta - tH)) : '···'} unit={hasPlan ? `ETA ${fmt.utcShort(Date.parse(mission.departure) + eta * 3600e3)}` : undefined} ghost={!hasPlan} title={state ? `${fmt.dist(state.remainingNm, units)} remaining` : undefined} />
      </div>
    </section>
  )
}
