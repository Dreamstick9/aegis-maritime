/**
 * Per-render chart context shared by every layer. `S` is chart units per CSS pixel at the current
 * zoom: multiply any pixel size (stroke, radius, font size, label offset) by `S` so it keeps a
 * constant on-screen size while the camera zooms. Strokes may alternatively use
 * vectorEffect="non-scaling-stroke".
 */
import { createContext, useContext } from 'react'
import { VIEW } from './projection'
import { THEMES, type ChartTheme } from './theme'

export interface ChartCtx {
  /** chart units per pixel (1 / pixels-per-unit) */
  S: number
  /** camera zoom, 1 = the whole region fits the stage */
  zoom: number
  theme: ChartTheme
  /** reduced motion: no draw-ins, fades, tweens or loops */
  reduced: boolean
  /** current replay time in hours, quantised by the board to limit re-renders */
  tH: number
  /** the visible viewport in chart units (updated when the camera settles or the zoom mirror changes) */
  view: { x0: number; y0: number; x1: number; y1: number }
}

export const ChartContext = createContext<ChartCtx>({ S: 0.3, zoom: 1, theme: THEMES.chart, reduced: false, tH: 0, view: { x0: 0, y0: 0, x1: VIEW.w, y1: VIEW.h } })

export function useChart(): ChartCtx {
  return useContext(ChartContext)
}
