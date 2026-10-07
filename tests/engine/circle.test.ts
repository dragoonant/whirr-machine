// Circle Orboros faction abilities (docs/spec/factions/circle.md). FAC-CIR-nnn ids follow the spec's ability map.
// States are the Quick Start game with Khador models re-profiled as Circle models, so the real pipeline runs.
import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../src/engine/events'
import { applyDamage, newGrid } from '../../src/engine/damage'
import { abilitiesOf, atkOf, evalCond, runCodeEffect, setAtk, statOf } from '../../src/engine/code-hooks'
import { addCondition, applyEffect } from '../../src/engine/effects'
import { useFeat, castSpell, anytimeOptions } from '../../src/engine/spells'
import { declareAttack, moverInfo } from '../../src/engine/phases/activation'
import type { GameState, ModelState } from '../../src/engine/types'
import {
  CORPSE_CAP, activeWarp, admonitionReady, afflictionFloor, circleHooks, circlePlugins, circleSpellCost, deathPoweredArm, layoutFor,
  markedBoxes, noHealing, ritesChannelers, scythingTouchArmPenalty, setWarp, treewalkerDefBonus, vitalMagicKeep, vitalMagicOffer,
} from '../../src/engine/factions/circle'
import { asOut, bundle, choose, openCombat, place, send, settle, startState, trySend } from './action-helpers'

const B = bundle
const TANITH = 'A:L', BEAST = 'A:e0', LORD = 'A:e1', RAV = ['A:u2.1', 'A:u2.2', 'A:u2.3']
const spiral = (): ModelState['damage'] => {
  const layout = layoutFor(B, { profileId: 'cir.pureblood' } as ModelState)![0]!
  return { track: 'grid', grids: [newGrid(layout)] }
}

/** The QS start state with side A re-profiled as Circle: Tanith, Pureblood, Lord, three Ravagers. Side B stays Cygnar. */
function circleState(seed: string, o: { focus?: number } = {}): GameState {
  let s = startState(seed).state
  const patch = (id: string, p: Partial<ModelState>) => { s = { ...s, models: { ...s.models, [id]: { ...s.models[id]!, ...p } } } }
  patch(TANITH, { profileId: 'cir.tanith', base: 30, damage: { track: 'single', filled: 0, boxes: 15 }, fury: 6, focus: o.focus ?? 0, pos: { x: 0, z: -12 } })
  patch(BEAST, { profileId: 'cir.pureblood', type: 'beast', base: 50, damage: spiral(), fury: 0, focus: 0, controllerId: TANITH, pos: { x: 3, z: -12 } })
  patch(LORD, { profileId: 'cir.lord-of-the-feast', base: 30, damage: { track: 'single', filled: 0, boxes: 8 }, pos: { x: -3, z: -12 } })
  RAV.forEach((id, i) => patch(id, { profileId: `cir.ravager-${i + 1}`, base: 40, damage: { track: 'single', filled: 0, boxes: 8 }, pos: { x: -6 + i * 2, z: -9 } }))
  s = { ...s, units: { ...s.units, 'A:u2': { ...s.units['A:u2']!, profileId: 'cir.ravagers' } } }
  return s
}
const withTokens = (s: GameState, id: string, n: number): GameState => ({ ...s, models: { ...s.models, [id]: { ...s.models[id]!, tokens: { corpse: n } } } })
const hurt = (s: GameState, id: string, pts: number): GameState => {
  const m = s.models[id]!
  return applyDamage(s, id, pts, { layouts: layoutFor(B, m), column: 1 }).state
}
const hook = (s: GameState, code: string, id: string, extra: Record<string, unknown> = {}, params: Record<string, unknown> = {}) =>
  runCodeEffect(s, B, code, { point: 'activation.start', selfId: id, activePlayer: s.activePlayer, ...extra }, params)
const types = (ev: GameEvent[]) => ev.map((e) => e.type)
/** A declared Cygnar pistol attack on a damaged Ravager (the state Rapid Healing's attack.resolved hook sees); `damaged` logs this attack's damage. */
function pistolOnRavager(seed: string, damaged: boolean): GameState {
  let s = circleState(seed)
  s = place(s, RAV[0]!, { x: 0, z: -3 })
  s = place(s, 'B:L', { x: 0, z: -9 })
  s = hurt(s, RAV[0]!, 4)
  s = { ...s, activePlayer: 'B', pending: { ...s.pending, kind: 'chooseActivation', player: 'B', id: 'd:900', options: [] }, decisionSeq: 900 }
  let o = choose(asOut(s), 'B:L')
  o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'B:L' })
  const d = declareAttack(o.state, B, { attackerId: 'B:L', targetId: RAV[0]!, weaponId: 'cyg.w.spellstorm-pistol', additional: false, noFocus: false, chargeAttack: false })
  if ('rejection' in d) throw new Error(JSON.stringify(d.rejection))
  const a = atkOf(d.state)!
  return damaged ? setAtk(d.state, { ...a, x: { ...a.x, flags: { ...a.x.flags, damagedIds: [RAV[0]!] } } }) : d.state
}

describe('Circle data and hooks wiring', () => {
  it('FAC-CIR-000 every {code} the Circle data references is registered and prefixed', () => {
    const codes = new Set<string>()
    const walk = (n: unknown) => { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === 'object') { const o = n as Record<string, unknown>; if (typeof o.code === 'string') codes.add(o.code); Object.values(o).forEach(walk) } }
    for (const r of Object.values(B.byId) as Record<string, unknown>[]) if (typeof r.id === 'string' && r.id.startsWith('cir.') && ['ability', 'spell', 'feat'].includes(r.recordType as string)) { walk(r.effect); walk(r.when) }
    expect(codes.size).toBeGreaterThanOrEqual(15)
    for (const c of codes) { expect(c.startsWith('cir')).toBe(true); expect(circleHooks.effects[c], c).toBeTypeOf('function') }
  })
})

