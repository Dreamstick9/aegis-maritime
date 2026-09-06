import { describe, expect, it } from 'vitest'
import { FLEET_BY_ID } from '../../data/fleet'
import { calmWaterPowerKw, loadingCondition, powerDemand, sfocGkWh, weatherResidual } from '../vessel'
import type { EnvSample } from '../types'

const calm: EnvSample = { windU: 0, windV: 0, windKn: 0, windFromDeg: 0, curU: 0, curV: 0, curKn: 0, hsM: 0.5, wavePeriodS: 6, waveFromDeg: 0, depthM: 3000, stormDistNm: Infinity, stormWindKn: 0 }

describe('vessel performance', () => {
  const v = FLEET_BY_ID.AK
  it('power follows P = k·V^n', () => {
    const p1 = calmWaterPowerKw(v, 10, 1)
    const p2 = calmWaterPowerKw(v, 12, 1)
    expect(p2 / p1).toBeCloseTo(Math.pow(1.2, v.powerExponent), 6)
    expect(calmWaterPowerKw(v, v.designSpeedKn, 1)).toBeCloseTo(v.designPowerKw * v.hullFouling, 6)
  })
  it('lighter displacement needs less power', () => {
    expect(calmWaterPowerKw(v, 12, 0.75)).toBeLessThan(calmWaterPowerKw(v, 12, 1))
  })
  it('head seas cost more than following seas', () => {
    const env: EnvSample = { ...calm, windKn: 30, windFromDeg: 90, hsM: 4, waveFromDeg: 90 }
    const head = weatherResidual(v, env, 90, 12)
    const follow = weatherResidual(v, env, 270, 12)
    expect(head.totalFrac).toBeGreaterThan(follow.totalFrac)
    expect(head.totalFrac).toBeGreaterThan(0.2)
    expect(head.totalFrac).toBeLessThan(0.7)
  })
  it('SFOC curve has its minimum near 75% load', () => {
    expect(sfocGkWh(v, 0.75)).toBeLessThan(sfocGkWh(v, 0.5))
    expect(sfocGkWh(v, 0.75)).toBeLessThan(sfocGkWh(v, 1.0))
  })
  it('engine load cap produces involuntary speed loss', () => {
    const env: EnvSample = { ...calm, windKn: 45, windFromDeg: 90, hsM: 6, waveFromDeg: 90 }
    const pd = powerDemand(v, 15.5, env, 90, 1, 0.9)
    expect(pd.capped).toBe(true)
    expect(pd.achievedStwKn).toBeLessThan(15.5)
    expect(pd.totalKw).toBeCloseTo(v.engine.mcrKw * 0.9, 3)
  })
  it('128,000 t cargo on the Capesize gives a partial-load draught of ~14.8 m', () => {
    const lc = loadingCondition(v, 128000, 2100)
    expect(lc.capacityOk).toBe(true)
    expect(lc.sailingDraftM).toBeGreaterThan(14.5)
    expect(lc.sailingDraftM).toBeLessThan(15.2)
    expect(loadingCondition(FLEET_BY_ID.AS, 128000, 2100).capacityOk).toBe(false)
  })
})
