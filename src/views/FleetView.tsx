import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CaretDown, X } from '@phosphor-icons/react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmt } from '../app/format'
import { activePlanAt, useStore, voyageTitle } from '../app/store'
import { FLEET, FLEET_BY_ID } from '../data/fleet'
import { PORTS } from '../data/ports'
import VesselViewer from '../components/vessel/VesselViewer'
import { REGION_META, regionOf, type RegionId } from '../components/vessel/regions'
import { nominalCii } from '../engine/ciiProfile'
import { Cell, Check, Disclosure, Mark, Rows } from '../components/ui/primitives'
import { projectCii, type CiiProjection } from '../engine/cii'
import { FUELS, energyGJFromMass, fuelMassT, priceUsdPerGJ, fuelIntensity } from '../engine/fuels'
import { FUEL_DENSITY_T_M3, STORES_T, tankCapacityT } from '../engine/evaluate'
import { calmWaterPowerKw, loadingCondition, sfocGkWh, weatherResidual } from '../engine/vessel'
import type { EnvSample, FuelId, Vessel } from '../engine/types'
import { layoutFor } from '../components/vessel/hull'

const ORE_STOWAGE_M3_PER_T = 0.4

function CiiScale({ p }: { p: CiiProjection }) {
  const max = p.required * 1.35
  const pos = Math.min(100, (p.attained / max) * 100)
  const stops = [p.boundaries.A, p.boundaries.B, p.boundaries.C, p.boundaries.D, max]
  let from = 0
  return (
    <div role="img" aria-label={`Projected CII rating ${p.rating}: attained ${p.attained.toFixed(2)} against required ${p.required.toFixed(2)} gCO₂ per DWT-mile`}>
      <div className="cii-scale">
        {stops.map((to, i) => {
          const w = ((to - from) / max) * 100
          from = to
          return <span key={i} style={{ width: `${w}%`, background: i === 4 ? 'rgba(168,38,28,0.45)' : i === 3 ? 'rgba(17,17,18,0.32)' : 'var(--hair)' }} />
        })}
        <i style={{ left: `${pos}%` }} />
      </div>
      <div className="cii-scale__labels">
        <span>A</span>
        <span>B</span>
        <span>C</span>
        <span>D</span>
        <span>E</span>
      </div>
      <div className="small muted num" style={{ marginTop: 6 }}>
        attained {p.attained.toFixed(2)}, required {p.year} {p.required.toFixed(2)}, ratio {p.ratio.toFixed(2)}
      </div>
    </div>
  )
}

function SpeedPower({ v }: { v: Vessel }) {
  const data = useMemo(() => {
    const calm: EnvSample = { windU: 0, windV: 0, windKn: 0, windFromDeg: 0, curU: 0, curV: 0, curKn: 0, hsM: 0.5, wavePeriodS: 6, waveFromDeg: 0, depthM: 3000, stormDistNm: Infinity, stormWindKn: 0 }
    const rough: EnvSample = { ...calm, windKn: 30, windFromDeg: 0, hsM: 4, waveFromDeg: 0 }
    const out = []
    for (let s = v.minSpeedKn; s <= v.maxSpeedKn + 1e-9; s += 0.5) {
      const p0 = calmWaterPowerKw(v, s, 0.78)
      const wr = weatherResidual(v, rough, 0, s)
      out.push({ speed: s, calm: Math.round(p0), head: Math.round(Math.min(v.engine.mcrKw, p0 * (1 + wr.totalFrac))), cap: Math.round(v.engine.mcrKw * 0.9) })
    }
    return out
  }, [v])
  return (
    <div>
      <div className="chart chart--short">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(245,239,221,0.08)" vertical={false} />
            <XAxis dataKey="speed" tick={{ fontSize: 12, fill: '#9a958c' }} stroke="rgba(245,239,221,0.24)" tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#9a958c' }} stroke="transparent" tickLine={false} width={44} />
            <Tooltip contentStyle={{ background: '#1a1a1c', border: '1px solid rgba(245,239,221,0.24)', color: '#f5efdd', fontSize: 12, fontFamily: 'var(--mono)' }} formatter={(val) => `${Number(val).toLocaleString()} kW`} labelFormatter={(l) => `${l} kn`} />
            <Line type="monotone" dataKey="calm" stroke="#f2c230" dot={false} strokeWidth={1.8} isAnimationActive={false} />
            <Line type="monotone" dataKey="head" stroke="#c9c3b6" dot={false} strokeWidth={1.2} isAnimationActive={false} />
            <Line type="monotone" dataKey="cap" stroke="#ef4b3f" dot={false} strokeWidth={1} strokeDasharray="4 4" isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="legend">
        <span><i style={{ background: '#f2c230' }} />calm water, P = k × V^{v.powerExponent}</span>
        <span><i style={{ background: '#c9c3b6' }} />head seas Hs 4 m, 30 kn</span>
        <span><i style={{ background: '#ef4b3f' }} />90% MCR</span>
      </div>
    </div>
  )
}