describe('Tanith', () => {
  it('FAC-CIR-001 Dark Power: an arcane attack gets a damage die and drops the lowest (Rift through the real pipeline)', () => {
    const s0 = place(circleState('dp1', { focus: 6 }), 'B:e1', { x: 0, z: -4 })
    let o = choose(asOut(s0), TANITH)
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: TANITH })
    const r = declareAttack(o.state, B, { attackerId: TANITH, targetId: 'B:e1', spellId: 'cir.s.rift', additional: false, noFocus: false, chargeAttack: false })
    if ('rejection' in r) throw new Error(JSON.stringify(r.rejection))
    expect(atkOf(r.state)!.x.specs).toContain('cir.a.dark-power-damage')
    expect(atkOf(r.state)!.x.specs).toContain('cir.a.dark-power')
    const ab = B.byId['cir.a.dark-power-damage'] as unknown as { effect: { op: string }[] }
    expect(ab.effect.map((e) => e.op)).toEqual(['addDie', 'discardLowest'])
    const atk = B.byId['cir.a.dark-power'] as unknown as { when: { value: string } }
    expect(atk.when.value).toBe('arcane')
  })

  it('FAC-CIR-001b Dark Power does not apply to a plain ranged weapon attack', () => {
    const s0 = place(circleState('dp2'), 'B:e1', { x: 0, z: -4 })
    let o = choose(asOut(s0), TANITH)
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: TANITH })
    const r = declareAttack(o.state, B, { attackerId: TANITH, targetId: 'B:e1', weaponId: 'cir.w.jaws-of-the-earth', additional: false, noFocus: false, chargeAttack: false })
    if ('rejection' in r) throw new Error(JSON.stringify(r.rejection))
    const a = atkOf(r.state)!
    expect(a.kind).toBe('aoe')
    expect(evalCond(r.state, B, (B.byId['cir.a.dark-power'] as unknown as { when: never }).when, { selfId: TANITH, atk: a })).toBe(false)
  })

  it('FAC-CIR-002 Field Marshal [Prowl]: the Pureblood has Prowl, Tanith herself and enemy beasts do not get it from it', () => {
    const s = circleState('fm')
    expect(abilitiesOf(s, B, BEAST)).toContain('core.a.prowl')
    expect(abilitiesOf(s, B, 'B:e0')).not.toContain('core.a.prowl')
    expect(abilitiesOf(s, B, LORD)).not.toContain('core.a.prowl')
    // Prowl is also Tanith's own ability (spec: Stealth while she has concealment)
    expect(abilitiesOf(s, B, TANITH)).toContain('core.a.prowl')
    expect((B.byId['cir.tanith'] as unknown as { abilities: string[] }).abilities).toContain('core.a.prowl')
  })

  it('FAC-CIR-003 Vital Magic: she may keep an expiring upkeep for d3 damage; others are not offered', () => {
    let s = circleState('vm')
    s = { ...s, effects: [
      { id: 'e:1', sourceId: 'cir.s.affliction', name: 'Affliction', owner: 'A', casterId: TANITH, targetIds: ['B:e1'], mods: [], duration: 'upkeep', expires: null },
      { id: 'e:2', sourceId: 'cyg.s.deflection', name: 'Deflection', owner: 'B', casterId: 'B:L', targetIds: ['B:L'], mods: [], duration: 'upkeep', expires: null },
    ] }
    expect(vitalMagicOffer(s, B, TANITH, ['e:1', 'e:2'])).toEqual(['e:1'])
    expect(vitalMagicOffer(s, B, 'B:L', ['e:2'])).toEqual([])
    const k = vitalMagicKeep(s, B, TANITH)
    expect(k.points).toBeGreaterThanOrEqual(1)
    expect(k.points).toBeLessThanOrEqual(3)
    expect(markedBoxes(k.state.models[TANITH]!)).toBe(k.points)
  })

  it('FAC-CIR-014 From Beneath and Critical Consume are on Jaws of the Earth; Shadow Bind is on the Staff', () => {
    const jaws = B.byId['cir.w.jaws-of-the-earth'] as unknown as { abilities: string[]; aoe: number; pow: number; blastPow: number }
    expect(jaws.abilities).toEqual(['cir.a.from-beneath', 'cir.a.critical-consume'])
    expect([jaws.aoe, jaws.pow, jaws.blastPow]).toEqual([2, 13, 7])
    const fb = B.byId['cir.a.from-beneath'] as unknown as { effect: { ignore: string }[] }
    expect(fb.effect.map((e) => e.ignore).sort()).toEqual(['concealment', 'cover'])
    const staff = B.byId['cir.w.staff-of-fate'] as unknown as { abilities: string[]; rng: number }
    expect(staff.abilities).toEqual(['cir.a.shadow-bind'])
    expect(staff.rng).toBe(2)
    const sb = B.byId['cir.a.shadow-bind'] as unknown as { effect: { condition: string }[] }
    expect(sb.effect[0]!.condition).toBe('shadowBind')
  })

  it('FAC-CIR-015 Critical Consume removes a small-based non-Leader from play on a critical hit (loop seeds)', () => {
    let seen = false
    for (let i = 0; i < 160 && !seen; i++) {
      let s = circleState('cc' + i)
      for (const m of Object.values(s.models)) if (m.id !== TANITH && m.id !== 'B:e1') s = place(s, m.id, { x: -16 + (Number(m.id.length) % 5), z: 16 })
      s = place(s, 'B:e1', { x: 0, z: -7 })
      let o = openCombat(choose0(s), TANITH, 'ranged')
      o = send(o, { type: 'chooseAttack', modelId: TANITH, weaponId: 'cir.w.jaws-of-the-earth', targetId: 'B:e1', additional: false })
      o = settle(o)
      const res = o.events.find((e) => e.type === 'AttackResolved') as Extract<GameEvent, { type: 'AttackResolved' }> | undefined
      if (!res?.crit) continue
      seen = true
      expect(o.state.models['B:e1']!.life).toBe('boxed')
      expect(o.events.some((e) => e.type === 'ModelRemoved' && e.modelId === 'B:e1' && e.reason === 'removedFromPlay')).toBe(true)
    }
    expect(seen).toBe(true)
  })

  it('FAC-CIR-015b Critical Consume spares a Leader and a medium base (the condition says so)', () => {
    const s = circleState('cc-neg')
    const when = (B.byId['cir.a.critical-consume'] as unknown as { when: never }).when
    const env = (t: string) => ({ selfId: TANITH, targetId: t })
    expect(evalCond(s, B, when, env('B:e1'))).toBe(true) // Falk, 30 mm solo
    expect(evalCond(s, B, when, env('B:L'))).toBe(false) // Caine is a Leader
    expect(evalCond(s, B, when, env('B:e0'))).toBe(false) // Deuce, 50 mm
  })

  it('FAC-CIR-020 Rites of the Wurm: her spells cost 1 less (floor 1), beasts channel, animi cost 1 less', () => {
    let s = circleState('rites')
    const before = circleSpellCost(s, B, TANITH, 'cir.s.rift', 3)
    expect(before).toBe(3)
    expect(ritesChannelers(s, B, TANITH)).toEqual([])
    let o = choose(asOut(s), TANITH)
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: TANITH })
    const f = useFeat(o.state, B, { type: 'useFeat', decisionId: o.pending.id, player: 'A', casterId: TANITH, featId: 'cir.f.rites-of-the-wurm' })
    if ('rejection' in f) throw new Error(JSON.stringify(f.rejection))
    s = f.state
    expect(circleSpellCost(s, B, TANITH, 'cir.s.rift', 3)).toBe(2)
    expect(circleSpellCost(s, B, TANITH, 'cir.s.admonition', 1)).toBe(1)
    expect(circleSpellCost(s, B, BEAST, 'cir.s.wraithbane', 2)).toBe(1)
    expect(circleSpellCost(s, B, 'B:L', 'cyg.s.deflection', 3)).toBe(3)
    expect(ritesChannelers(s, B, TANITH)).toEqual([BEAST])
    s = place(s, BEAST, { x: 0, z: 10 }) // far outside CTRL 12
    expect(ritesChannelers(s, B, TANITH)).toEqual([])
    expect(circleSpellCost(s, B, BEAST, 'cir.s.wraithbane', 2)).toBe(2)
  })
})

