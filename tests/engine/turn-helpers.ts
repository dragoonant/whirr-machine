import { loadBundle } from '../../src/data/index'
import type { Action } from '../../src/engine/actions'
import type { FlowOut } from '../../src/engine/pending'
import { answerSetup, createInitialState, isSetupDecision } from '../../src/engine/setup'
import { answerControlDecision, isControlDecision, raiseChooseActivation } from '../../src/engine/turnflow'
import type { DataBundle, GameSetup, GameState } from '../../src/engine/types'

export const bundle: DataBundle = loadBundle()
export const QS: GameSetup = { scenario: 'scn-qs-demo', lists: { A: 'kha.l.qs-recon', B: 'cyg.l.qs-recon' } }
export const S1: GameSetup = { scenario: 'scn-ashwall-divide', lists: { A: 'kha.l.qs-recon', B: 'cyg.l.qs-recon' } }

export function must<T extends object>(r: T): Exclude<T, { rejection: unknown }> {
  if ('rejection' in r) throw new Error(`rejected: ${JSON.stringify((r as { rejection: unknown }).rejection)}`)
  return r as Exclude<T, { rejection: unknown }>
}
export const newGame = (setup: GameSetup = QS, seed = 'seed-1'): FlowOut => must(createInitialState(setup, seed, bundle))

/** Answer every setup decision with its first option until the first control or activation decision. */
export function runSetup(out: FlowOut): FlowOut {
  let cur = out
  for (let i = 0; i < 20 && isSetupDecision(cur.state); i++) cur = must(answerSetup(cur.state, bundle, cur.pending.options![0]!.action))
  return cur
}
/** Answer control decisions with their first option until the Activation Phase. */
export function runControlTo(out: FlowOut): FlowOut {
  let cur = out
  for (let i = 0; i < 10 && isControlDecision(cur.state); i++) cur = must(answerControlDecision(cur.state, bundle, cur.pending.options![0]!.action as Action))
  return cur
}
export const withModel = (s: GameState, id: string, patch: Partial<GameState['models'][string]>): GameState =>
  ({ ...s, models: { ...s.models, [id]: { ...s.models[id]!, ...patch } } })

/** Mark everything the active player owns as activated and re-raise the activation choice (stands in for the activation reducer). */
export function finishActivations(s: GameState): FlowOut {
  const models = Object.fromEntries(Object.entries(s.models).map(([k, m]) => [k, m.owner === s.activePlayer ? { ...m, activated: true } : m]))
  const units = Object.fromEntries(Object.entries(s.units).map(([k, u]) => [k, u.owner === s.activePlayer ? { ...u, activated: true } : u]))
  return raiseChooseActivation({ ...s, models, units })
}
