import { describe, expect, it } from 'vitest'
import { applyEffect, expireEffects } from '../../src/engine/effects'
import { gainFocus, spendFocus, isRejection } from '../../src/engine/focus'
import { answerControl, continueControl, runControl } from '../../src/engine/phases/control'
import { runMaintenance } from '../../src/engine/phases/maintenance'
import { seedRng, roll } from '../../src/engine/rng'
import type { GameState } from '../../src/engine/types'
import { bundle, must, newGame, runSetup, withModel } from './turn-helpers'

// A mid-game state at the start of A's Control Phase (Vilkul = A:L, Razor = A:e0).
const base = (): GameState => ({ ...runSetup(newGame()).state })

describe('FOC focus economy', () => {
  it('FOC-002 a caster above ARC is trimmed in Maintenance; war-engines lose all focus', () => {
    let s = withModel(base(), 'A:L', { focus: 8 })
    s = withModel(s, 'A:e0', { focus: 2 })
    const r = runMaintenance(s, bundle)
    expect(r.state.models['A:L']!.focus).toBe(6)
    expect(r.state.models['A:e0']!.focus).toBe(0)
  })

  it('FOC-005 allocating to a war-engine outside CTRL is rejected', () => {
    let s = withModel(base(), 'A:L', { pos: { x: 0, z: -17 }, focus: 6 })
    s = withModel(s, 'A:e0', { pos: { x: 0, z: 5 }, focus: 0 })
    const pend = { ...s, pending: { ...s.pending, kind: 'allocateFocus' as const, canPass: true } }
    const r = answerControl(pend, bundle, { type: 'allocateFocus', decisionId: pend.pending.id, player: 'A', allocation: { 'A:e0': 1 } })
    expect(r).toHaveProperty('rejection.code', 'E_OUT_OF_CTRL')
  })

  it('FOC-006 upkeep: paid stays, unpaid expires', () => {
    const s0 = base()
    const e = applyEffect(s0, { sourceId: 'x.spell', name: 'Test Upkeep', owner: 'A', casterId: 'A:L', targetIds: ['A:L'], mods: [], duration: 'upkeep', upkeep: { casterId: 'A:L' } })
    const c = continueControl({ ...e.state, activePlayer: 'A' }, bundle, 'upkeep')
    expect(c.pending?.kind).toBe('payUpkeep')
    const keep = must(answerControl(c.state, bundle, { type: 'payUpkeep', decisionId: c.pending!.id, player: 'A', keep: [e.effect.id] }))
    const kept = keep
    expect(kept.state.effects.length).toBe(1)
    expect(kept.state.models['A:L']!.focus).toBe(s0.models['A:L']!.focus - 1)
    const drop = must(answerControl(c.state, bundle, { type: 'payUpkeep', decisionId: c.pending!.id, player: 'A', keep: [] }))
    expect(drop.state.effects.length).toBe(0)
    expect(drop.events.some((x) => x.type === 'EffectExpired' && x.reason === 'upkeepDropped')).toBe(true)
  })

  it('FOC-007/016 a knocked-down caster shakes with its own focus and stands; others cannot pay', () => {
    const s = withModel(withModel(base(), 'A:L', { conditions: ['knockedDown'], focus: 0 }), 'A:e0', { focus: 1, conditions: ['knockedDown'] })
    const c = continueControl({ ...s, activePlayer: 'A' }, bundle, 'shake')
    expect(c.pending?.kind).toBe('shake')
    // the caster has no focus of its own: only Razor (own 1 focus) is offered
    const opts = (c.pending!.context.data as { options: { modelId: string }[] }).options
    expect(opts.map((o) => o.modelId)).toEqual(['A:e0'])
    const bad = answerControl(c.state, bundle, { type: 'shake', decisionId: c.pending!.id, player: 'A', shake: [{ modelId: 'A:L', condition: 'knockedDown' }] })
    expect(bad).toHaveProperty('rejection.code', 'E_INSUFFICIENT_FOCUS')
    const ok = must(answerControl(c.state, bundle, { type: 'shake', decisionId: c.pending!.id, player: 'A', shake: [{ modelId: 'A:e0', condition: 'knockedDown' }] }))
    expect(ok.state.models['A:e0']!.conditions).not.toContain('knockedDown')
    expect(ok.state.models['A:e0']!.focus).toBe(0)
  })

  it('FOC-013 a disrupted war-engine loses its focus and cannot gain or spend any', () => {
    const s0 = withModel(base(), 'A:e0', { focus: 2 })
    const d = applyEffect(s0, { sourceId: 'x.disrupt', name: 'Disruption', owner: 'B', targetIds: ['A:e0'], mods: [], conditions: ['disrupted'], duration: 'round' })
    const m = runMaintenance({ ...d.state, activePlayer: 'A' }, bundle)
    expect(m.state.models['A:e0']!.focus).toBe(0)
    expect(gainFocus(m.state, 'A:e0', 1).gained).toBe(0)
    expect(isRejection(spendFocus(withModel(m.state, 'A:e0', { focus: 1 }), 'A:e0', 1, 'boostAttack'))).toBe(true)
    // Control: no power up, no allocation target
    const c = runControl({ ...m.state, activePlayer: 'A' }, bundle)
    expect(c.state.models['A:e0']!.focus).toBe(0)
  })
})