describe('Tanith spells', () => {
  const cast = (s: GameState, spellId: string, targetId?: string) => {
    let o = choose(asOut(s), TANITH)
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: TANITH })
    const r = castSpell(o.state, B, { type: 'castSpell', decisionId: o.pending.id, player: 'A', casterId: TANITH, spellId, ...(targetId ? { targetId } : {}) })
    if ('rejection' in r) throw new Error(JSON.stringify(r.rejection))
    return r
  }

  it('FAC-CIR-021 Affliction is offensive (spec OFF yes): the cast hands back an attack, it is not a plain debuff', () => {
    let s = circleState('aff0', { focus: 6 })
    s = place(s, 'B:e1', { x: 0, z: -7 })
    expect((B.byId['cir.s.affliction'] as unknown as { offensive: boolean }).offensive).toBe(true)
    const r = cast(s, 'cir.s.affliction', 'B:e1')
    expect('offensive' in r && r.offensive).toMatchObject({ spellId: 'cir.s.affliction', targetId: 'B:e1' })
    expect(r.state.effects.some((e) => e.sourceId === 'cir.s.affliction')).toBe(false) // nothing lands before the attack roll hits
    expect(afflictionFloor(s, 'B:e1', 0, true)).toBe(0)
  })

  it('FAC-CIR-021b Affliction through the engine: a hit puts -2 DEF and the 1-damage floor on the target (upkeep), no damage roll of its own (loop seeds)', () => {
    let hit = false, missed = false
    for (let i = 0; i < 80 && !(hit && missed); i++) {
      let s = circleState('aff' + i, { focus: 6 })
      s = place(s, 'B:e1', { x: 0, z: -7 })
      const base = statOf(s, B, 'B:e1', 'DEF')
      let o = choose(asOut(s), TANITH)
      o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: TANITH })
      o = send(o, { type: 'castSpell', casterId: TANITH, spellId: 'cir.s.affliction', targetId: 'B:e1' })
      o = settle(o)
      const res = o.events.find((e) => e.type === 'AttackResolved') as Extract<GameEvent, { type: 'AttackResolved' }> | undefined
      expect(res).toBeDefined()
      expect(o.events.some((e) => e.type === 'DamageRolled')).toBe(false) // the card has no POW
      const eff = o.state.effects.find((e) => e.sourceId === 'cir.s.affliction')
      if (!res!.hit) { missed = true; expect(eff).toBeUndefined(); continue }
      hit = true
      expect(eff).toMatchObject({ casterId: TANITH, targetIds: ['B:e1'], duration: 'upkeep', upkeep: { casterId: TANITH } })
      expect(o.state.upkeeps['B:e1']?.enemy).toBe(eff!.id)
      expect(statOf(o.state, B, 'B:e1', 'DEF')).toBe(base - 2)
      expect(afflictionFloor(o.state, 'B:e1', 0, true)).toBe(1)
      expect(afflictionFloor(o.state, 'B:e1', 0, false)).toBe(0)
      expect(afflictionFloor(o.state, 'B:e1', 4, true)).toBe(4)
      expect(afflictionFloor(s, 'B:e1', 0, true)).toBe(0)
    }
    expect(hit).toBe(true)
    expect(missed).toBe(true)
  })

  it('FAC-CIR-021c Affliction unit form: a hit on one Black 13th trooper puts -2 DEF on the whole unit as ONE upkeep; a model alone gets it alone (loop seeds)', () => {
    let hit = false
    for (let i = 0; i < 80 && !hit; i++) {
      let s = circleState('affu' + i, { focus: 6 })
      const mates = ['B:u2.1', 'B:u2.2', 'B:u2.3']
      s = place(place(place(s, mates[0]!, { x: 0, z: -7 }), mates[1]!, { x: 2, z: -7 }), mates[2]!, { x: -2, z: -7 })
      const base = statOf(s, B, mates[0]!, 'DEF')
      let o = choose(asOut(s), TANITH)
      o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: TANITH })
      o = send(o, { type: 'castSpell', casterId: TANITH, spellId: 'cir.s.affliction', targetId: mates[0]! })
      o = settle(o)
      const eff = o.state.effects.find((e) => e.sourceId === 'cir.s.affliction')
      if (!eff) continue
      hit = true
      const unit = Object.values(o.state.models).filter((m) => m.unitId === o.state.models[mates[0]!]!.unitId && m.life === 'active' && !m.offTable).map((m) => m.id)
      expect(unit.length).toBeGreaterThanOrEqual(3)
      expect([...eff.targetIds].sort()).toEqual([...unit].sort())
      for (const id of unit) {
        expect(statOf(o.state, B, id, 'DEF')).toBe(statOf(s, B, id, 'DEF') - 2)
        expect(afflictionFloor(o.state, id, 0, true)).toBe(1)
        expect(o.state.upkeeps[id]?.enemy).toBe(eff.id)
      }
      expect(base).toBe(statOf(s, B, mates[0]!, 'DEF'))
      expect(statOf(o.state, B, 'B:e0', 'DEF')).toBe(statOf(s, B, 'B:e0', 'DEF')) // an unrelated model is untouched
      expect(o.state.effects.filter((e) => e.sourceId === 'cir.s.affliction').length).toBe(1) // one casting, one upkeep
    }
    expect(hit).toBe(true)
  })

  it('FAC-CIR-022 Veil of Mists: a 3 inch cloud its owner side sees through, tied to the spell effect', () => {
    const s = circleState('veil', { focus: 6 })
    const r = cast(s, 'cir.s.veil-of-mists')
    expect(r.state.clouds.length).toBe(1)
    const c = r.state.clouds[0]!
    expect(c.diameter).toBe(3)
    expect(c.blocksLos).toBe(true)
    expect((c as { friendlyTransparent?: boolean }).friendlyTransparent).toBe(true)
    const eff = r.state.effects.find((e) => e.sourceId === 'cir.s.veil-of-mists')!
    expect(c.effectId).toBe(eff.id)
    expect(types(r.events)).toContain('CloudCreated')
  })

  it('FAC-CIR-023 Scything Touch: enemies within 2 inches of the shrouded model get -2 ARM, others do not', () => {
    let s = circleState('scy', { focus: 6 })
    s = place(place(s, TANITH, { x: 0, z: -8 }), LORD, { x: 0, z: -4 })
    const r = cast(s, 'cir.s.scything-touch', LORD)
    s = place(r.state, 'B:e1', { x: 0, z: -2 })
    expect(scythingTouchArmPenalty(s, 'B:e1')).toBe(-2)
    expect(scythingTouchArmPenalty(place(s, 'B:e1', { x: 0, z: 3 }), 'B:e1')).toBe(0)
    expect(scythingTouchArmPenalty(s, RAV[0]!)).toBe(0) // friendly
  })

  it('FAC-CIR-024 Admonition: a battlegroup warbeast; lists the ward within 6 inches of an enemy that ended a move', () => {
    let s = circleState('adm', { focus: 6 })
    s = place(place(s, TANITH, { x: 0, z: -8 }), BEAST, { x: 0, z: -4 })
    const r = cast(s, 'cir.s.admonition', BEAST)
    expect(r.state.effects.some((e) => e.sourceId === 'cir.s.admonition' && e.targetIds.includes(BEAST))).toBe(true)
    s = place(r.state, 'B:e1', { x: 0, z: 0 })
    expect(admonitionReady(s, 'B:e1').map((x) => x.modelId)).toEqual([BEAST])
    expect(admonitionReady(place(s, 'B:e1', { x: 0, z: 9 }), 'B:e1')).toEqual([])
  })

  it('FAC-CIR-024b Admonition is refused on anything outside the battlegroup: the Lord (a solo), a Ravager, an enemy, a wild beast or another warlock beast; Tanith herself is allowed', () => {
    let s = circleState('adm2', { focus: 6 })
    s = place(place(s, TANITH, { x: 0, z: -8 }), BEAST, { x: 0, z: -4 })
    s = place(place(s, LORD, { x: 2, z: -5 }), RAV[0]!, { x: -2, z: -5 })
    s = place(s, 'B:e0', { x: 3, z: -6 })
    let o = choose(asOut(s), TANITH)
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: TANITH })
    const tryCast = (target: string, st = o.state) => castSpell(st, B, { type: 'castSpell', decisionId: o.pending.id, player: 'A', casterId: TANITH, spellId: 'cir.s.admonition', targetId: target })
    for (const t of [LORD, RAV[0]!, 'B:e0']) expect('rejection' in tryCast(t), t).toBe(true)
    expect('rejection' in tryCast(BEAST)).toBe(false)
    const wild = { ...o.state, models: { ...o.state.models, [BEAST]: { ...o.state.models[BEAST]!, wild: true } } }
    expect('rejection' in tryCast(BEAST, wild)).toBe(true)
    const other = { ...o.state, models: { ...o.state.models, [BEAST]: { ...o.state.models[BEAST]!, controllerId: LORD } } }
    expect('rejection' in tryCast(BEAST, other)).toBe(true)
    // legal casts offered to the player list the warbeast and no other model
    const offered = anytimeOptions(o.state, B, TANITH, o.pending.id).map((x) => x.action).filter((a) => a.type === 'castSpell' && a.spellId === 'cir.s.admonition').map((a) => (a as { targetId?: string }).targetId)
    expect([...offered].sort()).toEqual([BEAST, TANITH].sort()) // the warbeast and Tanith herself, no other model
    expect('rejection' in tryCast(TANITH)).toBe(false)
  })

  it('FAC-CIR-024c Admonition on Tanith herself: an enemy that ends a move within 6 inches gives her the 3 inch advance, then the spell ends', () => {
    let s = circleState('adm3', { focus: 6 })
    s = place(s, TANITH, { x: 0, z: -3 })
    s = place(s, 'B:e0', { x: 0, z: 9 })
    for (const [i, id] of ['B:u2.1', 'B:u2.2', 'B:u2.3'].entries()) s = place(s, id, { x: 10 + i * 2, z: 14 })
    let o = choose(asOut(s), TANITH)
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: TANITH })
    o = send(o, { type: 'castSpell', casterId: TANITH, spellId: 'cir.s.admonition', targetId: TANITH })
    const eff = o.state.effects.find((e) => e.sourceId === 'cir.s.admonition')!
    expect(eff.targetIds).toEqual([TANITH])
    expect(eff.upkeep?.casterId).toBe(TANITH)
    expect(o.state.models[TANITH]!.fury).toBe(4) // paid 2 fury from her pool of 6
    // the enemy turn: Deuce advances to within 6 inches of her and she answers with a 3 inch advance
    let t = { ...o.state, activePlayer: 'B' as const, pending: { ...o.state.pending, kind: 'chooseActivation' as const, player: 'B' as const, id: 'd:902', options: [] }, decisionSeq: 902, activation: null }
    t = { ...t, models: { ...t.models, [TANITH]: { ...t.models[TANITH]!, activated: false } } }
    let e = choose(asOut(t), 'B:e0')
    e = send(e, { type: 'chooseMovement', option: 'advance', modelId: 'B:e0' })
    e = send(e, { type: 'moveModel', modelId: 'B:e0', path: [{ x: 0, z: 3.5 }] })
    expect(e.pending.kind).toBe('moveModel')
    expect(e.pending.player).toBe('A')
    e = send(e, { type: 'moveModel', modelId: TANITH, path: [{ x: 0, z: -0.5 }] })
    expect(e.state.models[TANITH]!.pos.z).toBeCloseTo(-0.5)
    expect(e.state.effects.some((x) => x.sourceId === 'cir.s.admonition')).toBe(false)
    expect(e.pending.player).toBe('B')
  })

  it('FAC-CIR-025 Wraithbane (animus) makes the target\'s attacks Blessed through Wraithbane Weapons', () => {
    let s = circleState('wb', { focus: 6 })
    s = place(s, LORD, { x: 0, z: -6 })
    s = place(s, 'B:e1', { x: 0, z: -5 })
    // Tanith does not know Wraithbane herself (it is the Pureblood's animus); the fury cast path makes this same effect.
    const r = { state: applyEffect(s, { sourceId: 'cir.s.wraithbane', name: 'Wraithbane', owner: 'A', casterId: TANITH, targetIds: [LORD], mods: [], duration: 'turn' }).state }
    expect(r.state.effects.some((e) => e.sourceId === 'cir.s.wraithbane' && e.targetIds.includes(LORD))).toBe(true)
    const rb = (B.byId['cir.pureblood'] as unknown as { animus: string }).animus
    expect(rb).toBe('cir.s.wraithbane')
    const decl = (st: GameState) => {
      let o = choose(asOut(st), LORD)
      o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: LORD })
      const d = declareAttack(o.state, B, { attackerId: LORD, targetId: 'B:e1', weaponId: 'cir.w.wurmblade', additional: false, noFocus: false, chargeAttack: false })
      if ('rejection' in d) throw new Error(JSON.stringify(d.rejection))
      return atkOf(d.state)!
    }
    expect(decl(r.state).x.blessed).toBe(true)
    expect(decl(s).x.blessed).toBe(false)
  })
})

