// M10 core gaps, part 1: the roll decisions. rollAnyway (R1.6: DICE-008, DICE-019), reroll (R1.12: DICE-015) and chooseGrid (R3.7: GRID-003),
// driven by synthetic content from tests/fixtures (the real factions never raise them).
import { describe, expect, it, vi } from 'vitest'

const FORCED = vi.hoisted(() => new Map<number, number[]>())
const REROLLS = vi.hoisted(() => [] as number[][])
vi.mock('../../src/engine/rng', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/engine/rng')>()
  return {
    ...real,
    roll(state: import('../../src/engine/types').GameState, spec: import('../../src/engine/rng').RollSpec) {
      const f = FORCED.get(state.rollSeq)
      if (!f) return real.roll(state, spec)
      const n = Math.max(1, spec.count)
      const dice = Array.from({ length: n }, (_, i) => f[i] ?? 1)
      const kept = [...dice].sort((x, y) => y - x).slice(0, dice.length - (spec.dropLowest ?? 0))
      const total = kept.reduce((a, b) => a + b, 0) + (spec.flat ?? 0)
      return {
        state: { ...state, rollSeq: state.rollSeq + 1 },
        event: { type: 'DiceRolled' as const, rollId: `r:${state.rollSeq + 1}`, purpose: spec.purpose, ownerId: spec.ownerId, dice, kept, total, target: spec.target },
      }
    },
    rollDice(rng: import('../../src/engine/types').RngState, count: number) {
      const f = REROLLS.shift()
      if (!f) return real.rollDice(rng, count)
      return [Array.from({ length: count }, (_, i) => f[i] ?? 1), rng] as [number[], import('../../src/engine/types').RngState]
    },
  }
})

import { legalActions, validate, type Action } from '../../src/engine/index'
import type { GameEvent } from '../../src/engine/events'
import type { EffectInstance, GameState } from '../../src/engine/types'
import { act, at, begin, events, mk, toCombat, tryAct, world } from '../fixtures/synthetic-decisions'

const force = (s: GameState, ...dice: number[]): void => { FORCED.set(s.rollSeq, dice) }
const ev = <T extends GameEvent['type']>(list: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] => list.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
/** Every decision must offer a legal answer, and each offered answer must validate. */
const offersAnswers = (s: GameState): void => {
  const legal = legalActions(s)
  expect(legal.length).toBeGreaterThan(0)
  for (const a of legal) expect(validate(s, a as Action)).toBeNull()
}

/** Answer the plain decisions of an attack until it is the active player's choice again; `answers` overrides by decision kind. Collects every event. */
function settle(s0: GameState, answers: Partial<Record<string, Record<string, unknown>>> = {}): { s: GameState; evs: GameEvent[]; kinds: string[] } {
  let s = s0
  const evs: GameEvent[] = []
  const kinds: string[] = []
  for (let i = 0; i < 40 && !['chooseAttack', 'chooseCombatAction', 'chooseMovement', 'chooseActivation', 'gameOver'].includes(s.pending.kind); i++) {
    const k = s.pending.kind
    kinds.push(k)
    offersAnswers(s)
    const a = answers[k]
      ?? (k === 'boostAttack' ? { type: 'boostAttack', boost: false }
        : k === 'boostDamage' ? { type: 'boostDamage', boost: false }
          : k === 'reroll' ? { type: 'reroll', reroll: false }
            : k === 'rollAnyway' ? { type: 'rollAnyway', roll: false }
              : k === 'powerField' ? { type: 'powerField', spend: 0 }
                : k === 'chooseGrid' ? { type: 'chooseGrid', grid: 'left' }
                  : k === 'triggerWindow' ? { type: 'pass' } : null)
    if (!a) throw new Error(`settle: no answer for ${k}`)
    s = act(s, a)
    evs.push(...events())
  }
  return { s, evs, kinds }
}

