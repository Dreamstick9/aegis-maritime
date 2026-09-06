/**
 * Local benchmark harness: runs classical comparators (weighted-sum GA, NSGA-II, PSO, and the
 * A* corridor + constant-speed sweep) on the SAME evaluator, corridors and evaluation budget as
 * the quantum-inspired hybrid, tracking the hypervolume of everything found so far.
 * SYNTHETIC BENCHMARK on a toy problem: evidence of behaviour on this demo, not of quantum
 * advantage or of performance on real operations.
 */
import { generateCorridor } from './corridors'
import { evaluateDecision, SPEED_LEGS, type EvalContext } from './evaluate'
import { Hypervolume, ParetoArchive, crowdingDistance, nonDominatedSort, scalarise } from './pareto'
import { Rng } from './rng'
import { CORRIDOR_KINDS, candidateVessels, runOptimizer, weightsVector, type OptimizerProblem } from './optimizer'
import type { Corridor, Decision, EngineSettings, Evaluation, FuelId, Vessel } from './types'

export interface BenchSeries {
  name: string
  series: { evaluations: number; hypervolume: number }[]
  final: { hypervolume: number; bestFuelT: number; bestCo2T: number; bestCostUsd: number; archive: number }
  timeMs: number
  note: string
}

interface Space {
  vessels: Vessel[]
  corridors: Corridor[]
  fuels: FuelId[]
  shore: boolean[]
  ctx: EvalContext
  lower: number[]
  upper: number[]
  w: number[]
}

function buildSpace(p: OptimizerProblem, settings: EngineSettings): Space {
  const { usable } = candidateVessels(p)
  const origin = p.ports[p.mission.originId]
  const dest = p.ports[p.mission.destinationId]
  const corridors: Corridor[] = []
  for (const kind of CORRIDOR_KINDS) {
    const c = generateCorridor(kind, { origin: origin.position, destination: dest.position, approach: p.approach, ocean: p.ocean, oceanOpts: { planningTimeH: 0 }, startTimeH: 0, assumedSpeedKn: 12.5, requiredDepthM: 17, kinds: CORRIDOR_KINDS, idPrefix: 'bench' })
    if (c) corridors.push(c)
  }
  const ctx: EvalContext = {
    vessels: Object.fromEntries(p.vessels.map((v) => [v.id, v])),
    corridors: Object.fromEntries(corridors.map((c) => [c.id, c])),
    ports: p.ports,
    mission: p.mission,
    ocean: p.ocean,
    oceanOpts: { planningTimeH: 0 },
    settings,
    start: p.start,
  }
  const fuels = p.mission.allowedFuels.filter((f) => usable.some((v) => v.fuels.includes(f)))
  const base = evaluateDecision({ vesselId: usable[0].id, corridorId: corridors[0].id, fuelId: fuels.includes('VLSFO') ? 'VLSFO' : fuels[0], shorePower: false, legSpeedsKn: new Array(SPEED_LEGS).fill(usable[0].designSpeedKn) }, ctx)
  return {
    vessels: usable,
    corridors,
    fuels,
    shore: p.mission.shorePower === 'never' ? [false] : p.mission.shorePower === 'require' ? [true] : [false, true],
    ctx,
    lower: [base.totals.fuelT * 0.5, base.totals.costUsd * 0.55, base.objectives[2] * 0.25, 0, base.totals.timeH * 0.75],
    upper: [base.totals.fuelT * 1.35, base.totals.costUsd * 1.45, base.objectives[2] * 1.35, 1, base.totals.timeH * 1.5],
    w: weightsVector(p.mission),
  }
}

/** genome: [vessel, corridor, fuel, shore, speeds×6, extra] all in [0,1] */
const DIMS = 4 + SPEED_LEGS + 1

function decode(x: number[], sp: Space): Decision {
  const pick = <T,>(arr: T[], u: number) => arr[Math.min(arr.length - 1, Math.floor(u * arr.length))]
  const v = pick(sp.vessels, x[0])
  return {
    vesselId: v.id,
    corridorId: pick(sp.corridors, x[1]).id,
    fuelId: pick(sp.fuels, x[2]),
    shorePower: pick(sp.shore, x[3]),
    legSpeedsKn: x.slice(4, 4 + SPEED_LEGS).map((u) => v.minSpeedKn + u * (v.maxSpeedKn - v.minSpeedKn)),
  }
}