function choose0(s: GameState) { return asOut(s) }

describe('Pureblood Warpwolf', () => {
  it('FAC-CIR-004 Controlled Warping hook: no pick, no warp (no default); a pick replaces the old one; frenzy forces Strength', () => {
    let s = circleState('cw')
    expect(activeWarp(s, B, BEAST)).toBeNull()
    expect(hook(s, 'cirControlledWarping', BEAST).state.effects.some((e) => e.sourceId.startsWith('cir.a.warp-'))).toBe(false)
    expect(activeWarp(s, B, LORD)).toBeNull()
    let r = hook(s, 'cirControlledWarping', BEAST, {}, { choice: 'ghostly' })
    s = r.state
    expect(activeWarp(s, B, BEAST)).toBe('ghostly')
    expect(s.effects.filter((e) => e.sourceId.startsWith('cir.a.warp-')).length).toBe(1)
    r = hook(s, 'cirControlledWarping', BEAST, {}, { choice: 'spellWard' })
    s = r.state
    expect(activeWarp(s, B, BEAST)).toBe('spellWard')
    expect(s.effects.filter((e) => e.sourceId.startsWith('cir.a.warp-')).length).toBe(1)
    s = { ...s, models: { ...s.models, [BEAST]: { ...s.models[BEAST]!, frenzied: true } } }
    r = hook(s, 'cirControlledWarping', BEAST, {}, { choice: 'ghostly' })
    expect(activeWarp(r.state, B, BEAST)).toBe('strength')
  })

  it('FAC-CIR-004b Controlled Warping through the engine: activating a beast asks which warp (three options), the pick is the one applied, a bad answer is refused', () => {
    const s = circleState('cw-eng')
    let o = choose(asOut(s), BEAST)
    expect(o.pending.kind).toBe('abilityChoice')
    expect(o.pending.context.data).toMatchObject({ code: 'startTrigger', warp: true })
    expect((o.pending.options ?? []).map((x) => x.id).sort()).toEqual(['ghostly', 'spellWard', 'strength'])
    expect(activeWarp(o.state, B, BEAST)).toBeNull() // nothing is chosen for the player
    expect(trySend(o, { type: 'abilityChoice', optionId: 'skip' })).toMatchObject({ rejection: expect.anything() })
    expect(trySend(o, { type: 'abilityChoice', optionId: 'use' })).toMatchObject({ rejection: expect.anything() })
    for (const pick of ['ghostly', 'spellWard', 'strength'] as const) {
      const o2 = send(o, { type: 'abilityChoice', optionId: pick })
      expect(activeWarp(o2.state, B, BEAST)).toBe(pick)
      expect(o2.state.effects.filter((e) => e.sourceId.startsWith('cir.a.warp-')).length).toBe(1)
      expect(o2.pending.kind).toBe('chooseMovement') // on to Normal Movement
    }
  })

  it('FAC-CIR-004c a frenzied beast takes Warp Strength with no choice offered', () => {
    let s = circleState('cw-fz')
    s = { ...s, models: { ...s.models, [BEAST]: { ...s.models[BEAST]!, frenzied: true } } }
    const o = choose(asOut(s), BEAST)
    expect(o.pending.kind).not.toBe('abilityChoice')
    expect(activeWarp(o.state, B, BEAST)).toBe('strength')
  })

  it('FAC-CIR-005 Spell Ward: the warp carries a spell-only forbid for the engine to read', () => {
    const r = setWarp(circleState('sw'), BEAST, 'spellWard')
    const e = r.state.effects.find((x) => x.sourceId === 'cir.a.warp-spell-ward')!
    expect(e.forbid).toEqual(['beTargetedBySpell'])
    expect(e.duration).toBe('round')
    const ab = B.byId['cir.a.warp-spell-ward'] as unknown as { effect: { op: string; what: string }[] }
    expect(ab.effect[0]).toMatchObject({ op: 'forbid', what: 'beTargeted' })
  })

  it('FAC-CIR-006 Warp Strength: +2 melee damage only while Strength is the warp (plugin)', () => {
    const plugin = circlePlugins.find((p) => p.id === 'cir.melee-bonuses')!
    let s = circleState('ws')
    const atk = (kind: string) => ({ attackerId: BEAST, kind, x: {} }) as never
    const job = { id: 'j', targetId: 'B:e1', kind: 'direct' as const, pow: 14, types: [] }
    expect(plugin.damageFlat!(s, B, atk('melee'), job)).toBe(0) // no warp picked yet
    s = setWarp(s, BEAST, 'strength').state
    expect(plugin.damageFlat!(s, B, atk('melee'), job)).toBe(2)
    expect(plugin.damageFlat!(s, B, atk('power'), job)).toBe(2)
    expect(plugin.damageFlat!(s, B, atk('ranged'), job)).toBe(0)
    s = setWarp(s, BEAST, 'ghostly').state
    expect(plugin.damageFlat!(s, B, atk('melee'), job)).toBe(0)
    expect(plugin.damageFlat!({ ...s }, B, { attackerId: LORD, kind: 'melee', x: {} } as never, job)).toBe(0)
  })

  it('FAC-CIR-007 Regeneration: forces 1 fury and heals d3, once per activation, not after a run, not with Spirit crippled', () => {
    let s = hurt(circleState('rg'), BEAST, 6)
    const before = markedBoxes(s.models[BEAST]!)
    expect(before).toBe(6)
    let o = choose(asOut(s), BEAST)
    s = o.state
    const r = hook(s, 'cirRegeneration', BEAST, { point: 'combat.choose' })
    const after = markedBoxes(r.state.models[BEAST]!)
    expect(before - after).toBeGreaterThanOrEqual(1)
    expect(before - after).toBeLessThanOrEqual(3)
    expect(r.state.models[BEAST]!.fury).toBe(1)
    expect(types(r.events)).toEqual(expect.arrayContaining(['BeastForced', 'FuryChanged', 'DiceRolled', 'Healed']))
    const again = hook(r.state, 'cirRegeneration', BEAST, { point: 'combat.choose' })
    expect(again.state).toBe(r.state)
    const ran = hook({ ...s, activation: { ...s.activation!, ran: true } }, 'cirRegeneration', BEAST)
    expect(markedBoxes(ran.state.models[BEAST]!)).toBe(before)
    const sp = hook({ ...s, models: { ...s.models, [BEAST]: { ...s.models[BEAST]!, crippled: ['s'] } } }, 'cirRegeneration', BEAST)
    expect(markedBoxes(sp.state.models[BEAST]!)).toBe(before)
    const full = hook({ ...choose(asOut(circleState('rg2')), BEAST).state }, 'cirRegeneration', BEAST)
    expect(full.state.models[BEAST]!.fury).toBe(0) // nothing to heal: no force wasted
  })

  it('FAC-CIR-008b spiral data: 28 boxes in six branches, Mind 8, Body 8, Spirit 12, Wraithbane animus', () => {
    const p = B.byId['cir.pureblood'] as unknown as { damage: { branches: string[] }; stats: Record<string, number>; animus: string }
    expect(p.damage.branches.map((x) => x.length)).toEqual([5, 3, 5, 3, 7, 5])
    const all = p.damage.branches.join('')
    expect([...all].filter((c) => c === 'M').length).toBe(8)
    expect([...all].filter((c) => c === 'B').length).toBe(8)
    expect([...all].filter((c) => c === 'S').length).toBe(12)
    expect(p.stats).toMatchObject({ FURY: 4, THR: 10 })
    const lay = layoutFor(B, { profileId: 'cir.pureblood' } as ModelState)![0]!
    expect(lay.spiral).toBe(true)
    expect(lay.columns[0]).toBe('mmmmm')
  })
})

