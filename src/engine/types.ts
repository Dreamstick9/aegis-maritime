/** Shared engine types. Provenance tags keep the demo honest about data origin. */

export type Provenance = 'sourced' | 'derived' | 'scenario' | 'synthetic'

export interface LatLon {
  lat: number
  lon: number
}

export type FuelId = 'HFO' | 'VLSFO' | 'MGO' | 'LNG' | 'MEOH' | 'EMEOH' | 'NH3' | 'B30'

export type Availability = 'available' | 'limited' | 'none'

export interface FuelSpec {
  id: FuelId
  name: string
  short: string
  family: 'fossil' | 'lng' | 'alcohol' | 'ammonia' | 'bio-blend'
  lhvMJkg: number
  /** t CO2 / t fuel (combustion). MEPC.308(73) values where available, else derived. */
  cfTtW: number
  /** Tank-to-wake gCO2e/MJ incl. CH4/N2O (illustrative default). */
  ttwGco2eMJ: number
  /** Well-to-tank gCO2e/MJ (illustrative default). */
  wttGco2eMJ: number
  /** USD per tonne: scenario input. */
  priceUsdPerT: number
  /** Engine thermal efficiency relative to HFO 2-stroke. */
  effRel: number
  /** Tank volume needed per unit energy relative to HFO (storage penalty). */
  storageVolRel: number
  availability: Record<string, Availability>
  provenance: { lhv: Provenance; cf: Provenance; wtt: Provenance; price: Provenance }
  notes: string
}

export interface EngineSpec {
  maker: string
  model: string
  type: string
  cylinders: number
  rpm: number
  mcrKw: number
  sfocGkWh: number
}

export interface Vessel {
  id: string
  name: string
  callsign: string
  class: string
  type: 'bulk carrier'
  flag: string
  built: number
  dwt: number
  gt: number
  loaM: number
  beamM: number
  depthM: number
  designDraftM: number
  lightshipT: number
  /** tonnes per cm immersion near load draft */
  tpc: number
  holds: number
  grainCapacityM3: number
  designSpeedKn: number
  designPowerKw: number
  powerExponent: number
  minSpeedKn: number
  maxSpeedKn: number
  auxSeaKw: number
  auxPortKw: number
  hullFouling: number
  fuels: FuelId[]
  tankCapacityM3: Partial<Record<FuelId, number>>
  engine: EngineSpec
  safety: { maxHsM: number; maxWindKn: number }
  /** Synthetic operational profile used for CII projection */
  annual: { distanceNm: number; daysAtSea: number }
  hireUsdPerDay: number
  provenance: Provenance
}

export interface PortLimits {
  outerChannelDepthM: number
  innerChannelDepthM: number
  berthDepthM: number
  maxLoaM: number
  maxBeamM: number
  tidalRangeM: number
}

export interface Port {
  id: string
  unlocode: string
  name: string
  country: string
  position: LatLon
  pilotStation: LatLon
  /**
   * Approximate pilotage chain from the berth to open sea (first point = berth, last point = the
   * open-sea endpoint where A* corridor search starts or ends). NOT for navigation. Reversed for arrival.
   */
  approach: LatLon[]
  /** cargoes typically loaded here (scenario inputs) used by the voyage generator */
  exports: { cargoType: string; minT: number; maxT: number }[]
  timezone: string
  limits: PortLimits
  facts: { label: string; value: string; provenance: Provenance; sourceId?: string }[]
  scenario: {
    fuelAvailability: Partial<Record<FuelId, Availability>>
    shorePower: { available: boolean; capacityMw: number; priceUsdKwh: number; gridGco2Kwh: number }
    congestion: { waitingHours: number; berthOccupancyPct: number; vesselsAtAnchor: number }
    portDuesUsd: number
    berthHours: number
    weather: { windKn: number; windDirDeg: number; hsM: number; visibilityNm: number; summary: string }
    arrivals: { vessel: string; eta: string; status: 'berthed' | 'anchored' | 'inbound' | 'departed' }[]
  }
}

export interface Mission {
  originId: string
  destinationId: string
  cargoT: number
  cargoType: string
  /** ISO date-time (UTC) */
  departure: string
  arrivalEarliest: string
  arrivalLatest: string
  weights: { fuel: number; cost: number; emissions: number; risk: number; time: number }
  safetyProfile: 'cautious' | 'standard' | 'assertive'
  allowedFuels: FuelId[]
  shorePower: 'auto' | 'require' | 'never'
  vesselId: string | 'auto'
}

export type CorridorKind = 'shortest' | 'weather' | 'offshore' | 'current'

export interface Corridor {
  id: string
  name: string
  kind: CorridorKind
  waypoints: LatLon[]
  distanceNm: number
  description: string
  /** hours since departure the corridor was generated at (0 for initial plan) */
  generatedAtH: number
}

