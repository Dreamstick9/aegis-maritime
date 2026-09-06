import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { fmt } from '../app/format'
import { buildProblem, startOptimizerRun } from '../app/runner'
import { useStore, voyageTitle } from '../app/store'
import { ViewHead } from '../components/shell/Shell'
import { Disclosure, Empty, Mark, NoFeasiblePlan, Rows, Section, Working } from '../components/ui/primitives'
import { FLEET, FLEET_BY_ID } from '../data/fleet'
import { PORTS } from '../data/ports'
import { PACKS, buildScenario } from '../data/scenarios'
import { runBenchmark, type BenchmarkResult } from '../engine/benchmark'
import { evaluateDecision } from '../engine/evaluate'
import { FUELS } from '../engine/fuels'
import { runOptimizer } from '../engine/optimizer'
import { dailySeries } from '../engine/replay'
import { Rng } from '../engine/rng'
import type { Evaluation, OptimizerRunResult } from '../engine/types'

const GRID = 'rgba(244,244,239,0.08)'
const AXIS_STROKE = 'rgba(244,244,239,0.24)'
const AXIS = { fontSize: 12, fill: '#a3a3a0' }
const TIP = { background: '#1c1d1a', border: '1px solid rgba(244,244,239,0.24)', color: '#f4f4ef', fontSize: 12, fontFamily: 'var(--mono)' }
const LEGEND = { fontSize: 12, color: '#a3a3a0' }
const INK0 = '#f4f4ef'
const INK1 = '#d5d6d1'
const INK2 = '#a3a3a0'
const SIGNAL = '#8fd66e'
const SERIES = [INK1, INK2, '#7f807c', '#5c5d5a', SIGNAL]

function ChartTip({ active, payload, label, unit }: { active?: boolean; payload?: { name?: string; value?: number | string; color?: string }[]; label?: string | number; unit?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="tip">
      <div className="muted">{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color ?? INK0 }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : p.value}
          {unit ? ` ${unit}` : ''}
        </div>
      ))}
    </div>
  )
}

function useActual(sel: Evaluation | null, result: OptimizerRunResult | null) {
  const scenario = useStore((s) => s.scenario)
  const mission = useStore((s) => s.mission)
  const engine = useStore((s) => s.engine)
  return useMemo(() => {
    if (!sel || !result) return null
    const corridor = result.corridors.find((c) => c.id === sel.decision.corridorId)
    if (!corridor) return null
    // "actual" = re-evaluation under the ground-truth storm track with small seeded machinery noise
    const rng = new Rng(engine.seed).fork('actual')
    const v = FLEET_BY_ID[sel.decision.vesselId]
    const noisy = { ...v, hullFouling: v.hullFouling * (1 + 0.04 * rng.gauss()), engine: { ...v.engine, sfocGkWh: v.engine.sfocGkWh * (1 + 0.03 * rng.gauss()) } }
    const actual = evaluateDecision(sel.decision, {
      vessels: { ...Object.fromEntries(FLEET.map((x) => [x.id, x])), [v.id]: noisy },
      corridors: { [corridor.id]: corridor },
      ports: PORTS,
      mission,
      ocean: scenario.ocean,
      oceanOpts: { truth: true, perturb: { windScale: 1 + 0.12 * rng.gauss(), trackShiftLat: 0, trackShiftLon: 0, intensity: 1, swellShift: 0.3 * rng.gauss() } },
      settings: engine,
      start: result.startState,
    })
    const daily = dailySeries(sel, actual)
    const n = daily.length || 1
    const mae = daily.reduce((s, d) => s + Math.abs(d.predictedFuelT - d.actualFuelT), 0) / n
    const mape = (daily.reduce((s, d) => s + (d.actualFuelT ? Math.abs(d.predictedFuelT - d.actualFuelT) / d.actualFuelT : 0), 0) / n) * 100
    const meanA = daily.reduce((s, d) => s + d.actualFuelT, 0) / n
    const ssRes = daily.reduce((s, d) => s + (d.actualFuelT - d.predictedFuelT) ** 2, 0)
    const ssTot = daily.reduce((s, d) => s + (d.actualFuelT - meanA) ** 2, 0) || 1
    const etaErrH = actual.totals.timeH - sel.totals.timeH
    return { actual, daily, mae, mape, r2: 1 - ssRes / ssTot, etaErrH, fuelErrPct: ((actual.totals.fuelT - sel.totals.fuelT) / sel.totals.fuelT) * 100 }
  }, [sel, result, scenario, mission, engine])
}

