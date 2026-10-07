// Trollbloods review fixes, checked through the real attack and activation pipeline (not just the data):
// Guided Fire, Regeneration, Critical Devastation, Fortification cover, Rock Wall, plus in-play versions of FAC-TRL-003/006/011/014.
import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../src/engine/events'
import { abilitiesOf, codeHooks } from '../../src/engine/code-hooks'
import { applyEffect } from '../../src/engine/effects'
import { defModifiers } from '../../src/engine/los'
import { query } from '../../src/engine/index'
import { hasGrantedCover, shapesClash } from '../../src/engine/factions/trollbloods'
import { worldShape } from '../../src/engine/terrain'
import type { GameState, TerrainInstance } from '../../src/engine/types'
import { asOut, bundle, choose, openCombat, place, send, settle, withModel } from './action-helpers'
import { newGame, runControlTo, runSetup } from './turn-helpers'

type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>
const evs = <T extends GameEvent['type']>(es: GameEvent[], t: T): Ev<T>[] => es.filter((e): e is Ev<T> => e.type === t)
const hooks = codeHooks()
const hookCtx = (state: GameState, selfId: string, extra: Record<string, unknown> = {}) =>
  ({ state, point: 'passive', selfId, activePlayer: state.activePlayer, bundle, ...extra }) as never

/** The Trollblood starter list (A, moves first) against the Cygnar Quick Start at the first activation choice. */
const trl = (seed: string): GameState =>
  runControlTo(runSetup(newGame({ scenario: 'scn-qs-demo', lists: { A: 'trl.l.starter-recon', B: 'cyg.l.qs-recon' } }, seed))).state
/** Park every model but `keep` at the table edge so nothing engages, blocks LOS or joins a blast. */
function park(s: GameState, keep: string[]): GameState {
  let i = 0
  for (const m of Object.values(s.models)) {
    if (keep.includes(m.id)) continue
    s = place(s, m.id, { x: -16 + (i % 8) * 4, z: 16 - Math.floor(i / 8) * 3 })
    i++
  }
  return s
}
const single = (boxes: number, filled: number) => ({ track: 'single' as const, boxes, filled })
const withGuidedFire = (s: GameState): GameState => hooks.effects.guidedFire!(hookCtx(s, 'A:L', { point: 'spell.cast' }), {}).state
const attackRolls = (es: GameEvent[]): Ev<'DiceRolled'>[] => evs(es, 'DiceRolled').filter((e) => e.purpose === 'attack')

