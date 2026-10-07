// Trollbloods Skirmish list (docs/spec/90-skirmish.md B.3, WP-D-trl): data values, the 50-point list, and the new rules in play.
import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../src/engine/events'
import { abilitiesOf, codeHooks, statOf } from '../../src/engine/code-hooks'
import { applyEffect } from '../../src/engine/effects'
import { harmoniousDiscount, serenityStep, trollbloodsPlugins, useHarmoniousExaltation } from '../../src/engine/factions/trollbloods'
import type { GameState } from '../../src/engine/types'
import { loadBundle, modelWeapons } from '../../src/data/index'
import { validateAll } from '../../tools/validate-data'
import { asOut, openCombat, place, send, settle, withModel } from '../engine/action-helpers'
import { bundle as engineBundle, newGame, runControlTo, runSetup } from '../engine/turn-helpers'

type Any = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>
const evs = <T extends GameEvent['type']>(es: GameEvent[], t: T): Ev<T>[] => es.filter((e): e is Ev<T> => e.type === t)
const bundle = loadBundle()
const rec = (id: string): Any => bundle.byId[id] as unknown as Any
const hooks = codeHooks()
const hookCtx = (state: GameState, selfId: string, extra: Record<string, unknown> = {}) =>
  ({ state, point: 'passive', selfId, activePlayer: state.activePlayer, bundle: engineBundle, ...extra }) as never

/**
 * The Trollbloods Skirmish list against itself on Copperline Crossing, at A's first activation choice.
 * Ids: A:L Gunnbjorn, A:e0 Bomber, A:e1 Dozer & Smigg, A:e2 Braylen, A:u3.* Highwaymen, A:u4.1-3 Stone Scribes, A:u4.4 Stone Bearer, A:e5 Runebearer.
 */
const game = (seed: string): GameState => {
  // the roll-off decides who moves first: take the first variant of the seed where A does (the ids above are A's)
  for (let k = 0; k < 20; k++) {
    const s = runControlTo(runSetup(newGame({ scenario: 'scn-copperline-crossing', lists: { A: 'trl.l.skirmish', B: 'trl.l.skirmish' } }, `${seed}-${k}`))).state
    if (s.activePlayer === 'A') return s
  }
  throw new Error('no seed gave A the first turn')
}
/** Park every model but `keep` at the table edge so nothing engages, blocks LOS or joins a blast. */
function park(s: GameState, keep: string[]): GameState {
  let i = 0
  for (const m of Object.values(s.models)) {
    if (keep.includes(m.id)) continue
    s = place(s, m.id, { x: -20 + (i % 10) * 4, z: 22 - Math.floor(i / 10) * 3 })
    i++
  }
  return s
}

