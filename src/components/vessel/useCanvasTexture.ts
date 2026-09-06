/** a canvas texture that is redrawn once the web fonts have loaded */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { makeCanvas, toTexture } from './textures'

export type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void

export function useCanvasTexture(draw: Draw, w: number, h: number, opts: { wrap?: boolean; srgb?: boolean } = {}): THREE.CanvasTexture {
  const wrap = opts.wrap ?? false
  const srgb = opts.srgb ?? true
  const tex = useMemo(() => {
    const [c, ctx] = makeCanvas(w, h)
    draw(ctx, w, h)
    return toTexture(c, { wrap, srgb })
  }, [draw, w, h, wrap, srgb])
  useEffect(() => {
    let alive = true
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined
    if (fonts && fonts.status !== 'loaded') {
      fonts.ready.then(() => {
        if (!alive) return
        const c = tex.image as HTMLCanvasElement
        const ctx = c.getContext('2d')
        if (!ctx) return
        draw(ctx, c.width, c.height)
        tex.needsUpdate = true
      })
    }
    return () => {
      alive = false
      tex.dispose()
    }
  }, [tex, draw])
  return tex
}
