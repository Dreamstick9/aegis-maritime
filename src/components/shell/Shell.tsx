import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Anchor, Boat, ChartBar, ChartScatter, GearSix, MapTrifold, Path } from '@phosphor-icons/react'
import { useStore } from '../../app/store'
import { PACKS } from '../../data/scenarios'
import { PORTS } from '../../data/ports'
import { simClock } from '../../app/format'

const ICON = { size: 22, weight: 'regular' as const }

const NAV: { to: string; label: string; icon: ReactNode }[] = [
  { to: '/', label: 'Command', icon: <MapTrifold {...ICON} /> },
  { to: '/routes', label: 'Routes, mission builder', icon: <Path {...ICON} /> },
  { to: '/results', label: 'Results, Pareto trade-offs', icon: <ChartScatter {...ICON} /> },
  { to: '/fleet', label: 'Fleet, vessel dossier', icon: <Boat {...ICON} /> },
  { to: '/ports', label: 'Ports', icon: <Anchor {...ICON} /> },
  { to: '/analytics', label: 'Analytics', icon: <ChartBar {...ICON} /> },
  { to: '/settings', label: 'Settings', icon: <GearSix {...ICON} /> },
]

export function Rail() {
  return (
    <nav className="rail on-k" aria-label="Primary">
      <div className="rail__brand" title="Aegis Maritime, Fleet Command">
        <img className="rail__logo" src="/aegis-logo-on-dark.png" alt="" aria-hidden="true" width={36} height={36} />
        <span className="sr-only">Aegis Maritime</span>
      </div>
      {NAV.map((n, i) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `rail__link ${isActive ? 'active' : ''}`} title={`${n.label} (${i + 1})`} aria-label={n.label}>
          {n.icon}
        </NavLink>
      ))}
    </nav>
  )
}

/** Compact context line for non-Command views: scenario pack, the generated route, sim clock, engine state. */
export function ContextLine() {
  const scenarioId = useStore((s) => s.scenarioId)
  const setScenario = useStore((s) => s.setScenario)
  const mission = useStore((s) => s.mission)
  const tH = useStore((s) => Math.round(s.timeline.tH * 10) / 10)
  const run = useStore((s) => s.run)
  return (
    <div className="context">
      <label>
        <span className="sr-only">Scenario pack</span>
        <select value={scenarioId} onChange={(e) => setScenario(e.target.value as typeof scenarioId)}>
          {PACKS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <span>{`${PORTS[mission.originId]?.name ?? mission.originId} to ${PORTS[mission.destinationId]?.name ?? mission.destinationId}`}</span>
      <span>
        <b>{simClock(mission.departure, tH)}</b>
      </span>
      <span>{run.status === 'done' && run.result ? `${run.result.archive.length} Pareto plans from ${run.result.evaluations.toLocaleString()} evaluations` : run.status === 'running' ? 'optimising…' : run.status === 'error' ? 'engine error' : 'no plan yet'}</span>
    </div>
  )
}

export function ViewHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="view__head">
      <div>
        <h1 className="view__title">{title}</h1>
        {sub && <p className="view__sub">{sub}</p>}
      </div>
      {children ?? <ContextLine />}
    </header>
  )
}
