/** Pareto utilities: dominance, non-dominated sorting, crowding distance, archive, hypervolume. */
import { Rng } from './rng'

export function dominates(a: number[], b: number[]): boolean {
  let strictly = false
  for (let i = 0; i < a.length; i++) {
    if (a[i] > b[i] + 1e-12) return false
    if (a[i] < b[i] - 1e-12) strictly = true
  }
  return strictly
}

export function nonDominatedSort(objs: number[][]): number[][] {
  const n = objs.length
  const dominatedBy = new Array<number>(n).fill(0)
  const dominatesList: number[][] = Array.from({ length: n }, () => [])
  const fronts: number[][] = [[]]
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      if (dominates(objs[i], objs[j])) dominatesList[i].push(j)
      else if (dominates(objs[j], objs[i])) dominatedBy[i]++
    }
    if (dominatedBy[i] === 0) fronts[0].push(i)
  }
  let f = 0
  while (fronts[f].length) {
    const next: number[] = []
    for (const i of fronts[f]) {
      for (const j of dominatesList[i]) {
        dominatedBy[j]--
        if (dominatedBy[j] === 0) next.push(j)
      }
    }
    f++
    fronts.push(next)
  }
  fronts.pop()
  return fronts
}

export function crowdingDistance(objs: number[][]): number[] {
  const n = objs.length
  const dist = new Array<number>(n).fill(0)
  if (n === 0) return dist
  const m = objs[0].length
  for (let k = 0; k < m; k++) {
    const idx = objs.map((_, i) => i).sort((a, b) => objs[a][k] - objs[b][k])
    dist[idx[0]] = Infinity
    dist[idx[n - 1]] = Infinity
    const range = objs[idx[n - 1]][k] - objs[idx[0]][k] || 1
    for (let i = 1; i < n - 1; i++) {
      dist[idx[i]] += (objs[idx[i + 1]][k] - objs[idx[i - 1]][k]) / range
    }
  }
  return dist
}

export class ParetoArchive<T extends { objectives: number[] }> {
  items: T[] = []
  readonly maxSize: number
  constructor(maxSize: number) {
    this.maxSize = maxSize
  }
  /** returns true if the archive changed */
  add(sol: T): boolean {
    for (const it of this.items) {
      if (dominates(it.objectives, sol.objectives)) return false
      if (sameVector(it.objectives, sol.objectives)) return false
    }
    this.items = this.items.filter((it) => !dominates(sol.objectives, it.objectives))
    this.items.push(sol)
    if (this.items.length > this.maxSize) this.prune()
    return true
  }
  private prune() {
    const cd = crowdingDistance(this.items.map((i) => i.objectives))
    // remove the most crowded (smallest distance), never the extremes (Infinity)
    let worst = -1
    let best = Infinity
    for (let i = 0; i < cd.length; i++) if (cd[i] < best) {
      best = cd[i]
      worst = i
    }
    if (worst >= 0) this.items.splice(worst, 1)
  }
}

function sameVector(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-9) return false
  return true
}

/** Monte-Carlo hypervolume indicator on a normalised box; deterministic sample set. */
export class Hypervolume {
  private samples: number[][]
  readonly lower: number[]
  readonly upper: number[]
  constructor(lower: number[], upper: number[], samples = 1024, seed = 7) {
    this.lower = lower
    this.upper = upper
    const rng = new Rng(seed)
    this.samples = Array.from({ length: samples }, () => lower.map(() => rng.next()))
  }
  normalise(o: number[]): number[] {
    return o.map((v, i) => Math.min(1, Math.max(0, (v - this.lower[i]) / (this.upper[i] - this.lower[i] || 1))))
  }
  /** fraction of the unit box dominated by the set (0..1) */
  compute(objs: number[][]): number {
    if (!objs.length) return 0
    const norm = objs.map((o) => this.normalise(o))
    let dominated = 0
    outer: for (const s of this.samples) {
      for (const o of norm) {
        let ok = true
        for (let i = 0; i < o.length; i++) if (o[i] > s[i]) {
          ok = false
          break
        }
        if (ok) {
          dominated++
          continue outer
        }
      }
    }
    return dominated / this.samples.length
  }
}

/** Weighted normalised scalarisation used for guide selection and single-objective baselines. */
export function scalarise(obj: number[], weights: number[], lower: number[], upper: number[]): number {
  let s = 0
  for (let i = 0; i < obj.length; i++) {
    const n = (obj[i] - lower[i]) / (upper[i] - lower[i] || 1)
    s += weights[i] * n
  }
  return s
}