describe('Guided Fire in play', () => {
  const run = (s: GameState, attackerId: string, weaponId: string, targetId: string) => {
    const o = openCombat(asOut(s), attackerId, 'ranged')
    const first = send(o, { type: 'chooseAttack', modelId: attackerId, weaponId, targetId, additional: false })
    return { first, done: settle(first) }
  }

  it('FAC-TRL-012b the Bomber inside CTRL rolls a boosted attack for free: 3 dice, no boost offer, no fury or focus spent', () => {
    let s = park(trl('gf1'), ['A:L', 'A:e0', 'B:e1'])
    s = place(s, 'A:L', { x: 0, z: 0 }); s = place(s, 'A:e0', { x: 4, z: 0 }); s = place(s, 'B:e1', { x: 4, z: 6 })
    s = withGuidedFire(s)
    const before = s.models['A:e0']!
    const { first, done } = run(s, 'A:e0', 'trl.w.powder-bomb', 'B:e1')
    expect(first.pending.kind, 'a forced boost leaves no boost offer').not.toBe('boostAttack')
    const boosted = evs(done.events, 'RollBoosted').filter((e) => e.roll === 'attack')
    expect(boosted).toHaveLength(1)
    expect(boosted[0]!.source).toBe('effect')
    const rolls = attackRolls(done.events)
    expect(rolls).toHaveLength(1)
    expect(rolls[0]!.dice).toHaveLength(3) // 2 dice plus the boost die, never 4
    expect(rolls[0]!.boosted).toBe(true)
    const after = done.state.models['A:e0']!
    expect(after.fury).toBe(before.fury)
    expect(after.focus).toBe(before.focus)
  })

  it('FAC-TRL-012c Gunnbjorn\'s own Bazooka is covered; a Bomber outside his CTRL or outside the battlegroup is not', () => {
    let s = park(trl('gf2'), ['A:L', 'A:e0', 'A:e1', 'B:e1'])
    s = place(s, 'A:L', { x: 0, z: 0 }); s = place(s, 'B:e1', { x: 0, z: 8 })
    s = place(s, 'A:e0', { x: 20, z: -2 }) // far outside CTRL 12
    s = place(s, 'A:e1', { x: 3, z: 0 }) // Braylen: in CTRL but not a battlegroup model
    s = withGuidedFire(s)
    const gun = run(s, 'A:L', 'trl.w.bazooka', 'B:e1').done
    expect(attackRolls(gun.events)[0]!.dice).toHaveLength(3)
    expect(evs(gun.events, 'RollBoosted').some((e) => e.source === 'effect')).toBe(true)
    // out of CTRL at roll time: a plain 2 dice roll (the effect is not tied to targets fixed at cast time)
    let far = place(s, 'A:e0', { x: 20, z: -2 }); far = place(far, 'B:e1', { x: 20, z: 5 })
    const out = run(far, 'A:e0', 'trl.w.powder-bomb', 'B:e1').done
    expect(attackRolls(out.events)[0]!.dice).toHaveLength(2)
    expect(evs(out.events, 'RollBoosted').some((e) => e.source === 'effect')).toBe(false)
    // moving into CTRL after the cast makes the same Bomber covered
    const near = place(far, 'A:e0', { x: 4, z: 0 }); const near2 = place(near, 'B:e1', { x: 4, z: 6 })
    const inside = run(near2, 'A:e0', 'trl.w.powder-bomb', 'B:e1').done
    expect(attackRolls(inside.events)[0]!.dice).toHaveLength(3)
    // a model outside the battlegroup never gets it
    const brayPistol = run(place(s, 'B:e1', { x: 3, z: 6 }), 'A:e1', 'trl.w.heavy-pistol', 'B:e1').done
    expect(evs(brayPistol.events, 'RollBoosted').some((e) => e.source === 'effect')).toBe(false)
  })

  it('FAC-TRL-012d the preview shows the boosted roll once the spell runs', () => {
    let s = park(trl('gf3'), ['A:L', 'A:e0', 'B:e1'])
    s = place(s, 'A:L', { x: 0, z: 0 }); s = place(s, 'A:e0', { x: 4, z: 0 }); s = place(s, 'B:e1', { x: 4, z: 6 })
    const plain = query.attackPreview(s, 'A:e0', 'trl.w.powder-bomb', 'B:e1')
    const guided = query.attackPreview(withGuidedFire(s), 'A:e0', 'trl.w.powder-bomb', 'B:e1')
    expect(guided.dice).toBe(plain.dice + 1)
    expect(guided.pHit).toBeGreaterThan(plain.pHit)
  })
})

