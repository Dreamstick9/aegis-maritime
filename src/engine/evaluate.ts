/**
 * Voyage evaluator: turns a decision (vessel, corridor, fuel, shore power, speed profile)
 * into segment-by-segment performance, totals, constraint status and objectives.
 */
import { FUELS, co2FromEnergy, energyGJFromMass, fuelMassT } from './fuels'
import { clamp, haversineNm, initialBearingDeg, interpolateGreatCircle, relativeAngleDeg } from './geo'
import { currentAlongTrack, sampleEnv, type OceanOptions } from './ocean'
import type { Corridor, Decision, EngineSettings, Evaluation, FuelId, Mission, OceanConfig, Port, SegmentResult, StartState, Vessel, VoyageTotals } from './types'
import { loadingCondition, powerDemand, sfocGkWh } from './vessel'
import { zoneBits } from './zones'

export const SPEED_LEGS = 6
export const STORES_T = 600
export const AUX_SFOC_GKWH = 215
export const SHORE_CONNECTION_FEE_USD = 2500
export const APPROACH_SPEED_CAP_KN = 12
export const APPROACH_NM = 260
export const PILOTAGE_NM = 15
export const PILOTAGE_SPEED_CAP_KN = 10

export const FUEL_DENSITY_T_M3: Record<FuelId, number> = {
  HFO: 0.99,
  VLSFO: 0.95,
  MGO: 0.86,
  LNG: 0.45,
  MEOH: 0.79,
  EMEOH: 0.79,
  NH3: 0.68,
  B30: 0.92,
}

export interface EvalContext {
  vessels: Record<string, Vessel>
  corridors: Record<string, Corridor>
  ports: Record<string, Port>
  mission: Mission
  ocean: OceanConfig
  oceanOpts: OceanOptions
  settings: EngineSettings
  start: StartState
}

