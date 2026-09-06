import { useState } from 'react'
import { fmt } from '../app/format'
import { DEFAULT_ENGINE, DEFAULT_UI, useStore, type LayerId } from '../app/store'
import { ViewHead } from '../components/shell/Shell'
import { Check, Disclosure, Field, Mark, Section, Segmented, Slider } from '../components/ui/primitives'
import { PORTS } from '../data/ports'
import { SOURCES } from '../data/sources'
import { MODE_PRESETS } from '../engine/optimizer'

const LAYERS: { id: LayerId; label: string }[] = [
  { id: 'baseline', label: 'Baseline route' },
  { id: 'classical', label: 'Classical route' },
  { id: 'pareto', label: 'Pareto alternatives' },
  { id: 'corridors', label: 'A* corridors' },
  { id: 'zones', label: 'Restricted areas and TSS' },
  { id: 'shallow', label: 'Shallow water' },
  { id: 'eca', label: 'Emission-control overlay' },
  { id: 'wind', label: 'Wind field' },
  { id: 'current', label: 'Surface current' },
  { id: 'waves', label: 'Sea state' },
  { id: 'storm', label: 'Storm system' },
  { id: 'fleet', label: 'Other fleet units' },
  { id: 'labels', label: 'Labels' },
]

export default function SettingsView() {
  const engine = useStore((s) => s.engine)
  const ui = useStore((s) => s.ui)
  const updateEngine = useStore((s) => s.updateEngine)
  const updateUi = useStore((s) => s.updateUi)
  const setMode = useStore((s) => s.setMode)
  const toggleLayer = useStore((s) => s.toggleLayer)
  const run = useStore((s) => s.run.status)
  const voyageSeed = useStore((s) => s.voyageSeed)
  const scenario = useStore((s) => s.scenario)
  const mission = useStore((s) => s.mission)
  const newVoyage = useStore((s) => s.newVoyage)
  const [seedInput, setSeedInput] = useState(String(voyageSeed))
  const seedValue = Number.parseInt(seedInput, 10)
  const seedValid = Number.isInteger(seedValue) && seedValue >= 0
  const preset = MODE_PRESETS[engine.mode]
  const customised = preset.population !== engine.population || preset.iterations !== engine.iterations || preset.weatherScenarios !== engine.weatherScenarios
  return (
    <div className="view">
      <div className="view__inner">
        <ViewHead title="Settings" sub={`Engine settings apply to the next run${run === 'done' ? ' (run again to refresh results)' : ''}; display settings apply now.`} />
        <div className="cols cols--2" style={{ gap: 56 }}>
          <div>
            <Section title="Display" id="display">
              <div className="cols cols--2" style={{ gap: 24 }}>
                <Field label="Units" group>
                  <Segmented label="Units" value={ui.units} onChange={(v) => updateUi({ units: v })} options={[{ value: 'nautical', label: 'nm, kn' }, { value: 'metric', label: 'km, km/h' }]} />
                </Field>
                <Field label="Default replay speed" group>
                  <Segmented label="Replay speed" value={ui.timelineSpeed} onChange={(v) => updateUi({ timelineSpeed: v })} options={[{ value: 1, label: '1×' }, { value: 4, label: '4×' }, { value: 16, label: '16×' }]} />
                </Field>
              </div>
              <div style={{ marginTop: 14 }}>
                <Check label="Reduced motion: no camera eases, draw-ins, fades, hull rotation or spinning storm" checked={ui.reducedMotion} onChange={(v) => updateUi({ reducedMotion: v })} />
              </div>
              <h3 className="section__title section__title--sub">Map layers shown by default</h3>
              <div className="cols cols--2" style={{ gap: '0 24px' }}>
                {LAYERS.map((l) => (
                  <Check key={l.id} label={l.label} checked={ui.layers[l.id]} onChange={() => toggleLayer(l.id)} />
                ))}
              </div>
              <button type="button" className="btn btn--outline btn--sm" style={{ marginTop: 14 }} onClick={() => updateUi({ ...DEFAULT_UI, reducedMotion: ui.reducedMotion })}>
                Reset display defaults
              </button>
            </Section>

            <Section title="Safety thresholds and accounting" id="safety">
              <div className="cols cols--2" style={{ gap: '12px 32px' }}>
                <Slider label="Maximum significant wave height" value={engine.safety.maxHsM} min={3} max={8} step={0.25} onChange={(v) => updateEngine({ safety: { ...engine.safety, maxHsM: v } })} format={(v) => `${v.toFixed(2)} m`} hint="Hard constraint, capped by each hull’s own limit and scaled by the mission safety profile" />
                <Slider label="Maximum wind" value={engine.safety.maxWindKn} min={30} max={65} step={1} onChange={(v) => updateEngine({ safety: { ...engine.safety, maxWindKn: v } })} format={(v) => `${v} kn`} />
                <Slider label="Minimum under-keel clearance" value={engine.safety.minUkcM} min={0.5} max={3} step={0.1} onChange={(v) => updateEngine({ safety: { ...engine.safety, minUkcM: v } })} format={(v) => `${v.toFixed(1)} m`} hint="Applied to the synthetic depth model and port channel checks" />
                <Slider label="Evaluation segment length" value={engine.segmentNm} min={20} max={90} step={5} onChange={(v) => updateEngine({ segmentNm: v })} format={(v) => fmt.dist(v, ui.units)} hint="Shorter segments sample the time-dependent ocean more finely" />
              </div>
              <div style={{ marginTop: 14 }}>
                <Field label="Greenhouse-gas accounting" hint="Well-to-wake adds upstream (well-to-tank) emissions to combustion (tank-to-wake), following the IMO lifecycle framework" group>
                  <Segmented label="Accounting" value={engine.accounting} onChange={(v) => updateEngine({ accounting: v })} options={[{ value: 'WtW', label: 'Well-to-wake' }, { value: 'TtW', label: 'Tank-to-wake' }]} />
                </Field>
              </div>
            </Section>

            <Section title="Voyage" note="random per session, reproducible by seed" id="voyage">
              <p className="small" style={{ margin: '0 0 10px' }}>
                <span className="num">Voyage seed {voyageSeed}</span>
                <span className="muted">, {PORTS[mission.originId]?.name ?? mission.originId} to {PORTS[mission.destinationId]?.name ?? mission.destinationId}, {fmt.int(mission.cargoT)} t {mission.cargoType.toLowerCase()}, departing {fmt.utcShort(mission.departure)}. Pack: {scenario.name}.</span>
              </p>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                <Field label="Reproduce a voyage" hint="the same seed and pack always rebuild the same ports, cargo, dates, weather, zones and fleet positions">
                  <input type="number" min={0} step={1} value={seedInput} onChange={(e) => setSeedInput(e.target.value)} aria-label="Voyage seed to reproduce" style={{ maxWidth: 220 }} />
                </Field>
                <button type="button" className="btn btn--outline" onClick={() => newVoyage(seedValue)} disabled={!seedValid || seedValue === voyageSeed}>
                  Apply
                </button>
                <button type="button" className="btn btn--outline" onClick={() => { const s = useStore.getState(); s.newVoyage(); setSeedInput(String(useStore.getState().voyageSeed)) }} title="Draw a new random voyage under the current pack">
                  New voyage
                </button>
              </div>
            </Section>

            <Section title="Simulation" id="simulation">
              <Field label="Random seed" value={engine.seed} hint="Noise fields, weather perturbations and search sampling all derive from this seed; same seed, same results">
                <input type="number" value={engine.seed} onChange={(e) => updateEngine({ seed: Number(e.target.value) || 0 })} aria-label="Random seed" style={{ maxWidth: 220 }} />
              </Field>
              <div style={{ marginTop: 12 }}>
                <Check label="Re-plan automatically when a forecast update is issued during replay" checked={ui.autoReplan} onChange={(v) => updateUi({ autoReplan: v })} />
                <Check label="Show the ground-truth storm track next to the forecast during replay" checked={ui.showTruthStorm} onChange={(v) => updateUi({ showTruthStorm: v })} />
              </div>
              <p className="small muted" style={{ marginTop: 8, maxWidth: '62ch' }}>
                Ground truth is a synthetic track that deviates from the forecast so replay can show forecast error. Neither is real meteorological data.
              </p>
            </Section>
          </div>

          <div>
            <Section title="Algorithm" note="local V1 engine, a classical simulation of quantum-inspired heuristics" id="algorithm">
              <Field label="Mode preset" group>
                <Segmented label="Mode" value={engine.mode} onChange={setMode} options={[{ value: 'FAST', label: 'Fast' }, { value: 'BALANCED', label: 'Balanced' }, { value: 'ROBUST', label: 'Robust' }]} />
              </Field>
              <p className="small muted" style={{ margin: '8px 0 14px', maxWidth: '62ch' }}>
                Fast: nominal weather, small population. Balanced: nominal search, CVaR on the final archive. Robust: CVaR inside the search over every weather member, slowest and most conservative.{customised ? ' Preset values are customised below.' : ''}
              </p>
              <div className="cols cols--2" style={{ gap: '12px 32px' }}>
                <Slider label="Population (Q-individuals / particles)" value={engine.population} min={6} max={48} step={2} onChange={(v) => updateEngine({ population: v })} />
                <Slider label="Generations" value={engine.iterations} min={5} max={120} step={5} onChange={(v) => updateEngine({ iterations: v })} />
                <Slider label="Weather ensemble members" value={engine.weatherScenarios} min={2} max={24} step={1} onChange={(v) => updateEngine({ weatherScenarios: v })} format={(v) => `${v} + nominal`} />
                <Slider label="CVaR confidence α" value={engine.cvarAlpha} min={0.8} max={0.99} step={0.01} onChange={(v) => updateEngine({ cvarAlpha: v })} format={(v) => v.toFixed(2)} />
              </div>
              <div style={{ marginTop: 12 }}>
                <Check label={`Use the CVaR tail-risk measure (α = ${engine.cvarAlpha.toFixed(2)})`} checked={engine.useCvar} onChange={(v) => updateEngine({ useCvar: v })} />
              </div>
              <button type="button" className="btn btn--outline btn--sm" style={{ marginTop: 14 }} onClick={() => updateEngine({ ...DEFAULT_ENGINE, seed: engine.seed })}>
                Reset engine defaults
              </button>
              <p className="narrative" style={{ fontSize: 14, marginTop: 18 }}>
                Discrete choices (hull, corridor, fuel, shore power) are Q-registers that collapse on observation and rotate toward Pareto guides; the speed profile is a quantum-behaved particle swarm. No quantum hardware runs, and no speed-up is claimed; Analytics benchmarks the search against A*, GA, NSGA-II and PSO with the same evaluation budget on the same synthetic problem.
              </p>
            </Section>

            <Section title="Provenance" note="one mark per fact, never per pixel" id="provenance">
              <p className="small muted" style={{ marginBottom: 12 }}>
                <Mark kind="sourced" /> published fact with a link; <Mark kind="derived" /> inferred from published ranges; <Mark kind="scenario" /> chosen for the demo; <Mark kind="synthetic" /> generated
              </p>
              <Disclosure summary="Source ledger" count={SOURCES.length}>
              <table className="table table--tight">
                <tbody>
                  {SOURCES.map((s) => (
                    <tr key={s.id}>
                      <td style={{ width: '46%' }}>
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {s.title}
                        </a>
                        <div className="small muted">{s.org}</div>
                      </td>
                      <td className="small quiet">{s.usedFor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </Disclosure>
            </Section>
          </div>
        </div>
      </div>
    </div>
  )
}
