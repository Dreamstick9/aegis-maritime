/**
 * Hybrid quantum-inspired multi-objective engine (local V1 demonstration).
 *
 *  • Discrete layer: QEA-style Q-registers. Each decision (vessel, corridor, fuel, shore
 *    power) is a probability-amplitude vector; "observation" collapses it to a choice and a
 *    rotation-style update moves amplitude toward guide solutions drawn from the Pareto
 *    archive (Han & Kim 2002 generalised from Q-bits to categorical registers, with an
 *    amplitude floor to preserve exploration).
 *  • Continuous layer: QPSO (Sun, Feng & Xu 2004): speed profile particles attracted to a
 *    blend of personal best and archive guide around the swarm mean-best with a
 *    contraction-expansion coefficient β.
 *  • Pareto archive with crowding-distance pruning; Monte-Carlo hypervolume for convergence.
 *  • Optional in-loop CVaR over weather perturbations (ROBUST mode).
 *
 * This is a classical simulation of quantum-inspired heuristics. No quantum hardware, no
 * claim of quantum speed-up.
 */
import { generateCorridor, type ApproachPlan } from './corridors'
import { cvar, makePerturbations, mean, type Perturbation } from './cvar'
import { evaluateDecision, SPEED_LEGS, STORES_T, type EvalContext } from './evaluate'
import { FUELS } from './fuels'
import type { OceanOptions } from './ocean'
import { Hypervolume, ParetoArchive, scalarise } from './pareto'
import { Rng } from './rng'
import type { Corridor, CorridorKind, Decision, EngineSettings, Evaluation, FuelId, Mission, OceanConfig, OptimizerRunResult, Port, ProgressEvent, Solution, SolutionLabel, StartState, Vessel } from './types'
import { loadingCondition } from './vessel'

export interface OptimizerProblem {
  vessels: Vessel[]
  ports: Record<string, Port>
  mission: Mission
  ocean: OceanConfig
  settings: EngineSettings
  start: StartState
  planningTimeH: number
  approach: ApproachPlan
  fixed?: { vesselId?: string; fuelId?: FuelId }
  idPrefix?: string
  /** override generations (used by rolling re-plan to stay responsive) */
  iterations?: number
}

export const MODE_PRESETS: Record<EngineSettings['mode'], Pick<EngineSettings, 'population' | 'iterations' | 'weatherScenarios' | 'useCvar'>> = {
  FAST: { population: 14, iterations: 22, weatherScenarios: 4, useCvar: false },
  BALANCED: { population: 22, iterations: 40, weatherScenarios: 8, useCvar: true },
  ROBUST: { population: 28, iterations: 55, weatherScenarios: 12, useCvar: true },
}

export const CORRIDOR_KINDS: CorridorKind[] = ['shortest', 'weather', 'offshore', 'current']

interface Register {
  p: number[]
}

interface Individual {
  registers: Register[]
  x: number[]
  pbestX: number[] | null
  pbestScalar: number
  pbestBits: number[] | null
}

interface Guided extends Solution {
  _x: number[]
  _bits: number[]
}

const DIMS = SPEED_LEGS + 1

export function weightsVector(m: Mission): number[] {
  const w = [m.weights.fuel, m.weights.cost, m.weights.emissions, m.weights.risk, m.weights.time]
  const s = w.reduce((a, b) => a + b, 0) || 1
  return w.map((x) => x / s)
}

function speedsFromX(v: Vessel, x: number[]): number[] {
  return x.slice(0, SPEED_LEGS).map((u) => v.minSpeedKn + u * (v.maxSpeedKn - v.minSpeedKn))
}