export interface EnvSample {
  windU: number
  windV: number
  windKn: number
  /** direction the wind blows FROM, degrees true */
  windFromDeg: number
  curU: number
  curV: number
  curKn: number
  hsM: number
  wavePeriodS: number
  /** direction waves come FROM */
  waveFromDeg: number
  depthM: number
  stormDistNm: number
  stormWindKn: number
}

export interface StormTrackPoint {
  tH: number
  lat: number
  lon: number
  vmaxKn: number
  rmaxNm: number
}

export interface StormForecast {
  issuedAtH: number
  label: string
  track: StormTrackPoint[]
}

export interface StormConfig {
  name: string
  forecasts: StormForecast[]
  /** ground truth used for replay ("actual"). Synthetic. */
  actual: StormTrackPoint[]
}

export interface OceanConfig {
  seed: number
  monsoon: 'SW' | 'NE' | 'transition'
  windScale: number
  swellM: number
  noiseAmp: number
  storm?: StormConfig
}

export interface Zone {
  id: string
  name: string
  kind: 'restricted' | 'shallow' | 'eca' | 'tss' | 'anchorage'
  /** [lon, lat][] */
  ring: number[][]
  depthM?: number
  provenance: Provenance
  note: string
}

export interface Decision {
  vesselId: string
  corridorId: string
  fuelId: FuelId
  shorePower: boolean
  legSpeedsKn: number[]
}

export interface SegmentResult {
  index: number
  from: LatLon
  to: LatLon
  tStartH: number
  tEndH: number
  distNm: number
  headingDeg: number
  stwKn: number
  sogKn: number
  currentAssistKn: number
  windKn: number
  windRelDeg: number
  hsM: number
  waveRelDeg: number
  powerKw: number
  loadFrac: number
  weatherFrac: number
  fuelT: number
  energyGJ: number
  co2TtwT: number
  co2WtwT: number
  risk: number
  hazards: string[]
  legIndex: number
}

export interface VoyageTotals {
  distanceNm: number
  timeH: number
  arrivalIso: string
  fuelT: number
  energyGJ: number
  co2TtwT: number
  co2WtwT: number
  auxFuelT: number
  portCo2T: number
  shorePowerKwh: number
  fuelCostUsd: number
  portCostUsd: number
  hireCostUsd: number
  costUsd: number
  riskMean: number
  riskMax: number
  avgSpeedKn: number
  sailingDraftM: number
}

export interface Evaluation {
  decision: Decision
  feasible: boolean
  violations: string[]
  warnings: string[]
  segments: SegmentResult[]
  totals: VoyageTotals
  /** minimised objectives: [fuelT, costUsd, co2 (WtW or TtW per settings), risk, timeH] */
  objectives: number[]
}

export type SolutionLabel = 'Balanced' | 'Greenest' | 'Lowest Cost' | 'Fastest' | 'Safest'

export interface Solution extends Evaluation {
  id: string
  labels: SolutionLabel[]
  cvar?: { riskCvar: number; fuelCvar: number; riskMean: number; fuelMean: number; scenarios: number; alpha: number }
}

export interface EngineSettings {
  mode: 'FAST' | 'BALANCED' | 'ROBUST'
  population: number
  iterations: number
  weatherScenarios: number
  cvarAlpha: number
  useCvar: boolean
  seed: number
  accounting: 'WtW' | 'TtW'
  safety: { maxHsM: number; maxWindKn: number; minUkcM: number }
  segmentNm: number
}

export interface ProgressEvent {
  phase: 'ocean' | 'corridors' | 'search' | 'cvar' | 'done'
  progress: number
  generation: number
  evaluations: number
  archiveSize: number
  hypervolume: number
  bestFuelT: number
  bestCo2T: number
  bestCostUsd: number
  message: string
  elapsedMs: number
}

export interface OptimizerRunResult {
  corridors: Corridor[]
  archive: Solution[]
  named: Solution[]
  baseline: Evaluation
  classical: Evaluation
  convergence: { generation: number; evaluations: number; hypervolume: number; bestFuelT: number; bestCo2T: number; archiveSize: number }[]
  evaluations: number
  elapsedMs: number
  settings: EngineSettings
  seed: number
  startState: StartState
  /** how often each constraint was violated across all evaluations (explains an empty archive) */
  violationTally: { reason: string; count: number }[]
  /** candidate hulls excluded before the search and why */
  excluded: { vesselId: string; reason: string }[]
}

export interface StartState {
  position: LatLon
  tH: number
  fuelUsedT: number
  co2UsedT: number
  costUsedUsd: number
  distanceDoneNm: number
}
