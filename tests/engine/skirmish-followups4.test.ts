// M12 follow-ups, part four (SKF-nnn): what the previews know (Unyielding ARM, Incorporeal), Ashen Veil concealment, Razor Wind as a spray, the kill box flag,
// the Grim Returns life-order invariant of tools/sim.ts.
import { describe, expect, it } from 'vitest'
import { applyEffect } from '../../src/engine/effects'
import { query } from '../../src/engine/index'
import type { GameState } from '../../src/engine/types'
import { checkState } from '../../tools/sim'
import { bundle, evs, offers, parkExcept, place, raw, rec, send, settleAtk, start, toCombat, withModel } from './skirmish-followups'

describe('SKF-018 Unyielding shows in the attack preview (+2 ARM against melee, not against shots)', () => {
  it('a melee preview against a Wolf Rider faces ARM 16, a ranged one ARM 14, and a Ravager is 2 lower than the rider either way', () => {
    let s = parkExcept(start('kha.l.skirmish', 'cir.l.skirmish', 'skf18'), ['A:e0', 'A:e1', 'B:u4.1', 'B:u3.1'])
    s = place(s, 'A:e0', { x: 0, z: 0 }) // Razor
    s = place(s, 'B:u4.1', { x: 0, z: 1.7 }) // a Wolf Rider in melee reach
    s = place(s, 'A:e1', { x: 6, z: 0 }) // Dire Wolf, shooting
    const rider = rec('cir.wolf-rider').stats.ARM
    const melee = query.attackPreview(s, 'A:e0', 'kha.w.ripper-shield', 'B:u4.1')
    expect(melee.legal).toBeNull()
    expect(melee.damageTarget).toBe(rider + 2)
    const shot = query.attackPreview(s, 'A:e1', 'kha.w.heavy-chain-gun', 'B:u4.1')
    expect(shot.legal).toBeNull()
    expect(shot.damageTarget).toBe(rider)
    const ravager = place(s, 'B:u3.1', { x: -1.7, z: 0 })
    const rv = query.attackPreview(ravager, 'A:e0', 'kha.w.ripper-shield', 'B:u3.1')
    expect(rv.damageTarget).toBe(rec(ravager.models['B:u3.1']!.profileId).stats.ARM)
  })
})

describe('SKF-019 an Incorporeal model takes no non-magical damage, and the preview says so', () => {
  it('a ripper shield (not magical) previews 0 damage and 0 kill chance on a Night Terror; Vilkul\'s magical axe previews damage', () => {
    let s = parkExcept(start('kha.l.skirmish', 'cry.l.skirmish', 'skf19'), ['A:e0', 'A:L', 'B:u3.1'])
    s = place(s, 'B:u3.1', { x: 0, z: 0 })
    s = place(s, 'A:e0', { x: 0, z: -1.9 })
    const plain = query.attackPreview(s, 'A:e0', 'kha.w.ripper-shield', 'B:u3.1')
    expect(plain.legal).toBeNull()
    expect(plain.pHit).toBeGreaterThan(0)
    expect(plain.expectedDamage).toBe(0)
    expect(plain.pKill).toBe(0)
    const magic = query.attackPreview(place(s, 'A:L', { x: 1.9, z: 0 }), 'A:L', 'kha.w.mechanika-axe', 'B:u3.1')
    expect(magic.legal).toBeNull()
    expect(magic.expectedDamage).toBeGreaterThan(0)
  })
})

