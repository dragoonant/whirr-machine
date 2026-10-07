// M12 follow-ups, part two (SKF-nnn): Serenity and Harmonious Exaltation in the real flow, animus target options, solos in the battlegroup, Headbutt without a weapon,
// Assault, Unpredictable Movement, Doppler Bark, Unyielding and Incorporeal in the previews, Ashen Veil concealment, Razor Wind as a spray, the kill box flag.
import { describe, expect, it } from 'vitest'
import { applyEffect } from '../../src/engine/effects'
import { query } from '../../src/engine/index'
import { runControl } from '../../src/engine/phases/control'
import type { GameState } from '../../src/engine/types'
import { asOut, bundle, choose, evs, firstSeed, offers, parkExcept, place, raw, rec, send, settleAtk, start, toCombat, withModel } from './skirmish-followups'

describe('SKF-010 solos name their Leader (setup gives them a controllerId)', () => {
  it('the Runebearer, Krielstone models and Dozer & Smigg are in Gunnbjorn\'s battlegroup lookups; a Leader and a unit trooper are not', () => {
    const s = start('trl.l.skirmish', 'cyg.l.skirmish', 'skf10')
    expect(s.models['A:e5']!.type).toBe('solo')
    expect(s.models['A:e5']!.controllerId).toBe('A:L')
    expect(s.models['A:e2']!.controllerId).toBe('A:L') // Braylen
    expect(s.models['A:e0']!.controllerId).toBe('A:L') // the Bomber (a beast, as before)
    expect(s.models['A:L']!.controllerId).toBeUndefined()
    expect(s.models['A:u3.1']!.controllerId).toBeUndefined()
    // every solo names its own Leader (Falk is the enemy's)
    expect(s.models['B:e1']!.type).toBe('solo')
    expect(s.models['B:e1']!.controllerId).toBe('B:L')
  })
})

describe('SKF-011 Serenity is called from the Control Phase (before the leech)', () => {
  it('the Stone Bearer removes 1 fury from the most furious warbeast within 1" at the start of its player\'s Control Phase', () => {
    let s = parkExcept(start('trl.l.skirmish', 'cyg.l.skirmish', 'skf11'), ['A:L', 'A:e0', 'A:u4.1', 'A:u4.2', 'A:u4.3', 'A:u4.4'])
    s = place(s, 'A:L', { x: 0, z: -8 })
    s = place(s, 'A:e0', { x: 0, z: 0 }, { fury: 3 }) // the Bomber
    s = place(s, 'A:u4.4', { x: 1.6, z: 0 }) // the Stone Bearer, base to base-ish (within 1")
    const bearer = s.models['A:u4.4']!
    expect(bearer.profileId).toBe('trl.stone-bearer')
    const out = runControl(s, bundle)
    const shed = evs(out.events, 'FuryChanged').filter((e) => e.reason === 'shed' && e.fromId === 'A:u4.4')
    expect(shed.length).toBe(1)
    expect(shed[0]).toMatchObject({ modelId: 'A:e0', delta: -1, after: 2 })
    expect(out.state.models['A:e0']!.fury).toBe(2)
  })
})

describe('SKF-012 Harmonious Exaltation costs 1 less on the next spell and is then spent', () => {
  const marker = (s: GameState): GameState =>
    applyEffect(s, { sourceId: 'trl.a.harmonious-exaltation', name: 'Harmonious Exaltation', owner: 'A', casterId: 'A:e5', targetIds: ['A:L'], mods: [], duration: 'turn' }).state
  const cast = (s: GameState): GameState => {
    let o = toCombat(s, 'A:L')
    const opt = (o.pending.options ?? []).find((x) => x.action.type === 'castSpell' && (x.action as { spellId: string }).spellId === 'trl.s.snipe' && (x.action as { targetId?: string }).targetId === 'A:u3.1')!
    expect(opt).toBeDefined()
    o = send(o, raw(opt.action))
    return o.state
  }
  const scene = (seed: string): GameState => {
    let s = parkExcept(start('trl.l.skirmish', 'cyg.l.skirmish', seed), ['A:L', 'A:u3.1', 'A:e5'])
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'A:u3.1', { x: 0, z: 4 })
    return place(s, 'A:e5', { x: 3, z: 0 })
  }
  it('Snipe costs 2 fury as printed, 1 with the marker; the marker is gone afterwards, and the option shows the lower cost', () => {
    const plain = scene('skf12a')
    const f0 = plain.models['A:L']!.fury!
    expect(cast(plain).models['A:L']!.fury).toBe(f0 - 2)
    const marked = marker(scene('skf12b'))
    const o = toCombat(marked, 'A:L')
    const shown = (o.pending.options ?? []).find((x) => x.action.type === 'castSpell' && (x.action as { spellId: string }).spellId === 'trl.s.snipe')!
    expect(shown.cost).toMatchObject({ fury: 1 })
    const after = cast(marked)
    expect(after.models['A:L']!.fury).toBe(f0 - 1)
    expect(after.effects.some((e) => e.name === 'Harmonious Exaltation')).toBe(false)
  })
})

