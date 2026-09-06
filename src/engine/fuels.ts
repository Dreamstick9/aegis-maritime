/**
 * Fuel database. LHV and CF (t CO2 / t fuel) for conventional fuels, LNG and methanol follow
 * IMO resolution MEPC.308(73) (2018 EEDI calculation guidelines). WtT / TtW gCO2e/MJ values
 * are ILLUSTRATIVE defaults in the order of magnitude of published lifecycle work
 * (IMO LCA guidelines MEPC.391(81) framework, FuelEU Maritime Annex II defaults, JEC WtW).
 * They are not the official default emission factors. Prices are scenario inputs.
 */
import type { FuelSpec, FuelId } from './types'

export const HFO_REF_LHV = 40.2

export const FUELS: Record<FuelId, FuelSpec> = {
  HFO: {
    id: 'HFO',
    name: 'Heavy fuel oil (HSFO, with scrubber)',
    short: 'HFO',
    family: 'fossil',
    lhvMJkg: 40.2,
    cfTtW: 3.114,
    ttwGco2eMJ: 78.2,
    wttGco2eMJ: 13.5,
    priceUsdPerT: 470,
    effRel: 1.0,
    storageVolRel: 1.0,
    availability: { INMRM: 'limited', SGSIN: 'available' },
    provenance: { lhv: 'sourced', cf: 'sourced', wtt: 'derived', price: 'scenario' },
    notes: 'Requires an exhaust gas cleaning system for 0.50% sulphur compliance. Cheapest per tonne; highest lifecycle intensity.',
  },
  VLSFO: {
    id: 'VLSFO',
    name: 'Very low sulphur fuel oil (0.50% S)',
    short: 'VLSFO',
    family: 'fossil',
    lhvMJkg: 41.0,
    cfTtW: 3.151,
    ttwGco2eMJ: 77.6,
    wttGco2eMJ: 13.2,
    priceUsdPerT: 560,
    effRel: 1.0,
    storageVolRel: 1.0,
    availability: { INMRM: 'available', SGSIN: 'available' },
    provenance: { lhv: 'derived', cf: 'sourced', wtt: 'derived', price: 'scenario' },
    notes: 'Default compliant residual fuel. CF uses the MEPC.308(73) light fuel oil value.',
  },
  MGO: {
    id: 'MGO',
    name: 'Marine gas oil (DMA)',
    short: 'MGO',
    family: 'fossil',
    lhvMJkg: 42.7,
    cfTtW: 3.206,
    ttwGco2eMJ: 75.8,
    wttGco2eMJ: 14.4,
    priceUsdPerT: 720,
    effRel: 1.01,
    storageVolRel: 0.98,
    availability: { INMRM: 'available', SGSIN: 'available' },
    provenance: { lhv: 'sourced', cf: 'sourced', wtt: 'derived', price: 'scenario' },
    notes: 'Distillate; used for auxiliary engines at berth and inside emission-control overlays.',
  },
  LNG: {
    id: 'LNG',
    name: 'Liquefied natural gas (high-pressure dual-fuel)',
    short: 'LNG',
    family: 'lng',
    lhvMJkg: 48.0,
    cfTtW: 2.75,
    ttwGco2eMJ: 60.5,
    wttGco2eMJ: 18.5,
    priceUsdPerT: 620,
    effRel: 1.0,
    storageVolRel: 1.8,
    availability: { INMRM: 'none', SGSIN: 'available' },
    provenance: { lhv: 'sourced', cf: 'sourced', wtt: 'derived', price: 'scenario' },
    notes: 'TtW value includes an illustrative 0.2% methane slip and pilot fuel. Cryogenic tanks reduce cargo space.',
  },
  MEOH: {
    id: 'MEOH',
    name: 'Methanol (grey, natural-gas based)',
    short: 'MeOH',
    family: 'alcohol',
    lhvMJkg: 19.9,
    cfTtW: 1.375,
    ttwGco2eMJ: 69.5,
    wttGco2eMJ: 31.3,
    priceUsdPerT: 380,
    effRel: 0.98,
    storageVolRel: 2.3,
    availability: { INMRM: 'none', SGSIN: 'limited' },
    provenance: { lhv: 'sourced', cf: 'sourced', wtt: 'derived', price: 'scenario' },
    notes: 'Half the energy density of fuel oil; grey methanol has a higher WtW intensity than VLSFO.',
  },
  EMEOH: {
    id: 'EMEOH',
    name: 'e-Methanol (renewable, RFNBO)',
    short: 'e-MeOH',
    family: 'alcohol',
    lhvMJkg: 19.9,
    cfTtW: 1.375,
    ttwGco2eMJ: 1.5,
    wttGco2eMJ: 9.0,
    priceUsdPerT: 1150,
    effRel: 0.98,
    storageVolRel: 2.3,
    availability: { INMRM: 'none', SGSIN: 'limited' },
    provenance: { lhv: 'sourced', cf: 'sourced', wtt: 'derived', price: 'scenario' },
    notes: 'Combustion CO2 is of non-fossil origin; illustrative WtW credit applied per lifecycle convention. Very limited availability.',
  },
  NH3: {
    id: 'NH3',
    name: 'Ammonia (green, dual-fuel)',
    short: 'NH₃',
    family: 'ammonia',
    lhvMJkg: 18.6,
    cfTtW: 0,
    ttwGco2eMJ: 4.0,
    wttGco2eMJ: 8.0,
    priceUsdPerT: 900,
    effRel: 0.95,
    storageVolRel: 2.6,
    availability: { INMRM: 'none', SGSIN: 'none' },
    provenance: { lhv: 'sourced', cf: 'derived', wtt: 'derived', price: 'scenario' },
    notes: 'No combustion CO2; N2O and pilot fuel give a small TtW term. Not available at either scenario port (constraint demonstration).',
  },
  B30: {
    id: 'B30',
    name: 'B30 biofuel blend (30% FAME / 70% VLSFO)',
    short: 'B30',
    family: 'bio-blend',
    lhvMJkg: 40.3,
    cfTtW: 3.05,
    ttwGco2eMJ: 55.0,
    wttGco2eMJ: 16.5,
    priceUsdPerT: 700,
    effRel: 1.0,
    storageVolRel: 1.02,
    availability: { INMRM: 'none', SGSIN: 'limited' },
    provenance: { lhv: 'derived', cf: 'derived', wtt: 'derived', price: 'scenario' },
    notes: 'Drop-in blend; biogenic share credited in the illustrative lifecycle factor.',
  },
}

