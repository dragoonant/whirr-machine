import { describe, expect, it } from 'vitest'
import { statOf } from '../../src/engine/code-hooks'
import { asOut, bundle, choose, place, send, startState, trySend, withModel } from './action-helpers'

const casterTurn = (seed = 'sp') => {
  let s = startState(seed).state
  s = place(s, 'A:e0', { x: 3, z: -10 })
  s = withModel(s, 'A:L', { focus: 6 })
  return choose(asOut(s), 'A:L')
}

describe('SPL spells, upkeep, feats', () => {
  it('SPL-001 a spell costs focus; COST > focus is rejected', () => {
    const o = casterTurn()
    const poor = { ...o, state: withModel(o.state, 'A:L', { focus: 1 }) }
    const r = trySend(poor, { type: 'castSpell', casterId: 'A:L', spellId: 'kha.s.superiority', targetId: 'A:e0' })
    expect(r && 'rejection' in r && r.rejection.code).toBe('E_INSUFFICIENT_FOCUS')
  })

  it('SPL-007/013 Superiority buffs the warjack (+2 SPD/MAT/DEF, no knockdown); a second upkeep on it replaces the first', () => {
    let o = casterTurn()
    const spd = statOf(o.state, bundle, 'A:e0', 'SPD')
    o = send(o, { type: 'castSpell', casterId: 'A:L', spellId: 'kha.s.superiority', targetId: 'A:e0' })
    expect(o.pending.kind).toBe('chooseMovement') // any-time: the decision is raised again
    expect(o.state.models['A:L']!.focus).toBe(4)
    expect(statOf(o.state, bundle, 'A:e0', 'SPD')).toBe(spd + 2)
    expect(o.state.effects.find((e) => e.sourceId === 'kha.s.superiority')!.forbid).toContain('knockDown')
    expect(Object.values(o.state.upkeeps).some((u) => u.friendly)).toBe(true)
    o = send(o, { type: 'castSpell', casterId: 'A:L', spellId: 'kha.s.avenging-force', targetId: 'A:e0' })
    expect(o.state.effects.some((e) => e.sourceId === 'kha.s.superiority')).toBe(false)
    expect(o.state.effects.some((e) => e.sourceId === 'kha.s.avenging-force')).toBe(true)
    expect(statOf(o.state, bundle, 'A:e0', 'SPD')).toBe(spd)
  })

  it('SPL-015 Deflection: +2 DEF against ranged and arcane, not melee; costs 3', () => {
    let s = startState('defl').state
    s = withModel(s, 'B:L', { focus: 6 })
    let o = asOut({ ...s, activePlayer: 'B', pending: { ...s.pending, kind: 'chooseActivation', player: 'B', id: 'd:900', options: [] }, decisionSeq: 900 })
    o = send(o, { type: 'chooseActivation', activate: 'B:L' })
    o = send(o, { type: 'castSpell', casterId: 'B:L', spellId: 'cyg.s.deflection' })
    expect(o.state.models['B:L']!.focus).toBe(3)
    const ranged = statOf(o.state, bundle, 'B:e0', 'DEF', { atk: { kind: 'ranged' } })
    const melee = statOf(o.state, bundle, 'B:e0', 'DEF', { atk: { kind: 'melee' } })
    expect(ranged).toBe(melee + 2)
    expect(o.state.effects.find((e) => e.sourceId === 'cyg.s.deflection')!.duration).toBe('round')
  })

  it('SPL-002 no spells in the middle of an attack; SPL-009 no channelling through a non-Arc-Node', () => {
    let s = startState('mid').state
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'B:e1', { x: 1.7, z: 0 })
    let o = choose(asOut(withModel(s, 'A:L', { focus: 6 })), 'A:L')
    o = send(o, { type: 'channel', via: null })
    const bad = trySend(o, { type: 'channel', via: 'A:e0' })
    expect(bad && 'rejection' in bad && bad.rejection.code).toBe('E_TARGET_INVALID')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:L' })
    o = send(o, { type: 'chooseCombatAction', modelId: 'A:L', choice: 'melee' })
    o = send(o, { type: 'chooseAttack', modelId: 'A:L', weaponId: 'kha.w.mechanika-axe', targetId: 'B:e1', additional: false })
    expect(o.pending.kind).toBe('boostAttack')
    const mid = trySend(o, { type: 'castSpell', casterId: 'A:L', spellId: 'kha.s.superiority', targetId: 'A:e0' })
    expect(mid && 'rejection' in mid && mid.rejection.code).toBe('E_WRONG_DECISION')
  })

  it('feat: Pall of Ashes places d3+3 clouds once per game', () => {
    let o = casterTurn('feat')
    o = send(o, { type: 'useFeat', casterId: 'A:L', featId: 'kha.f.pall-of-ashes' })
    expect(o.state.clouds.length).toBeGreaterThanOrEqual(4)
    expect(o.state.clouds.length).toBeLessThanOrEqual(6)
    expect(o.state.clouds.every((c) => c.diameter === 3 && !!c.effectId)).toBe(true)
    expect(o.state.models['A:L']!.featUsed).toBe(true)
    const again = trySend(o, { type: 'useFeat', casterId: 'A:L', featId: 'kha.f.pall-of-ashes' })
    expect(again && 'rejection' in again && again.rejection.code).toBe('E_ALREADY_USED')
  })

  it('heal: 1 focus removes 1 damage point of the caster', () => {
    const real = casterTurn('heal')
    const s = withModel(real.state, 'A:L', { damage: { track: 'single', filled: 4, boxes: 17 }, focus: 3 })
    const r = send({ ...real, state: s }, { type: 'heal', casterId: 'A:L', points: 2 })
    expect(r.state.models['A:L']!.focus).toBe(1)
    expect((r.state.models['A:L']!.damage as { filled: number }).filled).toBe(2)
  })
})
