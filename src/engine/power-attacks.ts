// R7.10-R7.14 power attacks: headbutt, slam, throw, trample. Pure; the caller supplies stats and focus decisions.
import { rollAttack } from './attack'
import { applyDamage, resolveDeath, rollDamage } from './damage'
import type { GameEvent } from './events'
import { EPS, edgeDistance, isOnTable } from './geometry'
import {
  addKnockdown, slideAway, spendFocus, type HitLookups, type InvoluntaryResult, type TrampleResult,
} from './movement'
import { rollNd6 } from './dice'
import type { GameState, Mod, ModelId, PowerAttackKind } from './types'

export interface PowerAttackInput {
  kind: Exclude<PowerAttackKind, 'trample'>
  attackerId: ModelId
  targetId: ModelId
  mat: number // melee attack stat after mods
  def: number // target DEF after mods
  look: HitLookups
  warEngine?: boolean // pays 1 focus
  range?: number // headbutt/throw reach (default 1; headbutt 2 for 120 mm)
  movedDistance?: number // slam: inches moved this Normal Movement (>= 3 for the full slam)
  boostAttack?: boolean
  boostDamage?: boolean
  mods?: Mod[]
  attackId?: string
}
export interface PowerAttackResult {
  ok: boolean
  code?: 'E_POWER_ATTACK' | 'E_OUT_OF_RANGE' | 'E_TARGET_INVALID' | 'E_INSUFFICIENT_FOCUS'
  message?: string
  state: GameState
  events: GameEvent[]
  hit: boolean
  moved?: InvoluntaryResult
}

const fail = (state: GameState, code: PowerAttackResult['code'], message: string): PowerAttackResult => ({ ok: false, code, message, state, events: [], hit: false })

/** POW 12 if the attacker's base <= the target's, else 14 (R7.10). */
export const powerPow = (attackerMm: number, targetMm: number): 12 | 14 => (attackerMm <= targetMm ? 12 : 14)

/** Slam distance: d6, halved (rounded up, our ruling) against a larger base, +2 for a 120 mm attacker vs a smaller target. */
export function slamDistance(roll: number, attackerMm: number, targetMm: number): number {
  const base = targetMm > attackerMm ? Math.ceil(roll / 2) : roll
  return base + (attackerMm === 120 && targetMm < attackerMm ? 2 : 0)
}

function damageStep(
  state: GameState, inp: PowerAttackInput, pow: number, extraDice: number, events: GameEvent[],
): GameState {
  const t = inp.targetId
  const r = rollDamage(state, { pow, armor: inp.look.arm(t), dice: { added: extraDice, boost: inp.boostDamage }, ownerId: t })
  events.push(...r.events)
  const a = applyDamage(r.state, t, r.points, { source: 'direct', attackId: inp.attackId, layouts: inp.look.layouts?.(t) })
  events.push(...a.events)
  let s = a.state
  if (s.models[t]!.life === 'disabled') {
    const d = resolveDeath(s, t, { tough: inp.look.tough?.(t), layouts: inp.look.layouts?.(t), cause: inp.attackId })
    s = d.state; events.push(...d.events)
  }
  return s
}