export default function AnalyticsView() {
  const run = useStore((s) => s.run)
  const engine = useStore((s) => s.engine)
  const selectedId = useStore((s) => s.selectedSolutionId)
  const scenarioId = useStore((s) => s.scenarioId)
  const scenarioName = useStore((s) => voyageTitle(s.scenarioId, s.mission))
  const bench = useStore((s) => s.benchmark)
  const r = run.result
  const sel = r?.archive.find((s) => s.id === selectedId) ?? null
  const actual = useActual(sel, r)
  const [comparison, setComparison] = useState<{ status: 'idle' | 'running' | 'done'; rows: { id: string; name: string; route: string; distanceNm: number; fuelT: number; co2T: number; costUsd: number; timeH: number; risk: number; vessel: string; fuel: string }[] }>({ status: 'idle', rows: [] })

  const breakdown = useMemo(() => {
    if (!sel) return []
    const sea = sel.segments.reduce((s, x) => s + x.fuelT, 0)
    const seaCo2 = sel.segments.reduce((s, x) => s + x.co2WtwT, 0)
    return [
      { phase: 'Sea passage, main + aux', fuelT: sea, co2T: seaCo2, costUsd: sel.totals.fuelCostUsd },
      { phase: 'Port, anchorage + berth', fuelT: sel.totals.fuelT - sea, co2T: sel.totals.portCo2T, costUsd: sel.totals.portCostUsd },
      { phase: 'Time charter hire', fuelT: 0, co2T: 0, costUsd: sel.totals.hireCostUsd },
    ]
  }, [sel])

  const startBench = () => {
    const s = useStore.getState()
    useStore.setState({ benchmark: { ...s.benchmark, status: 'running', progress: 0, message: 'preparing corridors', result: null } })
    const gen = runBenchmark(buildProblem(s), [s.engine.seed, s.engine.seed + 1])
    const step = () => {
      const n = gen.next()
      if (n.done) {
        const res: BenchmarkResult = n.value
        useStore.setState((st) => ({ benchmark: { ...st.benchmark, status: 'done', progress: 1, message: '', result: res.runs.map((x, i) => ({ ...x, color: SERIES[i % SERIES.length] })), seeds: res.seeds.length } }))
        return
      }
      useStore.setState((st) => ({ benchmark: { ...st.benchmark, progress: n.value.progress, message: n.value.message } }))
      setTimeout(step, 0)
    }
    setTimeout(step, 0)
  }

  const runComparison = () => {
    setComparison({ status: 'running', rows: [] })
    const s = useStore.getState()
    // every pack rebuilt for the CURRENT voyage seed: the same ports and cargo under each set of conditions
    const packs = PACKS.map((p) => buildScenario(p.id, s.voyageSeed))
    const rows: typeof comparison.rows = []
    // one fast search per tick so the progress reflects real work and the tab stays responsive
    const step = (i: number) => {
      if (i >= packs.length) {
        setComparison({ status: 'done', rows: [...rows] })
        return
      }
      const sc = packs[i]
      const problem = buildProblem({ ...s, scenarioId: sc.id, scenario: sc, mission: sc.mission, engine: { ...s.engine, seed: sc.seed, mode: 'FAST', population: 12, iterations: 14, useCvar: false, weatherScenarios: 3 } })
      const gen = runOptimizer(problem)
      let n = gen.next()
      while (!n.done) n = gen.next()
      const best = n.value.named[0]
      if (best) rows.push({ id: sc.id, name: sc.name, route: `${PORTS[sc.mission.originId]?.name ?? sc.mission.originId} to ${PORTS[sc.mission.destinationId]?.name ?? sc.mission.destinationId}`, distanceNm: best.totals.distanceNm, fuelT: best.totals.fuelT, co2T: best.objectives[2], costUsd: best.totals.costUsd, timeH: best.totals.timeH, risk: best.cvar ? best.cvar.riskCvar : best.objectives[3], vessel: FLEET_BY_ID[best.decision.vesselId].name, fuel: FUELS[best.decision.fuelId].short })
      setComparison({ status: 'running', rows: [...rows] })
      setTimeout(() => step(i + 1), 30)
    }
    setTimeout(() => step(0), 30)
  }

  if (!r || !sel) {
    return (
      <div className="view">
        <div className="view__inner">
          <ViewHead title="Analytics" sub="Proof view: prediction quality, Pareto behaviour, benchmarks" />
          {r && !sel ? (
            <div style={{ maxWidth: 640, margin: '24px 0' }}>
              <NoFeasiblePlan tally={r.violationTally} evaluations={r.evaluations} excluded={r.excluded.map((x) => ({ name: FLEET_BY_ID[x.vesselId]?.name ?? x.vesselId, reason: x.reason }))} />
            </div>
          ) : (
          <Empty>
            No optimisation has been run for this voyage. Run it to populate prediction, convergence and breakdown analytics; the benchmark below runs independently.
            <div style={{ marginTop: 16 }}>
              <button type="button" className="btn btn--primary" onClick={startOptimizerRun}>
                Run optimisation
              </button>
            </div>
          </Empty>
          )}
          <Section title="Algorithm benchmark" note="synthetic benchmark on this toy problem; equal evaluation budget; not evidence of quantum advantage" id="bench">
            <BenchPanel bench={bench} onRun={startBench} />
          </Section>
        </div>
      </div>
    )
  }

  const conv = r.convergence
  const front = r.archive.map((s) => ({ x: s.totals.fuelT, y: s.objectives[2], named: s.labels.length > 0, sel: s.id === selectedId }))

  return (
    <div className="view">
      <div className="view__inner">
        <ViewHead title="Analytics" sub={`${scenarioName}. Selected plan: ${sel.labels.join(', ') || sel.id}`} />

        <Section title="Prediction quality" note="predicted plan versus a SYNTHETIC “actual” voyage (ground-truth storm track, seeded wind, swell and machinery noise): sensitivity, not validation" id="prediction">
          {actual && (
            <div className="cols cols--wide">
              <div>
                <div className="chart" role="img" aria-label={`Predicted versus synthetic actual daily fuel over ${actual.daily.length} days; mean absolute error ${actual.mae.toFixed(1)} tonnes per day`}>
                  <ResponsiveContainer>
                    <LineChart data={actual.daily} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke={GRID} vertical={false} />
                      <XAxis dataKey="day" tick={AXIS} stroke={AXIS_STROKE} tickLine={false} tickFormatter={(d) => `D${d}`} />
                      <YAxis tick={AXIS} stroke="transparent" tickLine={false} width={40} />
                      <Tooltip content={<ChartTip unit="t/day" />} />
                      <Legend wrapperStyle={LEGEND} />
                      <Line type="monotone" dataKey="predictedFuelT" name="Predicted fuel" stroke={SIGNAL} strokeWidth={1.8} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="actualFuelT" name="Actual fuel (synthetic)" stroke={INK1} strokeWidth={1.2} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <div className="stats">
                  <div className="stat">
                    <span className="label">Daily fuel MAE</span>
                    <span className="numeral">
                      {actual.mae.toFixed(1)}
                      <small>t</small>
                    </span>
                  </div>
                  <div className="stat">
                    <span className="label">MAPE</span>
                    <span className="numeral">
                      {actual.mape.toFixed(1)}
                      <small>%</small>
                    </span>
                  </div>
                  <div className="stat">
                    <span className="label">R²</span>
                    <span className="numeral">{actual.r2.toFixed(2)}</span>
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <Rows items={[['Voyage fuel error', `${actual.fuelErrPct >= 0 ? '+' : '−'}${Math.abs(actual.fuelErrPct).toFixed(1)}%`], ['ETA error', `${actual.etaErrH >= 0 ? '+' : '−'}${Math.abs(actual.etaErrH).toFixed(1)} h`], ['Actual passage', fmt.hours(actual.actual.totals.timeH)], ['Actual max Hs', `${Math.max(...actual.actual.segments.map((s) => s.hsM)).toFixed(1)} m`]]} />
                </div>
                <p className="small muted" style={{ marginTop: 10 }}>
                  <Mark kind="synthetic" />: the “actual” is generated, so these metrics measure the model’s sensitivity to forecast error and machinery noise, not validation against real voyages.
                </p>
              </div>
            </div>
          )}
        </Section>

        <div className="cols cols--2">
          <Section title="Pareto front" note={`fuel × CO₂e ${engine.accounting}, ${r.archive.length} archive members`} id="pareto">
            <div className="chart" role="img" aria-label={`Pareto front scatter of ${r.archive.length} plans, fuel against CO₂e`}>
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 10, right: 12, bottom: 10, left: 0 }}>
                  <CartesianGrid stroke={GRID} />
                  <XAxis dataKey="x" type="number" name="fuel t" tick={AXIS} stroke={AXIS_STROKE} tickLine={false} domain={['auto', 'auto']} />
                  <YAxis dataKey="y" type="number" name="CO₂e t" tick={AXIS} stroke="transparent" tickLine={false} width={48} domain={['auto', 'auto']} />
                  <Tooltip cursor={{ stroke: AXIS_STROKE }} contentStyle={TIP} formatter={(v) => Number(v).toFixed(0)} />
                  <Scatter data={front} isAnimationActive={false} shape={(props: unknown) => {
                    const q = props as { cx: number; cy: number; payload: { named: boolean; sel: boolean } }
                    return <circle cx={q.cx} cy={q.cy} r={q.payload.sel ? 6 : q.payload.named ? 4.5 : 3} fill={q.payload.sel ? SIGNAL : q.payload.named ? INK0 : 'rgba(184,179,168,0.5)'} />
                  }} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </Section>
          <Section title="Convergence" note="hypervolume of the archive per generation (Monte-Carlo, normalised box)" id="convergence">
            <div className="chart" role="img" aria-label={`Convergence: hypervolume rose to ${conv[conv.length - 1]?.hypervolume.toFixed(3)} over ${conv.length} generations`}>
              <ResponsiveContainer>
                <LineChart data={conv} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="generation" tick={AXIS} stroke={AXIS_STROKE} tickLine={false} />
                  <YAxis yAxisId="hv" tick={AXIS} stroke="transparent" tickLine={false} width={44} domain={[0, 'auto']} />
                  <YAxis yAxisId="n" orientation="right" tick={AXIS} stroke="transparent" tickLine={false} width={36} />
                  <Tooltip content={<ChartTip />} />
                  <Legend wrapperStyle={LEGEND} />
                  <Line yAxisId="hv" type="monotone" dataKey="hypervolume" name="Hypervolume" stroke={SIGNAL} strokeWidth={1.8} dot={false} isAnimationActive={false} />
                  <Line yAxisId="n" type="stepAfter" dataKey="archiveSize" name="Archive size" stroke={INK2} strokeWidth={1} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>
              {r.evaluations.toLocaleString()} evaluations, {r.settings.population} Q-individuals × {r.settings.iterations} generations, {(run.computeMs / 1000).toFixed(2)} s compute.
            </p>
          </Section>
        </div>

        <div className="cols cols--2">
          <Section title="Fuel, CO₂e and cost by phase" note="selected plan" id="breakdown">
            <div className="chart chart--short">
              <ResponsiveContainer>
                <BarChart data={breakdown} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis type="number" tick={AXIS} stroke="transparent" tickLine={false} />
                  <YAxis type="category" dataKey="phase" tick={AXIS} stroke="transparent" tickLine={false} width={190} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(244,244,239,0.05)' }} />
                  <Legend wrapperStyle={LEGEND} />
                  <Bar dataKey="fuelT" name="fuel t" fill={SIGNAL} isAnimationActive={false} barSize={8} />
                  <Bar dataKey="co2T" name="CO₂e t" fill={INK1} isAnimationActive={false} barSize={8} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Rows items={breakdown.map((b) => [b.phase, `${fmt.num(b.fuelT, 0)} t fuel, ${fmt.num(b.co2T, 0)} t CO₂e, ${fmt.usd(b.costUsd)}`])} />
          </Section>
          <Section title="Scenario comparison" note="each pack's conditions applied to the current voyage seed; Balanced plan at a fast search budget" id="scenarios" tools={<button type="button" className="btn btn--outline" onClick={runComparison} disabled={comparison.status === 'running'}>{comparison.status === 'running' ? 'Running…' : comparison.status === 'done' ? 'Run again' : 'Run comparison'}</button>}>
            {comparison.status === 'done' ? (
              <table className="table table--tight">
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>Hull and fuel</th>
                    <th className="num">Distance nm</th>
                    <th className="num">Fuel t</th>
                    <th className="num">CO₂e t</th>
                    <th className="num">Cost</th>
                    <th className="num">Time</th>
                    <th className="num">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((row) => (
                    <tr key={row.id} className={row.id === scenarioId ? 'is-selected' : ''}>
                      <td>
                        {row.name}
                        <div className="small muted">{row.route}</div>
                      </td>
                      <td className="small">{row.vessel}, {row.fuel}</td>
                      <td className="num">{fmt.num(row.distanceNm, 0)}</td>
                      <td className="num">{fmt.num(row.fuelT, 0)}</td>
                      <td className="num">{fmt.num(row.co2T, 0)}</td>
                      <td className="num">{fmt.usd(row.costUsd)}</td>
                      <td className="num">{fmt.hours(row.timeH)}</td>
                      <td className="num">{row.risk.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : comparison.status === 'running' ? (
              <Working value={comparison.rows.length / PACKS.length} message={`${comparison.rows.length} of ${PACKS.length} fast searches complete…`} />
            ) : (
              <p className="small muted">Applies every scenario pack's conditions to the current voyage, runs a fast search for each and lists the Balanced plans, a few seconds of compute.</p>
            )}
          </Section>
        </div>

        <Section title="Algorithm benchmark" note="same evaluator, corridors and evaluation budget for every method; synthetic problem; no quantum-advantage claim" id="bench">
          <Disclosure summary="Benchmark against A*, GA, NSGA-II and PSO" count={bench.result ? `${bench.result.length} methods` : bench.status === 'running' ? 'running' : 'not run'} open={bench.status !== 'idle'}>
            <BenchPanel bench={bench} onRun={startBench} />
          </Disclosure>
        </Section>
      </div>
    </div>
  )
}

function BenchPanel({ bench, onRun }: { bench: ReturnType<typeof useStore.getState>['benchmark']; onRun: () => void }) {
  const merged = useMemo(() => {
    if (!bench.result) return []
    const grid = bench.result[0]?.series.map((s) => s.evaluations) ?? []
    return grid.map((ev, i) => {
      const row: Record<string, number> = { evaluations: ev }
      for (const run of bench.result!) row[run.name] = run.series[i]?.hypervolume ?? 0
      return row
    })
  }, [bench.result])
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 12 }}>
        <p className="small muted" style={{ maxWidth: '68ch', margin: 0 }}>
          Compares the QI hybrid against A* + constant speed, a weighted-sum GA, NSGA-II and PSO. The measured quantity is the hypervolume of everything each method found, averaged over two seeds. Differences are properties of this toy problem and these implementations.
        </p>
        <button type="button" className="btn btn--outline" onClick={onRun} disabled={bench.status === 'running'}>
          {bench.status === 'running' ? `Running ${Math.round(bench.progress * 100)}%` : bench.result ? 'Run again' : 'Run benchmark'}
        </button>
      </div>
      {bench.status === 'running' && <Working value={bench.progress} message={bench.message} />}
      {bench.result && (
        <div className="cols cols--wide" style={{ marginTop: 12 }}>
          <div className="chart chart--tall">
            <ResponsiveContainer>
              <LineChart data={merged} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="evaluations" tick={AXIS} stroke={AXIS_STROKE} tickLine={false} />
                <YAxis tick={AXIS} stroke="transparent" tickLine={false} width={44} domain={[0, 'auto']} />
                <Tooltip content={<ChartTip />} />
                <Legend wrapperStyle={LEGEND} />
                {bench.result.map((run) => (
                  <Line key={run.name} type="monotone" dataKey={run.name} stroke={run.color} strokeWidth={run.name.startsWith('QI') ? 2 : 1.2} dot={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <table className="table table--tight">
            <thead>
              <tr>
                <th>Method</th>
                <th className="num">HV</th>
                <th className="num">Best fuel t</th>
                <th className="num">Best CO₂e t</th>
                <th className="num">ms</th>
              </tr>
            </thead>
            <tbody>
              {bench.result.map((run) => (
                <tr key={run.name} title={run.note}>
                  <td>
                    <i className="swatch" style={{ display: 'inline-block', width: 10, height: 2, background: run.color, marginRight: 8, verticalAlign: 'middle' }} />
                    {run.name}
                  </td>
                  <td className="num">{run.final.hypervolume.toFixed(3)}</td>
                  <td className="num">{fmt.num(run.final.bestFuelT, 0)}</td>
                  <td className="num">{fmt.num(run.final.bestCo2T, 0)}</td>
                  <td className="num">{fmt.int(run.timeMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted" style={{ marginTop: 10 }}>
        <Mark kind="synthetic">synthetic benchmark</Mark>, equal population × generations, deterministic seeds
      </p>
    </div>
  )
}
