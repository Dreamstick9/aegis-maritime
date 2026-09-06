import { describe, expect, it } from 'vitest'
import { FLEET, FLEET_BY_ID } from '../../data/fleet'
import { PORTS } from '../../data/ports'
import { SCENARIOS } from '../../data/scenarios'
import { approachFor } from '../corridors'
import { runBenchmark } from '../benchmark'
import { explainReplan, oneLine, whySelected } from '../narrative'
import { MODE_PRESETS, runOptimizer, type OptimizerProblem } from '../optimizer'
import { dailySeries, planEvents, splitTrack, stateAt } from '../replay'
import type { EngineSettings } from '../types'

const settings: EngineSettings = { mode: 'FAST', ...MODE_PRESETS.FAST, population: 10, iterations: 5, weatherScenarios: 3, cvarAlpha: 0.95, seed: 11, accounting: 'WtW', safety: { maxHsM: 6, maxWindKn: 50, minUkcM: 1 }, segmentNm: 60 }
const problem = (id: 'normal' | 'storm'): OptimizerProblem => ({ vessels: FLEET, ports: PORTS, mission: SCENARIOS[id].mission, ocean: SCENARIOS[id].ocean, settings, start: { position: PORTS.INMRM.position, tH: 0, fuelUsedT: 0, co2UsedT: 0, costUsedUsd: 0, distanceDoneNm: 0 }, planningTimeH: 0, approach: approachFor(PORTS[SCENARIOS[id].mission.originId], PORTS[SCENARIOS[id].mission.destinationId]) })
function run(p: OptimizerProblem) {
  const g = runOptimizer(p)
  let n = g.next()
  while (!n.done) n = g.next()
  return n.value
}

describe('replay', () => {
  const r = run(problem('normal'))
  const plan = { evaluation: r.named[0], fromH: 0, carried: { fuelT: 0, co2T: 0, distanceNm: 0 } }
  it('state advances monotonically and finishes at the ETA', () => {
    const a = stateAt(plan, 10, SCENARIOS.normal.ocean)
    const b = stateAt(plan, 60, SCENARIOS.normal.ocean)
    expect(b.distanceDoneNm).toBeGreaterThan(a.distanceDoneNm)
    expect(b.fuelUsedT).toBeGreaterThan(a.fuelUsedT)
    const end = stateAt(plan, 1e4, SCENARIOS.normal.ocean)
    expect(end.finished).toBe(true)
    expect(end.remainingNm).toBe(0)
    expect(end.fuelUsedT).toBeCloseTo(plan.evaluation.segments.reduce((s, x) => s + x.fuelT, 0), 6)
  })
  it('splits the track into travelled and remaining parts that meet', () => {
    const { travelled, remaining } = splitTrack(plan, 50)
    expect(travelled.length).toBeGreaterThan(1)
    expect(remaining.length).toBeGreaterThan(1)
    expect(travelled[travelled.length - 1]).toEqual(remaining[0])
  })
  it('derives landmark and arrival events', () => {
    const evs = planEvents(plan)
    expect(evs.some((e) => e.kind === 'arrival')).toBe(true)
    expect(evs.some((e) => e.label.includes('Dondra'))).toBe(true)
  })
  it('daily series covers the voyage', () => {
    const d = dailySeries(r.named[0], r.baseline)
    expect(d.length).toBeGreaterThanOrEqual(Math.ceil(r.named[0].totals.timeH / 24))
    expect(d[0].predictedFuelT).toBeGreaterThan(0)
  })
})

describe('narrative', () => {
  const r = run(problem('storm'))
  const ctx = { baseline: r.baseline, classical: r.classical, corridors: Object.fromEntries(r.corridors.map((c) => [c.id, c])), vessels: FLEET_BY_ID, mission: SCENARIOS.storm.mission, accounting: 'WtW' as const }
  it('writes a multi-paragraph explanation built from the plan', () => {
    const why = whySelected(r.named[0], ctx)
    expect(why.length).toBeGreaterThanOrEqual(6)
    expect(why[0]).toMatch(/baseline/)
    expect(oneLine(r.named[0], ctx)).toMatch(/fuel/)
  })
  it('explains a re-plan with deltas', () => {
    const text = explainReplan({ tH: 36, forecastLabel: 'Forecast update', ifContinued: r.classical, newPlan: r.named[0], oldCorridor: r.corridors[0], newCorridor: r.corridors[1] ?? r.corridors[0], alpha: 0.95 })
    expect(text.join(' ')).toMatch(/Re-optimised from the live position/)
    expect(text.join(' ')).toMatch(/Remaining distance/)
  })
})

describe('benchmark', () => {
  it('runs every comparator with an equal budget and reports hypervolume series', () => {
    const p = problem('normal')
    const gen = runBenchmark({ ...p, settings: { ...settings, population: 6, iterations: 3 } }, [3])
    let n = gen.next()
    let ticks = 0
    while (!n.done) {
      ticks++
      n = gen.next()
    }
    expect(ticks).toBeGreaterThan(3)
    expect(n.value.runs.map((r) => r.name).sort()).toEqual(['A* + constant speed', 'GA (weighted sum)', 'NSGA-II', 'PSO (weighted sum)', 'QI hybrid (QEA + QPSO)'])
    for (const r of n.value.runs) {
      expect(r.series.length).toBeGreaterThan(0)
      expect(r.final.hypervolume).toBeGreaterThanOrEqual(0)
      expect(r.final.hypervolume).toBeLessThanOrEqual(1)
    }
  })
})
