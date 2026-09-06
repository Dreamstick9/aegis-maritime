import { fmt } from '../app/format'
import { useStore } from '../app/store'
import { ViewHead } from '../components/shell/Shell'
import { Disclosure, Mark, Rows, Section } from '../components/ui/primitives'
import { FLEET_BY_ID } from '../data/fleet'
import { PORTS } from '../data/ports'
import { SOURCE_BY_ID } from '../data/sources'
import { FUELS, FUEL_IDS } from '../engine/fuels'
import { STORES_T } from '../engine/evaluate'
import { loadingCondition } from '../engine/vessel'
import type { Port } from '../engine/types'

function Fit({ port }: { port: Port }) {
  const mission = useStore((s) => s.mission)
  const ukc = useStore((s) => s.engine.safety.minUkcM)
  const isOrigin = port.id === mission.originId
  const limit = isOrigin ? port.limits.innerChannelDepthM : port.limits.berthDepthM
  return (
    <table className="table table--tight">
      <thead>
        <tr>
          <th>Hull</th>
          <th className="num">Sailing draught</th>
          <th>Against {limit} m {isOrigin ? 'inner channel' : 'berth'} with {ukc} m clearance</th>
        </tr>
      </thead>
      <tbody>
        {Object.values(FLEET_BY_ID).map((v) => {
          const lc = loadingCondition(v, mission.cargoT, 1800 + STORES_T)
          const need = lc.sailingDraftM + ukc
          const sizeOk = v.loaM <= port.limits.maxLoaM && v.beamM <= port.limits.maxBeamM
          let text: string
          let cls = ''
          if (!lc.capacityOk) {
            text = 'cannot carry the mission cargo'
            cls = 'risk-crit'
          } else if (!sizeOk) {
            text = 'exceeds LOA / beam limit'
            cls = 'risk-crit'
          } else if (need > limit + port.limits.tidalRangeM) {
            text = 'blocked, even at high water'
            cls = 'risk-crit'
          } else if (need > limit) {
            text = `conditional: tidal window (+${port.limits.tidalRangeM} m) or anchorage top-up`
            cls = 'risk-warn'
          } else text = 'clear at low water'
          return (
            <tr key={v.id}>
              <td>{v.name}</td>
              <td className="num">{lc.capacityOk ? `${lc.sailingDraftM.toFixed(2)} m` : 'n/a'}</td>
              <td className={cls}>{text}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function PortPlate({ port }: { port: Port }) {
  const cargoT = useStore((s) => s.mission.cargoT)
  const cargoType = useStore((s) => s.mission.cargoType)
  const sc = port.scenario
  const sp = sc.shorePower
  const channelFact = port.facts.find((f) => f.label.includes('channel'))
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
        <h2 className="view__title" style={{ fontSize: 22 }}>
          {port.name}
          <small>
            {port.country}, {port.unlocode}. {fmt.latlon(port.position.lat, port.position.lon)}, {port.timezone}
          </small>
        </h2>
      </div>
      <div className="stats" style={{ marginTop: 18 }}>
        <div className="stat">
          <span className="label">Channel, outer / inner</span>
          <span className="numeral">
            {port.limits.outerChannelDepthM} / {port.limits.innerChannelDepthM}
            <small>m</small>
          </span>
        </div>
        <div className="stat">
          <span className="label">Berth depth</span>
          <span className="numeral">
            {port.limits.berthDepthM}
            <small>m</small>
          </span>
        </div>
        <div className="stat">
          <span className="label">Tidal range</span>
          <span className="numeral">
            {port.limits.tidalRangeM}
            <small>m</small>
          </span>
        </div>
        <div className="stat">
          <span className="label">Waiting at anchor</span>
          <span className={`numeral ${sc.congestion.waitingHours > 8 ? 'risk-warn' : ''}`}>
            {sc.congestion.waitingHours}
            <small>h</small>
          </span>
          <span className="small muted num">
            {sc.congestion.vesselsAtAnchor} at anchor, {sc.congestion.berthOccupancyPct}% berth occupancy
          </span>
        </div>
      </div>

      <p className="small muted" style={{ marginTop: 10 }}>
        {channelFact?.provenance === 'sourced' ? <><Mark kind="sourced" /> channel depths; </> : null}
        <Mark kind="scenario" /> berth depth, tidal range, congestion
      </p>

      <Section level={3} title="Vessel compatibility" note={`for ${fmt.int(cargoT)} t of ${cargoType.toLowerCase()}`} id={`${port.id}-fit`}>
        <Fit port={port} />
      </Section>

      <Section level={3} title="Detail" note={<Mark kind="scenario">scenario values, not live</Mark>} id={`${port.id}-detail`}>
      <Disclosure summary="Operations and arrivals">
        <div className="cols cols--2">
          <Rows
            sans
            items={[
              ['Weather', `${sc.weather.windKn} kn from ${fmt.deg(sc.weather.windDirDeg)}, Hs ${sc.weather.hsM} m, visibility ${sc.weather.visibilityNm} nm`],
              ['Conditions', sc.weather.summary],
              ['Berth time, mission', `${sc.berthHours} h`],
              ['Port dues', fmt.usdFull(sc.portDuesUsd)],
              ['Max LOA and beam', `${port.limits.maxLoaM} and ${port.limits.maxBeamM} m`],
            ]}
          />
          <table className="table table--tight">
            <thead>
              <tr>
                <th>Arrivals</th>
                <th>ETA</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sc.arrivals.map((a) => (
                <tr key={a.vessel}>
                  <td>{a.vessel}</td>
                  <td className="num">{a.eta}</td>
                  <td className="muted">{a.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Disclosure>
      <Disclosure summary="Bunkers and shore power" count={sp.available ? `${sp.capacityMw} MW shore power` : 'no shore power'}>
        <div className="cols cols--2">
          <table className="table table--tight">
            <thead>
              <tr>
                <th>Fuel</th>
                <th>Availability</th>
                <th className="num">$/t</th>
                <th className="num">$/GJ</th>
                <th className="num">WtW g/MJ</th>
              </tr>
            </thead>
            <tbody>
              {FUEL_IDS.map((fid) => {
                const f = FUELS[fid]
                const av = sc.fuelAvailability[fid] ?? 'none'
                return (
                  <tr key={fid}>
                    <td>{f.short}</td>
                    <td className={av === 'none' ? 'muted' : av === 'limited' ? 'quiet' : ''}>{av}</td>
                    <td className="num">{f.priceUsdPerT}</td>
                    <td className="num">{(f.priceUsdPerT / f.lhvMJkg).toFixed(1)}</td>
                    <td className="num">{(f.wttGco2eMJ + f.ttwGco2eMJ).toFixed(1)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div>
            {sp.available ? (
              <Rows
                sans
                items={[
                  ['Shore power', `${sp.capacityMw} MW high-voltage connection`],
                  ['Tariff', `${sp.priceUsdKwh.toFixed(2)} $/kWh plus connection fee`],
                  ['Grid factor', `${sp.gridGco2Kwh} gCO₂/kWh (published order of magnitude; verify with EMA)`],
                  ['Against auxiliaries', `MGO gensets at 215 g/kWh emit ≈ ${Math.round(0.215 * 3.206 * 1000)} gCO₂/kWh; the grid cuts berth emissions by ≈ ${Math.round((1 - sp.gridGco2Kwh / (0.215 * 3.206 * 1000)) * 100)}%`],
                ]}
              />
            ) : (
              <p className="narrative" style={{ fontSize: 14 }}>
                No shore power at the bulk berths in this scenario: auxiliaries burn MGO at berth. The engine still compares the two when the destination offers a connection.
              </p>
            )}
          </div>
        </div>
      </Disclosure>
      <Disclosure summary="Sourced facts and provenance" count={port.facts.length}>
        <table className="table table--tight">
          <tbody>
            {port.facts.map((f) => (
              <tr key={f.label}>
                <td style={{ width: 240 }} className="muted">
                  {f.label}
                </td>
                <td>{f.value}</td>
                <td style={{ width: 200 }}>{f.sourceId && SOURCE_BY_ID[f.sourceId] ? <a href={SOURCE_BY_ID[f.sourceId].url} target="_blank" rel="noreferrer">{SOURCE_BY_ID[f.sourceId].org}</a> : <Mark kind={f.provenance} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Disclosure>
      </Section>
    </div>
  )
}

export default function PortsView() {
  const mission = useStore((s) => s.mission)
  const scenario = useStore((s) => s.scenario)
  // the two ports of the current voyage (the network holds many more); a port never appears twice
  const ports = [PORTS[mission.originId], PORTS[mission.destinationId]].filter((p, i, a): p is Port => !!p && a.indexOf(p) === i)
  const origin = ports[0]
  const dest = PORTS[mission.destinationId]
  return (
    <div className="view">
      <div className="view__inner">
        <ViewHead title="Ports" sub={`${origin?.name ?? mission.originId} to ${dest?.name ?? mission.destinationId}. Limits sourced where marked; dynamic values are inputs of “${scenario.name}”.`} />
        <div className="cols cols--2" style={{ gap: 56, marginTop: 24 }}>
          {ports.map((p) => (
            <PortPlate key={p.id} port={p} />
          ))}
        </div>
      </div>
    </div>
  )
}
