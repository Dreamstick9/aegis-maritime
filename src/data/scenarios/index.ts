/**
 * Scenario packs. A pack is a set of CONDITIONS (season preference, storm, fuel menu, fleet openness)
 * applied to a generated voyage; `buildScenario(id, voyageSeed)` materialises one deterministically
 * through src/engine/voyage.ts. Seed 0 is the fixed reference voyage (Mormugao to Singapore) kept
 * below for tests and fallbacks. All values are SCENARIO INPUTS (synthetic). Dates are UTC.
 */
import type { EngineSettings, Mission, OceanConfig, Zone } from '../../engine/types'
import type { Landmark } from '../../engine/replay'
import { FLEET_UNITS, type FleetUnit } from '../fleet'
import { LANDMARKS } from '../../engine/replay'
import { PACK_CONDITIONS, generateVoyage } from '../../engine/voyage'

export type ScenarioId = 'normal' | 'storm' | 'altfuel' | 'fleet'

/**
 * A scenario pack is a set of CONDITIONS (season, storm, fuel menu, fleet openness) applied to a
 * generated voyage. `buildScenario(id, voyageSeed)` is deterministic: the same pack and seed always
 * produce the same ports, cargo, dates, ocean, storm, scenario zones, fleet positions and landmarks.
 */
export interface ScenarioPack {
  id: ScenarioId
  name: string
  tagline: string
  description: string
  seed: number
  mission: Mission
  ocean: OceanConfig
  engineOverrides?: Partial<EngineSettings>
  /** hours after departure at which a rolling re-plan is triggered automatically during replay */
  autoReplanAtH?: number
  notes: string[]
  /** the voyage seed this pack was built from (0 = the fixed reference voyage) */
  voyageSeed: number
  /** zones generated for this voyage (scenario inputs), in addition to the fixed geographic layers */
  zones: Zone[]
  /** other fleet units' positions for this voyage (synthetic) */
  fleetUnits: FleetUnit[]
  /** named features along or near this voyage used for replay events and captions */
  landmarks: Landmark[]
}

export const PACK_IDS: ScenarioId[] = ['normal', 'storm', 'altfuel', 'fleet']

/** Pack metadata for pickers (names never depend on the voyage). */
export const PACKS: { id: ScenarioId; name: string; tagline: string }[] = PACK_IDS.map((id) => ({ id, name: PACK_CONDITIONS[id].name, tagline: PACK_CONDITIONS[id].tagline }))

const MEMO = new Map<string, ScenarioPack>()
const MEMO_MAX = 64

/**
 * Build the pack for a voyage seed. Seed 0 returns the fixed reference voyage unchanged; any other
 * seed runs the generator (memoised per pack and seed, so re-selecting a pack is free).
 */
export function buildScenario(id: ScenarioId, voyageSeed: number): ScenarioPack {
  if (!voyageSeed) return REFERENCE[id]
  const key = `${id}:${voyageSeed}`
  const hit = MEMO.get(key)
  if (hit) return hit
  const v = generateVoyage(id, voyageSeed)
  const pack: ScenarioPack = {
    id,
    name: v.name,
    tagline: v.tagline,
    description: v.description,
    seed: v.seed,
    mission: v.mission,
    ocean: v.ocean,
    notes: v.notes,
    voyageSeed,
    zones: v.zones,
    fleetUnits: v.fleetUnits,
    landmarks: v.landmarks,
  }
  if (v.autoReplanAtH !== undefined) pack.autoReplanAtH = v.autoReplanAtH
  if (MEMO.size >= MEMO_MAX) MEMO.delete(MEMO.keys().next().value as string)
  MEMO.set(key, pack)
  return pack
}

const BASE_WEIGHTS = { fuel: 0.25, cost: 0.25, emissions: 0.25, risk: 0.15, time: 0.1 }

