// WP-D-cry: the Cryx 50-point Skirmish list (Necrofactorium Command plus Night Terrors, Raptor, Necrosurgeon Initiates) and the rules
// those three cards bring. Data tests first, then engine tests on Copperline Crossing in a Cryx mirror (docs/spec/factions/cryx.md, Skirmish).
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data/index'
import { validateAll } from '../../tools/validate-data'
import { codeHooks, type AtkCtx } from '../../src/engine/code-hooks'
import { cryxHooks, cryxPlugins, GRIM_RETURNS } from '../../src/engine/factions/cryx'
import type { GameEvent } from '../../src/engine/events'
import type { GameSetup } from '../../src/engine/index'
import type { GameState, ModelId } from '../../src/engine/types'
import { asOut, choose, place, send, settle } from '../engine/action-helpers'
import { bundle as ebundle, newGame, runControlTo, runSetup, withModel } from '../engine/turn-helpers'

type Any = Record<string, any>
const bundle = loadBundle()
const rec = (id: string): Any => bundle.byId[id] as unknown as Any
const LIST = 'cry.l.skirmish'
const NEW_MODELS = ['cry.night-terrors', 'cry.night-terror', 'cry.initiates', 'cry.initiate', 'cry.raptor-arc']

const entryCost = (e: Any): number => (e.size ? rec(e.profile).composition.costBySize[e.size] : rec(e.profile).cost)

