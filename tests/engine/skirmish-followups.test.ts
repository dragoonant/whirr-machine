// M12 follow-ups (docs/spec/12-rules-test-checklist.md, SKF-nnn): the engine work the skirmish packages left for core.
// Part one: the general targeted special action (Empower, Sigil of Power, Lightning Wreath, Guidance, Grim Returns), the Galvanic Capacitor limit per Vane,
// Polarity Field in the charge and slam lists, Warping Winds in the target list, Insulated Cortex and the general Shield Guard.
import { describe, expect, it } from 'vitest'
import { abilitiesOf, hasFlag, type AtkCtx } from '../../src/engine/code-hooks'
import { applyEffect, hasCondition } from '../../src/engine/effects'
import { menothPlugins } from '../../src/engine/factions/menoth'
import { needsTarget, targetedSpec } from '../../src/engine/targeted'
import type { GameState } from '../../src/engine/types'
import { asBTurn, asOut, bundle, evs, firstSeed, offerTargets, offers, parkExcept, place, raw, rec, send, settleAtk, start, toCombat, withModel } from './skirmish-followups'

describe('SKF-001 the general targeted-action flag (needsTarget replaced by targetedSpec)', () => {
  it('abilities with a chosen friendly model are targeted: the old three cases, the hooks that name one, and a data `targeted` flag', () => {
    for (const id of ['cry.a.repair', 'cry.a.enliven', 'cry.a.ancillary-attack', 'cry.a.empower', 'cry.a.grim-returns', 'kha.a.empower', 'kha.a.sigil-of-power', 'trl.a.guidance', 'cyg.a.lightning-wreath']) {
      expect(needsTarget(rec(id)), id).toBe(true)
    }
    for (const id of ['cyg.a.polarity-field-generator', 'cyg.a.wind-weaver', 'cir.a.sky-shaker', 'men.a.reconnaissance', 'cry.a.power-of-death', 'trl.a.regeneration']) expect(needsTarget(rec(id)), id).toBe(false)
    expect(needsTarget({ effect: [{ code: 'someNewHook' }], targeted: true })).toBe(true)
    expect(targetedSpec({ effect: [{ code: 'someNewHook' }], targeted: { range: 4 } })?.range).toBe(4)
    expect(needsTarget(undefined)).toBe(false)
  })
})

describe('SKF-002 Khador Arkanists: Empower and Sigil of Power ask for a target', () => {
  const scene = (seed: string): GameState => {
    let s = parkExcept(start('kha.l.skirmish', 'cyg.l.skirmish', seed), ['A:u4.1', 'A:e0', 'A:e1', 'A:e2', 'B:e0'])
    s = place(s, 'A:u4.1', { x: 0, z: 0 })
    s = place(s, 'A:e0', { x: 0, z: 3 }, { focus: 2 }) // Razor
    s = place(s, 'A:e1', { x: 3, z: 0 }, { focus: 0 }) // Dire Wolf: the least focus
    s = place(s, 'A:e2', { x: -3, z: 4 }) // Lazarenko, a solo, 5" from the Arkanist
    return place(s, 'B:e0', { x: -3, z: 9 }) // Deuce, nearest to Lazarenko
  }
  it('Empower is offered once per warjack in range, the least focus first, and gives the named one its focus', () => {
    const o = toCombat(scene('skf2a'), 'A:u4', 'A:u4.1')
    expect(offerTargets(o, 'kha.a.empower')).toEqual(['A:e1', 'A:e0'])
    const r = send(o, raw(offers(o, 'kha.a.empower').find((a) => a.targetId === 'A:e0')))
    expect(r.state.models['A:e0']!.focus).toBe(3) // Razor, the one the player named, not the one with the least focus
    expect(r.state.models['A:e1']!.focus).toBe(0)
  })
  it('without a target in the answer the first option (the old automatic pick) is used', () => {
    const o = toCombat(scene('skf2b'), 'A:u4', 'A:u4.1')
    const r = send(o, { type: 'chooseCombatAction', modelId: 'A:u4.1', choice: 'specialAction', abilityId: 'kha.a.empower' })
    expect(r.state.models['A:e1']!.focus).toBe(1)
  })
  it('Empower is not offered when no warjack is in range, or when every warjack in range is full', () => {
    const far = place(scene('skf2c'), 'A:e1', { x: 20, z: 20 })
    const o = toCombat(place(far, 'A:e0', { x: 0, z: 12 }), 'A:u4', 'A:u4.1')
    expect(offers(o, 'kha.a.empower')).toEqual([])
    const full = toCombat(withModel(withModel(scene('skf2d'), 'A:e0', { focus: 3 }), 'A:e1', { focus: 3 }), 'A:u4', 'A:u4.1')
    expect(offers(full, 'kha.a.empower')).toEqual([])
  })
  it('Sigil of Power names a friendly model in 6": the model nearest an enemy is listed first, and the chosen one gets the effect', () => {
    const o = toCombat(scene('skf2e'), 'A:u4', 'A:u4.1')
    const t = offerTargets(o, 'kha.a.sigil-of-power')
    expect(t[0]).toBe('A:e2') // Lazarenko stands closest to Deuce
    expect(t).toEqual(expect.arrayContaining(['A:e0', 'A:e1', 'A:e2']))
    const r = send(o, raw(offers(o, 'kha.a.sigil-of-power').find((a) => a.targetId === 'A:e1')))
    const e = r.state.effects.find((x) => x.sourceId === 'kha.a.sigil-of-power')!
    expect(e.targetIds).toEqual(['A:e1'])
  })
})

