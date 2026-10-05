import type { Action } from '../../src/engine/actions'
import { handleActivationAction } from '../../src/engine/phases/activation'
import type { FlowOut } from '../../src/engine/pending'
import type { GameState, ModelId, Vec2 } from '../../src/engine/types'
import { bundle, must, newGame, runControlTo, runSetup, withModel } from './turn-helpers'

export { bundle, withModel }

/** The Quick Start game at the first activation choice (Khador = A moves first). */
export function startState(seed = 'act-1'): FlowOut {
  return runControlTo(runSetup(newGame(undefined, seed)))
}

export const place = (s: GameState, id: ModelId, pos: Vec2, patch: Partial<GameState['models'][string]> = {}): GameState =>
  withModel(s, id, { pos, ...patch })

/** Answer the pending decision with an action built from it (decision id and player are filled in). */
export function send(out: FlowOut, a: Record<string, unknown>): FlowOut {
  const full = { ...a, decisionId: out.pending.id, player: out.pending.player } as unknown as Action
  const r = handleActivationAction(out.state, bundle, full)
  if (!r) throw new Error(`not an activation action: ${a.type}`)
  return must(r)
}
export function trySend(out: FlowOut, a: Record<string, unknown>) {
  const full = { ...a, decisionId: out.pending.id, player: out.pending.player } as unknown as Action
  return handleActivationAction(out.state, bundle, full)
}
export const asOut = (state: GameState): FlowOut => ({ state, events: [], pending: state.pending })

/** Put the state back at "choose activation" after repositioning models. */
export const choose = (out: FlowOut, id: string): FlowOut => send(out, { type: 'chooseActivation', activate: id })
export const kinds = (out: FlowOut): string[] => (out.pending.options ?? []).map((o) => o.id)
export { must }

const REST = new Set(['chooseActivation', 'chooseMovement', 'chooseCombatAction', 'chooseAttack', 'gameOver', 'moveModel', 'chargeTarget'])
/** Answer attack-internal decisions with the plain choice until the activation asks something new. */
export function settle(out0: FlowOut, o: { boostAtk?: boolean; boostDmg?: boolean; pf?: 0 | 1 } = {}): FlowOut {
  let out = out0
  const all = [...out0.events]
  for (let i = 0; i < 60 && !REST.has(out.pending.kind); i++) {
    const k = out.pending.kind
    if (k === 'boostAttack') out = send(out, { type: 'boostAttack', boost: !!o.boostAtk })
    else if (k === 'boostDamage') out = send(out, { type: 'boostDamage', boost: !!o.boostDmg })
    else if (k === 'powerField') out = send(out, { type: 'powerField', spend: o.pf ?? 0 })
    else if (k === 'chooseBoxes') out = send(out, { type: 'chooseBoxes', column: Number(out.pending.options![0]!.id.replace('col', '')) })
    else if (k === 'triggerWindow') out = send(out, { type: 'pass' })
    else if (k === 'abilityChoice') out = send(out, { type: 'abilityChoice', optionId: out.pending.options![0]!.id })
    else throw new Error(`settle: unexpected ${k}`)
    all.push(...out.events)
  }
  return { ...out, events: all }
}
export const evTypes = (out: FlowOut): string[] => out.events.map((e) => e.type)

/** Start an activation of `id` with Normal Movement forfeited and a Combat Action chosen. */
export function openCombat(out: FlowOut, id: string, choice: string, extra: Record<string, unknown> = {}): FlowOut {
  let o = choose(out, id)
  o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: id })
  return send(o, { type: 'chooseCombatAction', modelId: id, choice, ...extra })
}
