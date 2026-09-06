import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { StackSimple } from '@phosphor-icons/react'
import { useStore, type LayerId } from '../../app/store'
import { Check, Segmented } from '../ui/primitives'
import { CHART_EASE, THEMES, type ChartMode, type ChartTheme } from '../chart/theme'

/**
 * Legend samples read the active chart theme so the drawer always matches the plate. Each sample
 * sits on a chip of the mode's water colour: in the light chart the inks are black and would
 * vanish on the black drawer, so the chip shows the mark as it appears on the chart itself.
 */
type Sample = { color: (t: ChartTheme) => string; kind?: 'line' | 'dashed' | 'ring' | 'dot' | 'hatch' | 'fill' }
type Item = { id: LayerId; label: string; sample?: Sample }
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Routes',
    items: [
      { id: 'baseline', label: 'Baseline (design speed)', sample: { color: (t) => t.ink2, kind: 'dashed' } },
      { id: 'classical', label: 'Classical A* + constant speed', sample: { color: (t) => t.ink2 } },
      { id: 'pareto', label: 'Pareto alternatives', sample: { color: (t) => t.ink3 } },
      { id: 'corridors', label: 'A* candidate corridors', sample: { color: (t) => t.ink3, kind: 'dashed' } },
    ],
  },
  {
    title: 'Zones',
    items: [
      { id: 'zones', label: 'Restricted areas and TSS (red when breached)', sample: { color: (t) => t.regulatory, kind: 'hatch' } },
      { id: 'shallow', label: 'Shallow water', sample: { color: (t) => t.shallow, kind: 'fill' } },
      { id: 'eca', label: 'Emission-control overlay', sample: { color: (t) => t.regulatory, kind: 'dashed' } },
    ],
  },
  {
    title: 'Ocean',
    items: [
      { id: 'wind', label: 'Wind field', sample: { color: (t) => t.field } },
      { id: 'current', label: 'Surface current', sample: { color: (t) => t.fieldStrong } },
      { id: 'waves', label: 'Sea state (Hs)', sample: { color: (t) => t.field, kind: 'ring' } },
      { id: 'storm', label: 'Storm system', sample: { color: (t) => t.alarm, kind: 'ring' } },
    ],
  },
  {
    title: 'Marks',
    items: [
      { id: 'fleet', label: 'Other fleet units', sample: { color: (t) => t.fleet, kind: 'ring' } },
      { id: 'labels', label: 'Labels' },
    ],
  },
]

function Swatch({ s, t }: { s?: Sample; t: ChartTheme }) {
  if (!s) return <i className="legend-swatch legend-swatch--blank" aria-hidden="true" />
  const color = s.color(t)
  const kind = s.kind ?? 'line'
  return (
    <i className="legend-swatch" style={{ background: t.water }} aria-hidden="true">
      {kind === 'ring' ? (
        <span className="legend-swatch__ring" style={{ borderColor: color }} />
      ) : kind === 'hatch' ? (
        // the chart's restricted-area hatch: 1px diagonal lines on the mode's water, outlined
        <span
          className="legend-swatch__fill"
          style={{
            width: 18,
            height: 10,
            display: 'block',
            boxSizing: 'border-box',
            border: `1px solid ${color}`,
            backgroundImage: `repeating-linear-gradient(45deg, ${color} 0 1px, transparent 1px 4px)`,
            opacity: 0.9,
          }}
        />
      ) : kind === 'fill' ? (
        <span className="legend-swatch__fill" style={{ width: 18, height: 10, display: 'block', background: color, border: `1px dotted ${t.ink2}`, boxSizing: 'border-box' }} />
      ) : kind === 'dot' ? (
        <span className="legend-swatch__dot" style={{ background: color, borderColor: t.vesselStroke }} />
      ) : (
        <span className={`legend-swatch__line ${kind === 'dashed' ? 'legend-swatch__line--dashed' : ''}`} style={{ borderTopColor: color }} />
      )}
    </i>
  )
}

