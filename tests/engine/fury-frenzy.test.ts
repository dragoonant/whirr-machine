// FURY-013..019: the frenzy activation (81 F7, steps FZ1-FZ7) and the vent decision.
import { describe, expect, it, vi } from 'vitest'

const FORCED = vi.hoisted(() => new Map<number, number[]>())
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
  }
})

import { answerControl, continueControl } from '../../src/engine/phases/control'
import { frenzyTarget } from '../../src/engine/phases/frenzy'
import { activatable } from '../../src/engine/turnflow'
import type { GameEvent } from '../../src/engine/events'
import type { GameState } from '../../src/engine/types'
import { BUNDLE as B, beast, enemyLeader, mk, warlock, world } from './fury-helpers'
import { must } from './turn-helpers'

const force = (s: GameState, ...rolls: number[][]): void => rolls.forEach((f, i) => FORCED.set(s.rollSeq + i, f))
const evs = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const rollsOf = (events: GameEvent[], purpose: string) => evs(events, 'DiceRolled').filter((e) => e.purpose === purpose)

// beast at (10,0), 50 mm (radius 0.984); the helpers below place a model `gap` inches of edge room away on the +x or -x side
const R_BEAST = 50 / 25.4 / 2
const edgeX = (side: 1 | -1, gap: number, mm: number): number => 10 + side * (R_BEAST + gap + mm / 25.4 / 2)
const frenzyWorld = (extra: ReturnType<typeof mk>[], beastPatch = {}): GameState =>
  world([warlock({ pos: { x: -20, z: 0 } }), beast('A:b1', 10, 0, { fury: 3, ...beastPatch }), enemyLeader({ pos: { x: 20, z: 20 } }), ...extra])

