// WP-D-cir: the Circle Orboros Skirmish list (50 points; docs/spec/90-skirmish.md B.4) and its three new models:
// Tharn Wolf Riders, Tharn Ravager Shaman, Wild Argus. Data checks first, then the faction rules through the real pipeline.
import { describe, expect, it } from 'vitest'
import { pickSensible } from '../../src/ai/random'
import { applyEffect } from '../../src/engine/effects'
import { abilitiesOf, cannotKnockDown, hasFlag, resistsDamageType, runCodeEffect, statOf } from '../../src/engine/code-hooks'
import type { GameEvent } from '../../src/engine/events'
import { createGame, legalActions, step, validate } from '../../src/engine/index'
import { createInitialState } from '../../src/engine/setup'
import type { GameState } from '../../src/engine/types'
import {
  annoyancePenalty, circleHooks, circlePlugins, warpingWindsBlastResist, warpingWindsRngPenalty,
} from '../../src/engine/factions/circle'
import { moverInfo } from '../../src/engine/phases/activation'
import { validateAll } from '../../tools/validate-data'
import { asOut, bundle, choose, place, send, settle } from '../engine/action-helpers'
import { must, runSetup } from '../engine/turn-helpers'

type Any = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const B = bundle
const rec = (id: string): Any => B.byId[id] as unknown as Any
const LEVEL_CAP = { skirmish: 50 }