describe('SKF-003 Storm Vanes: Lightning Wreath names its model, and a Vane uses one capacitor effect a turn (Galvanic Capacitor)', () => {
  const scene = (seed: string): GameState => {
    let s = parkExcept(start('cyg.l.skirmish', 'kha.l.skirmish', seed), ['A:u4.1', 'A:u4.2', 'A:u4.3', 'A:e0', 'A:e1'])
    s = place(s, 'A:u4.1', { x: -3, z: 0 })
    s = place(s, 'A:u4.2', { x: -3, z: 2 })
    s = place(s, 'A:u4.3', { x: -3, z: -2 })
    s = place(s, 'A:e1', { x: -1, z: 0 }) // Falk: 2" away
    return place(s, 'A:e0', { x: -3, z: 4 }) // Deuce: 2" from the second Vane, 4" from the first
  }
  it('the wreath is offered once per friendly melee model in 3", and the named model (not an automatic pick) gets Electro Leap', () => {
    const o = toCombat(scene('skf3a'), 'A:u4', 'A:u4.2')
    expect(offerTargets(o, 'cyg.a.lightning-wreath').sort()).toEqual(['A:e0', 'A:e1'])
    const named = offers(o, 'cyg.a.lightning-wreath').find((a) => a.targetId !== offerTargets(o, 'cyg.a.lightning-wreath')[0])!
    const r = send(o, raw(named))
    const e = r.state.effects.find((x) => x.sourceId === 'cyg.a.lightning-wreath')!
    expect(e.targetIds).toEqual([named.targetId])
    expect(abilitiesOf(r.state, bundle, named.targetId)).toContain('cyg.a.electro-leap')
  })
  it('a Vane that used one capacitor effect is offered no other; the next Vane may take either of the two left, not the one already taken', () => {
    let o = toCombat(scene('skf3b'), 'A:u4', 'A:u4.1')
    const caps = ['cyg.a.lightning-wreath', 'cyg.a.polarity-field-generator', 'cyg.a.wind-weaver']
    expect(caps.filter((id) => offers(o, id).length > 0)).toEqual(caps.filter((id) => id !== 'cyg.a.lightning-wreath' || offers(o, id).length > 0)) // sanity
    o = send(o, raw(offers(o, 'cyg.a.polarity-field-generator')[0]))
    expect(o.pending.kind).toBe('chooseCombatAction') // an any-time action leaves the Combat Action
    for (const id of caps) expect(offers(o, id), `Vane 1 after Polarity: ${id}`).toEqual([])
    o = send(o, { type: 'chooseCombatAction', modelId: 'A:u4.1', choice: 'forfeit' })
    expect(o.pending.context.modelId).toBe('A:u4.2')
    expect(offers(o, 'cyg.a.polarity-field-generator')).toEqual([]) // no two Vanes pick the same effect
    expect(offers(o, 'cyg.a.wind-weaver').length).toBe(1)
    expect(offers(o, 'cyg.a.lightning-wreath').length).toBeGreaterThan(0)
    o = send(o, raw(offers(o, 'cyg.a.wind-weaver')[0]))
    for (const id of caps) expect(offers(o, id), `Vane 2 after Wind Weaver: ${id}`).toEqual([])
    o = send(o, { type: 'chooseCombatAction', modelId: 'A:u4.2', choice: 'forfeit' })
    expect(o.pending.context.modelId).toBe('A:u4.3')
    expect(caps.filter((id) => offers(o, id).length > 0)).toEqual(['cyg.a.lightning-wreath']) // only the third effect is left
  })
})

