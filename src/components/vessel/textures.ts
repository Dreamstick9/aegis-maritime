/**
 * Procedural canvas textures for the vessel model: hull-side markings (name, line mark,
 * draught marks, load line, hawse pipes), transom lettering, accommodation facades, bridge
 * glass, funnel livery, ensigns and a tiling noise map for the water. Everything is drawn
 * locally; no image assets are loaded.
 */
import * as THREE from 'three'
import type { Vessel } from '../../engine/types'
import { hullPoint, type HullParams } from './hull'

type Ctx = CanvasRenderingContext2D

const OFF_WHITE = '#f5efdd'
const YELLOW = '#f2c230'
const BLACK = '#111112'

export const font = (weight: number, px: number) => `${weight} ${px}px 'Geist Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
export const mono = (weight: number, px: number) => `${weight} ${px}px 'Geist Mono Variable', SFMono-Regular, Menlo, monospace`

export function isIndianFlag(v: Vessel): boolean {
  return /india/i.test(v.flag)
}

export function portOfRegistry(v: Vessel): string {
  return isIndianFlag(v) ? 'MUMBAI' : 'SINGAPORE'
}

export function classLetters(v: Vessel): string {
  return isIndianFlag(v) ? 'IR' : 'LR'
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  return [c, ctx]
}

export function toTexture(c: HTMLCanvasElement, opts: { srgb?: boolean; wrap?: boolean; anisotropy?: number } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = opts.anisotropy ?? 8
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  if (opts.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.needsUpdate = true
  return t
}

/** side markings in ship coordinates; `mirrored` draws glyphs flipped so the port side reads correctly */
export function drawSide(ctx: Ctx, W: number, H: number, v: Vessel, p: HullParams, mirrored: boolean) {
  const { L, D, T } = p
  const Dtop = D + 3
  const px = W / L
  const py = H / Dtop
  const X = (xm: number) => ((xm + L / 2) / L) * W
  const Y = (ym: number) => (1 - ym / Dtop) * H
  const tX = (t: number) => -L / 2 + t * L
  ctx.clearRect(0, 0, W, H)
  const sgn = mirrored ? -1 : 1
  const text = (str: string, xm: number, ym: number, hM: number, opts: { weight?: number; color?: string; spacing?: string; align?: CanvasTextAlign } = {}) => {
    ctx.save()
    ctx.translate(X(xm), Y(ym))
    ctx.scale((sgn * px) / py, 1)
    ctx.font = font(opts.weight ?? 600, hM * py)
    ctx.fillStyle = opts.color ?? OFF_WHITE
    ctx.textAlign = opts.align ?? 'center'
    ctx.textBaseline = 'middle'
    try {
      ;(ctx as unknown as { letterSpacing: string }).letterSpacing = opts.spacing ?? '0.06em'
    } catch {
      /* older canvas */
    }
    ctx.fillText(str, 0, 0)
    ctx.restore()
  }
  const rect = (xm: number, ym: number, wM: number, hM: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(X(xm - wM / 2), Y(ym + hM / 2), wM * px, hM * py)
  }
  const ellipse = (xm: number, ym: number, rxM: number, ryM: number, color: string, stroke = false, lw = 0) => {
    ctx.beginPath()
    ctx.ellipse(X(xm), Y(ym), rxM * px, ryM * py, 0, 0, Math.PI * 2)
    if (stroke) {
      ctx.strokeStyle = color
      ctx.lineWidth = lw
      ctx.stroke()
    } else {
      ctx.fillStyle = color
      ctx.fill()
    }
  }

  // ship's name on the bow
  text(v.name.toUpperCase(), tX(0.818), D - 3.9, 2.4, { spacing: '0.12em' })
  // line mark amidships, forward of the load line
  text('AEGIS MARITIME', tX(0.62), D * 0.72, 5.6, { weight: 600, spacing: '0.16em', color: '#ede7d6' })

  // draught marks at bow, midships and stern: white numerals every 2 m with a tick
  for (const t of [0.905, 0.5, 0.115]) {
    const xm = tX(t)
    for (let m = 2; m <= Math.floor(D - 1.5); m += 2) {
      rect(xm + 0.55, m, 0.9, 0.14, OFF_WHITE)
      text(`${m}`, xm - 0.25, m + 0.02, 0.62, { weight: 500, align: 'center', spacing: '0' })
    }
  }

  // load line: deck line, disc with a horizontal through-line and class letters, the grid forward
  const lx = tX(0.5) + 3.5
  rect(lx, D - 0.6, 3.6, 0.32, OFF_WHITE)
  ellipse(lx, T, 1.1, 1.1, OFF_WHITE, true, Math.max(2, 0.18 * py))
  rect(lx, T, 3.6, 0.22, OFF_WHITE)
  const cls = classLetters(v)
  text(cls[0], lx - 2.1, T, 0.9, { weight: 500, spacing: '0' })
  text(cls[1], lx + 2.1, T, 0.9, { weight: 500, spacing: '0' })
  const gx = lx + 4.2
  rect(gx, T + 0.35, 0.22, 3.4, OFF_WHITE)
  const marks: [string, number][] = [
    ['TF', T + 1.5],
    ['F', T + 1.0],
    ['T', T + 0.5],
    ['S', T],
    ['W', T - 0.5],
    ['WNA', T - 1.0],
  ]
  for (const [k, ym] of marks) {
    rect(gx + 0.9, ym, 1.6, 0.18, OFF_WHITE)
    text(k, gx + 2.4, ym, 0.5, { weight: 500, align: 'left', spacing: '0' })
  }

  // hawse pipes with a dark rim
  const [ax, ay] = hullPoint(p, 0.945, 0.86)
  ellipse(ax, ay, 1.35, 1.05, '#0a0a0b')
  ellipse(ax, ay, 1.35, 1.05, '#3a3b3f', true, Math.max(1.5, 0.12 * py))

  // bulbous-bow pictogram near the waterline forward
  const bx = tX(0.93)
  ellipse(bx, T - 2.2, 1.5, 0.75, OFF_WHITE, true, Math.max(2, 0.16 * py))
  ctx.beginPath()
  ctx.fillStyle = OFF_WHITE
  ctx.moveTo(X(bx + 1.6), Y(T - 1.6))
  ctx.lineTo(X(bx + 2.6), Y(T - 2.2))
  ctx.lineTo(X(bx + 1.6), Y(T - 2.8))
  ctx.closePath()
  ctx.fill()

  // thin sheer-strake line under the deck edge
  ctx.fillStyle = 'rgba(245,239,221,0.28)'
  ctx.fillRect(X(tX(0.14)), Y(D - 0.35), (tX(0.985) - tX(0.14)) * px, Math.max(1, 0.08 * py))
}

export function drawTransom(ctx: Ctx, W: number, H: number, v: Vessel) {
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = OFF_WHITE
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  try {
    ;(ctx as unknown as { letterSpacing: string }).letterSpacing = '0.1em'
  } catch {
    /* older canvas */
  }
  const fit = (str: string, weight: number, px: number, maxW: number) => {
    ctx.font = font(weight, px)
    const w = ctx.measureText(str).width
    if (w > maxW) ctx.font = font(weight, (px * maxW) / w)
  }
  const name = v.name.toUpperCase()
  fit(name, 600, H * 0.26, W * 0.9)
  ctx.fillText(name, W / 2, H * 0.36)
  fit(portOfRegistry(v), 500, H * 0.17, W * 0.7)
  ctx.fillText(portOfRegistry(v), W / 2, H * 0.72)
}

/** accommodation facade: off-white plating with rows of windows and deck seams */
export function drawFacade(ctx: Ctx, W: number, H: number, wM: number, hM: number, opts: { deckH?: number; tiers?: number; door?: boolean; density?: number; base?: string } = {}) {
  const deckH = opts.deckH ?? 3
  const tiers = opts.tiers ?? Math.floor(hM / deckH)
  const px = W / wM
  const py = H / hM
  ctx.fillStyle = opts.base ?? '#e4ded0'
  ctx.fillRect(0, 0, W, H)
  // faint horizontal plating and deck seams
  for (let k = 1; k < tiers; k++) {
    const y = H - k * deckH * py
    ctx.fillStyle = 'rgba(17,17,18,0.16)'
    ctx.fillRect(0, y - 1, W, 2)
  }
  const density = opts.density ?? 1
  const pitch = 2.1 / density
  const margin = 1.6
  for (let k = 0; k < tiers; k++) {
    const yc = hM - (k + 0.55) * deckH
    if (k === tiers - 1 && opts.door) continue
    const count = Math.floor((wM - margin * 2) / pitch)
    const start = (wM - (count - 1) * pitch) / 2
    for (let i = 0; i < count; i++) {
      if (k === tiers - 1 && (i % 3 === 1)) continue
      const xc = start + i * pitch
      ctx.fillStyle = '#12161a'
      ctx.fillRect((xc - 0.42) * px, H - (yc + 0.6) * py, 0.84 * px, 1.15 * py)
      ctx.fillStyle = 'rgba(160,190,215,0.35)'
      ctx.fillRect((xc - 0.36) * px, H - (yc + 0.54) * py, 0.72 * px, 0.35 * py)
    }
  }
  if (opts.door) {
    ctx.fillStyle = '#1b1c1f'
    ctx.fillRect((wM * 0.5 - 0.6) * px, H - 2.2 * py, 1.2 * px, 2.2 * py)
  }
  // a thin dark rubbing line at the base
  ctx.fillStyle = 'rgba(17,17,18,0.3)'
  ctx.fillRect(0, H - 0.3 * py, W, 0.3 * py)
}

/** wheelhouse face: glass band with mullions over off-white plating */
export function drawBridgeGlass(ctx: Ctx, W: number, H: number, wM: number, opts: { glassFrac?: number; mullion?: number } = {}) {
  const px = W / wM
  const glass = opts.glassFrac ?? 0.6
  ctx.fillStyle = '#e4ded0'
  ctx.fillRect(0, 0, W, H)
  const gh = H * glass
  ctx.fillStyle = '#0d1116'
  ctx.fillRect(0, H * 0.12, W, gh)
  ctx.fillStyle = 'rgba(150,180,210,0.28)'
  ctx.fillRect(0, H * 0.12, W, gh * 0.35)
  const pitch = opts.mullion ?? 1.35
  ctx.fillStyle = '#cfc9bb'
  for (let x = pitch * 0.5; x < wM; x += pitch) ctx.fillRect(x * px - 1.5, H * 0.12, 3, gh)
  ctx.fillRect(0, H * 0.12 + gh - 2, W, 3)
}

/** funnel livery wrapped around the casing: black casing, signal-yellow band with the Aegis shield, tricolour for the Indian registry */
export function drawFunnel(ctx: Ctx, W: number, H: number, indian: boolean) {
  ctx.fillStyle = '#17181a'
  ctx.fillRect(0, 0, W, H)
  // top cap darker
  ctx.fillStyle = '#0b0b0c'
  ctx.fillRect(0, 0, W, H * 0.1)
  const bandTop = H * 0.2
  const bandH = H * 0.24
  ctx.fillStyle = YELLOW
  ctx.fillRect(0, bandTop, W, bandH)
  if (indian) {
    const sh = H * 0.045
    const y0 = bandTop + bandH + H * 0.05
    ctx.fillStyle = '#ff9933'
    ctx.fillRect(0, y0, W, sh)
    ctx.fillStyle = '#f5efdd'
    ctx.fillRect(0, y0 + sh, W, sh)
    ctx.fillStyle = '#138808'
    ctx.fillRect(0, y0 + sh * 2, W, sh)
  }
  // shield on both sides of the casing
  const shield = new Path2D('M32 9 L51 16.5 V32 C51 43.5 42.5 52.5 32 56 C21.5 52.5 13 43.5 13 32 V16.5 Z')
  const tick = new Path2D('M21 35 L29.5 29.5 L35.5 39 L43 26')
  for (const u of [0.25, 0.75]) {
    const size = bandH * 0.86
    ctx.save()
    ctx.translate(W * u - size / 2, bandTop + (bandH - size) / 2)
    ctx.scale(size / 64, size / 64)
    ctx.fillStyle = BLACK
    ctx.fill(shield)
    ctx.strokeStyle = YELLOW
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke(tick)
    ctx.restore()
  }
}

/** national flag flown at the stern staff */
export function drawFlag(ctx: Ctx, W: number, H: number, indian: boolean) {
  if (indian) {
    ctx.fillStyle = '#ff9933'
    ctx.fillRect(0, 0, W, H / 3)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, H / 3, W, H / 3)
    ctx.fillStyle = '#138808'
    ctx.fillRect(0, (2 * H) / 3, W, H / 3)
    const cx = W / 2
    const cy = H / 2
    const r = H / 3 / 2 - H * 0.02
    ctx.strokeStyle = '#000080'
    ctx.lineWidth = Math.max(2, H * 0.02)
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.lineWidth = Math.max(1.2, H * 0.009)
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
      ctx.stroke()
    }
    ctx.fillStyle = '#000080'
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.12, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  ctx.fillStyle = '#ef3340'
  ctx.fillRect(0, 0, W, H / 2)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, H / 2, W, H / 2)
  const cx = W * 0.2
  const cy = H * 0.25
  const r = H * 0.17
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ef3340'
  ctx.beginPath()
  ctx.arc(cx + r * 0.36, cy, r * 0.86, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  const star = (x: number, y: number, s: number) => {
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2
      const rr = i % 2 === 0 ? s : s * 0.45
      const px = x + Math.cos(a) * rr
      const py = y + Math.sin(a) * rr
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fill()
  }
  const sx = cx + r * 0.75
  const ss = r * 0.2
  star(sx, cy - r * 0.62, ss)
  star(sx - r * 0.5, cy - r * 0.2, ss)
  star(sx + r * 0.5, cy - r * 0.2, ss)
  star(sx - r * 0.32, cy + r * 0.4, ss)
  star(sx + r * 0.32, cy + r * 0.4, ss)
}

/** hatch cover: two side-rolling panels with stiffener seams and a cleat rim */
export function drawHatchCover(ctx: Ctx, W: number, H: number) {
  ctx.fillStyle = '#4a4b50'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(245,239,221,0.06)'
  for (let i = 1; i < 8; i++) ctx.fillRect((W * i) / 8 - 1, 0, 2, H)
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, H / 2 - 3, W, 6)
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'
  ctx.lineWidth = 6
  ctx.strokeRect(3, 3, W - 6, H - 6)
}

/** tiling low-frequency noise used to ripple the water reflection */
export function drawNoise(ctx: Ctx, W: number, H: number) {
  const img = ctx.createImageData(W, H)
  const d = img.data
  const TAU = Math.PI * 2
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W
      const v = y / H
      let n = 0
      n += Math.sin(TAU * (3 * u + 0.35 * Math.sin(TAU * 2 * v)))
      n += Math.sin(TAU * (5 * v + 0.4 * Math.sin(TAU * 3 * u)))
      n += 0.6 * Math.sin(TAU * (7 * u + 4 * v))
      n += 0.4 * Math.sin(TAU * (11 * u - 6 * v))
      const g = Math.round(((n / 3 + 1) / 2) * 255)
      const i = (y * W + x) * 4
      d[i] = d[i + 1] = d[i + 2] = g
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}
