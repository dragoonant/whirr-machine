// R1 dice: roll helpers over the seeded RNG, stat order, exact distributions. Pure.
import type { DiceRerolled, DiceRolled } from './events'
import { roll as rngRoll, rollDice } from './rng'
import type { GameState, Id, Mod, RollPurpose, Stat, StatMod } from './types'

export interface DiceCount { base?: number; added?: number; removed?: number; boost?: boolean; min?: number }

/** R1.8-R1.10: dice = base(2) + additional + boost - removed, floored at `min` (default 0). */
export function diceCount(c: DiceCount = {}): number {
  return Math.max(c.min ?? 0, (c.base ?? 2) + (c.added ?? 0) + (c.boost ? 1 : 0) - (c.removed ?? 0))
}

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)
export const hasDouble = (dice: number[]): boolean => new Set(dice).size < dice.length

export interface DiceRoll { state: GameState; event: DiceRolled; dice: number[]; kept: number[]; total: number }
interface RollOpts { ownerId?: Id; target?: number; flat?: number; dropLowest?: number; mods?: Mod[]; boosted?: boolean }

/** Roll n d6 (n >= 1) via the state RNG. `flat` is added to the total. dropLowest implements R1.11. */
export function rollNd6(state: GameState, n: number, purpose: RollPurpose, opts: RollOpts = {}): DiceRoll {
  const r = rngRoll(state, { count: n, sides: 6, purpose, ownerId: opts.ownerId, target: opts.target, flat: opts.flat, dropLowest: opts.dropLowest })
  const event: DiceRolled = { ...r.event, ...(opts.mods ? { mods: opts.mods } : {}), ...(opts.boosted ? { boosted: true } : {}) }
  return { state: r.state, event, dice: event.dice, kept: event.kept, total: event.total }
}

/** A roll that may have zero dice (consumes no RNG, still takes a rollId). */
export function rollMaybeZero(state: GameState, n: number, purpose: RollPurpose, opts: RollOpts = {}): DiceRoll {
  if (n >= 1) return rollNd6(state, n, purpose, opts)
  const rollId = `r:${state.rollSeq + 1}`
  const total = opts.flat ?? 0
  const event: DiceRolled = { type: 'DiceRolled', rollId, purpose, ownerId: opts.ownerId, dice: [], kept: [], total, target: opts.target }
  return { state: { ...state, rollSeq: state.rollSeq + 1 }, event, dice: [], kept: [], total }
}

export function rollD3(state: GameState, purpose: RollPurpose = 'd3'): { state: GameState; event: DiceRolled; value: number } {
  const r = rollNd6(state, 1, purpose)
  return { state: r.state, event: r.event, value: Math.ceil(r.dice[0]! / 2) }
}

/** R1.12: replace all dice with a fresh roll of the same count. */
export function rerollDice(state: GameState, rollId: string, before: number[], sourceId: Id, flat = 0): { state: GameState; event: DiceRerolled; dice: number[]; total: number } {
  const [after, rng] = rollDice(state.rng, before.length)
  const total = sum(after) + flat
  return { state: { ...state, rng }, dice: after, total, event: { type: 'DiceRerolled', rollId, sourceId, before, after, total } }
}

/** R1.13 stat order: lowest set -> x2 -> half (round up) -> bonuses -> penalties, floor 0. */
export function computeStat(_stat: Stat | undefined, base: number, mods: StatMod[]): number {
  const sets = mods.filter(m => m.mode === 'set').map(m => m.value)
  let v = sets.length ? Math.min(...sets) : base
  if (mods.some(m => m.mode === 'double')) v *= 2
  if (mods.some(m => m.mode === 'half')) v = Math.ceil(v / 2)
  const adds = mods.filter(m => m.mode === 'add')
  v += sum(adds.filter(m => m.value >= 0).map(m => m.value))
  v += sum(adds.filter(m => m.value < 0).map(m => m.value))
  return Math.max(0, v)
}

// ---------- exact distributions (R1.14): enumerate 6^n, n <= 5, cached ----------
interface Outcome { sum: number; dbl: boolean; all1: boolean; all6: boolean }
const cache = new Map<number, { total: number; outcomes: Outcome[] }>()
function outcomes(n: number) {
  let c = cache.get(n)
  if (c) return c
  const out: Outcome[] = []
  const total = 6 ** n
  for (let i = 0; i < total; i++) {
    const d: number[] = []
    let x = i
    for (let k = 0; k < n; k++) { d.push((x % 6) + 1); x = Math.floor(x / 6) }
    out.push({ sum: sum(d), dbl: hasDouble(d), all1: d.every(v => v === 1), all6: d.every(v => v === 6) })
  }
  c = { total, outcomes: out }
  cache.set(n, c)
  return c
}

/** P(sum of n d6 = s) as an array indexed by sum. */
export function sumDistribution(n: number): number[] {
  const dist = new Array<number>(6 * Math.max(n, 0) + 1).fill(0)
  if (n <= 0) { dist[0] = 1; return dist }
  const { total, outcomes: o } = outcomes(n)
  for (const x of o) dist[x.sum]! += 1 / total
  return dist
}

export function pAttackHit(n: number, bonus: number, target: number): { pHit: number; pCrit: number } {
  if (n <= 0) return { pHit: 0, pCrit: 0 }
  const { total, outcomes: o } = outcomes(n)
  let hit = 0, crit = 0
  for (const x of o) {
    if (x.all1) continue
    if ((x.all6 && n > 1) || x.sum + bonus >= target) { hit++; if (x.dbl) crit++ }
  }
  return { pHit: hit / total, pCrit: crit / total }
}