describe('SKF-004 Cryx Initiates: Grim Returns and Empower are offered only when they can do something', () => {
  const scene = (seed: string): GameState => {
    let s = parkExcept(start('cry.l.skirmish', 'cyg.l.skirmish', seed), ['A:u5.1', 'A:u5.2', 'A:u5.3', 'A:e0'])
    s = place(s, 'A:u5.1', { x: 0, z: 0 })
    s = place(s, 'A:u5.2', { x: 1.5, z: 0 })
    s = place(s, 'A:u5.3', { x: -1.5, z: 0 })
    return place(s, 'A:e0', { x: 0, z: 3 }, { focus: 0 }) // Hades
  }
  it('Grim Returns is not offered while the unit has all its Grunts, and is once one is destroyed (then on each trooper in 5")', () => {
    const o = toCombat(scene('skf4a'), 'A:u5', 'A:u5.1')
    expect(offers(o, 'cry.a.grim-returns')).toEqual([])
    expect(offerTargets(o, 'cry.a.empower')).toEqual(['A:e0']) // Hades has room for focus
    const hurt = scene('skf4b')
    const dead = withModel(hurt, 'A:u5.3', { life: 'destroyed' })
    const units = { ...dead.units, 'A:u5': { ...dead.units['A:u5']!, troopers: ['A:u5.1', 'A:u5.2'] } }
    const o2 = toCombat({ ...dead, units }, 'A:u5', 'A:u5.1')
    expect(offerTargets(o2, 'cry.a.grim-returns').sort()).toEqual(['A:u5.2'])
  })
})

describe('SKF-005 Trollbloods Runebearer: Guidance names its model and the weapons it gives are magical', () => {
  it('Guidance lists every friendly model in 6", the Leader first, and the effect lands on the one named', () => {
    let s = parkExcept(start('trl.l.skirmish', 'cyg.l.skirmish', 'skf5'), ['A:e5', 'A:L', 'A:e0', 'A:u3.1'])
    s = place(s, 'A:e5', { x: 0, z: 0 })
    s = place(s, 'A:L', { x: 4, z: 0 })
    s = place(s, 'A:e0', { x: 0, z: 4 })
    s = place(s, 'A:u3.1', { x: -2, z: 0 })
    const o = toCombat(s, 'A:e5')
    const t = offerTargets(o, 'trl.a.guidance')
    expect(t[0]).toBe('A:L')
    expect(t).toEqual(expect.arrayContaining(['A:L', 'A:e0', 'A:u3.1']))
    const r = send(o, raw(offers(o, 'trl.a.guidance').find((a) => a.targetId === 'A:u3.1')))
    const e = r.state.effects.find((x) => x.sourceId === 'trl.a.guidance')!
    expect(e.targetIds).toEqual(['A:u3.1'])
    expect((e as unknown as { magicalWeapons?: boolean }).magicalWeapons).toBe(true)
  })
})

