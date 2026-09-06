import { Canvas, useThree } from '@react-three/fiber'
import { Environment, Html, Lightformer, MeshReflectorMaterial, OrbitControls } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../app/store'
import * as THREE from 'three'
import type { Vessel } from '../../engine/types'
import { buildHullGeometry, layoutFor, waterlineOutline } from './hull'
import { REGION_META, regionOf, type RegionId } from './regions'
import { Accommodation, Callouts, DeckFittings, Forecastle, Hatches, HullBody, RegionVolume, Stern } from './parts'
import { drawNoise } from './textures'
import { useCanvasTexture } from './useCanvasTexture'

interface Props {
  vessel: Vessel
  selected: string | null
  onSelect: (id: string | null) => void
  xray: boolean
  autoRotate: boolean
  sailingDraftM: number
  reducedMotion: boolean
  /** fraction of grain capacity taken by the mission cargo, drawn as the ore stow in x-ray */
  cargoFill?: number
}

const PLATE = '#0f0f10'

function Ship({ vessel, selected, onSelect, xray, sailingDraftM, spin, cargoFill }: Omit<Props, 'autoRotate' | 'reducedMotion'> & { spin: boolean }) {
  const layout = useMemo(() => layoutFor(vessel), [vessel])
  const hull = useMemo(() => buildHullGeometry(layout.params), [layout])
  useEffect(() => () => hull.dispose(), [hull])
  const [hover, setHover] = useState<string | null>(null)
  const { L, B, D, T } = layout.params
  const region = regionOf(selected)
  const holdSel = selected && (selected.startsWith('hold-') || selected.startsWith('hatch-')) ? selected.split('-')[1] : null
  const part = { layout, vessel, xray, region, hover, onSelect, onHover: setHover }
  const waterline = useMemo(() => {
    const pts = waterlineOutline(layout.params, sailingDraftM)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap(([x, z]) => [x, 0.06, z]), 3))
    return g
  }, [layout, sailingDraftM])
  useEffect(() => () => waterline.dispose(), [waterline])
  const sectionFor = (shape?: string) => (shape === 'hold' ? layout.holdSection : shape === 'topside' ? layout.topsideSection : shape === 'hopper' ? layout.hopperSection : undefined)
  return (
    <group position={[0, -sailingDraftM, 0]}>
      <HullBody {...part} geometry={hull} />
      <Hatches {...part} holdSel={holdSel} />
      <Accommodation {...part} spin={spin} />
      <Forecastle {...part} />
      <Stern {...part} />
      <DeckFittings layout={layout} xray={xray} />
      {/* internal volumes */}
      {layout.regions.map((r) => (
        <RegionVolume
          key={r.id}
          box={r}
          section={sectionFor(r.shape)?.map(([z, y]) => (r.position[2] < 0 ? [-z, y] : [z, y]) as [number, number])}
          color={REGION_META[r.region as RegionId].color}
          visible={xray}
          selected={region === r.region && !holdSel}
          hovered={hover === r.id}
          onSelect={(id) => onSelect(layout.regions.find((b) => b.id === id)?.region ?? id)}
          onHover={setHover}
          alwaysClickable={xray}
        />
      ))}
      {layout.holds.map((h, i) => (
        <RegionVolume key={h.id} box={h} section={layout.holdSection} color="#f2c230" visible={xray} selected={holdSel === String(i + 1) || (region === 'cargo' && !holdSel)} hovered={hover === h.id} onSelect={onSelect} onHover={setHover} alwaysClickable={xray} fill={cargoFill} />
      ))}
      {/* callouts */}
      <group position={[0, sailingDraftM, 0]}>
        <lineLoop geometry={waterline} renderOrder={12}>
          <lineBasicMaterial color="#d9d3c4" transparent opacity={xray ? 0.25 : 0.55} depthWrite={false} />
        </lineLoop>
        <Callouts L={L} B={B} />
        <Html position={[0, 0.2, B * 0.5 + 6]} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
          <div className="chart-label">LOA {L} m</div>
        </Html>
        <Html position={[L / 2 + 8, 0.2, 0]} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
          <div className="chart-label">beam {B} m</div>
        </Html>
        <Html position={[-L / 2 - 10, 0.2, B * 0.5 + 6]} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
          <div className="chart-label">sailing draught {sailingDraftM.toFixed(2)} m, design {T} m</div>
        </Html>
      </group>
      {selected && (
        <Html position={selectedAnchor(layout, selected, D)} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
          <div className="chart-label" style={{ color: REGION_META[region ?? 'bow'].color, borderColor: REGION_META[region ?? 'bow'].color }}>{selectedLabel(layout, selected)}</div>
        </Html>
      )}
    </group>
  )
}