describe('COND conditions and durations', () => {
  const rollFirst = (seed: string): number => roll({ ...base(), rng: seedRng(seed), rollSeq: 0 } as GameState, { count: 1, sides: 6, purpose: 'continuous' }).event.dice[0]!
  const seedWith = (pred: (d: number) => boolean): string => { for (let i = 0; i < 200; i++) if (pred(rollFirst(`k${i}`))) return `k${i}`; throw new Error('no seed') }
  const burning = (seed: string): GameState => {
    const s = withModel(base(), 'B:e0', { conditions: ['fire'] }) // Deuce, ARM 18
    return withModel(withModel({ ...s, rng: seedRng(seed), activePlayer: 'B' }, 'A:e0', { conditions: ['fire'] }), 'B:L', {})
  }
  it('COND-005 fire expires on a 1-2 with no damage', () => {
    const r = runMaintenance(burning(seedWith((d) => d <= 2)), bundle)
    expect(r.state.models['B:e0']!.conditions).not.toContain('fire')
    expect(r.events.some((e) => e.type === 'DamageApplied')).toBe(false)
  })
  it('COND-006 fire on a 3-6 rolls POW 12 fire damage and stays', () => {
    const r = runMaintenance(burning(seedWith((d) => d >= 3)), bundle)
    expect(r.state.models['B:e0']!.conditions).toContain('fire')
    expect(r.events.some((e) => e.type === 'DamageApplied' && e.targetId === 'B:e0' && e.damageTypes.includes('fire'))).toBe(true)
  })
  it('COND-007 a Resistance: Fire model (Razor) is immune: the effect just drops', () => {
    const s = withModel(base(), 'A:e0', { conditions: ['fire'] })
    const r = runMaintenance(s, bundle)
    expect(r.state.models['A:e0']!.conditions).not.toContain('fire')
    expect(r.events.some((e) => e.type === 'DamageApplied')).toBe(false)
  })
  it('COND-008/009 a round effect outlives the opponent turn and ends at the start of its creator turn; a turn effect ends at end of turn', () => {
    let s: GameState = { ...base(), round: 1, turn: 1, activePlayer: 'A' }
    s = applyEffect(s, { sourceId: 'x.cloud', name: 'One Round', owner: 'A', targetIds: ['A:L'], mods: [], duration: 'round' }).state
    s = applyEffect(s, { sourceId: 'x.turn', name: 'One Turn', owner: 'A', targetIds: ['A:L'], mods: [], duration: 'turn' }).state
    s = expireEffects(s, 'turnEnd').state
    expect(s.effects.map((e) => e.name)).toEqual(['One Round'])
    s = { ...s, turn: 2, activePlayer: 'B' }
    expect(expireEffects(s, 'turnStart').state.effects.length).toBe(1) // B's turn start: still there
    s = { ...s, round: 2, turn: 3, activePlayer: 'A' }
    expect(expireEffects(s, 'turnStart').state.effects.length).toBe(0) // A's next turn: gone
  })
  it('R9.10 a same-named effect never stacks (keeps one instance)', () => {
    let s: GameState = { ...base(), round: 1, turn: 1, activePlayer: 'A' }
    const spec = { sourceId: 'x', name: 'Same', owner: 'A' as const, targetIds: ['A:L'], mods: [], duration: 'round' as const }
    s = applyEffect(s, spec).state
    s = applyEffect({ ...s, turn: 3 }, spec).state
    expect(s.effects.length).toBe(1)
    expect(s.effects[0]!.expires!.turn).toBe(5) // the later expiry wins
  })
})
