/**
 * Port entities across the whole operating region. Sourced facts carry a sourceId that resolves
 * in src/data/sources.ts; every other fact is labelled 'derived' (order of magnitude from general
 * knowledge) or 'scenario' (synthetic input). Everything under `scenario` is a scenario input,
 * never live data.
 *
 * `approach` is the pilotage chain from the berth to the open-sea endpoint where the A* corridor
 * search starts or ends. Every point was checked against the land polygons and the ocean grid:
 * berths and pilot stations are on water, endpoints are at least 3 grid cells (about 45 nm) from
 * land and outside restricted and shallow zones. The chains are NOT for navigation.
 */
import { haversineNm } from '../engine/geo'
import type { LatLon, Port } from '../engine/types'

/**
 * Common fairway of the Malacca and Singapore Straits from the north entrance (open sea, abeam
 * Diamond Point) down to the western entrance of the Singapore Strait. Ports inside the straits join
 * it at their nearest node, so corridors between two strait ports are spliced along it instead of
 * searched, and corridors to or from elsewhere always leave the strait through the north entrance.
 */
export const MALACCA_FAIRWAY: LatLon[] = [
  { lat: 5.8, lon: 97.9 },
  { lat: 5.2, lon: 98.5 },
  { lat: 4.6, lon: 99.2 },
  { lat: 3.6, lon: 100.3 },
  { lat: 2.9, lon: 101.05 },
  { lat: 2.2, lon: 101.95 },
  { lat: 1.55, lon: 102.9 },
  { lat: 1.25, lon: 103.45 },
]

