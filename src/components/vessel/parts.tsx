/**
 * Detailed parts of the procedural bulk carrier. Every part is built from primitives and
 * canvas textures; nothing is downloaded. Selection ids match the dossier vocabulary
 * (`hold-N`, `bridge`, `propulsion`, `bow` and the internal region ids).
 */
import { Edges, Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Vessel } from '../../engine/types'
import { deckY, hullPoint, type Box, type VesselLayout } from './hull'
import { drawBridgeGlass, drawFacade, drawFlag, drawFunnel, drawHatchCover, drawSide, drawTransom, isIndianFlag } from './textures'
import { useCanvasTexture, type Draw } from './useCanvasTexture'

const YELLOW = '#f2c230'

const WHITE = '#e4ded0'
const STEEL = '#6f7178'

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
/** a click counts only if the pointer did not drag (orbiting starts on the hull and releases on it) */
const tap = (e: { stopPropagation: () => void; delta: number }) => {
  e.stopPropagation()
  return e.delta <= 4
}
const noRaycast = () => null

/** dispose a memoised geometry when it is replaced or the part unmounts */
function useDispose(...geos: THREE.BufferGeometry[]) {
  useEffect(() => () => geos.forEach((g) => g.dispose()), geos) // eslint-disable-line react-hooks/exhaustive-deps
}

export interface PartProps {
  layout: VesselLayout
  vessel: Vessel
  xray: boolean
  region: string | null
  hover: string | null
  onSelect: (id: string | null) => void
  onHover: (id: string | null) => void
}

const srgb = (hex: string) => new THREE.Color(hex).convertSRGBToLinear()

/** hull plating material: paint scheme by height plus projected side markings, satin topsides, matte antifouling */
function useHullMaterial(p: VesselLayout['params'], decalS: THREE.Texture, decalP: THREE.Texture) {
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, metalness: 0.45 })
    const uniforms = {
      uT: { value: p.T },
      uL: { value: p.L },
      uDtop: { value: p.D + 3 },
      uAnti: { value: srgb('#8f3d2c') },
      uBoot: { value: srgb('#5a1d16') },
      uTop: { value: srgb('#2a2f37') },
      uDeck: { value: srgb('#354a3e') },
      uDecalS: { value: decalS },
      uDecalP: { value: decalP },
    }
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vHull;\nvarying vec3 vHullN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHull = position;\nvHullN = normal;')
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vHull;
varying vec3 vHullN;
uniform float uT, uL, uDtop;
uniform vec3 uAnti, uBoot, uTop, uDeck;
uniform sampler2D uDecalS, uDecalP;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
{
  float y = vHull.y;
  float isDeck = step(0.85, vHullN.y);
  vec3 c = y < uT - 0.45 ? uAnti : (y < uT + 1.7 ? uBoot : uTop);
  // a thin off-white boot-top line
  float line = 1.0 - smoothstep(0.0, 0.12, abs(y - (uT + 1.7)));
  c = mix(c, vec3(0.62, 0.58, 0.5), line * 0.85);
  c = mix(c, uDeck, isDeck);
  vec2 duv = vec2((vHull.x + uL * 0.5) / uL, y / uDtop);
  vec4 d = vHullN.z >= 0.0 ? texture2D(uDecalS, duv) : texture2D(uDecalP, duv);
  d.a *= (1.0 - isDeck) * smoothstep(0.2, 0.45, abs(vHullN.z));
  c = mix(c, d.rgb, d.a);
  diffuseColor.rgb *= c;
}`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
{
  float isDeck = step(0.85, vHullN.y);
  roughnessFactor = vHull.y < uT - 0.45 ? 0.82 : mix(0.3, 0.88, isDeck);
}`,
        )
        .replace(
          '#include <metalnessmap_fragment>',
          `#include <metalnessmap_fragment>
{
  float isDeck = step(0.85, vHullN.y);
  metalnessFactor = vHull.y < uT - 0.45 ? 0.08 : mix(0.6, 0.12, isDeck);
}`,
        )
    }
    m.customProgramCacheKey = () => 'aegis-hull-v2'
    return m
  }, [p, decalS, decalP])
  useEffect(() => () => mat.dispose(), [mat])
  return mat
}

