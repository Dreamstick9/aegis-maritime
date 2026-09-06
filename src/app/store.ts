import { create } from 'zustand'
import { FLEET, FLEET_BY_ID } from '../data/fleet'
import { PORTS } from '../data/ports'
import { buildScenario, PACKS, type ScenarioId, type ScenarioPack } from '../data/scenarios'
import { setScenarioZones } from '../engine/zones'
import { MODE_PRESETS } from '../engine/optimizer'
import type { ActivePlan } from '../engine/replay'
import type { EngineSettings, Evaluation, Mission, OptimizerRunResult, ProgressEvent, Corridor } from '../engine/types'

export type LayerId = 'baseline' | 'classical' | 'pareto' | 'corridors' | 'zones' | 'shallow' | 'eca' | 'wind' | 'current' | 'waves' | 'storm' | 'labels' | 'fleet'

export interface UiSettings {
  units: 'nautical' | 'metric'
  reducedMotion: boolean
  autoReplan: boolean
  layers: Record<LayerId, boolean>
  timelineSpeed: 1 | 4 | 16
  showTruthStorm: boolean
  commandPanelOpen: boolean
  /** route visibility for the kept-alive WebGL views (rendering pauses while hidden) */
  visibleRoute: string
  /** chart symbology: light nautical chart or the black night plate */
  chartMode: 'chart' | 'night'
  /** camera eases to keep the mission vessel in view while the replay plays */
  followVessel: boolean
}

export interface RunState {
  status: 'idle' | 'running' | 'done' | 'error'
  progress: ProgressEvent | null
  log: string[]
  result: OptimizerRunResult | null
  error: string | null
  computeMs: number
  wallMs: number
}

export interface ReplanRecord {
  atH: number
  oldPlan: ActivePlan
  newPlan: ActivePlan
  ifContinued: Evaluation
  explanation: string[]
  forecastLabel: string
  fadeStartMs: number
  result: OptimizerRunResult
}

export interface ReplanState {
  status: 'idle' | 'running' | 'done' | 'error'
  progress: ProgressEvent | null
  history: ReplanRecord[]
  error: string | null
  resumeAfter: boolean
}

export interface BenchmarkSeries {
  name: string
  color: string
  series: { evaluations: number; hypervolume: number }[]
  final: { hypervolume: number; bestFuelT: number; bestCo2T: number; bestCostUsd: number; archive: number }
  timeMs: number
  note: string
}

export interface BenchmarkState {
  status: 'idle' | 'running' | 'done' | 'error'
  progress: number
  message: string
  result: BenchmarkSeries[] | null
  seeds: number
}

export interface AppState {
  scenarioId: ScenarioId
  /** the voyage seed; every pack is built deterministically from (scenarioId, voyageSeed) */
  voyageSeed: number
  /** the materialised pack for the current voyage: read this, never a static scenario table */
  scenario: ScenarioPack
  mission: Mission
  engine: EngineSettings
  ui: UiSettings
  run: RunState
  selectedSolutionId: string | null
  plans: ActivePlan[]
  planCorridors: Record<string, Corridor>
  timeline: { tH: number; playing: boolean }
  replan: ReplanState
  selectedVesselId: string
  selectedRegion: string | null
  selectedSegment: number | null
  benchmark: BenchmarkState
  // actions
  setScenario: (id: ScenarioId) => void
  /** generate a new random voyage (or rebuild the given seed) under the current pack */
  newVoyage: (seed?: number, packId?: ScenarioId) => void
  updateMission: (patch: Partial<Mission>) => void
  updateEngine: (patch: Partial<EngineSettings>) => void
  setMode: (mode: EngineSettings['mode']) => void
  updateUi: (patch: Partial<UiSettings>) => void
  toggleLayer: (id: LayerId) => void
  selectSolution: (id: string) => void
  setTime: (tH: number) => void
  setPlaying: (p: boolean) => void
  setSpeed: (s: UiSettings['timelineSpeed']) => void
  selectVessel: (id: string) => void
  selectRegion: (r: string | null) => void
  selectSegment: (i: number | null) => void
  resetRun: () => void
}

export const DEFAULT_ENGINE: EngineSettings = {
  mode: 'BALANCED',
  ...MODE_PRESETS.BALANCED,
  cvarAlpha: 0.95,
  seed: 20260905,
  accounting: 'WtW',
  safety: { maxHsM: 6.0, maxWindKn: 50, minUkcM: 1.0 },
  segmentNm: 45,
}

export const DEFAULT_UI: UiSettings = {
  units: 'nautical',
  reducedMotion: typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false,
  autoReplan: true,
  layers: { baseline: true, classical: true, pareto: true, corridors: false, zones: true, shallow: true, eca: true, wind: true, current: false, waves: false, storm: true, labels: true, fleet: true },
  timelineSpeed: 4,
  showTruthStorm: false,
  commandPanelOpen: true,
  visibleRoute: '/',
  chartMode: 'chart',
  followVessel: true,
}