describe('Cryx Skirmish data', () => {
  it('SKM-001 the list is level skirmish, costs 50 (inside 46..50), has a non-lesser Cohort model and respects FA and characters', () => {
    const l = rec(LIST)
    expect(l).toMatchObject({ faction: 'cry', level: 'skirmish', points: 50, leader: 'cry.nekane' })
    const total = l.entries.reduce((n: number, e: Any) => n + entryCost(e), 0)
    expect(total).toBeGreaterThanOrEqual(46)
    expect(total).toBeLessThanOrEqual(50)
    expect(total).toBe(50) // 0 + 16 + 4 + 10 + 10 + 6 + 4
    const engines = l.entries.filter((e: Any) => rec(e.profile).type === 'warEngine' && !rec(e.profile).lesser)
    expect(engines.map((e: Any) => e.profile).sort()).toEqual(['cry.hades', 'cry.raptor-arc'])
    for (const e of l.entries) {
      const p = rec(e.profile)
      expect(l.entries.filter((x: Any) => x.profile === e.profile).length, e.profile).toBeLessThanOrEqual(p.fa === 'C' ? 1 : (p.fa ?? 99))
      expect(['battleEngine', 'structure']).not.toContain(p.type)
      expect(String(p.engineClass ?? '')).not.toMatch(/colossal|superHeavy/)
    }
    // the Recon starter is still there and unchanged
    expect(rec('cry.l.necro-recon').points).toBe(30)
  })

  it('FAC-CRY-040 validates against the schemas, refs and hook registry (Cryx records only)', () => {
    const mine = Object.keys(cryxHooks.effects)
    const errs = validateAll().errors.filter((e: string) => /cry\./.test(e) || mine.some((h) => e.includes(`'${h}'`)))
    expect(errs).toEqual([])
    for (const id of NEW_MODELS) expect(bundle.byId[id], id).toBeDefined()
    // every code the new abilities name is registered
    for (const id of ['cry.a.cavalry', 'cry.a.grim-returns', 'cry.a.empower', 'cry.a.necrosurgery', 'cry.a.finisher', 'cry.a.arc-node']) {
      for (const n of (rec(id).effect ?? []) as Any[]) if (n.code) expect(codeHooks().effects[n.code], `${id} ${n.code}`).toBeTypeOf('function')
    }
  })

  it('FAC-CRY-041 Night Terrors: unit of 3 for 10, large 50 mm bases, SPD 7 MAT 6 DEF 14 ARM 16, 5 boxes, two POW 12 magical blades, Cavalry and Incorporeal', () => {
    const u = rec('cry.night-terrors')
    expect(u).toMatchObject({ type: 'unit', cost: 10, fa: 2 })
    expect(u.composition).toMatchObject({ grunts: { profile: 'cry.night-terror', min: 3, max: 3 }, costBySize: { 3: 10 } })
    const t = rec('cry.night-terror')
    expect(t).toMatchObject({ type: 'trooper', base: 50, stats: { SPD: 7, MAT: 6, DEF: 14, ARM: 16 }, damage: { track: 'single', boxes: 5 } })
    expect(t.weapons).toEqual([{ weapon: 'cry.w.scything-blade', count: 2 }])
    expect(rec('cry.w.scything-blade')).toMatchObject({ type: 'melee', rng: 1, pow: 12, qualities: ['core.q.magical'] })
    expect(t.keywords).toContain('undead')
    for (const a of ['cry.a.incorporeal', 'core.a.unstoppable', 'cry.a.cavalry', 'cry.a.apparition', 'cry.a.finisher', 'core.a.reposition']) expect(t.abilities, a).toContain(a)
  })

  it('FAC-CRY-042 Necrosurgeon Initiates: unit of 3 for 4, small 30 mm bases, SPD 6 MAT 4 DEF 14 ARM 12, 1 box, Implement of Death POW 11', () => {
    const u = rec('cry.initiates')
    expect(u).toMatchObject({ type: 'unit', cost: 4, fa: 4 })
    expect(u.composition).toMatchObject({ grunts: { profile: 'cry.initiate', min: 3, max: 3 }, costBySize: { 3: 4 } })
    const t = rec('cry.initiate')
    expect(t).toMatchObject({ type: 'trooper', base: 30, stats: { SPD: 6, MAT: 4, DEF: 14, ARM: 12 }, damage: { track: 'single', boxes: 1 } })
    expect(rec('cry.w.implement-of-death')).toMatchObject({ type: 'melee', rng: 1, pow: 11 })
    for (const a of ['cry.a.anatomical-precision', 'cry.a.grim-returns', 'cry.a.magic-ability', 'cry.a.empower', 'cry.a.necrosurgery']) expect(t.abilities, a).toContain(a)
    expect(t.keywords).toContain('undead')
    // star Actions: ranges 5, 6 and 1; Empower is once per unit activation
    expect(rec('cry.a.grim-returns').scope.range).toBe(5)
    expect(rec('cry.a.empower')).toMatchObject({ scope: { range: 6 }, limit: 'oncePerActivation' })
    expect(rec('cry.a.necrosurgery').scope.range).toBe(1)
  })

  it('FAC-CRY-043 Raptor (Doomspitter, Arc Node): light warjack for 6, SPD 7 MAT 5 RAT 5 DEF 14 ARM 14, 20-box grid with C, H and M but no A, Doomspitter on the head', () => {
    const r = rec('cry.raptor-arc')
    expect(r).toMatchObject({ type: 'warEngine', engineClass: 'light', base: 40, cost: 6, fa: 6, arcNode: true, stats: { SPD: 7, MAT: 5, RAT: 5, DEF: 14, ARM: 14 } })
    const cols: string[] = r.damage.columns
    expect(cols.map((c) => c.length)).toEqual([3, 3, 4, 4, 3, 3])
    expect(cols.join('').length).toBe(20)
    const count = (ch: string) => cols.join('').split('').filter((c) => c === ch).length
    expect([count('C'), count('H'), count('M'), count('A'), count('L'), count('R')]).toEqual([4, 4, 4, 0, 0, 0])
    expect(r.weapons).toEqual([{ weapon: 'cry.w.doomspitter', location: 'H' }])
    expect(rec('cry.w.doomspitter')).toMatchObject({ type: 'ranged', rng: 8, rof: 1, aoe: 2, pow: 14, blastPow: 8, location: 'H' })
    for (const a of ['core.a.construct', 'core.a.pathfinder', 'cry.a.dodge', 'cry.a.eyeless-sight', 'cry.a.arc-node']) expect(r.abilities, a).toContain(a)
    expect(rec('cry.a.eyeless-sight').effect.map((n: Any) => n.ignore).sort()).toEqual(['clouds', 'concealment', 'stealth'])
  })

  it('FAC-CRY-044 the new Cryx prose and numbers keep MK4 only (no STR, facing, free strikes, templates)', () => {
    const ids = [...NEW_MODELS, 'cry.w.scything-blade', 'cry.w.doomspitter', 'cry.w.implement-of-death', LIST,
      'cry.a.cavalry', 'cry.a.finisher', 'cry.a.anatomical-precision', 'cry.a.grim-returns', 'cry.a.empower', 'cry.a.necrosurgery', 'cry.a.eyeless-sight', 'cry.a.arc-node']
    for (const id of ids) expect(JSON.stringify(rec(id)), id).not.toMatch(/\bSTR\b|facing|free strike|template/i)
  })
})