describe('Regeneration in play (FAC-TRL-003)', () => {
  const hurt = (s: GameState): GameState => {
    const m = s.models['A:e0']!
    if (m.damage.track !== 'grid') throw new Error('spiral expected')
    const grids = m.damage.grids.map((g) => ({ ...g, cols: g.cols.map((c, ci) => c.map((v, i) => (ci === 0 && i < 4 ? true : v))) }))
    return withModel(s, 'A:e0', { damage: { track: 'grid', grids } })
  }
  const marked = (s: GameState): number => {
    const d = s.models['A:e0']!.damage
    return d.track === 'grid' ? d.grids.reduce((n, g) => n + g.cols.reduce((c, col) => c + col.filter(Boolean).length, 0), 0) : 0
  }
  const regenOpt = (o: ReturnType<typeof asOut>) => o.pending.options?.find((x) => (x.action as { abilityId?: string }).abilityId === 'trl.a.regeneration')

  it('is a combat-choice special action, not a start-of-activation offer', () => {
    const ab = bundle.byId['trl.a.regeneration'] as unknown as Record<string, unknown>
    expect(ab).toMatchObject({ kind: 'specialAction', trigger: 'combat.choose', limit: 'oncePerActivation', cost: { forced: 1 } })
  })

  it('offered at the Combat Action after a forfeited move: forces the Bomber, heals 1-3, once per activation', () => {
    let s = park(trl('rg1'), ['A:L', 'A:e0'])
    s = place(s, 'A:L', { x: 0, z: -4 }); s = place(s, 'A:e0', { x: 0, z: 0 })
    s = hurt(s)
    const m0 = marked(s)
    let o = choose(asOut(s), 'A:e0')
    expect(o.pending.kind, 'nothing is offered before movement').not.toBe('abilityChoice')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e0' })
    const opt = regenOpt(o)
    expect(opt, 'Regeneration is offered at the Combat Action').toBeDefined()
    const fury0 = o.state.models['A:e0']!.fury ?? 0
    o = send(o, opt!.action as unknown as Record<string, unknown>)
    expect(o.state.models['A:e0']!.fury).toBe(fury0 + 1)
    const healed = m0 - marked(o.state)
    expect(healed).toBeGreaterThanOrEqual(1)
    expect(healed).toBeLessThanOrEqual(3)
    expect(o.pending.kind).toBe('chooseCombatAction')
    expect(regenOpt(o)).toBeUndefined()
  })

  it('is not offered after the Bomber ran (the old start-of-activation heal let it regenerate and then run)', () => {
    let s = park(trl('rg2'), ['A:L', 'A:e0'])
    s = place(s, 'A:L', { x: 0, z: -4 }); s = place(s, 'A:e0', { x: 0, z: 0 })
    s = hurt(s)
    const o = choose(asOut(s), 'A:e0')
    const run = o.pending.options!.find((x) => x.id === 'run')
    expect(run, 'the Bomber can run').toBeDefined()
    const ran = send(send(o, { type: 'chooseMovement', option: 'run', modelId: 'A:e0' }), { type: 'moveModel', modelId: 'A:e0', path: [{ x: 0, z: 6 }] })
    expect(ran.state.activation?.ran ?? true).toBe(true)
    expect(ran.pending.options?.some((x) => (x.action as { abilityId?: string }).abilityId === 'trl.a.regeneration') ?? false).toBe(false)
  })

  it('is not offered with nothing to heal', () => {
    let s = park(trl('rg3'), ['A:L', 'A:e0'])
    s = place(s, 'A:L', { x: 0, z: -4 }); s = place(s, 'A:e0', { x: 0, z: 0 })
    let o = choose(asOut(s), 'A:e0')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e0' })
    expect(regenOpt(o)).toBeUndefined()
  })
})

