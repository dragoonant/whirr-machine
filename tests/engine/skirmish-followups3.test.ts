// M12 follow-ups, part three (SKF-nnn): Headbutt without a weapon, Assault, Unpredictable Movement, Doppler Bark.
import { describe, expect, it } from 'vitest'
import { applyEffect } from '../../src/engine/effects'
import type { GameState } from '../../src/engine/types'
import { asOut, choose, evs, parkExcept, place, raw, rec, send, settleAtk, start, toCombat } from './skirmish-followups'

describe('SKF-014 a power attack needs no weapon: the Raptor (no melee weapon) may Headbutt', () => {
  it('Headbutt is offered to a model with no melee weapon, lists the enemy in reach, and the power attack resolves', () => {
    let s = parkExcept(start('cry.l.skirmish', 'cyg.l.skirmish', 'skf14'), ['A:e4', 'B:u2.1'])
    s = place(s, 'A:e4', { x: 0, z: 0 }, { focus: 2 })
    s = place(s, 'B:u2.1', { x: 0, z: 1.5 })
    expect(rec('cry.raptor-arc').weapons.some((w: { weapon: string }) => rec(w.weapon).type === 'melee')).toBe(false)
    let o = toCombat(s, 'A:e4')
    const hb = (o.pending.options ?? []).find((x) => x.action.type === 'chooseCombatAction' && (x.action as { powerAttack?: string }).powerAttack === 'headbutt')
    expect(hb, 'Headbutt offered').toBeDefined()
    o = send(o, raw(hb!.action))
    const pa = (o.pending.options ?? []).find((x) => x.action.type === 'powerAttack' && (x.action as { targetId: string }).targetId === 'B:u2.1')
    expect(pa, 'Headbutt at the Black 13th trooper').toBeDefined()
    o = settleAtk(send(o, raw(pa!.action)))
    expect(evs(o.events, 'AttackDeclared').some((e) => e.kind === 'power' && e.attackerId === 'A:e4')).toBe(true)
  })
})

describe('SKF-015 Assault: after a successful charge a Wolf Rider may shoot the charged model, ignoring Target in Melee', () => {
  const charge = (seed: string, unit = 'A:u4', lead = 'A:u4.1') => {
    let s = parkExcept(start('cir.l.skirmish', 'cyg.l.skirmish', seed), [`${unit}.1`, `${unit}.2`, `${unit}.3`, 'B:e0'])
    s = place(s, `${unit}.1`, { x: 0, z: -8 })
    s = place(s, `${unit}.2`, { x: 1.6, z: -8 })
    s = place(s, `${unit}.3`, { x: -1.6, z: -8 })
    s = place(s, 'B:e0', { x: 0, z: 0 }) // Deuce
    let o = choose(asOut(s), unit)
    while (o.pending.kind === 'abilityChoice') o = send(o, { type: 'abilityChoice', optionId: 'skip' })
    o = send(o, { type: 'chooseMovement', option: 'charge', modelId: lead })
    o = send(o, { type: 'chargeTarget', targetId: 'B:e0' })
    o = send(o, raw(o.pending.options!.find((x) => x.id === 'full')!.action))
    if (o.pending.kind === 'placeTroopers') o = send(o, raw(o.pending.options![0]!.action))
    return o
  }
  it('the charger is offered one ranged attack at the charged model before its Combat Action, and it ignores the engagement penalty', () => {
    let o = charge('skf15a')
    expect(o.pending.kind).toBe('chooseAttack')
    expect(o.pending.context.data).toMatchObject({ code: 'assault' })
    expect(o.pending.context.targetId).toBe('B:e0')
    const shots = (o.pending.options ?? []).filter((x) => x.action.type === 'chooseAttack')
    expect(shots.length).toBe(1)
    expect((shots[0]!.action as { weaponId: string }).weaponId).toBe('cir.w.thrown-javelin')
    o = send(o, raw(shots[0]!.action))
    const measured = evs(o.events, 'AttackMeasured')[0]!
    expect(measured.mods.some((m) => /melee/i.test(m.label))).toBe(false)
    expect(evs(o.events, 'AttackDeclared')[0]).toMatchObject({ kind: 'ranged', attackerId: 'A:u4.1', targetId: 'B:e0' })
  })
  it('each Wolf Rider that can see the charged model gets its own offer, and passing every one goes on to the Combat Actions', () => {
    let o = charge('skf15b')
    let offered = 0
    while (o.pending.kind === 'chooseAttack' && (o.pending.context.data as { code?: string } | undefined)?.code === 'assault' && offered < 5) {
      offered++
      o = send(o, { type: 'pass' })
    }
    expect(offered).toBeGreaterThanOrEqual(1)
    expect(o.pending.kind).toBe('chooseCombatAction')
  })
  it('a model without the rule (a Ravager) gets no Assault offer', () => {
    const o = charge('skf15c', 'A:u3', 'A:u3.1')
    expect((o.pending.context.data as { code?: string } | undefined)?.code).not.toBe('assault')
    expect(o.pending.kind).toBe('chooseCombatAction')
  })
})

