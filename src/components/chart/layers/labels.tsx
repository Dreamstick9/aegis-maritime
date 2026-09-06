/**
 * The shared label layer: draws every registered mark label (endpoint ports, the mission vessel,
 * the storm, other ports, fleet units) after resolving collisions and view clipping in one pass
 * (see ../labels.ts). Rendered last inside the camera group so it sits over every mark.
 *
 * The layers that own the marks register their candidates while they render, which happens
 * before this component in the same pass; this component subscribes to every store slice that
 * can change a label so it re-renders whenever they do (plus the chart context: zoom, view, tH).
 * The mission vessel's label is rendered inside a follower group that MissionVesselLayer moves
 * per frame with its glyph; its offset direction comes from the resolved anchor.
 */
import { useStore } from '../../../app/store'
import { useChart } from '../context'
import { followers, resolveLabels } from '../labels'

const HALO_PX = 3

export function LabelLayer() {
  const { S, view } = useChart()
  // subscriptions only: these are the inputs the registering layers render from
  useStore((s) => s.plans)
  useStore((s) => s.scenario)
  useStore((s) => s.ui.layers)
  useStore((s) => s.mission)
  useStore((s) => s.ui.showTruthStorm)
  useStore((s) => s.selectedVesselId)
  const placements = resolveLabels(view, S)
  return (
    <g data-layer="labels" pointerEvents="none" aria-hidden="true">
      {placements.map((p) => {
        const fs = (p.item.fontPx ?? 12) * S
        if (p.item.follow === 'vessel') {
          return (
            <g
              key="follow-vessel"
              ref={(el) => {
                followers.vessel = el
                // first mount: sit on the quantised target until the glyph's frame loop takes over
                if (el && !el.hasAttribute('transform')) el.setAttribute('transform', `translate(${p.item.x.toFixed(3)} ${p.item.y.toFixed(3)})`)
              }}
            >
              <text className={p.item.className} x={p.x - p.item.x} y={p.y - p.item.y} textAnchor={p.anchor} fontSize={fs} fill={p.item.fill} style={{ strokeWidth: HALO_PX * S }}>
                {p.text}
              </text>
            </g>
          )
        }
        return (
          <text key={p.item.id} className={p.item.className} x={p.x} y={p.y} textAnchor={p.anchor} fontSize={fs} fill={p.item.fill} style={{ strokeWidth: HALO_PX * S }}>
            {p.text}
          </text>
        )
      })}
    </g>
  )
}