interface Tracked {
  archive: ParetoArchive<Evaluation>
  hv: Hypervolume
  series: { evaluations: number; hypervolume: number }[]
  evaluations: number
}

function tracker(sp: Space, seed: number): Tracked {
  return { archive: new ParetoArchive<Evaluation>(60), hv: new Hypervolume(sp.lower, sp.upper, 1024, seed), series: [], evaluations: 0 }
}

function record(t: Tracked, e: Evaluation) {
  t.evaluations++
  if (e.feasible) t.archive.add(e)
}

function snapshot(t: Tracked) {
  t.series.push({ evaluations: t.evaluations, hypervolume: t.hv.compute(t.archive.items.map((s) => s.objectives)) })
}

function finalise(name: string, t: Tracked, t0: number, note: string): BenchSeries {
  snapshot(t)
  const objs = t.archive.items.map((s) => s.objectives)
  return {
    name,
    series: t.series,
    final: {
      hypervolume: t.series[t.series.length - 1]?.hypervolume ?? 0,
      bestFuelT: objs.length ? Math.min(...objs.map((o) => o[0])) : 0,
      bestCo2T: objs.length ? Math.min(...objs.map((o) => o[2])) : 0,
      bestCostUsd: objs.length ? Math.min(...objs.map((o) => o[1])) : 0,
      archive: t.archive.items.length,
    },
    timeMs: performance.now() - t0,
    note,
  }
}

function penalised(e: Evaluation, sp: Space): number {
  return scalarise(e.objectives, sp.w, sp.lower, sp.upper) + (e.feasible ? 0 : 1.5 + 0.5 * e.violations.length)
}

/** Weighted-sum genetic algorithm (tournament, uniform crossover, gaussian mutation). */
export function runGA(sp: Space, pop: number, gens: number, seed: number): BenchSeries {
  const t0 = performance.now()
  const rng = new Rng(seed).fork('ga')
  const t = tracker(sp, seed)
  let P = Array.from({ length: pop }, () => Array.from({ length: DIMS }, () => rng.next()))
  let F = P.map((x) => {
    const e = evaluateDecision(decode(x, sp), sp.ctx)
    record(t, e)
    return penalised(e, sp)
  })
  snapshot(t)
  for (let g = 0; g < gens; g++) {
    const next: number[][] = []
    const tourn = () => {
      const a = rng.int(pop)
      const b = rng.int(pop)
      return F[a] < F[b] ? P[a] : P[b]
    }
    // elitism
    const bestIdx = F.indexOf(Math.min(...F))
    next.push([...P[bestIdx]])
    while (next.length < pop) {
      const a = tourn()
      const b = tourn()
      const child = a.map((v, i) => (rng.next() < 0.5 ? v : b[i]))
      for (let i = 0; i < DIMS; i++) if (rng.next() < 0.15) child[i] = Math.min(1, Math.max(0, child[i] + 0.15 * rng.gauss()))
      next.push(child)
    }
    P = next
    F = P.map((x) => {
      const e = evaluateDecision(decode(x, sp), sp.ctx)
      record(t, e)
      return penalised(e, sp)
    })
    snapshot(t)
  }
  return finalise('GA (weighted sum)', t, t0, 'single-objective scalarisation with mission weights; archive built from all feasible evaluations')
}