describe('SKF-006 Polarity Field Generator: a construct cannot pick the unit as a charge or slam target', () => {
  const scene = (seed: string): GameState => {
    let s = parkExcept(start('kha.l.skirmish', 'cyg.l.skirmish', seed), ['A:e0', 'B:u4.1', 'B:u4.2', 'B:u4.3', 'B:e1'])
    s = place(s, 'A:e0', { x: 0, z: -6 }, { focus: 2 }) // Razor
    s = place(s, 'B:u4.1', { x: 0, z: 0 })
    s = place(s, 'B:u4.2', { x: 2, z: 0 })
    s = place(s, 'B:u4.3', { x: -2, z: 0 })
    s = place(s, 'B:e1', { x: 4, z: 1 }) // Falk, in the open too
    return applyEffect(s, { sourceId: 'cyg.a.polarity-field-generator', name: 'Polarity Field', owner: 'B', casterId: 'B:u4.1', targetIds: ['B:u4.1', 'B:u4.2', 'B:u4.3'], mods: [], duration: 'round' }).state
  }
  it('the charge list skips the Vanes but keeps Falk, and naming a Vane anyway is refused', () => {
    let o = asOut(scene('skf6a'))
    o = send(o, { type: 'chooseActivation', activate: 'A:e0' })
    o = send(o, { type: 'chooseMovement', option: 'charge', modelId: 'A:e0' })
    expect(o.pending.kind).toBe('chargeTarget')
    const t = (o.pending.options ?? []).map((x) => (x.action as { targetId: string }).targetId)
    expect(t).toContain('B:e1')
    for (const v of ['B:u4.1', 'B:u4.2', 'B:u4.3']) expect(t).not.toContain(v)
    expect(() => send(o, { type: 'chargeTarget', targetId: 'B:u4.1' })).toThrow(/Polarity/)
  })
  it('a living model charges the unit as usual (the field only bars constructs)', () => {
    let s = scene('skf6b')
    s = place(s, 'A:e0', { x: 15, z: -15 }) // Razor out of the way
    s = place(s, 'A:u3.1', { x: 0, z: -6 })
    let o = asOut(s)
    o = send(o, { type: 'chooseActivation', activate: 'A:u3' })
    o = send(o, { type: 'chooseMovement', option: 'charge', modelId: 'A:u3.1' })
    expect((o.pending.options ?? []).map((x) => (x.action as { targetId: string }).targetId)).toContain('B:u4.1')
  })
})

describe('SKF-007 Warping Winds: the target list loses 3 RNG at a protected model', () => {
  it('a Sniper (RNG 14) lists a Cygnar model 13" away until a Vane near it holds Warping Winds, and the preview agrees', () => {
    const base = (): GameState => {
      let s = parkExcept(start('kha.l.skirmish', 'cyg.l.skirmish', 'skf7'), ['A:u5.1', 'B:e1', 'B:u4.1'])
      s = place(s, 'A:u5.1', { x: 0, z: -8 })
      s = place(s, 'B:e1', { x: 0, z: 6.4 }, { focus: 0 }) // Falk, about 13" from the Sniper's edge
      return place(s, 'B:u4.1', { x: 0, z: 8.4 }) // a Vane within 3" of Falk
    }
    const shots = (s: GameState): string[] => {
      const o = toCombat(s, 'A:u5', 'A:u5.1')
      const r = send(o, { type: 'chooseCombatAction', modelId: 'A:u5.1', choice: 'ranged' })
      return (r.pending.options ?? []).filter((x) => x.action.type === 'chooseAttack').map((x) => (x.action as { targetId: string }).targetId)
    }
    expect(shots(base())).toContain('B:e1')
    const winds = applyEffect(base(), { sourceId: 'cyg.a.wind-weaver', name: 'Warping Winds', owner: 'B', casterId: 'B:u4.1', targetIds: ['B:u4.1'], mods: [], duration: 'round' }).state
    expect(shots(winds)).not.toContain('B:e1')
  })
})

describe('SKF-008 Insulated Cortex: this warjack cannot be disrupted', () => {
  // a test weapon whose hit applies Disruption (no card does yet): the shared bundle gets it once
  bundle.byId['t.a.disrupt'] = { id: 't.a.disrupt', name: 'Test Disrupt', kind: 'specialAttack', trigger: 'attack.hit', effect: [{ op: 'applyCondition', condition: 'disrupted' }], scope: { who: 'target' }, duration: 'instant' } as never
  bundle.byId['t.w.zapper'] = { id: 't.w.zapper', name: 'Zapper', type: 'melee', rng: 1, pow: 1, abilities: ['t.a.disrupt'] } as never
  bundle.byId['t.p.zapper'] = { ...rec('kha.hounds-fedyniak'), id: 't.p.zapper', weapons: [{ weapon: 't.w.zapper' }], stats: { ...rec('kha.hounds-fedyniak').stats, MAT: 30 } } as never
  const zap = (target: string, seed: string): { disrupted: boolean } | null => {
    let s = parkExcept(start('kha.l.skirmish', 'cyg.l.skirmish', seed), ['A:u3.1', target])
    s = withModel(s, 'A:u3.1', { profileId: 't.p.zapper' })
    s = place(s, 'A:u3.1', { x: 0, z: 0 })
    s = place(s, target, { x: 0, z: 1.6 })
    let o = toCombat(s, 'A:u3', 'A:u3.1')
    o = send(o, { type: 'chooseCombatAction', modelId: 'A:u3.1', choice: 'melee' })
    o = send(o, { type: 'chooseAttack', modelId: 'A:u3.1', weaponId: 't.w.zapper', targetId: target, additional: false })
    o = settleAtk(o)
    if (!evs(o.events, 'AttackResolved').some((e) => e.hit)) return null
    return { disrupted: hasCondition(o.state, o.state.models[target]!, 'disrupted') }
  }
  it('the flag is on the Courser; a hit that applies Disruption sticks to Deuce and bounces off the Courser', () => {
    expect(hasFlag(start('cyg.l.skirmish', 'kha.l.skirmish', 'skf8f'), bundle, 'A:e5', 'insulatedCortex')).toBe(true)
    expect(firstSeed('skf8a', (sd) => zap('B:e0', sd)).disrupted).toBe(true)
    expect(firstSeed('skf8b', (sd) => zap('B:e5', sd)).disrupted).toBe(false)
  })
})