describe('Lord of the Feast and Ravagers', () => {
  const plugin = (id: string) => circlePlugins.find((p) => p.id === id)!
  const kill = (s: GameState, by: string, ids: string[], kind = 'melee') => {
    const atk = { attackerId: by, kind, x: { destroyed: ids } } as never
    return plugin('cir.body-snatcher').onResolved!(s, B, atk)
  }

  it('FAC-CIR-009 Body Snatcher: a melee kill takes a corpse token, capped at 3; ranged kills, friends and constructs give none', () => {
    let s = circleState('bs')
    let r = kill(s, LORD, ['B:e1'])
    expect(r.state.models[LORD]!.tokens?.corpse).toBe(1)
    expect(types(r.events)).toEqual(['TokenGained'])
    r = kill(kill(kill(r.state, LORD, ['B:u2.1']).state, LORD, ['B:u2.2']).state, LORD, ['B:u2.3'])
    expect(r.state.models[LORD]!.tokens?.corpse).toBe(CORPSE_CAP)
    expect(kill(s, LORD, ['B:e1'], 'ranged').state.models[LORD]!.tokens?.corpse).toBeUndefined()
    expect(kill(s, LORD, [RAV[0]!]).state.models[LORD]!.tokens?.corpse).toBeUndefined() // a friend
    expect(kill(s, LORD, ['B:e0']).state.models[LORD]!.tokens?.corpse).toBeUndefined() // Deuce is a warjack
    expect(kill(s, 'B:e1', [RAV[0]!]).state.models['B:e1']!.tokens).toBeUndefined() // Falk lacks the ability
    expect(kill(s, RAV[1]!, ['B:e1']).state.models[RAV[1]!]!.tokens?.corpse).toBe(1) // each Ravager claims for itself
    s = place(s, LORD, { x: 0, z: 0 })
    expect(s.models[LORD]!.tokens).toBeUndefined()
  })

  it('FAC-CIR-010 Blood Rage: spends the tokens and records the extra melee attacks', () => {
    let s = withTokens(circleState('br'), LORD, 2)
    s = choose(asOut(s), LORD).state
    const r = hook(s, 'cirBloodRage', LORD, { point: 'combat.choose' })
    expect(r.state.models[LORD]!.tokens?.corpse).toBe(0)
    expect(((r.state.activation as unknown as { x: unknown }).x as unknown as { extraMelee: Record<string, number> }).extraMelee[LORD]).toBe(2)
    const one = hook(s, 'cirBloodRage', LORD, {}, { count: 1 })
    expect(one.state.models[LORD]!.tokens?.corpse).toBe(1)
    expect((hook(choose(asOut(circleState("br2")), LORD).state, "cirBloodRage", LORD).state.activation as unknown as { x: object }).x).not.toHaveProperty('extraMelee')
  })

  it('FAC-CIR-011 Meat for the Beast spends a token on a direct damage roll (loop seeds for a hit)', () => {
    let seen = false
    for (let i = 0; i < 80 && !seen; i++) {
      let s = withTokens(circleState('mb' + i), LORD, 1)
      s = place(s, LORD, { x: 0, z: -4 })
      s = place(s, 'B:e0', { x: 0, z: -2.5 })
      let o = openCombat(asOut(s), LORD, 'melee')
      o = send(o, { type: 'chooseAttack', modelId: LORD, weaponId: 'cir.w.wurmblade', targetId: 'B:e0', additional: false })
      o = settle(o)
      const hit = o.events.some((e) => e.type === 'AttackResolved' && e.hit)
      if (!hit) continue
      seen = true
      const spent = o.events.find((e) => e.type === 'TokenSpent') as Extract<GameEvent, { type: 'TokenSpent' }> | undefined
      expect(spent?.sourceId).toBe('cir.a.meat-for-the-beast')
      expect(o.state.models[LORD]!.tokens?.corpse).toBe(0)
      const dr = o.events.find((e) => e.type === 'DamageRolled') as Extract<GameEvent, { type: 'DamageRolled' }>
      expect(dr.instance.boosted).toBe(true)
    }
    expect(seen).toBe(true)
  })

  it('FAC-CIR-011b the attack roll is boosted only from a full pile of three; a lone token is saved', () => {
    const run = (n: number) => {
      let s = withTokens(circleState('mb-atk'), LORD, n)
      s = place(s, LORD, { x: 0, z: -4 })
      s = place(s, 'B:e0', { x: 0, z: -2.5 })
      let o = openCombat(asOut(s), LORD, 'melee')
      o = send(o, { type: 'chooseAttack', modelId: LORD, weaponId: 'cir.w.wurmblade', targetId: 'B:e0', additional: false })
      return settle(o).events.filter((e) => e.type === 'RollBoosted' && e.roll === 'attack').length
    }
    expect(run(3)).toBe(1)
    expect(run(1)).toBe(0)
  })

  it('FAC-CIR-012 Death Feast heals d3 per token while damaged and spends only what it needs', () => {
    let s = hurt(withTokens(circleState('df'), LORD, 3), LORD, 8)
    s = { ...s, models: { ...s.models, [LORD]: { ...s.models[LORD]!, damage: { track: 'single', filled: 8, boxes: 8 }, life: 'active' } } }
    const r = hook(s, 'cirDeathFeast', LORD)
    const left = markedBoxes(r.state.models[LORD]!)
    const spent = 3 - (r.state.models[LORD]!.tokens?.corpse ?? 0)
    expect(spent).toBeGreaterThanOrEqual(1)
    expect(left).toBeLessThan(8)
    expect(8 - left).toBeLessThanOrEqual(3 * spent)
    const light = hook({ ...s, models: { ...s.models, [LORD]: { ...s.models[LORD]!, damage: { track: 'single', filled: 1, boxes: 8 } } } }, 'cirDeathFeast', LORD)
    expect(light.state.models[LORD]!.tokens?.corpse).toBe(2) // one d3 clears one box; the rest is kept
    expect(markedBoxes(light.state.models[LORD]!)).toBe(0)
  })

  it('FAC-CIR-013 Death-Powered: +1 melee damage and +1 ARM per token (plugin and ARM helper)', () => {
    const s = withTokens(circleState('dpw'), LORD, 2)
    const job = { id: 'j', targetId: 'B:e1', kind: 'direct' as const, pow: 13, types: [] }
    expect(plugin('cir.melee-bonuses').damageFlat!(s, B, { attackerId: LORD, kind: 'melee', x: {} } as never, job)).toBe(2)
    expect(plugin('cir.melee-bonuses').damageFlat!(s, B, { attackerId: LORD, kind: 'ranged', x: {} } as never, job)).toBe(0)
    expect(deathPoweredArm(s, B, LORD)).toBe(2)
    expect(deathPoweredArm(s, B, RAV[0]!)).toBe(0)
    expect(deathPoweredArm(circleState('dpw0'), B, LORD)).toBe(0)
  })

  it('FAC-CIR-014b Rapid Healing: a Ravager that an enemy attack hurts heals d3 right after (loop seeds)', () => {
    let seen = false
    for (let i = 0; i < 120 && !seen; i++) {
      let s = circleState('rh' + i)
      s = place(s, RAV[0]!, { x: 0, z: -3 })
      s = place(s, 'B:L', { x: 0, z: -9 })
      s = { ...s, activePlayer: 'B', pending: { ...s.pending, kind: 'chooseActivation', player: 'B', id: 'd:900', options: [] }, decisionSeq: 900 }
      let o = openCombat(asOut(s), 'B:L', 'ranged')
      o = send(o, { type: 'chooseAttack', modelId: 'B:L', weaponId: 'cyg.w.spellstorm-pistol', targetId: RAV[0]!, additional: false, attackType: 'witch-mark' })
      o = settle(o)
      const hit = o.events.some((e) => e.type === 'AttackResolved' && e.hit)
      if (!hit) continue
      const dmg = o.events.filter((e) => e.type === 'DamageApplied' && e.targetId === RAV[0]!).reduce((a, e) => a + (e as Extract<GameEvent, { type: 'DamageApplied' }>).points, 0)
      if (dmg === 0) { expect(o.events.some((e) => e.type === 'Healed')).toBe(false); continue }
      seen = true
      const healed = o.events.find((e) => e.type === 'Healed' && e.modelId === RAV[0]!) as Extract<GameEvent, { type: 'Healed' }> | undefined
      expect(healed).toBeDefined()
      expect(healed!.points).toBeGreaterThanOrEqual(1)
      expect(healed!.points).toBeLessThanOrEqual(3)
      expect(markedBoxes(o.state.models[RAV[0]!]!)).toBe(Math.max(0, dmg - healed!.points))
    }
    expect(seen).toBe(true)
  })

  it('FAC-CIR-014c Rapid Healing heals only when THIS attack damaged the model: an already-damaged model hit for 0 does not heal', () => {
    const d = { state: pistolOnRavager('rh0', false) }
    const a = atkOf(d.state)!
    expect(a.x.flags.damagedIds).toBeUndefined()
    // a hit that dealt nothing: no heal, state untouched
    const none = hook(d.state, 'cirRapidHealing', RAV[0]!, { point: 'attack.resolved' })
    expect(none.events).toEqual([])
    expect(markedBoxes(none.state.models[RAV[0]!]!)).toBe(4)
    // the same attack that did damage it: d3 heals
    const hurtIt = setAtk(d.state, { ...a, x: { ...a.x, flags: { ...a.x.flags, damagedIds: [RAV[0]!] } } })
    const healed = hook(hurtIt, 'cirRapidHealing', RAV[0]!, { point: 'attack.resolved' })
    expect(types(healed.events)).toContain('Healed')
    expect(markedBoxes(healed.state.models[RAV[0]!]!)).toBeLessThan(4)
    // damaged this attack, but nothing marked left to heal (e.g. fully healed by it): nothing happens
    const clean = hook(setAtk(circleState('rh1'), { ...a, x: { ...a.x, flags: { ...a.x.flags, damagedIds: [RAV[1]!] } } }), 'cirRapidHealing', RAV[1]!, { point: 'attack.resolved' })
    expect(clean.events).toEqual([])
  })

  it('FAC-CIR-016 Brutal Charge: +2 damage only on a charge attack', () => {
    const s = circleState('bc')
    const ab = B.byId['cir.a.brutal-charge'] as unknown as { when: never; effect: { op: string; value: number }[]; trigger: string }
    expect(ab.trigger).toBe('damage.beforeRoll')
    expect(ab.effect[0]).toMatchObject({ op: 'modRoll', value: 2 })
    expect(evalCond(s, B, ab.when, { selfId: RAV[0]!, atk: { chargeAttack: true } as never })).toBe(true)
    expect(evalCond(s, B, ab.when, { selfId: RAV[0]!, atk: { chargeAttack: false } as never })).toBe(false)
    expect((B.byId['cir.w.tharn-axe'] as unknown as { abilities: string[] }).abilities).toEqual(['cir.a.brutal-charge'])
  })

  it('FAC-CIR-017 Blood Reaper and Grievous Wounds sit on the Wurmblade; Blood Reaper is a CORE marker', () => {
    const w = B.byId['cir.w.wurmblade'] as unknown as { abilities: string[]; pow: number }
    expect(w.abilities).toEqual(['cir.a.blood-reaper', 'cir.a.grievous-wounds'])
    expect(w.pow).toBe(13)
    const r = hook(circleState('brp'), 'cirBloodReaper', LORD)
    expect(r.events).toEqual([])
  })

  it('FAC-CIR-018 Grievous Wounds: a direct hit stops healing and denies Tough for a round (loop seeds for a hit)', () => {
    let seen = false
    for (let i = 0; i < 80 && !seen; i++) {
      let s = circleState('gw' + i)
      s = place(s, LORD, { x: 0, z: -4 })
      s = place(s, 'B:e1', { x: 0, z: -3 })
      let o = openCombat(asOut(s), LORD, 'melee')
      o = send(o, { type: 'chooseAttack', modelId: LORD, weaponId: 'cir.w.wurmblade', targetId: 'B:e1', additional: false })
      o = settle(o)
      if (!o.events.some((e) => e.type === 'AttackResolved' && e.hit)) continue
      seen = true
      const e = o.state.effects.find((x) => x.sourceId === 'cir.a.grievous-wounds')
      expect(e?.targetIds).toEqual(['B:e1'])
      expect(e?.forbid).toEqual(['heal', 'tough'])
      expect(noHealing(o.state, 'B:e1')).toBe(true)
      expect(noHealing(o.state, LORD)).toBe(false)
    }
    expect(seen).toBe(true)
  })

  it('FAC-CIR-018b a model under Grievous Wounds does not heal from Rapid Healing or Death Feast', () => {
    let s = circleState('gw-heal')
    s = { ...s, models: { ...s.models, [RAV[0]!]: { ...s.models[RAV[0]!]!, damage: { track: 'single', filled: 4, boxes: 8 } } } }
    const withGw = hook(s, 'cirGrievousWounds', LORD, { targetId: RAV[0]! }).state
    expect(noHealing(withGw, RAV[0]!)).toBe(true)
    const atkS = pistolOnRavager('gw-heal2', true)
    const gwAtk = hook(atkS, 'cirGrievousWounds', LORD, { targetId: RAV[0]! }).state
    expect(markedBoxes(hook(gwAtk, 'cirRapidHealing', RAV[0]!).state.models[RAV[0]!]!)).toBe(4)
    expect(markedBoxes(hook(atkS, 'cirRapidHealing', RAV[0]!).state.models[RAV[0]!]!)).toBeLessThan(4)
  })

  it('FAC-CIR-019 Shifter: a Raven hit places the Lord base to base with the model hit (loop seeds)', () => {
    let seen = false
    for (let i = 0; i < 80 && !seen; i++) {
      let s = circleState('sh' + i)
      s = place(s, LORD, { x: 0, z: -12 })
      s = place(s, 'B:e1', { x: 0, z: -6 })
      let o = openCombat(asOut(s), LORD, 'ranged')
      o = send(o, { type: 'chooseAttack', modelId: LORD, weaponId: 'cir.w.raven', targetId: 'B:e1', additional: false })
      o = settle(o)
      if (!o.events.some((e) => e.type === 'AttackResolved' && e.hit)) {
        expect(o.state.models[LORD]!.pos).toEqual({ x: 0, z: -12 })
        continue
      }
      seen = true
      const lord = o.state.models[LORD]!, t = o.state.models['B:e1']!
      expect(Math.hypot(lord.pos.x - t.pos.x, lord.pos.z - t.pos.z) - 2 * (30 / 25.4 / 2)).toBeLessThan(0.01)
      expect(o.events.some((e) => e.type === 'ModelMoved' && e.modelId === LORD)).toBe(true)
    }
    expect(seen).toBe(true)
  })

  it('FAC-CIR-019b Raven has no POW: a hit rolls no damage, so no Affliction floor and no Meat for the Beast token is spent (loop seeds)', () => {
    let seen = false
    for (let i = 0; i < 80 && !seen; i++) {
      let s = circleState('rv' + i)
      s = withTokens(place(s, LORD, { x: 0, z: -12 }), LORD, 2)
      s = place(s, 'B:e1', { x: 0, z: -6 })
      s = applyEffect(s, { sourceId: 'cir.s.affliction', name: 'Affliction', owner: 'A', casterId: TANITH, targetIds: ['B:e1'], mods: [], duration: 'upkeep', upkeep: { casterId: TANITH } }).state
      let o = openCombat(asOut(s), LORD, 'ranged')
      o = send(o, { type: 'chooseAttack', modelId: LORD, weaponId: 'cir.w.raven', targetId: 'B:e1', additional: false })
      // the Raven attack alone: Shifter then puts the Lord base to base and its Wurmblade attack follows (that one rolls damage), so cut the log there
      const second = o.events.map((e, k) => (e.type === 'AttackDeclared' ? k : -1)).filter((k) => k >= 0)[1]
      const first = second === undefined ? o.events : o.events.slice(0, second)
      if (!first.some((e) => e.type === 'AttackResolved' && e.hit)) continue
      seen = true
      expect(first.filter((e) => e.type === 'DamageRolled' || e.type === 'DamageApplied')).toEqual([])
      expect(first.some((e) => e.type === 'TokenSpent')).toBe(false)
    }
    expect(seen).toBe(true)
  })

  it('FAC-CIR-026 Treewalker: +2 DEF against melee only while completely inside a forest', () => {
    let s = circleState('tw')
    const forest = { id: 'f1', pieceId: 'terrain.test-forest', rulesType: 'forest' as const, pos: { x: -6, z: -9 }, rot: 0, footprint: { circle: { r: 4 } }, height: 3, props: {} }
    s = { ...s, terrain: [...s.terrain, forest] }
    s = place(s, RAV[0]!, { x: -6, z: -9 })
    expect(treewalkerDefBonus(s, B, RAV[0]!, 'melee')).toBe(2)
    expect(treewalkerDefBonus(s, B, RAV[0]!, 'ranged')).toBe(0)
    expect(treewalkerDefBonus(place(s, RAV[0]!, { x: -2.1, z: -9 }), B, RAV[0]!, 'melee')).toBe(0) // straddling the edge
    expect(treewalkerDefBonus(s, B, LORD, 'melee')).toBe(0)
    const ab = B.byId['cir.a.treewalker'] as unknown as { effect: { op?: string; ignore?: string }[] }
    expect(ab.effect[0]).toMatchObject({ op: 'ignore', ignore: 'forest' })
  })

  it('FAC-CIR-027 the Ravagers carry Tough; Tanith has no Tough and the Lord has Stealth and Advance Deployment', () => {
    const s = circleState('tough')
    expect(abilitiesOf(s, B, RAV[0]!)).toContain('core.a.tough')
    expect(abilitiesOf(s, B, TANITH)).not.toContain('core.a.tough')
    expect(abilitiesOf(s, B, LORD)).toEqual(expect.arrayContaining(['core.a.stealth', 'core.a.advance-deployment']))
  })
})