const emptyRun = (): RunState => ({ status: 'idle', progress: null, log: [], result: null, error: null, computeMs: 0, wallMs: 0 })
const emptyReplan = (): ReplanState => ({ status: 'idle', progress: null, history: [], error: null, resumeAfter: false })

/** A fresh seed for every session: the voyage is random on load, and reproducible from the seed shown in the UI. */
export function randomVoyageSeed(): number {
  return 1 + Math.floor(Math.random() * 999_999)
}

const initialSeed = randomVoyageSeed()
const initialScenario = buildScenario('normal', initialSeed)
setScenarioZones(initialScenario.zones)

export const useStore = create<AppState>((set, get) => ({
  scenarioId: 'normal',
  voyageSeed: initialSeed,
  scenario: initialScenario,
  mission: initialScenario.mission,
  engine: { ...DEFAULT_ENGINE, seed: initialScenario.seed },
  ui: DEFAULT_UI,
  run: emptyRun(),
  selectedSolutionId: null,
  plans: [],
  planCorridors: {},
  timeline: { tH: 0, playing: false },
  replan: emptyReplan(),
  selectedVesselId: 'AK',
  selectedRegion: null,
  selectedSegment: null,
  benchmark: { status: 'idle', progress: 0, message: '', result: null, seeds: 2 },

  setScenario: (id) => get().newVoyage(get().voyageSeed, id),
  newVoyage: (seed, packId) => {
    const id = packId ?? get().scenarioId
    const voyageSeed = seed ?? randomVoyageSeed()
    const sc = buildScenario(id, voyageSeed)
    setScenarioZones(sc.zones)
    set((s) => ({
      scenarioId: id,
      voyageSeed,
      scenario: sc,
      mission: sc.mission,
      engine: { ...s.engine, seed: sc.seed, ...(sc.engineOverrides ?? {}) },
      run: emptyRun(),
      replan: emptyReplan(),
      plans: [],
      planCorridors: {},
      selectedSolutionId: null,
      selectedSegment: null,
      timeline: { tH: 0, playing: false },
      benchmark: { ...s.benchmark, status: 'idle', result: null },
      selectedVesselId: sc.mission.vesselId === 'auto' ? s.selectedVesselId : sc.mission.vesselId,
    }))
  },
  updateMission: (patch) => set((s) => ({ mission: { ...s.mission, ...patch } })),
  updateEngine: (patch) => set((s) => ({ engine: { ...s.engine, ...patch } })),
  setMode: (mode) => set((s) => ({ engine: { ...s.engine, mode, ...MODE_PRESETS[mode] } })),
  updateUi: (patch) => set((s) => ({ ui: { ...s.ui, ...patch } })),
  toggleLayer: (id) => set((s) => ({ ui: { ...s.ui, layers: { ...s.ui.layers, [id]: !s.ui.layers[id] } } })),
  selectSolution: (id) => {
    const r = get().run.result
    if (!r) return
    const sol = r.archive.find((x) => x.id === id)
    if (!sol) return
    set({
      selectedSolutionId: id,
      plans: [{ evaluation: sol, fromH: 0, carried: { fuelT: 0, co2T: 0, distanceNm: 0 } }],
      planCorridors: Object.fromEntries(r.corridors.map((c) => [c.id, c])),
      timeline: { tH: 0, playing: false },
      replan: emptyReplan(),
      selectedSegment: null,
      selectedVesselId: sol.decision.vesselId,
    })
  },
  setTime: (tH) => set((s) => ({ timeline: { ...s.timeline, tH: Math.max(0, tH) } })),
  setPlaying: (p) => set((s) => ({ timeline: { ...s.timeline, playing: p } })),
  setSpeed: (sp) => set((s) => ({ ui: { ...s.ui, timelineSpeed: sp } })),
  selectVessel: (id) => set({ selectedVesselId: id, selectedRegion: null }),
  selectRegion: (r) => set({ selectedRegion: r }),
  selectSegment: (i) => set({ selectedSegment: i }),
  resetRun: () => set({ run: emptyRun(), replan: emptyReplan(), plans: [], planCorridors: {}, selectedSolutionId: null, timeline: { tH: 0, playing: false } }),
}))

/** "Pack name: Origin to Destination", always from the live mission so edits in Routes are reflected. */
export function voyageTitle(scenarioId: ScenarioId, mission: Mission): string {
  const pack = PACKS.find((p) => p.id === scenarioId)?.name ?? 'Voyage'
  const o = PORTS[mission.originId]?.name ?? mission.originId
  const d = PORTS[mission.destinationId]?.name ?? mission.destinationId
  return `${pack}: ${o} to ${d}`
}

export function activePlanAt(plans: ActivePlan[], tH: number): ActivePlan | null {
  let best: ActivePlan | null = null
  for (const p of plans) if (p.fromH <= tH && (!best || p.fromH >= best.fromH)) best = p
  return best ?? plans[0] ?? null
}

export function planEtaH(plans: ActivePlan[]): number {
  const last = plans[plans.length - 1]
  if (!last) return 0
  const seg = last.evaluation.segments[last.evaluation.segments.length - 1]
  return seg ? seg.tEndH : 0
}

export { FLEET, FLEET_BY_ID, PORTS }