/** NSGA-II (Deb et al. 2002): non-dominated sorting + crowding, binary tournament, blend crossover. */
export function runNSGA2(sp: Space, pop: number, gens: number, seed: number): BenchSeries {
  const t0 = performance.now()
  const rng = new Rng(seed).fork('nsga2')
  const t = tracker(sp, seed)
  type Ind = { x: number[]; e: Evaluation; rank: number; cd: number }
  const evalInd = (x: number[]): Ind => {
    const e = evaluateDecision(decode(x, sp), sp.ctx)
    record(t, e)
    return { x, e, rank: 0, cd: 0 }
  }
  const constrainedObjs = (e: Evaluation) => (e.feasible ? e.objectives : e.objectives.map((_, i) => sp.upper[i] * (1 + e.violations.length)))
  const assign = (inds: Ind[]) => {
    const fronts = nonDominatedSort(inds.map((i) => constrainedObjs(i.e)))
    fronts.forEach((f, r) => {
      const cd = crowdingDistance(f.map((i) => constrainedObjs(inds[i].e)))
      f.forEach((i, k) => {
        inds[i].rank = r
        inds[i].cd = cd[k]
      })
    })
    return fronts
  }
  let P = Array.from({ length: pop }, () => evalInd(Array.from({ length: DIMS }, () => rng.next())))
  assign(P)
  snapshot(t)
  const better = (a: Ind, b: Ind) => a.rank < b.rank || (a.rank === b.rank && a.cd > b.cd)
  for (let g = 0; g < gens; g++) {
    const Q: Ind[] = []
    while (Q.length < pop) {
      const pa = [P[rng.int(pop)], P[rng.int(pop)]].sort((a, b) => (better(a, b) ? -1 : 1))[0]
      const pb = [P[rng.int(pop)], P[rng.int(pop)]].sort((a, b) => (better(a, b) ? -1 : 1))[0]
      const child = pa.x.map((v, i) => {
        const beta = rng.range(-0.25, 1.25)
        const c = i < 4 ? (rng.next() < 0.5 ? v : pb.x[i]) : v * beta + pb.x[i] * (1 - beta)
        return Math.min(1, Math.max(0, rng.next() < 0.12 ? c + 0.12 * rng.gauss() : c))
      })
      Q.push(evalInd(child))
    }
    const R = [...P, ...Q]
    const fronts = assign(R)
    const nextP: Ind[] = []
    for (const f of fronts) {
      if (nextP.length + f.length <= pop) f.forEach((i) => nextP.push(R[i]))
      else {
        const sorted = f.map((i) => R[i]).sort((a, b) => b.cd - a.cd)
        nextP.push(...sorted.slice(0, pop - nextP.length))
        break
      }
    }
    P = nextP
    snapshot(t)
  }
  return finalise('NSGA-II', t, t0, 'multi-objective reference; same evaluator, corridors and budget')
}

/** Canonical PSO (Kennedy & Eberhart) on the weighted-sum scalar; discrete genes rounded at decode. */
export function runPSO(sp: Space, pop: number, gens: number, seed: number): BenchSeries {
  const t0 = performance.now()
  const rng = new Rng(seed).fork('pso')
  const t = tracker(sp, seed)
  const X = Array.from({ length: pop }, () => Array.from({ length: DIMS }, () => rng.next()))
  const V = Array.from({ length: pop }, () => Array.from({ length: DIMS }, () => rng.range(-0.1, 0.1)))
  const pb = X.map((x) => [...x])
  const pf = X.map((x) => {
    const e = evaluateDecision(decode(x, sp), sp.ctx)
    record(t, e)
    return penalised(e, sp)
  })
  let gi = pf.indexOf(Math.min(...pf))
  snapshot(t)
  for (let g = 0; g < gens; g++) {
    for (let i = 0; i < pop; i++) {
      for (let k = 0; k < DIMS; k++) {
        V[i][k] = 0.72 * V[i][k] + 1.49 * rng.next() * (pb[i][k] - X[i][k]) + 1.49 * rng.next() * (pb[gi][k] - X[i][k])
        V[i][k] = Math.max(-0.25, Math.min(0.25, V[i][k]))
        X[i][k] = Math.min(1, Math.max(0, X[i][k] + V[i][k]))
      }
      const e = evaluateDecision(decode(X[i], sp), sp.ctx)
      record(t, e)
      const f = penalised(e, sp)
      if (f < pf[i]) {
        pf[i] = f
        pb[i] = [...X[i]]
        if (f < pf[gi]) gi = i
      }
    }
    snapshot(t)
  }
  return finalise('PSO (weighted sum)', t, t0, 'canonical inertia-weight PSO on the scalarised objective')
}

/** A* corridors with a constant-speed sweep (the classical deterministic reference). */
export function runAStarSweep(sp: Space, seed: number): BenchSeries {
  const t0 = performance.now()
  const t = tracker(sp, seed)
  const v = sp.vessels[0]
  const fuel = sp.fuels.includes('VLSFO') ? 'VLSFO' : sp.fuels[0]
  for (const c of sp.corridors) {
    for (let s = v.minSpeedKn; s <= v.maxSpeedKn + 1e-9; s += 0.5) {
      record(t, evaluateDecision({ vesselId: v.id, corridorId: c.id, fuelId: fuel, shorePower: false, legSpeedsKn: new Array(SPEED_LEGS).fill(s) }, sp.ctx))
      if (t.evaluations % 8 === 0) snapshot(t)
    }
  }
  return finalise('A* + constant speed', t, t0, 'deterministic: four A* corridors × constant speed sweep, default fuel, no shore power')
}

