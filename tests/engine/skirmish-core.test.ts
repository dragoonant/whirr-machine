// 90-skirmish WP-CORE: shared mechanics the new Skirmish cards need that no faction file owns.
// Cavalry (boosted charge attack roll), Arc Node channelling (core.a.arc-node), Annoyance and Ashen Veil (penalties on the ENEMY near the carrier),
// the live Warping Winds blast resistance (Wind Weaver, Sky Shaker), magical weapons from an effect (Guidance), and faction condition codes in evalCond.
// Test ids SKC-nnn are proposed for docs/spec/12-rules-test-checklist.md (the checklist is not owned by this package).
import { describe, expect, it } from 'vitest'
import { abilitiesOf, appliedPassives, corePlugins, evalCond, hasAb, hasFlag, plugins, resistsDamageType, runCodeEffect, warpingWindsRangePenalty, type AtkCtx } from '../../src/engine/code-hooks'
import { applyEffect } from '../../src/engine/effects'
import { query } from '../../src/engine/index'
import type { GameSetup, GameState } from '../../src/engine/types'
import { asOut, bundle, choose, place, send } from './action-helpers'
import { newGame, runControlTo, runSetup } from './turn-helpers'

const start = (a: string, b: string, seed: string): GameState =>
  runControlTo(runSetup(newGame({ scenario: 'scn-copperline-crossing', lists: { A: a, B: b } } as GameSetup, seed))).state

/** Every model parked far from the action, except `keep`. */
function parkExcept(s: GameState, keep: string[]): GameState {
  let i = 0
  for (const m of Object.values(s.models)) {
    if (keep.includes(m.id)) continue
    s = place(s, m.id, { x: -21 + (i % 8) * 6, z: 21 - Math.floor(i / 8) * 4 })
    i++
  }
  return s
}
const mods = (s: GameState, attacker: string, weapon: string, target: string, opts: Parameters<typeof query.attackPreview>[4] = {}) =>
  query.attackPreview(s, attacker, weapon, target, opts)

describe('Cavalry: the charge attack roll is boosted for free (RB p112)', () => {
  const RIDER = 'A:u4.1', FOE = 'B:u4.1'
  const scene = (): GameState => {
    let s = parkExcept(start('cir.l.skirmish', 'men.l.skirmish', 'skc1'), [RIDER, FOE])
    s = place(s, RIDER, { x: 0, z: 0 })
    return place(s, FOE, { x: 0, z: 1.6 })
  }
  it('SKC-001 a Wolf Rider (flag cavalry) rolls 3 dice on its charge attack, 2 on any other melee attack', () => {
    const s = scene()
    const plain = mods(s, RIDER, 'cir.w.bladed-shield', FOE, { chargeAttack: false })
    const charge = mods(s, RIDER, 'cir.w.bladed-shield', FOE, { chargeAttack: true })
    expect(plain.legal).toBeNull()
    expect(plain.dice).toBe(2)
    expect(charge.dice).toBe(3)
    expect(charge.pHit).toBeGreaterThan(plain.pHit)
  })
  it('SKC-002 the flag marker reaches the shared core ability; a model without the flag does not get it', () => {
    const s = scene()
    expect(hasFlag(s, bundle, RIDER, 'cavalry')).toBe(true)
    expect(abilitiesOf(s, bundle, RIDER)).toContain('core.a.cavalry')
    expect(abilitiesOf(s, bundle, 'A:u3.1')).not.toContain('core.a.cavalry') // a Ravager
    expect(bundle.byId['core.a.cavalry']).toBeDefined()
  })
  it('SKC-003 Night Terrors keep their own Cavalry hook and are boosted exactly once (no double boost from the core one)', () => {
    let s = parkExcept(start('cry.l.skirmish', 'men.l.skirmish', 'skc3'), ['A:u3.1', 'B:u4.1'])
    s = place(s, 'A:u3.1', { x: 0, z: 0 })
    s = place(s, 'B:u4.1', { x: 0, z: 2.2 })
    expect(abilitiesOf(s, bundle, 'A:u3.1')).not.toContain('core.a.cavalry')
    expect(mods(s, 'A:u3.1', 'cry.w.scything-blade', 'B:u4.1', { chargeAttack: true }).dice).toBe(3)
    expect(mods(s, 'A:u3.1', 'cry.w.scything-blade', 'B:u4.1', { chargeAttack: false }).dice).toBe(2)
  })
})

