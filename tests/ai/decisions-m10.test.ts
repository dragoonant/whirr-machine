// M10 core gaps, the AI side: the bot answers every decision the new engine paths raise (reroll, rollAnyway, chooseGrid, combinedAttack picker,
// channel, a trigger's attack outside the activation, additional attacks while initial attacks remain) with a legal, sensible answer.
// Scenes come from the synthetic fixture; the AI reads its data through the real bundle, so the fixture's records are merged into it first.
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

import { decideSync, newBrain } from '../../src/ai/decider'
import { pickSensible } from '../../src/ai/random'
import { legalActions, step, validate, type Action, type GameState } from '../../src/engine/index'
import type { EffectInstance, UnitState } from '../../src/engine/types'
import { act, begin, installForAi, mk, toCombat, world } from '../fixtures/synthetic-decisions'

installForAi()
const force = (s: GameState, ...dice: number[]): void => { FORCED.set(s.rollSeq, dice) }
const decide = (s: GameState, tier: 'normal' | 'easy' = 'normal'): Action => {
  const brain = newBrain()
  const a = decideSync(s, s.pending, legalActions(s), { tier, seed: 'm10', brain })
  expect(validate(s, a)).toBeNull()
  expect(brain.stats.fallbacks).toBe(0) // the AI's own pick, not the random bot's rescue
  return a
}
const REST = ['chooseAttack', 'chooseCombatAction', 'chooseMovement', 'chooseActivation', 'gameOver']
/** Let the normal AI answer every decision of the attack in progress until the activation asks for its own choice again. Returns the kinds it saw. */
function aiThrough(s0: GameState, tier: 'normal' | 'easy' = 'normal'): { s: GameState; kinds: string[] } {
  let s = s0
  const kinds: string[] = []
  const brains = { A: newBrain(), B: newBrain() }
  for (let i = 0; i < 40 && (!REST.includes(s.pending.kind) || s.pending.context.data?.code === 'triggerAttack'); i++) {
    kinds.push(`${s.pending.kind}:${s.pending.player}`)
    const a = decideSync(s, s.pending, legalActions(s), { tier, seed: 'm10', brain: brains[s.pending.player] })
    const r = step(s, a)
    expect(r.rejection).toBeUndefined()
    s = r.state
  }
  return { s, kinds }
}

