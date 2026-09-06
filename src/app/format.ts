import { NM_TO_KM } from '../engine/geo'

export type Units = 'nautical' | 'metric'

export const fmt = {
  int: (x: number) => Math.round(x).toLocaleString('en-US'),
  num: (x: number, d = 1) => (Number.isFinite(x) ? x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '···'),
  pct: (x: number, d = 1) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`,
  usd: (x: number) => (Math.abs(x) >= 1e6 ? `$${(x / 1e6).toFixed(2)}M` : Math.abs(x) >= 1e3 ? `$${(x / 1e3).toFixed(1)}k` : `$${x.toFixed(0)}`),
  usdFull: (x: number) => `$${Math.round(x).toLocaleString('en-US')}`,
  hours: (h: number) => {
    if (!Number.isFinite(h)) return '···'
    const d = Math.floor(h / 24)
    const hh = Math.round(h - d * 24)
    return d > 0 ? `${d}d ${hh.toString().padStart(2, '0')}h` : `${hh}h`
  },
  hm: (h: number) => {
    const hh = Math.floor(h)
    const mm = Math.round((h - hh) * 60)
    return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`
  },
  dist: (nm: number, u: Units, d = 0) => (u === 'metric' ? `${fmt.num(nm * NM_TO_KM, d)} km` : `${fmt.num(nm, d)} nm`),
  speed: (kn: number, u: Units, d = 1) => (u === 'metric' ? `${fmt.num(kn * NM_TO_KM, d)} km/h` : `${fmt.num(kn, d)} kn`),
  speedUnit: (u: Units) => (u === 'metric' ? 'km/h' : 'kn'),
  distUnit: (u: Units) => (u === 'metric' ? 'km' : 'nm'),
  t: (x: number, d = 0) => `${fmt.num(x, d)} t`,
  utc: (iso: string | number) => {
    const d = new Date(iso)
    return `${d.toISOString().slice(0, 16).replace('T', ' ')}Z`
  },
  utcShort: (iso: string | number) => {
    const d = new Date(iso)
    return `${d.toISOString().slice(5, 16).replace('T', ' ')}Z`
  },
  latlon: (lat: number, lon: number) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`,
  deg: (d: number) => `${Math.round(((d % 360) + 360) % 360).toString().padStart(3, '0')}°`,
}

export function simClock(departureIso: string, tH: number): string {
  return fmt.utc(Date.parse(departureIso) + tH * 3600e3)
}
