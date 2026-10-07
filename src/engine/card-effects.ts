// M13 command cards (91 A.2): the live-ness test for card effects that only work near a scenario element (Bite and Hold: Sturdy,
// Duck and Cover: Dig In / Set Defense). Kept apart from cards.ts so code-hooks.ts can read it without importing the card flow.
import type { EffectExtras } from './effects'
import { nearScenarioElement } from './scenario-rules'
import type { DataBundle, EffectInstance, GameState, ModelId } from './types'

/** True when the effect carries `whileNear` and the model is not near a scenario element right now: its grants are then switched off (RULING: checked live). */
export function effectDormant(state: GameState, b: DataBundle, e: EffectInstance, modelId: ModelId): boolean {
  return !!(e as EffectInstance & EffectExtras).whileNear && !nearScenarioElement(state, b, modelId)
}

/** Cheap test for the three card grants (`core.a.sturdy`, `core.a.dig-in`, `core.a.set-defense`): a live effect on the model grants the ability. Hot paths (LOS, blast resistance, pushes) use this instead of the full ability walk. */
export function hasCardGrant(state: GameState, b: DataBundle, modelId: ModelId, abilityId: string): boolean {
  for (const e of state.effects) {
    if (!e.targetIds.includes(modelId)) continue
    if (!((e as EffectInstance & { grants?: string[] }).grants ?? []).includes(abilityId)) continue
    if (!effectDormant(state, b, e, modelId)) return true
  }
  return false
}