// ---------- data ----------
describe('Circle Skirmish list (data)', () => {
  it('SKM-001 cir.l.skirmish: level skirmish, 47 points (46 to 50), a non-lesser Cohort, FA and character limits hold', () => {
    const l = rec('cir.l.skirmish')
    expect(l).toMatchObject({ faction: 'cir', level: 'skirmish', leader: 'cir.tanith', points: 47 })
    const cost = (e: Any) => rec(e.profile).composition?.costBySize?.[e.size] ?? rec(e.profile).cost
    const total = l.entries.reduce((a: number, e: Any) => a + cost(e), 0)
    expect(total).toBe(47)
    expect(total).toBeGreaterThanOrEqual(LEVEL_CAP.skirmish - 4)
    expect(total).toBeLessThanOrEqual(LEVEL_CAP.skirmish)
    const profiles = l.entries.map((e: Any) => e.profile)
    expect(profiles).toEqual(['cir.pureblood', 'cir.wild-argus', 'cir.lord-of-the-feast', 'cir.ravagers', 'cir.wolf-riders', 'cir.ravager-shaman'])
    expect(profiles.map((p: string) => rec(p).beastClass).filter(Boolean)).toEqual(['heavy', 'light']) // the Leader battlegroup holds a non-lesser Cohort model
    for (const id of new Set<string>(profiles)) {
      const fa = rec(id).fa
      const n = profiles.filter((p: string) => p === id).length
      expect(n).toBeLessThanOrEqual(fa === 'C' ? 1 : (fa as number))
    }
    expect(l.entries.every((e: Any) => e.controller === undefined && e.loadout === undefined && e.attachments === undefined)).toBe(true)
    expect(validateAll().errors.filter((e: string) => /cir[.-]|\/cir\//.test(e))).toEqual([])
  })

  it('DATA-CIR-S01 Wolf Riders: the January 2026 card (MAT 6, Assault, no Dual Attack), 3 Grunts, 8 points, FA 2, 50 mm', () => {
    expect(rec('cir.wolf-riders')).toMatchObject({ type: 'unit', cost: 8, fa: 2, composition: { grunts: { profile: 'cir.wolf-rider', min: 3, max: 3 }, costBySize: { 3: 8 } } })
    const r = rec('cir.wolf-rider')
    expect(r).toMatchObject({ type: 'trooper', base: 50, stats: { SPD: 9, MAT: 6, RAT: 6, DEF: 15, ARM: 14 }, damage: { track: 'single', boxes: 5 } })
    expect(r.weapons.map((w: Any) => w.weapon)).toEqual(['cir.w.thrown-javelin', 'cir.w.bladed-shield'])
    for (const a of ['cir.a.cavalry', 'core.a.pathfinder', 'core.a.unstoppable', 'cir.a.assault', 'cir.a.annoyance', 'core.a.reposition', 'cir.a.unpredictable-movement', 'cir.a.unyielding']) expect(r.abilities, a).toContain(a)
    expect(r.abilities).not.toContain('core.a.dual-attack')
    expect(rec('core.a.reposition').effect[0]).toMatchObject({ op: 'advance', dist: 3 })
    expect(rec('cir.w.thrown-javelin')).toMatchObject({ type: 'ranged', rng: 7, rof: 1, pow: 9, qualities: ['core.q.weapon-master'] })
    expect(rec('cir.w.bladed-shield')).toMatchObject({ type: 'melee', rng: 1, pow: 9, qualities: ['core.q.weapon-master'] })
  })

  it('DATA-CIR-S02 Ravager Shaman: SPD 6, AAT 6, MAT 6, DEF 13, ARM 15, 8 boxes, 4 points, FA 2, 40 mm, three actions and a Magic Ability', () => {
    expect(rec('cir.ravager-shaman')).toMatchObject({
      type: 'solo', cost: 4, fa: 2, base: 40, stats: { SPD: 6, AAT: 6, MAT: 6, DEF: 13, ARM: 15 }, damage: { track: 'single', boxes: 8 },
    })
    const a = rec('cir.ravager-shaman').abilities as string[]
    for (const x of ['core.a.tough', 'core.a.pathfinder', 'cir.a.body-snatcher', 'cir.a.blood-rage', 'cir.a.magic-ability', 'cir.a.chain-lightning', 'cir.a.hunters-grace', 'cir.a.sky-shaker', 'cir.a.rapid-healing', 'cir.a.treewalker']) expect(a, x).toContain(x)
    expect(rec('cir.w.totem-staff')).toMatchObject({ type: 'melee', rng: 1, pow: 12, qualities: ['core.q.magical'] })
    expect(rec('cir.w.chain-lightning')).toMatchObject({ type: 'ranged', rng: 10, pow: 10, damageTypes: ['electricity'] })
    expect(rec('cir.a.chain-lightning')).toMatchObject({ kind: 'specialAttack', attack: 'cir.w.chain-lightning' })
    expect(rec('cir.a.hunters-grace')).toMatchObject({ kind: 'specialAction', duration: 'round' })
    expect(rec('cir.a.sky-shaker')).toMatchObject({ kind: 'specialAction', duration: 'round' })
  })

  it('DATA-CIR-S03 Wild Argus: light warbeast, FURY 3, THR 9, 21-box spiral 7/7/7, two Bites POW 12 with Combo Strike, animus Doppler Bark', () => {
    const w = rec('cir.wild-argus')
    expect(w).toMatchObject({ type: 'beast', beastClass: 'light', cost: 6, fa: 4, base: 40, stats: { SPD: 6, MAT: 5, DEF: 14, ARM: 15, FURY: 3, THR: 9 }, animus: 'cir.s.doppler-bark' })
    const br: string[] = w.damage.branches
    expect(br.map((b) => b.length)).toEqual([5, 2, 5, 2, 5, 2])
    expect(br.join('').length).toBe(21)
    const aspect = (c: string) => br.join('').split(c).length - 1
    expect([aspect('M'), aspect('B'), aspect('S')]).toEqual([7, 7, 7])
    expect(w.weapons).toEqual([{ weapon: 'cir.w.bite', count: 2 }])
    expect(rec('cir.w.bite')).toMatchObject({ type: 'melee', rng: 1, pow: 12, abilities: ['cir.a.combo-strike'] })
    expect(rec('cir.a.combo-strike')).toMatchObject({ kind: 'specialAttack', trigger: 'combat.choose', effect: [{ op: 'modRoll', roll: 'damage', value: 4 }] })
    for (const a of ['core.a.headbutt', 'core.a.slam', 'core.a.pathfinder']) expect(w.abilities).toContain(a)
    expect(rec('cir.s.doppler-bark')).toMatchObject({ cost: 2, rng: 'SELF', dur: 'RND', offensive: false, animus: true })
  })

  it('DATA-CIR-S04 prose is short, every new record is namespaced and every {code} it uses is registered; each new card names its sources', () => {
    const ids = ['cir.wolf-rider', 'cir.wolf-riders', 'cir.ravager-shaman', 'cir.wild-argus']
    for (const id of ids) expect(rec(id).verify, id).toMatch(/S1/)
    for (const id of ['cir.a.cavalry', 'cir.a.assault', 'cir.a.annoyance', 'cir.a.unpredictable-movement', 'cir.a.unyielding', 'cir.a.combo-strike', 'cir.a.magic-ability',
      'cir.a.chain-lightning', 'cir.a.hunters-grace', 'cir.a.sky-shaker', 'cir.s.doppler-bark']) {
      const r = rec(id)
      expect(String(r.text).length, id).toBeLessThanOrEqual(400)
      expect(id).toMatch(/^cir\.(a|s)\.[a-z0-9-]+$/)
      expect(JSON.stringify(r)).not.toMatch(/\b(facing|free strike|template|scatter|deviation)\b/i)
      for (const n of (r.effect ?? []) as Any[]) if (n.code && n.code !== 'coreFlag') expect(circleHooks.effects[n.code], `${id} -> ${n.code}`).toBeTypeOf('function')
    }
    for (const id of ['cir.wolf-rider', 'cir.ravager-shaman', 'cir.wild-argus']) expect(Object.keys(rec(id).stats)).not.toContain('STR')
    expect(circlePlugins.map((p) => p.id)).toEqual(expect.arrayContaining(['cir.unyielding', 'cir.chain-lightning']))
  })
})

// ---------- engine ----------
const SETUP = { scenario: 'scn-copperline-crossing', lists: { A: 'cir.l.skirmish', B: 'cir.l.skirmish' } }
const probe = createGame(SETUP, 'cir-sk-probe', B)
const ready = !probe.rejection
const WR = ['A:u4.1', 'A:u4.2', 'A:u4.3'], SHAMAN = 'A:e5', ARGUS = 'A:e1', LORD = 'A:e2', RAV = 'A:u3.1'
const BWR = ['B:u4.1', 'B:u4.2', 'B:u4.3']

/** A real Skirmish mirror game (the setup places everything), terrain cleared, `player` to choose an activation; models in `keep` stay, the rest are parked on the far rows. */
function arena(seed: string, keep: Record<string, { x: number; z: number }>, player: 'A' | 'B' = 'A'): GameState {
  let s = runSetup(must(createInitialState(SETUP, seed, B))).state
  s = { ...s, terrain: [] }
  let a = 0, b = 0
  for (const m of Object.values(s.models)) {
    if (keep[m.id]) s = place(s, m.id, keep[m.id]!)
    else s = place(s, m.id, m.owner === 'A' ? { x: -22 + a++ * 2.5, z: -22 } : { x: -22 + b++ * 2.5, z: 22 })
  }
  return { ...s, activePlayer: player, pending: { ...s.pending, kind: 'chooseActivation', player, id: 'd:900', options: [] } as GameState['pending'], decisionSeq: 900 }
}
const damageRolls = (ev: GameEvent[], owner?: string) => ev.filter((e): e is Extract<GameEvent, { type: 'DiceRolled' }> => e.type === 'DiceRolled' && e.purpose === 'damage' && (!owner || e.ownerId === owner))

describe.skipIf(!ready)('Circle Skirmish models in the engine', () => {
  it('SKM-CIR-001 the real list builds into a Skirmish game: 3 Wolf Riders on 50 mm bases, a Shaman, an Argus under Tanith', () => {
    const s = runSetup(must(createInitialState(SETUP, 'cir-sk-1', B))).state
    const mine = Object.values(s.models).filter((m) => m.owner === 'A')
    expect(mine.map((m) => m.profileId).sort()).toEqual([
      'cir.pureblood', 'cir.ravager-1', 'cir.ravager-2', 'cir.ravager-3', 'cir.ravager-shaman', 'cir.tanith', 'cir.lord-of-the-feast', 'cir.wild-argus', 'cir.wolf-rider', 'cir.wolf-rider', 'cir.wolf-rider',
    ].sort())
    expect(mine.filter((m) => m.profileId === 'cir.wolf-rider').every((m) => m.base === 50 && m.damage.track === 'single' && m.damage.boxes === 5)).toBe(true)
    expect(mine.find((m) => m.profileId === 'cir.wild-argus')).toMatchObject({ type: 'beast', controllerId: 'A:L', base: 40 })
    expect(mine.find((m) => m.profileId === 'cir.ravager-shaman')).toMatchObject({ type: 'solo', base: 40 })
    expect(s.units['A:u4']?.troopers.length).toBe(3)
  })

  it('FAC-CIR-S01 card values reach the engine: Wolf Rider SPD 9, Unstoppable and Pathfinder movement, cavalry and assault flags; the Shaman has Magic Ability', () => {
    const s = arena('cir-sk-2', {})
    expect(statOf(s, B, WR[0]!, 'SPD')).toBe(9)
    expect(statOf(s, B, WR[0]!, 'DEF')).toBe(15)
    expect(statOf(s, B, WR[0]!, 'ARM')).toBe(14)
    expect(moverInfo(s, B, WR[0]!)).toMatchObject({ spd: 9, unstoppable: true, pathfinder: true, hasMelee: true })
    expect(hasFlag(s, B, WR[0]!, 'cavalry')).toBe(true)
    expect(hasFlag(s, B, WR[0]!, 'assault')).toBe(true)
    expect(hasFlag(s, B, WR[0]!, 'dualAttack')).toBe(false)
    expect(hasFlag(s, B, RAV, 'cavalry')).toBe(false)
    expect(abilitiesOf(s, B, WR[0]!)).toContain('core.a.reposition')
    expect(hasFlag(s, B, SHAMAN, 'magicAbility')).toBe(true)
    expect(statOf(s, B, SHAMAN, 'AAT')).toBe(6)
  })

  it('FAC-CIR-S02 Unyielding: a melee damage roll against a Wolf Rider does 2 fewer points; a Ravager takes it whole (the Lord Wurmblade through the real pipeline)', () => {
    let wrSeen = 0, ravSeen = 0
    for (let i = 0; i < 60 && (wrSeen < 3 || ravSeen < 3); i++) {
      for (const [victim, isWr] of [[WR[0]!, true], [RAV, false]] as const) {
        const s = arena('cir-unyield' + i, { [victim]: { x: 0, z: 0 }, 'B:e2': { x: 0, z: 1.8 } }, 'B')
        let o = choose(asOut(s), 'B:e2')
        o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'B:e2' })
        o = send(o, { type: 'chooseCombatAction', modelId: 'B:e2', choice: 'melee' })
        o = send(o, { type: 'chooseAttack', modelId: 'B:e2', weaponId: 'cir.w.wurmblade', targetId: victim, additional: false })
        o = settle(o)
        for (const e of o.events) {
          if (e.type !== 'DamageRolled' || e.instance.targetId !== victim) continue
          expect(e.arm).toBe(isWr ? 14 : 15) // the plugin never changes the ARM shown
          expect(e.points).toBe(Math.max(0, (e.instance.total ?? 0) - e.arm - (isWr ? 2 : 0)))
          if ((e.instance.total ?? 0) - e.arm > 2) { if (isWr) wrSeen++; else ravSeen++ }
        }
      }
    }
    expect(wrSeen).toBeGreaterThanOrEqual(3)
    expect(ravSeen).toBeGreaterThanOrEqual(3)
  })

  it('FAC-CIR-S02b Unyielding plugin: melee and power attacks only, floor 0, Affliction keeps its one point, a model without it is untouched', () => {
    const s = arena('cir-sk-3', {})
    const unyielding = circlePlugins.find((p) => p.id === 'cir.unyielding')!
    const adj = (st: GameState, kind: string, target: string, points: number, job: 'direct' | 'blast' = 'direct') =>
      unyielding.adjustPoints!(st, B, { kind } as never, { id: 'j', targetId: target, kind: job, pow: 10, types: [] }, points)?.points ?? points
    expect(adj(s, 'melee', WR[0]!, 7)).toBe(5)
    expect(adj(s, 'power', WR[0]!, 7)).toBe(5)
    expect(adj(s, 'melee', WR[0]!, 1)).toBe(0)
    expect(adj(s, 'ranged', WR[0]!, 7)).toBe(7)
    expect(adj(s, 'arcane', WR[0]!, 7)).toBe(7)
    expect(adj(s, 'melee', RAV, 7)).toBe(7)
    const afflicted = applyEffect(s, { sourceId: 'cir.s.affliction', name: 'Affliction', owner: 'B', casterId: 'B:L', targetIds: [WR[0]!], mods: [{ stat: 'DEF', value: -2, mode: 'add' }], duration: 'upkeep' }).state
    expect(adj(afflicted, 'melee', WR[0]!, 2)).toBe(1) // 0 after Unyielding, then the Affliction floor
    expect(adj(afflicted, 'melee', WR[0]!, 1)).toBe(1)
  })

  it('FAC-CIR-S03 Chain Lightning: a hit arcs to d3 more models, nearest first, friends included, never the Shaman; a miss arcs nowhere (loop seeds)', () => {
    const where = {
      [SHAMAN]: { x: 0, z: -8 }, 'B:e2': { x: 0, z: -2 }, 'B:e1': { x: 2.6, z: -2 }, [BWR[0]!]: { x: 5.8, z: -2 }, [BWR[1]!]: { x: 12, z: -2 }, [LORD]: { x: 4, z: -4.6 },
    }
    const order = ['B:e1', BWR[0]!, LORD]
    let hits = 0, misses = 0, deep = 0
    for (let i = 0; i < 140 && !(misses >= 2 && deep >= 2); i++) {
      const s = arena('cir-cl' + i, where)
      let o = choose(asOut(s), SHAMAN)
      o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: SHAMAN })
      o = send(o, { type: 'chooseCombatAction', modelId: SHAMAN, choice: 'specialAttack', abilityId: 'cir.a.chain-lightning' })
      o = send(o, { type: 'chooseAttack', modelId: SHAMAN, weaponId: 'cir.w.chain-lightning', targetId: 'B:e2', additional: false })
      o = settle(o)
      expect(o.events.find((e) => e.type === 'AttackDeclared')).toMatchObject({ kind: 'arcane', targetId: 'B:e2' }) // Magic Ability: the star attack is arcane (AAT)
      const res = o.events.find((e) => e.type === 'AttackResolved') as Extract<GameEvent, { type: 'AttackResolved' }>
      const arcRolls = damageRolls(o.events).filter((e) => e.ownerId !== 'B:e2').map((e) => e.ownerId)
      const d3 = o.events.filter((e): e is Extract<GameEvent, { type: 'DiceRolled' }> => e.type === 'DiceRolled' && e.purpose === 'd3')
      if (!res.hit) {
        misses++
        expect(arcRolls).toEqual([])
        expect(d3.length).toBe(0)
        continue
      }
      hits++
      const wanted = Math.min(3, Math.ceil(d3[0]!.dice[0]! / 2))
      expect(arcRolls.length).toBe(wanted)
      expect(arcRolls).toEqual(order.slice(0, wanted)) // nearest first, then the friendly Lord is the next nearest
      if (wanted >= 2) deep++
      expect(arcRolls).not.toContain(SHAMAN)
      expect(arcRolls).not.toContain(BWR[1]!) // 4"+ from the last model touched
      const applied = o.events.filter((e): e is Extract<GameEvent, { type: 'DamageApplied' }> => e.type === 'DamageApplied' && arcRolls.includes(e.targetId))
      for (const a of applied) expect(a.damageTypes).toEqual(expect.arrayContaining(['electricity', 'magical']))
      for (const r of damageRolls(o.events).filter((e) => e.ownerId !== 'B:e2')) expect(r.kept.length).toBe(2) // 2d6 for POW 10 (no electricity resistance in this army)
    }
    expect(hits).toBeGreaterThanOrEqual(3)
    expect(misses).toBeGreaterThanOrEqual(2)
    expect(deep).toBeGreaterThanOrEqual(2)
  })

  it('FAC-CIR-S04 Doppler Bark: the Argus casts its animus (forced); living enemies within 2 inches drop to base DEF 5 and cannot run or charge for a round', () => {
    const s = arena('cir-sk-4', { 'A:L': { x: 0, z: -12 }, [ARGUS]: { x: 0, z: -8 }, 'B:e2': { x: 0, z: -5.9 }, 'B:e1': { x: 6, z: -8 }, [LORD]: { x: -2.2, z: -8 } })
    expect(statOf(s, B, 'B:e2', 'DEF')).toBe(12)
    let o = choose(asOut(s), ARGUS)
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: ARGUS })
    o = send(o, { type: 'castSpell', casterId: ARGUS, spellId: 'cir.s.doppler-bark' })
    const t = o.state
    expect(statOf(t, B, 'B:e2', 'DEF')).toBe(5)
    expect(statOf(t, B, 'B:e1', 'DEF')).toBe(statOf(s, B, 'B:e1', 'DEF')) // 6" away
    expect(statOf(t, B, LORD, 'DEF')).toBe(statOf(s, B, LORD, 'DEF')) // a friend
    const e = t.effects.find((x) => x.sourceId === 'cir.s.doppler-bark' && x.targetIds.includes('B:e2'))!
    expect(e.forbid).toEqual(expect.arrayContaining(['run', 'charge', 'slam', 'trample']))
    expect(e.duration).toBe('round')
    expect(t.models[ARGUS]!.fury).toBe(2) // the animus cost 2 fury, forced onto the beast
  })

  it('FAC-CIR-S04b Doppler Bark hook: a Construct is left alone (living or undead only), the caster is not a target, nothing near = no effect', () => {
    const s = arena('cir-sk-4b', { [ARGUS]: { x: 0, z: -8 }, 'B:e2': { x: 0, z: -5.9 } })
    const k = { ...s, models: { ...s.models, 'B:e2': { ...s.models['B:e2']!, profileId: 'cir.pureblood' } } }
    const near = runCodeEffect(s, B, 'cirDopplerBark', { point: 'spell.cast', selfId: ARGUS, activePlayer: 'A' })
    expect(near.state.effects.filter((x) => x.sourceId === 'cir.s.doppler-bark').flatMap((x) => x.targetIds)).toEqual(['B:e2'])
    const none = runCodeEffect(place(k, 'B:e2', { x: 15, z: 15 }), B, 'cirDopplerBark', { point: 'spell.cast', selfId: ARGUS, activePlayer: 'A' })
    expect(none.state.effects.length).toBe(k.effects.length)
  })

  it('FAC-CIR-S05 Hunter\'s Grace: Tharn models of its side within 5 inches cannot be knocked down for a round; others can', () => {
    const s = arena('cir-sk-5', { [SHAMAN]: { x: 0, z: -8 }, [WR[0]!]: { x: 3, z: -8 }, [RAV]: { x: -4, z: -8 }, [WR[1]!]: { x: 9, z: -8 }, [LORD]: { x: 0, z: -4 }, 'B:u3.1': { x: 0, z: -11 } })
    let o = choose(asOut(s), SHAMAN)
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: SHAMAN })
    o = send(o, { type: 'chooseCombatAction', modelId: SHAMAN, choice: 'specialAction', abilityId: 'cir.a.hunters-grace' })
    const e = o.state.effects.find((x) => x.sourceId === 'cir.a.hunters-grace')!
    expect(e.duration).toBe('round')
    expect(new Set(e.targetIds)).toEqual(new Set([SHAMAN, WR[0]!, RAV]))
    for (const id of [SHAMAN, WR[0]!, RAV]) expect(cannotKnockDown(o.state, B, id), id).toBe(true)
    for (const id of [WR[1]!, LORD, 'B:u3.1']) expect(cannotKnockDown(o.state, B, id), id).toBe(false) // too far, not Tharn, enemy
  })

  it('FAC-CIR-S06 Sky Shaker: Warping Winds on the Shaman, Resistance: Blast to Faction models within 3 inches; the -3 RNG seam reads the live effect', () => {
    const s = arena('cir-sk-6', { [SHAMAN]: { x: 0, z: -8 }, [ARGUS]: { x: 2, z: -8 }, [WR[0]!]: { x: 8, z: -8 }, 'B:e1': { x: 0, z: -5 } })
    expect(warpingWindsRngPenalty(s, B, ARGUS)).toBe(0)
    let o = choose(asOut(s), SHAMAN)
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: SHAMAN })
    o = send(o, { type: 'chooseCombatAction', modelId: SHAMAN, choice: 'specialAction', abilityId: 'cir.a.sky-shaker' })
    const t = o.state
    expect(t.effects.some((x) => x.name === 'Warping Winds' && x.targetIds.includes(SHAMAN) && x.duration === 'round')).toBe(true)
    expect(resistsDamageType(t, B, SHAMAN, ['blast'])).toBe(true)
    expect(resistsDamageType(t, B, ARGUS, ['blast'])).toBe(true)
    expect(resistsDamageType(t, B, WR[0]!, ['blast'])).toBe(false) // 8" away
    expect(resistsDamageType(t, B, 'B:e1', ['blast'])).toBe(false) // an enemy
    expect(resistsDamageType(t, B, ARGUS, ['fire'])).toBe(false)
    expect(warpingWindsRngPenalty(t, B, ARGUS)).toBe(-3)
    expect(warpingWindsRngPenalty(t, B, WR[0]!)).toBe(0)
    expect(warpingWindsRngPenalty(t, B, 'B:e1')).toBe(0)
    expect(warpingWindsBlastResist(t, B, ARGUS)).toBe(true)
    const moved = place(t, ARGUS, { x: 5, z: -8 }) // the seam is live: it follows the models
    expect(warpingWindsRngPenalty(moved, B, ARGUS)).toBe(0)
    expect(warpingWindsBlastResist(moved, B, ARGUS)).toBe(false)
  })

  it('FAC-CIR-S07 Combo Strike: one Bite star attack with +4 on its damage roll replaces the two initial bites (loop seeds for a hit)', () => {
    let seen = 0
    for (let i = 0; i < 40 && seen < 3; i++) {
      const s = arena('cir-combo' + i, { [ARGUS]: { x: 0, z: -8 }, 'B:e2': { x: 0, z: -6.4 } })
      let o = choose(asOut(s), ARGUS)
      o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: ARGUS })
      o = send(o, { type: 'chooseCombatAction', modelId: ARGUS, choice: 'specialAttack', abilityId: 'cir.a.combo-strike' })
      o = send(o, { type: 'chooseAttack', modelId: ARGUS, weaponId: 'cir.w.bite', targetId: 'B:e2', additional: false })
      o = settle(o)
      expect(o.events.filter((e) => e.type === 'AttackDeclared').length).toBe(1) // not two bites
      for (const r of damageRolls(o.events, 'B:e2')) { seen++; expect(r.total - r.kept.reduce((a, d) => a + d, 0)).toBe(12 + 4) } // POW 12 + 4
    }
    expect(seen).toBeGreaterThanOrEqual(3)
    // an ordinary Bite has no bonus
    const s2 = arena('cir-combo-plain', { [ARGUS]: { x: 0, z: -8 }, 'B:e2': { x: 0, z: -6.4 } })
    let p = choose(asOut(s2), ARGUS)
    p = send(p, { type: 'chooseMovement', option: 'forfeit', modelId: ARGUS })
    p = send(p, { type: 'chooseCombatAction', modelId: ARGUS, choice: 'melee' })
    expect(p.pending.kind).toBe('chooseAttack')
  })

  it('FAC-CIR-S08 Annoyance: living enemies within 1 inch of a Wolf Rider take -1 to attack rolls, once; Constructs and far models do not', () => {
    const s = arena('cir-sk-8', { [WR[0]!]: { x: 0, z: 0 }, [WR[1]!]: { x: 2, z: 0 }, 'B:e2': { x: 0, z: 1.9 }, 'B:e1': { x: 0, z: 4 } })
    expect(annoyancePenalty(s, B, 'B:e2')).toBe(-1) // 0.32" edge to edge
    expect(annoyancePenalty(s, B, 'B:e1')).toBe(0) // 3" off
    expect(annoyancePenalty(s, B, WR[0]!)).toBe(0) // a friend
    const both = place(s, 'B:e2', { x: 1, z: 0.9 }) // inside the reach of two Wolf Riders: still -1
    expect(annoyancePenalty(both, B, 'B:e2')).toBe(-1)
    const construct = { ...s, models: { ...s.models, 'B:e2': { ...s.models['B:e2']!, profileId: 'kha.razor' } } }
    expect(rec('kha.razor')).toBeDefined()
    expect(annoyancePenalty(construct, B, 'B:e2')).toBe(0)
  })

  it('SMOKE-CIR-S01 a Skirmish mirror game (the sensible random decider) reaches round 2 with no rejection', () => {
    let r = createGame(SETUP, 'cir-sk-smoke', B)
    expect(r.rejection).toBeUndefined()
    let guard = 0
    while (r.state.round < 2 && r.pending.kind !== 'gameOver' && guard++ < 6000) {
      const legal = legalActions(r.state)
      expect(legal.length, `no legal action for ${r.pending.kind}`).toBeGreaterThan(0)
      const a = pickSensible(r.state, r.pending, legal, 'cir-sk')
      expect(validate(r.state, a)).toBeNull()
      r = step(r.state, a)
      expect(r.rejection).toBeUndefined()
    }
    expect(r.state.round).toBeGreaterThanOrEqual(2)
  })
})
