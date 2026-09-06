/**
 * Chart controls: a small black block bottom-right inside the stage. Zoom in and out, fit the
 * route, follow the vessel, and the chart / night mode switch. Zoom and fit act on the camera
 * through callbacks from the board; follow and mode live in the store.
 */
import { CornersOut, Crosshair, Minus, Moon, Plus, Sun } from '@phosphor-icons/react'
import { useStore } from '../../app/store'

export interface ChartControlsProps {
  zoomIn: () => void
  zoomOut: () => void
  fitRoute: () => void
}

export default function ChartControls({ zoomIn, zoomOut, fitRoute }: ChartControlsProps) {
  const hasPlan = useStore((s) => s.plans.length > 0)
  const follow = useStore((s) => s.ui.followVessel)
  const mode = useStore((s) => s.ui.chartMode)
  const updateUi = useStore((s) => s.updateUi)
  const night = mode === 'night'
  return (
    <div className="plate__controls overlay on-k" role="group" aria-label="Chart controls">
      <button type="button" onClick={zoomIn} title="Zoom in (+)" aria-label="Zoom in">
        <Plus size={16} weight="bold" aria-hidden="true" />
      </button>
      <button type="button" onClick={zoomOut} title="Zoom out (-)" aria-label="Zoom out">
        <Minus size={16} weight="bold" aria-hidden="true" />
      </button>
      <button type="button" onClick={fitRoute} disabled={!hasPlan} title="Fit route (f)" aria-label="Fit the chart to the planned route">
        <CornersOut size={16} weight="bold" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => updateUi({ followVessel: !follow })} aria-pressed={follow} title="Follow vessel during replay (v)" aria-label="Follow the mission vessel during replay">
        <Crosshair size={16} weight="bold" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => updateUi({ chartMode: night ? 'chart' : 'night' })} title={night ? 'Night. Switch to chart' : 'Chart. Switch to night'} aria-label={night ? 'Night mode on, switch to chart mode' : 'Chart mode on, switch to night mode'}>
        {night ? <Moon size={16} weight="bold" aria-hidden="true" /> : <Sun size={16} weight="bold" aria-hidden="true" />}
      </button>
    </div>
  )
}