describe('Critical Devastation in play (FAC-TRL-008b)', () => {
  it('fixes the blast before the throw, throws every hit model, and rolls POW 8 blast and POW 8 collateral', () => {
    let seen = false
    for (let i = 0; i < 400 && !seen; i++) {
      let s = park(trl('cd' + i), ['A:L', 'B:e1', 'B:u2.1', 'B:u2.2'])
      s = place(s, 'A:L', { x: 0, z: 0 })
      // the target and a neighbour inside the 2" blast, plus a bystander right behind the target in the throw line
      s = place(s, 'B:e1', { x: 0, z: 8 }, { damage: single(100, 0) })
      s = place(s, 'B:u2.1', { x: 1.1, z: 8 }, { damage: single(100, 0) })
      s = place(s, 'B:u2.2', { x: 0, z: 10.2 }, { damage: single(100, 0) })
      let o = openCombat(asOut(s), 'A:L', 'ranged')
      o = send(o, { type: 'chooseAttack', modelId: 'A:L', weaponId: 'trl.w.bazooka', targetId: 'B:e1', additional: false })
      o = settle(o)
      const res = evs(o.events, 'AttackResolved')[0]!
      if (!res.hit || !res.crit) continue
      seen = true
      // every hit model is thrown (direct target and the blast model), and knocked down
      const moved = evs(o.events, 'ModelMoved').filter((e) => e.kind === 'throw').map((e) => e.modelId)
      expect(moved).toContain('B:e1')
      expect(moved).toContain('B:u2.1')
      expect(o.state.models['B:e1']!.conditions).toContain('knockedDown')
      expect(o.state.models['B:u2.1']!.conditions).toContain('knockedDown')
      // the blast model takes a POW 8 blast roll, even though it was thrown first
      const blast = evs(o.events, 'DamageRolled').filter((e) => e.instance.kind === 'blast' && e.instance.targetId === 'B:u2.1')
      expect(blast).toHaveLength(1)
      expect(blast[0]!.instance.pow).toBe(8)
      // collateral from the throw is POW 8 (flat part of its damage roll), never the core 12 or 14
      const thrownInto = evs(o.events, 'DamageApplied').filter((e) => e.source === 'collateral')
      for (const d of thrownInto) {
        const roll = evs(o.events, 'DiceRolled').find((r) => r.purpose === 'damage' && r.ownerId === d.targetId && r.dice.length === 2 && r.total - r.dice.reduce((a, b) => a + b, 0) !== undefined)
        if (roll) expect([8]).toContain(roll.total - roll.dice.reduce((a, b) => a + b, 0))
      }
    }
    expect(seen).toBe(true)
  })

  it('carries POW 8 collateral when the thrown model slams into a neighbour', () => {
    let seen = false
    for (let i = 0; i < 400 && !seen; i++) {
      let s = park(trl('cdc' + i), ['A:L', 'B:e1', 'B:u2.2'])
      s = place(s, 'A:L', { x: 0, z: 0 })
      s = place(s, 'B:e1', { x: 0, z: 8 }, { damage: single(100, 0) })
      s = place(s, 'B:u2.2', { x: 0, z: 9.6 }, { damage: single(100, 0) }) // touching range straight behind, inside blast too
      let o = openCombat(asOut(s), 'A:L', 'ranged')
      o = send(o, { type: 'chooseAttack', modelId: 'A:L', weaponId: 'trl.w.bazooka', targetId: 'B:e1', additional: false })
      o = settle(o)
      const res = evs(o.events, 'AttackResolved')[0]!
      if (!res.hit || !res.crit) continue
      const coll = evs(o.events, 'DamageApplied').filter((e) => e.source === 'collateral')
      if (!coll.length) continue
      seen = true
      for (const d of coll) {
        const rolls = evs(o.events, 'DiceRolled').filter((r) => r.purpose === 'damage' && r.ownerId === d.targetId)
        expect(rolls.some((r) => r.total - r.dice.reduce((a, b) => a + b, 0) === 8)).toBe(true)
      }
    }
    expect(seen).toBe(true)
  })
})

