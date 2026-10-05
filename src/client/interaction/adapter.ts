// Local adapter for the few non-hook reads the pointer handlers need and the frozen contract does not export:
// the true state, the open prompt as a snapshot, and engine.validate (read-only, used for placement previews).
// Rules answers still go through contract.game.*; nothing here calls engine.step.
import { validate, type Action, type GameState, type PendingDecision, type Rejection } from '../../engine/index'
import { isHumanDecision, useGameStore } from '../store/gameStore'
import { usePresentedStore } from '../presentation/presentedStore'

export const truthState = (): GameState | null => useGameStore.getState().state

/** The open decision when a human owns it and the presentation is idle (same gate as contract.usePrompt). */
export function currentPrompt(): PendingDecision | null {
  const g = useGameStore.getState()
  if (g.fatal || !usePresentedStore.getState().idle) return null
  return isHumanDecision(g) ? g.pending : null
}

/** engine.validate on the true state; null = would be accepted. */
export function validateAction(a: Action): Rejection | null {
  const s = truthState()
  if (!s) return { code: 'E_BAD_PAYLOAD', message: 'no game' }
  try { return validate(s, a) } catch (e) { return { code: 'E_BAD_PAYLOAD', message: e instanceof Error ? e.message : String(e) } }
}