function regionRows(v: Vessel, sel: string | null, fuelId: FuelId, cargoT: number, cargoType: string): [string, string][] {
  const region = regionOf(sel)
  const layout = layoutFor(v)
  const lc = loadingCondition(v, cargoT, 1800 + STORES_T)
  const fuel = FUELS[fuelId]
  const rows: [string, string][] = []
  if (region === 'engine') {
    const pDesign = calmWaterPowerKw(v, v.designSpeedKn, 1)
    const sf = sfocGkWh(v, 0.75)
    const daily = fuelMassT(pDesign, 24, sfocGkWh(v, pDesign / v.engine.mcrKw), fuel)
    rows.push(['Main engine', `${v.engine.maker} ${v.engine.model}`], ['Type', v.engine.type], ['Cylinders, rpm', `${v.engine.cylinders}, ${v.engine.rpm}`], ['MCR', `${fmt.int(v.engine.mcrKw)} kW`], ['Design point', `${fmt.int(v.designPowerKw)} kW at ${v.designSpeedKn} kn (${Math.round((v.designPowerKw / v.engine.mcrKw) * 100)}% MCR)`], ['SFOC at 75% load', `${sf.toFixed(1)} g/kWh, η ≈ ${((3600 / (sf * 40.2)) * 100).toFixed(1)}%`], ['Consumption at design speed', `${daily.toFixed(1)} t/day ${fuel.short}`], ['Auxiliary generation', `3 × ${fmt.int(Math.ceil(v.auxPortKw / 0.7 / 50) * 50)} kW; sea ${v.auxSeaKw} kW, port ${v.auxPortKw} kW`])
  } else if (region === 'fuel') {
    for (const [fid, m3] of Object.entries(v.tankCapacityM3)) {
      const f = FUELS[fid as FuelId]
      const t = (m3 ?? 0) * FUEL_DENSITY_T_M3[fid as FuelId]
      const gj = energyGJFromMass(t, f)
      const p = calmWaterPowerKw(v, 12.5, lc.displacementFrac) * 1.1
      const dayT = fuelMassT(p, 24, sfocGkWh(v, p / v.engine.mcrKw), f)
      rows.push([`${f.short} tanks`, `${fmt.int(m3 ?? 0)} m³ ≈ ${fmt.int(t)} t ≈ ${fmt.int(gj)} GJ, ${(t / dayT).toFixed(0)} days at 12.5 kn`])
    }
    rows.push(['Selected fuel', fuel.name], ['Energy density', `${fuel.lhvMJkg} MJ/kg, tank volume ×${fuel.storageVolRel} vs fuel oil`], ['Price per energy', `${priceUsdPerGJ(fuel).toFixed(2)} $/GJ at ${fuel.priceUsdPerT} $/t`], ['Lifecycle intensity', `WtW ${fuelIntensity(fuel, 'WtW').toFixed(1)}, TtW ${fuel.ttwGco2eMJ} gCO₂e/MJ`], ['Capacity for selected fuel', tankCapacityT(v, fuelId) > 0 ? `${fmt.int(tankCapacityT(v, fuelId))} t` : 'no compatible tank'])
  } else if (region === 'cargo') {
    const hold = sel?.startsWith('hold-') ? Number(sel.split('-')[1]) : null
    rows.push(['Holds and hatches', `${v.holds} and ${v.holds}, gearless`], ['Grain capacity', `${fmt.int(v.grainCapacityM3)} m³ (${fmt.int(v.grainCapacityM3 / v.holds)} m³ per hold)`], ['Mission cargo', `${fmt.int(cargoT)} t ${cargoType.toLowerCase()}, stowage ${ORE_STOWAGE_M3_PER_T} m³/t (design constant)`], ['Volume utilisation', `${(((cargoT * ORE_STOWAGE_M3_PER_T) / v.grainCapacityM3) * 100).toFixed(0)}% of grain capacity`], ['Deadweight utilisation', `${((lc.deadweightUsedT / v.dwt) * 100).toFixed(0)}% of ${fmt.int(v.dwt)} t`])
    if (hold) {
      const b = layout.holds[hold - 1]
      rows.push([`No. ${hold} hold`, `${b.size[0].toFixed(1)} × ${b.size[2].toFixed(1)} × ${b.size[1].toFixed(1)} m, ${fmt.int(cargoT / v.holds)} t even distribution`])
    }
  } else if (region === 'ballast') {
    rows.push(['Lightship', `${fmt.int(v.lightshipT)} t`], ['Displacement, sailing', `${fmt.int(lc.displacementT)} t (${(lc.displacementFrac * 100).toFixed(0)}% of full load)`], ['Sailing draught', `${lc.sailingDraftM.toFixed(2)} m (design ${v.designDraftM} m)`], ['Freeboard', `${(v.depthM - lc.sailingDraftM).toFixed(2)} m`], ['TPC', `${v.tpc} t/cm`], ['Ballast capacity', `≈ ${fmt.int(v.dwt * 0.45)} t (typical ratio)`])
  } else if (region === 'bridge') {
    rows.push(['Bridge deck', `${layout.bridge.position[1].toFixed(1)} m above keel`], ['Forward visibility', 'SOLAS V/22: sea surface visible within two ship lengths or 500 m ahead, whichever is less'], ['Navigation fit', 'ECDIS ×2, X/S-band radar, AIS class A, GNSS, BNWAS, VDR (illustrative)'], ['Complement', '22'], ['Accommodation', `${layout.accommodation.size[0].toFixed(0)} m block, five decks and bridge wings`])
  } else if (region === 'propulsion') {
    rows.push(['Propeller', `four-blade fixed pitch, Ø ${layout.propeller.diameter.toFixed(1)} m`], ['Rudder', 'semi-spade, ±35°'], ['Power law', `P = ${fmt.int(v.designPowerKw)} kW × (V/${v.designSpeedKn})^${v.powerExponent} × Δ^(2/3) × ${v.hullFouling} fouling`], ['Speed range', `${v.minSpeedKn} to ${v.maxSpeedKn} kn`], ['Power at 10 / 12 / 14 kn, laden', [10, 12, 14].map((s) => fmt.int(calmWaterPowerKw(v, s, lc.displacementFrac))).join(' / ') + ' kW'])
  } else if (region === 'bow') {
    rows.push(['Bulbous bow', `≈ ${layout.bulb.radius[0].toFixed(0)} m protrusion`], ['Anchors', 'two high-holding-power anchors, grade 3 chain'], ['Mooring', 'four forecastle winches, no bow thruster'], ['Forecastle deck', `${layout.forecastle.size[0].toFixed(0)} m`])
  }
  return rows
}

