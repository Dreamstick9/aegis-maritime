/**
 * Physics-informed vessel performance: calm-water propulsion power P = k·V^n (admiralty /
 * cube-law family, n fitted per vessel), a displacement correction (Δ^(2/3)) and an
 * explainable weather residual (wind + wave added-resistance fractions).
 */
import type { EnvSample, Vessel } from './types'
import { KN_TO_MS, relativeAngleDeg, clamp } from './geo'

export interface LoadingCondition {
  cargoT: number
  bunkersT: number
  displacementT: number
  displacementFrac: number
  sailingDraftM: number
  deadweightUsedT: number
  capacityOk: boolean
}

export function loadingCondition(v: Vessel, cargoT: number, bunkersT: number): LoadingCondition {
  const deadweightUsedT = cargoT + bunkersT
  const fullDisplacement = v.lightshipT + v.dwt
  const displacementT = v.lightshipT + deadweightUsedT
  const draftReductionM = (v.dwt - deadweightUsedT) / (v.tpc * 100)
  return {
    cargoT,
    bunkersT,
    displacementT,
    displacementFrac: displacementT / fullDisplacement,
    sailingDraftM: v.designDraftM - draftReductionM,
    deadweightUsedT,
    capacityOk: deadweightUsedT <= v.dwt,
  }
}

export function calmWaterPowerKw(v: Vessel, stwKn: number, displacementFrac = 1): number {
  const base = v.designPowerKw * Math.pow(Math.max(0.1, stwKn) / v.designSpeedKn, v.powerExponent)
  return base * Math.pow(displacementFrac, 2 / 3) * v.hullFouling
}

export interface WeatherResidual {
  windFrac: number
  waveFrac: number
  totalFrac: number
  windRelDeg: number
  waveRelDeg: number
}

/**
 * Added power fraction relative to calm-water power. Coefficients tuned so a Capesize in
 * head seas Hs 4 m with 30 kn relative wind needs ~+30% power at design speed , 
 * the right order of magnitude for the class (design inference, not a measured curve).
 */
export function weatherResidual(v: Vessel, env: EnvSample, headingDeg: number, stwKn: number): WeatherResidual {
  const windRelDeg = relativeAngleDeg(headingDeg, env.windFromDeg)
  const waveRelDeg = relativeAngleDeg(headingDeg, env.waveFromDeg)
  // relative wind speed (m/s): ship speed adds head component
  const shipMs = stwKn * KN_TO_MS
  const windMs = env.windKn * KN_TO_MS
  const rel = Math.sqrt(windMs ** 2 + shipMs ** 2 + 2 * windMs * shipMs * Math.cos((windRelDeg * Math.PI) / 180))
  const windAngleFactor = 0.15 + 0.85 * (1 + Math.cos((windRelDeg * Math.PI) / 180)) / 2
  const frontalArea = v.beamM * (v.depthM - v.designDraftM + 12) // hull freeboard + superstructure (approx)
  const kWind = 0.0000105 * (frontalArea / 1400)
  const windFrac = clamp(kWind * rel ** 2 * windAngleFactor * (14 / Math.max(6, stwKn)), 0, 0.6)

  const waveAngleFactor = 0.2 + 0.8 * (1 + Math.cos((waveRelDeg * Math.PI) / 180)) / 2
  const sizeFactor = 300 / v.loaM
  const waveFrac = clamp(0.017 * env.hsM ** 2 * waveAngleFactor * sizeFactor, 0, 0.9)
  return { windFrac, waveFrac, totalFrac: windFrac + waveFrac, windRelDeg, waveRelDeg }
}

/** Specific fuel oil consumption curve (g/kWh, HFO basis), minimum near 75% load. */
export function sfocGkWh(v: Vessel, loadFrac: number): number {
  const l = clamp(loadFrac, 0.15, 1.1)
  return v.engine.sfocGkWh * (1 + 0.12 * ((l - 0.75) / 0.35) ** 2)
}

/** Involuntary speed loss estimate if power is capped: solve stw such that required power = cap */
export function speedForPower(v: Vessel, powerKw: number, weatherFrac: number, displacementFrac: number): number {
  const calm = powerKw / (1 + weatherFrac)
  const ratio = calm / (v.designPowerKw * Math.pow(displacementFrac, 2 / 3) * v.hullFouling)
  return v.designSpeedKn * Math.pow(Math.max(ratio, 1e-6), 1 / v.powerExponent)
}

export interface PowerDemand {
  calmKw: number
  weatherFrac: number
  totalKw: number
  loadFrac: number
  capped: boolean
  achievedStwKn: number
}

export function powerDemand(v: Vessel, stwKn: number, env: EnvSample, headingDeg: number, displacementFrac: number, maxLoad = 0.9): PowerDemand {
  const wr = weatherResidual(v, env, headingDeg, stwKn)
  const calmKw = calmWaterPowerKw(v, stwKn, displacementFrac)
  let totalKw = calmKw * (1 + wr.totalFrac)
  let achieved = stwKn
  let capped = false
  const cap = v.engine.mcrKw * maxLoad
  if (totalKw > cap) {
    capped = true
    totalKw = cap
    achieved = speedForPower(v, cap, wr.totalFrac, displacementFrac)
  }
  return { calmKw, weatherFrac: wr.totalFrac, totalKw, loadFrac: totalKw / v.engine.mcrKw, capped, achievedStwKn: achieved }
}
