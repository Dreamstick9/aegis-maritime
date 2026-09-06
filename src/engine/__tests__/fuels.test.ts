import { describe, expect, it } from 'vitest'
import { FUELS, co2FromEnergy, energyGJFromMass, fuelIntensity, fuelMassT, priceUsdPerGJ } from '../fuels'

describe('fuels', () => {
  it('1 t HFO holds 40.2 GJ and emits ~3.11 t CO2 tank-to-wake', () => {
    const gj = energyGJFromMass(1, FUELS.HFO)
    expect(gj).toBeCloseTo(40.2, 6)
    const co2 = co2FromEnergy(gj, FUELS.HFO, 'TtW')
    // ttw 78.2 g/MJ includes CH4/N2O; pure CO2 CF is 3.114
    expect(co2).toBeGreaterThan(3.05)
    expect(co2).toBeLessThan(3.2)
  })
  it('energy-equivalent mass scales with LHV (methanol ≈ 2× fuel oil mass)', () => {
    const hfo = fuelMassT(10000, 24, 170, FUELS.HFO)
    const meoh = fuelMassT(10000, 24, 170, FUELS.MEOH)
    expect(meoh / hfo).toBeGreaterThan(1.9)
    expect(meoh / hfo).toBeLessThan(2.2)
  })
  it('WtW intensity exceeds TtW for every fuel and LNG beats VLSFO per MJ on TtW', () => {
    for (const f of Object.values(FUELS)) expect(fuelIntensity(f, 'WtW')).toBeGreaterThan(fuelIntensity(f, 'TtW'))
    expect(fuelIntensity(FUELS.LNG, 'TtW')).toBeLessThan(fuelIntensity(FUELS.VLSFO, 'TtW'))
  })
  it('price per GJ: grey methanol is dearer per unit energy than VLSFO despite a lower $/t', () => {
    expect(FUELS.MEOH.priceUsdPerT).toBeLessThan(FUELS.VLSFO.priceUsdPerT)
    expect(priceUsdPerGJ(FUELS.MEOH)).toBeGreaterThan(priceUsdPerGJ(FUELS.VLSFO))
  })
})