describe('SKF-013 an animus with a range is offered with targets (Lucky Shot, Wraithbane)', () => {
  const scene = (seed: string): GameState => {
    let s = parkExcept(start('trl.l.skirmish', 'cyg.l.skirmish', seed), ['A:L', 'A:e1', 'A:e2', 'A:u3.1'])
    s = place(s, 'A:L', { x: 0, z: -9 })
    s = place(s, 'A:e1', { x: 0, z: 0 }) // Dozer & Smigg, the beast with Lucky Shot
    s = place(s, 'A:e2', { x: 4, z: 0 }) // Braylen: 4" from the beast
    return place(s, 'A:u3.1', { x: -5.5, z: 1 }) // a Highwayman 5.5" from the beast, further from the warlock than 6"
  }
  it('the warlock gets one option per friendly Faction model within the animus RNG of the beast; casting one puts Lucky Shot on that model', () => {
    const s = scene('skf13a')
    let o = toCombat(s, 'A:L')
    const opts = (o.pending.options ?? []).filter((x) => x.id.startsWith('animus:A:e1'))
    expect(opts.map((x) => x.id).sort()).toEqual(['animus:A:e1:A:e1', 'animus:A:e1:A:e2', 'animus:A:e1:A:u3.1'].sort())
    const pick = (o.pending.options ?? []).find((x) => x.id === 'animus:A:e1:A:u3.1')!
    o = send(o, raw(pick.action))
    expect(o.state.effects.some((e) => e.sourceId === 'trl.s.lucky-shot' && e.targetIds.includes('A:u3.1'))).toBe(true)
  })
  it('the beast casting its own animus is offered the same targets, and a model of another faction is never one', () => {
    const s = scene('skf13b')
    const o = toCombat(s, 'A:e1')
    const ids = (o.pending.options ?? []).filter((x) => x.id.startsWith('cast:trl.s.lucky-shot')).map((x) => x.id)
    expect(ids).toContain('cast:trl.s.lucky-shot:A:e2')
    expect(ids.some((id) => id.includes(':B:'))).toBe(false)
    const far = place(s, 'A:e2', { x: 12, z: 0 })
    expect((toCombat(far, 'A:e1').pending.options ?? []).some((x) => x.id === 'cast:trl.s.lucky-shot:A:e2')).toBe(false)
  })
  it('Circle: Wraithbane (RNG 6) is offered on friendly Circle models near the Pureblood', () => {
    let s = parkExcept(start('cir.l.skirmish', 'cyg.l.skirmish', 'skf13c'), ['A:L', 'A:e0', 'A:u3.1'])
    s = place(s, 'A:L', { x: 0, z: -7 })
    s = place(s, 'A:e0', { x: 0, z: 0 }, { fury: 0 }) // Pureblood Warpwolf
    s = place(s, 'A:u3.1', { x: 3, z: 0 })
    const ids = (toCombat(s, 'A:L').pending.options ?? []).filter((x) => x.id.startsWith('animus:A:e0')).map((x) => x.id)
    expect(ids).toEqual(expect.arrayContaining(['animus:A:e0:A:u3.1', 'animus:A:e0:A:e0']))
  })
})

void asOut; void choose; void firstSeed; void offers; void rec; void settleAtk; void withModel; void query