describe('Fortification cover (FAC-TRL-011b)', () => {
  const fort = (s: GameState): GameState => hooks.effects.grantCover!(hookCtx(s, 'A:L', { point: 'feat.used' }), {}).state
  // Caine (B:L) shoots Braylen (A:e1) with a plain ranged weapon; Falk's scattergun is a spray
  const pistol = 'cyg.w.spellstorm-pistol'
  const spray = 'cyg.w.magelock-scattergun'
  const base = (seed: string): GameState => {
    let s = park(trl(seed), ['A:L', 'A:e1', 'B:L', 'B:e1'])
    s = place(s, 'A:L', { x: 0, z: 0 }); s = place(s, 'A:e1', { x: 3, z: 0 }); s = place(s, 'B:L', { x: 3, z: 8 }); s = place(s, 'B:e1', { x: 3, z: 10 })
    return s
  }
  const defOf = (s: GameState, from: string, weapon: string): number => query.attackPreview(s, from, weapon, 'A:e1').hitTarget

  it('gives +4 DEF against a ranged attack, counted once with terrain cover, replacing concealment', () => {
    const s0 = base('fc1')
    const plain = defOf(s0, 'B:L', pistol)
    const s = fort(s0)
    expect(hasGrantedCover(s, bundle, 'A:e1')).toBe(true)
    expect(defOf(s, 'B:L', pistol)).toBe(plain + 4)
    // standing in real cover: +4 in all, never +8
    const wall: TerrainInstance = { id: 'w1', pieceId: 'terrain.low-wall', rulesType: 'obstacle', pos: { x: 3, z: 1.4 }, rot: 0, footprint: { rect: { w: 6, d: 1 } }, height: 1, props: {} }
    expect(defOf({ ...s0, terrain: [wall] }, 'B:L', pistol)).toBe(plain + 4)
    expect(defOf({ ...s, terrain: [wall] }, 'B:L', pistol)).toBe(plain + 4)
    // concealment: the granted cover replaces it (+4, not +4 and +2)
    const mist: TerrainInstance = { id: 'f1', pieceId: 'terrain.forest', rulesType: 'forest', pos: { x: 3, z: 0 }, rot: 0, footprint: { circle: { r: 3 } }, height: 3, props: {} }
    expect(defOf({ ...s0, terrain: [mist] }, 'B:L', pistol)).toBe(plain + 2)
    expect(defOf({ ...s, terrain: [mist] }, 'B:L', pistol)).toBe(plain + 4)
  })

  it('does not apply against spray or melee', () => {
    const s0 = base('fc2')
    const s = fort(s0)
    expect(defOf(s, 'B:e1', spray)).toBe(defOf(s0, 'B:e1', spray))
    const sword = 'cyg.w.sword'
    const close = (st: GameState): GameState => place(st, 'B:e1', { x: 3, z: 1.2 })
    expect(defOf(close(s), 'B:e1', sword)).toBe(defOf(close(s0), 'B:e1', sword))
  })

  it('follows CTRL: a model that walks out loses the cover, one that walks in gains it; enemies and a spent round never have it', () => {
    let s = fort(base('fc3'))
    expect(hasGrantedCover(s, bundle, 'A:e1')).toBe(true)
    s = place(s, 'A:e1', { x: 20, z: 0 })
    expect(hasGrantedCover(s, bundle, 'A:e1')).toBe(false)
    s = place(s, 'A:e0', { x: 6, z: 0 })
    expect(hasGrantedCover(s, bundle, 'A:e0')).toBe(true) // was not in CTRL-range placement logic of the feat-time list
    expect(hasGrantedCover(s, bundle, 'B:e1')).toBe(false)
    const gone = { ...s, effects: s.effects.filter((e) => e.sourceId !== 'trl.f.fortification') }
    expect(hasGrantedCover(gone, bundle, 'A:e0')).toBe(false)
  })

  it('an ignore-cover attack ignores it (the DefModOptions seam: ignoreCover beats grantedCover)', () => {
    const s = fort(base('fc4'))
    const df = defModifiers(s, 'A:e1', { kind: 'ranged', baseDef: 14, originId: 'B:L', grantedCover: true, ignoreCover: true })
    expect(df.cover).toBe(false)
    expect(df.def).toBe(14)
    expect(defModifiers(s, 'A:e1', { kind: 'ranged', baseDef: 14, originId: 'B:L', grantedCover: true }).def).toBe(18)
    expect(defModifiers(s, 'A:e1', { kind: 'spray', baseDef: 14, originId: 'B:L', grantedCover: true }).def).toBe(14)
  })
})

