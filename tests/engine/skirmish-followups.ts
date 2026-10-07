// Shared scene helpers for the M12 follow-up tests (tests/engine/skirmish-followups*.test.ts): Skirmish scenes on Copperline Crossing,
// models parked out of the way, a combat opened for one unit, and the seed loops the pipeline tests need.
import type { Action } from '../../src/engine/actions'
import type { FlowOut } from '../../src/engine/pending'
import type { GameEvent } from '../../src/engine/events'
import type { GameSetup, GameState } from '../../src/engine/types'
import { raiseChooseActivation } from '../../src/engine/turnflow'
import { asOut, bundle, choose, place, send, withModel } from './action-helpers'
import { newGame, runControlTo, runSetup } from './turn-helpers'

export { asOut, bundle, choose, place, send, withModel }
export type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>
export const evs = <T extends GameEvent['type']>(es: GameEvent[], t: T): Ev<T>[] => es.filter((e): e is Ev<T> => e.type === t)
export type Any = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export const rec = (id: string): Any => bundle.byId[id] as unknown as Any

/** Both armies built on Copperline Crossing, at an activation choice with A as the active player (whoever won the roll-off, A acts now). */
export const start = (a: string, b: string, seed: string): GameState =>
  raiseChooseActivation({ ...runControlTo(runSetup(newGame({ scenario: 'scn-copperline-crossing', lists: { A: a, B: b } } as GameSetup, seed))).state, activePlayer: 'A' }, []).state

/** Every model parked far from the action except `keep`. */
export function parkExcept(s: GameState, keep: string[]): GameState {
  let i = 0
  for (const m of Object.values(s.models)) {
    if (keep.includes(m.id)) continue
    s = place(s, m.id, { x: -21 + (i % 8) * 6, z: 21 - Math.floor(i / 8) * 4 })
    i++
  }
  return s
}

/** Activate `activeId` and forfeit its Normal Movement (the combat choice of `firstModel` is open). */
export function toCombat(s: GameState, activeId: string, firstModel = activeId): FlowOut {
  let o = choose(asOut(s), activeId)
  while (o.pending.kind === 'abilityChoice') o = send(o, { type: 'abilityChoice', optionId: 'skip' })
  return send(o, { type: 'chooseMovement', option: 'forfeit', modelId: firstModel })
}
/** The open decision's options that choose this special action (optionally for one target). */
export const offers = (o: FlowOut, abilityId: string): Any[] =>
  (o.pending.options ?? []).filter((x) => x.action.type === 'chooseCombatAction' && (x.action as Any).abilityId === abilityId).map((x) => x.action as Any)
export const offerTargets = (o: FlowOut, abilityId: string): string[] => offers(o, abilityId).map((a) => a.targetId as string)

/** The first of seeds `<prefix>0`, `<prefix>1`, ... for which `fn` returns something (the dice have to fall right for the case). */
export function firstSeed<T>(prefix: string, fn: (seed: string) => T | null, tries = 60): T {
  for (let i = 0; i < tries; i++) { const r = fn(`${prefix}${i}`); if (r) return r }
  throw new Error(`no seed of ${prefix}* gave the case in ${tries} tries`)
}

/** Hand the turn to B (the first activation decision for B), so an enemy attack can be played against A. */
export function asBTurn(s: GameState): FlowOut {
  return raiseChooseActivation({ ...s, activePlayer: 'B' }, [])
}
/** Answer attack-internal decisions the plain way until something else is asked (a trigger move, an activation decision ...). */
export function settleAtk(out0: FlowOut, stop: (o: FlowOut) => boolean = () => false): FlowOut {
  let out = out0
  const all = [...out0.events]
  for (let i = 0; i < 60 && !stop(out); i++) {
    const k = out.pending.kind
    if (k === 'boostAttack') out = send(out, { type: 'boostAttack', boost: false })
    else if (k === 'boostDamage') out = send(out, { type: 'boostDamage', boost: false })
    else if (k === 'powerField') out = send(out, { type: 'powerField', spend: 0 })
    else if (k === 'chooseBoxes') out = send(out, { type: 'chooseBoxes', column: Number(out.pending.options![0]!.id.replace('col', '')) })
    else if (k === 'rollAnyway') out = send(out, { type: 'rollAnyway', roll: false })
    else if (k === 'reroll') out = send(out, { type: 'reroll', reroll: false })
    else if (k === 'transferDamage') out = send(out, { type: 'transferDamage', toId: null })
    else if (k === 'triggerWindow') out = send(out, { type: 'pass' })
    else if (k === 'abilityChoice') out = send(out, { type: 'abilityChoice', optionId: out.pending.options![0]!.id })
    else break
    all.push(...out.events)
  }
  return { ...out, events: all }
}
export const raw = (a: unknown): Record<string, unknown> => a as Record<string, unknown>
export type { Action }