describe('FURY frenzy', () => {
  it('FURY-013 the closest model is the target, friend or foe: a friendly solo 2" away beats an enemy 3" away', () => {
    const s = frenzyWorld([mk('A:s', 'f.s', 'A', edgeX(1, 2, 30), 0), mk('B:e', 'f.e', 'B', edgeX(-1, 3, 40), 0)])
    expect(frenzyTarget(s, B, 'A:b1')).toMatchObject({ tiedIds: ['A:s'], friendly: true, canCharge: true })
    force(s, [6, 6])
    const r = continueControl(s, B, 'threshold')
    expect(evs(r.events, 'Frenzied')).toMatchObject([{ beastId: 'A:b1', targetId: 'A:s', tiedIds: ['A:s'] }])
    expect(evs(r.events, 'ChargeResolved')).toMatchObject([{ targetId: 'A:s', success: true }])
    expect(evs(r.events, 'AttackDeclared')).toMatchObject([{ attackerId: 'A:b1', targetId: 'A:s' }])
    expect(r.state.models['A:b1']!.pos.x).toBeGreaterThan(10) // it moved toward the friendly solo
  })

  it('FURY-014 a tie is settled by one seeded roll-off and is repeatable', () => {
    const mkS = () => frenzyWorld([mk('A:s1', 'f.s', 'A', edgeX(1, 2, 30), 0), mk('A:s2', 'f.s', 'A', edgeX(-1, 2, 30), 0)])
    const s = mkS()
    expect(frenzyTarget(s, B, 'A:b1').tiedIds).toEqual(['A:s1', 'A:s2'])
    force(s, [6, 6], [1, 6])
    const r = continueControl(s, B, 'threshold')
    expect(rollsOf(r.events, 'frenzyTie')).toHaveLength(1)
    expect(evs(r.events, 'Frenzied')).toMatchObject([{ tiedIds: ['A:s1', 'A:s2'], targetId: 'A:s2', tieRollId: expect.any(String) }])
    // replay: the same state and dice give the same pick; a different roll-off picks the other model
    const s2 = mkS(); force(s2, [6, 6], [1, 6])
    expect(evs(continueControl(s2, B, 'threshold').events, 'Frenzied')[0]!.targetId).toBe('A:s2')
    const s3 = mkS(); force(s3, [6, 6], [6, 1])
    expect(evs(continueControl(s3, B, 'threshold').events, 'Frenzied')[0]!.targetId).toBe('A:s1')
  })

  it('FURY-015 no model in LOS: no movement, the vent decision is raised, and the beast does not activate again', () => {
    const s = world([warlock({ offTable: true }), beast('A:b1', 10, 0, { fury: 3 }), enemyLeader({ offTable: true })])
    force(s, [6, 6])
    const r = continueControl(s, B, 'threshold')
    expect(evs(r.events, 'Frenzied')).toMatchObject([{ targetId: null, reason: 'noTarget' }])
    expect(evs(r.events, 'ModelMoved')).toEqual([])
    expect(r.pending?.kind).toBe('adjustFury')
    expect(r.state.models['A:b1']).toMatchObject({ activated: true, frenzied: false })
    expect(activatable({ ...r.state, models: { ...r.state.models, 'A:L': { ...r.state.models['A:L']!, offTable: false } } }, 'A')).not.toContain('A:b1')
  })

  it('FURY-016 a knocked-down, engaged beast stands up free of charge and still charges the closest model', () => {
    const s = frenzyWorld([mk('B:e', 'f.e', 'B', edgeX(-1, 0.3, 40), 0)], { conditions: ['knockedDown'] })
    force(s, [6, 6])
    const r = continueControl(s, B, 'threshold')
    expect(evs(r.events, 'ConditionRemoved')).toMatchObject([{ modelId: 'A:b1', condition: 'knockedDown', reason: 'frenzy' }])
    expect(evs(r.events, 'BeastForced')).toEqual([])
    expect(evs(r.events, 'ChargeResolved')).toMatchObject([{ targetId: 'B:e', success: true }])
    expect(r.state.models['A:b1']!.conditions).toEqual([])
  })

  it('FURY-017 the highest-POW melee weapon attacks with a free attack boost; moving 3"+ also boosts damage', () => {
    const run = (gap: number) => {
      const s = frenzyWorld([mk('B:e', 'f.e', 'B', edgeX(-1, gap, 40), 0)])
      force(s, [6, 6], [6, 6, 6], [2, 2, 2])
      return continueControl(s, B, 'threshold')
    }
    const far = run(4)
    expect(evs(far.events, 'AttackDeclared')).toMatchObject([{ weaponId: 'f.bite', targetId: 'B:e' }])
    expect(evs(far.events, 'RollBoosted').map((e) => `${e.roll}:${e.source}`)).toEqual(['attack:frenzy', 'damage:frenzy'])
    expect(evs(far.events, 'ChargeResolved')).toMatchObject([{ chargeAttack: true }])
    expect(rollsOf(far.events, 'attack')[0]!.dice).toHaveLength(3)
    expect(rollsOf(far.events, 'damage')[0]!.dice).toHaveLength(3) // boosted
    const near = run(2)
    expect(evs(near.events, 'RollBoosted').map((e) => `${e.roll}:${e.source}`)).toEqual(['attack:frenzy'])
    expect(rollsOf(near.events, 'damage')[0]!.dice).toHaveLength(2)
  })

  it('FURY-018 a frenzy activation makes exactly one attack, forces nothing, and ends at once', () => {
    const s = frenzyWorld([mk('B:e', 'f.e', 'B', edgeX(-1, 1, 40), 0)])
    force(s, [6, 6], [6, 6, 6])
    const r = continueControl(s, B, 'threshold')
    expect(evs(r.events, 'AttackDeclared')).toHaveLength(1)
    expect(evs(r.events, 'BeastForced')).toEqual([])
    expect(evs(r.events, 'SpellCast')).toEqual([])
    expect(evs(r.events, 'ActivationEnded')).toMatchObject([{ activeId: 'A:b1', reason: 'frenzy' }])
    expect(r.state.models['A:b1']).toMatchObject({ activated: true, frenzied: false })
    expect(r.state.activation).toBeNull()
    expect(r.state.models['A:b1']!.fury).toBe(3) // a frenzy attack adds no fury
  })

  it('FURY-019 the vent decision lists 0..-fury; venting 2 leaves 1 and the next beast is checked', () => {
    const s = world([warlock({ pos: { x: -20, z: 0 } }), beast('A:b1', 10, 0, { fury: 3 }), beast('A:b2', 14, 0, { fury: 1 }), enemyLeader({ offTable: true })])
    force(s, [6, 6], [1, 1, 1], [1, 1]) // b1 fails, its attack at b2 misses; then b2's check rolls low
    const r1 = continueControl(s, B, 'threshold')
    expect(r1.pending?.kind).toBe('adjustFury')
    const deltas = r1.pending!.options!.map((o) => (o.action as { delta: number }).delta)
    expect(deltas.map((d) => Math.abs(d)).sort()).toEqual([0, 1, 2, 3])
    expect(r1.pending!.options![0]!.id).toBe('removeAll')
    const pick = r1.pending!.options!.find((o) => (o.action as { delta: number }).delta === -2)!
    const r2 = must(answerControl(r1.state, B, pick.action))
    expect(r2.state.models['A:b1']!.fury).toBe(1)
    expect(evs(r2.events, 'FrenzyEnded')).toMatchObject([{ beastId: 'A:b1', vented: 2 }])
    expect(evs(r2.events, 'ThresholdChecked')).toMatchObject([{ beastId: 'A:b2', frenzied: false }])
    expect(r2.state.thresholdQueue).toBeUndefined()
    // a vent larger than the fury is rejected
    expect(answerControl(r1.state, B, { ...pick.action, delta: -4 } as never)).toHaveProperty('rejection.code', 'E_INSUFFICIENT_FURY')
  })
})

