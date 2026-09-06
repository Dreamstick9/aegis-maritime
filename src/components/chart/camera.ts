/**
 * Flat 2D chart camera. State lives in chart units: `x, y` is the chart-unit point under the
 * stage's top-left pixel and `k` is the zoom factor (1 = the whole region fits the stage). The
 * base scale `base` (pixels per unit at k = 1) is "meet": the region fits the stage with a small
 * margin. Pixels = (units - x) * base * k, so the camera <g> gets
 * `translate(-x*base*k, -y*base*k) scale(base*k)`.
 *
 * The camera never touches React: the board applies `onChange` to the DOM and mirrors only the
 * quantised zoom into state. Animations use motion's `animate()` with CHART_EASE and are skipped
 * (instant) when reduced motion is on.
 */
import { animate } from 'motion/react'
import { VIEW } from './projection'
import { CHART_EASE } from './theme'

export interface CameraState {
  x: number
  y: number
  k: number
}
export interface UnitsBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface FitPadding {
  top: number
  right: number
  bottom: number
  left: number
}

export const MIN_ZOOM = 1
export const MAX_ZOOM = 8
/** pixels kept clear around the region at zoom 1 */
const FIT_MARGIN = 6
/** the region may be pushed this fraction of the stage off-screen before the clamp bites */
const SLACK = 0.25
const DEFAULT_MS = 700

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export class ChartCamera {
  private st: CameraState = { x: 0, y: 0, k: 1 }
  private w = 0
  private h = 0
  private baseScale = 1
  private anim: { stop: () => void } | null = null
  private inertiaRaf = 0
  /** true while an inertia glide is running */
  private gliding = false
  reduced = false
  /** called after every change with the current state and base scale */
  onChange: ((state: CameraState, base: number) => void) | null = null
  /** called once the camera comes to rest (animation or glide complete, or an instant move) */
  onSettle: (() => void) | null = null

  setOnSettle(fn: (() => void) | null): void {
    this.onSettle = fn
  }
  /** notify listeners that a gesture-driven move has come to rest (pointer up) */
  settle(): void {
    if (!this.animating) this.onSettle?.()
  }
  /** the visible viewport in chart units */
  viewBox(): UnitsBox {
    const a = this.toUnits(0, 0)
    const b = this.toUnits(this.w, this.h)
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y }
  }

  setReduced(v: boolean): void {
    this.reduced = v
  }
  setOnChange(fn: ((state: CameraState, base: number) => void) | null): void {
    this.onChange = fn
  }

  /* ------------------------------------------------------------ geometry */

  get state(): CameraState {
    return { ...this.st }
  }
  get base(): number {
    return this.baseScale
  }
  /** pixels per chart unit at the current zoom */
  get scale(): number {
    return this.baseScale * this.st.k
  }
  get viewport(): { w: number; h: number } {
    return { w: this.w, h: this.h }
  }
  get zoom(): number {
    return this.st.k
  }
  get animating(): boolean {
    return this.anim !== null || this.gliding
  }

  /** stage size in CSS pixels; keeps the centre point and zoom, refits base scale */
  setViewport(w: number, h: number): void {
    if (w <= 0 || h <= 0) return
    const hadSize = this.w > 0 && this.h > 0
    const c = hadSize ? this.centerUnits() : null
    this.w = w
    this.h = h
    this.baseScale = Math.max(1e-6, Math.min((w - 2 * FIT_MARGIN) / VIEW.w, (h - 2 * FIT_MARGIN) / VIEW.h))
    if (c) this.setCenter(c.x, c.y, this.st.k)
    else this.applyState(this.resetState())
  }

  toUnits(pxX: number, pxY: number): { x: number; y: number } {
    const s = this.scale
    return { x: this.st.x + pxX / s, y: this.st.y + pxY / s }
  }
  toPixels(ux: number, uy: number): { x: number; y: number } {
    const s = this.scale
    return { x: (ux - this.st.x) * s, y: (uy - this.st.y) * s }
  }
  centerUnits(): { x: number; y: number } {
    return this.toUnits(this.w / 2, this.h / 2)
  }

  /* ------------------------------------------------------------ mutation */

  /**
   * Keep the chart on the stage: the region may be pushed at most SLACK of the stage off-screen,
   * plus the zoom-1 letterbox band (the region's aspect rarely matches the stage) scaled by the
   * zoom and capped at another SLACK. The band allowance means zooming at a stage corner keeps
   * the point under the cursor fixed instead of snapping the region back; the cap means a hard
   * pan still leaves at least the central half of the stage covered by the region.
   */
  private clampState(s: CameraState): CameraState {
    const k = clamp(s.k, MIN_ZOOM, MAX_ZOOM)
    const sc = this.baseScale * k
    const rw = VIEW.w * sc
    const rh = VIEW.h * sc
    const bandX = Math.max(0, (this.w - VIEW.w * this.baseScale) / 2) * k
    const bandY = Math.max(0, (this.h - VIEW.h * this.baseScale) / 2) * k
    const slackX = this.w * SLACK + Math.min(bandX, this.w * SLACK)
    const slackY = this.h * SLACK + Math.min(bandY, this.h * SLACK)
    // region pixel left/top edge relative to the stage
    let left = -s.x * sc
    let top = -s.y * sc
    const maxLeft = slackX
    const minLeft = this.w - slackX - rw
    const maxTop = slackY
    const minTop = this.h - slackY - rh
    left = minLeft > maxLeft ? (this.w - rw) / 2 : clamp(left, minLeft, maxLeft)
    top = minTop > maxTop ? (this.h - rh) / 2 : clamp(top, minTop, maxTop)
    return { x: -left / sc, y: -top / sc, k }
  }

  private applyState(s: CameraState): void {
    this.st = this.clampState(s)
    this.onChange?.(this.st, this.baseScale)
  }

  private resetState(): CameraState {
    const sc = this.baseScale
    return { x: (VIEW.w - this.w / sc) / 2, y: (VIEW.h - this.h / sc) / 2, k: 1 }
  }

  private setCenter(cx: number, cy: number, k: number): void {
    const sc = this.baseScale * clamp(k, MIN_ZOOM, MAX_ZOOM)
    this.applyState({ x: cx - this.w / (2 * sc), y: cy - this.h / (2 * sc), k })
  }

  /** cancel any running animation or glide */
  stop(): void {
    this.anim?.stop()
    this.anim = null
    if (this.inertiaRaf) cancelAnimationFrame(this.inertiaRaf)
    this.inertiaRaf = 0
    this.gliding = false
  }

  destroy(): void {
    this.stop()
    this.onChange = null
    this.onSettle = null
  }

  /**
   * Move to a target state. Animated moves ease the centre linearly and the zoom in log space and
   * settle on completion; instant moves settle only when `settle` is set (gesture-driven moves
   * leave settling to the gesture's end so the hot path stays free of listeners).
   */
  private go(target: CameraState, animated: boolean, ms = DEFAULT_MS, settle = animated): void {
    this.stop()
    const to = this.clampState(target)
    if (!animated || this.reduced || this.w === 0) {
      this.applyState(to)
      if (settle) this.onSettle?.()
      return
    }
    const from = { ...this.st }
    const fc = this.centerUnits()
    const tsc = this.baseScale * to.k
    const tc = { x: to.x + this.w / (2 * tsc), y: to.y + this.h / (2 * tsc) }
    const ratio = to.k / from.k
    const controls = animate(0, 1, {
      duration: ms / 1000,
      ease: CHART_EASE,
      onUpdate: (f) => {
        const k = from.k * Math.pow(ratio, f)
        this.setCenter(fc.x + (tc.x - fc.x) * f, fc.y + (tc.y - fc.y) * f, k)
      },
      onComplete: () => {
        if (this.anim === controls) this.anim = null
        this.applyState(to)
        this.onSettle?.()
      },
    })
    this.anim = controls
  }

  /** zoom to factor `k` keeping the unit under stage pixel (cxPx, cyPx) fixed */
  zoomTo(k: number, cxPx: number, cyPx: number, animated = false, ms = 450): void {
    const kk = clamp(k, MIN_ZOOM, MAX_ZOOM)
    const u = this.toUnits(cxPx, cyPx)
    const sc = this.baseScale * kk
    this.go({ x: u.x - cxPx / sc, y: u.y - cyPx / sc, k: kk }, animated, ms)
  }
  zoomBy(factor: number, cxPx: number, cyPx: number, animated = false, ms = 450): void {
    this.zoomTo(this.st.k * factor, cxPx, cyPx, animated, ms)
  }

  /** pan by a pixel delta (positive dx moves the chart right, i.e. reveals what was left) */
  panBy(dxPx: number, dyPx: number, animated = false, ms = 300): void {
    const sc = this.scale
    this.go({ x: this.st.x - dxPx / sc, y: this.st.y - dyPx / sc, k: this.st.k }, animated, ms)
  }

  /** fit a unit box into the stage; padding is uniform or per side in pixels */
  fitBounds(box: UnitsBox, padding: number | FitPadding = 72, animated = true, ms = DEFAULT_MS): void {
    const p = typeof padding === 'number' ? { top: padding, right: padding, bottom: padding, left: padding } : padding
    const bw = Math.max(1e-6, box.x1 - box.x0)
    const bh = Math.max(1e-6, box.y1 - box.y0)
    const pw = Math.max(40, this.w - p.left - p.right)
    const ph = Math.max(40, this.h - p.top - p.bottom)
    const k = clamp(Math.min(pw / bw, ph / bh) / this.baseScale, MIN_ZOOM, MAX_ZOOM)
    const sc = this.baseScale * k
    // centre the box inside the padded area, not the whole stage
    const cx = (box.x0 + box.x1) / 2
    const cy = (box.y0 + box.y1) / 2
    const px = p.left + pw / 2
    const py = p.top + ph / 2
    this.go({ x: cx - px / sc, y: cy - py / sc, k }, animated, ms, true)
  }

  reset(animated = true, ms = DEFAULT_MS): void {
    this.go(this.resetState(), animated, ms, true)
  }

  centerOn(p: { x: number; y: number }, animated = true, ms = DEFAULT_MS): void {
    const sc = this.scale
    this.go({ x: p.x - this.w / (2 * sc), y: p.y - this.h / (2 * sc), k: this.st.k }, animated, ms, true)
  }

  /** per-frame exponential approach of the centre toward a unit point (follow mode) */
  approachCenter(ux: number, uy: number, alpha: number): void {
    const c = this.centerUnits()
    this.setCenter(c.x + (ux - c.x) * alpha, c.y + (uy - c.y) * alpha, this.st.k)
  }

  /** velocity-based glide after a drag, in pixels per second */
  fling(vxPx: number, vyPx: number): void {
    this.stop()
    if (this.reduced) return
    let vx = vxPx
    let vy = vyPx
    if (Math.hypot(vx, vy) < 120) return
    // cap the launch speed so a flick never throws the chart across the stage
    const speed = Math.hypot(vx, vy)
    const cap = 1800
    if (speed > cap) {
      vx *= cap / speed
      vy *= cap / speed
    }
    let last = performance.now()
    const friction = 5.5
    this.gliding = true
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const sc = this.scale
      this.applyState({ x: this.st.x - (vx * dt) / sc, y: this.st.y - (vy * dt) / sc, k: this.st.k })
      const decay = Math.exp(-friction * dt)
      vx *= decay
      vy *= decay
      if (Math.hypot(vx, vy) < 20) {
        this.gliding = false
        this.inertiaRaf = 0
        this.onSettle?.()
        return
      }
      this.inertiaRaf = requestAnimationFrame(step)
    }
    this.inertiaRaf = requestAnimationFrame(step)
  }
}