describe('SKF-020 Ashen Veil gives its carrier concealment against ranged and arcane attacks', () => {
  const scene = (seed: string, patch: Partial<GameState['models'][string]> = {}): GameState => {
    let s = parkExcept(start('kha.l.skirmish', 'men.l.skirmish', seed), ['A:e1', 'B:e1'])
    s = place(s, 'A:e1', { x: 0, z: 0 }) // Dire Wolf
    return place(s, 'B:e1', { x: 0, z: 8 }, patch) // Revenger
  }
  it('+2 DEF against a shot at 8", gone when the right arm (the Light Immolator) is crippled, and the LOS view reports it', () => {
    const s = scene('skf20a')
    const def = rec('men.revenger-arc').stats.DEF
    expect(query.attackPreview(s, 'A:e1', 'kha.w.heavy-chain-gun', 'B:e1').hitTarget).toBe(def + 2)
    expect(query.los(s, 'A:e1', 'B:e1').mods.concealment).toBe(true)
    const hurt = scene('skf20b', { crippled: ['R'] })
    expect(query.attackPreview(hurt, 'A:e1', 'kha.w.heavy-chain-gun', 'B:e1').hitTarget).toBe(def)
    expect(query.los(hurt, 'A:e1', 'B:e1').mods.concealment).toBe(false)
  })
  it('a model without the veil (Deuce) has none', () => {
    let s = parkExcept(start('kha.l.skirmish', 'cyg.l.skirmish', 'skf20c'), ['A:e1', 'B:e0'])
    s = place(s, 'A:e1', { x: 0, z: 0 })
    s = place(s, 'B:e0', { x: 0, z: 8 })
    expect(query.attackPreview(s, 'A:e1', 'kha.w.heavy-chain-gun', 'B:e0').hitTarget).toBe(rec('cyg.deuce').stats.DEF)
  })
})

describe('SKF-021 Razor Wind is a spray: it rolls AAT at every model along its line', () => {
  it('an Arkanist\'s Razor Wind (still an arcane attack) makes an attack roll against the model behind the target too', () => {
    let s = parkExcept(start('kha.l.skirmish', 'cyg.l.skirmish', 'skf21'), ['A:u4.1', 'B:u2.1', 'B:u2.2', 'B:u2.3'])
    s = place(s, 'A:u4.1', { x: 0, z: 0 })
    s = place(s, 'B:u2.1', { x: 0, z: 5 })
    s = place(s, 'B:u2.2', { x: 0, z: 7.4 }) // directly behind the first
    s = place(s, 'B:u2.3', { x: 6, z: 5 }) // off the line
    let o = toCombat(s, 'A:u4', 'A:u4.1')
    const star = (o.pending.options ?? []).find((x) => x.action.type === 'chooseCombatAction' && (x.action as { abilityId?: string }).abilityId === 'kha.a.razor-wind')
    expect(star, 'Razor Wind offered').toBeDefined()
    o = send(o, raw(star!.action))
    const shot = (o.pending.options ?? []).find((x) => x.action.type === 'chooseAttack' && (x.action as { targetId: string }).targetId === 'B:u2.1')!
    o = settleAtk(send(o, raw(shot.action)))
    expect(evs(o.events, 'AttackDeclared')[0]).toMatchObject({ kind: 'arcane', attackerId: 'A:u4.1', targetId: 'B:u2.1' })
    expect(evs(o.events, 'AttackResolved').length).toBe(2) // the target and the model behind it, not the one off the line
  })
})

describe('SKF-022 the Kill Box chip needs the Kill Box in force (query.control reports killBoxActive)', () => {
  it('false in the first round of Skirmish (deployment included), true once the scenario brings it in', () => {
    const s = start('kha.l.skirmish', 'cyg.l.skirmish', 'skf22')
    expect(query.control(s).killBoxActive).toBe(false)
    expect(query.control({ ...s, round: 4 }).killBoxActive).toBe(true)
    expect(Object.keys(query.control(s).killBox)).toEqual(['A', 'B'])
  })
})

describe('SKF-023 tools/sim.ts: a destroyed Grunt may come back active only through Grim Returns', () => {
  it('destroyed -> active is a violation, except for a model carrying the Grim Returns effect', () => {
    const s = start('cry.l.skirmish', 'cyg.l.skirmish', 'skf23')
    const dead = withModel(s, 'A:u5.3', { life: 'destroyed' })
    const back = withModel(dead, 'A:u5.3', { life: 'active' })
    expect(checkState(back, dead).some((m) => /life destroyed -> active/.test(m))).toBe(true)
    const withEffect = applyEffect(back, { sourceId: 'cry.a.grim-returns', name: 'Grim Returns', owner: 'A', casterId: 'A:u5.1', targetIds: ['A:u5.3'], mods: [], duration: 'turn' }).state
    expect(checkState(withEffect, dead).some((m) => /life/.test(m))).toBe(false)
  })
})

void bundle; void offers
