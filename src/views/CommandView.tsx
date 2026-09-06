import { lazy, Suspense, useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import Strip from '../components/command/Strip'
import LayersDrawer from '../components/command/LayersDrawer'
import Inspector from '../components/command/Inspector'
import Caption from '../components/command/Caption'
import { useStore } from '../app/store'
import { PACKS } from '../data/scenarios'
import { CHART_EASE } from '../components/chart/theme'

const ChartBoard = lazy(() => import('../components/chart/ChartBoard'))

/**
 * Command: the flat chart fills the stage inside a yellow margin. The chart owns its own small
 * controls (bottom-right) and scale bar (bottom-left); this view adds only one quiet row at
 * top-left (scenario pack, layers tab), the "Mission" reopen block at top-right while the panel
 * is closed, and the replay caption above the scale bar. Overlays take pointer events only on
 * themselves so drags between them reach the chart.
 */
export default function CommandView() {
  const inspectorOpen = useStore((s) => s.ui.commandPanelOpen)
  const updateUi = useStore((s) => s.updateUi)
  const reduced = useStore((s) => s.ui.reducedMotion)
  const setInspectorOpen = (open: boolean) => updateUi({ commandPanelOpen: open })
  const scenarioId = useStore((s) => s.scenarioId)
  const setScenario = useStore((s) => s.setScenario)
  useEffect(() => {
    // when the panel closes, move focus to the control that reopens it
    if (!inspectorOpen) document.getElementById('mission-reopen')?.focus()
  }, [inspectorOpen])
  useEffect(() => {
    // re-open the panel whenever the engine changes state (run started, finished or failed)
    const unsub = useStore.subscribe((s, prev) => {
      if (s.run.status !== prev.run.status && !s.ui.commandPanelOpen) useStore.setState({ ui: { ...s.ui, commandPanelOpen: true } })
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && useStore.getState().ui.visibleRoute === '/') useStore.setState((st) => ({ ui: { ...st.ui, commandPanelOpen: false } }))
    }
    window.addEventListener('keydown', onKey)
    return () => {
      unsub()
      window.removeEventListener('keydown', onKey)
    }
  }, [])
  return (
    <div className={`command ${inspectorOpen ? 'command--inspector' : ''}`}>
      <h1 className="sr-only">Command</h1>
      <div className="command__stage">
        <Suspense fallback={<div className="plate" aria-hidden="true" />}>
          <ChartBoard />
        </Suspense>
        <div className="stage__topleft">
          <div className="overlay scenario-pick on-k">
            <label>
              <span className="sr-only">Scenario pack</span>
              <select value={scenarioId} onChange={(e) => setScenario(e.target.value as typeof scenarioId)} aria-label="Scenario pack">
                {PACKS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <LayersDrawer />
        </div>
        {!inspectorOpen && (
          <button type="button" id="mission-reopen" className="btn btn--outline stage__reopen on-k overlay" onClick={() => setInspectorOpen(true)}>
            Mission
          </button>
        )}
        <Caption />
      </div>
      <div className="command__panel">
        <AnimatePresence initial={false}>
          {inspectorOpen && (
            <motion.div
              key="inspector"
              style={{ position: 'absolute', inset: 0 }}
              initial={reduced ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? undefined : { opacity: 0, x: 24 }}
              transition={{ duration: 0.42, ease: CHART_EASE }}
            >
              <Inspector onClose={() => setInspectorOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Strip />
    </div>
  )
}