describe('SKF-016 Unpredictable Movement: the rest of the unit is placed within 4", not 2', () => {
  const advanced = (unit: string, lead: string, seed: string) => {
    let s = parkExcept(start('cir.l.skirmish', 'cyg.l.skirmish', seed), [`${unit}.1`, `${unit}.2`, `${unit}.3`])
    s = place(s, `${unit}.1`, { x: 0, z: 0 })
    s = place(s, `${unit}.2`, { x: 1.8, z: 0 })
    s = place(s, `${unit}.3`, { x: -1.8, z: 0 })
    let o = choose(asOut(s), unit)
    while (o.pending.kind === 'abilityChoice') o = send(o, { type: 'abilityChoice', optionId: 'skip' })
    o = send(o, { type: 'chooseMovement', option: 'advance', modelId: lead })
    o = send(o, raw(o.pending.options![0]!.action))
    return o
  }
  it('Wolf Riders: 4" (constraints and the answer check); Ravagers: 2"', () => {
    const wr = advanced('A:u4', 'A:u4.1', 'skf16a')
    expect(wr.pending.kind).toBe('placeTroopers')
    expect(wr.pending.constraints?.placeWithin?.dist).toBe(4)
    expect(wr.pending.constraints?.maxDist).toBe(4)
    const rv = advanced('A:u3', 'A:u3.1', 'skf16b')
    expect(rv.pending.kind).toBe('placeTroopers')
    expect(rv.pending.constraints?.placeWithin?.dist).toBe(2)
  })
  it('a Wolf Rider may be placed 3.5" from the moved one (a Ravager could not)', () => {
    const wr = advanced('A:u4', 'A:u4.1', 'skf16c')
    const lead = wr.state.models['A:u4.1']!
    const place1 = { modelId: 'A:u4.2', pos: { x: lead.pos.x + 0.99 + 3.5, z: lead.pos.z } }
    const place2 = { modelId: 'A:u4.3', pos: { x: lead.pos.x - 0.99 - 3.5, z: lead.pos.z } }
    const ok = send(wr, { type: 'placeTroopers', placements: [place1, place2] })
    expect(ok.state.models['A:u4.2']!.pos.x).toBeCloseTo(place1.pos.x, 5)
    const rv = advanced('A:u3', 'A:u3.1', 'skf16d')
    const lead2 = rv.state.models['A:u3.1']!
    expect(() => send(rv, { type: 'placeTroopers', placements: [{ modelId: 'A:u3.2', pos: { x: lead2.pos.x + 0.99 + 3.5, z: lead2.pos.z } }, { modelId: 'A:u3.3', pos: { x: lead2.pos.x - 0.99 - 1, z: lead2.pos.z } }] })).toThrow(/within 2/)
  })
})

describe('SKF-017 Doppler Bark forbids run, charge, slam and trample for the round', () => {
  it('the movement options of an affected model lose them, and a forbidden option is refused', () => {
    let s = parkExcept(start('kha.l.skirmish', 'cir.l.skirmish', 'skf17'), ['A:e0', 'B:e1'])
    s = place(s, 'A:e0', { x: 0, z: 0 }, { focus: 2 })
    s = place(s, 'B:e1', { x: 0, z: 6 })
    const optionsOf = (st: GameState): string[] => (choose(asOut(st), 'A:e0').pending.options ?? []).map((x) => (x.action as { option?: string }).option ?? x.id)
    expect(optionsOf(s)).toEqual(expect.arrayContaining(['advance', 'run', 'charge']))
    const barked = applyEffect(s, { sourceId: 'cir.s.doppler-bark', name: 'Doppler Bark', owner: 'B', casterId: 'B:e1', targetIds: ['A:e0'], mods: [], forbid: ['run', 'charge', 'slam', 'trample'], duration: 'round' }).state
    const o = optionsOf(barked)
    expect(o).toEqual(expect.arrayContaining(['advance', 'forfeit']))
    for (const x of ['run', 'charge', 'slam', 'trample']) expect(o).not.toContain(x)
    expect(() => send(choose(asOut(barked), 'A:e0'), { type: 'chooseMovement', option: 'run', modelId: 'A:e0' })).toThrow(/forbids/)
  })
})
