import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { fmt } from '../app/format'
import { startOptimizerRun } from '../app/runner'
import { useStore } from '../app/store'
import { ViewHead } from '../components/shell/Shell'
import { Disclosure, Empty, Mark, Narrative, NoFeasiblePlan, Rows, Section, Tabs, Working } from '../components/ui/primitives'
import { FLEET_BY_ID } from '../data/fleet'
import { FUELS } from '../engine/fuels'
import { whySelected } from '../engine/narrative'
import type { SegmentResult, Solution } from '../engine/types'

type Metric = { key: string; label: string; get: (s: Solution) => number; fmt: (x: number) => string; lowerBetter: boolean }

export default function ResultsView() {
  const run = useStore((s) => s.run)
  const mission = useStore((s) => s.mission)
  const engine = useStore((s) => s.engine)
  const units = useStore((s) => s.ui.units)
  const selectedId = useStore((s) => s.selectedSolutionId)
  const selectSolution = useStore((s) => s.selectSolution)
  const selectedSegment = useStore((s) => s.selectedSegment)
  const selectSegment = useStore((s) => s.selectSegment)
  const replanHistory = useStore((s) => s.replan.history)
  const navigate = useNavigate()
  const [axes, setAxes] = useState<'fuel-co2' | 'cost-co2' | 'time-risk'>('fuel-co2')
  const r = run.result
  const sel = r?.archive.find((s) => s.id === selectedId) ?? null
  const corridors = useMemo(() => (r ? Object.fromEntries(r.corridors.map((c) => [c.id, c])) : {}), [r])
  const why = useMemo(() => (r && sel ? whySelected(sel, { baseline: r.baseline, classical: r.classical, corridors, vessels: FLEET_BY_ID, mission, accounting: engine.accounting }) : []), [r, sel, corridors, mission, engine.accounting])

  if (run.status === 'running' && run.progress) {
    return (
      <div className="view">
        <div className="view__inner">
          <ViewHead title="Results" sub="the engine is searching" />
          <div style={{ maxWidth: 560, marginTop: 24 }}>
            <Working value={run.progress.progress} message={run.progress.message} />
          </div>
        </div>
      </div>
    )
  }
  if (r && !sel) {
    return (
      <div className="view">
        <div className="view__inner">
          <ViewHead title="Results" sub={`No feasible plan from ${r.evaluations.toLocaleString()} evaluations, seed ${r.seed}`} />
          <div style={{ maxWidth: 640, marginTop: 24 }}>
            <NoFeasiblePlan tally={r.violationTally} evaluations={r.evaluations} excluded={r.excluded.map((x) => ({ name: FLEET_BY_ID[x.vesselId]?.name ?? x.vesselId, reason: x.reason }))} onRoutes={() => navigate('/routes')} />
          </div>
        </div>
      </div>
    )
  }
  if (!r || !sel) {
    return (
      <div className="view">
        <div className="view__inner">
          <ViewHead title="Results" sub="Pareto trade-offs for the current mission" />
          <Empty>
            <div className="numeral" style={{ marginBottom: 12 }}>
              0 <small>plans</small>
            </div>
            No optimisation has been run for this scenario. Compose the mission in <a href="#/routes" onClick={(e) => { e.preventDefault(); navigate('/routes') }}>Routes</a>, or run it with the current settings.
            <div style={{ marginTop: 16 }}>
              <button type="button" className="btn btn--primary" onClick={startOptimizerRun}>
                Run optimisation
              </button>
            </div>
          </Empty>
        </div>
      </div>
    )
  }

  const metrics: Metric[] = [
    { key: 'fuel', label: 'Fuel', get: (s) => s.totals.fuelT, fmt: (x) => `${fmt.num(x, 0)} t`, lowerBetter: true },
    { key: 'co2', label: `CO₂e ${engine.accounting}`, get: (s) => s.objectives[2], fmt: (x) => `${fmt.num(x, 0)} t`, lowerBetter: true },
    { key: 'cost', label: 'Voyage cost', get: (s) => s.totals.costUsd, fmt: (x) => fmt.usd(x), lowerBetter: true },
    { key: 'time', label: 'Passage time', get: (s) => s.totals.timeH, fmt: (x) => fmt.hours(x), lowerBetter: true },
    { key: 'risk', label: sel.cvar ? `Risk CVaR${Math.round(sel.cvar.alpha * 100)}` : 'Risk index', get: (s) => (s.cvar ? s.cvar.riskCvar : s.objectives[3]), fmt: (x) => x.toFixed(2), lowerBetter: true },
    { key: 'speed', label: 'Average speed', get: (s) => s.totals.avgSpeedKn, fmt: (x) => fmt.speed(x, units), lowerBetter: false },
    { key: 'eta', label: 'ETA slack', get: (s) => (Date.parse(mission.arrivalLatest) - Date.parse(s.totals.arrivalIso)) / 3600e3, fmt: (x) => `${x.toFixed(1)} h`, lowerBetter: false },
  ]
  const cols = r.named
  const best = (m: Metric) => {
    const vals = cols.map(m.get)
    return m.lowerBetter ? Math.min(...vals) : Math.max(...vals)
  }
  const scatter = r.archive.map((s) => ({
    id: s.id,
    x: axes === 'fuel-co2' ? s.totals.fuelT : axes === 'cost-co2' ? s.totals.costUsd / 1000 : s.totals.timeH,
    y: axes === 'time-risk' ? (s.cvar ? s.cvar.riskCvar : s.objectives[3]) : s.objectives[2],
    z: s.id === selectedId ? 160 : s.labels.length ? 90 : 40,
    label: s.labels.join(', ') || 'archive',
  }))
  const xLabel = axes === 'fuel-co2' ? 'fuel, t' : axes === 'cost-co2' ? 'voyage cost, k$' : 'passage time, h'
  const yLabel = axes === 'time-risk' ? 'risk' : `CO₂e ${engine.accounting}, t`
  const segs = sel.segments
  const selSeg: SegmentResult | null = selectedSegment !== null ? segs[selectedSegment] ?? null : null

  return (
    <div className="view">
      <div className="view__inner">
        <ViewHead title="Results" sub={`${r.archive.length} non-dominated plans from ${r.evaluations.toLocaleString()} evaluations, seed ${r.seed}`} />

        <Section title="Pareto trade-offs" note="one column per named plan; the selected plan drives the chart and replay" id="compare">
          <div style={{ overflowX: 'auto' }}>
            <table className="compare">
              <thead>
                <tr>
                  <th />
                  {cols.map((c) => (
                    <th key={c.id} className={c.id === selectedId ? 'is-selected' : ''}>
                      <button type="button" className={`pick ${c.id === selectedId ? 'is-on' : ''}`} onClick={() => selectSolution(c.id)} aria-pressed={c.id === selectedId}>
                        {c.labels.join(', ')}
                      </button>
                      <div className="small muted" style={{ marginTop: 4 }}>
                        {FLEET_BY_ID[c.decision.vesselId].name}, {FUELS[c.decision.fuelId].short}
                        {c.decision.shorePower && c.totals.shorePowerKwh > 0 ? ', shore power' : ''}
                      </div>
                    </th>
                  ))}
                  <th>
                    Baseline
                    <div className="small muted" style={{ marginTop: 4 }}>
                      design speed, {FUELS[r.baseline.decision.fuelId].short}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => {
                  const b = best(m)
                  return (
                    <tr key={m.key}>
                      <td>{m.label}</td>
                      {cols.map((c) => {
                        const v = m.get(c)
                        return (
                          <td key={c.id} className={`${c.id === selectedId ? 'is-selected' : ''} ${Math.abs(v - b) < 1e-9 && cols.length > 1 ? 'best' : ''}`}>
                            {m.fmt(v)}
                          </td>
                        )
                      })}
                      <td className="muted">{m.fmt(m.get(r.baseline as Solution))}</td>
                    </tr>
                  )
                })}
                <tr>
                  <td>Corridor</td>
                  {cols.map((c) => (
                    <td key={c.id} className={c.id === selectedId ? 'is-selected' : ''} style={{ fontFamily: 'var(--sans)' }}>
                      {corridors[c.decision.corridorId]?.name}
                    </td>
                  ))}
                  <td className="muted" style={{ fontFamily: 'var(--sans)' }}>
                    {corridors[r.baseline.decision.corridorId]?.name}
                  </td>
                </tr>
                <tr>
                  <td>Speed profile</td>
                  {cols.map((c) => (
                    <td key={c.id} className={c.id === selectedId ? 'is-selected' : ''}>
                      {Math.min(...c.decision.legSpeedsKn).toFixed(1)} to {Math.max(...c.decision.legSpeedsKn).toFixed(1)} kn
                    </td>
                  ))}
                  <td className="muted">{r.baseline.decision.legSpeedsKn[0].toFixed(1)} kn constant</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            Bold marks the best value in a row. Classical reference (A* corridor, constant speed, weighted sum): {fmt.num(r.classical.totals.fuelT, 0)} t fuel, {fmt.num(r.classical.objectives[2], 0)} t CO₂e, {fmt.usd(r.classical.totals.costUsd)}, {fmt.hours(r.classical.totals.timeH)}.
          </p>
        </Section>

        {replanHistory.length > 0 && (
          <Section title={`Rolling re-plan at T+${replanHistory[replanHistory.length - 1].atH.toFixed(0)} h`} note={replanHistory[replanHistory.length - 1].forecastLabel} id="replan">
            <Narrative paragraphs={replanHistory[replanHistory.length - 1].explanation} />
          </Section>
        )}

        <div className="cols cols--wide">
          <Section title="Archive" note={`${r.archive.length} non-dominated plans. Click a point to select it.`} id="front" tools={<Tabs label="Axes" value={axes} onChange={setAxes} tabs={[{ id: 'fuel-co2', label: 'Fuel × CO₂e' }, { id: 'cost-co2', label: 'Cost × CO₂e' }, { id: 'time-risk', label: 'Time × risk' }]} />}>
            <div className="chart chart--tall" role="img" aria-label={`Archive scatter: ${r.archive.length} non-dominated plans, ${xLabel} against ${yLabel}`}>
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 12, right: 16, bottom: 16, left: 8 }}>
                  <CartesianGrid stroke="rgba(244,244,239,0.08)" />
                  <XAxis dataKey="x" type="number" name={xLabel} tick={{ fontSize: 12, fill: '#a3a3a0' }} stroke="rgba(244,244,239,0.24)" tickLine={false} domain={['auto', 'auto']} label={{ value: xLabel, position: 'insideBottomRight', dy: 14, fontSize: 12, fill: '#a3a3a0' }} />
                  <YAxis dataKey="y" type="number" name={yLabel} tick={{ fontSize: 12, fill: '#a3a3a0' }} stroke="transparent" tickLine={false} domain={['auto', 'auto']} width={56} label={{ value: yLabel, angle: -90, position: 'insideLeft', fontSize: 12, fill: '#a3a3a0' }} />
                  <ZAxis dataKey="z" range={[30, 170]} />
                  <Tooltip cursor={{ stroke: 'rgba(244,244,239,0.24)' }} content={({ payload }) => {
                    const p = payload?.[0]?.payload as (typeof scatter)[number] | undefined
                    if (!p) return null
                    return (
                      <div className="tip">
                        {p.label}
                        <br />
                        {xLabel}: {p.x.toFixed(axes === 'cost-co2' ? 0 : 1)}, {yLabel}: {p.y.toFixed(axes === 'time-risk' ? 2 : 0)}
                      </div>
                    )
                  }} />
                  <Scatter data={scatter} fill="#f4f4ef" fillOpacity={0.75} isAnimationActive={false} onClick={(d: unknown) => { const q = d as { payload?: { id?: string }; id?: string } | null; const id = q?.payload?.id ?? q?.id; if (id) selectSolution(id) }} shape={(props: unknown) => {
                    const q = props as { cx: number; cy: number; payload: (typeof scatter)[number] }
                    const isSel = q.payload.id === selectedId
                    const named = q.payload.label !== 'archive'
                    return <circle cx={q.cx} cy={q.cy} r={isSel ? 7 : named ? 5 : 3.2} fill={isSel ? '#8fd66e' : named ? '#f4f4ef' : 'rgba(184,179,168,0.55)'} stroke={isSel ? '#101210' : 'none'} strokeWidth={1.5} style={{ cursor: 'pointer' }} />
                  }} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="legend">
              <span><i style={{ background: '#151614', height: 8, width: 8, borderRadius: 4, outline: '2px solid #8fd66e', outlineOffset: -3 }} />selected plan</span>
              <span><i style={{ background: '#151614', height: 6, width: 6, borderRadius: 3 }} />named plan</span>
              <span><i style={{ background: 'rgba(21,22,20,0.45)', height: 6, width: 6, borderRadius: 3 }} />archive member</span>
            </div>
          </Section>

          <Section title="Why this plan was selected" note={sel.labels.join(', ')} id="why">
            <Narrative paragraphs={why} />
            <div style={{ marginTop: 14 }}>
              <Rows
                items={[
                  ['Hull', FLEET_BY_ID[sel.decision.vesselId].name],
                  ['Fuel', FUELS[sel.decision.fuelId].name],
                  ['Sailing draught', `${sel.totals.sailingDraftM.toFixed(2)} m`],
                  ['Port phase CO₂', `${sel.totals.portCo2T.toFixed(1)} t${sel.totals.shorePowerKwh ? ` (${fmt.int(sel.totals.shorePowerKwh)} kWh shore power)` : ' (auxiliaries)'}`],
                  ['Cost split', `fuel ${fmt.usd(sel.totals.fuelCostUsd)}, hire ${fmt.usd(sel.totals.hireCostUsd)}, port ${fmt.usd(sel.totals.portCostUsd)}`],
                ]}
              />
            </div>
            {sel.violations.length > 0 && <p className="error" style={{ marginTop: 10 }}>{sel.violations.join('; ')}</p>}
          </Section>
        </div>

        <Section title="Segment inspector" note={`${segs.length} evaluation segments of about ${fmt.dist(engine.segmentNm, units)}; select a row to highlight it on the chart`} id="segments">
          {selSeg && (
            <div className="stats" style={{ marginBottom: 14 }}>
              <div className="stat">
                <span className="label">Segment {selSeg.index + 1}</span>
                <span className="numeral">
                  {fmt.num(selSeg.distNm, 0)}
                  <small>{fmt.distUnit(units)}</small>
                </span>
                <span className="small muted num">T+{selSeg.tStartH.toFixed(1)} to T+{selSeg.tEndH.toFixed(1)} h</span>
              </div>
              <div className="stat">
                <span className="label">STW and SOG</span>
                <span className="numeral">
                  {selSeg.stwKn.toFixed(1)} / {selSeg.sogKn.toFixed(1)}
                  <small>kn</small>
                </span>
                <span className="small muted num">current {selSeg.currentAssistKn >= 0 ? '+' : '−'}{Math.abs(selSeg.currentAssistKn).toFixed(2)} kn</span>
              </div>
              <div className="stat">
                <span className="label">Power</span>
                <span className="numeral">
                  {fmt.int(selSeg.powerKw)}
                  <small>kW</small>
                </span>
                <span className="small muted num">{Math.round(selSeg.loadFrac * 100)}% MCR, +{Math.round(selSeg.weatherFrac * 100)}% weather</span>
              </div>
              <div className="stat">
                <span className="label">Fuel and CO₂e</span>
                <span className="numeral">
                  {selSeg.fuelT.toFixed(1)} / {selSeg.co2WtwT.toFixed(1)}
                  <small>t</small>
                </span>
                <span className="small muted num">{fmt.num(selSeg.energyGJ, 0)} GJ</span>
              </div>
              <div className="stat">
                <span className="label">Risk</span>
                <span className={`numeral ${selSeg.risk > 0.6 ? 'risk-crit' : selSeg.risk > 0.35 ? 'risk-warn' : ''}`}>{selSeg.risk.toFixed(2)}</span>
                <span className="small muted">{selSeg.hazards.join('; ') || 'no hazards'}</span>
              </div>
            </div>
          )}
          <Disclosure summary="All segments" count={segs.length} open={selectedSegment !== null}>
          <div style={{ maxHeight: 420, overflow: 'auto' }}>
            <table className="table table--tight">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th className="num">T+ h</th>
                  <th>Position</th>
                  <th className="num">Dist {fmt.distUnit(units)}</th>
                  <th className="num">STW</th>
                  <th className="num">SOG</th>
                  <th className="num">Current</th>
                  <th className="num">Wind kn</th>
                  <th className="num">Hs m</th>
                  <th className="num">kW</th>
                  <th className="num">Fuel t</th>
                  <th className="num">CO₂e t</th>
                  <th className="num">Risk</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {segs.map((s) => (
                  <tr key={s.index} className={`is-clickable ${selectedSegment === s.index ? 'is-selected' : ''}`} onClick={() => selectSegment(selectedSegment === s.index ? null : s.index)}>
                    <td className="num">
                      <button type="button" className="pick num" aria-pressed={selectedSegment === s.index} aria-label={`Segment ${s.index + 1}${selectedSegment === s.index ? ', selected' : ''}`} onClick={(e) => { e.stopPropagation(); selectSegment(selectedSegment === s.index ? null : s.index) }} style={{ background: 'transparent', border: 0, padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}>
                        {s.index + 1}
                      </button>
                    </td>
                    <td className="num">{s.tStartH.toFixed(0)}</td>
                    <td className="num">{fmt.latlon(s.from.lat, s.from.lon)}</td>
                    <td className="num">{fmt.num(units === 'metric' ? s.distNm * 1.852 : s.distNm, 0)}</td>
                    <td className="num">{s.stwKn.toFixed(1)}</td>
                    <td className="num">{s.sogKn.toFixed(1)}</td>
                    <td className="num">{s.currentAssistKn >= 0 ? '+' : '−'}{Math.abs(s.currentAssistKn).toFixed(2)}</td>
                    <td className="num">{s.windKn.toFixed(0)}</td>
                    <td className="num">{s.hsM.toFixed(1)}</td>
                    <td className="num">{fmt.int(s.powerKw)}</td>
                    <td className="num">{s.fuelT.toFixed(1)}</td>
                    <td className="num">{s.co2WtwT.toFixed(1)}</td>
                    <td className={`num ${s.risk > 0.6 ? 'risk-crit' : s.risk > 0.35 ? 'risk-warn' : ''}`}>{s.risk.toFixed(2)}</td>
                    <td className="small muted">{s.hazards.join('; ') || 'none'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </Disclosure>
          <p className="small muted" style={{ marginTop: 10 }}>
            <Mark kind="synthetic">synthetic ocean fields</Mark>, <Mark kind="derived">vessel physics</Mark>, <Mark kind="scenario">prices and tariffs</Mark>
          </p>
        </Section>
      </div>
    </div>
  )
}
