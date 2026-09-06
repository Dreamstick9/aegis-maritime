/** Functional regions of the procedural vessel (selection vocabulary shared by viewer and dossier). */
export type RegionId = 'engine' | 'fuel' | 'cargo' | 'ballast' | 'bridge' | 'propulsion' | 'bow'

export const REGION_META: Record<RegionId, { label: string; color: string }> = {
  engine: { label: 'Engine room', color: '#8fd66e' },
  fuel: { label: 'Fuel tanks', color: '#8fd66e' },
  cargo: { label: 'Cargo holds', color: '#8fd66e' },
  ballast: { label: 'Ballast & stability', color: '#8fd66e' },
  bridge: { label: 'Bridge & accommodation', color: '#8fd66e' },
  propulsion: { label: 'Propulsion', color: '#8fd66e' },
  bow: { label: 'Bow & mooring', color: '#8fd66e' },
}

export function regionOf(sel: string | null): RegionId | null {
  if (!sel) return null
  if (sel.startsWith('hold-') || sel.startsWith('hatch-')) return 'cargo'
  return (sel in REGION_META ? sel : null) as RegionId | null
}

