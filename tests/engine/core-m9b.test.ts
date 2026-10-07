// M9 core pass, part two: special actions, spells and out-of-turn windows through the real pipeline (see core-m9.test.ts).
import { describe, expect, it } from 'vitest'
import { abilitiesOf, statOf } from '../../src/engine/code-hooks'
import { applyEffect, effectsOn } from '../../src/engine/effects'
import { losReport } from '../../src/engine/los'
import { forceExpire } from '../../src/engine/spells'
import type { GameEvent } from '../../src/engine/events'
import type { FlowOut } from '../../src/engine/pending'
import type { GameSetup, GameState } from '../../src/engine/types'
import { asOut, bundle, choose, place, send, settle, withModel } from './action-helpers'
import { newGame, runControlTo, runSetup } from './turn-helpers'

const setupOf = (a: string): GameSetup => ({ scenario: 'scn-qs-demo', lists: { A: a, B: 'cyg.l.qs-recon' } })
const startList = (a: string, seed: string): GameState => runControlTo(runSetup(newGame(setupOf(a), seed))).state
function park(s: GameState, keep: string[]): GameState {
  let i = 0
  for (const m of Object.values(s.models)) {
    if (keep.includes(m.id)) continue
    s = place(s, m.id, { x: -16 + (i % 8) * 4, z: 16 - Math.floor(i / 8) * 3 })
    i++
  }
  return s
}
type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>
const evs = <T extends GameEvent['type']>(es: GameEvent[], t: T): Ev<T>[] => es.filter((e): e is Ev<T> => e.type === t)
const CRY = 'cry.l.necro-recon', CIR = 'cir.l.starter-recon'
const marked = (m: GameState['models'][string]): number => (m.damage.track === 'grid' ? m.damage.grids.reduce((n, g) => n + g.cols.flat().filter(Boolean).length, 0) : m.damage.filled)
const hurtGrid = (m: GameState['models'][string]): GameState['models'][string]['damage'] => {
  if (m.damage.track !== 'grid') return m.damage
  return { track: 'grid', grids: m.damage.grids.map((g) => ({ ...g, cols: g.cols.map((c, ci) => c.map((v, i) => (ci < 2 && i < 2 ? true : v))) })) }
}
const toCombat = (s: GameState, id: string): FlowOut => {
  let o = choose(asOut(s), id)
  while (o.pending.kind === 'abilityChoice') o = send(o, { type: 'abilityChoice', optionId: 'skip' })
  return send(o, { type: 'chooseMovement', option: 'forfeit', modelId: id })
}
const special = (o: FlowOut, abilityId: string, targetId?: string) =>
  o.pending.options!.find((x) => x.action.type === 'chooseCombatAction' && (x.action as { abilityId?: string }).abilityId === abilityId && (!targetId || (x.action as { targetId?: string }).targetId === targetId))
const raw = (a: unknown): Record<string, unknown> => a as Record<string, unknown>

