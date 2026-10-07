// M9 core pass, part four: fury casting, start-of-activation offers, option lists and payments (see core-m9.test.ts).
import { describe, expect, it } from 'vitest'
import { statOf, weaponRangeFor, weaponsOf } from '../../src/engine/code-hooks'
import { applyEffect } from '../../src/engine/effects'
import { losReport } from '../../src/engine/los'
import type { GameEvent } from '../../src/engine/events'
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
const CRY = 'cry.l.necro-recon', TRL = 'trl.l.starter-recon'
const raw = (a: unknown): Record<string, unknown> => a as Record<string, unknown>
const marked = (m: GameState['models'][string]): number => (m.damage.track === 'grid' ? m.damage.grids.reduce((n, g) => n + g.cols.flat().filter(Boolean).length, 0) : m.damage.filled)

describe('CORE-M9d fury casting and offers', () => {
  it('CORE-080 Gunnbjorn casts Guided Fire for fury and the Bomber casts its own animus (Far Strike) forced', () => {
    let s = startList(TRL, 'core-80')
    s = park(s, ['A:L', 'A:e0'])
    s = place(s, 'A:L', { x: 0, z: 0 }, { fury: 6 }); s = place(s, 'A:e0', { x: 3, z: 0 })
    let o = choose(asOut(s), 'A:L')
    const gf = o.pending.options!.find((x) => x.action.type === 'castSpell' && (x.action as { spellId: string }).spellId === 'trl.s.guided-fire')
    expect(gf, 'Guided Fire is offered').toBeDefined()
    expect(gf!.cost?.fury).toBe(3)
    o = send(o, raw(gf!.action))
    expect(o.state.models['A:L']!.fury).toBe(3)
    expect(o.state.effects.some((e) => e.sourceId === 'trl.s.guided-fire' && e.targetIds.includes('A:e0'))).toBe(true)
    // the Bomber's own activation: Far Strike lengthens its ranged weapons by 3
    let t = choose(asOut({ ...s, models: { ...s.models } }), 'A:e0')
    t = send(t, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e0' })
    const an = t.pending.options!.find((x) => x.action.type === 'castSpell' && (x.action as { spellId: string }).spellId === 'trl.s.far-strike')
    expect(an, 'the animus is offered to the beast').toBeDefined()
    expect(an!.cost?.forced).toBeGreaterThanOrEqual(0)
    const before = t.state.models['A:e0']!.fury ?? 0
    t = send(t, raw(an!.action))
    expect(t.state.models['A:e0']!.fury).toBe(before + 1)
    const bomb = weaponsOf(bundle, t.state.models['A:e0']!).find((w) => w.weaponId === 'trl.w.powder-bomb')!
    expect(weaponRangeFor(t.state, 'A:e0', bomb.w)).toBe(weaponRangeFor(s, 'A:e0', bomb.w) + 3)
  })

  it('CORE-081 Regeneration at activation.start is offered to a damaged Troll and forces it', () => {
    let s = startList(TRL, 'core-81')
    s = park(s, ['A:L', 'A:e0'])
    s = place(s, 'A:L', { x: 0, z: 0 }, { fury: 6 }); s = place(s, 'A:e0', { x: 3, z: 0 })
    const g = s.models['A:e0']!.damage
    if (g.track !== 'grid') throw new Error('spiral expected')
    s = withModel(s, 'A:e0', { damage: { track: 'grid', grids: g.grids.map((x) => ({ ...x, cols: x.cols.map((c, ci) => c.map((v, i) => (ci === 0 && i < 3 ? true : v))) })) } })
    let o = choose(asOut(s), 'A:e0')
    expect(o.pending.kind).toBe('abilityChoice')
    expect(o.pending.context.data?.code).toBe('startTrigger')
    const before = marked(o.state.models['A:e0']!)
    o = send(o, { type: 'abilityChoice', optionId: 'use' })
    expect(o.state.models['A:e0']!.fury).toBe(1) // forced once
    expect(marked(o.state.models['A:e0']!)).toBeLessThan(before)
    expect(o.pending.kind).toBe('chooseMovement')
  })

  it('CORE-082 targeted spells are offered on every friend or enemy they can reach, not only war-engines', () => {
    let s = startList(CRY, 'core-82')
    s = park(s, ['A:L', 'A:e1', 'A:e0', 'B:e0'])
    s = place(s, 'A:L', { x: 0, z: 0 }); s = place(s, 'A:e1', { x: 3, z: 0 }); s = place(s, 'A:e0', { x: -3, z: 0 }); s = place(s, 'B:e0', { x: 0, z: 6 })
    s = withModel(s, 'A:L', { focus: 6 })
    const o = choose(asOut(s), 'A:L')
    const casts = o.pending.options!.filter((x) => x.action.type === 'castSpell').map((x) => `${(x.action as { spellId: string }).spellId}>${(x.action as { targetId?: string }).targetId}`)
    expect(casts).toContain('cry.s.banishing-ward>A:e1') // Chatterbane is a solo, not a war-engine
    expect(casts).toContain('cry.s.crimson-veil>A:e1')
    expect(casts).toContain('cry.s.crippling-grasp>B:e0') // an enemy
    expect(casts.some((c) => c.startsWith('cry.s.crippling-grasp>A:'))).toBe(false)
  })

  it('CORE-083 Shadow Fire: a model it hit stops blocking line of sight', () => {
    let s = startList(CRY, 'core-83')
    s = park(s, ['A:L', 'B:e0', 'B:e1'])
    s = place(s, 'A:L', { x: 0, z: 0 }); s = place(s, 'B:e1', { x: 0, z: 4 }, { base: 50 }); s = place(s, 'B:e0', { x: 0, z: 9 })
    expect(losReport(s, 'A:L', 'B:e0').visible).toBe(false)
    s = applyEffect(s, { sourceId: 'cry.a.shadow-fire', name: 'Shadow Fire', owner: 'A', targetIds: ['B:e1'], mods: [], forbid: ['blocksLos'], duration: 'turn' }).state
    expect(losReport(s, 'A:L', 'B:e0').visible).toBe(true)
  })

  it('CORE-086 Wraith Shot ignores line of sight: a blocked target is offered only while Hades holds a soul, and the soul is spent', () => {
    const base = (() => {
      let s = startList(CRY, 'core-86')
      s = park(s, ['A:L', 'A:e0', 'B:e0'])
      s = place(s, 'A:L', { x: 0, z: -4 }); s = place(s, 'A:e0', { x: 0, z: 0 }); s = place(s, 'B:e0', { x: 0, z: 9 })
      // a tall wall across the line
      return { ...s, terrain: [{ id: 'w9', pieceId: 'terrain.low-wall', rulesType: 'obstruction' as const, pos: { x: 0, z: 4 }, rot: 0, footprint: { rect: { w: 8, d: 1 } }, height: 6, props: {} }] }
    })()
    const offers = (s: GameState): boolean => {
      let o = choose(asOut(s), 'A:e0')
      while (o.pending.kind === 'abilityChoice') o = send(o, { type: 'abilityChoice', optionId: 'skip' })
      o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e0' })
      o = send(o, { type: 'chooseCombatAction', modelId: 'A:e0', choice: 'ranged' })
      return o.pending.options!.some((x) => x.action.type === 'chooseAttack' && (x.action as { weaponId: string }).weaponId === 'cry.w.soul-cannon' && (x.action as { targetId: string }).targetId === 'B:e0')
    }
    expect(losReport(base, 'A:e0', 'B:e0').visible).toBe(false)
    expect(offers(withModel(base, 'A:e0', { tokens: { soul: 0 } }))).toBe(false)
    const withSoul = withModel(base, 'A:e0', { tokens: { soul: 1 } })
    expect(offers(withSoul)).toBe(true)
    let o = choose(asOut(withSoul), 'A:e0')
    while (o.pending.kind === 'abilityChoice') o = send(o, { type: 'abilityChoice', optionId: 'skip' })
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e0' })
    o = send(o, { type: 'chooseCombatAction', modelId: 'A:e0', choice: 'ranged' })
    const shot = o.pending.options!.find((x) => x.action.type === 'chooseAttack' && (x.action as { weaponId: string }).weaponId === 'cry.w.soul-cannon' && (x.action as { targetId: string }).targetId === 'B:e0')!
    o = send(o, raw(shot.action))
    expect(o.pending.kind).not.toBe('abilityChoice') // forced: nothing to ask
    expect(o.state.models['A:e0']!.tokens?.soul ?? 0).toBe(0)
  })

  it('CORE-084 Wrath of Lyliss pays a boost with 1 damage when there is no focus', () => {
    let seen = false
    for (let i = 0; i < 40 && !seen; i++) {
      let s = startList(CRY, 'core-84-' + i)
      s = park(s, ['A:L', 'B:e0'])
      s = place(s, 'A:L', { x: 0, z: 0 }, { focus: 0 }); s = place(s, 'B:e0', { x: 0, z: 1.4 })
      s = applyEffect(s, { sourceId: 'cry.f.wrath-of-lyliss', name: 'Wrath of Lyliss', owner: 'A', casterId: 'A:L', targetIds: ['A:L'], mods: [], duration: 'round' }).state
      let o = choose(asOut(s), 'A:L')
      o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:L' })
      o = send(o, { type: 'chooseCombatAction', modelId: 'A:L', choice: 'melee' })
      const hit = o.pending.options!.find((x) => x.action.type === 'chooseAttack' && (x.action as { targetId: string }).targetId === 'B:e0')
      if (!hit) continue
      o = send(o, raw(hit.action))
      if (o.pending.kind !== 'boostAttack') continue
      seen = true
      const boost = o.pending.options!.find((x) => (x.action as { boost?: boolean }).boost === true)!
      o = send(o, raw(boost.action))
      expect(marked(o.state.models['A:L']!)).toBe(1)
      expect(evs(o.events, 'DiceRolled').find((r) => r.purpose === 'attack')!.dice.length).toBe(3)
      o = settle(o)
    }
    expect(seen).toBe(true)
  })

  it('CORE-085 Blind: -4 MAT and DEF, no ranged or magic attack, and moving costs the Combat Action', () => {
    let s = startList(CRY, 'core-85')
    s = park(s, ['A:e1', 'B:e0'])
    s = place(s, 'A:e1', { x: 0, z: 0 }); s = place(s, 'B:e0', { x: 0, z: 7 })
    const mat = statOf(s, bundle, 'A:e1', 'MAT')
    s = applyEffect(s, { sourceId: 'cry.a.stygian-abyss', name: 'Stygian Abyss', owner: 'B', targetIds: ['A:e1'], mods: [], conditions: ['blind'], duration: 'round', shakeable: true }).state
    expect(statOf(s, bundle, 'A:e1', 'MAT')).toBe(mat - 4)
    let o = choose(asOut(s), 'A:e1')
    while (o.pending.kind === 'abilityChoice') o = send(o, { type: 'abilityChoice', optionId: 'skip' })
    o = send(o, { type: 'chooseMovement', option: 'advance', modelId: 'A:e1' })
    o = send(o, { type: 'moveModel', modelId: 'A:e1', path: [{ x: 0, z: 2 }] })
    // moved: the Combat Action is forfeited, so the activation ends
    expect(o.pending.kind).toBe('chooseActivation')
  })
})
