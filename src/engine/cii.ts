/**
 * IMO Carbon Intensity Indicator (CII) helpers for bulk carriers.
 * Reference line parameters (a = 4745, c = 0.622, capacity capped at 279,000 DWT), the
 * rating boundary vector dd = (0.86, 0.94, 1.06, 1.18) and reduction factors Z are
 * reproduced from resolutions MEPC.353(78), MEPC.354(78) and MEPC.338(76). Verify against
 * the current consolidated text before regulatory use.
 */
import type { Vessel } from './types'

export const CII_Z: Record<number, number> = { 2023: 0.05, 2024: 0.07, 2025: 0.09, 2026: 0.11 }
export const BULK_DD = [0.86, 0.94, 1.06, 1.18]

/** gCO2 per (DWT·nm) */
export function ciiReference(dwt: number): number {
  const cap = Math.min(dwt, 279000)
  return 4745 * Math.pow(cap, -0.622)
}

export function requiredCii(dwt: number, year: number): number {
  const z = CII_Z[year] ?? CII_Z[2026]
  return ciiReference(dwt) * (1 - z)
}

export type CiiRating = 'A' | 'B' | 'C' | 'D' | 'E'

export function ciiRating(attained: number, required: number): CiiRating {
  const r = attained / required
  if (r < BULK_DD[0]) return 'A'
  if (r < BULK_DD[1]) return 'B'
  if (r < BULK_DD[2]) return 'C'
  if (r < BULK_DD[3]) return 'D'
  return 'E'
}

export interface CiiProjection {
  attained: number
  required: number
  reference: number
  ratio: number
  rating: CiiRating
  year: number
  boundaries: { A: number; B: number; C: number; D: number }
}

/**
 * Projects an annual CII from a single laden voyage (CO2 in tonnes incl. port phase,
 * distance in nm). Conservative: laden legs are more carbon intensive per DWT·nm than a
 * laden/ballast mix.
 */
export function projectCii(v: Vessel, voyageCo2TtwT: number, distanceNm: number, year = 2026): CiiProjection {
  const attained = (voyageCo2TtwT * 1e6) / (Math.max(1, distanceNm) * v.dwt)
  const required = requiredCii(v.dwt, year)
  return {
    attained,
    required,
    reference: ciiReference(v.dwt),
    ratio: attained / required,
    rating: ciiRating(attained, required),
    year,
    boundaries: { A: required * BULK_DD[0], B: required * BULK_DD[1], C: required * BULK_DD[2], D: required * BULK_DD[3] },
  }
}