describe('Arc Node: the Leader can channel a spell through it', () => {
  it('SKC-004 core.a.arc-node exists and flag-only records (Raptor, Revenger) get it', () => {
    expect(bundle.byId['core.a.arc-node']).toBeDefined()
    const s = start('men.l.skirmish', 'cry.l.skirmish', 'skc4')
    expect(hasAb(s, bundle, 'A:e1', 'core.a.arc-node')).toBe(true) // the Revenger
    expect(hasAb(s, bundle, 'B:e4', 'core.a.arc-node')).toBe(true) // the Raptor
    expect(hasAb(s, bundle, 'A:e0', 'core.a.arc-node')).toBe(false) // the Crusader
  })
  it('SKC-005 Feora may channel Conflagration through the Revenger in her CTRL (the channel option is offered)', () => {
    let s = parkExcept(start('men.l.skirmish', 'cir.l.skirmish', 'skc5'), ['A:L', 'A:e1', 'B:u4.1'])
    s = place(s, 'A:L', { x: 0, z: 0 }); s = place(s, 'A:e1', { x: 0, z: 5 }); s = place(s, 'B:u4.1', { x: 0, z: 12 })
    let o = choose(asOut(s), 'A:L')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:L' })
    const ids = (o.pending.options ?? []).map((x) => x.id)
    expect(ids).toContain('channel:A:e1')
    // out of CTRL range of the node nothing is offered
    let far = place(s, 'A:e1', { x: 0, z: -30 })
    far = place(far, 'A:L', { x: 0, z: 0 })
    let o2 = choose(asOut(far), 'A:L')
    o2 = send(o2, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:L' })
    expect((o2.pending.options ?? []).map((x) => x.id)).not.toContain('channel:A:e1')
  })
})

describe('Annoyance and Ashen Veil: attack-roll penalties on enemy models near the carrier', () => {
  const RIDER = 'A:u4.1', RIDER2 = 'A:u4.2', DEF = 'B:u4.1'
  const modOf = (s: GameState, id: string) => mods(s, DEF, 'men.w.flame-spear', 'A:e2', {}).mods.filter((m) => m.source === id)
  const scene = (gap: number): GameState => {
    let s = parkExcept(start('cir.l.skirmish', 'men.l.skirmish', 'skc6'), [RIDER, RIDER2, DEF, 'A:e2'])
    s = place(s, DEF, { x: 0, z: 0 })
    s = place(s, 'A:e2', { x: 0, z: 1.8 }) // the Lord of the Feast, in the Defender's melee reach
    s = place(s, RIDER, { x: 3 + gap, z: 0 })
    return place(s, RIDER2, { x: 3 + gap, z: -2 })
  }
  it('SKC-006 a living enemy within 1" of a Wolf Rider takes -1 on its attack roll, once however many riders stand there', () => {
    const near = scene(-1.5) // base edges well inside 1"
    expect(modOf(near, 'core.a.annoyance')).toEqual([expect.objectContaining({ value: -1 })])
    const withBoth = place(near, RIDER2, { x: 1.9, z: 0.4 })
    expect(modOf(withBoth, 'core.a.annoyance')).toHaveLength(1)
    expect(modOf(scene(5), 'core.a.annoyance')).toHaveLength(0)
  })
  it('SKC-007 Annoyance does not touch constructs, the carrier\'s own side, or the carrier\'s own rolls', () => {
    const near = place(scene(-1.5), 'B:e0', { x: 4.6, z: 0 }) // the Crusader (a construct) beside the riders
    const ann = (s: GameState, id: string) => appliedPassives(s, bundle, id, { attackerId: id }).some((p) => p.ability.id === 'core.a.annoyance')
    expect(ann(near, DEF)).toBe(true) // a living Defender
    expect(ann(near, 'B:e0')).toBe(false) // a construct is not living
    expect(ann(near, RIDER2)).toBe(false) // the carrier's own side
    // the penalty is read only for an attack roll: asking without the attacker (DEF, ARM, LOS lookups) gives nothing
    expect(appliedPassives(near, bundle, DEF).some((p) => p.ability.id === 'core.a.annoyance')).toBe(false)
    // the rider's own preview carries no Annoyance
    const own = mods(near, RIDER, 'cir.w.bladed-shield', DEF, { chargeAttack: false }).mods
    expect(own.some((m) => m.source === 'core.a.annoyance')).toBe(false)
  })
  it('SKC-008 Ashen Veil: living enemies within 2" of a Revenger take -2; a crippled right arm switches it off; fire resistance ignores it', () => {
    let s = parkExcept(start('men.l.skirmish', 'cir.l.skirmish', 'skc8'), ['A:e1', 'B:u4.1', 'A:e0'])
    s = place(s, 'A:e1', { x: 0, z: 0 }) // Revenger
    s = place(s, 'B:u4.1', { x: 2.7, z: 0 }) // a Wolf Rider, inside 2" edge to edge
    s = place(s, 'A:e0', { x: 8, z: 0 })
    const veil = (st: GameState) => mods(st, 'B:u4.1', 'cir.w.bladed-shield', 'A:e1', {}).mods.filter((m) => m.source === 'core.a.ashen-veil')
    expect(veil(s)).toEqual([expect.objectContaining({ value: -2 })])
    const far = place(s, 'B:u4.1', { x: 6, z: 0 })
    expect(veil(far)).toHaveLength(0)
    const cripple = { ...s, models: { ...s.models, 'A:e1': { ...s.models['A:e1']!, crippled: [...s.models['A:e1']!.crippled, 'R'] } } }
    expect(veil(cripple)).toHaveLength(0)
  })
})

describe('Warping Winds: blast resistance is a live aura (Wind Weaver, Sky Shaker)', () => {
  it('SKC-009 Wind Weaver: Cygnar models within 3" of the Vane resist blast while they stay there, not after they walk away', () => {
    let s = parkExcept(start('cyg.l.skirmish', 'men.l.skirmish', 'skc9'), ['A:u4.1', 'A:u2.1', 'A:u2.2', 'A:e1'])
    s = place(s, 'A:u4.1', { x: 0, z: 0 }); s = place(s, 'A:u2.1', { x: 2, z: 0 }); s = place(s, 'A:u2.2', { x: 12, z: 0 })
    expect(resistsDamageType(s, bundle, 'A:u2.1', ['blast'])).toBe(false)
    const r = runCodeEffect(s, bundle, 'windWeaver', { point: 'combat.choose', selfId: 'A:u4.1', activePlayer: 'A' })
    s = r.state
    expect(resistsDamageType(s, bundle, 'A:u2.1', ['blast'])).toBe(true) // near the Vane
    expect(resistsDamageType(s, bundle, 'A:u2.2', ['blast'])).toBe(false) // out of the 3"
    expect(resistsDamageType(s, bundle, 'A:u2.1', ['fire'])).toBe(false) // blast only
    s = place(s, 'A:u2.1', { x: 12, z: 3 }) // walks away: no longer protected
    expect(resistsDamageType(s, bundle, 'A:u2.1', ['blast'])).toBe(false)
    s = place(s, 'A:u2.2', { x: 3, z: 0 }) // a model that walks in is protected
    expect(resistsDamageType(s, bundle, 'A:u2.2', ['blast'])).toBe(true)
  })
  it('SKC-010 Sky Shaker: Circle Faction models within 3" of the Shaman resist blast, live, and models of another faction do not', () => {
    let s = parkExcept(start('cir.l.skirmish', 'men.l.skirmish', 'skc10'), ['A:e5', 'A:u3.1', 'A:u3.2', 'B:u4.1'])
    s = place(s, 'A:e5', { x: 0, z: 0 }); s = place(s, 'A:u3.1', { x: 2, z: 0 }); s = place(s, 'A:u3.2', { x: 12, z: 0 }); s = place(s, 'B:u4.1', { x: 0, z: 2 })
    s = runCodeEffect(s, bundle, 'cirSkyShaker', { point: 'combat.choose', selfId: 'A:e5', activePlayer: 'A' }).state
    expect(resistsDamageType(s, bundle, 'A:u3.1', ['blast'])).toBe(true)
    expect(resistsDamageType(s, bundle, 'A:u3.2', ['blast'])).toBe(false)
    expect(resistsDamageType(s, bundle, 'B:u4.1', ['blast'])).toBe(false) // an enemy beside the Shaman is not covered
    s = place(s, 'A:u3.1', { x: 9, z: 0 })
    expect(resistsDamageType(s, bundle, 'A:u3.1', ['blast'])).toBe(false)
  })
})

describe('Warping Winds: ranged attacks at the protected models lose 3 RNG', () => {
  const scene = (gap: number, wind: boolean): GameState => {
    let s = parkExcept(start('cyg.l.skirmish', 'cry.l.skirmish', 'skc13'), ['A:u4.1', 'A:u2.1', 'B:e4'])
    s = place(s, 'A:u4.1', { x: 2, z: 0 }); s = place(s, 'A:u2.1', { x: 0, z: 0 })
    s = place(s, 'B:e4', { x: 0, z: 1.38 + gap }) // the Raptor (40 mm, Doomspitter RNG 8): `gap` inches of edge to edge distance to the Black 13th
    return wind ? runCodeEffect(s, bundle, 'windWeaver', { point: 'combat.choose', selfId: 'A:u4.1', activePlayer: 'A' }).state : s
  }
  const shot = (s: GameState) => query.attackPreview(s, 'B:e4', 'cry.w.doomspitter', 'A:u2.1')
  it('SKC-013 a target 6" away is in reach of an RNG 8 gun, and out of reach (an automatic miss) once a Vane near it has used Wind Weaver', () => {
    expect(shot(scene(6, false)).autoMiss).toBe(false)
    expect(shot(scene(6, true)).autoMiss).toBe(true)
    expect(shot(scene(4.5, true)).autoMiss).toBe(false) // 8 - 3 = 5 still reaches it
    expect(warpingWindsRangePenalty(scene(6, true), 'A:u2.1')).toBe(3)
  })
  it('SKC-014 the penalty is for the Faction models near the carrier only: a model 10" away or of another faction keeps its full range', () => {
    let s = scene(6, true)
    s = place(s, 'A:u2.1', { x: 0, z: -9 })
    expect(warpingWindsRangePenalty(s, 'A:u2.1')).toBe(0)
    expect(warpingWindsRangePenalty(s, 'B:e4')).toBe(0) // an enemy of the carrier
  })
})

describe('Guidance: weapon attacks deal magical damage while the effect lasts', () => {
  it('SKC-011 an effect that carries magicalWeapons adds the magical damage type to weapon attacks, not to spells', () => {
    const s0 = start('trl.l.skirmish', 'cir.l.skirmish', 'skc11')
    const s = applyEffect(s0, { sourceId: 'trl.a.guidance', name: 'Guidance', owner: 'A', casterId: 'A:u4.4', targetIds: ['A:u3.1'], mods: [], duration: 'turn', magicalWeapons: true } as Parameters<typeof applyEffect>[1]).state
    const core = corePlugins[0]!
    expect(plugins()).toContain(core)
    const weaponAtk = { attackerId: 'A:u3.1', weaponId: 'trl.w.highwaymen-pistol' } as unknown as AtkCtx
    const spellAtk = { attackerId: 'A:u3.1', spellId: 'trl.s.rock-wall' } as unknown as AtkCtx
    expect(core.damageTypes!(s, bundle, weaponAtk)).toEqual(['magical'])
    expect(core.damageTypes!(s, bundle, spellAtk)).toEqual([])
    expect(core.damageTypes!(s0, bundle, weaponAtk)).toEqual([]) // no effect, no change
    expect(core.damageTypes!(s, bundle, { ...weaponAtk, attackerId: 'A:u3.2' } as AtkCtx)).toEqual([]) // another model
  })
})

describe('faction condition codes reach evalCond', () => {
  it('SKC-012 a condition code only a faction registers (wholeUnit) is evaluated, an unknown one is false', () => {
    const s = start('cyg.l.skirmish', 'men.l.skirmish', 'skc12')
    expect(evalCond(s, bundle, { code: 'wholeUnit' } as never, { selfId: 'A:L' })).toBe(true)
    expect(evalCond(s, bundle, { code: 'noSuchCondition' } as never, { selfId: 'A:L' })).toBe(false)
    expect(evalCond(s, bundle, { code: 'destroyedEnemyThisActivation' } as never, { selfId: 'A:L' })).toBe(false) // the core codes still win
  })
})