// FURY-020..024: the frenzy attack runs through the real attack pipeline (81 E4, F7 FZ5/FZ6, F8.c, F10.5), not a hand-rolled copy.
import type { Action } from '../../src/engine/actions'
import { handleActivationAction } from '../../src/engine/phases/activation'
import { query } from '../../src/engine/index'
import type { FlowOut } from '../../src/engine/pending'

const answer = (out: { state: GameState; events: GameEvent[]; pending: NonNullable<ReturnType<typeof continueControl>['pending']> }, a: Record<string, unknown>) => {
  const r = handleActivationAction(out.state, B, { ...a, decisionId: out.pending.id, player: out.pending.player } as unknown as Action)
  if (!r) throw new Error(`not an activation action: ${String(a.type)}`)
  const res = must(r)
  return { state: res.state, events: [...out.events, ...res.events], pending: res.pending }
}
const asFlow = (r: ReturnType<typeof continueControl>): FlowOut => ({ state: r.state, events: r.events, pending: r.pending! })
const WX = 10 + R_BEAST + 2 + 40 / 25.4 / 2 // a 40 mm model 2" of edge room off the beast's +x side (no 3" charge, so no damage boost)

describe('FURY frenzy runs through the attack pipeline', () => {
  it('FURY-020 a frenzy hit on its own warlock raises the transfer prompt; keeping it ends the activation and the vent follows', () => {
    const s = world([
      warlock({ pos: { x: WX, z: 0 }, fury: 6 }), beast('A:b1', 10, 0, { fury: 3 }), beast('A:b2', WX, 6, { fury: 0 }), enemyLeader({ pos: { x: 20, z: 20 } }),
    ])
    force(s, [6, 6], [6, 6, 6], [6, 6]) // threshold; boosted attack; 14 + 12 - ARM 15 = 11 points
    const r = continueControl(s, B, 'threshold')
    expect(evs(r.events, 'Frenzied')).toMatchObject([{ targetId: 'A:L' }])
    expect(r.pending?.kind).toBe('transferDamage')
    expect(r.pending!.options!.map((o) => o.id)).toEqual(['to:A:b2', 'keep'])
    expect(r.state.activation).toMatchObject({ frenzy: { beastId: 'A:b1', targetId: 'A:L' } })
    const kept = answer(asFlow(r), { type: 'transferDamage', toId: null })
    expect(evs(kept.events, 'DamageApplied').filter((e) => e.targetId === 'A:L')).toMatchObject([{ points: 11 }])
    expect(evs(kept.events, 'AttackFinished')).toHaveLength(1)
    expect(evs(kept.events, 'ActivationEnded')).toMatchObject([{ activeId: 'A:b1', reason: 'frenzy' }])
    expect(kept.state.activation).toBeNull()
    expect(kept.state.models['A:b1']).toMatchObject({ activated: true, frenzied: false })
    expect(kept.pending.kind).toBe('adjustFury') // FZ7 comes after the attack is fully resolved
  })

  it('FURY-021 a Mind and Body crippled beast rolls one die fewer on the attack and on the damage roll', () => {
    const s = frenzyWorld([mk('B:e', 'f.e', 'B', WX, 0)], { crippled: ['m', 'b'] })
    force(s, [6, 6], [6, 6], [6])
    const r = continueControl(s, B, 'threshold')
    expect(rollsOf(r.events, 'attack')[0]!.dice).toHaveLength(2) // 2 - 1 (Mind) + 1 (free boost)
    expect(rollsOf(r.events, 'damage')[0]!.dice).toHaveLength(1) // 2 - 1 (Body), no charge boost at 2"
  })

  it('FURY-022 a frenzied hit offers the target its Power Field decision', () => {
    B.byId['f.pf'] = { ...(B.byId['f.e'] as object), id: 'f.pf', abilities: ['core.a.power-field'] } as never
    const s = frenzyWorld([mk('B:e', 'f.pf', 'B', WX, 0, { focus: 1 })])
    force(s, [6, 6], [6, 6, 6], [6, 6])
    const r = continueControl(s, B, 'threshold')
    expect(r.pending?.kind).toBe('powerField')
    expect(r.pending!.player).toBe('B')
    const o = answer(asFlow(r), { ...(r.pending!.options!.find((x) => x.id === 'spend')!.action as object) })
    expect(evs(o.events, 'PowerFieldUsed')).toHaveLength(1)
    expect(evs(o.events, 'ActivationEnded')).toMatchObject([{ reason: 'frenzy' }])
    expect(o.state.models['B:e']!.focus).toBe(0)
  })

  it('FURY-023 a beast that cannot charge loses its activation even with a target in reach', () => {
    const half = 120 / 25.4 / 2
    const s = world([warlock({ pos: { x: -20, z: 0 } }), beast('A:b1', 10, 0, { fury: 3, base: 120 }), mk('B:e', 'f.e', 'B', 10 + half + 0.5 + 40 / 25.4 / 2, 0), enemyLeader({ pos: { x: 20, z: 20 } })])
    force(s, [6, 6])
    const r = continueControl(s, B, 'threshold')
    expect(evs(r.events, 'Frenzied')).toMatchObject([{ targetId: 'B:e', reason: 'cannotCharge' }])
    expect(evs(r.events, 'AttackDeclared')).toEqual([])
    expect(evs(r.events, 'ActivationEnded')).toMatchObject([{ reason: 'frenzy' }])
    expect(r.pending?.kind).toBe('adjustFury')
  })

  it('FURY-024 query.threat: a beast that cannot be forced shows no run or slam, and a forceable one needs a force', () => {
    const s = world([warlock(), beast('A:near', 3, 0), beast('A:far', 40, 0), mk('B:e', 'f.e', 'B', 10, 5), enemyLeader()])
    const near = query.threat(s, 'A:near')
    expect(near).toMatchObject({ needsForce: true, run: 10, slam: 8 })
    const far = query.threat(s, 'A:far')
    expect(far).toMatchObject({ needsForce: true, run: far.advance, slam: null })
    expect(far.charge).toBeLessThan(near.charge)
    expect(query.threat(s, 'B:e').needsForce).toBeUndefined()
  })
})
