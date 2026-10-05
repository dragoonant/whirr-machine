// Board-local interaction state (ghost, staged path, staged placements, weapon choice, camera request).
// Display/intent only: it never holds a rules number. The UI agent may read it (e.g. to render Confirm / Reset).
import { create } from 'zustand'
import type { Id, ModelId, Vec2 } from '../../engine/index'
import type { CameraPresetId } from '../board/layout'

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
}

export const useInteractionStore = create<InteractionState>(() => ({ ghost: null, staged: [], placements: {}, weaponId: null, cam: null }))

export const interactionActions = {
  setGhost(p: Vec2 | null): void { useInteractionStore.setState({ ghost: p }) },
  setStaged(path: Vec2[]): void { useInteractionStore.setState({ staged: path }) },
  setPlacement(id: ModelId, p: Vec2): void { useInteractionStore.setState((s) => ({ placements: { ...s.placements, [id]: p } })) },
  clearStaged(): void { useInteractionStore.setState({ staged: [], placements: {} }) },
  setWeapon(id: Id | null): void { useInteractionStore.setState({ weaponId: id }) },
  /** Camera presets: 'top', 'edgeA', 'edgeB', 'follow'. */
  cameraPreset(preset: CameraPresetId): void { useInteractionStore.setState((s) => ({ cam: { preset, nonce: (s.cam?.nonce ?? 0) + 1 } })) },
  reset(): void { useInteractionStore.setState({ ghost: null, staged: [], placements: {}, weaponId: null }) },
}