describe('Trollbloods Skirmish data', () => {
  it('DATA-TRL-010 the whole data set validates with no error naming a Trollblood record', () => {
    expect(validateAll().errors.filter((e) => e.includes('trl'))).toEqual([])
  })

  it('SKM-001 trl.l.skirmish: level skirmish, 50 points recomputed, a non-lesser Cohort beast, FA and character limits hold', () => {
    const l = rec('trl.l.skirmish')
    expect(l).toMatchObject({ faction: 'trl', level: 'skirmish', points: 50, leader: 'trl.gunnbjorn' })
    const cost = l.entries.reduce((n: number, e: Any) => {
      const m = rec(e.profile)
      if (m.type !== 'unit') return n + m.cost
      const min = m.composition.grunts.min + (m.composition.extra ?? []).reduce((a: number, x: Any) => a + x.min, 0)
      return n + (m.composition.costBySize[e.size ?? min] ?? m.cost)
    }, 0)
    expect(cost).toBe(50)
    const beasts = l.entries.map((e: Any) => rec(e.profile)).filter((m: Any) => m.type === 'beast' && m.beastClass !== 'lesser')
    expect(beasts.map((m: Any) => m.id).sort()).toEqual(['trl.bomber', 'trl.dozer-smigg'])
    const seen = new Set<string>()
    for (const e of l.entries) { expect(seen.has(e.profile)).toBe(false); seen.add(e.profile) } // one of each entry
    for (const id of ['trl.dozer-smigg', 'trl.braylen']) expect(rec(id).fa).toBe('C')
    expect(rec('trl.krielstone').fa).toBe(1)
    expect(rec('trl.runebearer').fa).toBe(1)
  })

  it('SKM-001b the list builds a game on the Skirmish scenario with the whole roster on the table', () => {
    const s = game('trl-skm-1')
    const mine = Object.values(s.models).filter((m) => m.owner === 'A')
    expect(mine.map((m) => m.profileId).sort()).toEqual([
      'trl.bomber', 'trl.braylen', 'trl.dozer-smigg', 'trl.gunnbjorn', ...Array(5).fill('trl.highwaymen-grunt'),
      'trl.runebearer', 'trl.stone-bearer', ...Array(3).fill('trl.stone-scribe'),
    ].sort())
    expect(s.models['A:e1']!.controllerId).toBe('A:L') // Dozer & Smigg join Gunnbjorn's battlegroup
  })

  it('DATA-TRL-011 Dozer & Smigg: stat line, spiral, weapons, abilities, animus', () => {
    const d = rec('trl.dozer-smigg')
    expect(d).toMatchObject({ type: 'beast', beastClass: 'heavy', base: 50, cost: 14, fa: 'C', animus: 'trl.s.lucky-shot' })
    expect(d.stats).toEqual({ SPD: 5, MAT: 7, RAT: 5, DEF: 12, ARM: 19, FURY: 4, THR: 10 })
    const br: string[] = d.damage.branches
    expect(br.map((x) => x.length)).toEqual([6, 3, 7, 5, 6, 3])
    const all = br.join('')
    for (const [letter, n] of [['M', 9], ['B', 12], ['S', 9]] as const) expect(all.split('').filter((c) => c === letter).length).toBe(n)
    expect(rec('trl.w.bombard')).toMatchObject({ type: 'ranged', rng: 14, rof: 1, aoe: 3, pow: 14, blastPow: 8 })
    expect(rec('trl.w.bombard').abilities).toContain('core.a.arcing-fire')
    const ws = modelWeapons(bundle, 'trl.dozer-smigg')
    expect(ws.map((w) => w.weapon.id)).toEqual(['trl.w.bombard', 'trl.w.claw'])
    expect(ws.find((w) => w.weapon.id === 'trl.w.claw')!.count).toBe(2)
    for (const a of ['core.a.gunfighter', 'trl.a.bond-gunnbjorn', 'trl.a.bulldoze', 'trl.a.regeneration', 'trl.a.snacking', 'core.a.dual-attack']) expect(d.abilities).toContain(a)
    expect(rec('trl.s.lucky-shot')).toMatchObject({ cost: 1, rng: 6, dur: 'TURN', offensive: false, animus: true })
  })

  it('DATA-TRL-012 Krielstone Bearer & Stone Scribes: one Bearer and three Scribes for 5 points, 40 mm, 1 box each with Tough', () => {
    const u = rec('trl.krielstone')
    expect(u).toMatchObject({ type: 'unit', cost: 5, fa: 1 })
    expect(u.composition.grunts).toEqual({ profile: 'trl.stone-scribe', min: 3, max: 3 })
    expect(u.composition.extra).toEqual([{ profile: 'trl.stone-bearer', min: 1, max: 1 }])
    expect(u.composition.costBySize).toEqual({ '4': 5 })
    expect(rec('trl.stone-bearer')).toMatchObject({ base: 40, damage: { track: 'single', boxes: 1 } })
    expect(rec('trl.stone-bearer').stats).toMatchObject({ SPD: 5, DEF: 12, ARM: 13 })
    expect(rec('trl.stone-scribe').stats).toMatchObject({ SPD: 5, MAT: 5, DEF: 12, ARM: 13 })
    expect(rec('trl.w.hand-weapon')).toMatchObject({ type: 'melee', pow: 10, rng: 1 })
    for (const id of ['trl.stone-bearer', 'trl.stone-scribe']) expect(rec(id).abilities).toContain('core.a.tough')
    expect(rec('trl.stone-bearer').abilities).toEqual(expect.arrayContaining(['trl.a.protective-aura', 'trl.a.serenity', 'trl.a.take-up']))
  })

  it('DATA-TRL-013 Trollkin Runebearer: solo, 3 points, FA 1, SPD 6 AAT 6 DEF 12 ARM 14, 5 boxes, 40 mm', () => {
    const r = rec('trl.runebearer')
    expect(r).toMatchObject({ type: 'solo', cost: 3, fa: 1, base: 40, damage: { track: 'single', boxes: 5 } })
    expect(r.stats).toMatchObject({ SPD: 6, AAT: 6, DEF: 12, ARM: 14 })
    expect(r.abilities).toEqual(expect.arrayContaining(['trl.a.attached', 'trl.a.arcane-repeater', 'trl.a.magic-ability', 'trl.a.guidance', 'trl.a.harmonious-exaltation', 'trl.a.spell-slave', 'core.a.tough']))
  })

  it('DATA-TRL-014 every new id follows the scheme', () => {
    for (const id of ['trl.l.skirmish', 'trl.dozer-smigg', 'trl.krielstone', 'trl.stone-bearer', 'trl.stone-scribe', 'trl.runebearer', 'trl.w.bombard', 'trl.w.hand-weapon', 'trl.s.lucky-shot', 'trl.a.guidance']) {
      expect(bundle.byId[id], id).toBeTruthy()
      expect(id).toMatch(/^trl\.(l\.|w\.|a\.|s\.|f\.)?[a-z0-9-]+$/)
    }
  })
})

