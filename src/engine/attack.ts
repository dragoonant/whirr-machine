// R1.3-R1.6 attack roll resolution + hit probability helpers. Pure.
import type { GameEvent } from './events'
import { diceCount, hasDouble, pAttackHit, rollMaybeZero, sum, type DiceCount } from './dice'
import type { GameState, Id, Mod } from './types'

export interface AttackRollInput {
  stat: number // MAT/RAT/AAT after mods
  mods?: Mod[] // extra attack-roll modifiers (sum of values)
  dice?: DiceCount // base 2 + added/removed/boost
  target: number // DEF
  autoHit?: boolean
  autoMiss?: boolean
  rollAnyway?: boolean // auto-hit attacker rolling for a crit (R1.6): the roll then decides
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
  const r = rollMaybeZero(state, n, 'attack', { ownerId: inp.ownerId, target: inp.target, flat, mods: inp.mods, boosted: inp.dice?.boost })
  const all1 = r.dice.every(d => d === 1)
  const all6 = n > 1 && r.dice.every(d => d === 6)
  const hit = !all1 && (all6 || r.total >= inp.target)
  return { state: r.state, events: [r.event], hit, crit: hit && hasDouble(r.dice), auto: null, dice: r.dice, total: r.total, rollId: r.event.rollId }
}

export interface HitProb { pHit: number; pCrit: number }
type ProbInput = Pick<AttackRollInput, 'stat' | 'mods' | 'dice' | 'target' | 'autoHit' | 'autoMiss' | 'rollAnyway'>
/** Exact hit/crit chance for the UI prompt and AI. */
export function hitProbability(inp: ProbInput): HitProb {
  if (inp.autoMiss) return { pHit: 0, pCrit: 0 }
  if (inp.autoHit && !inp.rollAnyway) return { pHit: 1, pCrit: 0 }
  return pAttackHit(diceCount({ ...inp.dice }), inp.stat + sum((inp.mods ?? []).map(m => m.value)), inp.target)
}
/** [normal, boosted] hit chances. */
export function hitProbabilityBoost(inp: ProbInput): [HitProb, HitProb] {
  return [hitProbability({ ...inp, dice: { ...inp.dice, boost: false } }), hitProbability({ ...inp, dice: { ...inp.dice, boost: true } })]
}
