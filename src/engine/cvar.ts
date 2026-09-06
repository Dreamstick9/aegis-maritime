/** Weather-ensemble perturbations and conditional value-at-risk. */
import type { OceanOptions } from './ocean'
import { Rng } from './rng'
import { clamp } from './geo'

export type Perturbation = NonNullable<OceanOptions['perturb']>

export function makePerturbations(seed: number, n: number): Perturbation[] {
  const rng = new Rng(seed).fork('ensemble')
  const out: Perturbation[] = []
  for (let i = 0; i < n; i++) {
    out.push({
      windScale: clamp(1 + 0.12 * rng.gauss(), 0.75, 1.35),
      trackShiftLat: 0.55 * rng.gauss(),
      trackShiftLon: 0.75 * rng.gauss(),
      intensity: clamp(1 + 0.15 * rng.gauss(), 0.7, 1.4),
      swellShift: 0.3 * rng.gauss(),
    })
  }
  return out
}

/** CVaR_α of a loss sample: mean of the worst (1-α) share (at least one sample). */
export function cvar(values: number[], alpha: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => b - a)
  const k = Math.max(1, Math.ceil((1 - alpha) * sorted.length))
  let s = 0
  for (let i = 0; i < k; i++) s += sorted[i]
  return s / k
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}