/** berth, pilot and local waypoints, then the fairway from the nearest node northward to the entrance */
function fairwayChain(local: LatLon[]): LatLon[] {
  const last = local[local.length - 1]
  let best = 0
  let bestD = Infinity
  MALACCA_FAIRWAY.forEach((n, i) => {
    const d = haversineNm(n, last)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return [...local, ...MALACCA_FAIRWAY.slice(0, best + 1).reverse()]
}

const NO_ALT = { LNG: 'none', MEOH: 'none', EMEOH: 'none', NH3: 'none', B30: 'none' } as const

export const PORTS: Record<string, Port> = {
  INNSA: {
    id: 'INNSA',
    unlocode: 'IN NSA',
    name: 'Nhava Sheva (Mumbai)',
    country: 'India (Maharashtra)',
    position: { lat: 18.95, lon: 72.95 },
    pilotStation: { lat: 18.85, lon: 72.78 },
    approach: [
      { lat: 18.95, lon: 72.95 },
      { lat: 18.85, lon: 72.78 },
      { lat: 18.75, lon: 72.45 },
      { lat: 18.6, lon: 72.0 },
    ],
    exports: [
      { cargoType: 'Steel coils', minT: 30000, maxT: 65000 },
      { cargoType: 'Bagged sugar', minT: 25000, maxT: 50000 },
      { cargoType: 'Bulk cement clinker', minT: 30000, maxT: 60000 },
    ],
    timezone: 'UTC+05:30',
    limits: { outerChannelDepthM: 15, innerChannelDepthM: 15, berthDepthM: 14.5, maxLoaM: 350, maxBeamM: 48, tidalRangeM: 4.5 },
    facts: [
      { label: 'Main channel depth', value: '15 m after the deepening programme (order of magnitude)', provenance: 'derived' },
      { label: 'Tidal range', value: 'about 4.5 m springs, the largest of the west-coast major ports', provenance: 'derived' },
      { label: 'Principal traffic', value: 'Containers; bulk and break-bulk at the shallow-draught berths', provenance: 'derived' },
      { label: 'Berth depth used by the engine', value: '14.5 m (bulk berth, scenario)', provenance: 'scenario' },
    ],
    scenario: {
      fuelAvailability: { VLSFO: 'available', MGO: 'available', HFO: 'available', LNG: 'limited', MEOH: 'none', EMEOH: 'none', NH3: 'none', B30: 'limited' },
      shorePower: { available: false, capacityMw: 0, priceUsdKwh: 0, gridGco2Kwh: 716 },
      congestion: { waitingHours: 14, berthOccupancyPct: 84, vesselsAtAnchor: 19 },
      portDuesUsd: 51000,
      berthHours: 40,
      weather: { windKn: 16, windDirDeg: 250, hsM: 1.6, visibilityNm: 5, summary: 'Monsoon westerlies, haze over the harbour' },
      arrivals: [
        { vessel: 'Container ship (third party)', eta: 'alongside', status: 'berthed' },
        { vessel: 'Bulk carrier (third party)', eta: '+9 h', status: 'inbound' },
        { vessel: 'Product tanker (third party)', eta: 'at anchor', status: 'anchored' },
      ],
    },
  },
  INMUN: {
    id: 'INMUN',
    unlocode: 'IN MUN',
    name: 'Mundra',
    country: 'India (Gujarat)',
    position: { lat: 22.74, lon: 69.7 },
    pilotStation: { lat: 22.6, lon: 69.55 },
    approach: [
      { lat: 22.74, lon: 69.7 },
      { lat: 22.6, lon: 69.55 },
      { lat: 22.5, lon: 69.0 },
      { lat: 22.4, lon: 68.5 },
      { lat: 21.9, lon: 68.0 },
    ],
    exports: [
      { cargoType: 'Bauxite', minT: 60000, maxT: 110000 },
      { cargoType: 'Bentonite lumps', minT: 30000, maxT: 55000 },
      { cargoType: 'Industrial salt', minT: 30000, maxT: 60000 },
    ],
    timezone: 'UTC+05:30',
    limits: { outerChannelDepthM: 17.5, innerChannelDepthM: 17, berthDepthM: 17, maxLoaM: 350, maxBeamM: 55, tidalRangeM: 6.5 },
    facts: [
      { label: 'Deep-draught capability', value: 'Handles capesize hulls at the dry-bulk terminals (order of magnitude 17 m)', provenance: 'derived' },
      { label: 'Tidal range', value: 'Gulf of Kutch macro-tidal, about 6.5 m springs', provenance: 'derived' },
      { label: 'Approach', value: 'Gulf of Kutch is narrow at chart resolution: the pilotage chain runs out past Dwarka', provenance: 'derived' },
      { label: 'Berth depth used by the engine', value: '17.0 m (scenario)', provenance: 'scenario' },
    ],
    scenario: {
      fuelAvailability: { VLSFO: 'available', MGO: 'available', HFO: 'available', ...NO_ALT, LNG: 'limited' },
      shorePower: { available: false, capacityMw: 0, priceUsdKwh: 0, gridGco2Kwh: 716 },
      congestion: { waitingHours: 8, berthOccupancyPct: 72, vesselsAtAnchor: 9 },
      portDuesUsd: 47000,
      berthHours: 38,
      weather: { windKn: 20, windDirDeg: 240, hsM: 1.4, visibilityNm: 6, summary: 'Fresh south-westerlies, strong tidal streams in the gulf' },
      arrivals: [
        { vessel: 'Coal carrier (third party)', eta: 'alongside', status: 'berthed' },
        { vessel: 'Bulk carrier (third party)', eta: '+6 h', status: 'inbound' },
        { vessel: 'Crude tanker (third party)', eta: 'at anchor', status: 'anchored' },
      ],
    },
  },
  INMRM: {
    id: 'INMRM',
    unlocode: 'IN MRM',
    name: 'Mormugao',
    country: 'India (Goa)',
    position: { lat: 15.41, lon: 73.8 },
    pilotStation: { lat: 15.43, lon: 73.7 },
    approach: [
      { lat: 15.41, lon: 73.8 },
      { lat: 15.43, lon: 73.7 },
      { lat: 15.38, lon: 73.45 },
      { lat: 15.2, lon: 73.15 },
    ],
    exports: [
      { cargoType: 'Iron ore fines', minT: 90000, maxT: 160000 },
      { cargoType: 'Bauxite', minT: 50000, maxT: 90000 },
    ],
    timezone: 'UTC+05:30',
    limits: {
      outerChannelDepthM: 14.4,
      innerChannelDepthM: 14.1,
      berthDepthM: 14.1,
      maxLoaM: 320,
      maxBeamM: 50,
      tidalRangeM: 2.3,
    },
    facts: [
      { label: 'Outer channel depth', value: '14.4 m', provenance: 'sourced', sourceId: 'mormugao-channel' },
      { label: 'Inner channel depth', value: '14.1 m', provenance: 'sourced', sourceId: 'mormugao-channel' },
      { label: 'Planned deepening', value: 'approach channel to ≈19.8 m, ≈19.5 m alongside four berths (Capesize programme)', provenance: 'sourced', sourceId: 'mormugao-channel' },
      { label: 'Berth 9 redevelopment', value: 'former mechanical ore handling plant, 200 to 250 m waterfront, multi-cargo', provenance: 'sourced', sourceId: 'mormugao-berth9' },
      { label: 'Principal export', value: 'Iron ore (Goa hinterland)', provenance: 'derived' },
      { label: 'Berth depth used by the engine', value: '14.1 m (aligned to inner channel)', provenance: 'scenario' },
      { label: 'Tidal range used by the engine', value: '2.3 m', provenance: 'scenario' },
    ],
    scenario: {
      fuelAvailability: { VLSFO: 'available', MGO: 'available', HFO: 'limited', LNG: 'none', MEOH: 'none', EMEOH: 'none', NH3: 'none', B30: 'none' },
      shorePower: { available: false, capacityMw: 0, priceUsdKwh: 0, gridGco2Kwh: 716 },
      congestion: { waitingHours: 6, berthOccupancyPct: 68, vesselsAtAnchor: 4 },
      portDuesUsd: 42000,
      berthHours: 42,
      weather: { windKn: 18, windDirDeg: 245, hsM: 1.8, visibilityNm: 6, summary: 'SW monsoon: moderate onshore wind, swell at the anchorage' },
      arrivals: [
        { vessel: 'Aegis Konkan', eta: 'alongside', status: 'berthed' },
        { vessel: 'Ore carrier (third party)', eta: '+14 h', status: 'inbound' },
        { vessel: 'Coastal tanker (third party)', eta: 'at anchor', status: 'anchored' },
      ],
    },
  },
  INNML: {
    id: 'INNML',
    unlocode: 'IN NML',
    name: 'New Mangalore',
    country: 'India (Karnataka)',
    position: { lat: 12.93, lon: 74.8 },
    pilotStation: { lat: 12.95, lon: 74.72 },
    approach: [
      { lat: 12.93, lon: 74.8 },
      { lat: 12.95, lon: 74.72 },
      { lat: 12.95, lon: 74.2 },
    ],
    exports: [
      { cargoType: 'Iron ore pellets', minT: 55000, maxT: 95000 },
      { cargoType: 'Bulk cement clinker', minT: 30000, maxT: 50000 },
    ],
    timezone: 'UTC+05:30',
    limits: { outerChannelDepthM: 15.4, innerChannelDepthM: 15.1, berthDepthM: 14, maxLoaM: 300, maxBeamM: 45, tidalRangeM: 1.8 },
    facts: [
      { label: 'Channel depth', value: 'About 15 m after deepening (order of magnitude)', provenance: 'derived' },
      { label: 'Principal exports', value: 'Iron ore pellets from the Kudremukh hinterland, clinker, granite', provenance: 'derived' },
      { label: 'Monsoon closure', value: 'Berthing restrictions in the SW monsoon swell are a scenario rule', provenance: 'scenario' },
      { label: 'Berth depth used by the engine', value: '14.0 m (scenario)', provenance: 'scenario' },
    ],
    scenario: {
      fuelAvailability: { VLSFO: 'available', MGO: 'available', HFO: 'limited', ...NO_ALT },
      shorePower: { available: false, capacityMw: 0, priceUsdKwh: 0, gridGco2Kwh: 716 },
      congestion: { waitingHours: 5, berthOccupancyPct: 61, vesselsAtAnchor: 3 },
      portDuesUsd: 39000,
      berthHours: 40,
      weather: { windKn: 17, windDirDeg: 250, hsM: 2.0, visibilityNm: 5, summary: 'SW monsoon: onshore wind and long swell at the entrance' },
      arrivals: [
        { vessel: 'Pellet carrier (third party)', eta: 'alongside', status: 'berthed' },
        { vessel: 'LPG carrier (third party)', eta: '+11 h', status: 'inbound' },
      ],
    },
  },
  INCOK: {
    id: 'INCOK',
    unlocode: 'IN COK',
    name: 'Kochi',
    country: 'India (Kerala)',
    position: { lat: 9.96, lon: 76.24 },
    pilotStation: { lat: 9.95, lon: 76.1 },
    approach: [
      { lat: 9.96, lon: 76.24 },
      { lat: 9.95, lon: 76.1 },
      { lat: 9.95, lon: 75.6 },
      { lat: 9.95, lon: 75.4 },
    ],
    exports: [
      { cargoType: 'Bulk cement clinker', minT: 25000, maxT: 45000 },
      { cargoType: 'Bagged agricultural produce', minT: 15000, maxT: 30000 },
    ],
    timezone: 'UTC+05:30',
    limits: { outerChannelDepthM: 14.5, innerChannelDepthM: 14, berthDepthM: 12.5, maxLoaM: 300, maxBeamM: 45, tidalRangeM: 1.0 },
    facts: [
      { label: 'Approach channel', value: 'Dredged channel through the Vypeen bar, about 14 m (order of magnitude)', provenance: 'derived' },
      { label: 'Bulk berth depth', value: '12.5 m: a handymax loads full, a kamsarmax part-loads', provenance: 'derived' },
      { label: 'Siltation', value: 'Maintenance dredging is continuous; low-water depths vary (scenario assumes the nominal value)', provenance: 'scenario' },
      { label: 'Berth depth used by the engine', value: '12.5 m (scenario)', provenance: 'scenario' },
    ],
    scenario: {
      fuelAvailability: { VLSFO: 'available', MGO: 'available', HFO: 'limited', ...NO_ALT, LNG: 'limited' },
      shorePower: { available: true, capacityMw: 1.5, priceUsdKwh: 0.11, gridGco2Kwh: 716 },
      congestion: { waitingHours: 4, berthOccupancyPct: 58, vesselsAtAnchor: 3 },
      portDuesUsd: 36000,
      berthHours: 36,
      weather: { windKn: 15, windDirDeg: 260, hsM: 1.7, visibilityNm: 5, summary: 'Monsoon squalls in the afternoon, moderate swell' },
      arrivals: [
        { vessel: 'LNG carrier (third party)', eta: 'alongside', status: 'berthed' },
        { vessel: 'Container feeder (third party)', eta: '+5 h', status: 'inbound' },
      ],
    },
  },
  INTUT: {
    id: 'INTUT',
    unlocode: 'IN TUT',
    name: 'Tuticorin',
    country: 'India (Tamil Nadu)',
    position: { lat: 8.75, lon: 78.2 },
    pilotStation: { lat: 8.7, lon: 78.35 },
    approach: [
      { lat: 8.75, lon: 78.2 },
      { lat: 8.7, lon: 78.35 },
      { lat: 8.3, lon: 78.7 },
      { lat: 7.7, lon: 78.7 },
    ],
    exports: [
      { cargoType: 'Industrial salt', minT: 25000, maxT: 50000 },
      { cargoType: 'Bulk cement', minT: 20000, maxT: 40000 },
      { cargoType: 'Granite blocks', minT: 15000, maxT: 30000 },
    ],
    timezone: 'UTC+05:30',
    limits: { outerChannelDepthM: 12.8, innerChannelDepthM: 12.8, berthDepthM: 12.8, maxLoaM: 260, maxBeamM: 40, tidalRangeM: 1.0 },
    facts: [
      { label: 'Channel depth', value: 'About 12.8 m, deepening programme planned (order of magnitude)', provenance: 'derived' },
      { label: 'Location', value: 'Gulf of Mannar; the Palk Strait to the north is closed to deep-draught traffic', provenance: 'derived' },
      { label: 'Approach', value: 'Pilotage chain leaves the Gulf of Mannar southward, clear of the Adam\'s Bridge shallows', provenance: 'derived' },
      { label: 'Berth depth used by the engine', value: '12.8 m (scenario)', provenance: 'scenario' },
    ],
    scenario: {
      fuelAvailability: { VLSFO: 'available', MGO: 'available', HFO: 'limited', ...NO_ALT },
      shorePower: { available: false, capacityMw: 0, priceUsdKwh: 0, gridGco2Kwh: 716 },
      congestion: { waitingHours: 7, berthOccupancyPct: 70, vesselsAtAnchor: 6 },
      portDuesUsd: 33000,
      berthHours: 44,
      weather: { windKn: 22, windDirDeg: 240, hsM: 1.5, visibilityNm: 7, summary: 'Strong monsoon wind funnelling through the Palghat gap, short sea' },
      arrivals: [
        { vessel: 'Coal carrier (third party)', eta: 'alongside', status: 'berthed' },
        { vessel: 'Bulk carrier (third party)', eta: 'at anchor', status: 'anchored' },
      ],
    },
  },
  LKCMB: {
    id: 'LKCMB',
    unlocode: 'LK CMB',
    name: 'Colombo',
    country: 'Sri Lanka',
    position: { lat: 6.95, lon: 79.84 },
    pilotStation: { lat: 6.95, lon: 79.78 },
    approach: [
      { lat: 6.95, lon: 79.84 },
      { lat: 6.95, lon: 79.78 },
      { lat: 6.9, lon: 79.2 },
    ],
    exports: [
      { cargoType: 'Bagged cement', minT: 20000, maxT: 40000 },
      { cargoType: 'Rubber and agri products (break-bulk)', minT: 12000, maxT: 25000 },
    ],
    timezone: 'UTC+05:30',
    limits: { outerChannelDepthM: 18, innerChannelDepthM: 15, berthDepthM: 13, maxLoaM: 320, maxBeamM: 48, tidalRangeM: 0.7 },
    facts: [
      { label: 'Harbour', value: 'Deep-water container hub; bulk and break-bulk at the older basin (order of magnitude 13 m)', provenance: 'derived' },
      { label: 'Tidal range', value: 'Small, under 1 m', provenance: 'derived' },
      { label: 'Position', value: 'On the Laccadive Sea side of the Dondra Head turning point used by east-west traffic', provenance: 'derived' },
      { label: 'Berth depth used by the engine', value: '13.0 m (bulk basin, scenario)', provenance: 'scenario' },
    ],
    scenario: {
      fuelAvailability: { VLSFO: 'available', MGO: 'available', HFO: 'available', ...NO_ALT, LNG: 'limited', B30: 'limited' },
      shorePower: { available: false, capacityMw: 0, priceUsdKwh: 0, gridGco2Kwh: 520 },
      congestion: { waitingHours: 10, berthOccupancyPct: 79, vesselsAtAnchor: 12 },
      portDuesUsd: 45000,
      berthHours: 34,
      weather: { windKn: 14, windDirDeg: 235, hsM: 1.5, visibilityNm: 6, summary: 'Monsoon south-westerlies, swell on the breakwater' },
      arrivals: [
        { vessel: 'Container ship (third party)', eta: 'alongside', status: 'berthed' },
        { vessel: 'Bulk carrier (third party)', eta: '+7 h', status: 'inbound' },
        { vessel: 'Product tanker (third party)', eta: 'at anchor', status: 'anchored' },
      ],
    },
  },
  LKHBA: {
    id: 'LKHBA',
    unlocode: 'LK HBA',
    name: 'Hambantota',
    country: 'Sri Lanka',
    position: { lat: 6.12, lon: 81.1 },
    pilotStation: { lat: 6.02, lon: 81.15 },
    approach: [
      { lat: 6.12, lon: 81.1 },
      { lat: 6.02, lon: 81.15 },
      { lat: 5.7, lon: 81.1 },
      { lat: 5.4, lon: 81.1 },
    ],
    exports: [
      { cargoType: 'Bulk cement clinker', minT: 30000, maxT: 60000 },
      { cargoType: 'Refined sugar (transhipment)', minT: 25000, maxT: 50000 },
    ],
    timezone: 'UTC+05:30',
    limits: { outerChannelDepthM: 17, innerChannelDepthM: 17, berthDepthM: 17, maxLoaM: 330, maxBeamM: 50, tidalRangeM: 0.7 },
    facts: [
      { label: 'Design depth', value: 'Artificial harbour dredged for large hulls, about 17 m (order of magnitude)', provenance: 'derived' },
      { label: 'Position', value: 'A few miles from the east-west route off Dondra Head; short diversion for bunkers or cargo', provenance: 'derived' },
      { label: 'Cargo base', value: 'Transhipment and industrial-zone cargoes; bulk volumes here are scenario inputs', provenance: 'scenario' },
      { label: 'Berth depth used by the engine', value: '17.0 m (scenario)', provenance: 'scenario' },
    ],
    scenario: {
      fuelAvailability: { VLSFO: 'available', MGO: 'available', HFO: 'available', ...NO_ALT, LNG: 'limited' },
      shorePower: { available: false, capacityMw: 0, priceUsdKwh: 0, gridGco2Kwh: 520 },
      congestion: { waitingHours: 2, berthOccupancyPct: 35, vesselsAtAnchor: 1 },
      portDuesUsd: 30000,
      berthHours: 30,
      weather: { windKn: 16, windDirDeg: 230, hsM: 2.0, visibilityNm: 7, summary: 'Open-ocean swell from the south-west, steady wind' },
      arrivals: [
        { vessel: 'Car carrier (third party)', eta: 'alongside', status: 'berthed' },
        { vessel: 'Bulk carrier (third party)', eta: '+18 h', status: 'inbound' },
      ],
    },
  },
  INMAA: {
    id: 'INMAA',
    unlocode: 'IN MAA',
    name: 'Chennai',
    country: 'India (Tamil Nadu)',
    position: { lat: 13.1, lon: 80.3 },
    pilotStation: { lat: 13.1, lon: 80.38 },
    approach: [
      { lat: 13.1, lon: 80.3 },
      { lat: 13.1, lon: 80.38 },
      { lat: 13.0, lon: 81.0 },
    ],
    exports: [
      { cargoType: 'Iron ore fines', minT: 60000, maxT: 100000 },
      { cargoType: 'Granite blocks', minT: 15000, maxT: 30000 },
      { cargoType: 'Bulk fertiliser', minT: 30000, maxT: 55000 },
    ],
    timezone: 'UTC+05:30',
    limits: { outerChannelDepthM: 18.5, innerChannelDepthM: 17, berthDepthM: 16.5, maxLoaM: 300, maxBeamM: 50, tidalRangeM: 1.2 },
    facts: [
      { label: 'Outer harbour', value: 'Deep-draught ore and coal berths, about 16 to 18 m (order of magnitude)', provenance: 'derived' },
      { label: 'Ore exports', value: 'Iron ore volumes are a scenario input; actual exports depend on mining policy', provenance: 'scenario' },
      { label: 'Cyclone season', value: 'NE monsoon systems in the Bay of Bengal close the port at short notice (scenario rule)', provenance: 'scenario' },
      { label: 'Berth depth used by the engine', value: '16.5 m (scenario)', provenance: 'scenario' },
    ],
    scenario: {
      fuelAvailability: { VLSFO: 'available', MGO: 'available', HFO: 'available', ...NO_ALT, LNG: 'limited' },
      shorePower: { available: true, capacityMw: 2, priceUsdKwh: 0.12, gridGco2Kwh: 716 },
      congestion: { waitingHours: 9, berthOccupancyPct: 74, vesselsAtAnchor: 11 },
      portDuesUsd: 44000,
      berthHours: 40,
      weather: { windKn: 12, windDirDeg: 200, hsM: 1.0, visibilityNm: 6, summary: 'Land and sea breeze regime, low swell in the SW monsoon' },
      arrivals: [
        { vessel: 'Car carrier (third party)', eta: 'alongside', status: 'berthed' },
        { vessel: 'Coal carrier (third party)', eta: '+4 h', status: 'inbound' },
        { vessel: 'Bulk carrier (third party)', eta: 'at anchor', status: 'anchored' },
      ],
    },
  },
  INVTZ: {
    id: 'INVTZ',
    unlocode: 'IN VTZ',
    name: 'Visakhapatnam',
    country: 'India (Andhra Pradesh)',
    position: { lat: 17.68, lon: 83.28 },
    pilotStation: { lat: 17.65, lon: 83.35 },
    approach: [
      { lat: 17.68, lon: 83.28 },
      { lat: 17.65, lon: 83.35 },
      { lat: 17.3, lon: 84.0 },
    ],
    exports: [
      { cargoType: 'Iron ore fines', minT: 90000, maxT: 150000 },
      { cargoType: 'Alumina', minT: 30000, maxT: 55000 },
      { cargoType: 'Steel products', minT: 30000, maxT: 60000 },
    ],
    timezone: 'UTC+05:30',
    limits: { outerChannelDepthM: 18.1, innerChannelDepthM: 17, berthDepthM: 17, maxLoaM: 330, maxBeamM: 55, tidalRangeM: 1.6 },
    facts: [
      { label: 'Outer harbour', value: 'Capesize ore berths, about 17 to 18 m (order of magnitude)', provenance: 'derived' },
      { label: 'Principal exports', value: 'Iron ore (Bailadila), alumina, steel from the Visakhapatnam plant', provenance: 'derived' },
      { label: 'Approach', value: 'Straight seaward chain into the Bay of Bengal, deep water close inshore', provenance: 'derived' },
      { label: 'Berth depth used by the engine', value: '17.0 m (scenario)', provenance: 'scenario' },
    ],
    scenario: {
      fuelAvailability: { VLSFO: 'available', MGO: 'available', HFO: 'available', ...NO_ALT },
      shorePower: { available: false, capacityMw: 0, priceUsdKwh: 0, gridGco2Kwh: 716 },
      congestion: { waitingHours: 11, berthOccupancyPct: 77, vesselsAtAnchor: 14 },
      portDuesUsd: 46000,
      berthHours: 36,
      weather: { windKn: 13, windDirDeg: 210, hsM: 1.2, visibilityNm: 6, summary: 'Light monsoon flow, sea breeze in the afternoon' },
      arrivals: [
        { vessel: 'Ore carrier (third party)', eta: 'alongside', status: 'berthed' },
        { vessel: 'Coal carrier (third party)', eta: '+8 h', status: 'inbound' },
        { vessel: 'Crude tanker (third party)', eta: 'at anchor', status: 'anchored' },
      ],
    },
  },
  INPRT: {
    id: 'INPRT',
    unlocode: 'IN PRT',
    name: 'Paradip',
    country: 'India (Odisha)',
    position: { lat: 20.27, lon: 86.68 },
    pilotStation: { lat: 20.2, lon: 86.75 },
    approach: [
      { lat: 20.27, lon: 86.68 },
      { lat: 20.2, lon: 86.75 },
      { lat: 19.7, lon: 87.0 },
    ],
    exports: [
      { cargoType: 'Iron ore fines', minT: 90000, maxT: 150000 },
      { cargoType: 'Thermal coal (coastal)', minT: 60000, maxT: 110000 },
      { cargoType: 'Bauxite', minT: 50000, maxT: 90000 },
    ],
    timezone: 'UTC+05:30',
    limits: { outerChannelDepthM: 18, innerChannelDepthM: 17.5, berthDepthM: 17, maxLoaM: 330, maxBeamM: 50, tidalRangeM: 2.6 },
    facts: [
      { label: 'Channel depth', value: 'Deepened for capesize ore loading, about 18 m (order of magnitude)', provenance: 'derived' },
      { label: 'Principal exports', value: 'Iron ore and coal from the Odisha and Jharkhand hinterland', provenance: 'derived' },
      { label: 'Cyclone season', value: 'Head of the Bay: pre- and post-monsoon systems make landfall nearby (scenario rule)', provenance: 'scenario' },
      { label: 'Berth depth used by the engine', value: '17.0 m (scenario)', provenance: 'scenario' },
    ],
    scenario: {
      fuelAvailability: { VLSFO: 'available', MGO: 'available', HFO: 'available', ...NO_ALT },
      shorePower: { available: false, capacityMw: 0, priceUsdKwh: 0, gridGco2Kwh: 716 },
      congestion: { waitingHours: 13, berthOccupancyPct: 80, vesselsAtAnchor: 16 },
      portDuesUsd: 45000,
      berthHours: 38,
      weather: { windKn: 15, windDirDeg: 215, hsM: 1.3, visibilityNm: 5, summary: 'Humid monsoon south-westerlies, thunderstorms inland' },
      arrivals: [
        { vessel: 'Ore carrier (third party)', eta: 'alongside', status: 'berthed' },
        { vessel: 'Coal carrier (third party)', eta: 'at anchor', status: 'anchored' },
        { vessel: 'Bulk carrier (third party)', eta: '+16 h', status: 'inbound' },
      ],
    },
  },
  BDCGP: {
    id: 'BDCGP',
    unlocode: 'BD CGP',
    name: 'Chittagong',
    country: 'Bangladesh',
    position: { lat: 22.25, lon: 91.75 },
    pilotStation: { lat: 22.1, lon: 91.65 },
    approach: [
      { lat: 22.25, lon: 91.75 },
      { lat: 22.1, lon: 91.65 },
      { lat: 21.7, lon: 91.5 },
      { lat: 21.0, lon: 91.0 },
    ],
    exports: [
      { cargoType: 'Jute and jute goods (bagged)', minT: 8000, maxT: 18000 },
      { cargoType: 'Bagged cement clinker', minT: 10000, maxT: 22000 },
    ],
    timezone: 'UTC+06:00',
    limits: { outerChannelDepthM: 12.5, innerChannelDepthM: 9.5, berthDepthM: 9.5, maxLoaM: 230, maxBeamM: 33, tidalRangeM: 4.5 },
    facts: [
      { label: 'River port', value: 'Berths on the Karnaphuli, draught limited to about 9.5 m; larger hulls lighten at the outer anchorage', provenance: 'derived' },
      { label: 'Tidal range', value: 'About 4.5 m; berthing on the tide is the norm', provenance: 'derived' },
      { label: 'LOA limit used by the engine', value: '230 m with outer-anchorage lightering (scenario; the river berths accept less)', provenance: 'scenario' },
      { label: 'Berth depth used by the engine', value: '9.5 m plus tide (scenario)', provenance: 'scenario' },
    ],
    scenario: {
      fuelAvailability: { VLSFO: 'available', MGO: 'available', HFO: 'available', ...NO_ALT },
      shorePower: { available: false, capacityMw: 0, priceUsdKwh: 0, gridGco2Kwh: 560 },
      congestion: { waitingHours: 36, berthOccupancyPct: 91, vesselsAtAnchor: 31 },
      portDuesUsd: 34000,
      berthHours: 60,
      weather: { windKn: 14, windDirDeg: 190, hsM: 1.1, visibilityNm: 4, summary: 'Monsoon rain, poor visibility, strong river outflow' },
      arrivals: [
        { vessel: 'Container feeder (third party)', eta: 'alongside', status: 'berthed' },
        { vessel: 'Bulk carrier (third party)', eta: 'at anchor', status: 'anchored' },
        { vessel: 'Bulk carrier (third party)', eta: 'at anchor', status: 'anchored' },
      ],
    },
  },
  THHKT: {
    id: 'THHKT',
    unlocode: 'TH HKT',
    name: 'Phuket',
    country: 'Thailand',
    position: { lat: 7.83, lon: 98.45 },
    pilotStation: { lat: 7.75, lon: 98.5 },
    approach: [
      { lat: 7.83, lon: 98.45 },
      { lat: 7.75, lon: 98.5 },
      { lat: 7.5, lon: 98.5 },
      { lat: 7.2, lon: 98.3 },
    ],
    exports: [
      { cargoType: 'Bagged rubber', minT: 8000, maxT: 16000 },
      { cargoType: 'Gypsum', minT: 15000, maxT: 25000 },
    ],
    timezone: 'UTC+07:00',
    limits: { outerChannelDepthM: 12, innerChannelDepthM: 10.5, berthDepthM: 10.5, maxLoaM: 230, maxBeamM: 36, tidalRangeM: 2.5 },
    facts: [
      { label: 'Deep-sea port', value: 'Ao Makham on the east side of the island, about 10.5 m alongside (order of magnitude)', provenance: 'derived' },
      { label: 'Position', value: 'North-west corner of the Malacca Strait limit; open Andaman Sea to the west', provenance: 'derived' },
      { label: 'LOA limit used by the engine', value: '230 m (scenario; cruise-berth geometry)', provenance: 'scenario' },
      { label: 'Berth depth used by the engine', value: '10.5 m plus tide (scenario)', provenance: 'scenario' },
    ],
    scenario: {
      fuelAvailability: { VLSFO: 'limited', MGO: 'available', HFO: 'none', ...NO_ALT },
      shorePower: { available: false, capacityMw: 0, priceUsdKwh: 0, gridGco2Kwh: 480 },
      congestion: { waitingHours: 3, berthOccupancyPct: 45, vesselsAtAnchor: 2 },
      portDuesUsd: 24000,
      berthHours: 48,
      weather: { windKn: 15, windDirDeg: 250, hsM: 1.6, visibilityNm: 5, summary: 'SW monsoon rain bands, swell on the west coast' },
      arrivals: [
        { vessel: 'Cruise ship (third party)', eta: 'alongside', status: 'berthed' },
        { vessel: 'General cargo (third party)', eta: '+10 h', status: 'inbound' },
      ],
    },
  },
  MYPEN: {
    id: 'MYPEN',
    unlocode: 'MY PEN',
    name: 'Penang',
    country: 'Malaysia',
    position: { lat: 5.42, lon: 100.35 },
    pilotStation: { lat: 5.6, lon: 100.3 },
    approach: fairwayChain([
      { lat: 5.42, lon: 100.35 },
      { lat: 5.6, lon: 100.3 },
      { lat: 5.3, lon: 99.8 },
    ]),
    exports: [
      { cargoType: 'Palm kernel expeller', minT: 15000, maxT: 30000 },
      { cargoType: 'Bulk cement', minT: 20000, maxT: 35000 },
    ],
    timezone: 'UTC+08:00',
    limits: { outerChannelDepthM: 12, innerChannelDepthM: 11.5, berthDepthM: 12, maxLoaM: 250, maxBeamM: 40, tidalRangeM: 2.7 },
    facts: [
      { label: 'North Channel', value: 'Approach north of Penang Island, about 11.5 m (order of magnitude)', provenance: 'derived' },
      { label: 'Bulk terminal', value: 'Butterworth side, part-loads for kamsarmax hulls', provenance: 'derived' },
      { label: 'Fairway', value: 'Joins the Malacca Strait fairway west of the island', provenance: 'derived' },
      { label: 'Berth depth used by the engine', value: '12.0 m (scenario)', provenance: 'scenario' },
    ],
    scenario: {
      fuelAvailability: { VLSFO: 'available', MGO: 'available', HFO: 'limited', ...NO_ALT, B30: 'limited' },
      shorePower: { available: false, capacityMw: 0, priceUsdKwh: 0, gridGco2Kwh: 550 },
      congestion: { waitingHours: 6, berthOccupancyPct: 66, vesselsAtAnchor: 5 },
      portDuesUsd: 31000,
      berthHours: 40,
      weather: { windKn: 9, windDirDeg: 220, hsM: 0.6, visibilityNm: 5, summary: 'Light airs, afternoon thunderstorms over the strait' },
      arrivals: [
        { vessel: 'Container feeder (third party)', eta: 'alongside', status: 'berthed' },
        { vessel: 'Bulk carrier (third party)', eta: '+6 h', status: 'inbound' },
      ],
    },
  },
  MYPKG: {
    id: 'MYPKG',
    unlocode: 'MY PKG',
    name: 'Port Klang',
    country: 'Malaysia',
    position: { lat: 2.95, lon: 101.3 },
    pilotStation: { lat: 2.9, lon: 101.2 },
    approach: fairwayChain([
      { lat: 2.95, lon: 101.3 },
      { lat: 2.9, lon: 101.2 },
    ]),
    exports: [
      { cargoType: 'Palm kernel expeller', minT: 20000, maxT: 40000 },
      { cargoType: 'Bulk cement clinker', minT: 30000, maxT: 55000 },
      { cargoType: 'Steel billets', minT: 25000, maxT: 50000 },
    ],
    timezone: 'UTC+08:00',
    limits: { outerChannelDepthM: 16, innerChannelDepthM: 15, berthDepthM: 15, maxLoaM: 350, maxBeamM: 55, tidalRangeM: 4.5 },
    facts: [
      { label: 'Westport', value: 'Deep-water berths on Pulau Indah, about 15 m (order of magnitude)', provenance: 'derived' },
      { label: 'One Fathom Bank', value: 'The deep-water route passes the bank just west of the pilot station', provenance: 'derived' },
      { label: 'Tidal range', value: 'About 4.5 m springs', provenance: 'derived' },
      { label: 'Berth depth used by the engine', value: '15.0 m (scenario)', provenance: 'scenario' },
    ],
    scenario: {
      fuelAvailability: { VLSFO: 'available', MGO: 'available', HFO: 'available', ...NO_ALT, LNG: 'limited', B30: 'limited' },
      shorePower: { available: false, capacityMw: 0, priceUsdKwh: 0, gridGco2Kwh: 550 },
      congestion: { waitingHours: 8, berthOccupancyPct: 76, vesselsAtAnchor: 10 },
      portDuesUsd: 43000,
      berthHours: 36,
      weather: { windKn: 8, windDirDeg: 210, hsM: 0.5, visibilityNm: 4, summary: 'Light winds, haze, Sumatra squalls before dawn' },
      arrivals: [
        { vessel: 'Container ship (third party)', eta: 'alongside', status: 'berthed' },
        { vessel: 'Bulk carrier (third party)', eta: 'at anchor', status: 'anchored' },
        { vessel: 'Product tanker (third party)', eta: '+3 h', status: 'inbound' },
      ],
    },
  },
  IDBLW: {
    id: 'IDBLW',
    unlocode: 'ID BLW',
    name: 'Belawan',
    country: 'Indonesia (North Sumatra)',
    position: { lat: 3.8, lon: 98.77 },
    pilotStation: { lat: 3.95, lon: 98.85 },
    approach: fairwayChain([
      { lat: 3.8, lon: 98.77 },
      { lat: 3.95, lon: 98.85 },
    ]),
    exports: [
      { cargoType: 'Palm kernel expeller', minT: 15000, maxT: 30000 },
      { cargoType: 'Bagged fertiliser', minT: 10000, maxT: 20000 },
    ],
    timezone: 'UTC+07:00',
    limits: { outerChannelDepthM: 11, innerChannelDepthM: 10, berthDepthM: 10, maxLoaM: 230, maxBeamM: 33, tidalRangeM: 2.4 },
    facts: [
      { label: 'River approach', value: 'Dredged channel from the strait, about 10 m (order of magnitude)', provenance: 'derived' },
      { label: 'Principal exports', value: 'Palm products and fertiliser from the Medan hinterland', provenance: 'derived' },
      { label: 'LOA limit used by the engine', value: '230 m (scenario)', provenance: 'scenario' },
      { label: 'Berth depth used by the engine', value: '10.0 m plus tide (scenario)', provenance: 'scenario' },
    ],
    scenario: {
      fuelAvailability: { VLSFO: 'limited', MGO: 'available', HFO: 'limited', ...NO_ALT },
      shorePower: { available: false, capacityMw: 0, priceUsdKwh: 0, gridGco2Kwh: 690 },
      congestion: { waitingHours: 18, berthOccupancyPct: 85, vesselsAtAnchor: 12 },
      portDuesUsd: 27000,
      berthHours: 54,
      weather: { windKn: 7, windDirDeg: 200, hsM: 0.5, visibilityNm: 4, summary: 'Light winds, haze, Sumatra squalls overnight' },
      arrivals: [
        { vessel: 'General cargo (third party)', eta: 'alongside', status: 'berthed' },
        { vessel: 'Bulk carrier (third party)', eta: 'at anchor', status: 'anchored' },
      ],
    },
  },
  SGSIN: {
    id: 'SGSIN',
    unlocode: 'SG SIN',
    name: 'Singapore',
    country: 'Singapore',
    position: { lat: 1.23, lon: 103.88 },
    pilotStation: { lat: 1.17, lon: 103.72 },
    approach: fairwayChain([
      { lat: 1.23, lon: 103.88 },
      { lat: 1.17, lon: 103.72 },
    ]),
    exports: [
      { cargoType: 'Bagged cement (project cargo)', minT: 30000, maxT: 60000 },
      { cargoType: 'Steel products', minT: 30000, maxT: 70000 },
    ],
    timezone: 'UTC+08:00',
    limits: {
      outerChannelDepthM: 22,
      innerChannelDepthM: 20,
      berthDepthM: 16,
      maxLoaM: 330,
      maxBeamM: 58,
      tidalRangeM: 2.5,
    },
    facts: [
      { label: 'Vessel arrival tonnage 2024', value: '3.11 billion GT (record)', provenance: 'sourced', sourceId: 'mpa-2024' },
      { label: 'Bunker sales 2024', value: '54.92 million tonnes (record)', provenance: 'sourced', sourceId: 'mpa-2024' },
      { label: 'Alternative bunker sales 2024', value: '1.34 million tonnes (first year above 1 Mt)', provenance: 'sourced', sourceId: 'mpa-2024' },
      { label: 'Container throughput 2024', value: '41.12 million TEU', provenance: 'sourced', sourceId: 'mpa-2024' },
      { label: 'Strait depth used by the engine', value: 'Singapore Strait TSS ≈22 m (approximation)', provenance: 'derived' },
      { label: 'Bulk berth depth used by the engine', value: '16.0 m', provenance: 'scenario' },
      { label: 'Grid emission factor used for shore power', value: '≈0.41 kg CO₂/kWh (published order of magnitude, verify with EMA)', provenance: 'derived' },
    ],
    scenario: {
      fuelAvailability: { VLSFO: 'available', MGO: 'available', HFO: 'available', LNG: 'available', MEOH: 'limited', EMEOH: 'limited', NH3: 'none', B30: 'limited' },
      shorePower: { available: true, capacityMw: 4, priceUsdKwh: 0.18, gridGco2Kwh: 410 },
      congestion: { waitingHours: 9, berthOccupancyPct: 81, vesselsAtAnchor: 27 },
      portDuesUsd: 58000,
      berthHours: 36,
      weather: { windKn: 9, windDirDeg: 200, hsM: 0.7, visibilityNm: 5, summary: 'Light winds, afternoon convective showers' },
      arrivals: [
        { vessel: 'Aegis Meridian', eta: '+2 d 06 h', status: 'inbound' },
        { vessel: 'Ore carrier (third party)', eta: 'at anchor', status: 'anchored' },
        { vessel: 'Bulk carrier (third party)', eta: 'sailed', status: 'departed' },
      ],
    },
  },
}

export const PORT_LIST = Object.values(PORTS)