export default function FleetView() {
  const selectedVesselId = useStore((s) => s.selectedVesselId)
  const selectVessel = useStore((s) => s.selectVessel)
  const selectedRegion = useStore((s) => s.selectedRegion)
  const selectRegion = useStore((s) => s.selectRegion)
  const mission = useStore((s) => s.mission)
  const reduced = useStore((s) => s.ui.reducedMotion)
  const plans = useStore((s) => s.plans)
  const tH = useStore((s) => Math.floor(s.timeline.tH))
  const engine = useStore((s) => s.engine)
  const scenario = useStore((s) => s.scenario)
  const fleetUnits = scenario.fleetUnits
  const origin = PORTS[mission.originId]
  const originName = origin?.name ?? mission.originId
  const channelM = origin?.limits.innerChannelDepthM ?? 0
  const [xray, setXray] = useState(false)
  const [rotate, setRotate] = useState(true)
  const [switcher, setSwitcher] = useState(false)
  const [panel, setPanel] = useState(true)
  useEffect(() => {
    if (!panel) document.getElementById('dossier-reopen')?.focus()
  }, [panel])
  const v = FLEET_BY_ID[selectedVesselId] ?? FLEET[0]
  const active = activePlanAt(plans, tH)
  const planForVessel = active && active.evaluation.decision.vesselId === v.id ? active.evaluation : null
  const fuelId: FuelId = planForVessel?.decision.fuelId ?? (v.fuels.find((f) => mission.allowedFuels.includes(f)) ?? v.fuels[0])
  const lc = loadingCondition(v, mission.cargoT, 1800 + STORES_T)
  const cii = planForVessel ? projectCii(v, planForVessel.totals.co2TtwT, planForVessel.totals.distanceNm, 2026) : nominalCii(v)
  const unit = fleetUnits.find((u) => u.vesselId === v.id)
  const status = planForVessel ? `mission vessel, ${voyageTitle(scenario.id, mission)}` : unit ? `${unit.status}, bound for ${unit.destination}` : `alongside ${originName}, loading`
  const region = regionOf(selectedRegion)
  const rows = regionRows(v, selectedRegion, fuelId, mission.cargoT, mission.cargoType)
  const draughtTone = lc.sailingDraftM + engine.safety.minUkcM > channelM ? 'warn' : undefined

  return (
    <div className={`command command--fleet ${panel ? 'command--inspector' : ''}`}>
      <h1 className="sr-only">Fleet, vessel dossier</h1>
      <div className="command__stage">
        <div className="stage-canvas">
          <VesselViewer vessel={v} selected={selectedRegion} onSelect={selectRegion} xray={xray} autoRotate={rotate} sailingDraftM={lc.sailingDraftM} reducedMotion={reduced} cargoFill={(mission.cargoT * ORE_STOWAGE_M3_PER_T) / v.grainCapacityM3} />
        </div>

      {/* hull switcher, hidden by default */}
      <div className={`overlay drawer on-k ${switcher ? '' : 'drawer--closed'}`}>
        <button type="button" className="drawer__tab" onClick={() => setSwitcher(!switcher)} aria-expanded={switcher} aria-controls="hull-list">
          <span style={{ color: 'var(--ink0)', fontSize: 14.5, fontWeight: 500 }}>{v.name}</span>
          <span className="num" style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {FLEET.length} hulls
            <CaretDown size={14} aria-hidden="true" />
          </span>
        </button>
        {switcher && (
          <div className="drawer__body" id="hull-list" style={{ padding: 0 }}>
            {FLEET.map((f) => {
              const c = nominalCii(f)
              const u = fleetUnits.find((x) => x.vesselId === f.id)
              const isMission = active?.evaluation.decision.vesselId === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`hull ${f.id === v.id ? 'is-selected' : ''}`}
                  onClick={() => {
                    selectVessel(f.id)
                    setSwitcher(false)
                  }}
                  aria-pressed={f.id === v.id}
                >
                  <div className="hull__name">
                    <span>{f.name}</span>
                    <span className="num muted small">CII {c.rating}</span>
                  </div>
                  <div className="hull__class">{f.class}</div>
                  <div className="hull__spec">
                    <span>{fmt.int(f.dwt)} DWT</span>
                    <span>{f.built}</span>
                    <span>{f.fuels.slice(0, 3).map((x) => FUELS[x].short).join(' / ')}</span>
                  </div>
                  <div className="hull__status">{isMission ? 'Mission vessel, active plan' : u ? `${u.status}, bound for ${u.destination}` : `Alongside ${originName}`}</div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {!panel && (
        <button type="button" id="dossier-reopen" className="btn btn--outline stage__reopen on-k overlay" onClick={() => setPanel(true)}>
          Dossier
        </button>
      )}
      </div>

      <div className="command__panel">
      <AnimatePresence initial={false}>
      {panel && (
        <motion.aside
          key="dossier"
          className="inspector"
          aria-label="Vessel dossier"
          initial={reduced ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduced ? undefined : { opacity: 0, x: 24 }}
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="inspector__head">
            <h2 className="inspector__title">
              {v.name}
              <small>
                {v.class}, built {v.built}. {status.charAt(0).toUpperCase() + status.slice(1)}
              </small>
            </h2>
            <button type="button" className="btn btn--icon btn--sm" onClick={() => setPanel(false)} aria-label="Close dossier" title="Close">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <div>
            <div className="inspector__lead">
              <div>
                <span className="label">Deadweight</span>
                <div className="numeral">
                  {fmt.int(v.dwt / 1000)}
                  <small>k t</small>
                </div>
              </div>
              <div>
                <span className="label">Length overall</span>
                <div className="numeral">
                  {v.loaM}
                  <small>m</small>
                </div>
              </div>
              <div>
                <span className="label">Design speed</span>
                <div className="numeral">
                  {v.designSpeedKn}
                  <small>kn</small>
                </div>
              </div>
              <div>
                <span className="label">Projected CII</span>
                <div className={`numeral ${cii.rating === 'D' ? 'risk-warn' : cii.rating === 'E' ? 'risk-crit' : ''}`}>{cii.rating}</div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="chips" role="group" aria-label="Functional regions">
              {(Object.keys(REGION_META) as RegionId[]).map((r) => (
                <button key={r} type="button" className={`btn btn--sm btn--outline ${region === r ? 'is-on' : ''}`} onClick={() => selectRegion(region === r ? null : r)}>
                  {REGION_META[r].label}
                </button>
              ))}
            </div>
          </div>
          <Disclosure summary="View" count={`${xray ? 'x-ray' : 'hull'}, ${rotate && !reduced ? 'rotating' : 'still'}`}>
            <div style={{ display: 'flex', gap: 18 }}>
              <Check label="X-ray hull" checked={xray} onChange={setXray} />
              <Check label="Slow rotation" checked={rotate} onChange={setRotate} disabled={reduced} />
            </div>
          </Disclosure>
          <p className="inspector__one">{status.charAt(0).toUpperCase() + status.slice(1)}; {lc.capacityOk ? `sailing at ${lc.sailingDraftM.toFixed(2)} m draught with ${fmt.int(mission.cargoT)} t aboard` : 'cannot carry the mission cargo'}.</p>
          <Disclosure summary={region ? (selectedRegion?.startsWith('hold-') ? `No. ${selectedRegion.split('-')[1]} hold` : REGION_META[region].label) : 'Region detail'} open={!!region}>
            {region ? (
              <Rows items={rows} sans />
            ) : (
              <p className="small muted">Select a region on the hull (hatch covers, accommodation, propeller, bow) or a chip above. X-ray exposes the engine room, tanks and holds.</p>
            )}
          </Disclosure>
          <Disclosure summary="Particulars">
            <Rows
              items={[
                ['Call sign', v.callsign],
                ['Flag', v.flag],
                ['DWT, GT', `${fmt.int(v.dwt)} t, ${fmt.int(v.gt)}`],
                ['LOA × B × D', `${v.loaM} × ${v.beamM} × ${v.depthM} m`],
                ['Design draught', `${v.designDraftM} m`],
                ['Holds, grain', `${v.holds}, ${fmt.int(v.grainCapacityM3)} m³`],
                ['Design point', `${v.designSpeedKn} kn at ${fmt.int(v.designPowerKw)} kW`],
                ['Compatible fuels', v.fuels.map((f) => FUELS[f].short).join(', ')],
                ['Weather limits', `Hs ${v.safety.maxHsM} m, wind ${v.safety.maxWindKn} kn`],
              ]}
            />
          </Disclosure>
          <Disclosure summary="Cargo and operations">
            <Rows
              sans
              items={[
                ['Mission cargo', `${fmt.int(mission.cargoT)} t ${mission.cargoType.toLowerCase()}`],
                ['Capacity', lc.capacityOk ? 'cargo and bunkers within deadweight' : 'cargo exceeds deadweight; excluded by the engine'],
                ['Deadweight used', `${fmt.int(lc.deadweightUsedT)} t (${((lc.deadweightUsedT / v.dwt) * 100).toFixed(0)}%)`],
                [`${originName} channel`, lc.sailingDraftM + engine.safety.minUkcM > channelM ? `${lc.sailingDraftM.toFixed(2)} m draught plus ${engine.safety.minUkcM} m clearance exceeds the ${channelM} m inner channel: tidal window or anchorage top-up` : `clears the ${channelM} m inner channel at low water`],
                ['Hire', `${fmt.usdFull(v.hireUsdPerDay)} per day`],
                ['Annual profile', `${fmt.int(v.annual.distanceNm)} nm, ${v.annual.daysAtSea} days at sea`],
                ['Position', unit ? `${fmt.latlon(unit.position.lat, unit.position.lon)}. ${unit.note}` : planForVessel ? 'on the active plan (see Command)' : `${originName}, berth`],
              ]}
            />
          </Disclosure>
          <Disclosure summary="Energy and carbon intensity">
            <SpeedPower v={v} />
            <h3 className="section__title section__title--sub">CII against the 2026 required line</h3>
            <CiiScale p={cii} />
            <p className="small muted" style={{ marginTop: 8 }}>
              {planForVessel ? 'Projected from the active plan’s laden voyage including the port phase; conservative against a laden/ballast year.' : 'Projected from a synthetic annual profile at 12.5 kn.'} EEXI is not computed in this version.
            </p>
            <div style={{ marginTop: 12 }}>
              <Rows items={[['Aux load, sea and port', `${v.auxSeaKw} and ${v.auxPortKw} kW`], ['Shore connection', v.built >= 2019 ? 'HV shore connection fitted' : 'retrofit required'], ['Hull fouling factor', String(v.hullFouling)], ['Selected fuel intensity', `${fuelIntensity(FUELS[fuelId], engine.accounting).toFixed(1)} gCO₂e/MJ ${engine.accounting}`]]} />
            </div>
          </Disclosure>
          <p className="small muted" style={{ margin: '12px 0 0' }}>
            <Mark kind="synthetic">synthetic particulars</Mark>, <Mark kind="derived">design inference</Mark>
          </p>
        </motion.aside>
      )}
      </AnimatePresence>
      </div>

      <section className="strip on-k" style={{ ['--cells' as string]: 4 }} aria-label="Vessel state">
        <div className="scrub" />
        <div className="strip__cells strip__cells--4">
          <Cell label="Sailing draught" value={lc.sailingDraftM.toFixed(2)} unit={draughtTone ? `m, tidal window at ${originName}` : 'm'} tone={draughtTone} title={`Design ${v.designDraftM} m; ${originName} inner channel ${channelM} m`} />
          <Cell label="Displacement" value={fmt.int(lc.displacementT)} unit="t" />
          <Cell label="Freeboard" value={(v.depthM - lc.sailingDraftM).toFixed(2)} unit="m" />
          <Cell label="Cargo aboard" value={fmt.int(mission.cargoT)} unit="t" />
        </div>
      </section>
    </div>
  )
}