const MODES: { value: ChartMode; label: string }[] = [
  { value: 'chart', label: 'Chart' },
  { value: 'night', label: 'Night' },
]

export default function LayersDrawer() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const tab = useRef<HTMLButtonElement>(null)
  const layers = useStore((s) => s.ui.layers)
  const toggle = useStore((s) => s.toggleLayer)
  const truth = useStore((s) => s.ui.showTruthStorm)
  const chartMode = useStore((s) => s.ui.chartMode)
  const follow = useStore((s) => s.ui.followVessel)
  const updateUi = useStore((s) => s.updateUi)
  const reduced = useStore((s) => s.ui.reducedMotion)
  const hasStorm = useStore((s) => !!s.scenario.ocean.storm)
  const t = THEMES[chartMode]
  const on = Object.values(layers).filter(Boolean).length
  useEffect(() => {
    // while open: Escape closes the drawer only (captured before the view's Escape closes the
    // mission panel); a pointer press outside the drawer closes it and still reaches the chart
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      tab.current?.focus()
    }
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer, true)
    }
  }, [open])
  return (
    <div ref={root} className="overlay drawer on-k">
      <button ref={tab} type="button" className="drawer__tab" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="layers-body">
        <StackSimple size={16} aria-hidden="true" />
        Layers <span className="num">{on} on</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="drawer__body"
            id="layers-body"
            initial={reduced ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: CHART_EASE }}
          >
            <div className="drawer__group">Chart</div>
            <div className="drawer__mode">
              <span>Mode</span>
              <Segmented options={MODES} value={chartMode} onChange={(v) => updateUi({ chartMode: v })} label="Chart mode" />
            </div>
            <Check label="Follow vessel during replay" checked={follow} onChange={(v) => updateUi({ followVessel: v })} />
            {GROUPS.map((g) => (
              <div key={g.title}>
                <div className="drawer__group">{g.title}</div>
                {g.items.map((l) => (
                  <Check
                    key={l.id}
                    label={
                      <>
                        <Swatch s={l.sample} t={t} />
                        {l.label}
                      </>
                    }
                    checked={layers[l.id]}
                    onChange={() => toggle(l.id)}
                  />
                ))}
                {g.title === 'Ocean' && hasStorm && <Check label="Ground-truth storm track" checked={truth} onChange={(v) => updateUi({ showTruthStorm: v })} />}
              </div>
            ))}
            <div className="drawer__group">Active plan</div>
            <div className="drawer__legend">
              <span>
                <Swatch s={{ color: (x) => x.plan }} t={t} />
                Selected plan, remaining
              </span>
              <span>
                <Swatch s={{ color: (x) => x.travelled }} t={t} />
                Travelled
              </span>
              <span>
                <Swatch s={{ color: (x) => x.ink2, kind: 'dashed' }} t={t} />
                Superseded by a re-plan
              </span>
              <span>
                <Swatch s={{ color: (x) => x.vessel, kind: 'dot' }} t={t} />
                Mission vessel, heading tick
              </span>
            </div>
            <div className="drawer__group">Zone symbology</div>
            <div className="drawer__legend">
              <span>
                <Swatch s={{ color: (x) => x.regulatory, kind: 'hatch' }} t={t} />
                Restricted area (hatched)
              </span>
              <span>
                <Swatch s={{ color: (x) => x.regulatory, kind: 'dashed' }} t={t} />
                Traffic separation scheme
              </span>
              <span>
                <Swatch s={{ color: (x) => x.regulatory, kind: 'dashed' }} t={t} />
                ECA
              </span>
              <span>
                <Swatch s={{ color: (x) => x.shallow, kind: 'fill' }} t={t} />
                Shallow water
              </span>
            </div>
            <p className="drawer__note">Coastlines: Natural Earth (public domain). Wind, current, sea state and storm: synthetic fields. Zones: scenario approximations.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
