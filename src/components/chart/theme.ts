/**
 * Chart symbology per mode. The chart is flat 2D; every layer reads colours from the active theme
 * through useChart() (see context.ts) and never hard-codes a ground colour.
 *
 *  - "chart": a light nautical chart, on demand (pale water, sand land, soft shelf tint). The plan is black,
 *    the mission vessel is the one green mark; alternatives are grey.
 *  - "night": the black plate, the default. The plan and the mission vessel are green; travelled track off-white.
 *
 * Alarm red is reserved for computed breaches and the storm core (DESIGN.md, the Alarm Rule).
 *
 * Regulatory magenta (`regulatory`, `regulatoryFill`, `hatch`) is the one chart-convention
 * exception to the product's two-colour rule: paper and electronic charts draw restricted areas,
 * traffic separation schemes and other regulatory limits in magenta, and mariners read that hue as
 * "a rule applies here" before they read the label. It is confined to the chart plate (zone
 * outlines, hatching, chevrons, zone labels and the legend swatches that mirror them) and never
 * used for emphasis, controls or type anywhere else (DESIGN.md, the Regulatory Rule).
 */
export type ChartMode = 'chart' | 'night'

export interface ChartTheme {
  mode: ChartMode
  /** open water */
  water: string
  /** wide soft band hugging the coast (continental shelf feel); drawn as a stroke around land */
  shelf: string
  /** shallow-zone fill */
  shallow: string
  land: string
  coast: string
  /** graticule lines and their labels */
  grat: string
  gratText: string
  /** ink ramp for marks and type on this ground */
  ink0: string
  ink1: string
  ink2: string
  ink3: string
  /** the selected plan's remaining track */
  plan: string
  /** the travelled track */
  travelled: string
  /** the mission vessel fill and its stroke */
  vessel: string
  vesselStroke: string
  /** ports, waypoints (open marks) */
  mark: string
  /** other fleet units */
  fleet: string
  /** wind / current / wave glyphs */
  field: string
  fieldStrong: string
  /** computed breaches, storm core */
  alarm: string
  /**
   * regulatory magenta: restricted areas, TSS and ECA outlines, chevrons and their labels. The one
   * chart-convention exception to the two-colour rule; confined to the chart plate.
   */
  regulatory: string
  /** the same hue for faint area fills (used with a fillOpacity of 0.06 to 0.12) */
  regulatoryFill: string
  /** hatch lines inside restricted areas (drawn at 0.55 opacity, 1 px, every 2.2 chart units) */
  hatch: string
  /** depth values printed inside shallow zones ("9 m"), an ink tint that reads on the shallow fill */
  shallowText: string
  /** hover chip: black-block register on both grounds */
  chipBg: string
  chipInk: string
  /** halo painted behind chart text so it stays legible over lines */
  textHalo: string
  /** black-block overlays (drawer, caption, controls) always keep the black register */
  overlay: string
}

export const THEMES: Record<ChartMode, ChartTheme> = {
  chart: {
    mode: 'chart',
    water: '#d3e6f2',
    shelf: '#c6dbe9',
    shallow: '#b7d2e4',
    land: '#f4f1e7',
    coast: '#b8ae98',
    grat: 'rgba(21, 22, 20, 0.07)',
    gratText: 'rgba(21, 22, 20, 0.42)',
    ink0: '#151614',
    ink1: 'rgba(21, 22, 20, 0.78)',
    ink2: 'rgba(21, 22, 20, 0.56)',
    ink3: 'rgba(21, 22, 20, 0.32)',
    plan: '#151614',
    travelled: 'rgba(21, 22, 20, 0.34)',
    vessel: '#8fd66e',
    vesselStroke: '#151614',
    mark: '#151614',
    fleet: 'rgba(21, 22, 20, 0.5)',
    field: 'rgba(21, 22, 20, 0.22)',
    fieldStrong: 'rgba(21, 22, 20, 0.5)',
    alarm: '#c8321f',
    regulatory: '#a23b8f',
    regulatoryFill: '#a23b8f',
    hatch: '#a23b8f',
    shallowText: 'rgba(24, 40, 52, 0.82)',
    chipBg: 'rgba(21, 22, 20, 0.94)',
    chipInk: '#f4f4ef',
    textHalo: 'rgba(211, 230, 242, 0.9)',
    overlay: 'rgba(21, 22, 20, 0.94)',
  },
  night: {
    mode: 'night',
    water: '#101210',
    shelf: '#151516',
    shallow: '#1b1b1d',
    land: '#2a2a2d',
    coast: '#5a5750',
    grat: 'rgba(244, 244, 239, 0.06)',
    gratText: 'rgba(244, 244, 239, 0.32)',
    ink0: '#f4f4ef',
    ink1: '#d5d6d1',
    ink2: '#a3a3a0',
    ink3: '#5c5d5a',
    plan: '#bfe7a2',
    travelled: '#f4f4ef',
    vessel: '#8fd66e',
    vesselStroke: '#101210',
    mark: '#f4f4ef',
    fleet: '#a3a3a0',
    field: 'rgba(244, 244, 239, 0.22)',
    fieldStrong: 'rgba(244, 244, 239, 0.55)',
    alarm: '#ef4b3f',
    regulatory: '#d26bc1',
    regulatoryFill: '#d26bc1',
    hatch: '#d26bc1',
    shallowText: '#aeb8bf',
    chipBg: 'rgba(21, 22, 20, 0.94)',
    chipInk: '#f4f4ef',
    textHalo: 'rgba(16, 18, 16, 0.9)',
    overlay: 'rgba(21, 22, 20, 0.94)',
  },
}

export const CHART_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]