describe('AI answers the roll decisions', () => {
  const knockedDown = (mods: EffectInstance[] = []): GameState => {
    const s = world([mk('A:L', 'sx.p.crit', 'A', 0, 0), mk('B:L', 'sx.p.foe', 'B', 2, 0, { conditions: ['knockedDown'] })])
    return { ...s, effects: mods }
  }
  const declared = (s0: GameState): GameState => act(toCombat(s0, 'A:L'), { type: 'chooseAttack', modelId: 'A:L', weaponId: 'sx.w.crit-blade', targetId: 'B:L', additional: false })

  it('DICE-008 rollAnyway: the normal bot rolls when the crit chance outweighs the chance of missing, the easy bot takes the sure hit', () => {
    const s = declared(knockedDown())
    expect(s.pending.kind).toBe('rollAnyway')
    expect(decide(s, 'normal')).toMatchObject({ type: 'rollAnyway', roll: true })
    expect(decide(s, 'easy')).toMatchObject({ type: 'rollAnyway', roll: false })
  })

  it('DICE-019 rollAnyway: with a weak attack stat the chance of a miss is not worth the crit, so the bot keeps the automatic hit', () => {
    const dazed = { id: 'e:1', sourceId: 'x.dazed', name: 'Dazed', owner: 'B', targetIds: ['A:L'], mods: [{ stat: 'MAT', value: -5, mode: 'add' }], duration: 'round', expires: null } as unknown as EffectInstance
    const s = declared(knockedDown([dazed]))
    expect(s.pending.kind).toBe('rollAnyway')
    expect(s.pending.context.odds!.pHit).toBeLessThan(0.93)
    expect(decide(s, 'normal')).toMatchObject({ type: 'rollAnyway', roll: false })
  })

  const lucky = (): GameState => {
    const s = world([mk('A:L', 'sx.p.lucky', 'A', 0, 0), mk('B:L', 'sx.p.foe', 'B', 2, 0)])
    return act(toCombat(s, 'A:L'), { type: 'chooseAttack', modelId: 'A:L', weaponId: 'sx.w.crit-blade', targetId: 'B:L', additional: false })
  }

  it('DICE-015 reroll: a bot holding a reroll of its own miss takes it', () => {
    let s = lucky()
    force(s, 1, 2)
    s = act(s, { type: 'boostAttack', boost: false })
    expect(s.pending.kind).toBe('reroll')
    expect(decide(s)).toMatchObject({ type: 'reroll', reroll: true })
    expect(decide(s, 'easy')).toMatchObject({ type: 'reroll', reroll: true })
  })

  it('DICE-015 reroll: a weak damage roll is rerolled, a strong one is kept', () => {
    const at = (dice: number[]): GameState => {
      let s = lucky()
      force(s, 6, 5)
      s = act(s, { type: 'boostAttack', boost: false })
      force(s, ...dice)
      s = act(s, { type: 'boostDamage', boost: false })
      expect(s.pending.kind).toBe('reroll')
      return s
    }
    expect(decide(at([1, 1]))).toMatchObject({ type: 'reroll', reroll: true })
    expect(decide(at([6, 6]))).toMatchObject({ type: 'reroll', reroll: false })
  })

  it('DICE-015 reroll: a defender who may make the attacker reroll a hit does so; the whole attack then plays out', () => {
    const s0 = world([mk('A:L', 'sx.p.foe', 'A', 0, 0), mk('B:L', 'sx.p.foe', 'B', 20, 0), mk('B:j', 'sx.p.jinx', 'B', 2, 0)])
    let s = act(toCombat(s0, 'A:L'), { type: 'chooseAttack', modelId: 'A:L', weaponId: 'sx.w.blade', targetId: 'B:j', additional: false })
    force(s, 6, 5)
    s = act(s, { type: 'boostAttack', boost: false })
    expect(s.pending.kind).toBe('reroll')
    expect(s.pending.player).toBe('B')
    expect(decide(s)).toMatchObject({ type: 'reroll', reroll: true })
    REROLLS.push([1, 1])
    const r = aiThrough(s)
    expect(r.kinds[0]).toBe('reroll:B')
    expect(r.s.pending.player).toBe('A')
  })

  it('GRID-003 chooseGrid: the bot fills the grid that is closer to full', () => {
    const left = { id: 'left' as const, cols: Array.from({ length: 6 }, (_, i) => (i < 5 ? [true, true, true] : [false, false, false])) } // 15 of 18
    const right = { id: 'right' as const, cols: Array.from({ length: 6 }, () => [false, false, false]) }
    const s0 = world([mk('A:L', 'sx.p.foe', 'A', 0, 0), mk('B:L', 'sx.p.foe', 'B', 20, 0), mk('B:c', 'sx.p.colossal', 'B', 3.5, 0, { damage: { track: 'grid', grids: [left, right] } })])
    let s = act(toCombat(s0, 'A:L'), { type: 'chooseAttack', modelId: 'A:L', weaponId: 'sx.w.blade', targetId: 'B:c', additional: false })
    force(s, 6, 5)
    s = act(s, { type: 'boostAttack', boost: false })
    force(s, 1, 1) // 2 + 14 - 10 = 6 points, so the left grid would just fill
    s = act(s, { type: 'boostDamage', boost: false })
    expect(s.pending.kind).toBe('chooseGrid')
    for (const tier of ['normal', 'easy'] as const) expect(decide(s, tier)).toMatchObject({ type: 'chooseGrid', grid: 'left' })
  })
})

