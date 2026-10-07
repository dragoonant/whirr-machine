// Ability costs beyond plain focus: soul and corpse tokens, forced fury, warlock fury, damage points (cryx.md, circle.md, 81 §E).
// One place to ask "could this model pay?" and to pay, used by start-of-activation prompts, special actions and optional triggers.
// Pure: state in, state out. Code hooks that pay for themselves (Regeneration, Blood Rage, Shadow Gate) use canPayCost only to be offered.
import { applyDamage, resolveDeath, layoutsFor } from './damage'
import type { GameEvent } from './events'
import { pay } from './focus'
import { force, isBeast, isWarlock, spendFury, unmarkedBoxes } from './fury'
import { tokensOf, spendToken } from './factions/cryx'
import { profileOf } from './effects'
import type { DataBundle, GameState, ModelId, Rejection, TokenKind } from './types'

export interface AbilityCost { focus?: number; fury?: number; forced?: number; soul?: number; corpse?: number; damage?: number }

const need = (n: number | undefined): number => (typeof n === 'number' && n > 0 ? n : 0)

/** Why this model cannot pay the cost right now, or null. */
export function costBlock(state: GameState, b: DataBundle, id: ModelId, cost: AbilityCost | undefined): Rejection | null {
  const m = state.models[id]
  if (!m || !cost) return null
  for (const kind of ['soul', 'corpse'] as TokenKind[]) {
    if (need(cost[kind]) > tokensOf(m, kind)) return { code: 'E_INSUFFICIENT_TOKENS', message: `${id} needs ${cost[kind]} ${kind} token(s)` }
  }
  if (need(cost.damage) > 0 && unmarkedBoxes(m.damage) <= need(cost.damage)) return { code: 'E_NOT_AN_OPTION', message: `${id} cannot afford ${cost.damage} damage` }
  if (need(cost.focus) > 0) {
    if (isBeast(m)) { const f = force(state, b, id, need(cost.focus), 'ability'); if ('rejection' in f) return f.rejection }
    else if (isWarlock(m)) { if ((m.fury ?? 0) < need(cost.focus)) return { code: 'E_INSUFFICIENT_FURY', message: `${id} has too little fury` } }
    else if (m.focus < need(cost.focus)) return { code: 'E_INSUFFICIENT_FOCUS', message: `${id} needs ${cost.focus} focus` }
  }
  if (need(cost.fury) > 0 && (m.fury ?? 0) < need(cost.fury)) return { code: 'E_INSUFFICIENT_FURY', message: `${id} needs ${cost.fury} fury` }
  if (need(cost.forced) > 0) { const f = force(state, b, id, need(cost.forced), 'ability'); if ('rejection' in f) return f.rejection }
  return null
}
export const canPayCost = (state: GameState, b: DataBundle, id: ModelId, cost: AbilityCost | undefined): boolean => costBlock(state, b, id, cost) === null

/** Pay every part of the cost. Rejects (state unchanged) when any part is short. */
export function payCost(state: GameState, b: DataBundle, id: ModelId, cost: AbilityCost | undefined, sourceId?: string): { state: GameState; events: GameEvent[] } | { rejection: Rejection } {
  const bad = costBlock(state, b, id, cost)
  if (bad) return { rejection: bad }
  if (!cost) return { state, events: [] }
  let s = state
  const events: GameEvent[] = []
  for (const kind of ['soul', 'corpse'] as TokenKind[]) {
    const n = need(cost[kind])
    if (!n) continue
    const r = spendToken(s, id, kind, n, sourceId)
    if (!r) return { rejection: { code: 'E_INSUFFICIENT_TOKENS', message: `${id} needs ${n} ${kind} token(s)` } }
    s = r.state; events.push(...r.events)
  }
  if (need(cost.focus) > 0) {
    const p = pay(s, b, id, need(cost.focus), 'spell')
    if ('rejection' in p) return p
    s = p.state; events.push(...p.events)
  }
  if (need(cost.fury) > 0) {
    const p = spendFury(s, id, need(cost.fury), 'spell')
    if ('rejection' in p) return p
    s = p.state; events.push(...p.events)
  }
  if (need(cost.forced) > 0) {
    const p = force(s, b, id, need(cost.forced), 'ability')
    if ('rejection' in p) return p
    s = p.state; events.push(...p.events)
  }
  if (need(cost.damage) > 0) {
    const m = s.models[id]!
    const layouts = layoutsFor(profileOf(b, m))
    const ap = applyDamage(s, id, need(cost.damage), { layouts, source: 'other' })
    s = ap.state; events.push(...ap.events)
    if (s.models[id]!.life === 'disabled') { const d = resolveDeath(s, id, { layouts, cause: sourceId }); s = d.state; events.push(...d.events) }
  }
  return { state: s, events }
}
