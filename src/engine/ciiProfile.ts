/** Synthetic annual CII projection used when a hull has no active plan (12.5 kn, VLSFO, 72% load). */
import { projectCii, type CiiProjection } from './cii'
import { FUELS, fuelMassT } from './fuels'
import type { Vessel } from './types'
import { calmWaterPowerKw, loadingCondition, sfocGkWh } from './vessel'

export function nominalCii(v: Vessel): CiiProjection {
  const lc = loadingCondition(v, v.dwt * 0.72, 2500)
  const p = calmWaterPowerKw(v, 12.5, lc.displacementFrac) * 1.12
  const hours = v.annual.daysAtSea * 24
  const fuel = fuelMassT(p, hours, sfocGkWh(v, p / v.engine.mcrKw), FUELS.VLSFO) + fuelMassT(v.auxSeaKw, hours, 215, FUELS.MGO)
  return projectCii(v, fuel * 3.15, v.annual.distanceNm, 2026)
}