export function resolvePowerAttack(state: GameState, inp: PowerAttackInput): PowerAttackResult {
  const a = state.models[inp.attackerId]!
  const t = state.models[inp.targetId]
  if (!t || !isOnTable(t) || t.owner === a.owner) return fail(state, 'E_TARGET_INVALID', 'power attacks target enemies on the table')
  if ((inp.kind === 'headbutt' || inp.kind === 'throw') && t.base > a.base) return fail(state, 'E_POWER_ATTACK', 'target base is larger than the attacker')
  const range = inp.range ?? (inp.kind === 'slam' && a.base === 120 ? 2 : inp.kind === 'headbutt' && a.base === 120 ? 2 : 1)
  if (edgeDistance(a.pos, a.base, t.pos, t.base) > range + EPS) return fail(state, 'E_OUT_OF_RANGE', 'target not in range')
  let s = state
  const events: GameEvent[] = []
  if (inp.warEngine) {
    if (a.focus < 1 || a.crippled.includes('C')) return fail(state, 'E_INSUFFICIENT_FOCUS', 'power attack needs 1 focus')
    const f = spendFocus(s, a.id, 'powerAttack'); s = f.state; events.push(...f.events)
  }
  const fullSlam = inp.kind === 'slam' && (inp.movedDistance ?? 0) >= 3 - EPS
  const mods: Mod[] = [...(inp.mods ?? [])]
  if (inp.kind === 'slam' && fullSlam && t.base > a.base) mods.push({ source: 'slam', label: 'Slam vs larger base', value: -2 })
  events.push({ type: 'AttackDeclared', attackId: inp.attackId ?? 'a:pa', attackerId: a.id, originId: a.id, targetId: t.id, kind: 'power', powerKind: inp.kind, additional: false } as GameEvent)
  const roll = rollAttack(s, { stat: inp.mat, mods, dice: { boost: inp.boostAttack }, target: inp.def, ownerId: a.id })
  s = roll.state; events.push(...roll.events)
  events.push({ type: 'AttackResolved', attackId: inp.attackId ?? 'a:pa', rollId: roll.rollId, hit: roll.hit, crit: roll.crit, auto: roll.auto } as GameEvent)
  if (!roll.hit) return { ok: true, state: s, events, hit: false }

  const pow = powerPow(a.base, t.base)
  let moved: InvoluntaryResult | undefined
  let extra = 0
  if (inp.kind === 'headbutt') {
    const kd = addKnockdown(s, t.id, 'headbutt'); s = kd.state; events.push(...kd.events)
  } else if (inp.kind === 'throw' || fullSlam) {
    const d = rollNd6(s, 1, inp.kind === 'throw' ? 'throwDist' : 'slamDist', { ownerId: a.id })
    s = d.state; events.push(d.event)
    const x = slamDistance(d.dice[0]!, a.base, t.base)
    moved = slideAway(s, t.id, a.pos, x, inp.kind === 'throw' ? 'throw' : 'slam', inp.look)
    s = moved.state; events.push(...moved.events)
    if (moved.stoppedAgainst) extra = 1
    const kd = addKnockdown(s, t.id, inp.kind); s = kd.state; events.push(...kd.events)
  }
  if (s.models[t.id]!.life === 'active' || s.models[t.id]!.life === 'disabled') s = damageStep(s, inp, pow, extra, events)
  return { ok: true, state: s, events, hit: true, moved }
}

// ---------- trample attacks (R7.14) ----------
export interface TrampleAttackInput {
  attackerId: ModelId
  move: TrampleResult
  mat: number
  def: (id: ModelId) => number
  look: HitLookups
  boost?: boolean
}
/** One melee attack roll against each small enemy model moved through; hits take power-attack damage. */
export function resolveTrampleAttacks(state: GameState, inp: TrampleAttackInput): { state: GameState; events: GameEvent[]; hits: ModelId[] } {
  const a = state.models[inp.attackerId]!
  let s = state
  const events: GameEvent[] = []
  const hits: ModelId[] = []
  for (const id of inp.move.trampled) {
    const t = s.models[id]
    if (!t || t.owner === a.owner || !isOnTable(t)) continue
    const roll = rollAttack(s, { stat: inp.mat, dice: { boost: inp.boost }, target: inp.def(id), ownerId: a.id })
    s = roll.state; events.push(...roll.events)
    if (!roll.hit) continue
    hits.push(id)
    const d = rollDamage(s, { pow: powerPow(a.base, t.base), armor: inp.look.arm(id), ownerId: id })
    events.push(...d.events)
    const ap = applyDamage(d.state, id, d.points, { source: 'direct', layouts: inp.look.layouts?.(id) })
    s = ap.state; events.push(...ap.events)
    if (s.models[id]!.life === 'disabled') {
      const dd = resolveDeath(s, id, { tough: inp.look.tough?.(id), layouts: inp.look.layouts?.(id), cause: 'trample' })
      s = dd.state; events.push(...dd.events)
    }
  }
  return { state: s, events, hits }
}