describe('AI answers the action decisions', () => {
  const ring = (n: number): GameState => {
    const ids = Array.from({ length: n }, (_, i) => `A:t${i + 1}`)
    const troopers = ids.map((id, i) => mk(id, 'sx.p.trooper', 'A', Math.cos((i * 2 * Math.PI) / n) * 1.6, Math.sin((i * 2 * Math.PI) / n) * 1.6, { unitId: 'A:u1' }))
    const unit: UnitState = { id: 'A:u1', profileId: 'sx.u.guard', owner: 'A', troopers: ids, attachments: [], activated: false }
    return world([mk('A:L', 'sx.p.foe', 'A', -20, 0), mk('B:L', 'sx.p.foe', 'B', 0, 0), ...troopers], {}, [unit])
  }
  const atAttack = (s0: GameState): GameState => {
    let s = begin(s0, 'A:u1')
    s = act(s, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:t1' })
    return act(s, { type: 'chooseCombatAction', modelId: 'A:t1', choice: 'melee' })
  }

  it('combinedAttack: the picker is answered with a legal group or by backing out, and the bot never picks the empty-picker option as its attack', () => {
    let s = atAttack(ring(4))
    const a = decide(s)
    expect(a.type === 'combinedAttack' ? a.contributorIds.length : 1).toBeGreaterThan(0) // never the "open the picker" entry
    const picker = s.pending.options!.find((o) => o.action.type === 'combinedAttack' && o.action.contributorIds.length === 0)!
    s = act(s, picker.action as unknown as Record<string, unknown>)
    expect(s.pending.kind).toBe('combinedAttack')
    for (const tier of ['normal', 'easy'] as const) {
      const b = decide(s, tier)
      expect(b.type === 'pass' || (b.type === 'combinedAttack' && b.contributorIds.length > 0)).toBe(true)
    }
  })

  it('channel: the bot casts from the caster; the decision resolves and the cast goes ahead', () => {
    const s0 = world([mk('A:L', 'sx.p.cast', 'A', 0, 0), mk('A:n', 'sx.p.node', 'A', 4, 6), mk('B:L', 'sx.p.foe', 'B', 10, 0)])
    let s = act(begin(s0, 'A:L'), { type: 'chooseMovement', option: 'forfeit', modelId: 'A:L' })
    const bolt = s.pending.options!.find((o) => o.id === 'cast:sx.s.bolt:B:L')!
    s = act(s, bolt.action as unknown as Record<string, unknown>)
    expect(s.pending.kind).toBe('channel')
    for (const tier of ['normal', 'easy'] as const) expect(decide(s, tier)).toMatchObject({ type: 'channel', via: null })
    const r = aiThrough(s)
    expect(r.kinds[0]).toBe('channel:A')
  })

  it('ATK-014 a trigger\'s attack outside the activation: the owner\'s bot makes it (it is free) and the active player carries on', () => {
    const s0 = world([mk('A:L', 'sx.p.shooter', 'A', 0, 0), mk('B:L', 'sx.p.counter', 'B', 1.9, 0)])
    let s = act(toCombat(s0, 'A:L', 'ranged'), { type: 'chooseAttack', modelId: 'A:L', weaponId: 'sx.w.gun', targetId: 'B:L', additional: false })
    force(s, 1, 2)
    s = act(s, { type: 'boostAttack', boost: false })
    expect(s.pending.context.data).toMatchObject({ code: 'triggerAttack' })
    expect(s.pending.player).toBe('B')
    const a = decide(s)
    expect(a.type).toBe('chooseAttack')
    const r = aiThrough(s)
    expect(r.kinds.filter((k) => k.startsWith('boost'))).toEqual([]) // nothing to boost outside the activation
    expect(r.s.pending.player).toBe('A')
  })

  it('ATK-006 additional attacks: while an initial attack remains the bot makes it rather than paying for an additional one', () => {
    const s0 = world([mk('A:L', 'sx.p.twin', 'A', 0, 0, { focus: 4 }), mk('B:L', 'sx.p.foe', 'B', 20, 20), mk('B:d', 'sx.p.dummy', 'B', 2, 0)])
    let s = act(toCombat(s0, 'A:L'), { type: 'chooseAttack', modelId: 'A:L', weaponId: 'sx.w.blade', targetId: 'B:d', additional: false })
    s = aiThrough(s).s
    expect(s.pending.kind).toBe('chooseAttack')
    expect(s.pending.options!.some((o) => o.action.type === 'chooseAttack' && o.action.additional)).toBe(true) // listed
    expect(s.activation!.perModel['A:L']!.initialAttacksLeft['sx.w.blade']).toBe(1)
    for (const tier of ['normal', 'easy'] as const) {
      const a = decide(s, tier)
      expect(a.type === 'chooseAttack' ? a.additional : false).toBe(false)
    }
  })

  it('AI-LEGAL every new decision has a legal answer and the random bot can answer it too', () => {
    const scenes: GameState[] = []
    const knocked = world([mk('A:L', 'sx.p.crit', 'A', 0, 0), mk('B:L', 'sx.p.foe', 'B', 2, 0, { conditions: ['knockedDown'] })])
    scenes.push(act(toCombat(knocked, 'A:L'), { type: 'chooseAttack', modelId: 'A:L', weaponId: 'sx.w.crit-blade', targetId: 'B:L', additional: false }))
    const lucky = world([mk('A:L', 'sx.p.lucky', 'A', 0, 0), mk('B:L', 'sx.p.foe', 'B', 2, 0)])
    let l = act(toCombat(lucky, 'A:L'), { type: 'chooseAttack', modelId: 'A:L', weaponId: 'sx.w.crit-blade', targetId: 'B:L', additional: false })
    force(l, 1, 2)
    l = act(l, { type: 'boostAttack', boost: false })
    scenes.push(l)
    for (const s of scenes) {
      const legal = legalActions(s)
      expect(legal.length).toBeGreaterThan(0)
      const p = pickSensible(s, s.pending, legal, 'x')
      expect(validate(s, p)).toBeNull()
    }
  })
})