describe('SKF-009 Shield Guard is general: any friendly model, ended by a crippled Head', () => {
  const plugin = menothPlugins.find((p) => p.id === 'men.faction')!
  const shot = (s: GameState, attacker: string, target: string): AtkCtx =>
    ({ attackerId: attacker, targetId: target, kind: 'ranged', x: { results: { [target]: { hit: true, crit: false, auto: null, total: 9, dice: [4, 5] } }, rollTargets: [target], flags: {} } }) as unknown as AtkCtx
  const scene = (seed: string, patch: Partial<GameState['models'][string]> = {}): GameState => {
    let s = parkExcept(start('kha.l.skirmish', 'cyg.l.skirmish', seed), ['A:u5.1', 'B:u2.1', 'B:e5'])
    s = place(s, 'A:u5.1', { x: 0, z: -9 })
    s = place(s, 'B:u2.1', { x: 0, z: 0 }) // a Black 13th trooper
    return place(s, 'B:e5', { x: 2.5, z: 0 }, patch) // the Courser, within 3"
  }
  it('the Courser takes a ranged hit meant for a Black 13th trooper (a trooper of another unit), once per round', () => {
    const s = scene('skf9a')
    const r = plugin.beforeHits!(s, bundle, shot(s, 'A:u5.1', 'B:u2.1'))!
    const a = r.state.attack as unknown as AtkCtx
    expect(a.targetId).toBe('B:e5')
    expect(a.x.results['B:e5']!.hit).toBe(true)
    expect(a.x.results['B:u2.1']).toBeUndefined()
    // spent: the same Courser does not step in a second time this round
    expect(plugin.beforeHits!(r.state, bundle, shot(r.state, 'A:u5.1', 'B:u2.1'))).toBeNull()
  })
  it('a Courser with a crippled Head (location H) does not step in, nor does one that is knocked down', () => {
    const s = scene('skf9b', { crippled: ['H'] })
    expect(plugin.beforeHits!(s, bundle, shot(s, 'A:u5.1', 'B:u2.1'))).toBeNull()
    const kd = scene('skf9c', { conditions: ['knockedDown'] })
    expect(plugin.beforeHits!(kd, bundle, shot(kd, 'A:u5.1', 'B:u2.1'))).toBeNull()
  })
  it('a spray is not covered, and a trooper that has Shield Guard itself (a Defender) is still not shielded by a Defender', () => {
    const s = scene('skf9d')
    expect(plugin.beforeHits!(s, bundle, { ...shot(s, 'A:u5.1', 'B:u2.1'), kind: 'spray' } as unknown as AtkCtx)).toBeNull()
    let m = parkExcept(start('kha.l.skirmish', 'men.l.skirmish', 'skf9e'), ['A:u5.1', 'B:u4.1', 'B:u4.2'])
    m = place(m, 'B:u4.1', { x: 0, z: 0 })
    m = place(m, 'B:u4.2', { x: 1.5, z: 0 })
    expect(plugin.beforeHits!(m, bundle, shot(m, 'A:u5.1', 'B:u4.1'))).toBeNull()
  })
})

void asBTurn
