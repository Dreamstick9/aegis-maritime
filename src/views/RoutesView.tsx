import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { fmt } from '../app/format'
import { startOptimizerRun } from '../app/runner'
import { useStore } from '../app/store'
import { ViewHead } from '../components/shell/Shell'
import { Disclosure, ErrorText, Field, Mark, NoFeasiblePlan, Rows, Section, Segmented, Select, Slider, Working } from '../components/ui/primitives'
import { FLEET } from '../data/fleet'
import { PORTS, PORT_LIST } from '../data/ports'
import { approachFor } from '../engine/corridors'
import { STORES_T } from '../engine/evaluate'
import { FUELS, FUEL_IDS, fuelIntensity, priceUsdPerGJ } from '../engine/fuels'
import { haversineNm } from '../engine/geo'
import { CORRIDOR_KINDS, candidateVessels } from '../engine/optimizer'
import { loadingCondition } from '../engine/vessel'
import type { FuelId, Mission } from '../engine/types'

const toLocal = (iso: string) => iso.slice(0, 16)
const fromLocal = (v: string) => (v ? `${v}:00Z` : '')
const WEIGHTS: { key: keyof Mission['weights']; label: string }[] = [
  { key: 'fuel', label: 'Fuel' },
  { key: 'cost', label: 'Cost' },
  { key: 'emissions', label: 'Well-to-wake emissions' },
  { key: 'risk', label: 'Weather risk' },
  { key: 'time', label: 'Passage time' },
]