const REFERENCE: Record<ScenarioId, ScenarioPack> = {
  normal: {
    id: 'normal',
    name: 'Normal voyage, SW monsoon',
    tagline: 'Laden iron-ore passage in established south-west monsoon conditions',
    description:
      'Aegis Konkan loads 128,000 t of iron ore at Mormugao and sails for Singapore in mid-July. Strong south-westerlies and swell in the Arabian Sea, an assisting monsoon current south of Sri Lanka, light airs in the Malacca Strait.',
    seed: 20260714,
    voyageSeed: 0,
    zones: [],
    fleetUnits: FLEET_UNITS,
    landmarks: LANDMARKS,
    mission: {
      originId: 'INMRM',
      destinationId: 'SGSIN',
      cargoT: 128000,
      cargoType: 'Iron ore fines',
      departure: '2026-07-14T06:00:00Z',
      arrivalEarliest: '2026-07-20T12:00:00Z',
      arrivalLatest: '2026-07-23T00:00:00Z',
      weights: BASE_WEIGHTS,
      safetyProfile: 'standard',
      allowedFuels: ['VLSFO', 'HFO', 'MGO', 'B30'],
      shorePower: 'auto',
      vesselId: 'AK',
    },
    ocean: { seed: 101, monsoon: 'SW', windScale: 1.0, swellM: 2.2, noiseAmp: 1.0 },
    notes: ['Monsoon wind/current/wave fields are analytic approximations with seeded noise (synthetic).', 'Fuel prices, port congestion and shore-power tariffs are scenario inputs.'],
  },
  storm: {
    id: 'storm',
    name: 'Cyclone forecast shift, rolling re-plan',
    tagline: 'Post-monsoon Bay of Bengal system moves onto the planned corridor after departure',
    description:
      'Late October departure. The initial forecast keeps a developing cyclonic storm north of the corridor. A forecast update at t+36 h shifts the track south and intensifies it, forcing a rolling re-optimisation from the vessel’s live position.',
    seed: 20261026,
    voyageSeed: 0,
    zones: [],
    fleetUnits: FLEET_UNITS,
    landmarks: LANDMARKS,
    mission: {
      originId: 'INMRM',
      destinationId: 'SGSIN',
      cargoT: 128000,
      cargoType: 'Iron ore fines',
      departure: '2026-10-26T04:00:00Z',
      arrivalEarliest: '2026-11-01T18:00:00Z',
      arrivalLatest: '2026-11-04T12:00:00Z',
      weights: { fuel: 0.2, cost: 0.2, emissions: 0.2, risk: 0.3, time: 0.1 },
      safetyProfile: 'standard',
      allowedFuels: ['VLSFO', 'HFO', 'MGO', 'B30'],
      shorePower: 'auto',
      vesselId: 'AK',
    },
    ocean: {
      seed: 202,
      monsoon: 'transition',
      windScale: 0.9,
      swellM: 1.6,
      noiseAmp: 1.1,
      storm: {
        name: 'Cyclonic storm “Scenario-07”',
        forecasts: [
          {
            issuedAtH: 0,
            label: 'Initial forecast (t+0 h): system stays north of the corridor',
            track: [
              { tH: 12, lat: 8.0, lon: 92.5, vmaxKn: 30, rmaxNm: 40 },
              { tH: 48, lat: 8.8, lon: 89.5, vmaxKn: 40, rmaxNm: 45 },
              { tH: 96, lat: 9.8, lon: 86.0, vmaxKn: 45, rmaxNm: 50 },
              { tH: 144, lat: 12.0, lon: 84.0, vmaxKn: 40, rmaxNm: 55 },
              { tH: 200, lat: 15.0, lon: 83.0, vmaxKn: 25, rmaxNm: 60 },
            ],
          },
          {
            issuedAtH: 36,
            label: 'Forecast update (t+36 h): track shifts south, intensifies to 65 kn',
            track: [
              { tH: 36, lat: 7.4, lon: 91.0, vmaxKn: 42, rmaxNm: 42 },
              { tH: 72, lat: 6.6, lon: 87.4, vmaxKn: 58, rmaxNm: 48 },
              { tH: 108, lat: 6.4, lon: 84.2, vmaxKn: 65, rmaxNm: 52 },
              { tH: 144, lat: 8.0, lon: 82.4, vmaxKn: 55, rmaxNm: 55 },
              { tH: 200, lat: 12.5, lon: 82.0, vmaxKn: 30, rmaxNm: 60 },
            ],
          },
        ],
        actual: [
          { tH: 12, lat: 7.9, lon: 92.4, vmaxKn: 32, rmaxNm: 40 },
          { tH: 36, lat: 7.3, lon: 90.9, vmaxKn: 44, rmaxNm: 42 },
          { tH: 72, lat: 6.3, lon: 87.2, vmaxKn: 60, rmaxNm: 48 },
          { tH: 108, lat: 6.2, lon: 84.0, vmaxKn: 62, rmaxNm: 52 },
          { tH: 144, lat: 7.9, lon: 82.2, vmaxKn: 52, rmaxNm: 55 },
          { tH: 200, lat: 12.4, lon: 81.8, vmaxKn: 28, rmaxNm: 60 },
        ],
      },
    },
    autoReplanAtH: 36,
    notes: ['The storm track, intensity and forecast revision are synthetic scenario inputs.', 'Ground-truth track used for replay differs slightly from the updated forecast to show forecast error.'],
  },
  altfuel: {
    id: 'altfuel',
    name: 'Alternative-fuel comparison, NE monsoon',
    tagline: 'Energy- and lifecycle-aware fuel choice with shore power at Singapore',
    description:
      'November departure in the north-east monsoon (lighter winds, adverse monsoon current). Vessel selection is open so the engine trades LNG, VLSFO, B30 and methanol options on price per GJ, WtW intensity, tank capacity and port availability, and decides on shore power at Singapore.',
    seed: 20261120,
    voyageSeed: 0,
    zones: [],
    fleetUnits: FLEET_UNITS,
    landmarks: LANDMARKS,
    mission: {
      originId: 'INMRM',
      destinationId: 'SGSIN',
      cargoT: 128000,
      cargoType: 'Iron ore fines',
      departure: '2026-11-20T02:00:00Z',
      arrivalEarliest: '2026-11-26T12:00:00Z',
      arrivalLatest: '2026-11-29T12:00:00Z',
      weights: { fuel: 0.15, cost: 0.25, emissions: 0.4, risk: 0.1, time: 0.1 },
      safetyProfile: 'standard',
      allowedFuels: ['VLSFO', 'HFO', 'MGO', 'LNG', 'MEOH', 'EMEOH', 'B30', 'NH3'],
      shorePower: 'auto',
      vesselId: 'auto',
    },
    ocean: { seed: 303, monsoon: 'NE', windScale: 0.95, swellM: 1.4, noiseAmp: 0.9 },
    notes: ['Lifecycle factors are illustrative defaults; prices are scenario inputs.', 'Ammonia is allowed by the mission but unavailable at both ports; the engine rejects it and says why.'],
  },
  fleet: {
    id: 'fleet',
    name: 'Fleet allocation: which hull carries the cargo',
    tagline: 'Discrete vessel choice across five hulls with capacity, draught and CII trade-offs',
    description:
      'Early August. The engine may assign any fleet vessel: two hulls cannot carry 128,000 t, the 2010 Capesize is cheaper to hire but burns more, the Newcastlemax offers LNG. Draught against the 14.1 m Mormugao channel is checked for every candidate.',
    seed: 20260803,
    voyageSeed: 0,
    zones: [],
    fleetUnits: FLEET_UNITS,
    landmarks: LANDMARKS,
    mission: {
      originId: 'INMRM',
      destinationId: 'SGSIN',
      cargoT: 128000,
      cargoType: 'Iron ore fines',
      departure: '2026-08-03T08:00:00Z',
      arrivalEarliest: '2026-08-09T12:00:00Z',
      arrivalLatest: '2026-08-12T12:00:00Z',
      weights: { fuel: 0.2, cost: 0.35, emissions: 0.25, risk: 0.1, time: 0.1 },
      safetyProfile: 'standard',
      allowedFuels: ['VLSFO', 'HFO', 'MGO', 'LNG', 'B30'],
      shorePower: 'auto',
      vesselId: 'auto',
    },
    ocean: { seed: 404, monsoon: 'SW', windScale: 1.05, swellM: 2.4, noiseAmp: 1.0 },
    notes: ['Fleet particulars are synthetic design inference; hire rates are scenario inputs.'],
  },
}

/** The fixed reference voyage (Mormugao to Singapore), voyage seed 0. Used by tests and as a fallback. */
export const SCENARIOS: Record<ScenarioId, ScenarioPack> = REFERENCE
export const SCENARIO_LIST = Object.values(SCENARIOS)
