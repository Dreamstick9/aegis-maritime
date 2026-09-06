/**
 * Deterministic pseudo-random utilities.
 * All scenario data, optimiser sampling and synthetic perturbations use these so the
 * demo is reproducible from a seed (Settings → Simulation → seed).
 */

/** xmur3 string hash → 32-bit seed */
export function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^ (h >>> 16)) >>> 0
}

/** mulberry32 PRNG */
export class Rng {
  private s: number
  readonly seed: number
  constructor(seed: number) {
    this.seed = seed >>> 0
    this.s = this.seed || 0x9e3779b9
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5) | 0
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next()
  }
  int(n: number): number {
    return Math.min(n - 1, Math.floor(this.next() * n))
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)]
  }
  /** Standard normal via Box-Muller */
  gauss(): number {
    let u = 0
    let v = 0
    while (u === 0) u = this.next()
    while (v === 0) v = this.next()
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  }
  /** Independent child stream derived from a label */
  fork(label: string): Rng {
    return new Rng(hashSeed(`${this.seed}:${label}`))
  }
}

function lattice(ix: number, iy: number, iz: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 1013904223) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

/**
 * 3-D value noise in [-1, 1]. Used for spatially/temporally coherent weather variability
 * (x, y in degrees, z in hours): clearly a synthetic field, not a forecast product.
 */
export function noise3(x: number, y: number, z: number, seed = 1): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const iz = Math.floor(z)
  const fx = smooth(x - ix)
  const fy = smooth(y - iy)
  const fz = smooth(z - iz)
  let acc = 0
  for (let dz = 0; dz <= 1; dz++) {
    const wz = dz ? fz : 1 - fz
    for (let dy = 0; dy <= 1; dy++) {
      const wy = dy ? fy : 1 - fy
      for (let dx = 0; dx <= 1; dx++) {
        const wx = dx ? fx : 1 - fx
        acc += wx * wy * wz * lattice(ix + dx, iy + dy, iz + dz, seed)
      }
    }
  }
  return acc * 2 - 1
}

/** Fractal (2-octave) noise for a little more texture */
export function fbm3(x: number, y: number, z: number, seed = 1): number {
  return 0.7 * noise3(x, y, z, seed) + 0.3 * noise3(x * 2.3 + 11, y * 2.3 + 7, z * 1.7 + 3, seed + 17)
}