/** hull plating, bulb, skeg, shaft boss, bilge keels and the transom lettering */
export function HullBody({ layout, vessel, xray, region, onSelect, geometry }: PartProps & { geometry: THREE.BufferGeometry }) {
  const p = layout.params
  const { L, B, D } = p
  const drawS = useMemo<Draw>(() => (ctx, w, h) => drawSide(ctx, w, h, vessel, p, false), [vessel, p])
  const drawP = useMemo<Draw>(() => (ctx, w, h) => drawSide(ctx, w, h, vessel, p, true), [vessel, p])
  const decalS = useCanvasTexture(drawS, 4096, 768)
  const decalP = useCanvasTexture(drawP, 4096, 768)
  const mat = useHullMaterial(p, decalS, decalP)
  const drawT = useMemo<Draw>(() => (ctx, w, h) => drawTransom(ctx, w, h, vessel), [vessel])
  const transom = useCanvasTexture(drawT, 1280, 512)
  const skeg = useMemo(() => {
    const x = (t: number) => -L / 2 + t * L
    const s = new THREE.Shape()
    s.moveTo(x(0.16), D * 0.02)
    s.lineTo(x(0.16), D * 0.16)
    s.lineTo(x(0.03), D * 0.42)
    s.lineTo(x(0.03), D * 0.14)
    s.lineTo(x(0.05), D * 0.06)
    s.lineTo(x(0.14), D * 0.02)
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: 1.6, bevelEnabled: false })
    g.translate(0, 0, -0.8)
    return g
  }, [L, D])
  useDispose(skeg)
  const bowSel = region === 'bow'
  const propSel = region === 'propulsion'
  const uw = xray ? 0.3 : 1
  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow onClick={(e) => { if (!tap(e)) return; onSelect(null) }}>
        <primitive object={mat} attach="material" transparent={xray} opacity={xray ? 0.28 : 1} depthWrite={!xray} />
      </mesh>
      {/* bulbous bow */}
      <mesh position={layout.bulb.position} scale={layout.bulb.radius} castShadow onClick={(e) => { if (!tap(e)) return; onSelect('bow') }}>
        <sphereGeometry args={[1, 40, 24]} />
        <meshStandardMaterial color={bowSel ? YELLOW : '#8f3d2c'} emissive={bowSel ? YELLOW : '#000'} emissiveIntensity={bowSel ? 0.35 : 0} roughness={0.8} metalness={0.08} transparent={xray} opacity={uw} />
      </mesh>
      {/* skeg and stern boss */}
      <mesh geometry={skeg} castShadow>
        <meshStandardMaterial color="#8f3d2c" roughness={0.8} metalness={0.08} transparent={xray} opacity={uw} />
      </mesh>
      <mesh position={[layout.propeller.position[0] + 0.02 * L, layout.propeller.position[1], 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[1.15, 1.45, 0.05 * L, 20]} />
        <meshStandardMaterial color={propSel ? YELLOW : '#7a3325'} roughness={0.75} metalness={0.1} transparent={xray} opacity={uw} />
      </mesh>
      {/* bilge keels */}
      {[1, -1].map((side) => (
        <mesh key={side} position={[0.02 * L, 0.04 * B, side * (B / 2 - 0.05 * B)]} rotation={[side * Math.PI * 0.25, 0, 0]}>
          <boxGeometry args={[0.4 * L, 0.9, 0.08]} />
          <meshStandardMaterial color="#7a3325" roughness={0.85} metalness={0.05} transparent={xray} opacity={uw} />
        </mesh>
      ))}
      {/* transom lettering: name and port of registry */}
      <mesh position={[-L / 2 - 0.02 + hullPoint(p, 0, 0.72)[0] + L / 2 - 0.08, D - 6.2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[B * 0.46, B * 0.184]} />
        <meshStandardMaterial map={transom} transparent depthWrite={false} roughness={0.5} metalness={0.3} polygonOffset polygonOffsetFactor={-2} opacity={xray ? 0.25 : 1} />
      </mesh>
    </group>
  )
}