export function candidateVessels(p: OptimizerProblem): { usable: Vessel[]; excluded: { vessel: Vessel; reason: string }[] } {
  const usable: Vessel[] = []
  const excluded: { vessel: Vessel; reason: string }[] = []
  const list = p.fixed?.vesselId ? p.vessels.filter((v) => v.id === p.fixed?.vesselId) : p.mission.vesselId === 'auto' ? p.vessels : p.vessels.filter((v) => v.id === p.mission.vesselId)
  for (const v of list) {
    const lc = loadingCondition(v, p.mission.cargoT, 1500 + STORES_T)
    if (!lc.capacityOk) {
      excluded.push({ vessel: v, reason: `deadweight ${v.dwt.toLocaleString()} t < cargo + bunkers ${Math.round(lc.deadweightUsedT).toLocaleString()} t` })
      continue
    }
    if (!v.fuels.some((f) => p.mission.allowedFuels.includes(f))) {
      excluded.push({ vessel: v, reason: 'no mission-allowed fuel is compatible' })
      continue
    }
    // the same port limits the evaluator enforces (draught with tide, LOA and beam at both ports)
    const origin = p.ports[p.mission.originId]
    const dest = p.ports[p.mission.destinationId]
    if (origin && dest) {
      const ukc = p.settings.safety.minUkcM
      const oLim = origin.limits
      const dLim = dest.limits
      if (lc.sailingDraftM + ukc > oLim.innerChannelDepthM + oLim.tidalRangeM) {
        excluded.push({ vessel: v, reason: `sailing draught ${lc.sailingDraftM.toFixed(1)} m cannot clear ${origin.name} inner channel (${oLim.innerChannelDepthM} m + ${oLim.tidalRangeM} m tide)` })
        continue
      }
      if (lc.sailingDraftM + ukc > dLim.berthDepthM + dLim.tidalRangeM) {
        excluded.push({ vessel: v, reason: `draught ${lc.sailingDraftM.toFixed(1)} m exceeds ${dest.name} berth depth ${dLim.berthDepthM} m plus ${dLim.tidalRangeM} m tide` })
        continue
      }
      if (v.loaM > dLim.maxLoaM || v.beamM > dLim.maxBeamM) {
        excluded.push({ vessel: v, reason: `${v.loaM} m LOA or ${v.beamM} m beam exceeds ${dest.name} limits (${dLim.maxLoaM} m, ${dLim.maxBeamM} m)` })
        continue
      }
      if (v.loaM > oLim.maxLoaM || v.beamM > oLim.maxBeamM) {
        excluded.push({ vessel: v, reason: `${v.loaM} m LOA or ${v.beamM} m beam exceeds ${origin.name} limits (${oLim.maxLoaM} m, ${oLim.maxBeamM} m)` })
        continue
      }
    }
    usable.push(v)
  }
  return { usable, excluded }
}

function requiredDepth(vessels: Vessel[], mission: Mission, settings: EngineSettings): number {
  let d = 0
  for (const v of vessels) d = Math.max(d, loadingCondition(v, mission.cargoT, 1500 + STORES_T).sailingDraftM)
  return d + settings.safety.minUkcM
}

