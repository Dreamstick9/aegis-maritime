import { describe, expect, it } from 'vitest'
import { FLEET } from '../../data/fleet'
import { PORTS } from '../../data/ports'
import { SCENARIOS } from '../../data/scenarios'
import { approachFor, generateCorridor } from '../corridors'
import { evaluateDecision, SPEED_LEGS } from '../evaluate'
import { MODE_PRESETS, runOptimizer, type OptimizerProblem } from '../optimizer'
import type { EngineSettings, OptimizerRunResult } from '../types'
import { isLand } from '../zones'

const settings: EngineSettings = {
  mode: 'FAST',
  ...MODE_PRESETS.FAST,
  population: 10,
  iterations: 6,
  weatherScenarios: 3,
  cvarAlpha: 0.95,
  seed: 7,
  accounting: 'WtW',
  safety: { maxHsM: 6, maxWindKn: 50, minUkcM: 1.0 },
  segmentNm: 60,
}

function problem(id: 'normal' | 'storm' | 'altfuel' | 'fleet', over: Partial<EngineSettings> = {}): OptimizerProblem {
  const sc = SCENARIOS[id]
  return {
    vessels: FLEET,
    ports: PORTS,
    mission: sc.mission,
    ocean: sc.ocean,
    settings: { ...settings, ...over },
    start: { position: PORTS.INMRM.position, tH: 0, fuelUsedT: 0, co2UsedT: 0, costUsedUsd: 0, distanceDoneNm: 0 },
    planningTimeH: 0,
    approach: approachFor(PORTS.INMRM, PORTS.SGSIN),
  }
}

function drain(p: OptimizerProblem): { result: OptimizerRunResult; events: number } {
  const gen = runOptimizer(p)
  let events = 0
  for (;;) {
    const n = gen.next()
    if (n.done) return { result: n.value, events }
    events++
  }
}

describe('corridors', () => {
  it('A* finds a sea-only corridor of plausible length', () => {
    const sc = SCENARIOS.normal
    const c = generateCorridor('shortest', {
      origin: PORTS.INMRM.position,
      destination: PORTS.SGSIN.position,
      approach: approachFor(PORTS.INMRM, PORTS.SGSIN),
      ocean: sc.ocean,
      oceanOpts: { planningTimeH: 0 },
      startTimeH: 0,
      assumedSpeedKn: 12.5,
      requiredDepthM: 16,
      kinds: ['shortest'],
    })
    expect(c).not.toBeNull()
    expect(c!.distanceNm).toBeGreaterThan(1950)
    expect(c!.distanceNm).toBeLessThan(2450)
    // open-sea waypoints (skip berth/pilotage points) must not be on land
    for (const w of c!.waypoints.slice(2, -4)) expect(isLand(w.lat, w.lon)).toBe(false)
  })
})

