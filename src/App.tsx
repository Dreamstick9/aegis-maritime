import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Rail } from './components/shell/Shell'
import { useStore, planEtaH } from './app/store'
import { startReplan } from './app/runner'
const CommandView = lazy(() => import('./views/CommandView'))
const FleetView = lazy(() => import('./views/FleetView'))
const PortsView = lazy(() => import('./views/PortsView'))
const RoutesView = lazy(() => import('./views/RoutesView'))
const ResultsView = lazy(() => import('./views/ResultsView'))
const AnalyticsView = lazy(() => import('./views/AnalyticsView'))
const SettingsView = lazy(() => import('./views/SettingsView'))

/**
 * Advances the replay clock and triggers scheduled rolling re-plans. requestAnimationFrame drives
 * smooth frames; a low-rate interval keeps simulated time moving when the tab is hidden and the
 * browser suspends animation frames.
 */
function Ticker() {
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const advance = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now
      const s = useStore.getState()
      if (!s.timeline.playing || !s.plans.length) return
      const eta = planEtaH(s.plans)
      const next = s.timeline.tH + dt * s.ui.timelineSpeed
      const replanAt = s.scenario.autoReplanAtH
      if (replanAt !== undefined && s.ui.autoReplan && s.replan.history.length === 0 && s.replan.status !== 'running' && s.timeline.tH < replanAt && next >= replanAt) {
        useStore.setState({ timeline: { tH: replanAt, playing: false } })
        startReplan('auto', false)
        return
      }
      if (next >= eta) {
        useStore.setState({ timeline: { tH: eta, playing: false } })
        return
      }
      useStore.setState({ timeline: { tH: next, playing: true } })
    }
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      advance(now)
    }
    raf = requestAnimationFrame(loop)
    const watchdog = window.setInterval(() => {
      const now = performance.now()
      if (now - last > 400) advance(now)
    }, 500)
    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(watchdog)
    }
  }, [])
  return null
}

function Hotkeys() {
  const navigate = useNavigate()
  useEffect(() => {
    const paths = ['/', '/routes', '/results', '/fleet', '/ports', '/analytics', '/settings']
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      // shortcuts act only when no interactive element owns the focus (WCAG 2.1.4)
      const t = e.target instanceof HTMLElement ? e.target : null
      if (t && t !== document.body && t.closest('a, button, input, select, textarea, summary, [role="button"], [tabindex], [contenteditable]')) return
      const idx = Number(e.key) - 1
      if (e.key >= '1' && e.key <= '7' && idx < paths.length) navigate(paths[idx])
      const st = useStore.getState()
      if (e.key === ' ' && st.plans.length && st.ui.visibleRoute === '/') {
        e.preventDefault()
        useStore.setState((s) => ({ timeline: { ...s.timeline, playing: !s.timeline.playing } }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])
  return null
}

const fallback = (
  <div className="view">
    <div className="empty" role="status">
      Loading view…
    </div>
  </div>
)

/**
 * Command and Fleet are mounted on first visit and then kept alive (hidden) so returning to them
 * is instant; the vessel viewer's render loop pauses while hidden (see VesselViewer frameloop).
 */
const visitedRoutes = new Set<string>()

function KeepAliveViews() {
  const { pathname } = useLocation()
  const updateUi = useStore((s) => s.updateUi)
  useEffect(() => {
    updateUi({ visibleRoute: pathname })
    visitedRoutes.add(pathname)
  }, [pathname, updateUi])
  const isCommand = pathname === '/'
  const isFleet = pathname === '/fleet'
  return (
    <>
      {(isCommand || visitedRoutes.has('/')) && (
        <div hidden={!isCommand} style={{ height: '100%' }}>
          <CommandView />
        </div>
      )}
      {(isFleet || visitedRoutes.has('/fleet')) && (
        <div hidden={!isFleet} style={{ height: '100%' }}>
          <FleetView />
        </div>
      )}
      <Routes>
        <Route path="/" element={null} />
        <Route path="/fleet" element={null} />
        <Route path="/ports" element={<PortsView />} />
        <Route path="/routes" element={<RoutesView />} />
        <Route path="/results" element={<ResultsView />} />
        <Route path="/analytics" element={<AnalyticsView />} />
        <Route path="/settings" element={<SettingsView />} />
      </Routes>
    </>
  )
}

export default function App() {
  const reduced = useStore((s) => s.ui.reducedMotion)
  useEffect(() => {
    document.documentElement.classList.toggle('reduced-motion', reduced)
  }, [reduced])
  return (
    <HashRouter>
      <Ticker />
      <Hotkeys />
      <div className="app">
        <Rail />
        <main className="main" id="main">
          <Suspense fallback={fallback}>
            <KeepAliveViews />
          </Suspense>
        </main>
      </div>
    </HashRouter>
  )
}