// ---------------------------------------------------------------------------------------------------------------------------------
describe('rollAnyway: an auto-hit may be rolled for a critical, and then the roll decides (R1.6)', () => {
  /** A Test Crit Knight (Critical Knockdown) beside a knocked-down enemy: the hit is automatic. */
  const scene = (attacker = 'sx.p.crit') => world([mk('A:L', attacker, 'A', 0, 0), mk('B:L', 'sx.p.foe', 'B', 2, 0, { conditions: ['knockedDown'] })])
  const declared = (s: GameState): GameState => act(toCombat(s, 'A:L'), { type: 'chooseAttack', modelId: 'A:L', weaponId: attacker(s), targetId: 'B:L', additional: false })
  const attacker = (s: GameState): string => (s.models['A:L']!.profileId === 'sx.p.crit' ? 'sx.w.crit-blade' : 'sx.w.blade')

  it('DICE-008 a crit effect on the attack raises rollAnyway with the roll\'s own odds; rolling 4,4 against DEF 5 is a hit and a crit', () => {
    let s = declared(scene())
    expect(s.pending.kind).toBe('rollAnyway')
    expect(s.pending.player).toBe('A')
    offersAnswers(s)
    expect(s.pending.options!.map((o) => o.id)).toEqual(['accept', 'roll'])
    // 2d6 + MAT 6 vs the DEF 5 of a downed model: only the all-ones roll misses; a pair (not 1,1) crits
    expect(s.pending.context.odds!.pHit).toBeCloseTo(35 / 36, 5)
    expect(s.pending.context.odds!.pCrit).toBeCloseTo(5 / 36, 5)
    s = act(s, { type: 'rollAnyway', roll: true })
    expect(s.pending.kind).toBe('boostAttack') // a real roll can be boosted, with the roll's odds rather than 100%
    expect(s.pending.context.odds!.pHit).toBeLessThan(1)
    force(s, 4, 4)
    const r = settle(s)
    const dice = ev(r.evs, 'DiceRolled').find((e) => e.purpose === 'attack')!
    expect(dice.dice).toEqual([4, 4])
    expect(ev(r.evs, 'AttackResolved')[0]).toMatchObject({ hit: true, crit: true, auto: null })
    expect(ev(r.evs, 'AttackResolved')).toHaveLength(1)
  })

  it('DICE-019 rolling 1,1 against an auto-hit misses: the roll decides', () => {
    let s = declared(scene())
    s = act(s, { type: 'rollAnyway', roll: true })
    force(s, 1, 1)
    const r = settle(s)
    expect(ev(r.evs, 'AttackResolved')[0]).toMatchObject({ hit: false, crit: false, auto: null })
    expect(ev(r.evs, 'DamageRolled')).toHaveLength(0)
  })

  it('DICE-008 accepting keeps the automatic hit: no attack roll, no crit, no boost question', () => {
    let s = declared(scene())
    s = act(s, { type: 'rollAnyway', roll: false })
    const evs = [...events()]
    expect(s.pending.kind).not.toBe('boostAttack')
    const r = settle(s)
    evs.push(...r.evs)
    expect(ev(evs, 'AttackResolved')[0]).toMatchObject({ hit: true, crit: false, auto: 'hit' })
    expect(ev(evs, 'DiceRolled').filter((e) => e.purpose === 'attack')).toHaveLength(0)
  })

  it('an auto-hit whose attack has no crit effect is not asked: nothing could change', () => {
    const s = declared(scene('sx.p.cast'))
    expect(s.pending.kind).toBe('boostAttack')
  })

  it('a hit that is not automatic never raises rollAnyway', () => {
    const s0 = world([mk('A:L', 'sx.p.crit', 'A', 0, 0), mk('B:L', 'sx.p.foe', 'B', 2, 0)])
    const s = act(toCombat(s0, 'A:L'), { type: 'chooseAttack', modelId: 'A:L', weaponId: 'sx.w.crit-blade', targetId: 'B:L', additional: false })
    expect(s.pending.kind).toBe('boostAttack')
  })

  it('a wrong answer kind is refused, and rollAnyway cannot be passed', () => {
    const s = declared(scene())
    expect(tryAct(s, { type: 'boostAttack', boost: false }).rejection?.code).toBe('E_WRONG_DECISION')
    expect(tryAct(s, { type: 'pass' }).rejection).toBeTruthy() // rollAnyway cannot be passed
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
describe('reroll: the holder of a reroll may replace a roll once, before its triggers (R1.12)', () => {
  const duel = (a: string, b = 'sx.p.foe') => world([mk('A:L', a, 'A', 0, 0), mk('B:L', b, 'B', 2, 0)])
  const swing = (s0: GameState, weapon = 'sx.w.crit-blade'): GameState => act(toCombat(s0, 'A:L'), { type: 'chooseAttack', modelId: 'A:L', weaponId: weapon, targetId: 'B:L', additional: false })

  it('DICE-015 a missed roll offers Lucky to its owner; rerolling replaces the dice and the hit is decided on the new ones (and the crit effect fires after)', () => {
    let s = swing(duel('sx.p.lucky'))
    expect(s.pending.kind).toBe('boostAttack')
    force(s, 1, 2)
    s = act(s, { type: 'boostAttack', boost: false })
    const evs0 = [...events()]
    expect(s.pending.kind).toBe('reroll')
    expect(s.pending.player).toBe('A')
    offersAnswers(s)
    expect(s.pending.context.data).toMatchObject({ roll: 'attack', hit: false, before: [1, 2], holder: 'A' })
    expect(s.pending.context.odds!.pHit).toBeGreaterThan(0.4) // 2d6 + 6 vs DEF 12
    expect(ev(evs0, 'AttackResolved')).toHaveLength(1)
    // no hit or miss trigger has run yet: the target is not knocked down
    expect(s.models['B:L']!.conditions).toEqual([])
    REROLLS.push([3, 3])
    s = act(s, { type: 'reroll', reroll: true, sourceId: 'sx.a.lucky' })
    const evs1 = [...events()]
    expect(ev(evs1, 'DiceRerolled')[0]).toMatchObject({ before: [1, 2], after: [3, 3], sourceId: 'sx.a.lucky' })
    expect(ev(evs1, 'AttackResolved').at(-1)).toMatchObject({ hit: true, crit: true }) // 3+3+6 = 12 vs DEF 12, a pair
    expect(s.models['B:L']!.conditions).toContain('knockedDown') // the crit trigger ran on the final dice
    expect(s.pending.kind).toBe('boostDamage') // the attack goes on to its damage
  })

  it('a roll that is kept is not offered again, and a miss that was kept stays a miss', () => {
    let s = swing(duel('sx.p.lucky'))
    force(s, 1, 2)
    s = act(s, { type: 'boostAttack', boost: false })
    expect(s.pending.kind).toBe('reroll')
    s = act(s, { type: 'reroll', reroll: false })
    expect(ev(events(), 'DiceRerolled')).toHaveLength(0)
    expect(s.pending.kind).not.toBe('reroll')
    expect(s.models['B:L']!.conditions).toEqual([])
    expect(s.pending.kind).toBe('chooseAttack') // a miss: no damage, back to the choice
  })

  it('after a reroll the same source is not asked again about that roll (never rerolled twice by one rule)', () => {
    let s = swing(duel('sx.p.lucky'))
    force(s, 1, 2)
    s = act(s, { type: 'boostAttack', boost: false })
    REROLLS.push([1, 2]) // the reroll misses too
    s = act(s, { type: 'reroll', reroll: true })
    expect(ev(events(), 'AttackResolved').at(-1)).toMatchObject({ hit: false })
    expect(s.pending.kind).toBe('chooseAttack')
  })

  it('a roll that hit offers no Lucky (its condition is a miss)', () => {
    let s = swing(duel('sx.p.lucky'))
    force(s, 6, 5)
    s = act(s, { type: 'boostAttack', boost: false })
    expect(s.pending.kind).toBe('boostDamage')
  })

  it('a damage roll offers Steady; rerolling replaces the dice and the points are worked out from the new roll', () => {
    let s = swing(duel('sx.p.lucky'))
    force(s, 6, 5)
    s = act(s, { type: 'boostAttack', boost: false })
    expect(s.pending.kind).toBe('boostDamage')
    force(s, 1, 1) // the next roll is the damage roll: 2 + POW 14 - ARM 14 = 2
    s = act(s, { type: 'boostDamage', boost: false })
    const first = ev(events(), 'DiceRolled').find((e) => e.purpose === 'damage')!
    expect(first.dice).toEqual([1, 1])
    expect(s.pending.kind).toBe('reroll')
    expect(s.pending.context.data).toMatchObject({ roll: 'damage', points: 2, before: [1, 1] })
    expect(s.pending.context.odds!.expectedDamage).toBeGreaterThan(5)
    offersAnswers(s)
    expect(ev(events(), 'DamageRolled')).toHaveLength(0) // the points are not final yet
    REROLLS.push([6, 6])
    s = act(s, { type: 'reroll', reroll: true, sourceId: 'sx.a.steady' })
    const dr = ev(events(), 'DamageRolled')[0]!
    expect(dr.points).toBe(12 + 14 - 14) // 12 + POW 14 - ARM 14
    expect(dr.instance.total).toBe(26)
    expect(ev(events(), 'DiceRerolled')[0]).toMatchObject({ before: [1, 1], after: [6, 6], sourceId: 'sx.a.steady' })
    expect(ev(events(), 'DamageApplied')[0]).toMatchObject({ points: 12 })
  })

  it('the defender\'s controller holds a reroll of the attacker\'s hit (an ability whose scope is the attacker), and answers it as the inactive player', () => {
    const s0 = world([mk('A:L', 'sx.p.foe', 'A', 0, 0), mk('B:L', 'sx.p.foe', 'B', 20, 0), mk('B:j', 'sx.p.jinx', 'B', 2, 0)])
    let s = act(toCombat(s0, 'A:L'), { type: 'chooseAttack', modelId: 'A:L', weaponId: 'sx.w.blade', targetId: 'B:j', additional: false })
    force(s, 6, 5)
    s = act(s, { type: 'boostAttack', boost: false })
    expect(s.pending.kind).toBe('reroll')
    expect(s.pending.player).toBe('B')
    expect(s.pending.context.data).toMatchObject({ holder: 'B', hit: true, roll: 'attack' })
    offersAnswers(s)
    REROLLS.push([1, 1])
    s = act(s, { type: 'reroll', reroll: true, sourceId: 'sx.a.jinx' })
    expect(ev(events(), 'AttackResolved').at(-1)).toMatchObject({ hit: false })
    expect(s.pending.player).toBe('A')
    expect(s.pending.kind).toBe('chooseAttack')
  })

  it('an effect that carries a reroll right lets its owner make the affected model reroll once; the effect ends when used', () => {
    const marionette = { id: 'e:99', sourceId: 'sx.e.puppet', name: 'Puppet Strings', owner: 'B', targetIds: ['A:L'], mods: [], duration: 'round', expires: null, rerollRight: { roll: 'any' } } as unknown as EffectInstance
    let s = duel('sx.p.foe')
    s = { ...s, effects: [marionette] }
    s = swing(s, 'sx.w.blade')
    force(s, 6, 5)
    s = act(s, { type: 'boostAttack', boost: false })
    expect(s.pending.kind).toBe('reroll')
    expect(s.pending.player).toBe('B')
    REROLLS.push([1, 2])
    s = act(s, { type: 'reroll', reroll: true })
    expect(s.effects.some((e) => e.id === 'e:99')).toBe(false)
    expect(ev(events(), 'AttackResolved').at(-1)).toMatchObject({ hit: false })
  })

  it('a reroll with a focus cost charges the owner when it is taken, not when it is offered', () => {
    let s = swing(duel('sx.p.pricey'), 'sx.w.blade')
    force(s, 1, 2)
    s = act(s, { type: 'boostAttack', boost: false })
    expect(s.pending.kind).toBe('reroll')
    expect(s.pending.options!.find((o) => o.id === 'reroll')!.cost).toEqual({ focus: 1 })
    expect(s.models['A:L']!.focus).toBe(5)
    REROLLS.push([6, 6])
    s = act(s, { type: 'reroll', reroll: true })
    expect(s.models['A:L']!.focus).toBe(4)
    expect(ev(events(), 'AttackResolved').at(-1)).toMatchObject({ hit: true })
  })

  it('a reroll answered for the wrong source, or a stray answer, is refused', () => {
    let s = swing(duel('sx.p.lucky'))
    force(s, 1, 2)
    s = act(s, { type: 'boostAttack', boost: false })
    expect(tryAct(s, { type: 'reroll', reroll: true, sourceId: 'sx.a.steady' }).rejection?.code).toBe('E_NOT_AN_OPTION')
    expect(tryAct(s, { type: 'boostDamage', boost: false }).rejection?.code).toBe('E_WRONG_DECISION')
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
describe('chooseGrid: the attacker picks a colossal\'s grid (R3.7)', () => {
  const colossal = (patch = {}) => world([mk('A:L', 'sx.p.foe', 'A', 0, 0), mk('B:L', 'sx.p.foe', 'B', 20, 0), mk('B:c', 'sx.p.colossal', 'B', 3.5, 0, patch)])
  const hit = (s0: GameState): GameState => {
    let s = act(toCombat(s0, 'A:L'), { type: 'chooseAttack', modelId: 'A:L', weaponId: 'sx.w.blade', targetId: 'B:c', additional: false })
    force(s, 6, 5)
    s = act(s, { type: 'boostAttack', boost: false })
    expect(s.pending.kind).toBe('boostDamage')
    force(s, 3, 3) // 6 + POW 14 - ARM 10 = 10 points
    return act(s, { type: 'boostDamage', boost: false })
  }

  it('GRID-003 attack damage on a two-grid model asks the attacker which grid; the damage fills the one picked', () => {
    let s = hit(colossal())
    expect(s.pending.kind).toBe('chooseGrid')
    expect(s.pending.player).toBe('A')
    offersAnswers(s)
    expect(s.pending.options!.map((o) => o.id)).toEqual(['left', 'right'])
    expect(s.pending.context.data).toMatchObject({ points: 10, grids: [{ id: 'left', filled: 0, boxes: 18 }, { id: 'right', filled: 0, boxes: 18 }] })
    expect(tryAct(s, { type: 'chooseGrid', grid: 'main' }).rejection?.code).toBe('E_NOT_AN_OPTION')
    s = act(s, { type: 'chooseGrid', grid: 'right' })
    const applied = ev(events(), 'DamageApplied')[0]!
    expect(applied).toMatchObject({ points: 10, grid: 'right' })
    const grids = (s.models['B:c']!.damage as { grids: { id: string; cols: boolean[][] }[] }).grids
    expect(grids.find((g) => g.id === 'left')!.cols.flat().filter(Boolean)).toHaveLength(0)
    expect(grids.find((g) => g.id === 'right')!.cols.flat().filter(Boolean)).toHaveLength(10)
  })

  it('GRID-003 the other answer fills the left grid', () => {
    let s = hit(colossal())
    s = act(s, { type: 'chooseGrid', grid: 'left' })
    expect(ev(events(), 'DamageApplied')[0]).toMatchObject({ grid: 'left' })
  })

  it('GRID-003 when one grid is already full there is nothing to pick: the damage spills to the open grid and the decision resolves itself', () => {
    const full = { track: 'grid', grids: [
      { id: 'left', cols: Array.from({ length: 6 }, () => [true, true, true]) },
      { id: 'right', cols: Array.from({ length: 6 }, () => [false, false, false]) },
    ] }
    const s = hit(colossal({ damage: full }))
    expect(s.pending.kind).not.toBe('chooseGrid')
    expect(ev(events(), 'DecisionAutoResolved').some((e) => e.kind === 'chooseGrid' && e.optionId === 'right')).toBe(true)
    expect(ev(events(), 'DamageApplied')[0]).toMatchObject({ grid: 'right', points: 10 })
  })

  it('crippling follows the grid layout of a colossal (the profile\'s two grids)', () => {
    let s = hit(colossal())
    s = act(s, { type: 'chooseGrid', grid: 'left' })
    expect(s.models['B:c']!.life).toBe('active')
    expect(s.pending.kind).toBe('chooseAttack')
  })
})