export function* runOptimizer(p: OptimizerProblem): Generator<ProgressEvent, OptimizerRunResult, void> {
  const t0 = performance.now()
  const settings = p.settings
  const rng = new Rng(settings.seed).fork(`opt:${p.idPrefix ?? 'plan'}:${p.planningTimeH}`)
  const iterations = p.iterations ?? settings.iterations
  const oceanOpts: OceanOptions = { planningTimeH: p.planningTimeH }
  let evaluations = 0
  const ev = (partial: Partial<ProgressEvent>): ProgressEvent => ({
    phase: 'search',
    progress: 0,
    generation: 0,
    evaluations,
    archiveSize: 0,
    hypervolume: 0,
    bestFuelT: 0,
    bestCo2T: 0,
    bestCostUsd: 0,
    message: '',
    elapsedMs: performance.now() - t0,
    ...partial,
  })

  // 1. vessels
  const { usable, excluded } = candidateVessels(p)
  const tally = new Map<string, number>()
  const tallyViolations = (e: Evaluation) => {
    for (const v of e.violations) {
      // collapse per-segment details so identical constraints group together
      const key = v.replace(/ at segment \d+.*$/, '').replace(/\d+(\.\d+)? h after/, 'after').replace(/[-+]?\d+(\.\d+)?/g, (m) => (v.startsWith('ETA') ? '' : m)).trim()
      tally.set(key, (tally.get(key) ?? 0) + 1)
    }
  }
  if (!usable.length) throw new Error('No vessel in the fleet can carry this cargo with a mission-allowed fuel.')
  yield ev({ phase: 'ocean', progress: 0.03, message: `Digital-ocean grid ready, ${usable.length} candidate hull(s)` })

  // 2. corridors
  const corridors: Corridor[] = []
  const origin = p.ports[p.mission.originId]
  const dest = p.ports[p.mission.destinationId]
  const reqDepth = requiredDepth(usable, p.mission, settings)
  for (let i = 0; i < CORRIDOR_KINDS.length; i++) {
    const kind = CORRIDOR_KINDS[i]
    const c = generateCorridor(kind, {
      origin: origin.position,
      destination: dest.position,
      approach: p.approach,
      ocean: p.ocean,
      oceanOpts,
      startTimeH: p.start.tH,
      assumedSpeedKn: 12.5,
      requiredDepthM: reqDepth,
      kinds: CORRIDOR_KINDS,
      fromPosition: p.start.tH > 0 ? p.start.position : undefined,
      idPrefix: p.idPrefix,
    })
    // a spliced strait passage yields the same track for every kind; keep one so the archive is not padded with twins
    const twin = c && corridors.some((o) => o.waypoints.length === c.waypoints.length && Math.abs(o.distanceNm - c.distanceNm) < 0.1)
    if (c && !twin) corridors.push(c)
    yield ev({ phase: 'corridors', progress: 0.05 + 0.1 * ((i + 1) / CORRIDOR_KINDS.length), message: c ? `A* corridor ${i + 1}/${CORRIDOR_KINDS.length}: ${c.name}, ${Math.round(c.distanceNm)} nm` : `A* corridor ${kind}: no path` })
  }
  if (!corridors.length) throw new Error('No navigable corridor found.')

  const ctx: EvalContext = {
    vessels: Object.fromEntries(p.vessels.map((v) => [v.id, v])),
    corridors: Object.fromEntries(corridors.map((c) => [c.id, c])),
    ports: p.ports,
    mission: p.mission,
    ocean: p.ocean,
    oceanOpts,
    settings,
    start: p.start,
  }

  // decision space
  const fuelOptions: FuelId[] = p.fixed?.fuelId ? [p.fixed.fuelId] : p.mission.allowedFuels.filter((f) => usable.some((v) => v.fuels.includes(f)))
  if (!fuelOptions.length) throw new Error('No mission-allowed fuel is compatible with the candidate vessels.')
  const shoreOptions = p.mission.shorePower === 'never' ? [false] : p.mission.shorePower === 'require' ? [true] : [false, true]
  const sizes = [usable.length, corridors.length, fuelOptions.length, shoreOptions.length]

  const decode = (bits: number[], x: number[]): Decision => {
    const v = usable[bits[0]]
    return {
      vesselId: v.id,
      corridorId: corridors[bits[1]].id,
      fuelId: fuelOptions[bits[2]],
      shorePower: shoreOptions[bits[3]],
      legSpeedsKn: speedsFromX(v, x),
    }
  }

  // 3. baseline & classical references
  const baseVessel = usable.find((v) => v.id === (p.fixed?.vesselId ?? p.mission.vesselId)) ?? usable[0]
  const baseFuel: FuelId = p.fixed?.fuelId ?? (fuelOptions.includes('VLSFO') ? 'VLSFO' : fuelOptions[0])
  const shortest = corridors.find((c) => c.kind === 'shortest') ?? corridors[0]
  const baseline = evaluateDecision(
    { vesselId: baseVessel.id, corridorId: shortest.id, fuelId: baseFuel, shorePower: false, legSpeedsKn: new Array(SPEED_LEGS).fill(baseVessel.designSpeedKn) },
    ctx,
  )
  evaluations++
  const w = weightsVector(p.mission)
  const lower = [baseline.totals.fuelT * 0.5, baseline.totals.costUsd * 0.55, baseline.objectives[2] * 0.25, 0, baseline.totals.timeH * 0.75]
  const upper = [baseline.totals.fuelT * 1.35, baseline.totals.costUsd * 1.45, baseline.objectives[2] * 1.35, 1, baseline.totals.timeH * 1.5]
  const hv = new Hypervolume(lower, upper, 1024, settings.seed)

  // 4a. archive (created here so the deterministic references become archive members too: the
  // Pareto set must not exclude a plan merely because the stochastic search did not sample it)
  const archive = new ParetoArchive<Guided>(60)
  const bitsFor = (d: Decision): number[] => [usable.findIndex((v) => v.id === d.vesselId), corridors.findIndex((c) => c.id === d.corridorId), fuelOptions.indexOf(d.fuelId), shoreOptions.indexOf(d.shorePower)]
  const xFor = (d: Decision): number[] => {
    const v = ctx.vessels[d.vesselId]
    return [...d.legSpeedsKn.map((sp) => (sp - v.minSpeedKn) / (v.maxSpeedKn - v.minSpeedKn)), 0.5]
  }
  const addReference = (e: Evaluation) => {
    if (e.feasible) archive.add({ ...e, id: `ref${evaluations}`, labels: [], _x: xFor(e.decision), _bits: bitsFor(e.decision) })
  }
  addReference(baseline)
  tallyViolations(baseline)
  let classical: Evaluation = baseline
  let classicalScore = Infinity
  for (const c of corridors) {
    for (let s = baseVessel.minSpeedKn; s <= baseVessel.maxSpeedKn + 1e-9; s += 0.5) {
      const e = evaluateDecision({ vesselId: baseVessel.id, corridorId: c.id, fuelId: baseFuel, shorePower: false, legSpeedsKn: new Array(SPEED_LEGS).fill(s) }, ctx)
      evaluations++
      tallyViolations(e)
      if (!e.feasible) continue
      addReference(e)
      const sc = scalarise(e.objectives, w, lower, upper)
      if (sc < classicalScore) {
        classicalScore = sc
        classical = e
      }
    }
  }
  yield ev({ phase: 'corridors', progress: 0.17, message: `Baseline ${Math.round(baseline.totals.fuelT)} t fuel, classical constant-speed sweep ${Math.round(classical.totals.fuelT)} t` })

  // 4. hybrid search
  const perturbations: Perturbation[] = makePerturbations(settings.seed, settings.weatherScenarios)
  const inLoopCvar = settings.mode === 'ROBUST' && settings.useCvar
  const population: Individual[] = Array.from({ length: settings.population }, () => ({
    registers: sizes.map((n) => ({ p: new Array(n).fill(1 / n) })),
    x: Array.from({ length: DIMS }, () => rng.next()),
    pbestX: null,
    pbestScalar: Infinity,
    pbestBits: null,
  }))
  // seed a few particles near sensible speeds (design speed ±) so early generations are feasible
  for (let i = 0; i < Math.min(4, population.length); i++) {
    const v = usable[i % usable.length]
    const u = (12.5 + rng.range(-1.5, 1.5) - v.minSpeedKn) / (v.maxSpeedKn - v.minSpeedKn)
    population[i].x = population[i].x.map(() => Math.min(1, Math.max(0, u + rng.range(-0.05, 0.05))))
  }
  const eta = settings.mode === 'FAST' ? 0.14 : 0.09
  const floor = 0.02
  const convergence: OptimizerRunResult['convergence'] = []
  let bestHv = 0
  let stagnation = 0

  const evaluateWithRisk = (d: Decision): { evaluation: Evaluation; scenarioInfeasible: number } => {
    const nominal = evaluateDecision(d, ctx)
    evaluations++
    tallyViolations(nominal)
    if (!inLoopCvar) return { evaluation: nominal, scenarioInfeasible: 0 }
    const risks = [nominal.objectives[3]]
    const fuels = [nominal.objectives[0]]
    const costs = [nominal.objectives[1]]
    const co2s = [nominal.objectives[2]]
    const times = [nominal.objectives[4]]
    let bad = 0
    for (const per of perturbations) {
      const e = evaluateDecision(d, { ...ctx, oceanOpts: { ...oceanOpts, perturb: per } })
      evaluations++
      risks.push(e.objectives[3])
      fuels.push(e.objectives[0])
      costs.push(e.objectives[1])
      co2s.push(e.objectives[2])
      times.push(e.objectives[4])
      if (!e.feasible) bad++
    }
    const frac = bad / perturbations.length
    const robust: Evaluation = {
      ...nominal,
      warnings: frac > 0 ? [...nominal.warnings, `${bad}/${perturbations.length} weather members violate a limit`] : nominal.warnings,
      objectives: [mean(fuels), mean(costs), mean(co2s), Math.min(1, cvar(risks, settings.cvarAlpha) + 0.3 * frac), mean(times)],
    }
    return { evaluation: robust, scenarioInfeasible: bad }
  }

  const pickGuide = (): Guided | null => {
    if (!archive.items.length) return null
    if (rng.next() < 0.3) return rng.pick(archive.items)
    // tournament on the mission-weighted scalar
    let best: Guided | null = null
    let bestS = Infinity
    for (let k = 0; k < 3; k++) {
      const c = rng.pick(archive.items)
      const s = scalarise(c.objectives, w, lower, upper)
      if (s < bestS) {
        bestS = s
        best = c
      }
    }
    return best
  }

  for (let g = 0; g < iterations; g++) {
    const beta = 1.0 - 0.5 * (g / Math.max(1, iterations - 1))
    const pb = population.filter((ind) => ind.pbestX).map((ind) => ind.pbestX as number[])
    const mbest = Array.from({ length: DIMS }, (_, k) => (pb.length ? pb.reduce((s, x) => s + x[k], 0) / pb.length : population.reduce((s, ind) => s + ind.x[k], 0) / population.length))
    for (const ind of population) {
      // observe registers
      const bits = ind.registers.map((r) => {
        const u = rng.next()
        let acc = 0
        for (let i = 0; i < r.p.length; i++) {
          acc += r.p[i]
          if (u <= acc) return i
        }
        return r.p.length - 1
      })
      const d = decode(bits, ind.x)
      const { evaluation } = evaluateWithRisk(d)
      const scalar = scalarise(evaluation.objectives, w, lower, upper) + (evaluation.feasible ? 0 : 1.5 + 0.5 * evaluation.violations.length)
      if (scalar < ind.pbestScalar) {
        ind.pbestScalar = scalar
        ind.pbestX = [...ind.x]
        ind.pbestBits = [...bits]
      }
      if (evaluation.feasible) {
        archive.add({ ...evaluation, id: `s${evaluations}`, labels: [], _x: [...ind.x], _bits: [...bits] })
      }
      // QPSO update toward guide
      const guide = pickGuide()
      const gX = guide ? guide._x : ind.pbestX ?? ind.x
      const gBits = guide ? guide._bits : ind.pbestBits ?? bits
      const pX = ind.pbestX ?? ind.x
      for (let k = 0; k < DIMS; k++) {
        const phi = rng.next()
        const attractor = phi * pX[k] + (1 - phi) * gX[k]
        const u = Math.max(1e-9, rng.next())
        const step = beta * Math.abs(mbest[k] - ind.x[k]) * Math.log(1 / u)
        let nx = rng.next() < 0.5 ? attractor + step : attractor - step
        if (nx < 0) nx = -nx * 0.5
        if (nx > 1) nx = 1 - (nx - 1) * 0.5
        ind.x[k] = Math.min(1, Math.max(0, nx))
      }
      // rotation-style register update toward the guide's discrete choices
      for (let r = 0; r < ind.registers.length; r++) {
        const reg = ind.registers[r]
        const target = gBits[r]
        if (target === undefined || target >= reg.p.length) continue
        reg.p[target] += eta * (1 - reg.p[target])
        let sum = 0
        for (let i = 0; i < reg.p.length; i++) {
          reg.p[i] = Math.max(floor, reg.p[i])
          sum += reg.p[i]
        }
        for (let i = 0; i < reg.p.length; i++) reg.p[i] /= sum
      }
    }
    // convergence bookkeeping
    const objs = archive.items.map((s) => s.objectives)
    const h = hv.compute(objs)
    const bestFuel = objs.length ? Math.min(...objs.map((o) => o[0])) : 0
    const bestCo2 = objs.length ? Math.min(...objs.map((o) => o[2])) : 0
    const bestCost = objs.length ? Math.min(...objs.map((o) => o[1])) : 0
    convergence.push({ generation: g + 1, evaluations, hypervolume: h, bestFuelT: bestFuel, bestCo2T: bestCo2, archiveSize: archive.items.length })
    if (h > bestHv + 1e-4) {
      bestHv = h
      stagnation = 0
    } else stagnation++
    if (stagnation >= 8) {
      // quantum-inspired migration: re-spread half the population
      stagnation = 0
      for (let i = 0; i < population.length; i += 2) {
        const ind = population[i]
        ind.x = ind.x.map((v) => (rng.next() < 0.5 ? rng.next() : v))
        ind.registers = ind.registers.map((r) => ({ p: r.p.map((v) => 0.5 * v + 0.5 / r.p.length) }))
      }
    }
    yield ev({
      phase: 'search',
      progress: 0.17 + 0.63 * ((g + 1) / iterations),
      generation: g + 1,
      archiveSize: archive.items.length,
      hypervolume: h,
      bestFuelT: bestFuel,
      bestCo2T: bestCo2,
      bestCostUsd: bestCost,
      message: `Generation ${g + 1}/${iterations}: QEA observe, QPSO speeds, archive ${archive.items.length}, HV ${h.toFixed(3)}`,
    })
  }

  // 5. CVaR over the archive
  const items = archive.items
  if (settings.useCvar && items.length) {
    for (let i = 0; i < items.length; i++) {
      const s = items[i]
      const risks: number[] = [s.objectives[3]]
      const fuels: number[] = [s.totals.fuelT]
      for (const per of perturbations) {
        const e = evaluateDecision(s.decision, { ...ctx, oceanOpts: { ...oceanOpts, perturb: per } })
        evaluations++
        risks.push(e.feasible ? e.objectives[3] : Math.min(1, e.objectives[3] + 0.3))
        fuels.push(e.totals.fuelT)
      }
      s.cvar = { riskCvar: cvar(risks, settings.cvarAlpha), fuelCvar: cvar(fuels, settings.cvarAlpha), riskMean: mean(risks), fuelMean: mean(fuels), scenarios: perturbations.length + 1, alpha: settings.cvarAlpha }
      if ((i + 1) % 6 === 0 || i === items.length - 1) {
        yield ev({ phase: 'cvar', progress: 0.8 + 0.18 * ((i + 1) / items.length), generation: iterations, archiveSize: items.length, hypervolume: bestHv, message: `CVaR${Math.round(settings.cvarAlpha * 100)} over ${perturbations.length + 1} weather members, ${i + 1}/${items.length} archive solutions` })
      }
    }
  }

  // 6. named solutions
  const named = nameSolutions(items, w, lower, upper)
  const elapsedMs = performance.now() - t0
  yield ev({ phase: 'done', progress: 1, generation: iterations, archiveSize: items.length, hypervolume: bestHv, message: `Complete, ${evaluations} evaluations in ${(elapsedMs / 1000).toFixed(1)} s` })
  const stripped = items.map((s) => {
    const rest: Solution & { _x?: number[]; _bits?: number[] } = { ...s }
    delete rest._x
    delete rest._bits
    return rest as Solution
  })
  return {
    corridors,
    archive: stripped,
    named: named.map((n) => stripped.find((s) => s.id === n.id) as Solution),
    baseline,
    classical,
    convergence,
    evaluations,
    elapsedMs,
    settings,
    seed: settings.seed,
    startState: p.start,
    violationTally: [...tally.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    excluded: excluded.map((x) => ({ vesselId: x.vessel.id, reason: x.reason })),
  }
}

export function nameSolutions(items: Solution[], w: number[], lower: number[], upper: number[]): Solution[] {
  for (const s of items) s.labels = []
  if (!items.length) return []
  const pick = (score: (s: Solution) => number, label: SolutionLabel) => {
    let best = items[0]
    let bs = Infinity
    for (const s of items) {
      const v = score(s)
      if (v < bs) {
        bs = v
        best = s
      }
    }
    best.labels.push(label)
    return best
  }
  const balanced = pick((s) => scalarise(s.objectives, w, lower, upper), 'Balanced')
  const greenest = pick((s) => s.objectives[2], 'Greenest')
  const cheapest = pick((s) => s.objectives[1], 'Lowest Cost')
  const fastest = pick((s) => s.objectives[4], 'Fastest')
  // "Safest" is only awarded when it buys a real risk reduction over the balanced plan; when every
  // plan shares the same tail risk the label would be unearned and is omitted
  const riskOf = (s: Solution) => (s.cvar ? s.cvar.riskCvar : s.objectives[3])
  let safest: Solution | null = null
  let bestRisk = Infinity
  for (const s of items) if (riskOf(s) < bestRisk) {
    bestRisk = riskOf(s)
    safest = s
  }
  if (safest && riskOf(balanced) - bestRisk >= 0.02) safest.labels.push('Safest')
  else safest = null
  const order = [balanced, greenest, cheapest, fastest, ...(safest ? [safest] : [])]
  const unique: Solution[] = []
  for (const s of order) if (!unique.includes(s)) unique.push(s)
  return unique
}

export { FUELS }