/** The hybrid engine itself, run through the same tracker for a like-for-like curve. */
export function runHybrid(p: OptimizerProblem, sp: Space): BenchSeries {
  const t0 = performance.now()
  const gen = runOptimizer({ ...p, idPrefix: 'bench' })
  let r = gen.next()
  while (!r.done) r = gen.next()
  const res = r.value
  const hv = new Hypervolume(sp.lower, sp.upper, 1024, p.settings.seed)
  const series = res.convergence.map((c) => ({ evaluations: c.evaluations, hypervolume: c.hypervolume }))
  const objs = res.archive.map((s) => s.objectives)
  return {
    name: 'QI hybrid (QEA + QPSO)',
    series,
    final: { hypervolume: hv.compute(objs), bestFuelT: Math.min(...objs.map((o) => o[0])), bestCo2T: Math.min(...objs.map((o) => o[2])), bestCostUsd: Math.min(...objs.map((o) => o[1])), archive: res.archive.length },
    timeMs: performance.now() - t0,
    note: 'this product’s engine; CVaR phase excluded from the curve for parity',
  }
}

export interface BenchmarkResult {
  runs: BenchSeries[]
  budget: { population: number; generations: number }
  seeds: number[]
}

/** Runs every comparator with an equal population × generation budget. Generator yields progress 0..1. */
export function* runBenchmark(p: OptimizerProblem, seeds: number[]): Generator<{ progress: number; message: string }, BenchmarkResult, void> {
  const settings: EngineSettings = { ...p.settings, mode: 'FAST', useCvar: false, population: Math.min(p.settings.population, 20), iterations: Math.min(p.settings.iterations, 30) }
  const prob = { ...p, settings }
  const sp = buildSpace(prob, settings)
  const acc: Record<string, BenchSeries[]> = {}
  const total = seeds.length * 5
  let done = 0
  const push = (b: BenchSeries) => {
    ;(acc[b.name] ??= []).push(b)
    done++
  }
  for (const seed of seeds) {
    const s = { ...settings, seed }
    yield { progress: done / total, message: `seed ${seed}: A* sweep` }
    push(runAStarSweep(sp, seed))
    yield { progress: done / total, message: `seed ${seed}: GA` }
    push(runGA({ ...sp, ctx: { ...sp.ctx, settings: s } }, s.population, s.iterations, seed))
    yield { progress: done / total, message: `seed ${seed}: NSGA-II` }
    push(runNSGA2({ ...sp, ctx: { ...sp.ctx, settings: s } }, s.population, s.iterations, seed))
    yield { progress: done / total, message: `seed ${seed}: PSO` }
    push(runPSO({ ...sp, ctx: { ...sp.ctx, settings: s } }, s.population, s.iterations, seed))
    yield { progress: done / total, message: `seed ${seed}: QI hybrid` }
    push(runHybrid({ ...prob, settings: s }, sp))
  }
  // average across seeds (mean series on a common evaluation grid)
  const runs: BenchSeries[] = Object.values(acc).map((list) => {
    const maxEval = Math.max(...list.map((b) => b.series[b.series.length - 1]?.evaluations ?? 0))
    const grid = Array.from({ length: 25 }, (_, i) => Math.round((maxEval * (i + 1)) / 25))
    const series = grid.map((ev) => ({ evaluations: ev, hypervolume: list.reduce((s, b) => s + hvAt(b.series, ev), 0) / list.length }))
    const mean = (f: (b: BenchSeries) => number) => list.reduce((s, b) => s + f(b), 0) / list.length
    return {
      name: list[0].name,
      series,
      final: { hypervolume: mean((b) => b.final.hypervolume), bestFuelT: mean((b) => b.final.bestFuelT), bestCo2T: mean((b) => b.final.bestCo2T), bestCostUsd: mean((b) => b.final.bestCostUsd), archive: mean((b) => b.final.archive) },
      timeMs: mean((b) => b.timeMs),
      note: list[0].note,
    }
  })
  return { runs, budget: { population: settings.population, generations: settings.iterations }, seeds }
}

function hvAt(series: { evaluations: number; hypervolume: number }[], ev: number): number {
  let h = 0
  for (const s of series) {
    if (s.evaluations <= ev) h = s.hypervolume
    else break
  }
  return h
}