describe('Circle behaviour audit (M10 card data pass)', () => {
  it('FAC-CIR-028 Warp: Ghostly makes the Pureblood a ghostly mover only while that warp is picked; Veil of Mists gives it to friends inside the cloud, not outside', () => {
    let s = circleState('ghost')
    expect(moverInfo(s, B, BEAST).ghostly).toBe(false)
    s = setWarp(s, BEAST, 'strength').state
    expect(moverInfo(s, B, BEAST).ghostly).toBe(false)
    expect(moverInfo(setWarp(s, BEAST, 'ghostly').state, B, BEAST).ghostly).toBe(true)
    const v = circleState('veilmove')
    const r = castSpell(choose0Cast(v), B, { type: 'castSpell', decisionId: 'x', player: 'A', casterId: TANITH, spellId: 'cir.s.veil-of-mists' })
    if ('rejection' in r) throw new Error(JSON.stringify(r.rejection))
    const c = r.state.clouds[0]!
    const inside = place(r.state, RAV[0]!, { ...c.pos })
    expect(moverInfo(inside, B, RAV[0]!).ghostly).toBe(true)
    expect(moverInfo(place(r.state, RAV[1]!, { x: c.pos.x + 12, z: c.pos.z }), B, RAV[1]!).ghostly).toBe(false)
    expect(moverInfo(place(r.state, 'B:e0', { ...c.pos }), B, 'B:e0').ghostly).toBe(false) // the enemy gets nothing from it
  })

  it('FAC-CIR-029 Warp: Spell Ward stops any spell targeting the warded Pureblood (Tanith cannot Admonition it either); Strength and Ghostly do not', () => {
    let s = circleState('ward', { focus: 6 })
    s = place(place(s, TANITH, { x: 0, z: -8 }), BEAST, { x: 0, z: -4 })
    const tryCast = (st: GameState) => {
      let o = choose(asOut(st), TANITH)
      o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: TANITH })
      return castSpell(o.state, B, { type: 'castSpell', decisionId: o.pending.id, player: 'A', casterId: TANITH, spellId: 'cir.s.admonition', targetId: BEAST })
    }
    expect('rejection' in tryCast(s)).toBe(false)
    expect('rejection' in tryCast(setWarp(s, BEAST, 'strength').state)).toBe(false)
    expect('rejection' in tryCast(setWarp(s, BEAST, 'ghostly').state)).toBe(false)
    expect('rejection' in tryCast(setWarp(s, BEAST, 'spellWard').state)).toBe(true)
  })

  it('FAC-CIR-030 Shadow Bind (Staff of Fate) is a one-round -3 DEF and no-advance effect', () => {
    let s = circleState('bind')
    s = addCondition(s, 'B:e1', 'shadowBind', 'cir.a.shadow-bind').state
    expect(statOf(s, B, 'B:e1', 'DEF')).toBe(statOf(circleState('bind'), B, 'B:e1', 'DEF') - 3)
    expect(moverInfo(s, B, 'B:e1').noAdvance).toBe(true)
  })
})

function choose0Cast(s: GameState): GameState { let o = choose(asOut(s), TANITH); o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: TANITH }); return o.state }