describe('evaluator', () => {
  it('faster constant speed burns more fuel and arrives sooner', () => {
    const sc = SCENARIOS.normal
    const c = generateCorridor('shortest', {
      origin: PORTS.INMRM.position,
      destination: PORTS.SGSIN.position,
      approach: approachFor(PORTS.INMRM, PORTS.SGSIN),
      ocean: sc.ocean,
      oceanOpts: { planningTimeH: 0 },
      startTimeH: 0,
      assumedSpeedKn: 12.5,
      requiredDepthM: 16,
      kinds: ['shortest'],
    })!
    const ctx = {
      vessels: Object.fromEntries(FLEET.map((v) => [v.id, v])),
      corridors: { [c.id]: c },
      ports: PORTS,
      mission: sc.mission,
      ocean: sc.ocean,
      oceanOpts: { planningTimeH: 0 },
      settings,
      start: { position: PORTS.INMRM.position, tH: 0, fuelUsedT: 0, co2UsedT: 0, costUsedUsd: 0, distanceDoneNm: 0 },
    }
    const slow = evaluateDecision({ vesselId: 'AK', corridorId: c.id, fuelId: 'VLSFO', shorePower: false, legSpeedsKn: new Array(SPEED_LEGS).fill(11) }, ctx)
    const fast = evaluateDecision({ vesselId: 'AK', corridorId: c.id, fuelId: 'VLSFO', shorePower: false, legSpeedsKn: new Array(SPEED_LEGS).fill(14) }, ctx)
    expect(fast.totals.fuelT).toBeGreaterThan(slow.totals.fuelT)
    expect(fast.totals.timeH).toBeLessThan(slow.totals.timeH)
    expect(slow.totals.fuelT).toBeGreaterThan(150)
    expect(slow.totals.fuelT).toBeLessThan(700)
    expect(slow.totals.co2WtwT).toBeGreaterThan(slow.totals.co2TtwT)
    const shore = evaluateDecision({ ...slow.decision, shorePower: true }, ctx)
    expect(shore.totals.portCo2T).toBeLessThan(slow.totals.portCo2T)
    expect(shore.totals.shorePowerKwh).toBeGreaterThan(0)
    const nh3 = evaluateDecision({ ...slow.decision, fuelId: 'NH3' }, ctx)
    expect(nh3.feasible).toBe(false)
    expect(nh3.violations.join(' ')).toMatch(/not available|cannot burn/)
  })
})

describe('optimizer', () => {
  it('produces corridors, a Pareto archive and named solutions; deterministic per seed', () => {
    const { result, events } = drain(problem('normal'))
    expect(events).toBeGreaterThan(6)
    expect(result.corridors.length).toBeGreaterThanOrEqual(2)
    expect(result.archive.length).toBeGreaterThan(0)
    expect(result.named.some((s) => s.labels.includes('Balanced'))).toBe(true)
    for (const s of result.archive) {
      expect(s.feasible).toBe(true)
      expect(s.totals.fuelT).toBeGreaterThan(100)
      expect(s.totals.fuelT).toBeLessThan(900)
      expect(s.totals.timeH).toBeGreaterThan(120)
      expect(s.totals.timeH).toBeLessThan(300)
    }
    expect(result.convergence.length).toBe(6)
    const again = drain(problem('normal')).result
    expect(again.archive.map((s) => s.objectives)).toEqual(result.archive.map((s) => s.objectives))
  })
  it('fleet allocation excludes hulls that cannot carry the cargo', () => {
    const { result } = drain(problem('fleet'))
    const used = new Set(result.archive.map((s) => s.decision.vesselId))
    expect(used.has('AS')).toBe(false)
    expect(used.has('AN')).toBe(false)
  })
  it('ROBUST mode attaches CVaR statistics', () => {
    const { result } = drain(problem('storm', { mode: 'ROBUST', useCvar: true, iterations: 4, population: 8 }))
    expect(result.archive.every((s) => s.cvar && s.cvar.riskCvar >= s.cvar.riskMean - 1e-9)).toBe(true)
  })
})

describe('infeasible mission', () => {
  it('reports why no plan exists when the arrival window is impossibly tight', () => {
    const p = problem('normal')
    p.mission = { ...p.mission, arrivalLatest: '2026-07-17T06:00:00Z' } // 72 h for ~2,300 nm
    const { result } = drain(p)
    expect(result.archive.length).toBe(0)
    expect(result.named.length).toBe(0)
    expect(result.violationTally.length).toBeGreaterThan(0)
    expect(result.violationTally[0].reason).toMatch(/ETA/)
    expect(result.violationTally[0].count).toBeGreaterThan(10)
  })
  it('lists excluded hulls with reasons in a fleet-allocation run', () => {
    const { result } = drain(problem('fleet'))
    expect(result.excluded.map((x) => x.vesselId).sort()).toEqual(['AN', 'AS'])
    expect(result.excluded[0].reason).toMatch(/deadweight/)
  })
})