// ---------- engine ----------
const SETUP: GameSetup = { scenario: 'scn-copperline-crossing', lists: { A: 'cry.l.skirmish', B: 'cry.l.skirmish' } }
const start = (seed: string): GameState => runControlTo(runSetup(newGame(SETUP, seed))).state
const sides = (s: GameState) => ({ P: s.activePlayer, Q: s.activePlayer === 'A' ? 'B' : 'A' })
/** Park every model out of the way except `keep`. */
function clearAround(s: GameState, keep: string[]): GameState {
  let i = 0
  for (const m of Object.values(s.models)) {
    if (keep.includes(m.id)) continue
    s = place(s, m.id, { x: -20 + (i % 10) * 4, z: -22 + Math.floor(i / 10) * 3 })
    i++
  }
  return s
}
const hook = (name: string, state: GameState, selfId: ModelId, extra: Record<string, unknown> = {}, params: Record<string, unknown> = {}) =>
  codeHooks().effects[name]!({ state, point: 'passive', selfId, activePlayer: state.activePlayer, params, bundle: ebundle, ...extra } as never, params)
type Out = ReturnType<typeof asOut>
const optionFor = (o: Out, abilityId: string, targetId?: string) =>
  (o.pending.options ?? []).find((x) => {
    const a = x.action as unknown as { abilityId?: string; targetId?: string }
    return a.abilityId === abilityId && (targetId === undefined || a.targetId === targetId)
  })
const filledOf = (s: GameState, id: string): number => {
  const d = s.models[id]!.damage
  return d.track === 'single' ? d.filled : d.grids.reduce((n, g) => n + g.cols.flat().filter(Boolean).length, 0)
}
const setFilled = (s: GameState, id: string, n: number): GameState => {
  const d = s.models[id]!.damage
  if (d.track !== 'single') throw new Error('single track only')
  return withModel(s, id, { damage: { ...d, filled: n } })
}

