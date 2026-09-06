/** Functional regions of the procedural vessel (selection vocabulary shared by viewer and dossier). */
export type RegionId = 'engine' | 'fuel' | 'cargo' | 'ballast' | 'bridge' | 'propulsion' | 'bow'

export const REGION_META: Record<RegionId, { label: string; color: string }> = {
  engine: { label: 'Engine room', color: '#f2c230' },
  fuel: { label: 'Fuel tanks', color: '#f2c230' },
  cargo: { label: 'Cargo holds', color: '#f2c230' },
  ballast: { label: 'Ballast & stability', color: '#f2c230' },
  bridge: { label: 'Bridge & accommodation', color: '#f2c230' },
  propulsion: { label: 'Propulsion', color: '#f2c230' },
  bow: { label: 'Bow & mooring', color: '#f2c230' },
}

export function regionOf(sel: string | null): RegionId | null {
  if (!sel) return null
  if (sel.startsWith('hold-') || sel.startsWith('hatch-')) return 'cargo'
  return (sel in REGION_META ? sel : null) as RegionId | null
}