export default function RoutesView() {
  const mission = useStore((s) => s.mission)
  const update = useStore((s) => s.updateMission)
  const engine = useStore((s) => s.engine)
  const run = useStore((s) => s.run)
  const units = useStore((s) => s.ui.units)
  const scenario = useStore((s) => s.scenario)
  const voyageSeed = useStore((s) => s.voyageSeed)
  const newVoyage = useStore((s) => s.newVoyage)
  const navigate = useNavigate()
  const origin = PORTS[mission.originId]
  const dest = PORTS[mission.destinationId]
  const windowH = (Date.parse(mission.arrivalLatest) - Date.parse(mission.departure)) / 3600e3
  // reference distance: the last run's baseline corridor when it was searched for these two ports,
  // otherwise the great circle plus 15% for coasting and pilotage
  const refNm = useMemo(() => {
    const r = run.result
    if (r) {
      const c = r.corridors.find((x) => x.id === r.baseline.decision.corridorId)
      const last = c?.waypoints[c.waypoints.length - 1]
      if (c && last && haversineNm(r.startState.position, origin.position) < 30 && haversineNm(last, dest.position) < 60) return r.baseline.totals.distanceNm
    }
    return haversineNm(origin.position, dest.position) * 1.15
  }, [run.result, origin, dest])
  const portOptions = (exclude: string) => PORT_LIST.map((p) => ({ value: p.id, label: `${p.name} (${p.unlocode})`, disabled: p.id === exclude }))
  const minAvg = refNm / Math.max(1, windowH)
  const cands = useMemo(
    () => candidateVessels({ vessels: FLEET, ports: PORTS, mission, ocean: scenario.ocean, settings: engine, start: { position: origin.position, tH: 0, fuelUsedT: 0, co2UsedT: 0, costUsedUsd: 0, distanceDoneNm: 0 }, planningTimeH: 0, approach: approachFor(origin, dest) }),
    [mission, scenario, engine, origin, dest],
  )
  const weightSum = WEIGHTS.reduce((a, w) => a + mission.weights[w.key], 0) || 1
  const windowError = Number.isNaN(windowH) ? 'Enter valid dates' : windowH <= 0 ? 'Latest arrival must be after departure' : undefined
  const toggleFuel = (f: FuelId) => {
    const has = mission.allowedFuels.includes(f)
    const next = has ? mission.allowedFuels.filter((x) => x !== f) : [...mission.allowedFuels, f]
    if (next.length) update({ allowedFuels: next })
  }
  const feasibleFuels = mission.allowedFuels.filter((f) => cands.usable.some((v) => v.fuels.includes(f)))

  return (
    <div className="view">
      <div className="view__inner">
        <ViewHead title="Mission builder" sub={`${origin.name} to ${dest.name}. Draw the registration, then run once.`} />
        <div className="registration" style={{ marginTop: 8 }}>
          <div>
            <Section title="Voyage" id="voyage">
              <div className="cols cols--2" style={{ gap: 24 }}>
                <Select label="Origin" value={mission.originId} options={portOptions(mission.destinationId)} onChange={(v) => update({ originId: v })} hint={`${PORT_LIST.length} ports in the network; A* searches corridors between any two of them`} />
                <Select label="Destination" value={mission.destinationId} options={portOptions(mission.originId)} onChange={(v) => update({ destinationId: v })} hint={`Voyage seed ${voyageSeed}, ${scenario.name}`} />
              </div>
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn--outline btn--sm" onClick={() => newVoyage()} title="Draw a new random voyage: ports, cargo, dates and season under the current pack">
                  New voyage
                </button>
                <span className="small muted">Random ports, cargo, dates and season; the same seed rebuilds the same voyage (reproduce it in Settings).</span>
              </div>
              <div style={{ marginTop: 16 }}>
                <Slider label="Cargo" value={mission.cargoT} min={20000} max={200000} step={1000} onChange={(v) => update({ cargoT: v })} format={(v) => `${fmt.int(v)} t ${mission.cargoType.toLowerCase()}`} hint="Capacity, sailing draught and hold volume are checked for every hull" />
              </div>
              <div className="cols cols--3" style={{ gap: 24, marginTop: 16 }}>
                <Field label="Departure, UTC" error={windowError}>
                  <input type="datetime-local" value={toLocal(mission.departure)} onChange={(e) => update({ departure: fromLocal(e.target.value) })} />
                </Field>
                <Field label="Arrival window opens">
                  <input type="datetime-local" value={toLocal(mission.arrivalEarliest)} onChange={(e) => update({ arrivalEarliest: fromLocal(e.target.value) })} />
                </Field>
                <Field label="Latest arrival">
                  <input type="datetime-local" value={toLocal(mission.arrivalLatest)} onChange={(e) => update({ arrivalLatest: fromLocal(e.target.value) })} />
                </Field>
              </div>
              <p className={`small ${minAvg > 14 ? 'risk-crit' : minAvg > 12.5 ? 'risk-warn' : 'muted'}`} style={{ marginTop: 10 }}>
                {Number.isFinite(minAvg) && minAvg > 0 ? `Window of ${fmt.hours(windowH)} over a ${fmt.dist(refNm, units)} reference distance needs at least ${fmt.speed(minAvg, units)} on average: ${minAvg > 14 ? 'too tight for a laden bulk carrier' : minAvg > 12.5 ? 'little room for slow steaming' : 'room to optimise speed'}.` : ' '}
              </p>
            </Section>

            <Section title="Hull" note="the engine chooses among drawn hulls; blocked hulls cannot carry the cargo" id="hulls">
              <div className="stops">
                <button type="button" className="stop" aria-pressed={mission.vesselId === 'auto'} onClick={() => update({ vesselId: 'auto' })}>
                  Engine decides
                </button>
                {FLEET.map((v) => {
                  const ex = cands.excluded.find((x) => x.vessel.id === v.id)
                  const lc = loadingCondition(v, mission.cargoT, 1800 + STORES_T)
                  return (
                    <button key={v.id} type="button" className={`stop ${ex ? 'stop--blocked' : ''}`} aria-pressed={mission.vesselId === v.id} disabled={!!ex} onClick={() => update({ vesselId: v.id })} title={ex ? ex.reason : `${v.class}, sailing draught ${lc.sailingDraftM.toFixed(2)} m`}>
                      {v.name}
                      <span className="num">{ex ? 'blocked' : `${lc.sailingDraftM.toFixed(1)} m`}</span>
                    </button>
                  )
                })}
              </div>
            </Section>

            <Section title="Fuels in scope" note="price per energy and lifecycle intensity, not price per tonne" id="fuels">
              <div className="stops">
                {FUEL_IDS.map((fid) => {
                  const f = FUELS[fid]
                  const on = mission.allowedFuels.includes(fid)
                  const compatible = cands.usable.some((v) => v.fuels.includes(fid))
                  return (
                    <button key={fid} type="button" className={`stop stop--multi ${!compatible && on ? 'stop--blocked' : ''}`} aria-pressed={on} onClick={() => toggleFuel(fid)} title={`${f.name}. ${f.notes}`}>
                      {f.short}
                      <span className="num">
                        {priceUsdPerGJ(f).toFixed(1)} $/GJ, {fuelIntensity(f, engine.accounting).toFixed(0)} g/MJ
                      </span>
                    </button>
                  )
                })}
              </div>
              {feasibleFuels.length < mission.allowedFuels.length && <p className="small muted" style={{ marginTop: 10 }}>Dashed fuels are drawn but no candidate hull can burn them; the engine will ignore them and say so.</p>}
            </Section>

            <Section title="Priorities, safety and shore power" note="secondary settings; defaults come from the scenario pack" id="priorities">
              <Disclosure summary="Priority weights" count={`fuel ${Math.round((mission.weights.fuel / weightSum) * 100)}, cost ${Math.round((mission.weights.cost / weightSum) * 100)}, emissions ${Math.round((mission.weights.emissions / weightSum) * 100)}, risk ${Math.round((mission.weights.risk / weightSum) * 100)}, time ${Math.round((mission.weights.time / weightSum) * 100)}`}>
                <div className="cols cols--2" style={{ gap: '10px 32px' }}>
                  {WEIGHTS.map((w) => (
                    <Slider key={w.key} label={w.label} value={mission.weights[w.key]} min={0} max={1} step={0.05} onChange={(v) => update({ weights: { ...mission.weights, [w.key]: v } })} format={(v) => `${Math.round((v / weightSum) * 100)}%`} />
                  ))}
                </div>
                <p className="small muted" style={{ marginTop: 8 }}>Weights steer guide selection in the hybrid search and pick the Balanced plan; the archive itself stays multi-objective.</p>
              </Disclosure>
              <Disclosure summary="Safety profile and shore power" count={`${mission.safetyProfile}, shore power ${mission.shorePower === 'auto' ? 'engine decides' : mission.shorePower}`}>
                <div className="cols cols--2" style={{ gap: 24 }}>
                  <Field label="Safety profile" hint="scales sea-state and wind limits used as hard constraints and in the risk index" group>
                    <Segmented label="Safety profile" value={mission.safetyProfile} onChange={(v) => update({ safetyProfile: v })} options={[{ value: 'cautious', label: 'Cautious ×0.85' }, { value: 'standard', label: 'Standard' }, { value: 'assertive', label: 'Assertive ×1.12' }]} />
                  </Field>
                  <Field label={`Shore power at ${dest.name}`} group>
                    <Segmented label="Shore power" value={mission.shorePower} onChange={(v) => update({ shorePower: v })} options={[{ value: 'auto', label: 'Engine decides' }, { value: 'require', label: 'Require' }, { value: 'never', label: 'Never' }]} />
                  </Field>
                </div>
              </Disclosure>
            </Section>
          </div>

          <aside className="consequence" aria-label="What will run">
            <Section title="Registration" note="what the next run will search" id="consequence">
              <div className="stats" style={{ marginBottom: 14 }}>
                <div className="stat">
                  <span className="label">Hulls</span>
                  <span className={`numeral ${cands.usable.length ? '' : 'risk-crit'}`}>{cands.usable.length}</span>
                </div>
                <div className="stat">
                  <span className="label">Fuels</span>
                  <span className="numeral">{feasibleFuels.length}</span>
                </div>
                <div className="stat">
                  <span className="label">Corridors</span>
                  <span className="numeral">{CORRIDOR_KINDS.length}</span>
                </div>
                <div className="stat">
                  <span className="label">Weather members</span>
                  <span className="numeral">{engine.weatherScenarios + 1}</span>
                </div>
              </div>
              <Rows
                sans
                items={[
                  ['Mode', `${engine.mode}, population ${engine.population}, ${engine.iterations} generations`],
                  ['Risk measure', engine.useCvar ? `CVaR at ${Math.round(engine.cvarAlpha * 100)}%` : 'nominal weather only'],
                  ['Accounting', engine.accounting === 'WtW' ? 'well-to-wake' : 'tank-to-wake'],
                  ['Seed', String(engine.seed)],
                  ['Excluded', cands.excluded.length ? cands.excluded.map((x) => `${x.vessel.name}: ${x.reason}`).join('; ') : 'none'],
                ]}
              />
              <div style={{ marginTop: 18 }}>
                <button type="button" className="btn btn--primary" onClick={startOptimizerRun} disabled={run.status === 'running' || !cands.usable.length || !!windowError}>
                  {run.status === 'running' ? 'Optimising…' : run.result ? 'Run again' : 'Run optimisation'}
                </button>
              </div>
              {run.status === 'running' && run.progress && (
                <div style={{ marginTop: 16 }}>
                  <Working value={run.progress.progress} message={`${run.progress.phase}, generation ${run.progress.generation}, ${run.progress.evaluations.toLocaleString()} evaluations, archive ${run.progress.archiveSize}`} />
                </div>
              )}
              {run.status === 'error' && (
                <div style={{ marginTop: 16 }}>
                  <ErrorText>{run.error}</ErrorText>
                </div>
              )}
              {run.status === 'done' && run.result && run.result.archive.length > 0 && (
                <p className="narrative" style={{ fontSize: 14, marginTop: 16 }}>
                  {run.result.archive.length} non-dominated plans from {run.result.evaluations.toLocaleString()} evaluations in {(run.computeMs / 1000).toFixed(2)} s of compute.{' '}
                  <a href="#/results" onClick={(e) => { e.preventDefault(); navigate('/results') }}>Compare them</a> or <a href="#/" onClick={(e) => { e.preventDefault(); navigate('/') }}>replay on the chart</a>.
                </p>
              )}
              {run.status === 'done' && run.result && run.result.archive.length === 0 && (
                <div style={{ marginTop: 16 }}>
                  <NoFeasiblePlan tally={run.result.violationTally} evaluations={run.result.evaluations} excluded={run.result.excluded.map((x) => ({ name: FLEET.find((v) => v.id === x.vesselId)?.name ?? x.vesselId, reason: x.reason }))} />
                </div>
              )}
              <div className="log" style={{ marginTop: 14 }} role="log" aria-label="Engine log">
                {run.log.length ? run.log.slice(-8).map((l, i) => <div key={i}>{l}</div>) : <div>Pipeline: digital-ocean grid, A* corridors, baseline and classical references, QEA / QPSO hybrid search, CVaR ensemble, Pareto archive. All client-side, deterministic by seed.</div>}
              </div>
              <p className="small muted" style={{ marginTop: 12 }}>
                <Mark kind="scenario" /> prices, congestion, tariffs; <Mark kind="synthetic">synthetic ocean</Mark>
              </p>
            </Section>
          </aside>
        </div>
      </div>
    </div>
  )
}