describe('CORE-M9b special actions and spells through the real pipeline', () => {
  it('CORE-050 Repair is a special action on a friendly construct in 1 inch; it heals and uses the Combat Action', () => {
    let s = startList(CRY, 'core-50')
    s = park(s, ['A:e0', 'A:e1'])
    s = place(s, 'A:e0', { x: 0, z: 0 }); s = place(s, 'A:e1', { x: 0, z: 2.4 })
    s = withModel(s, 'A:e0', { damage: hurtGrid(s.models['A:e0']!) })
    const before = marked(s.models['A:e0']!)
    let o = toCombat(s, 'A:e1')
    const rep = special(o, 'cry.a.repair', 'A:e0')
    expect(rep, 'Repair is offered on the damaged construct').toBeDefined()
    o = send(o, raw(rep!.action))
    expect(marked(o.state.models['A:e0']!)).toBeLessThan(before)
    expect(o.pending.kind).toBe('chooseActivation') // Chatterbane's Combat Action is used up, so its activation is over
  })

  it('CORE-051 Ancillary Attack makes a friendly war-engine attack at once', () => {
    let s = startList(CRY, 'core-51')
    s = park(s, ['A:e0', 'A:e1', 'B:e0'])
    s = place(s, 'A:e0', { x: 0, z: 0 }); s = place(s, 'A:e1', { x: 3, z: -1 }); s = place(s, 'B:e0', { x: 0, z: 9 }, { damage: { track: 'single', boxes: 100, filled: 0 } })
    let o = toCombat(s, 'A:e1')
    const anc = special(o, 'cry.a.ancillary-attack', 'A:e0')
    expect(anc).toBeDefined()
    o = send(o, raw(anc!.action))
    o = settle(o)
    expect(evs(o.events, 'AttackDeclared').some((e) => e.attackerId === 'A:e0'), 'Hades attacked').toBe(true)
  })

  it('CORE-052 Enliven leaves an effect that lets the damaged model advance after an enemy hit', () => {
    let s = startList(CRY, 'core-52')
    s = park(s, ['A:e0', 'A:e1'])
    s = place(s, 'A:e0', { x: 0, z: 0 }); s = place(s, 'A:e1', { x: 0, z: 2.4 })
    let o = toCombat(s, 'A:e1')
    const en = special(o, 'cry.a.enliven', 'A:e0')
    expect(en).toBeDefined()
    o = send(o, raw(en!.action))
    const e = o.state.effects.find((x) => x.sourceId === 'cry.a.enliven')!
    expect(e.targetIds).toEqual(['A:e0'])
    expect((e as unknown as { afterDamageAdvance: number }).afterDamageAdvance).toBe(6)
  })

  it('CORE-053 a Fury\'s Stygian Abyss is an arcane star attack with a weapon not on its card; Marionette is not offered', () => {
    let s = startList(CRY, 'core-53')
    s = park(s, ['A:u2.1', 'A:u2.2', 'A:u2.3', 'B:e0'])
    s = place(s, 'A:u2.1', { x: 0, z: 0 }); s = place(s, 'A:u2.2', { x: 2, z: 0 }); s = place(s, 'A:u2.3', { x: -2, z: 0 }); s = place(s, 'B:e0', { x: 0, z: 8 })
    let o = choose(asOut(s), 'A:u2')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:u2.1' })
    expect(special(o, 'cry.a.stygian-abyss') ?? o.pending.options!.find((x) => (x.action as { abilityId?: string }).abilityId === 'cry.a.stygian-abyss')).toBeDefined()
    expect(o.pending.options!.some((x) => (x.action as { abilityId?: string }).abilityId === 'cry.a.marionette')).toBe(false)
    expect(special(o, 'cry.a.power-of-death')).toBeDefined()
    const sa = o.pending.options!.find((x) => (x.action as { abilityId?: string }).abilityId === 'cry.a.stygian-abyss')!
    o = send(o, raw(sa.action))
    const shot = o.pending.options!.find((x) => x.action.type === 'chooseAttack')
    expect(shot).toBeDefined()
    o = send(o, raw(shot!.action))
    const decl = evs(o.events, 'AttackDeclared')[0]!
    expect(decl.kind).toBe('arcane')
    expect(decl.weaponId).toBe('cry.w.stygian-abyss')
  })

  it('CORE-054 Power of Death adds 2 to the melee damage of friendly undead for the turn', () => {
    let s = startList(CRY, 'core-54')
    s = park(s, ['A:u2.1', 'A:u2.2', 'A:u2.3', 'A:e1'])
    s = place(s, 'A:u2.1', { x: 0, z: 0 }); s = place(s, 'A:u2.2', { x: 2, z: 0 }); s = place(s, 'A:u2.3', { x: -2, z: 0 }); s = place(s, 'A:e1', { x: 0, z: 4 })
    let o = choose(asOut(s), 'A:u2')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:u2.1' })
    o = send(o, raw(special(o, 'cry.a.power-of-death')!.action))
    const e = o.state.effects.find((x) => x.sourceId === 'cry.a.power-of-death')!
    expect(e.targetIds).toEqual(expect.arrayContaining(['A:u2.1', 'A:u2.2', 'A:e1']))
    expect((e as unknown as { rollMods: { roll: string; value: number }[] }).rollMods[0]).toMatchObject({ roll: 'damage', value: 2 })
  })

  it('CORE-055 Blood Rage buys extra melee attacks with corpse tokens', () => {
    let s = startList(CIR, 'core-55')
    s = park(s, ['A:e1', 'B:e0'])
    s = place(s, 'A:e1', { x: 0, z: 0 }); s = place(s, 'B:e0', { x: 0, z: 1.6 }, { damage: { track: 'single', boxes: 100, filled: 0 } })
    s = withModel(s, 'A:e1', { tokens: { corpse: 2 } })
    let o = toCombat(s, 'A:e1')
    const rage = special(o, 'cir.a.blood-rage')
    expect(rage).toBeDefined()
    o = send(o, raw(rage!.action))
    expect(o.state.models['A:e1']!.tokens?.corpse ?? 0).toBe(0)
    o = send(o, { type: 'chooseCombatAction', modelId: 'A:e1', choice: 'melee' })
    const left = Object.values(o.state.activation!.perModel['A:e1']!.initialAttacksLeft).reduce((a, b) => a + b, 0)
    expect(left).toBeGreaterThanOrEqual(3) // the weapons' own attacks plus the two bought
  })

  it('CORE-056 Admonition: an enemy ending a move near the ward gives its model a 3 inch advance, and the spell ends', () => {
    let s = startList(CIR, 'core-56')
    s = park(s, ['A:e0', 'B:e0'])
    s = place(s, 'A:e0', { x: 0, z: 0 }); s = place(s, 'B:e0', { x: 0, z: 13 })
    s = applyEffect(s, { sourceId: 'cir.s.admonition', name: 'Admonition', owner: 'A', casterId: 'A:L', targetIds: ['A:e0'], mods: [], duration: 'upkeep', upkeep: { casterId: 'A:L' } }).state
    s = { ...s, activePlayer: 'B', pending: { ...s.pending, kind: 'chooseActivation', player: 'B', id: 'd:901', options: [] }, decisionSeq: 901 }
    let o = choose(asOut(s), 'B:e0')
    o = send(o, { type: 'chooseMovement', option: 'advance', modelId: 'B:e0' })
    o = send(o, { type: 'moveModel', modelId: 'B:e0', path: [{ x: 0, z: 7.5 }] })
    expect(o.pending.kind).toBe('moveModel')
    expect(o.pending.player).toBe('A')
    expect((o.pending.context.data!.trigger as { ctx: string }).ctx).toBe('ward')
    o = send(o, { type: 'moveModel', modelId: 'A:e0', path: [{ x: 0, z: 2.5 }] })
    expect(o.state.models['A:e0']!.pos.z).toBeCloseTo(2.5)
    expect(o.state.effects.some((e) => e.sourceId === 'cir.s.admonition')).toBe(false)
    expect(o.pending.player).toBe('B') // back to the mover's combat choice
  })

  it('CORE-057 Exhaust Fumes: friends within 3 inches of Chatterbane get concealment after it advances', () => {
    let s = startList(CRY, 'core-57')
    s = park(s, ['A:e0', 'A:e1', 'B:e0'])
    s = place(s, 'A:e0', { x: 4, z: 0 }); s = place(s, 'A:e1', { x: 0, z: 0 }); s = place(s, 'B:e0', { x: 4, z: 12 })
    let o = choose(asOut(s), 'A:e1')
    while (o.pending.kind === 'abilityChoice') o = send(o, { type: 'abilityChoice', optionId: 'skip' })
    o = send(o, { type: 'chooseMovement', option: 'advance', modelId: 'A:e1' })
    o = send(o, { type: 'moveModel', modelId: 'A:e1', path: [{ x: 2, z: 3 }] })
    const fumes = o.state.effects.find((e) => e.sourceId === 'cry.a.exhaust-fumes')
    expect(fumes?.targetIds).toContain('A:e0')
    expect(losReport(o.state, 'B:e0', 'A:e0').visible).toBe(true)
  })

  it('CORE-058 Crippling Grasp is an offensive upkeep debuff: on a hit it lowers melee damage and ARM (loop seeds)', () => {
    let landed = false
    for (let i = 0; i < 80 && !landed; i++) {
      let s = startList(CRY, 'core-58-' + i)
      s = park(s, ['A:L', 'B:e0'])
      s = place(s, 'A:L', { x: 0, z: 0 }); s = place(s, 'B:e0', { x: 0, z: 6 })
      s = withModel(s, 'A:L', { focus: 6 })
      let o = choose(asOut(s), 'A:L')
      o = send(o, { type: 'castSpell', casterId: 'A:L', spellId: 'cry.s.crippling-grasp', targetId: 'B:e0' })
      o = settle(o)
      const e = o.state.effects.find((x) => x.sourceId === 'cry.s.crippling-grasp')
      if (!e) continue
      landed = true
      expect(e.targetIds).toEqual(['B:e0'])
      expect((e as unknown as { rollMods: unknown[] }).rollMods).toEqual([{ roll: 'damage', value: -2, kinds: ['melee', 'power'] }])
      expect(statOf(o.state, bundle, 'B:e0', 'ARM')).toBe(statOf(s, bundle, 'B:e0', 'ARM') - 2)
    }
    expect(landed).toBe(true)
  })

  it('CORE-059 Venom is a spray spell that rolls AAT against every model on the line', () => {
    let s = startList(CRY, 'core-59')
    s = park(s, ['A:L', 'B:e0', 'B:e1'])
    s = place(s, 'A:L', { x: 0, z: 0 }); s = place(s, 'B:e0', { x: 0, z: 4 }); s = place(s, 'B:e1', { x: 0, z: 7 })
    s = withModel(s, 'A:L', { focus: 6 })
    let o = choose(asOut(s), 'A:L')
    o = send(o, { type: 'castSpell', casterId: 'A:L', spellId: 'cry.s.venom', targetId: 'B:e0' })
    expect(evs(o.events, 'AttackDeclared')[0]!.kind).toBe('spray')
    o = settle(o)
    expect(evs(o.events, 'DiceRolled').filter((r) => r.purpose === 'attack').length).toBe(2) // both models on the line
  })

  it('CORE-060 Vital Magic keeps an upkeep spell a forced expiry would end, for d3 damage', () => {
    let s = startList(CRY, 'core-60')
    s = applyEffect(s, { sourceId: 'cry.s.mirage', name: 'Mirage', owner: 'A', casterId: 'A:L', targetIds: ['A:e0'], mods: [], duration: 'upkeep', upkeep: { casterId: 'A:L' } }).state
    const id = s.effects[0]!.id
    expect(abilitiesOf(s, bundle, 'A:L')).toContain('cry.a.vital-magic')
    const r = forceExpire(s, bundle, [id])
    expect(r.state.effects.some((e) => e.id === id)).toBe(true) // kept
    expect(marked(r.state.models['A:L']!)).toBeGreaterThanOrEqual(1)
    // an enemy's forced expiry of a spell with no Vital Magic user simply ends it
    const plain = applyEffect(s, { sourceId: 'cyg.s.x', name: 'Other', owner: 'B', casterId: 'B:L', targetIds: ['A:e0'], mods: [], duration: 'upkeep', upkeep: { casterId: 'B:L' } })
    expect(forceExpire(plain.state, bundle, [plain.effect.id]).state.effects.some((e) => e.id === plain.effect.id)).toBe(false)
    expect(effectsOn(r.state, 'A:e0').length).toBe(1)
  })

  it('CORE-061 Grappling Hook: the focus is paid when the 5 inch move is taken, not when it is offered', () => {
    let s = startList(CRY, 'core-61')
    s = park(s, ['A:L'])
    s = place(s, 'A:L', { x: 0, z: 0 }, { focus: 4 })
    let o = toCombat(s, 'A:L')
    o = send(o, { type: 'chooseCombatAction', modelId: 'A:L', choice: 'forfeit' })
    expect(o.pending.kind).toBe('moveModel') // the hook's offer
    expect(o.state.models['A:L']!.focus).toBe(4)
    const move = o.pending.options!.find((x) => x.id !== 'tm0')!
    const taken = send(o, raw(move.action))
    expect(taken.state.models['A:L']!.focus).toBe(3)
    const declined = send(o, { type: 'pass' })
    expect(declined.state.models['A:L']!.focus).toBe(4)
  })
})