/** raised coamings with side-rolling covers; clicking selects the hold */
export function Hatches({ layout, xray, region, hover, onSelect, onHover, holdSel }: PartProps & { holdSel: string | null }) {
  const cover = useCanvasTexture(drawHatchCover, 512, 256)
  const op = xray ? 0.35 : 1
  return (
    <group>
      {layout.hatches.map((h, i) => {
        const isSel = holdSel === String(i + 1) && region === 'cargo'
        const isHover = hover === h.id
        const [cx, cy] = h.position
        const [len, ch, wid] = h.size
        const panelW = wid / 2 - 0.12
        return (
          <group key={h.id} onClick={(e) => { if (!tap(e)) return; onSelect(`hold-${i + 1}`) }} onPointerOver={(e) => { stop(e); onHover(h.id) }} onPointerOut={() => onHover(null)}>
            {/* coaming */}
            <mesh position={[cx, cy - 0.2, 0]} castShadow receiveShadow>
              <boxGeometry args={[len + 0.5, ch + 0.4, wid + 0.5]} />
              <meshStandardMaterial color={isSel ? YELLOW : isHover ? '#8a8b90' : '#5c5e64'} emissive={isSel ? YELLOW : '#000'} emissiveIntensity={isSel ? 0.25 : 0} roughness={0.7} metalness={0.3} transparent={xray} opacity={op} />
            </mesh>
            {/* two side-rolling panels */}
            {[1, -1].map((s) => (
              <mesh key={s} position={[cx, cy + ch / 2 + 0.3, s * (panelW / 2 + 0.1)]} castShadow receiveShadow>
                <boxGeometry args={[len + 0.9, 0.6, panelW]} />
                <meshStandardMaterial map={cover} color={isSel ? '#e0b431' : isHover ? '#c9c9cc' : '#ffffff'} roughness={0.62} metalness={0.32} transparent={xray} opacity={op} />
              </mesh>
            ))}
            {/* cleat rail along the coaming top */}
            <mesh position={[cx, cy + ch / 2 + 0.05, 0]}>
              <boxGeometry args={[len + 0.7, 0.12, wid + 0.7]} />
              <meshStandardMaterial color="#2a2b2f" roughness={0.6} metalness={0.4} transparent={xray} opacity={op} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

/** accommodation block, bridge with wings, monkey island and radar mast, funnel, free-fall lifeboat, provision crane */
export function Accommodation({ layout, vessel, xray, region, hover, onSelect, onHover, spin }: PartProps & { spin: boolean }) {
  const { accommodation: acc, bridge, funnel, lifeboat, crane } = layout
  const { D } = layout.params
  const [ax, ay] = acc.position
  const [al, ah, aw] = acc.size
  const sel = region === 'bridge'
  const op = xray ? 0.35 : 1
  const indian = isIndianFlag(vessel)
  const frontDraw = useMemo<Draw>(() => (ctx, W, H) => drawFacade(ctx, W, H, aw, ah, { door: true, density: 0.85 }), [aw, ah])
  const sideDraw = useMemo<Draw>(() => (ctx, W, H) => drawFacade(ctx, W, H, al, ah, { door: true, density: 0.8 }), [al, ah])
  const aftDraw = useMemo<Draw>(() => (ctx, W, H) => drawFacade(ctx, W, H, aw, ah, { density: 0.55 }), [aw, ah])
  const front = useCanvasTexture(frontDraw, Math.round(aw * 40), Math.round(ah * 40))
  const side = useCanvasTexture(sideDraw, Math.round(al * 40), Math.round(ah * 40))
  const aft = useCanvasTexture(aftDraw, Math.round(aw * 40), Math.round(ah * 40))
  const glassFront = useMemo<Draw>(() => (ctx, W, H) => drawBridgeGlass(ctx, W, H, bridge.size[2] * 0.66), [bridge.size])
  const glassSide = useMemo<Draw>(() => (ctx, W, H) => drawBridgeGlass(ctx, W, H, bridge.size[0], { glassFrac: 0.5 }), [bridge.size])
  const gF = useCanvasTexture(glassFront, 1024, 160)
  const gS = useCanvasTexture(glassSide, 640, 160)
  const funnelDraw = useMemo<Draw>(() => (ctx, W, H) => drawFunnel(ctx, W, H, indian), [indian])
  const funnelTex = useCanvasTexture(funnelDraw, 1024, 512)
  const radar = useRef<THREE.Group>(null)
  const radar2 = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (!spin) return
    if (radar.current) radar.current.rotation.y += dt * 1.6
    if (radar2.current) radar2.current.rotation.y -= dt * 1.1
  })
  const tint = sel ? YELLOW : hover === 'acc' ? '#f3eee0' : '#ffffff'
  const emissive = sel ? 0.28 : 0
  const bridgeW = bridge.size[2] * 0.66
  const bx = bridge.position[0]
  const by = bridge.position[1]
  const bh = bridge.size[1]
  const bl = bridge.size[0]
  return (
    <group onClick={(e) => { if (!tap(e)) return; onSelect('bridge') }} onPointerOver={(e) => { stop(e); onHover('acc') }} onPointerOut={() => onHover(null)}>
      {/* main block with facades on four faces */}
      <mesh position={[ax, ay, 0]} castShadow receiveShadow>
        <boxGeometry args={[al, ah, aw]} />
        {/* +x front, -x aft, +y, -y, +z side, -z side */}
        <meshStandardMaterial attach="material-0" map={front} color={tint} emissive={sel ? YELLOW : '#000'} emissiveIntensity={emissive} roughness={0.62} metalness={0.06} transparent={xray} opacity={op} />
        <meshStandardMaterial attach="material-1" map={aft} color={tint} emissive={sel ? YELLOW : '#000'} emissiveIntensity={emissive} roughness={0.62} metalness={0.06} transparent={xray} opacity={op} />
        <meshStandardMaterial attach="material-2" color={sel ? YELLOW : '#cfc9bb'} roughness={0.8} metalness={0.05} transparent={xray} opacity={op} />
        <meshStandardMaterial attach="material-3" color="#8a8680" transparent={xray} opacity={op} />
        <meshStandardMaterial attach="material-4" map={side} color={tint} emissive={sel ? YELLOW : '#000'} emissiveIntensity={emissive} roughness={0.62} metalness={0.06} transparent={xray} opacity={op} />
        <meshStandardMaterial attach="material-5" map={side} color={tint} emissive={sel ? YELLOW : '#000'} emissiveIntensity={emissive} roughness={0.62} metalness={0.06} transparent={xray} opacity={op} />
      </mesh>
      {/* external stair towers and deck overhang lines */}
      {[1, -1].map((s) => (
        <mesh key={s} position={[ax - al * 0.34, ay, s * (aw / 2 + 0.7)]} castShadow>
          <boxGeometry args={[3.2, ah - 2.4, 1.4]} />
          <meshStandardMaterial color={sel ? YELLOW : WHITE} roughness={0.7} transparent={xray} opacity={op} />
        </mesh>
      ))}
      {/* bridge wing deck, full beam */}
      <mesh position={[bx, by - bh / 2 + 0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[bl * 0.9, 0.3, bridge.size[2]]} />
        <meshStandardMaterial color={sel ? YELLOW : '#d8d2c4'} roughness={0.7} transparent={xray} opacity={op} />
      </mesh>
      {/* wing bulwarks */}
      {[1, -1].map((s) => (
        <mesh key={s} position={[bx, by - bh / 2 + 0.75, s * (bridge.size[2] / 2 - 0.15)]}>
          <boxGeometry args={[bl * 0.9, 1.1, 0.16]} />
          <meshStandardMaterial color={sel ? YELLOW : WHITE} roughness={0.7} transparent={xray} opacity={op} />
        </mesh>
      ))}
      {/* wheelhouse with wrap-around glass */}
      <mesh position={[bx, by + 0.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[bl, bh, bridgeW]} />
        <meshStandardMaterial attach="material-0" map={gF} color={tint} emissive={sel ? YELLOW : '#000'} emissiveIntensity={emissive} roughness={0.4} metalness={0.15} transparent={xray} opacity={op} />
        <meshStandardMaterial attach="material-1" map={gF} color={tint} roughness={0.55} metalness={0.1} transparent={xray} opacity={op} />
        <meshStandardMaterial attach="material-2" color={sel ? YELLOW : '#cfc9bb'} roughness={0.8} transparent={xray} opacity={op} />
        <meshStandardMaterial attach="material-3" color="#8a8680" transparent={xray} opacity={op} />
        <meshStandardMaterial attach="material-4" map={gS} color={tint} roughness={0.45} metalness={0.12} transparent={xray} opacity={op} />
        <meshStandardMaterial attach="material-5" map={gS} color={tint} roughness={0.45} metalness={0.12} transparent={xray} opacity={op} />
      </mesh>
      {/* monkey island: radar mast with two scanners, satcom domes, signal yard */}
      <group position={[bx - bl * 0.05, by + bh / 2 + 0.1, 0]}>
        <mesh position={[0, 4.5, 0]} castShadow>
          <cylinderGeometry args={[0.22, 0.42, 9, 10]} />
          <meshStandardMaterial color={STEEL} roughness={0.5} metalness={0.6} transparent={xray} opacity={op} />
        </mesh>
        <mesh position={[0, 5.2, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.1, 0.1, 7, 8]} />
          <meshStandardMaterial color={STEEL} roughness={0.5} metalness={0.6} transparent={xray} opacity={op} />
        </mesh>
        <group ref={radar} position={[0, 7.4, 0]}>
          <mesh castShadow>
            <boxGeometry args={[4.6, 0.32, 0.36]} />
            <meshStandardMaterial color="#d8d2c4" roughness={0.5} transparent={xray} opacity={op} />
          </mesh>
        </group>
        <group ref={radar2} position={[0, 9.2, 0]}>
          <mesh castShadow>
            <boxGeometry args={[3.2, 0.28, 0.3]} />
            <meshStandardMaterial color="#d8d2c4" roughness={0.5} transparent={xray} opacity={op} />
          </mesh>
        </group>
        {[[-bl * 0.28, 1.1, bridgeW * 0.3], [-bl * 0.28, 1.1, -bridgeW * 0.3]].map((pos, i) => (
          <mesh key={i} position={pos as [number, number, number]} castShadow>
            <sphereGeometry args={[0.9, 20, 14]} />
            <meshStandardMaterial color="#f0ebdf" roughness={0.45} transparent={xray} opacity={op} />
          </mesh>
        ))}
        {/* mast head and steaming lights */}
        <mesh position={[0, 9.6, 0]}>
          <sphereGeometry args={[0.22, 10, 8]} />
          <meshStandardMaterial color="#ffffff" emissive="#fff6e0" emissiveIntensity={1.6} />
        </mesh>
      </group>
      {/* funnel: raked casing with the line's band and mark, twin uptakes */}
      <group position={[funnel.position[0], funnel.position[1], 0]} rotation={[0, 0, 0.1]}>
        <mesh position={[0, funnel.height / 2, 0]} scale={[1.9, 1, 1]} castShadow>
          <cylinderGeometry args={[funnel.radius * 0.94, funnel.radius, funnel.height, 40, 1]} />
          <meshStandardMaterial map={funnelTex} roughness={0.5} metalness={0.25} transparent={xray} opacity={op} />
        </mesh>
        <mesh position={[0, funnel.height + 0.15, 0]} scale={[1.9, 1, 1]}>
          <cylinderGeometry args={[funnel.radius * 0.96, funnel.radius * 0.96, 0.3, 40]} />
          <meshStandardMaterial color="#0b0b0c" roughness={0.6} transparent={xray} opacity={op} />
        </mesh>
        {[[-1.2, 1.1], [1.4, 0.55], [0.1, 0.4]].map(([dx, r], i) => (
          <mesh key={i} position={[dx, funnel.height + 1.2, i === 2 ? 1.1 : 0]}>
            <cylinderGeometry args={[r, r, 2.4, 16]} />
            <meshStandardMaterial color="#111214" roughness={0.6} metalness={0.4} transparent={xray} opacity={op} />
          </mesh>
        ))}
      </group>
      {/* free-fall lifeboat on its ramp, over the stern */}
      <group position={lifeboat.position} rotation={[0, 0, lifeboat.angle]}>
        <mesh position={[-lifeboat.length * 0.1, 0.9, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <capsuleGeometry args={[1.35, lifeboat.length - 2.7, 6, 14]} />
          <meshStandardMaterial color={YELLOW} roughness={0.5} metalness={0.05} transparent={xray} opacity={op} />
        </mesh>
        <mesh position={[-lifeboat.length * 0.1, 1.9, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 0.8]}>
          <capsuleGeometry args={[0.9, lifeboat.length * 0.42, 4, 12]} />
          <meshStandardMaterial color="#151517" roughness={0.35} metalness={0.2} transparent={xray} opacity={op} />
        </mesh>
        {[1, -1].map((s) => (
          <mesh key={s} position={[0, -0.6, s * 1.35]}>
            <boxGeometry args={[lifeboat.length + 3, 0.35, 0.3]} />
            <meshStandardMaterial color={STEEL} roughness={0.55} metalness={0.5} transparent={xray} opacity={op} />
          </mesh>
        ))}
      </group>
      <mesh position={[lifeboat.position[0] + 2.5, D + 3.6, 0]}>
        <boxGeometry args={[1.2, 7.2, 4]} />
        <meshStandardMaterial color={WHITE} roughness={0.7} transparent={xray} opacity={op} />
      </mesh>
      {/* provision crane on the poop deck */}
      <group position={crane.position}>
        <mesh position={[0, crane.height / 2, 0]} castShadow>
          <cylinderGeometry args={[0.5, 0.65, crane.height, 12]} />
          <meshStandardMaterial color={WHITE} roughness={0.6} transparent={xray} opacity={op} />
        </mesh>
        <mesh position={[crane.reach * 0.38, crane.height + 1.6, 0]} rotation={[0, 0, -0.45]} castShadow>
          <boxGeometry args={[crane.reach, 0.7, 0.6]} />
          <meshStandardMaterial color={YELLOW} roughness={0.55} transparent={xray} opacity={op} />
        </mesh>
      </group>
    </group>
  )
}

/** forecastle: raised deck with a bulwark, windlass, foremast with yard and lights, anchors at the hawse pipes */
export function Forecastle({ layout, xray, region, onSelect, onHover }: PartProps) {
  const { forecastle: fc, masts, anchors } = layout
  const sel = region === 'bow'
  const op = xray ? 0.35 : 1
  const [fx, fy] = fc.position
  const [fl, fh, fw] = fc.size
  const mast = masts[0]
  return (
    <group onClick={(e) => { if (!tap(e)) return; onSelect('bow') }} onPointerOver={(e) => { stop(e); onHover('fc') }} onPointerOut={() => onHover(null)}>
      <mesh position={[fx, fy, 0]} castShadow receiveShadow>
        <boxGeometry args={[fl, fh, fw]} />
        <meshStandardMaterial color={sel ? YELLOW : '#8d8f95'} emissive={sel ? YELLOW : '#000'} emissiveIntensity={sel ? 0.25 : 0} roughness={0.7} metalness={0.25} transparent={xray} opacity={op} />
      </mesh>
      {/* bulwark plating around the forecastle */}
      {[1, -1].map((s) => (
        <mesh key={s} position={[fx, fy + fh / 2 + 0.6, s * (fw / 2 + 0.05)]}>
          <boxGeometry args={[fl, 1.2, 0.14]} />
          <meshStandardMaterial color={sel ? YELLOW : '#a4a6ab'} roughness={0.7} transparent={xray} opacity={op} />
        </mesh>
      ))}
      {/* windlass: two chain drums and a gypsy on a bedplate */}
      <mesh position={[fx - fl * 0.12, fy + fh / 2 + 0.35, 0]}>
        <boxGeometry args={[3.6, 0.7, fw * 0.55]} />
        <meshStandardMaterial color={STEEL} roughness={0.55} metalness={0.5} transparent={xray} opacity={op} />
      </mesh>
      {[1, -1].map((s) => (
        <mesh key={s} position={[fx - fl * 0.12, fy + fh / 2 + 1.3, s * fw * 0.2]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[1.0, 1.0, 1.4, 16]} />
          <meshStandardMaterial color="#2a2b2f" roughness={0.5} metalness={0.6} transparent={xray} opacity={op} />
        </mesh>
      ))}
      {/* anchor chains from the windlass to the hawse pipes */}
      {[1, -1].map((s) => (
        <mesh key={s} position={[fx + fl * 0.14, fy + fh / 2 + 0.45, s * fw * 0.36]} rotation={[0, s * 0.35, 0]}>
          <boxGeometry args={[fl * 0.5, 0.28, 0.28]} />
          <meshStandardMaterial color="#1e1f22" roughness={0.6} metalness={0.5} transparent={xray} opacity={op} />
        </mesh>
      ))}
      {/* foremast with yard, steaming light and a whistle platform */}
      <mesh position={[mast.position[0], mast.position[1] + mast.height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.5, mast.height, 10]} />
        <meshStandardMaterial color={STEEL} roughness={0.5} metalness={0.6} transparent={xray} opacity={op} />
      </mesh>
      <mesh position={[mast.position[0], mast.position[1] + mast.height * 0.72, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 6, 8]} />
        <meshStandardMaterial color={STEEL} roughness={0.5} metalness={0.6} transparent={xray} opacity={op} />
      </mesh>
      <mesh position={[mast.position[0], mast.position[1] + mast.height + 0.2, 0]}>
        <sphereGeometry args={[0.24, 10, 8]} />
        <meshStandardMaterial color="#ffffff" emissive="#fff6e0" emissiveIntensity={1.6} />
      </mesh>
      {/* stockless anchors seated at the hawse pipes */}
      {anchors.map((a, i) => (
        <group key={i} position={[a.position[0], a.position[1] - 1.1, a.position[2] + a.side * 0.35]}>
          <mesh rotation={[0, 0, 0.12]}>
            <cylinderGeometry args={[0.24, 0.24, 3.4, 8]} />
            <meshStandardMaterial color="#232428" roughness={0.6} metalness={0.5} transparent={xray} opacity={op} />
          </mesh>
          <mesh position={[0, -1.6, 0]}>
            <boxGeometry args={[2.6, 0.7, 0.8]} />
            <meshStandardMaterial color="#232428" roughness={0.6} metalness={0.5} transparent={xray} opacity={op} />
          </mesh>
          {[1, -1].map((s) => (
            <mesh key={s} position={[s * 1.1, -0.9, 0.2 * a.side]} rotation={[0, 0, s * 0.5]}>
              <boxGeometry args={[0.5, 1.6, 0.5]} />
              <meshStandardMaterial color="#232428" roughness={0.6} metalness={0.5} transparent={xray} opacity={op} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

/** propeller, semi-spade rudder with its horn, stern staff and ensign */
export function Stern({ layout, vessel, xray, region, hover, onSelect, onHover }: PartProps) {
  const { propeller, rudder, flagstaff } = layout
  const sel = region === 'propulsion'
  const hot = sel || hover === 'prop'
  const uw = xray ? 0.4 : 1
  const R = propeller.diameter / 2
  const blade = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(-0.14 * R, 0.12 * R)
    s.bezierCurveTo(-0.34 * R, 0.4 * R, -0.3 * R, 0.78 * R, -0.02 * R, R)
    s.bezierCurveTo(0.2 * R, 0.9 * R, 0.34 * R, 0.6 * R, 0.2 * R, 0.16 * R)
    s.lineTo(0.14 * R, 0.1 * R)
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.14 * R, bevelEnabled: true, bevelThickness: 0.03 * R, bevelSize: 0.03 * R, bevelSegments: 2, curveSegments: 12 })
    g.translate(0, 0, -0.07 * R)
    return g
  }, [R])
  const rudderGeo = useMemo(() => {
    const [w, h] = [rudder.size[0], rudder.size[1]]
    const s = new THREE.Shape()
    s.moveTo(-w * 0.5, h * 0.5)
    s.lineTo(w * 0.55, h * 0.5)
    s.lineTo(w * 0.45, -h * 0.5)
    s.lineTo(-w * 0.3, -h * 0.5)
    s.bezierCurveTo(-w * 0.62, -h * 0.3, -w * 0.62, h * 0.3, -w * 0.5, h * 0.5)
    const g = new THREE.ExtrudeGeometry(s, { depth: rudder.size[2], bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.25, bevelSegments: 2 })
    g.translate(0, 0, -rudder.size[2] / 2)
    return g
  }, [rudder.size])
  const flagDraw = useMemo<Draw>(() => (ctx, W, H) => drawFlag(ctx, W, H, isIndianFlag(vessel)), [vessel])
  const flag = useCanvasTexture(flagDraw, 600, 400)
  const flagGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(4.5, 3, 18, 6)
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      pos.setZ(i, Math.sin((x + 2.25) * 1.6) * 0.22 * ((x + 2.25) / 4.5))
    }
    g.computeVertexNormals()
    return g
  }, [])
  useDispose(blade, rudderGeo, flagGeo)
  const bronze = hot ? YELLOW : '#a0865a'
  return (
    <group>
      <group position={propeller.position} onClick={(e) => { if (!tap(e)) return; onSelect('propulsion') }} onPointerOver={(e) => { stop(e); onHover('prop') }} onPointerOut={() => onHover(null)}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.16 * R, 0.2 * R, 0.5 * R, 20]} />
          <meshStandardMaterial color={bronze} emissive={hot ? YELLOW : '#000'} emissiveIntensity={hot ? 0.35 : 0} metalness={0.85} roughness={0.32} transparent={xray} opacity={uw} />
        </mesh>
        <mesh position={[-0.3 * R, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[0.16 * R, 0.24 * R, 20]} />
          <meshStandardMaterial color={bronze} metalness={0.85} roughness={0.32} transparent={xray} opacity={uw} />
        </mesh>
        {[0, 1, 2, 3].map((k) => (
          <group key={k} rotation={[(k * Math.PI) / 2 + 0.3, 0, 0]}>
            <mesh geometry={blade} rotation={[0, Math.PI / 2 - 0.5, 0]} castShadow>
              <meshStandardMaterial color={bronze} emissive={hot ? YELLOW : '#000'} emissiveIntensity={hot ? 0.35 : 0} metalness={0.85} roughness={0.3} transparent={xray} opacity={uw} />
            </mesh>
          </group>
        ))}
      </group>
      {/* rudder horn and blade */}
      <mesh position={[rudder.position[0] + rudder.size[0] * 0.1, rudder.position[1] + rudder.size[1] * 0.45, 0]} onClick={(e) => { if (!tap(e)) return; onSelect('propulsion') }}>
        <boxGeometry args={[rudder.size[0] * 0.7, rudder.size[1] * 0.55, rudder.size[2] * 1.6]} />
        <meshStandardMaterial color={sel ? YELLOW : '#7a3325'} roughness={0.75} metalness={0.1} transparent={xray} opacity={uw} />
      </mesh>
      <mesh geometry={rudderGeo} position={rudder.position} onClick={(e) => { if (!tap(e)) return; onSelect('propulsion') }} castShadow>
        <meshStandardMaterial color={sel ? YELLOW : '#8f3d2c'} emissive={sel ? YELLOW : '#000'} emissiveIntensity={sel ? 0.3 : 0} roughness={0.7} metalness={0.15} transparent={xray} opacity={uw} />
      </mesh>
      {/* stern staff and ensign */}
      <group position={[flagstaff[0] + 0.6, flagstaff[1], 0]}>
        <mesh position={[0, 3.5, 0]}>
          <cylinderGeometry args={[0.08, 0.14, 7, 8]} />
          <meshStandardMaterial color={STEEL} roughness={0.5} metalness={0.6} transparent={xray} opacity={uw} />
        </mesh>
        <mesh geometry={flagGeo} position={[-2.35, 5.4, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
          <meshStandardMaterial map={flag} side={THREE.DoubleSide} roughness={0.85} transparent={xray} opacity={uw} />
        </mesh>
      </group>
    </group>
  )
}

/** railings, bollards, ventilators and a mooring winch aft */
export function DeckFittings({ layout, xray }: Pick<PartProps, 'layout' | 'xray'>) {
  const p = layout.params
  const { L, B } = p
  const rails = useMemo(() => {
    const pts: number[] = []
    const push = (a: [number, number, number], b: [number, number, number]) => pts.push(...a, ...b)
    const runs: [number, number][] = [
      [0.005, 0.048],
      [0.145, 0.918],
    ]
    for (const [t0, t1] of runs) {
      for (const side of [1, -1]) {
        let prev: [number, number, number] | null = null
        let prevMid: [number, number, number] | null = null
        const n = Math.max(2, Math.round(((t1 - t0) * L) / 3))
        for (let i = 0; i <= n; i++) {
          const t = t0 + ((t1 - t0) * i) / n
          const [x, y, hb] = hullPoint(p, t, 1)
          const z = side * (hb - 0.35)
          const top: [number, number, number] = [x, y + 1.15, z]
          const mid: [number, number, number] = [x, y + 0.6, z]
          push([x, y, z], top)
          if (prev && prevMid) {
            push(prev, top)
            push(prevMid, mid)
          }
          prev = top
          prevMid = mid
        }
      }
    }
    // stern rail across the transom
    const [sx, sy, shb] = hullPoint(p, 0.004, 1)
    push([sx, sy + 1.15, -shb + 0.4], [sx, sy + 1.15, shb - 0.4])
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [p, L])
  useDispose(rails)
  const op = xray ? 0.3 : 0.85
  const fit = xray ? 0.35 : 1
  return (
    <group>
      <lineSegments geometry={rails}>
        <lineBasicMaterial color="#a19c92" transparent opacity={op} />
      </lineSegments>
      {layout.bollards.map((b, i) => (
        <group key={i} position={b}>
          <mesh position={[0, 0.15, 0]}>
            <boxGeometry args={[2.6, 0.3, 1.2]} />
            <meshStandardMaterial color="#26272b" roughness={0.6} metalness={0.5} transparent={xray} opacity={fit} />
          </mesh>
          {[-0.8, 0.8].map((dx) => (
            <mesh key={dx} position={[dx, 0.85, 0]} castShadow>
              <cylinderGeometry args={[0.36, 0.3, 1.4, 12]} />
              <meshStandardMaterial color="#26272b" roughness={0.55} metalness={0.55} transparent={xray} opacity={fit} />
            </mesh>
          ))}
        </group>
      ))}
      {layout.vents.map((v, i) => (
        <group key={i} position={v}>
          <mesh position={[0, 1.0, 0]} castShadow>
            <cylinderGeometry args={[0.45, 0.5, 2, 12]} />
            <meshStandardMaterial color="#d3cdbf" roughness={0.65} transparent={xray} opacity={fit} />
          </mesh>
          <mesh position={[0, 2.15, 0]}>
            <cylinderGeometry args={[0.9, 0.7, 0.5, 12]} />
            <meshStandardMaterial color="#d3cdbf" roughness={0.65} transparent={xray} opacity={fit} />
          </mesh>
        </group>
      ))}
      {/* walkway strips outboard of the hatches */}
      {[1, -1].map((s) => (
        <mesh key={s} position={[0.05 * L, deckY(p, 0.5) + 0.06, s * (B * 0.5 - 2.6)]} receiveShadow>
          <boxGeometry args={[0.74 * L, 0.06, 1.6]} />
          <meshStandardMaterial color="#4a5a50" roughness={0.9} transparent={xray} opacity={fit} />
        </mesh>
      ))}
    </group>
  )
}

/** hopper-shaped hold and tank volumes for the x-ray view, with the ore stow drawn to the mission fill */
function sectionGeometry(section: [number, number][], length: number): THREE.BufferGeometry {
  const s = new THREE.Shape()
  section.forEach(([z, y], i) => (i === 0 ? s.moveTo(z, y) : s.lineTo(z, y)))
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false })
  g.rotateY(Math.PI / 2)
  g.translate(-length / 2, 0, 0)
  return g
}

export function RegionVolume({ box, section, color, visible, selected, hovered, onSelect, onHover, alwaysClickable, fill }: { box: Box; section?: [number, number][]; color: string; visible: boolean; selected: boolean; hovered: boolean; onSelect: (id: string) => void; onHover: (id: string | null) => void; alwaysClickable: boolean; fill?: number }) {
  const show = visible || selected || hovered
  const geo = useMemo(() => {
    if (section) return sectionGeometry(section, box.size[0])
    return new THREE.BoxGeometry(...box.size)
  }, [section, box.size])
  useDispose(geo)
  const pos: [number, number, number] = section ? [box.position[0], 0, 0] : box.position
  const tint = selected || hovered ? color : '#9a958c'
  return (
    <group>
      <mesh
        geometry={geo}
        position={pos}
        visible={show || alwaysClickable}
        raycast={alwaysClickable || show ? undefined : noRaycast}
        onClick={(e) => {
          if (!tap(e)) return
          onSelect(box.id)
        }}
        onPointerOver={(e) => {
          stop(e)
          onHover(box.id)
        }}
        onPointerOut={() => onHover(null)}
      >
        <meshStandardMaterial color={tint} transparent opacity={show ? (selected ? 0.42 : hovered ? 0.32 : 0.1) : 0} depthWrite={false} roughness={0.5} metalness={0.1} emissive={selected ? color : '#000'} emissiveIntensity={selected ? 0.3 : 0} />
        {show && <Edges color={selected || hovered ? color : '#6a665f'} threshold={20} />}
      </mesh>
      {show && fill !== undefined && fill > 0 && section && (
        <OreStow box={box} section={section} fill={fill} />
      )}
    </group>
  )
}

function OreStow({ box, section, fill }: { box: Box; section: [number, number][]; fill: number }) {
  const ys = section.map(([, y]) => y)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  const h = (y1 - y0) * Math.min(1, fill) * 0.92
  const width = Math.max(...section.map(([z]) => z)) * 2 * 0.86
  const len = box.size[0] * 0.94
  return (
    <group position={[box.position[0], y0, 0]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[len, h, width]} />
        <meshStandardMaterial color="#5a2d22" roughness={0.95} metalness={0} />
      </mesh>
      <mesh position={[0, h, 0]} rotation={[0, 0, 0]} scale={[len / 2, h * 0.45 + 0.6, width / 2]}>
        <coneGeometry args={[1, 1, 4, 1]} />
        <meshStandardMaterial color="#6a3527" roughness={0.95} metalness={0} />
      </mesh>
    </group>
  )
}

/** dimension callouts drawn on the water plane */
export function Callouts({ L, B }: { L: number; B: number }) {
  const z = B * 0.5 + 6
  const bx = L / 2 + 8
  return (
    <group>
      <Line points={[[-L / 2, 0.15, z], [L / 2, 0.15, z]]} color="#6b675f" lineWidth={1} />
      <Line points={[[-L / 2, 0.15, z - 1.5], [-L / 2, 0.15, z + 1.5]]} color="#6b675f" lineWidth={1} />
      <Line points={[[L / 2, 0.15, z - 1.5], [L / 2, 0.15, z + 1.5]]} color="#6b675f" lineWidth={1} />
      <Line points={[[bx, 0.15, -B / 2], [bx, 0.15, B / 2]]} color="#6b675f" lineWidth={1} />
      <Line points={[[bx - 1.5, 0.15, -B / 2], [bx + 1.5, 0.15, -B / 2]]} color="#6b675f" lineWidth={1} />
      <Line points={[[bx - 1.5, 0.15, B / 2], [bx + 1.5, 0.15, B / 2]]} color="#6b675f" lineWidth={1} />
    </group>
  )
}

