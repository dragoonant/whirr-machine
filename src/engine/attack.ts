// R1.3-R1.6 attack roll resolution + hit probability helpers. Pure.
import type { GameEvent } from './events'
import { diceCount, hasDouble, pAttackHit, pAttackHitDropLowest, rollMaybeZero, sum, type DiceCount } from './dice'
import type { GameState, Id, Mod } from './types'

export interface AttackRollInput {
  stat: number // MAT/RAT/AAT after mods
  mods?: Mod[] // extra attack-roll modifiers (sum of values)
  dice?: DiceCount // base 2 + added/removed/boost
  target: number // DEF
  autoHit?: boolean
  autoMiss?: boolean
  rollAnyway?: boolean // auto-hit attacker rolling for a crit (R1.6): the roll then decides
  dropLowest?: boolean // set the lowest die aside after rolling (Dark Power, R1.11)
  ownerId?: Id
}
export interface AttackRollResult {
  state: GameState
  events: GameEvent[]
  hit: boolean
  crit: boolean
  auto: 'hit' | 'miss' | null
  dice: number[]
  total: number
  rollId?: string
}

export function rollAttack(state: GameState, inp: AttackRollInput): AttackRollResult {
  const n = diceCount({ ...inp.dice })
  const flat = inp.stat + sum((inp.mods ?? []).map(m => m.value))
  if (inp.autoMiss) return { state, events: [], hit: false, crit: false, auto: 'miss', dice: [], total: 0 }
  if (inp.autoHit && !inp.rollAnyway) return { state, events: [], hit: true, crit: false, auto: 'hit', dice: [], total: 0 }
  if (n <= 0) return { state, events: [], hit: false, crit: false, auto: 'miss', dice: [], total: 0 } // R1.10
  const drop = inp.dropLowest && n >= 2
  const r = rollMaybeZero(state, n, 'attack', { ownerId: inp.ownerId, target: inp.target, flat, mods: inp.mods, boosted: inp.dice?.boost, dropLowest: drop ? 1 : 0 })
  const kept = drop ? r.kept : r.dice
  const all1 = kept.every(d => d === 1)
  const all6 = kept.length > 1 && kept.every(d => d === 6)
  const hit = !all1 && (all6 || r.total >= inp.target)
  return { state: r.state, events: [r.event], hit, crit: hit && hasDouble(kept), auto: null, dice: r.dice, total: r.total, rollId: r.event.rollId }
}

export interface HitProb { pHit: number; pCrit: number }
type ProbInput = Pick<AttackRollInput, 'stat' | 'mods' | 'dice' | 'target' | 'autoHit' | 'autoMiss' | 'rollAnyway' | 'dropLowest'>
/** Exact hit/crit chance for the UI prompt and AI. */
export function hitProbability(inp: ProbInput): HitProb {
  if (inp.autoMiss) return { pHit: 0, pCrit: 0 }
  if (inp.autoHit && !inp.rollAnyway) return { pHit: 1, pCrit: 0 }
  const n = diceCount({ ...inp.dice })
  const bonus = inp.stat + sum((inp.mods ?? []).map(m => m.value))
  return inp.dropLowest ? pAttackHitDropLowest(n, bonus, inp.target) : pAttackHit(n, bonus, inp.target)
}
/** [normal, boosted] hit chances. */
export function hitProbabilityBoost(inp: ProbInput): [HitProb, HitProb] {
  return [hitProbability({ ...inp, dice: { ...inp.dice, boost: false } }), hitProbability({ ...inp, dice: { ...inp.dice, boost: true } })]
}