export const FUEL_IDS = Object.keys(FUELS) as FuelId[]

/** Lifecycle intensity used for accounting (gCO2e/MJ). */
export function fuelIntensity(f: FuelSpec, accounting: 'WtW' | 'TtW'): number {
  return accounting === 'WtW' ? f.wttGco2eMJ + f.ttwGco2eMJ : f.ttwGco2eMJ
}

/** Mass (t) of fuel for a given engine energy demand with HFO-referenced SFOC. */
export function fuelMassT(powerKw: number, hours: number, sfocHfoGkWh: number, f: FuelSpec): number {
  const hfoMassT = (powerKw * hours * sfocHfoGkWh) / 1e6
  return (hfoMassT * (HFO_REF_LHV / f.lhvMJkg)) / f.effRel
}

export function energyGJFromMass(massT: number, f: FuelSpec): number {
  return massT * f.lhvMJkg // t × MJ/kg = GJ
}

export function co2FromEnergy(energyGJ: number, f: FuelSpec, accounting: 'WtW' | 'TtW'): number {
  // GJ × gCO2e/MJ = kg → /1000 = t
  return (energyGJ * 1000 * fuelIntensity(f, accounting)) / 1e6
}

/** Price per GJ delivered: the energy-aware comparison judges care about. */
export function priceUsdPerGJ(f: FuelSpec): number {
  return f.priceUsdPerT / f.lhvMJkg
}
