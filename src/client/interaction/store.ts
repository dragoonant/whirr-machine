// Board-local interaction state (ghost, staged path, staged placements, weapon choice, camera request).
// Display/intent only: it never holds a rules number. The UI agent may read it (e.g. to render Confirm / Reset).
import { create } from 'zustand'
import type { Id, ModelId, Vec2 } from '../../engine/index'
import type { CameraPresetId } from '../board/layout'

/** A press-and-drag on the moving model (moveModel only). `moved` flips once the pointer has travelled far enough to count as a drag, not a click. */
export interface DragState { id: number; modelId: ModelId; promptId: string; sx: number; sy: number; moved: boolean }

export interface InteractionState {
  /** Table point under the cursor (throttled to ~30 Hz), or null. */
  ghost: Vec2 | null
  /** Staged move waypoints for the open moveModel decision (last = end point). */
  staged: Vec2[]
  /** Staged placements for deploy / advanceDeploy / placeTroopers. */
  placements: Record<ModelId, Vec2>
  /** Weapon (chooseAttack) or spell (castSpell) the next target click uses; null = first matching option. */
  weaponId: Id | null
  /** Camera request; CameraRig tweens to it (<= 600 ms). `nonce` makes repeated requests distinct. */
  cam: { preset: CameraPresetId; nonce: number } | null
  /** The drag in progress, or null. */
  drag: DragState | null
}

export const useInteractionStore = create<InteractionState>(() => ({ ghost: null, staged: [], placements: {}, weaponId: null, cam: null, drag: null }))
let dragSeq = 0

export const interactionActions = {
  setGhost(p: Vec2 | null): void { useInteractionStore.setState({ ghost: p }) },
  setStaged(path: Vec2[]): void { useInteractionStore.setState({ staged: path }) },
  /** Drop the last staged waypoint (Backspace). Returns false when there was none. */
  popWaypoint(): boolean {
    const { staged } = useInteractionStore.getState()
    if (!staged.length) return false
    useInteractionStore.setState({ staged: staged.slice(0, -1) })
    return true
  },
  startDrag(modelId: ModelId, promptId: string, sx: number, sy: number): void { useInteractionStore.setState({ drag: { id: ++dragSeq, modelId, promptId, sx, sy, moved: false } }) },
  dragMoved(): void { useInteractionStore.setState((s) => (s.drag ? { drag: { ...s.drag, moved: true } } : {})) },
  endDrag(): void { if (useInteractionStore.getState().drag) useInteractionStore.setState({ drag: null }) },
  setPlacement(id: ModelId, p: Vec2): void { useInteractionStore.setState((s) => ({ placements: { ...s.placements, [id]: p } })) },
  clearStaged(): void { useInteractionStore.setState({ staged: [], placements: {} }) },
  setWeapon(id: Id | null): void { useInteractionStore.setState({ weaponId: id }) },
  /** Camera presets: 'top', 'edgeA', 'edgeB', 'follow'. */
  cameraPreset(preset: CameraPresetId): void { useInteractionStore.setState((s) => ({ cam: { preset, nonce: (s.cam?.nonce ?? 0) + 1 } })) },
  reset(): void { useInteractionStore.setState({ ghost: null, staged: [], placements: {}, weaponId: null, drag: null }) },
}
