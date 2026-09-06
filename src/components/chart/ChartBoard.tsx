/**
 * The Command chart: a flat 2D SVG plate. The board owns the stage, the single <svg>, the camera
 * <g transform> and the ChartContext; the layers under ./layers draw everything geographic in
 * chart units (see projection.ts) and counter-scale marks and type by `S` (units per pixel).
 *
 * The camera (camera.ts) is held in a ref and written straight to the DOM; only the quantised
 * zoom and the base scale are mirrored into React so the layers can size marks.
 */
import { motion, useAnimationFrame, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { activePlanAt, useStore, type AppState } from '../../app/store'
import { PORTS } from '../../data/ports'
import { stateAt } from '../../engine/replay'
import '../../styles/chart.css'
import { ChartCamera, type FitPadding, type UnitsBox } from './camera'
import ChartControls from './ChartControls'
import { ChartContext, type ChartCtx } from './context'
import { chipContent, readInfo } from './info'
import { GraticuleLayer, LandLayer, WaterLayer, ZoneLayer } from './layers/base'
import { LabelLayer } from './layers/labels'
import { FleetLayer, MissionVesselLayer, PortLayer } from './layers/marks'
import { RouteLayer } from './layers/routes'
import { FieldLayer, StormLayer } from './layers/weather'
import { VIEW, pt } from './projection'
import ScaleBar from './ScaleBar'
import { THEMES } from './theme'

declare global {
  interface Window {
    /** dev-only debug hooks for browser tests */
    __aegisCamera?: ChartCamera
    __aegisView?: ChartCtx['view']
  }
}

/** the entrance fade plays once per session, not on every re-mount of the kept-alive view */
let entered = false
/** fit padding around the plan; see fitPaddingFor for the extra room on the label side */
const FIT_PAD_PX = 90
/** port labels hang to the right of their mark: this much extra when an endpoint port bounds the fit on the east */
const FIT_LABEL_PX = 120
/** hover chip offset from the cursor, and the margin it keeps from the stage edge */
const CHIP_GAP = 14
const CHIP_MARGIN = 8
/** the vessel may drift to this fraction of the stage edge before follow mode eases the camera */
const FOLLOW_OUTER = 0.2
/** follow mode stops easing once the vessel is back within this fraction of the centre */
const FOLLOW_INNER = 0.05

function trackBox(s: AppState): UnitsBox | null {
  const plan = activePlanAt(s.plans, s.timeline.tH)
  if (!plan) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  const add = (p: { lat: number; lon: number }) => {
    const [x, y] = pt(p)
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  for (const seg of plan.evaluation.segments) {
    add(seg.from)
    add(seg.to)
  }
  // include the origin and destination ports so their marks and labels sit inside the fit
  for (const id of [s.mission.originId, s.mission.destinationId]) {
    const port = PORTS[id]
    if (port) add(port.position)
  }
  if (!Number.isFinite(x0)) return null
  return { x0, y0, x1, y1 }
}

/**
 * Fit padding for a plan box. Voyages run in any direction, so the label room goes to whichever
 * side an endpoint port bounds: right when the origin or destination is the easternmost point (its
 * label extends east of the mark), plus a little on the west for the ring itself.
 */
function fitPaddingFor(s: AppState, b: UnitsBox): FitPadding {
  const pad: FitPadding = { top: FIT_PAD_PX, right: FIT_PAD_PX, bottom: FIT_PAD_PX, left: FIT_PAD_PX }
  const eps = Math.max(1e-6, (b.x1 - b.x0) * 0.03)
  for (const id of [s.mission.originId, s.mission.destinationId]) {
    const port = PORTS[id]
    if (!port) continue
    const [x] = pt(port.position)
    if (x >= b.x1 - eps) pad.right = FIT_PAD_PX + FIT_LABEL_PX
    if (x <= b.x0 + eps) pad.left = FIT_PAD_PX + 16
  }
  return pad
}

function vesselUnits(s: AppState): { x: number; y: number } | null {
  const plan = activePlanAt(s.plans, s.timeline.tH)
  if (!plan) return null
  const st = stateAt(plan, s.timeline.tH, s.scenario.ocean, { truth: true })
  const [x, y] = pt(st.position)
  return { x, y }
}

interface DragState {
  id: number
  lastX: number
  lastY: number
  samples: { t: number; x: number; y: number }[]
}
interface PinchState {
  k0: number
  dist0: number
  lastMid: { x: number; y: number }
}

export default function ChartBoard() {
  const reducedPref = useReducedMotion()
  const reduced = useStore((s) => s.ui.reducedMotion) || !!reducedPref
  const mode = useStore((s) => s.ui.chartMode)
  const tH = useStore((s) => Math.floor(s.timeline.tH * 4) / 4)
  const updateUi = useStore((s) => s.updateUi)
  const theme = THEMES[mode]

  const stageRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const camG = useRef<SVGGElement>(null)
  const [camera] = useState(() => new ChartCamera())
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [base, setBase] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [view, setView] = useState<ChartCtx['view']>({ x0: 0, y0: 0, x1: VIEW.w, y1: VIEW.h })
  // visible viewport in units, mirrored only when the camera settles (rAF-throttled, off the move path)
  const viewRaf = useRef(0)
  const scheduleView = useCallback(() => {
    if (viewRaf.current) return
    viewRaf.current = requestAnimationFrame(() => {
      viewRaf.current = 0
      const v = camera.viewBox()
      setView((prev) => (prev.x0 === v.x0 && prev.y0 === v.y0 && prev.x1 === v.x1 && prev.y1 === v.y1 ? prev : v))
    })
  }, [camera])
  useEffect(() => () => cancelAnimationFrame(viewRaf.current), [])
  useEffect(() => {
    if (import.meta.env.DEV) window.__aegisView = view
  }, [view])

  useEffect(() => {
    camera.setReduced(reduced)
  }, [camera, reduced])

  // camera -> DOM. Only the quantised zoom reaches React.
  useEffect(() => {
    let lastZoom = 0
    camera.setOnChange((st, b) => {
      const s = b * st.k
      camG.current?.setAttribute('transform', `translate(${(-st.x * s).toFixed(3)} ${(-st.y * s).toFixed(3)}) scale(${s.toFixed(5)})`)
      if (Math.abs(st.k - lastZoom) > lastZoom * 0.01) {
        lastZoom = st.k
        setZoom(st.k)
        scheduleView()
      }
    })
    camera.setOnSettle(scheduleView)
    if (import.meta.env.DEV) window.__aegisCamera = camera
    return () => {
      camera.destroy()
      if (import.meta.env.DEV && window.__aegisCamera === camera) delete window.__aegisCamera
    }
  }, [camera, scheduleView])

  // stage size -> viewBox and base scale; the first measurement fits the region (or the plan)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    let first = true
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect
      if (r.width <= 0 || r.height <= 0) return
      svgRef.current?.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`)
      camera.setViewport(r.width, r.height)
      setBox({ w: r.width, h: r.height })
      setBase(camera.base)
      scheduleView()
      if (first) {
        first = false
        const st = useStore.getState()
        const b = trackBox(st)
        if (b) camera.fitBounds(b, fitPaddingFor(st, b), false)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [camera, scheduleView])

  /* ----------------------------------------------------------- store links */

  const fitRoute = useCallback(
    (animated = true) => {
      const st = useStore.getState()
      const b = trackBox(st)
      if (b) camera.fitBounds(b, fitPaddingFor(st, b), animated)
    },
    [camera],
  )

  useEffect(() => {
    let prev = useStore.getState()
    return useStore.subscribe((s) => {
      const p = prev
      prev = s
      // a new voyage (new seed or new pack) materialises a new scenario object: show the whole region again
      if (s.scenario !== p.scenario) {
        camera.reset(false)
        return
      }
      const gained = p.plans.length === 0 && s.plans.length > 0
      const reselected = s.selectedSolutionId !== p.selectedSolutionId && s.plans.length > 0
      const replanned = s.replan.history.length > p.replan.history.length
      if (gained || reselected || replanned) {
        const b = trackBox(s)
        if (b) camera.fitBounds(b, fitPaddingFor(s, b), true)
        return
      }
      if (s.ui.followVessel && !p.ui.followVessel) {
        const v = vesselUnits(s)
        if (v) camera.centerOn(v, true)
      }
    })
  }, [camera])

  // follow: while the replay plays, keep the vessel inside the inner 60% of the stage. The ease
  // moves the camera per frame without settling it, so the visible-view mirror (pinned labels,
  // label placement) is refreshed while easing (rAF-coalesced) and settled once the ease ends.
  const following = useRef(false)
  useAnimationFrame((_, dt) => {
    const s = useStore.getState()
    if (!s.ui.followVessel || !s.timeline.playing || camera.animating) {
      if (following.current) {
        following.current = false
        camera.settle()
      }
      return
    }
    const v = vesselUnits(s)
    if (!v) return
    const { w, h } = camera.viewport
    if (w === 0) return
    const p = camera.toPixels(v.x, v.y)
    const outside = p.x < w * FOLLOW_OUTER || p.x > w * (1 - FOLLOW_OUTER) || p.y < h * FOLLOW_OUTER || p.y > h * (1 - FOLLOW_OUTER)
    if (outside) following.current = true
    if (!following.current) return
    camera.approachCenter(v.x, v.y, 1 - Math.exp(-(Math.min(dt, 50) / 1000) * 3))
    const q = camera.toPixels(v.x, v.y)
    if (Math.abs(q.x - w / 2) < w * FOLLOW_INNER && Math.abs(q.y - h / 2) < h * FOLLOW_INNER) {
      following.current = false
      camera.settle()
    } else scheduleView()
  })

  /* ------------------------------------------------------------ hover chip */

  // One delegated pointer listener set on the svg. Any element with `data-info` (see info.ts)
  // shows the chip; content and position are written straight to the DOM, never through state.
  const chipRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const svg = svgRef.current
    const chip = chipRef.current
    const stage = stageRef.current
    if (!svg || !chip || !stage) return
    const titleEl = chip.querySelector<HTMLElement>('.plate__chip-title')
    const linesEl = chip.querySelector<HTMLElement>('.plate__chip-lines')
    if (!titleEl || !linesEl) return
    let host: Element | null = null
    const place = (clientX: number, clientY: number) => {
      const r = stage.getBoundingClientRect()
      const x = clientX - r.left
      const y = clientY - r.top
      const w = chip.offsetWidth
      const h = chip.offsetHeight
      let left = x + CHIP_GAP
      let top = y + CHIP_GAP
      // flip inside the stage rather than run off its edge
      if (left + w > r.width - CHIP_MARGIN) left = Math.max(CHIP_MARGIN, x - CHIP_GAP - w)
      if (top + h > r.height - CHIP_MARGIN) top = Math.max(CHIP_MARGIN, y - CHIP_GAP - h)
      chip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
    }
    const hide = () => {
      host = null
      chip.classList.remove('is-on')
    }
    const show = (el: Element, clientX: number, clientY: number) => {
      const info = readInfo(el)
      if (!info) {
        hide()
        return
      }
      const c = chipContent(info)
      titleEl.textContent = c.title
      linesEl.replaceChildren(
        ...c.lines.map((line) => {
          const d = document.createElement('div')
          d.textContent = line
          return d
        }),
      )
      chip.dataset.kind = info.kind
      chip.classList.add('is-on')
      place(clientX, clientY)
    }
    /** the info host under the pointer; shapes without info (a route line) do not mask a zone beneath */
    const resolve = (e: PointerEvent): Element | null => {
      const t = e.target as Element | null
      const direct = t?.closest?.('[data-info]') ?? null
      if (direct || !t || t === svg) return direct
      for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
        if (!svg.contains(el)) break
        const c = el.closest('[data-info]')
        if (c) return c
      }
      return null
    }
    const onOver = (e: PointerEvent) => {
      const h = resolve(e)
      if (h === host) {
        if (host) place(e.clientX, e.clientY)
        return
      }
      if (!h) {
        hide()
        return
      }
      host = h
      show(h, e.clientX, e.clientY)
    }
    const onMove = (e: PointerEvent) => {
      if (host) place(e.clientX, e.clientY)
    }
    const onOut = (e: PointerEvent) => {
      const to = e.relatedTarget as Node | null
      if (!to || !svg.contains(to)) hide()
    }
    svg.addEventListener('pointerover', onOver)
    svg.addEventListener('pointermove', onMove)
    svg.addEventListener('pointerout', onOut)
    return () => {
      svg.removeEventListener('pointerover', onOver)
      svg.removeEventListener('pointermove', onMove)
      svg.removeEventListener('pointerout', onOut)
    }
  }, [])

  /* -------------------------------------------------------------- gestures */

  const userGesture = useCallback(() => {
    if (useStore.getState().ui.followVessel) updateUi({ followVessel: false })
  }, [updateUi])

  /** pointer position in stage pixels (the plate is flat, so the rect is exact) */
  const toStage = useCallback((clientX: number, clientY: number) => {
    const r = (svgRef.current ?? stageRef.current)?.getBoundingClientRect()
    if (!r) return { x: 0, y: 0 }
    return { x: clientX - r.left, y: clientY - r.top }
  }, [])

  // native non-passive wheel listener: React's synthetic onWheel cannot reliably preventDefault
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    let settleTimer = 0
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const factor = e.ctrlKey ? Math.exp(-e.deltaY * 0.01) : Math.exp(-e.deltaY * 0.0016)
      if (!Number.isFinite(factor) || factor <= 0) return
      const p = toStage(e.clientX, e.clientY)
      userGesture()
      camera.zoomBy(Math.min(1.5, Math.max(1 / 1.5, factor)), p.x, p.y, false)
      // the wheel has no "up": settle the view once the deltas stop
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => camera.settle(), 150)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.clearTimeout(settleTimer)
      el.removeEventListener('wheel', onWheel)
    }
  }, [camera, toStage, userGesture])

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<DragState | null>(null)
  const pinch = useRef<PinchState | null>(null)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement | null)?.closest?.('button')) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    camera.stop()
    userGesture()
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic or already-released pointer: track it without capture */
    }
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values())
      const mid = toStage((a.x + b.x) / 2, (a.y + b.y) / 2)
      pinch.current = { k0: camera.zoom, dist0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), lastMid: mid }
      drag.current = null
      return
    }
    drag.current = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY, samples: [{ t: performance.now(), x: e.clientX, y: e.clientY }] }
    setDragging(true)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values())
      const mid = toStage((a.x + b.x) / 2, (a.y + b.y) / 2)
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
      camera.panBy(mid.x - pinch.current.lastMid.x, mid.y - pinch.current.lastMid.y)
      camera.zoomTo(pinch.current.k0 * (dist / pinch.current.dist0), mid.x, mid.y)
      pinch.current.lastMid = mid
      return
    }
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    camera.panBy(e.clientX - d.lastX, e.clientY - d.lastY)
    d.lastX = e.clientX
    d.lastY = e.clientY
    const now = performance.now()
    d.samples.push({ t: now, x: e.clientX, y: e.clientY })
    while (d.samples.length > 2 && now - d.samples[0].t > 120) d.samples.shift()
  }
  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.delete(e.pointerId)
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
    }
    if (pinch.current) {
      if (pointers.current.size < 2) {
        pinch.current = null
        // the remaining finger continues as a drag
        const rest = Array.from(pointers.current.entries())[0]
        if (rest) drag.current = { id: rest[0], lastX: rest[1].x, lastY: rest[1].y, samples: [{ t: performance.now(), x: rest[1].x, y: rest[1].y }] }
      }
      return
    }
    const d = drag.current
    if (d && d.id === e.pointerId) {
      drag.current = null
      setDragging(false)
      const now = performance.now()
      const s0 = d.samples.find((s) => now - s.t <= 120) ?? d.samples[0]
      const dtS = (now - s0.t) / 1000
      if (e.type !== 'pointercancel' && dtS > 0.016) camera.fling((e.clientX - s0.x) / dtS, (e.clientY - s0.y) / dtS)
      camera.settle()
    }
  }
  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement | null)?.closest?.('button')) return
    const p = toStage(e.clientX, e.clientY)
    userGesture()
    camera.zoomBy(e.shiftKey ? 0.5 : 2, p.x, p.y, true, 600)
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement | null)?.closest?.('button')) return
    const { w, h } = camera.viewport
    const step = Math.max(40, Math.min(w, h) * 0.12)
    if (e.key === '+' || e.key === '=') {
      userGesture()
      camera.zoomBy(1.5, w / 2, h / 2, true)
    } else if (e.key === '-' || e.key === '_') {
      userGesture()
      camera.zoomBy(1 / 1.5, w / 2, h / 2, true)
    } else if (e.key === '0') {
      userGesture()
      camera.reset(true)
    } else if (e.key === 'ArrowLeft') {
      userGesture()
      camera.panBy(step, 0, true)
    } else if (e.key === 'ArrowRight') {
      userGesture()
      camera.panBy(-step, 0, true)
    } else if (e.key === 'ArrowUp') {
      userGesture()
      camera.panBy(0, step, true)
    } else if (e.key === 'ArrowDown') {
      userGesture()
      camera.panBy(0, -step, true)
    } else if (e.key === 'f' || e.key === 'F') {
      fitRoute(true)
    } else if (e.key === 'v' || e.key === 'V') {
      updateUi({ followVessel: !useStore.getState().ui.followVessel })
    } else return
    e.preventDefault()
    e.stopPropagation()
  }

  /* --------------------------------------------------------------- render */

  const S = 1 / Math.max(1e-9, base * zoom)
  const ctx = useMemo<ChartCtx>(() => ({ S, zoom, theme, reduced, tH, view }), [S, zoom, theme, reduced, tH, view])
  const vars = {
    '--chart-s': S,
    '--chart-ink': theme.ink1,
    '--chart-ink2': theme.ink2,
    '--chart-halo': theme.textHalo,
    '--chart-water': theme.water,
    '--chart-reg': theme.regulatory,
    '--chart-chip-bg': theme.chipBg,
    '--chart-chip-ink': theme.chipInk,
  } as React.CSSProperties

  return (
    <div
      ref={stageRef}
      className={`plate${dragging ? ' is-dragging' : ''}`}
      role="group"
      tabIndex={0}
      aria-label="Chart of the operating region: routes, zones, weather and fleet. Scroll or pinch to zoom, drag to pan, double-click to zoom in, shift and double-click to zoom out. With focus: plus and minus zoom, arrows pan, zero resets, f fits the route, v toggles follow."
      style={vars}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    >
      <motion.div
        className="plate__fade"
        initial={reduced || entered ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        onAnimationComplete={() => {
          entered = true
        }}
      >
        <svg ref={svgRef} className="plate__svg" viewBox={`0 0 ${Math.max(1, box.w)} ${Math.max(1, box.h)}`} aria-hidden="true">
          <rect className="plate__water" x={0} y={0} width={Math.max(1, box.w)} height={Math.max(1, box.h)} fill={theme.water} />
          <ChartContext.Provider value={ctx}>
            <g ref={camG}>
              <WaterLayer />
              <LandLayer />
              <GraticuleLayer />
              <ZoneLayer />
              <FieldLayer kind="waves" />
              <FieldLayer kind="current" />
              <FieldLayer kind="wind" />
              <RouteLayer />
              <StormLayer />
              <PortLayer />
              <FleetLayer />
              <MissionVesselLayer />
              <LabelLayer />
            </g>
          </ChartContext.Provider>
        </svg>
      </motion.div>
      <div ref={chipRef} className="plate__chip" data-reduced={reduced ? 'true' : undefined} aria-hidden="true">
        <div className="plate__chip-title" />
        <div className="plate__chip-lines" />
      </div>
      <ScaleBar base={base} zoom={zoom} stageRef={stageRef} camera={camera} />
      <ChartControls
        zoomIn={() => {
          const { w, h } = camera.viewport
          userGesture()
          camera.zoomBy(1.5, w / 2, h / 2, true)
        }}
        zoomOut={() => {
          const { w, h } = camera.viewport
          userGesture()
          camera.zoomBy(1 / 1.5, w / 2, h / 2, true)
        }}
        fitRoute={() => fitRoute(true)}
      />
    </div>
  )
}