export function safetyFactor(profile: Mission['safetyProfile']): number {
  return profile === 'cautious' ? 0.85 : profile === 'assertive' ? 1.12 : 1
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

interface Sub {
  from: { lat: number; lon: number }
  to: { lat: number; lon: number }
  distNm: number
  legIndex: number
}

/** Split corridor waypoint legs into ~segmentNm pieces keeping the leg index. */
export function subdivide(corridor: Corridor, segmentNm: number): Sub[] {
  const out: Sub[] = []
  const w = corridor.waypoints
  for (let i = 1; i < w.length; i++) {
    const d = haversineNm(w[i - 1], w[i])
    const n = Math.max(1, Math.ceil(d / segmentNm))
    for (let k = 0; k < n; k++) {
      const a = interpolateGreatCircle(w[i - 1], w[i], k / n)
      const b = interpolateGreatCircle(w[i - 1], w[i], (k + 1) / n)
      out.push({ from: a, to: b, distNm: haversineNm(a, b), legIndex: i - 1 })
    }
  }
  return out
}

export function tankCapacityT(v: Vessel, fuel: FuelId): number {
  const m3 = v.tankCapacityM3[fuel] ?? (fuel === 'HFO' || fuel === 'B30' ? v.tankCapacityM3.VLSFO : fuel === 'EMEOH' ? v.tankCapacityM3.MEOH : undefined) ?? 0
  return m3 * FUEL_DENSITY_T_M3[fuel]
}

export function evaluateDecision(d: Decision, ctx: EvalContext): Evaluation {
  const vessel = ctx.vessels[d.vesselId]
  const corridor = ctx.corridors[d.corridorId]
  const fuel = FUELS[d.fuelId]
  const mgo = FUELS.MGO
  const origin = ctx.ports[ctx.mission.originId]
  const dest = ctx.ports[ctx.mission.destinationId]
  const violations: string[] = []
  const warnings: string[] = []
  const sf = safetyFactor(ctx.mission.safetyProfile)
  const { accounting, safety } = ctx.settings
  const maxHs = Math.min(vessel.safety.maxHsM, safety.maxHsM) * sf
  const maxWind = Math.min(vessel.safety.maxWindKn, safety.maxWindKn) * sf

  if (!vessel.fuels.includes(d.fuelId)) violations.push(`${vessel.name} cannot burn ${fuel.short} (fuel/vessel compatibility)`)
  // availability: the port's own scenario table first (every generated port carries one), then the fuel table
  const availO = origin.scenario.fuelAvailability[d.fuelId] ?? fuel.availability[origin.id] ?? 'none'
  const availD = dest.scenario.fuelAvailability[d.fuelId] ?? fuel.availability[dest.id] ?? 'none'
  if (availO === 'none' && availD === 'none') violations.push(`${fuel.short} is not available at ${origin.name} or ${dest.name}`)
  else if (availO === 'none') warnings.push(`${fuel.short} not bunkerable at ${origin.name}: departs on existing inventory, bunkers at ${dest.name}`)
  else if (availO === 'limited') warnings.push(`${fuel.short} availability at ${origin.name} is limited (scenario)`)

  const cargoT = ctx.mission.cargoT
  const subs = subdivide(corridor, ctx.settings.segmentNm)
  const totalDist = subs.reduce((s, x) => s + x.distNm, 0)
  // the approach speed cap covers the last 260 nm of a long passage but never more than 15% of a short one
  const approachNm = Math.min(APPROACH_NM, 0.15 * totalDist)
  const speeds = d.legSpeedsKn.map((s) => clamp(s, vessel.minSpeedKn, vessel.maxSpeedKn))

  // Two passes: bunkers depend on consumption which depends on displacement.
  let bunkersT = 1800
  let segments: SegmentResult[] = []
  let mainFuelByFuel: Partial<Record<FuelId, number>> = {}
  let auxFuelT = 0
  let timeH = 0
  let loading = loadingCondition(vessel, cargoT, bunkersT + STORES_T)
  for (let pass = 0; pass < 2; pass++) {
    loading = loadingCondition(vessel, cargoT, bunkersT + STORES_T)
    segments = []
    mainFuelByFuel = {}
    auxFuelT = 0
    let tH = ctx.start.tH
    let distDone = 0
    for (let i = 0; i < subs.length; i++) {
      const s = subs[i]
      const mid = interpolateGreatCircle(s.from, s.to, 0.5)
      const heading = initialBearingDeg(s.from, s.to)
      const env = sampleEnv(ctx.ocean, mid.lat, mid.lon, tH, ctx.oceanOpts)
      const assist = currentAlongTrack(env, heading)
      const bin = Math.min(SPEED_LEGS - 1, Math.floor((distDone / totalDist) * SPEED_LEGS))
      let target = speeds[bin] ?? vessel.designSpeedKn
      const remaining = totalDist - distDone
      if (remaining < approachNm) target = Math.min(target, APPROACH_SPEED_CAP_KN)
      if (distDone < PILOTAGE_NM || remaining < PILOTAGE_NM) target = Math.min(target, PILOTAGE_SPEED_CAP_KN)
      const pd = powerDemand(vessel, target, env, heading, loading.displacementFrac, 0.9)
      const stw = pd.achievedStwKn
      const sog = Math.max(2.5, stw + assist)
      const hours = s.distNm / sog
      const bits = zoneBits(mid.lat, mid.lon)
      const inEca = (bits & 4) !== 0
      const useFuel = inEca && (fuel.family === 'fossil' || fuel.family === 'bio-blend') && fuel.id !== 'MGO' ? mgo : fuel
      const sfoc = sfocGkWh(vessel, pd.loadFrac)
      const mainT = fuelMassT(pd.totalKw, hours, sfoc, useFuel)
      const auxT = fuelMassT(vessel.auxSeaKw, hours, AUX_SFOC_GKWH, mgo)
      mainFuelByFuel[useFuel.id] = (mainFuelByFuel[useFuel.id] ?? 0) + mainT
      auxFuelT += auxT
      const mainGJ = energyGJFromMass(mainT, useFuel)
      const auxGJ = energyGJFromMass(auxT, mgo)
      const co2Ttw = co2FromEnergy(mainGJ, useFuel, 'TtW') + co2FromEnergy(auxGJ, mgo, 'TtW')
      const co2Wtw = co2FromEnergy(mainGJ, useFuel, 'WtW') + co2FromEnergy(auxGJ, mgo, 'WtW')

      // risk components
      const hazards: string[] = []
      const seaRisk = sigmoid((env.hsM - 0.72 * maxHs) / (0.11 * maxHs))
      const windRisk = sigmoid((env.windKn - 0.8 * maxWind) / (0.09 * maxWind))
      const stormRisk = clamp((env.stormWindKn - 18) / 30, 0, 1)
      // inside pilotage waters the port-compatibility logic below governs draught; use the port channel depth
      const inPilotage = distDone < PILOTAGE_NM || remaining < PILOTAGE_NM
      const depthHere = inPilotage ? Math.max(env.depthM, distDone < PILOTAGE_NM ? origin.limits.innerChannelDepthM + origin.limits.tidalRangeM : dest.limits.berthDepthM + dest.limits.tidalRangeM) : env.depthM
      const ukc = depthHere - loading.sailingDraftM
      const ukcRisk = ukc < safety.minUkcM ? 1 : ukc < 2 * safety.minUkcM ? 0.35 : 0.01
      const trafficRisk = bits & 8 ? 0.12 : 0.015
      const risk = 1 - (1 - seaRisk) * (1 - windRisk) * (1 - stormRisk) * (1 - ukcRisk) * (1 - trafficRisk)
      if (env.hsM > maxHs) {
        hazards.push(`Hs ${env.hsM.toFixed(1)} m exceeds limit ${maxHs.toFixed(1)} m`)
        if (pass === 1) violations.push(`Sea state ${env.hsM.toFixed(1)} m exceeds ${maxHs.toFixed(1)} m limit at segment ${i + 1} (t+${tH.toFixed(0)} h)`)
      } else if (seaRisk > 0.5) hazards.push(`Heavy seas Hs ${env.hsM.toFixed(1)} m`)
      if (env.windKn > maxWind) {
        hazards.push(`Wind ${env.windKn.toFixed(0)} kn exceeds limit`)
        if (pass === 1) violations.push(`Wind ${env.windKn.toFixed(0)} kn exceeds ${maxWind.toFixed(0)} kn limit at segment ${i + 1}`)
      }
      if (env.stormWindKn > 18) hazards.push(`Storm field ${env.stormDistNm.toFixed(0)} nm (${env.stormWindKn.toFixed(0)} kn)`)
      if (ukc < safety.minUkcM && !inPilotage) {
        hazards.push(`UKC ${ukc.toFixed(1)} m below minimum`)
        if (pass === 1) violations.push(`Under-keel clearance ${ukc.toFixed(1)} m < ${safety.minUkcM} m at segment ${i + 1}`)
      }
      if (bits & 1) {
        hazards.push('Restricted zone')
        if (pass === 1) violations.push(`Track enters a restricted zone at segment ${i + 1}`)
      }
      if (bits & 8) hazards.push('TSS, dense traffic')
      if (inEca) hazards.push(useFuel.id !== fuel.id ? 'Emission-control overlay, MGO switch' : 'Emission-control overlay')
      if (pd.capped) hazards.push(`Engine load cap, speed loss ${(target - stw).toFixed(1)} kn`)

      segments.push({
        index: i,
        from: s.from,
        to: s.to,
        tStartH: tH,
        tEndH: tH + hours,
        distNm: s.distNm,
        headingDeg: heading,
        stwKn: stw,
        sogKn: sog,
        currentAssistKn: assist,
        windKn: env.windKn,
        windRelDeg: pd.weatherFrac >= 0 ? relDeg(heading, env.windFromDeg) : 0,
        hsM: env.hsM,
        waveRelDeg: relDeg(heading, env.waveFromDeg),
        powerKw: pd.totalKw,
        loadFrac: pd.loadFrac,
        weatherFrac: pd.weatherFrac,
        fuelT: mainT + auxT,
        energyGJ: mainGJ + auxGJ,
        co2TtwT: co2Ttw,
        co2WtwT: co2Wtw,
        risk,
        hazards,
        legIndex: s.legIndex,
      })
      tH += hours
      distDone += s.distNm
    }
    timeH = tH - ctx.start.tH
    const mainTotal = Object.values(mainFuelByFuel).reduce((a, b) => a + (b ?? 0), 0)
    bunkersT = (mainTotal + auxFuelT) * 1.15
  }

  // capacity / tank checks
  if (!loading.capacityOk) violations.push(`Cargo ${cargoT.toLocaleString()} t + bunkers exceeds deadweight ${vessel.dwt.toLocaleString()} t`)
  const primaryMass = mainFuelByFuel[d.fuelId] ?? 0
  const cap = tankCapacityT(vessel, d.fuelId)
  if (cap > 0 && primaryMass * 1.15 > cap) violations.push(`${fuel.short} demand ${Math.round(primaryMass * 1.15)} t (incl. 15% reserve) exceeds tank capacity ${Math.round(cap)} t`)

  // port limits (origin: sailing draft vs channel with tide; destination: berth depth)
  const draft = loading.sailingDraftM
  const oLim = origin.limits
  if (draft + ctx.settings.safety.minUkcM > oLim.innerChannelDepthM + oLim.tidalRangeM) violations.push(`Sailing draught ${draft.toFixed(1)} m cannot clear ${origin.name} inner channel (${oLim.innerChannelDepthM} m + ${oLim.tidalRangeM} m tide)`)
  else if (draft + ctx.settings.safety.minUkcM > oLim.innerChannelDepthM) warnings.push(`Sailing draught ${draft.toFixed(1)} m exceeds ${origin.name} channel at low water: tidal window or anchorage top-up required (conditional)`)
  const dLim = dest.limits
  if (draft + ctx.settings.safety.minUkcM > dLim.berthDepthM + dLim.tidalRangeM) violations.push(`Draught ${draft.toFixed(1)} m exceeds ${dest.name} berth depth ${dLim.berthDepthM} m`)
  else if (draft + ctx.settings.safety.minUkcM > dLim.berthDepthM) warnings.push(`Arrival draught ${draft.toFixed(1)} m needs a tidal window at ${dest.name}`)
  if (vessel.loaM > dLim.maxLoaM || vessel.beamM > dLim.maxBeamM) violations.push(`${vessel.name} exceeds ${dest.name} LOA/beam limits`)
  if (vessel.loaM > oLim.maxLoaM || vessel.beamM > oLim.maxBeamM) violations.push(`${vessel.name} exceeds ${origin.name} LOA/beam limits`)

  // port phase at destination: waiting + berth with shore power or auxiliaries
  const sp = dest.scenario.shorePower
  const shoreUsed = d.shorePower && sp.available
  if (d.shorePower && !sp.available) warnings.push(`Shore power requested but unavailable at ${dest.name}; auxiliaries used at berth`)
  if (ctx.mission.shorePower === 'require' && !shoreUsed) violations.push('Mission requires shore power at destination')
  const berthH = dest.scenario.berthHours
  const waitH = dest.scenario.congestion.waitingHours
  const anchorAuxT = fuelMassT(vessel.auxSeaKw * 0.7, waitH, AUX_SFOC_GKWH, mgo)
  let shorePowerKwh = 0
  let portAuxT = 0
  let portCo2Ttw: number
  let portCo2Wtw: number
  if (shoreUsed) {
    shorePowerKwh = vessel.auxPortKw * berthH
    const gridT = (shorePowerKwh * sp.gridGco2Kwh) / 1e6
    portCo2Ttw = gridT
    portCo2Wtw = gridT
  } else {
    portAuxT = fuelMassT(vessel.auxPortKw, berthH, AUX_SFOC_GKWH, mgo)
    const gj = energyGJFromMass(portAuxT, mgo)
    portCo2Ttw = co2FromEnergy(gj, mgo, 'TtW')
    portCo2Wtw = co2FromEnergy(gj, mgo, 'WtW')
  }
  const anchorGJ = energyGJFromMass(anchorAuxT, mgo)
  portCo2Ttw += co2FromEnergy(anchorGJ, mgo, 'TtW')
  portCo2Wtw += co2FromEnergy(anchorGJ, mgo, 'WtW')

  // time window
  const departureMs = Date.parse(ctx.mission.departure)
  const arrivalMs = departureMs + (ctx.start.tH + timeH) * 3600e3
  const earliest = Date.parse(ctx.mission.arrivalEarliest)
  const latest = Date.parse(ctx.mission.arrivalLatest)
  let earlyWaitH = 0
  if (arrivalMs > latest) violations.push(`ETA ${((arrivalMs - latest) / 3600e3).toFixed(1)} h after the latest arrival`)
  if (arrivalMs < earliest) {
    earlyWaitH = (earliest - arrivalMs) / 3600e3
    warnings.push(`Arrives ${earlyWaitH.toFixed(1)} h before the window opens; waits at anchorage`)
  }
  const earlyAuxT = fuelMassT(vessel.auxSeaKw * 0.7, earlyWaitH, AUX_SFOC_GKWH, mgo)

  // totals
  const segFuel = segments.reduce((s, x) => s + x.fuelT, 0)
  const segCo2Ttw = segments.reduce((s, x) => s + x.co2TtwT, 0)
  const segCo2Wtw = segments.reduce((s, x) => s + x.co2WtwT, 0)
  const segGJ = segments.reduce((s, x) => s + x.energyGJ, 0)
  const fuelT = segFuel + portAuxT + anchorAuxT + earlyAuxT
  const mgoMass = (mainFuelByFuel.MGO ?? 0) + auxFuelT + portAuxT + anchorAuxT + earlyAuxT
  let fuelCost = mgoMass * mgo.priceUsdPerT
  for (const [fid, m] of Object.entries(mainFuelByFuel)) if (fid !== 'MGO' && m) fuelCost += m * FUELS[fid as FuelId].priceUsdPerT
  const shoreCost = shoreUsed ? shorePowerKwh * sp.priceUsdKwh + SHORE_CONNECTION_FEE_USD : 0
  const portCost = dest.scenario.portDuesUsd + origin.scenario.portDuesUsd + shoreCost
  const hireCost = ((timeH + waitH + berthH + earlyWaitH) / 24) * vessel.hireUsdPerDay
  const co2Ttw = segCo2Ttw + portCo2Ttw + co2FromEnergy(energyGJFromMass(earlyAuxT, mgo), mgo, 'TtW')
  const co2Wtw = segCo2Wtw + portCo2Wtw + co2FromEnergy(energyGJFromMass(earlyAuxT, mgo), mgo, 'WtW')
  const riskMean = segments.reduce((s, x) => s + x.risk, 0) / Math.max(1, segments.length)
  const riskMax = segments.reduce((s, x) => Math.max(s, x.risk), 0)
  const totals: VoyageTotals = {
    distanceNm: totalDist,
    timeH,
    arrivalIso: new Date(arrivalMs).toISOString(),
    fuelT,
    energyGJ: segGJ + energyGJFromMass(portAuxT + anchorAuxT + earlyAuxT, mgo),
    co2TtwT: co2Ttw,
    co2WtwT: co2Wtw,
    auxFuelT: auxFuelT + portAuxT + anchorAuxT + earlyAuxT,
    portCo2T: portCo2Ttw,
    shorePowerKwh,
    fuelCostUsd: fuelCost,
    portCostUsd: portCost,
    hireCostUsd: hireCost,
    costUsd: fuelCost + portCost + hireCost,
    riskMean,
    riskMax,
    avgSpeedKn: totalDist / Math.max(1e-6, timeH),
    sailingDraftM: draft,
  }
  const co2Obj = accounting === 'WtW' ? co2Wtw : co2Ttw
  const riskObj = 0.5 * riskMax + 0.5 * riskMean
  return {
    decision: { ...d, legSpeedsKn: speeds },
    feasible: violations.length === 0,
    violations,
    warnings,
    segments,
    totals,
    objectives: [fuelT, totals.costUsd, co2Obj, riskObj, timeH],
  }
}

function relDeg(headingDeg: number, fromDeg: number): number {
  return relativeAngleDeg(headingDeg, fromDeg)
}

/** Cumulative arrays for replay/inspection */
export function cumulative(ev: Evaluation): { distNm: number[]; fuelT: number[]; co2T: number[]; tH: number[] } {
  const distNm: number[] = []
  const fuelT: number[] = []
  const co2T: number[] = []
  const tH: number[] = []
  let d = 0
  let f = 0
  let c = 0
  for (const s of ev.segments) {
    d += s.distNm
    f += s.fuelT
    c += s.co2WtwT
    distNm.push(d)
    fuelT.push(f)
    co2T.push(c)
    tH.push(s.tEndH)
  }
  return { distNm, fuelT, co2T, tH }
}