describe('Cryx Skirmish rules', () => {
  it('SKM-001b the skirmish list builds on Copperline Crossing: 13 models a side with the new troopers on their bases', () => {
    const s = start('cry-sk-load')
    const { P } = sides(s)
    const mine = Object.values(s.models).filter((m) => m.owner === P)
    expect(mine.length).toBe(13)
    expect(mine.filter((m) => m.profileId === 'cry.night-terror').map((m) => m.base)).toEqual([50, 50, 50])
    expect(mine.filter((m) => m.profileId === 'cry.initiate').map((m) => m.base)).toEqual([30, 30, 30])
    const raptor = mine.find((m) => m.profileId === 'cry.raptor-arc')!
    expect(raptor.damage.track).toBe('grid')
    expect(s.scenario.table).toMatchObject({ w: 48, d: 48 })
  })

  it('FAC-CRY-045 Cavalry: a Night Terror charge attack rolls its attack boosted (3 dice); a plain attack from the same model rolls 2', () => {
    let s = start('cry-cav')
    const { P, Q } = sides(s)
    const NT = `${P}:u3.1`, FOE = `${Q}:L`
    s = clearAround(s, [NT, FOE])
    s = place(s, NT, { x: 0, z: 0 }); s = place(s, FOE, { x: 0, z: 8 })
    let o = choose(asOut(s), `${P}:u3`)
    o = send(o, { type: 'chooseMovement', option: 'charge', modelId: NT })
    o = send(o, { type: 'chargeTarget', targetId: FOE })
    expect(o.pending.kind).toBe('moveModel')
    o = send(o, o.pending.options![0]!.action as unknown as Record<string, unknown>)
    while (o.pending.kind === 'placeTroopers') o = send(o, o.pending.options![0]!.action as unknown as Record<string, unknown>) // the rest of the unit comes up
    o = send(o, { type: 'chooseCombatAction', modelId: NT, choice: 'melee' })
    o = send(o, { type: 'chooseAttack', modelId: NT, weaponId: 'cry.w.scything-blade', targetId: FOE, additional: false })
    o = settle(o)
    const rolls = o.events.filter((e): e is Extract<GameEvent, { type: 'DiceRolled' }> => e.type === 'DiceRolled' && e.purpose === 'attack')
    expect(rolls.length).toBeGreaterThan(0)
    expect(rolls[0]!.dice.length).toBe(3)
    expect(o.events.some((e) => e.type === 'RollBoosted' && e.roll === 'attack')).toBe(true)
    // no charge: two dice
    let n = clearAround(start('cry-cav'), [NT, FOE])
    n = place(n, NT, { x: 0, z: 0 }); n = place(n, FOE, { x: 0, z: 1.2 })
    let p = choose(asOut(n), `${P}:u3`)
    p = send(p, { type: 'chooseMovement', option: 'forfeit', modelId: NT })
    p = send(p, { type: 'chooseCombatAction', modelId: NT, choice: 'melee' })
    p = send(p, { type: 'chooseAttack', modelId: NT, weaponId: 'cry.w.scything-blade', targetId: FOE, additional: false })
    p = settle(p)
    const plain = p.events.filter((e): e is Extract<GameEvent, { type: 'DiceRolled' }> => e.type === 'DiceRolled' && e.purpose === 'attack')
    expect(plain[0]!.dice.length).toBe(2)
  })

  it('FAC-CRY-046 Finisher: a Night Terror rolls one more damage die against a model that already has damage marked', () => {
    const run = (marked: number): number => {
      for (let i = 0; i < 60; i++) {
        let s = start(`cry-fin-${marked}-${i}`)
        const { P, Q } = sides(s)
        const NT = `${P}:u3.1`, FOE = `${Q}:L`
        s = clearAround(s, [NT, FOE])
        s = place(s, NT, { x: 0, z: 0 }); s = place(s, FOE, { x: 0, z: 1.2 })
        s = setFilled(s, FOE, marked)
        let o = choose(asOut(s), `${P}:u3`)
        o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: NT })
        o = send(o, { type: 'chooseCombatAction', modelId: NT, choice: 'melee' })
        o = send(o, { type: 'chooseAttack', modelId: NT, weaponId: 'cry.w.scything-blade', targetId: FOE, additional: false })
        o = settle(o)
        const dmg = o.events.find((e): e is Extract<GameEvent, { type: 'DamageRolled' }> => e.type === 'DamageRolled')
        if (dmg) return dmg.instance.dice
      }
      throw new Error('no damage roll in 60 seeds')
    }
    expect(run(0)).toBe(2)
    expect(run(3)).toBe(3)
  })

  it('FAC-CRY-047 Anatomical Precision: a melee roll that fails to beat a living model\'s ARM still deals 1; not on ranged, a construct, a bigger roll or another attacker', () => {
    const s = start('cry-anat')
    const { P, Q } = sides(s)
    const plugin = cryxPlugins.find((p) => p.adjustPoints)!
    const atk = (attackerId: string, kind = 'melee') => ({ attackerId, kind, x: { flags: {}, results: {}, destroyed: [] } }) as unknown as AtkCtx
    const job = (targetId: string, kind: 'direct' | 'blast' = 'direct') => ({ id: 'j', targetId, kind, pow: 11, types: [] }) as never
    const INIT = `${P}:u5.1`
    expect(plugin.adjustPoints!(s, ebundle, atk(INIT), job(`${Q}:L`), 0)?.points).toBe(1) // Nekane is living
    expect(plugin.adjustPoints!(s, ebundle, atk(INIT), job(`${Q}:L`), 3)).toBeNull() // the roll beat ARM
    expect(plugin.adjustPoints!(s, ebundle, atk(INIT, 'ranged'), job(`${Q}:L`), 0)).toBeNull()
    expect(plugin.adjustPoints!(s, ebundle, atk(INIT), job(`${Q}:e0`), 0)).toBeNull() // Hades is a construct
    expect(plugin.adjustPoints!(s, ebundle, atk(INIT), job(`${Q}:u2.1`), 0)).toBeNull() // a Fury is undead
    expect(plugin.adjustPoints!(s, ebundle, atk(`${P}:u3.1`), job(`${Q}:L`), 0)).toBeNull() // a Night Terror has no Anatomical Precision
    expect(plugin.adjustPoints!(s, ebundle, atk(INIT), job(`${Q}:L`, 'blast'), 0)).toBeNull()
    // the Tough denial rides on a melee hit
    expect(rec('cry.a.anatomical-precision')).toMatchObject({ trigger: 'attack.hit', effect: [{ op: 'forbid', what: 'tough' }], scope: { who: 'target' } })
  })

  it('FAC-CRY-048 Empower: the Initiates offer it on a Cryx warjack within 6" (Hades, the Raptor), not out of range, and it grants 1 focus once per unit activation', () => {
    let s = start('cry-emp')
    const { P } = sides(s)
    const I1 = `${P}:u5.1`, I2 = `${P}:u5.2`, HADES = `${P}:e0`, RAPTOR = `${P}:e4`
    s = clearAround(s, [I1, I2, HADES, RAPTOR])
    s = place(s, I1, { x: 0, z: 0 }); s = place(s, I2, { x: 1.5, z: 0 }); s = place(s, HADES, { x: 4, z: 0 }); s = place(s, RAPTOR, { x: 11, z: 0 })
    s = withModel(s, HADES, { focus: 0 })
    let o = choose(asOut(s), `${P}:u5`)
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: I1 })
    expect(optionFor(o, 'cry.a.empower', HADES)).toBeDefined()
    expect(optionFor(o, 'cry.a.empower', RAPTOR)).toBeUndefined() // 11" away
    o = send(o, optionFor(o, 'cry.a.empower', HADES)!.action as unknown as Record<string, unknown>)
    expect(o.state.models[HADES]!.focus).toBe(1)
    // the next Initiate may not Empower again this unit activation
    if (o.pending.kind === 'chooseMovement') o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: I2 })
    expect(o.pending.kind).toBe('chooseCombatAction')
    expect((o.pending.options ?? []).some((x) => (x.action as unknown as { abilityId?: string }).abilityId === 'cry.a.empower')).toBe(false)
  })

  it('FAC-CRY-049 Empower ends Disruption and a warjack still caps at 3 focus', () => {
    let s = start('cry-emp2')
    const { P } = sides(s)
    const I1 = `${P}:u5.1`, HADES = `${P}:e0`
    s = clearAround(s, [I1, HADES])
    s = place(s, I1, { x: 0, z: 0 }); s = place(s, HADES, { x: 3, z: 0 })
    s = withModel(s, HADES, { focus: 3, conditions: ['disrupted'] })
    const r = hook('cryEmpower', s, I1, { targetId: HADES })
    expect(r.state.models[HADES]!.conditions).not.toContain('disrupted')
    expect(r.state.models[HADES]!.focus).toBe(3)
    expect(hook('cryEmpower', place(s, HADES, { x: 9, z: 0 }), I1, { targetId: HADES }).events).toEqual([]) // out of range
  })

  it('FAC-CRY-050 Necrosurgery: removes d3+1 from a damaged undead Cryx model within 1", not from the living Nekane or a construct', () => {
    let s = start('cry-necro')
    const { P } = sides(s)
    const I1 = `${P}:u5.1`, FURY = `${P}:u2.1`, NEKANE = `${P}:L`, HADES = `${P}:e0`
    s = clearAround(s, [I1, FURY, NEKANE, HADES])
    s = place(s, I1, { x: 0, z: 0 }); s = place(s, FURY, { x: 1.9, z: 0 }); s = place(s, NEKANE, { x: -1.6, z: 0 }); s = place(s, HADES, { x: 0, z: 2.8 })
    s = setFilled(s, FURY, 7)
    s = setFilled(s, NEKANE, 7)
    let o = choose(asOut(s), `${P}:u5`)
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: I1 })
    expect(optionFor(o, 'cry.a.necrosurgery', FURY)).toBeDefined()
    expect(optionFor(o, 'cry.a.necrosurgery', NEKANE)).toBeUndefined() // living
    expect(optionFor(o, 'cry.a.necrosurgery', HADES)).toBeUndefined() // a construct
    o = send(o, optionFor(o, 'cry.a.necrosurgery', FURY)!.action as unknown as Record<string, unknown>)
    const healed = 7 - filledOf(o.state, FURY)
    expect(healed).toBeGreaterThanOrEqual(2)
    expect(healed).toBeLessThanOrEqual(4)
    expect(filledOf(o.state, NEKANE)).toBe(7)
    // Repair still heals only constructs
    const bad = hook('repair', s, `${P}:e1`, { targetId: FURY }, { dice: 'd3', flat: 3 })
    expect(bad.events).toEqual([])
  })

  it('FAC-CRY-051 Grim Returns: a destroyed Night Terror returns within 2" of the chosen trooper with one box unmarked (4 of 5 marked), Incorporeal, and may not move or fight this turn', () => {
    let s = start('cry-grim')
    const { P } = sides(s)
    const I1 = `${P}:u5.1`, T1 = `${P}:u3.1`, T3 = `${P}:u3.3`
    s = clearAround(s, [I1, T1, T3, `${P}:u3.2`])
    s = place(s, I1, { x: 0, z: 0 }); s = place(s, T1, { x: 3, z: 0 }); s = place(s, `${P}:u3.2`, { x: 3, z: 4 })
    // T3 died earlier
    const unit = s.units[`${P}:u3`]!
    s = { ...s, units: { ...s.units, [unit.id]: { ...unit, troopers: unit.troopers.filter((t) => t !== T3) } } }
    s = withModel(s, T3, { life: 'destroyed', pos: { x: 20, z: 20 } })
    let o = choose(asOut(s), `${P}:u5`)
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: I1 })
    const opt = optionFor(o, 'cry.a.grim-returns', T1)
    expect(opt).toBeDefined()
    o = send(o, opt!.action as unknown as Record<string, unknown>)
    const back = o.state.models[T3]!
    expect(back.life).toBe('active')
    expect(back.damage).toMatchObject({ track: 'single', boxes: 5, filled: 4 })
    expect(o.state.units[unit.id]!.troopers).toContain(T3)
    const t1 = o.state.models[T1]!
    const gap = Math.hypot(back.pos.x - t1.pos.x, back.pos.z - t1.pos.z) - (back.base + t1.base) / 25.4 / 2
    expect(gap).toBeLessThanOrEqual(2 + 1e-6)
    expect(gap).toBeGreaterThanOrEqual(-1e-6)
    const forbid = o.state.effects.find((e) => e.sourceId === GRIM_RETURNS && e.targetIds.includes(T3))!
    expect(forbid.forbid).toEqual(expect.arrayContaining(['advance', 'combatAction']))
    expect(o.events.some((e) => e.type === 'LifeStateChanged' && e.modelId === T3 && e.to === 'active')).toBe(true)
    // no destroyed Grunt left: nothing to return
    expect(hook('cryGrimReturns', o.state, I1, { targetId: T1 }).events).toEqual([])
    // characters (the Furies) are never Grunts: a dead Fury stays dead, and a Fury is not offered as the chosen trooper
    let c = start('cry-grim')
    const FURY = `${P}:u2.1`
    c = clearAround(c, [I1, FURY, `${P}:u2.2`])
    c = place(c, I1, { x: 0, z: 0 }); c = place(c, `${P}:u2.2`, { x: 2, z: 0 })
    const fu = c.units[`${P}:u2`]!
    c = { ...c, units: { ...c.units, [fu.id]: { ...fu, troopers: fu.troopers.filter((x) => x !== FURY) } } }
    c = withModel(c, FURY, { life: 'destroyed' })
    expect(hook('cryGrimReturns', c, I1, { targetId: `${P}:u2.2` }).events).toEqual([])
    let co = choose(asOut(c), `${P}:u5`)
    co = send(co, { type: 'chooseMovement', option: 'forfeit', modelId: I1 })
    expect(optionFor(co, 'cry.a.grim-returns', `${P}:u2.2`)).toBeUndefined()
  })

  it('FAC-CRY-052 Grim Returns on the Initiates themselves brings a full-health Initiate (1 box, 1 unmarked)', () => {
    let s = start('cry-grim2')
    const { P } = sides(s)
    const I1 = `${P}:u5.1`, I3 = `${P}:u5.3`
    s = clearAround(s, [I1, `${P}:u5.2`])
    s = place(s, I1, { x: 0, z: 0 }); s = place(s, `${P}:u5.2`, { x: 1.5, z: 0 })
    const unit = s.units[`${P}:u5`]!
    s = { ...s, units: { ...s.units, [unit.id]: { ...unit, troopers: unit.troopers.filter((t) => t !== I3) } } }
    s = withModel(s, I3, { life: 'destroyed' })
    const r = hook('cryGrimReturns', s, I1, { targetId: `${P}:u5.2` })
    expect(r.state.models[I3]!.life).toBe('active')
    expect(r.state.models[I3]!.damage).toMatchObject({ filled: 0, boxes: 1 })
  })
})