function selectedAnchor(layout: ReturnType<typeof layoutFor>, sel: string, D: number): [number, number, number] {
  if (sel.startsWith('hold-')) {
    const h = layout.holds[Number(sel.split('-')[1]) - 1]
    if (h) return [h.position[0], D + 9, 0]
  }
  const r = layout.regions.find((b) => b.region === sel)
  if (r) return [r.position[0], D + 9, 0]
  if (sel === 'bridge') return [layout.bridge.position[0], layout.bridge.position[1] + 14, 0]
  if (sel === 'propulsion') return [layout.propeller.position[0], layout.propeller.position[1] + 12, 0]
  return [0, D + 9, 0]
}

function selectedLabel(layout: ReturnType<typeof layoutFor>, sel: string): string {
  if (sel.startsWith('hold-')) return layout.holds[Number(sel.split('-')[1]) - 1]?.label ?? sel
  return REGION_META[(regionOf(sel) ?? 'bow') as RegionId].label
}

/** the sea: a dark reflective plane that fades into the plate, with a faint chart grid beneath it */
function Sea({ L, xray }: { L: number; xray: boolean }) {
  const noise = useCanvasTexture(drawNoise, 256, 256, { wrap: true, srgb: false })
  const ref = useRef<THREE.MeshStandardMaterial>(null)
  // the water shows only the planar reflection: no direct or environment specular sheen
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const prev = m.onBeforeCompile
    m.onBeforeCompile = (shader, renderer) => {
      prev.call(m, shader, renderer)
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.specularColor = vec3(0.012, 0.017, 0.024);\nmaterial.specularF90 = 0.3;')
    }
    m.customProgramCacheKey = () => 'aegis-sea-v3'
    m.needsUpdate = true
  }, [])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} renderOrder={10}>
        <planeGeometry args={[L * 9, L * 9]} />
        <MeshReflectorMaterial
          ref={ref as never}
          resolution={1024}
          blur={[420, 140]}
          mixBlur={0.9}
          mixStrength={1.25}
          mixContrast={1.08}
          mirror={1}
          depthScale={1.1}
          minDepthThreshold={0.9}
          maxDepthThreshold={1.8}
          distortion={0.2}
          distortionMap={noise}
          color="#66737f"
          metalness={0}
          roughness={1}
          envMapIntensity={0}
          transparent
          opacity={xray ? 0.42 : 0.72}
          depthWrite={false}
        />
      </mesh>
      <ChartGrid L={L} />
    </group>
  )
}

