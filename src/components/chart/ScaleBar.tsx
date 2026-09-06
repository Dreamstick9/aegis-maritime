/**
 * Scale bar and cursor readout, bottom-left inside the stage. The bar picks a nice nautical-mile
 * length between 60 and 160 px at the current pixels-per-nm (at the region's mid-latitude). The
 * cursor position is written straight into the DOM on pointer move; no React state per move.
 */
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import type { ChartCamera } from './camera'
import { nmRadius, unproject } from './projection'

const NICE_NM = [5, 10, 20, 50, 100, 200, 500]
/** the region's mid-latitude, used for the nm to unit conversion */
const MID_LAT = 8

export interface ScaleBarProps {
  base: number
  zoom: number
  stageRef: RefObject<HTMLDivElement | null>
  camera: ChartCamera
}

function fmt(v: number, pos: string, neg: string) {
  return `${Math.abs(v).toFixed(1)}°${v >= 0 ? pos : neg}`
}

export default function ScaleBar({ base, zoom, stageRef, camera }: ScaleBarProps) {
  const cursorRef = useRef<HTMLSpanElement>(null)
  const bar = useMemo(() => {
    const pxPerNm = nmRadius(1, MID_LAT) * base * zoom
    let nm = NICE_NM[0]
    for (const n of NICE_NM) {
      const w = n * pxPerNm
      if (w <= 160) nm = n
      if (w >= 60 && w <= 160) break
    }
    return { nm, px: Math.max(8, Math.round(nm * pxPerNm)) }
  }, [base, zoom])

  useEffect(() => {
    const el = stageRef.current
    const out = cursorRef.current
    if (!el || !out) return
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const u = camera.toUnits(e.clientX - r.left, e.clientY - r.top)
      const ll = unproject(u.x, u.y)
      if (!Number.isFinite(ll.lat) || !Number.isFinite(ll.lon)) return
      out.textContent = `${fmt(ll.lat, 'N', 'S')} ${fmt(ll.lon, 'E', 'W')}`
      out.hidden = false
    }
    const onLeave = () => {
      out.hidden = true
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [stageRef, camera])

  return (
    <div className="plate__scale" aria-hidden="true">
      <div className="plate__scale-bar">
        <span>{bar.nm} nm</span>
        <div className="plate__scale-rule" style={{ width: bar.px }} />
      </div>
      <span ref={cursorRef} className="plate__scale-cursor" hidden />
    </div>
  )
}