describe('Rock Wall (FAC-TRL-013b)', () => {
  const base = (seed: string): GameState => {
    let s = park(trl(seed), ['A:L', 'B:e1'])
    s = place(s, 'A:L', { x: 0, z: 0 }); s = place(s, 'B:e1', { x: 0, z: 14 })
    return s
  }
  const cast = (s: GameState, point?: { x: number; z: number }) => hooks.effects.rockWall!(hookCtx(s, 'A:L', { point: 'spell.cast', pointTarget: point }), {})

  it('is the rulebook 4 x 3/4 wall', () => {
    const wall = cast(base('rw1')).state.terrain.find((t) => t.props.rockWall)!
    expect(wall.footprint).toEqual({ rect: { w: 4, d: 0.75 } })
    expect(wall.rulesType).toBe('obstacle')
  })

  it('is pushed clear of an obstruction in front of the caster, and never overlaps any terrain piece', () => {
    const block: TerrainInstance = { id: 'ob1', pieceId: 'terrain.wall', rulesType: 'obstruction', pos: { x: 0, z: 5 }, rot: 0, footprint: { rect: { w: 6, d: 3 } }, height: 3, props: {} }
    const s = { ...base('rw2'), terrain: [block] }
    const plain = cast(base('rw2')).state.terrain.find((t) => t.props.rockWall)!
    const wall = cast(s).state.terrain.find((t) => t.props.rockWall)!
    expect(wall).toBeDefined()
    expect(shapesClash(worldShape(plain), worldShape(block))).toBe(true) // the default spot would have been on top of it
    expect(shapesClash(worldShape(wall), worldShape(block))).toBe(false)
    expect(wall.pos.z).toBeGreaterThan(6.5) // beyond the obstruction
  })

  it('refuses a chosen point that overlaps terrain and falls back to a clear one', () => {
    const rubble: TerrainInstance = { id: 'ru1', pieceId: 'terrain.rubble', rulesType: 'rubble', pos: { x: 0, z: 6 }, rot: 0, footprint: { circle: { r: 1.5 } }, height: 0.4, props: {} }
    const s = { ...base('rw3'), terrain: [rubble] }
    const out = cast(s, { x: 0, z: 6 }).state.terrain.find((t) => t.props.rockWall)!
    expect(shapesClash(worldShape(out), worldShape(rubble))).toBe(false)
  })

  it('makes no wall when nothing fits (a ring of obstructions around the caster)', () => {
    const ring: TerrainInstance[] = []
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2
      ring.push({ id: `r${k}`, pieceId: 'terrain.wall', rulesType: 'obstruction', pos: { x: Math.cos(a) * 2.6, z: Math.sin(a) * 2.6 }, rot: 0, footprint: { circle: { r: 14 } }, height: 3, props: {} })
    }
    const s = { ...base('rw4'), terrain: ring.slice(0, 1) }
    const r = cast(s)
    expect(r.state.terrain.some((t) => t.props.rockWall)).toBe(false)
  })
})

describe('Data checked in play (FAC-TRL-006, FAC-TRL-014)', () => {
  it('FAC-TRL-006b Leadership: Highwaymen within 10" of Braylen have Dodge, far ones and others do not', () => {
    let s = park(trl('ld1'), ['A:e1', 'A:u2.1', 'A:u2.2', 'A:u2.3', 'A:L'])
    s = place(s, 'A:e1', { x: 0, z: 0 }); s = place(s, 'A:u2.1', { x: 5, z: 0 }); s = place(s, 'A:u2.2', { x: 9, z: 0 }); s = place(s, 'A:u2.3', { x: 25, z: 0 })
    s = place(s, 'A:L', { x: -3, z: 0 })
    expect(abilitiesOf(s, bundle, 'A:u2.1')).toContain('trl.a.dodge')
    expect(abilitiesOf(s, bundle, 'A:u2.2')).toContain('trl.a.dodge')
    expect(abilitiesOf(s, bundle, 'A:u2.3')).not.toContain('trl.a.dodge')
    expect(abilitiesOf(s, bundle, 'A:L')).not.toContain('trl.a.dodge')
  })

  it('FAC-TRL-014b Snipe and Far Strike: the RNG +3 shows up in the weapon range of a live effect, Sentry lists its target', () => {
    let s = park(trl('sn1'), ['A:L', 'A:e1', 'B:e1'])
    s = place(s, 'A:L', { x: 0, z: 0 }); s = place(s, 'A:e1', { x: 0, z: 2 }); s = place(s, 'B:e1', { x: 0, z: 12 }) // 10" gap: Braylen's pistols reach 8"
    const before = query.attackPreview(s, 'A:e1', 'trl.w.heavy-pistol', 'B:e1')
    expect(before.autoMiss).toBe(true) // out of range
    const snipe = applyEffect(s, { sourceId: 'trl.s.snipe', name: 'Snipe', owner: 'A', casterId: 'A:L', targetIds: ['A:e1'], mods: [{ stat: 'RNG', value: 3, mode: 'add' }], duration: 'upkeep' }).state
    const after = query.attackPreview(snipe, 'A:e1', 'trl.w.heavy-pistol', 'B:e1')
    expect(after.autoMiss).toBe(false) // 8 + 3 reaches
    expect(after.pHit).toBeGreaterThan(0)
  })
})
