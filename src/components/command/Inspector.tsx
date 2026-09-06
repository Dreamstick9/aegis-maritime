import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { fmt } from '../../app/format'
import { startOptimizerRun } from '../../app/runner'
import { activePlanAt, useStore, voyageTitle } from '../../app/store'
import { FLEET_BY_ID } from '../../data/fleet'
import { PORTS } from '../../data/ports'
import { FUELS } from '../../engine/fuels'
import { oneLine, whySelected } from '../../engine/narrative'
import type { Solution } from '../../engine/types'
import { Disclosure, ErrorText, Mark, Narrative, NoFeasiblePlan, Rows, Working } from '../ui/primitives'
import { X } from '@phosphor-icons/react'

function Delta({ a, b }: { a: number; b: number }) {
  const p = b ? ((a - b) / b) * 100 : 0
  return (
    <span className="small muted num">
      {Math.abs(p).toFixed(1)}% {p >= 0 ? 'above' : 'below'} baseline
    </span>
  )
}

export default function Inspector({ onClose }: { onClose: () => void }) {
  const run = useStore((s) => s.run)
  const mission = useStore((s) => s.mission)
  const engine = useStore((s) => s.engine)
  const scenario = useStore((s) => s.scenario)
  const voyageSeed = useStore((s) => s.voyageSeed)
  const newVoyage = useStore((s) => s.newVoyage)
  const selectedId = useStore((s) => s.selectedSolutionId)
  const selectSolution = useStore((s) => s.selectSolution)
  const plans = useStore((s) => s.plans)
  const replan = useStore((s) => s.replan)
  const tH = useStore((s) => Math.floor(s.timeline.tH))
  // exact-time lookup of the active plan (a primitive selector, so the panel re-renders only when the plan changes)
  const activeFromH = useStore((s) => activePlanAt(s.plans, s.timeline.tH)?.fromH ?? -1)
  const navigate = useNavigate()
  const origin = PORTS[mission.originId]
  const dest = PORTS[mission.destinationId]
  /** port limits are sourced only where the port carries a sourced fact; generated ports carry scenario values */
  const limitsSourced = [origin, dest].some((p) => p?.facts.some((f) => f.provenance === 'sourced'))
  const r = run.result
  const sel = r?.archive.find((s) => s.id === selectedId) ?? null
  const active = plans.find((p) => p.fromH === activeFromH) ?? activePlanAt(plans, tH)
  const nctx = useMemo(() => (r ? { baseline: r.baseline, classical: r.classical, corridors: Object.fromEntries(r.corridors.map((c) => [c.id, c])), vessels: FLEET_BY_ID, mission, accounting: engine.accounting } : null), [r, mission, engine.accounting])
  const planCorridors = useStore((s) => s.planCorridors)
  const why = useMemo(() => (nctx && sel ? whySelected(sel, nctx) : []), [nctx, sel])
  const line = useMemo(() => (nctx && sel ? oneLine(sel, nctx) : ''), [nctx, sel])
  /** the plan being sailed now (differs from `sel` after a rolling re-plan) */
  const sailing = useMemo<Solution | null>(() => {
    if (!active || active.fromH === 0) return null
    return { ...active.evaluation, id: `active-${active.fromH}`, labels: sel?.labels ?? [], cvar: undefined }
  }, [active, sel])
  const sailingLine = useMemo(() => {
    if (!sailing || !active || !r) return ''
    const corridor = planCorridors[sailing.decision.corridorId]?.name.toLowerCase() ?? 'new corridor'
    const sp = sailing.decision.legSpeedsKn
    const fuelToArrival = active.carried.fuelT + sailing.totals.fuelT
    const dFuel = ((fuelToArrival - r.baseline.totals.fuelT) / r.baseline.totals.fuelT) * 100
    return `Since T+${active.fromH.toFixed(0)} h the vessel sails the ${corridor} at ${Math.min(...sp).toFixed(1)} to ${Math.max(...sp).toFixed(1)} kn; fuel to arrival ${fmt.num(fuelToArrival, 0)} t (${Math.abs(dFuel).toFixed(1)}% ${dFuel >= 0 ? 'higher' : 'lower'} than the baseline voyage), ETA ${fmt.utcShort(sailing.totals.arrivalIso)}.`
  }, [sailing, active, r, planCorridors])
  const watch = useMemo(() => {
    if (!active) return []
    const out: { t: number; text: string; sev: 'ok' | 'warn' | 'crit' }[] = []
    const seen = new Set<string>()
    const now = active.evaluation.segments.find((s) => s.tStartH <= tH && s.tEndH > tH)
    if (now && now.risk > 0.35) {
      out.push({ t: now.tStartH, text: `Risk ${now.risk.toFixed(2)} ${now.risk > 0.6 ? 'critical' : 'elevated'}: Hs ${now.hsM.toFixed(1)} m, wind ${now.windKn.toFixed(0)} kn, ${now.hazards[0] ?? 'sea-state and wind terms'}`, sev: now.risk > 0.6 ? 'crit' : 'warn' })
      seen.add('risk')
    }
    for (const s of active.evaluation.segments) {
      if (s.tEndH < tH || s.tStartH > tH + 48) continue
      for (const h of s.hazards) {
        const key = h.split(' ').slice(0, 2).join(' ')
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ t: s.tStartH, text: h, sev: h.includes('exceeds') || h.includes('Restricted') ? 'crit' : h.includes('Storm') || h.includes('Heavy') ? 'warn' : 'ok' })
      }
    }
    return out.slice(0, 4)
  }, [active, tH])
  const last = replan.history[replan.history.length - 1]
  const w = mission.weights
  const worstSev = watch.some((x) => x.sev === 'crit') ? 'crit' : watch.some((x) => x.sev === 'warn') ? 'warn' : undefined
  // Lead numerals describe the ACTIVE plan: after a rolling re-plan the consumed part of the
  // superseded plan is carried into the totals so the panel and the strip agree.
  const lead = useMemo(() => {
    if (!sel) return null
    if (!active || active.fromH === 0) {
      return { fuelT: sel.totals.fuelT, co2: sel.objectives[2], costUsd: sel.totals.costUsd, timeH: sel.totals.timeH, avgKn: sel.totals.avgSpeedKn, arrivalIso: sel.totals.arrivalIso, replanned: false }
    }
    const e = active.evaluation
    const first = plans[0]?.evaluation ?? sel
    const elapsedH = active.fromH
    const fuelBefore = active.carried.fuelT
    const fuelCostBefore = first.totals.fuelT ? first.totals.fuelCostUsd * (fuelBefore / first.totals.fuelT) : 0
    const hireBefore = (elapsedH / 24) * FLEET_BY_ID[e.decision.vesselId].hireUsdPerDay
    const co2Before = engine.accounting === 'WtW' ? active.carried.co2T : active.carried.co2T * (first.totals.co2TtwT / Math.max(1e-6, first.totals.co2WtwT))
    return {
      fuelT: fuelBefore + e.totals.fuelT,
      co2: co2Before + e.objectives[2],
      costUsd: fuelCostBefore + hireBefore + e.totals.costUsd,
      timeH: elapsedH + e.totals.timeH,
      avgKn: (active.carried.distanceNm + e.totals.distanceNm) / Math.max(1e-6, elapsedH + e.totals.timeH),
      arrivalIso: e.totals.arrivalIso,
      replanned: true,
    }
  }, [sel, active, plans, engine.accounting])

  return (
    <aside className="inspector" aria-label="Mission inspector">
      <div className="inspector__head">
        <h2 className="inspector__title">
          {sel ? sel.labels.join(', ') || 'Archive plan' : voyageTitle(scenario.id, mission)}
          <small>{sel ? voyageTitle(scenario.id, mission) : `${origin?.name ?? mission.originId} to ${dest?.name ?? mission.destinationId}, ${fmt.int(mission.cargoT)} t ${mission.cargoType.toLowerCase()}`}</small>
        </h2>
        <button type="button" className="btn btn--icon btn--sm" onClick={onClose} aria-label="Close mission panel" title="Close (Esc)">
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {run.status === 'running' && run.progress && (
        <div className="inspector__section">
          <Working value={run.progress.progress} message={run.progress.message} />
        </div>
      )}

      {run.status === 'error' && (
        <div className="inspector__section">
          <ErrorText>{run.error}</ErrorText>
          <button type="button" className="btn btn--outline" style={{ marginTop: 10 }} onClick={startOptimizerRun}>
            Retry
          </button>
        </div>
      )}

      {!r && run.status !== 'running' && run.status !== 'error' && (
        <>
          <p className="inspector__one">{scenario.tagline}. Run the optimiser to plan this voyage, then replay it on the map.</p>
          <div className="inspector__section" style={{ borderTop: 0, paddingTop: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--outline" onClick={startOptimizerRun}>
              Run optimisation
            </button>
            <button type="button" className="btn btn--outline" onClick={() => newVoyage()} title="Draw a new random voyage: ports, cargo, dates and season">
              New voyage
            </button>
            <span className="small muted num">Voyage seed {voyageSeed}</span>
          </div>
          <Disclosure summary="Mission">
            <Rows
              items={[
                ['Departure', fmt.utcShort(mission.departure)],
                ['Arrival window', `${fmt.utcShort(mission.arrivalEarliest)} to ${fmt.utcShort(mission.arrivalLatest)}`],
                ['Vessel', mission.vesselId === 'auto' ? 'engine decides' : FLEET_BY_ID[mission.vesselId].name],
                ['Fuels in scope', mission.allowedFuels.map((f) => FUELS[f].short).join(', ')],
                ['Priorities', `fuel ${Math.round(w.fuel * 100)}, cost ${Math.round(w.cost * 100)}, emissions ${Math.round(w.emissions * 100)}, risk ${Math.round(w.risk * 100)}, time ${Math.round(w.time * 100)}`],
                ['Engine', `${engine.mode}, population ${engine.population}, ${engine.iterations} generations, ${engine.weatherScenarios + 1} weather members`],
              ]}
            />
            <p className="small muted" style={{ marginTop: 8 }}>
              Edit in <a href="#/routes" onClick={(e) => { e.preventDefault(); navigate('/routes') }}>Routes</a>.
            </p>
          </Disclosure>
          <Disclosure summary="Scenario">
            <p className="narrative" style={{ fontSize: 14 }}>{scenario.description}</p>
          </Disclosure>
        </>
      )}

      {r && !sel && run.status === 'done' && (
        <div className="inspector__section" style={{ borderTop: 0, paddingTop: 4 }}>
          <NoFeasiblePlan tally={r.violationTally} evaluations={r.evaluations} excluded={r.excluded.map((x) => ({ name: FLEET_BY_ID[x.vesselId]?.name ?? x.vesselId, reason: x.reason }))} onRoutes={() => navigate('/routes')} />
        </div>
      )}

      {replan.status === 'error' && replan.error && (
        <div className="inspector__section">
          <ErrorText>{replan.error}</ErrorText>
        </div>
      )}

      {r && sel && (
        <>
          {lead && (
            <div className="inspector__lead">
              <div>
                <span className="label">Fuel{lead.replanned ? ' to arrival' : ''}</span>
                <div className="numeral">
                  {fmt.num(lead.fuelT, 0)}
                  <small>t</small>
                </div>
                <Delta a={lead.fuelT} b={r.baseline.totals.fuelT} />
              </div>
              <div>
                <span className="label">CO₂e {engine.accounting}</span>
                <div className="numeral">
                  {fmt.num(lead.co2, 0)}
                  <small>t</small>
                </div>
                <Delta a={lead.co2} b={r.baseline.objectives[2]} />
              </div>
              <div>
                <span className="label">Voyage cost</span>
                <div className="numeral">{fmt.usd(lead.costUsd)}</div>
                <Delta a={lead.costUsd} b={r.baseline.totals.costUsd} />
              </div>
              <div>
                <span className="label">{lead.replanned ? 'Passage, re-planned' : 'Passage'}</span>
                <div className="numeral">{fmt.hours(lead.timeH)}</div>
                <span className="small muted num">{fmt.num(lead.avgKn, 1)} kn average, ETA {fmt.utcShort(lead.arrivalIso)}</span>
              </div>
            </div>
          )}
          <div className="chips" role="group" aria-label="Pareto plans" style={{ marginTop: 14 }}>
            {r.named.map((n) => (
              <button key={n.id} type="button" className={`btn btn--sm btn--outline ${n.id === selectedId ? 'is-on' : ''}`} onClick={() => selectSolution(n.id)} title={`Fuel ${n.totals.fuelT.toFixed(0)} t, CO₂e ${n.objectives[2].toFixed(0)} t, ${fmt.usd(n.totals.costUsd)}, ${fmt.hours(n.totals.timeH)}`}>
                {n.labels.join(', ')}
              </button>
            ))}
          </div>
          <p className="inspector__one">{sailing ? sailingLine : line}</p>

          {replan.status === 'running' && replan.progress && (
            <div className="inspector__section">
              <Working value={replan.progress.progress} message={replan.progress.message} />
            </div>
          )}
          {last && (
            <Disclosure summary={`Re-plan at T+${last.atH.toFixed(0)} h`} tone="warn" open={tH < last.atH + 60}>
              <Narrative paragraphs={last.explanation.slice(1, 3)} />
              <p className="small muted" style={{ marginTop: 10 }}>
                Full re-plan reasoning in <a href="#/results" onClick={(e) => { e.preventDefault(); navigate('/results') }}>Results</a>.
              </p>
            </Disclosure>
          )}
          <Disclosure summary={sailing ? `Active plan from T+${active?.fromH.toFixed(0)} h` : 'Plan facts'}>
            {(() => {
              const e = sailing ?? sel
              const corridor = planCorridors[e.decision.corridorId] ?? r.corridors.find((c) => c.id === e.decision.corridorId)
              const risk = e.cvar ? e.cvar.riskCvar : e.objectives[3]
              return (
                <Rows
                  items={[
                    ['Hull', FLEET_BY_ID[e.decision.vesselId].name],
                    ['Fuel', FUELS[e.decision.fuelId].short + (e.decision.shorePower && e.totals.shorePowerKwh > 0 ? ', shore power at berth' : '')],
                    ['Corridor', corridor?.name ?? e.decision.corridorId],
                    ['Speed profile', `${Math.min(...e.decision.legSpeedsKn).toFixed(1)} to ${Math.max(...e.decision.legSpeedsKn).toFixed(1)} kn`],
                    [e.cvar ? `Risk CVaR${Math.round(e.cvar.alpha * 100)}` : 'Risk index (peak, mean)', <span className={risk > 0.6 ? 'risk-crit' : risk > 0.35 ? 'risk-warn' : ''}>{e.cvar ? risk.toFixed(2) : `${e.totals.riskMax.toFixed(2)}, ${e.totals.riskMean.toFixed(2)}`}</span>],
                    ['ETA', `${fmt.utcShort(e.totals.arrivalIso)}, ${((Date.parse(mission.arrivalLatest) - Date.parse(e.totals.arrivalIso)) / 3600e3).toFixed(1)} h before limit`],
                    ['Sailing draught', `${e.totals.sailingDraftM.toFixed(2)} m`],
                  ]}
                />
              )
            })()}
            {sel.warnings.length > 0 && (
              <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                {sel.warnings.map((wn, i) => (
                  <li key={i} className="small quiet" style={{ padding: '3px 0' }}>
                    {wn}
                  </li>
                ))}
              </ul>
            )}
          </Disclosure>
          <Disclosure summary={sailing ? 'Why the original plan was selected' : 'Why this plan'}>
            <Narrative paragraphs={why} />
            <p className="small muted" style={{ marginTop: 10 }}>
              Segment inspector and the full Pareto table in <a href="#/results" onClick={(e) => { e.preventDefault(); navigate('/results') }}>Results</a>.
            </p>
          </Disclosure>
          <Disclosure summary="Watch, next 48 h" count={watch.length || 'none'} tone={worstSev}>
            {watch.length ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {watch.map((x, i) => (
                  <li key={i} className="small" style={{ display: 'flex', gap: 12, padding: '4px 0' }}>
                    <span className="num muted">T+{x.t.toFixed(0)}h</span>
                    <span className={x.sev === 'crit' ? 'risk-crit' : x.sev === 'warn' ? 'risk-warn' : ''}>{x.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">No advisories on the current plan in the next 48 hours.</p>
            )}
          </Disclosure>
          <p className="small muted" style={{ margin: '12px 0 0' }}>
            <Mark kind="synthetic">synthetic ocean</Mark>, <Mark kind="scenario" />, {limitsSourced ? <Mark kind="sourced">port limits</Mark> : <Mark kind="scenario">port limits</Mark>}
          </p>
        </>
      )}

      {r && run.status === 'done' && (
        <div className="inspector__section" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => newVoyage()} title="Draw a new random voyage: ports, cargo, dates and season">
            New voyage
          </button>
          <span className="small muted num">Voyage seed {voyageSeed}</span>
        </div>
      )}
    </aside>
  )
}