describe('Trollbloods Skirmish rules in play', () => {
  it('FAC-TRL-020 Protective Aura: friendly Trollbloods within 8" get +2 ARM, nobody beyond it and no enemy', () => {
    let s = park(game('aura'), ['A:u4.4', 'A:e0', 'A:e2', 'B:e0'])
    s = place(s, 'A:u4.4', { x: 0, z: 0 }); s = place(s, 'A:e0', { x: 5, z: 0 }); s = place(s, 'A:e2', { x: 0, z: 14 }); s = place(s, 'B:e0', { x: 3, z: 0 })
    const arm = (id: string) => statOf(s, engineBundle, id, 'ARM')
    expect(arm('A:e0')).toBe(20) // Bomber ARM 18 + 2
    expect(arm('A:u4.4')).toBe(15) // the Bearer covers itself too
    expect(arm('A:e2')).toBe(15) // Braylen beyond 8": her plain ARM
    expect(arm('B:e0')).toBe(18) // enemy Bomber is not covered
    const edge = place(s, 'A:e0', { x: 8.0 + 1.25 + 1.0 + 0.2, z: 0 }) // just past 8" edge to edge (40 mm and 50 mm bases)
    expect(statOf(edge, engineBundle, 'A:e0', 'ARM')).toBe(18)
  })

  it('FAC-TRL-021 Arcane Repeater: Gunnbjorn has +2 CTRL while the Runebearer is within 5"', () => {
    let s = park(game('rep'), ['A:L', 'A:e5'])
    s = place(s, 'A:L', { x: 0, z: 0 }); s = place(s, 'A:e5', { x: 4, z: 0 })
    expect(statOf(s, engineBundle, 'A:L', 'CTRL')).toBe(14)
    expect(statOf(place(s, 'A:e5', { x: 12, z: 0 }), engineBundle, 'A:L', 'CTRL')).toBe(12)
  })

  describe('Bond [Gunnbjorn] (FAC-TRL-022)', () => {
    const shoot = (s: GameState) => {
      const o = openCombat(asOut(s), 'A:e1', 'ranged')
      const first = send(o, { type: 'chooseAttack', modelId: 'A:e1', weaponId: 'trl.w.bombard', targetId: 'B:e2', additional: false })
      return { first, done: settle(first) }
    }
    const setup = (seed: string, gunnbjornX: number): GameState => {
      let s = park(game(seed), ['A:L', 'A:e1', 'B:e2'])
      s = place(s, 'A:e1', { x: 0, z: 0 }); s = place(s, 'A:L', { x: gunnbjornX, z: 0 }); s = place(s, 'B:e2', { x: 0, z: 6 })
      return s
    }
    it('a hit by a bonded Dozer & Smigg inside Gunnbjorn CTRL boosts the damage roll for free (no boost offer, no fury spent)', () => {
      let hits = 0
      for (let i = 0; i < 12 && hits < 2; i++) {
        const s = setup(`bond-in-${i}`, 3)
        const before = s.models['A:e1']!.fury
        const { first, done } = shoot(s)
        const hit = evs(done.events, 'AttackResolved').some((e) => e.hit)
        if (!hit) continue
        hits++
        expect(first.pending.kind).not.toBe('boostDamage')
        expect(evs(done.events, 'RollBoosted').some((e) => e.roll === 'damage' && e.source === 'effect')).toBe(true)
        expect(done.state.models['A:e1']!.fury).toBe(before)
      }
      expect(hits).toBeGreaterThan(0)
    })
    it('outside his CTRL the damage roll is not boosted for free', () => {
      let hits = 0
      for (let i = 0; i < 12 && hits < 2; i++) {
        const s = setup(`bond-out-${i}`, 30)
        const { done } = shoot(s)
        if (!evs(done.events, 'AttackResolved').some((e) => e.hit)) continue
        hits++
        expect(evs(done.events, 'RollBoosted').some((e) => e.roll === 'damage')).toBe(false)
      }
      expect(hits).toBeGreaterThan(0)
    })
  })

  it('FAC-TRL-023 Lucky Shot: the first missed ranged roll of the affected model is rerolled once and the effect is used up', () => {
    let missed = 0
    for (let i = 0; i < 40 && missed < 3; i++) {
      let s = park(game(`lucky-${i}`), ['A:L', 'A:e0', 'B:e2'])
      s = place(s, 'A:L', { x: 0, z: -4 }); s = place(s, 'A:e0', { x: 0, z: 0 }); s = place(s, 'B:e2', { x: 0, z: 7 })
      s = applyEffect(s, { sourceId: 'trl.s.lucky-shot', name: 'Lucky Shot', owner: 'A', casterId: 'A:e1', targetIds: ['A:e0'], mods: [], duration: 'turn' }).state
      const o = openCombat(asOut(s), 'A:e0', 'ranged')
      const done = settle(send(o, { type: 'chooseAttack', modelId: 'A:e0', weaponId: 'trl.w.powder-bomb', targetId: 'B:e2', additional: false }))
      const rr = evs(done.events, 'DiceRerolled').filter((e) => e.sourceId === 'trl.s.lucky-shot')
      const firstMissed = !evs(done.events, 'AttackResolved')[0]!.hit
      if (!firstMissed) { expect(rr).toHaveLength(0); continue }
      missed++
      expect(rr).toHaveLength(1)
      expect(done.state.effects.some((e) => e.sourceId === 'trl.s.lucky-shot')).toBe(false)
    }
    expect(missed).toBeGreaterThan(0)
  })

  it('FAC-TRL-024 Take Up: a hit that would destroy the Bearer destroys a Scribe within 1" instead and the Bearer takes nothing', () => {
    let s = park(game('takeup'), ['A:u4.1', 'A:u4.2', 'A:u4.3', 'A:u4.4'])
    s = place(s, 'A:u4.4', { x: 0, z: 0 }); s = place(s, 'A:u4.1', { x: 1.5, z: 0 }); s = place(s, 'A:u4.2', { x: 8, z: 0 }); s = place(s, 'A:u4.3', { x: 12, z: 0 })
    const plug = trollbloodsPlugins.find((p) => p.adjustPoints)!
    const job = (targetId: string) => ({ id: 'j', targetId, kind: 'direct' as const, pow: 14, types: [] })
    const out = plug.adjustPoints!(s, engineBundle, {} as never, job('A:u4.4'), 5)
    expect(out).not.toBeNull()
    expect(out!.points).toBe(0)
    expect(out!.state.models['A:u4.1']!.life).toBe('destroyed')
    expect(out!.state.models['A:u4.2']!.life).toBe('active') // 8" away: not chosen
    expect(out!.state.models['A:u4.4']!.life).toBe('active')
    // no Scribe within 1": the damage goes through
    const lone = place(s, 'A:u4.1', { x: 6, z: 0 })
    expect(plug.adjustPoints!(lone, engineBundle, {} as never, job('A:u4.4'), 5)).toBeNull()
    // a model without Take Up is untouched
    expect(plug.adjustPoints!(s, engineBundle, {} as never, job('A:u4.1'), 5)).toBeNull()
  })

  it('FAC-TRL-025 Bulldoze: ending a move touching an enemy shoves it 2" straight away, once per model per turn', () => {
    let s = park(game('bull'), ['A:e1', 'B:e2'])
    s = place(s, 'A:e1', { x: 0, z: 0 }); s = place(s, 'B:e2', { x: 0, z: 1.772 }) // 50 mm and 40 mm bases touching (0.984" + 0.787")
    const gap = s.models['B:e2']!.pos.z
    const out = hooks.effects.bulldoze!(hookCtx(s, 'A:e1', { point: 'movement.end' }), {})
    expect(out.state.models['B:e2']!.pos.z - gap).toBeCloseTo(2, 1)
    expect(Math.abs(out.state.models['B:e2']!.pos.x)).toBeLessThan(1e-6)
    // the marker stops a second shove in the same turn
    const again = hooks.effects.bulldoze!(hookCtx(place(out.state, 'B:e2', { x: 0, z: gap }), 'A:e1', { point: 'movement.end' }), {})
    expect(again.state.models['B:e2']!.pos.z).toBeCloseTo(gap, 5)
    // not touching: nothing moves
    const apart = hooks.effects.bulldoze!(hookCtx(place(s, 'B:e2', { x: 0, z: 6 }), 'A:e1', { point: 'movement.end' }), {})
    expect(apart.events).toEqual([])
  })

  it('FAC-TRL-026 Serenity: each Bearer takes 1 fury off the most furious friendly warbeast within 1"', () => {
    let s = park(game('serene'), ['A:u4.4', 'A:e0', 'A:e1'])
    s = place(s, 'A:u4.4', { x: 0, z: 0 }); s = place(s, 'A:e0', { x: 2.5, z: 0 }); s = place(s, 'A:e1', { x: -6, z: 0 })
    s = withModel(s, 'A:e0', { fury: 3 }); s = withModel(s, 'A:e1', { fury: 2 })
    const r = serenityStep(s, engineBundle, 'A')
    expect(r.state.models['A:e0']!.fury).toBe(2) // 40 mm and 50 mm bases: 2.5" centre to centre is 0.7" edge to edge
    expect(r.state.models['A:e1']!.fury).toBe(2) // 6" away: out of reach
    expect(evs(r.events, 'FuryChanged')).toHaveLength(1)
    expect(serenityStep(s, engineBundle, 'B').events).toEqual([])
  })

  it('FAC-TRL-027 Harmonious Exaltation marks the Leader within 5" for a one-spell discount; Guidance grants Eyeless Sight', () => {
    let s = park(game('harm'), ['A:L', 'A:e5', 'A:e0'])
    s = place(s, 'A:L', { x: 0, z: 0 }); s = place(s, 'A:e5', { x: 4, z: 0 }); s = place(s, 'A:e0', { x: 5, z: 4 })
    expect(harmoniousDiscount(s, 'A:L')).toBe(0)
    const h = hooks.effects.harmoniousExaltation!(hookCtx(s, 'A:e5', { point: 'combat.choose' }), {})
    expect(harmoniousDiscount(h.state, 'A:L')).toBe(1)
    expect(harmoniousDiscount(useHarmoniousExaltation(h.state, 'A:L').state, 'A:L')).toBe(0)
    const far = hooks.effects.harmoniousExaltation!(hookCtx(place(s, 'A:L', { x: 14, z: 0 }), 'A:e5', { point: 'combat.choose' }), {})
    expect(harmoniousDiscount(far.state, 'A:L')).toBe(0)
    // Guidance picks the Leader first and grants it Eyeless Sight for the turn
    const g = hooks.effects.guidance!(hookCtx(s, 'A:e5', { point: 'combat.choose' }), {})
    expect(abilitiesOf(g.state, engineBundle, 'A:L')).toContain('trl.a.eyeless-sight')
    expect(abilitiesOf(g.state, engineBundle, 'A:e0')).not.toContain('trl.a.eyeless-sight')
  })

  it('FAC-TRL-028 Spell Slave is a recorded ability only: none of Gunnbjorn\'s four spells is castable by it, so it offers no action', () => {
    const ok = (id: string) => { const sp = rec(id); return sp.cost <= 3 && !['SELF', 'CTRL'].includes(sp.rng) && sp.dur !== 'UP' }
    expect(rec('trl.gunnbjorn').spells.filter(ok)).toEqual([])
    expect(rec('trl.a.spell-slave').kind).toBe('passive')
  })
})
