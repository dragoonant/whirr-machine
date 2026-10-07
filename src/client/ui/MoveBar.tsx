import { useMemo } from 'react'
import { queryMoveCheck, usePresentedModels, usePrompt } from '../contract'
import { interactionActions, useInteractionStore } from '../interaction/store'
import './hud.css'

/**
 * Free-move helper under the top bar: how to place the model (drag, or click for each waypoint) and, once a path is
 * staged, the waypoint count and the distance left, straight from the engine's move check. Undo drops the last waypoint.
 */
export function MoveBar() {
  const pd = usePrompt()
  const staged = useInteractionStore((s) => s.staged)
  const dragging = useInteractionStore((s) => s.drag?.moved ?? false)
  const models = usePresentedModels()
  const c = pd?.kind === 'moveModel' && !pd.constraints?.straightLine ? pd.constraints : undefined
  const check = useMemo(() => (c && staged.length ? queryMoveCheck(c.modelId, staged) : null), [c?.modelId, pd?.id, JSON.stringify(staged)]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!c || !models?.[c.modelId]) return null
  const max = Number.isFinite(c.maxDist) ? c.maxDist : null
  const left = check && max !== null ? Math.max(0, max - check.cost) : null
  return (
    <div className="hud-card hud-movebar" data-testid="move-bar" data-waypoints={staged.length} role="status">
      {dragging ? <span>Release to place the model.</span> : staged.length === 0 ? (
        <span>Drag the model, or click the table: each click adds a waypoint. <kbd>Backspace</kbd> removes the last.</span>
      ) : (
        <>
          <span data-testid="move-bar-text">
            <b>{staged.length}</b> waypoint{staged.length === 1 ? '' : 's'}
            {check ? ` · ${check.distance.toFixed(1)}"${max !== null ? ` of ${max.toFixed(1)}"` : ''}` : ''}
            {left !== null ? ` · ${left.toFixed(1)}" left` : ''}
            {check && !check.ok ? ' · not a legal move yet' : ''}
          </span>
          <button type="button" className="hud-btn hud-btn-quiet hud-btn-sm" data-testid="move-undo" onClick={() => interactionActions.popWaypoint()}>Undo waypoint <kbd>Backspace</kbd></button>
        </>
      )}
    </div>
  )
}
