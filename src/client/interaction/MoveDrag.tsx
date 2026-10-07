// Drag to move: press on the moving model, drag, release to stage the end point. Tracks the pointer on the window, so the
// ghost, path and legality (the overlay's engine move check) follow it over the whole table. Esc or a release outside
// the board cancels. The staged point still needs Confirm (or Enter, or a click on it), like the click mode.
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Vec2 } from '../../engine/index'
import { currentPrompt } from './adapter'
import { clampMovePoint, DRAG_PX, dropDrag } from './controller'
import { insideRect, rayToTable, toNdc } from './ray'
import { interactionActions, useInteractionStore } from './store'

export function MoveDrag(): null {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const dragId = useInteractionStore((s) => s.drag?.id ?? 0)
  useEffect(() => {
    if (!dragId) return
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const table = (e: PointerEvent): Vec2 | null => {
      const ndc = toNdc(el.getBoundingClientRect(), e.clientX, e.clientY)
      ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera)
      return rayToTable(ray.ray.origin, ray.ray.direction)
    }
    const live = () => {
      const d = useInteractionStore.getState().drag
      const p = currentPrompt()
      return d && p && p.id === d.promptId ? d : null
    }
    let last = 0
    const move = (e: PointerEvent) => {
      const d = live()
      if (!d) { interactionActions.endDrag(); return }
      if (!d.moved) {
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_PX) return
        interactionActions.dragMoved()
        interactionActions.setStaged([]) // a drag replaces whatever path was staged
      }
      const now = performance.now()
      if (now - last < 16) return
      last = now
      const at = table(e)
      if (at) interactionActions.setGhost(clampMovePoint(currentPrompt(), at))
    }
    const up = (e: PointerEvent) => {
      const d = live()
      interactionActions.endDrag()
      if (!d?.moved) return
      const at = table(e)
      if (at && insideRect(el.getBoundingClientRect(), e.clientX, e.clientY)) dropDrag(at)
      interactionActions.setGhost(null)
    }
    const cancel = () => { interactionActions.endDrag(); interactionActions.setGhost(null) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel() }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel); window.removeEventListener('keydown', key)
    }
  }, [dragId, camera, gl])
  return null
}