/** faint chart graticule on the water: 50 m sections and 10 m cells, fading into the plate */
function ChartGrid({ L }: { L: number }) {
  const [cells, sections] = useMemo(() => {
    const half = Math.ceil((L * 1.6) / 50) * 50
    const build = (step: number, skip: number) => {
      const pts: number[] = []
      for (let v = -half; v <= half; v += step) {
        if (skip && v % skip === 0) continue
        pts.push(-half, 0, v, half, 0, v, v, 0, -half, v, 0, half)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
      return g
    }
    return [build(10, 50), build(50, 0)]
  }, [L])
  useEffect(() => () => { cells.dispose(); sections.dispose() }, [cells, sections])
  return (
    <group position={[0, 0.08, 0]} renderOrder={11}>
      <lineSegments geometry={cells}>
        <lineBasicMaterial color="#f5efdd" transparent opacity={0.025} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={sections}>
        <lineBasicMaterial color="#f5efdd" transparent opacity={0.07} depthWrite={false} />
      </lineSegments>
    </group>
  )
}

/** studio-style lighting built from light panels; no image assets */
function Lighting({ L }: { L: number }) {
  return (
    <>
      <Environment resolution={256} frames={1} environmentIntensity={1.15}>
        <Lightformer form="rect" intensity={2.4} color="#fff4e2" position={[0, L * 0.9, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[L * 2.2, L * 1.2, 1]} />
        <Lightformer form="rect" intensity={2.2} color="#c8d3e8" position={[-L * 0.9, L * 0.3, -L * 0.9]} target={[0, 0, 0]} scale={[L * 1.8, L * 0.6, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#ffe6c2" position={[L * 1.1, L * 0.22, L * 0.8]} target={[0, 0, 0]} scale={[L * 1.4, L * 0.5, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#dfe6f2" position={[0, L * 0.2, L * 1.2]} target={[0, 0, 0]} scale={[L * 2, L * 0.4, 1]} />
        <Lightformer form="ring" intensity={0.8} color="#ffffff" position={[L * 0.3, L * 0.6, -L * 0.5]} target={[0, 0, 0]} scale={[L * 0.5, L * 0.5, 1]} />
      </Environment>
      <hemisphereLight args={['#e8e2d3', '#0f0f10', 0.5]} />
      <directionalLight
        position={[L * 0.55, L * 0.7, L * 0.4]}
        intensity={2.3}
        color="#fff1da"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00035}
        shadow-normalBias={0.8}
        shadow-camera-near={1}
        shadow-camera-far={L * 3}
        shadow-camera-left={-L * 0.7}
        shadow-camera-right={L * 0.7}
        shadow-camera-top={L * 0.7}
        shadow-camera-bottom={-L * 0.7}
      />
      <directionalLight position={[-L * 0.8, L * 0.25, -L * 0.7]} intensity={0.7} color="#b9c6de" />
      <directionalLight position={[L * 0.6, L * 0.15, L * 1.0]} intensity={0.45} color="#e6e0d2" />
    </>
  )
}

/** frame the hull from the starboard bow quarter at a distance that fits the current viewport */
function heroDistance(L: number, aspect: number, fovDeg = 30): number {
  const hfov = 2 * Math.atan(Math.tan((fovDeg * Math.PI) / 360) * aspect)
  const fit = (0.5 * L) / Math.tan(hfov / 2)
  return Math.min(1.9 * L, Math.max(1.2 * L, fit * 1.04))
}

function CameraRig({ L }: { L: number }) {
  const camera = useThree((s) => s.camera)
  const get = useThree((s) => s.get)
  useEffect(() => {
    // the aspect is read once per hull so that opening the panel does not move the camera
    const d = heroDistance(L, get().viewport.aspect)
    const dir = new THREE.Vector3(0.66, 0.19, 0.73).normalize()
    camera.position.copy(dir.multiplyScalar(d))
    camera.lookAt(0, 2, 0)
    camera.updateProjectionMatrix()
  }, [camera, get, L])
  return null
}

export default function VesselViewer(p: Props) {
  const L = p.vessel.loaM
  const visible = useStore((s) => s.ui.visibleRoute === '/fleet')
  const [ready, setReady] = useState(false)
  const spin = p.autoRotate && !p.reducedMotion

  return (
    <>
      {!ready && (
        <div className="canvas-loading" role="status">
          Rendering hull…
        </div>
      )}
      <Canvas
        onCreated={() => setReady(true)}
        dpr={[1, 2]}
        shadows={{ type: THREE.PCFShadowMap }}
        camera={{ fov: 30, near: 1, far: L * 14, position: [L * 0.84, L * 0.24, L * 0.94] }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        frameloop={p.reducedMotion || !visible ? 'demand' : 'always'}
        style={{ background: PLATE }}
        role="img"
        aria-label={`Procedural 3D model of ${p.vessel.name}; click hatches, accommodation, propeller or internal volumes to inspect`}
        onPointerMissed={() => p.onSelect(null)}
      >
        <color attach="background" args={[PLATE]} />
        <fog attach="fog" args={[PLATE, L * 0.9, L * 2.8]} />
        <Lighting L={L} />
        <CameraRig L={L} />
        <Ship vessel={p.vessel} selected={p.selected} onSelect={p.onSelect} xray={p.xray} sailingDraftM={p.sailingDraftM} spin={spin} cargoFill={p.cargoFill} />
        <Sea L={L} xray={p.xray} />
        <OrbitControls target={[0, 2, 0]} enablePan={false} minDistance={L * 0.28} maxDistance={L * 2.4} autoRotate={spin} autoRotateSpeed={0.45} enableDamping dampingFactor={0.07} maxPolarAngle={Math.PI * 0.49} minPolarAngle={Math.PI * 0.08} makeDefault />
      </Canvas>
    </>
  )
}
