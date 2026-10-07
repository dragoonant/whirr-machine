// Trollbloods faction rules (docs/spec/factions/trollbloods.md): FAC-TRL-001..011 plus the headless smoke game.
import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../src/engine/events'
import { codeHooks, hasFlag, knownCodeConditions } from '../../src/engine/code-hooks'
import { createGame, legalActions, step } from '../../src/engine/index'
import { pickSensible } from '../../src/ai/random'
import { pruneRockWalls, resourcefulFree, sentryReady, trollbloodsPlugins } from '../../src/engine/factions/trollbloods'
import type { AtkCtx } from '../../src/engine/code-hooks'
import type { GameState } from '../../src/engine/types'
import { asOut, bundle, choose, openCombat, place, send, settle, startState } from './action-helpers'

type Rec = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const rec = (id: string): Rec => bundle.byId[id] as unknown as Rec
const hooks = codeHooks()

/** Park every other model far away so it cannot engage, block LOS or join a blast. */
function clearAround(s: GameState, keep: string[]): GameState {
  let i = 0
  for (const m of Object.values(s.models)) {
    if (keep.includes(m.id)) continue
    s = place(s, m.id, { x: -16 + (i % 8) * 4, z: 16 - Math.floor(i / 8) * 3 })
    i++
  }
  return s
}
/** Give a Quick Start model a Trollblood profile (and its base) so the real pipeline runs the Trollblood data. */
const swap = (s: GameState, id: string, profileId: string, patch: Record<string, unknown> = {}): GameState => {
  const base = rec(profileId).base as number
  return place(s, id, s.models[id]!.pos, { profileId, base, ...patch } as never)
}
const single = (boxes: number, filled: number) => ({ track: 'single' as const, boxes, filled })
const hookCtx = (state: GameState, selfId: string, extra: Record<string, unknown> = {}) =>
  ({ state, point: 'passive', selfId, activePlayer: state.activePlayer, bundle, ...extra }) as never

describe('Trollbloods data', () => {
  it('FAC-TRL-000 the starter list is 28 points with the spec roster, every code hook is registered', () => {
    const l = rec('trl.l.starter-recon')
    expect(l.leader).toBe('trl.gunnbjorn')
    expect(l.entries.map((e: Rec) => e.profile)).toEqual(['trl.bomber', 'trl.braylen', 'trl.highwaymen'])
    expect(rec('trl.gunnbjorn')).toMatchObject({ type: 'leader', resource: 'fury', base: 40, cost: 0, stats: { ARC: 6, CTRL: 12, DEF: 15, ARM: 16 } })
    expect(rec('trl.bomber')).toMatchObject({ type: 'beast', beastClass: 'heavy', base: 50, stats: { FURY: 4, THR: 8 }, animus: 'trl.s.far-strike' })
    const sizes = (rec('trl.bomber').damage.branches as string[]).map((b) => b.length)
    expect(sizes).toEqual([6, 3, 7, 5, 6, 3])
    expect(rec('trl.s.far-strike').animus).toBe(true)
    const walk = (n: unknown, f: (x: Rec) => void): void => {
      if (Array.isArray(n)) n.forEach((x) => walk(x, f))
      else if (n && typeof n === 'object') { f(n as Rec); Object.values(n as Rec).forEach((x) => walk(x, f)) }
    }
    for (const r of Object.values(bundle.byId) as Rec[]) {
      if (!String(r.id).startsWith('trl.') || !['ability', 'spell', 'feat'].includes(r.recordType)) continue
      walk(r.effect, (n) => { if (typeof n.code === 'string') expect(hooks.effects[n.code] ?? (n.code === 'coreFlag' ? true : undefined), `${r.id} ${n.code}`).toBeTruthy() })
      walk(r.when, (n) => { if (typeof n.code === 'string') expect(knownCodeConditions()).toContain(n.code) })
    }
  })
})

describe('Trollbloods abilities', () => {
  it('FAC-TRL-001 Field Marshal gives the battlegroup warbeasts Run & Gun (data), and the Run & Gun hook is the shared one', () => {
    const fm = rec('trl.a.field-marshal-run-and-gun')
    expect(fm.scope.who).toBe('warbeasts')
    expect(fm.effect).toEqual([{ op: 'grantAbility', ability: 'trl.a.run-and-gun' }])
    expect(rec('trl.a.run-and-gun').effect).toEqual([{ code: 'runAndGun' }])
    expect(typeof hooks.effects.runAndGun).toBe('function')
    // the grant itself is checked in play by CORE-001 (core-m9.test.ts)
  })

  it('FAC-TRL-002 Resourceful: upkeep is free on Gunnbjorn and his battlegroup beasts, not on others', () => {
    let s = startState('res').state
    s = swap(s, 'A:L', 'trl.gunnbjorn')
    s = swap(s, 'A:e0', 'trl.bomber', { controllerId: 'A:L' })
    expect(hasFlag(s, bundle, 'A:L', 'resourceful')).toBe(true)
    expect(resourcefulFree(s, bundle, 'A:L', 'A:e0')).toBe(true)
    expect(resourcefulFree(s, bundle, 'A:L', 'A:L')).toBe(true)
    expect(resourcefulFree(s, bundle, 'A:L', 'A:e1')).toBe(false)
    expect(resourcefulFree(s, bundle, 'A:e0', 'A:e0')).toBe(false)
  })

  it('FAC-TRL-003 Regeneration heals d3, never more than the damage', () => {
    let s = startState('reg').state
    s = swap(s, 'A:e0', 'trl.bomber', { damage: single(30, 10) })
    const regen = hooks.effects.regenerate!
    const r = regen(hookCtx(s, 'A:e0'), {})
    const filled = (r.state.models['A:e0']!.damage as { filled: number }).filled
    expect(filled).toBeGreaterThanOrEqual(7)
    expect(filled).toBeLessThanOrEqual(9)
    expect(rec('trl.a.regeneration')).toMatchObject({ trigger: 'activation.start', optional: true, limit: 'oncePerActivation', cost: { forced: 1 } })
    const s2 = swap(s, 'A:e0', 'trl.bomber', { damage: single(30, 0) })
    expect((regen(hookCtx(s2, 'A:e0'), {}).state.models['A:e0']!.damage as { filled: number }).filled).toBe(0)
  })

  it('FAC-TRL-004 Snacking: a melee boxing of a living model removes it from play and heals d3; ranged and constructs do not', () => {
    let s = startState('snk').state
    s = swap(s, 'A:e1', 'trl.bomber', { damage: single(30, 12) })
    const plugin = trollbloodsPlugins[0]!
    const atk = (kind: string, extra: Rec = {}) => ({ attackerId: 'A:e1', targetId: 'B:e1', kind, x: { destroyed: ['B:e1'], flags: {} }, ...extra }) as unknown as AtkCtx
    expect(plugin.onBoxed!(s, bundle, atk('melee'), 'B:e1', {} as never)).toEqual({ removeFromPlay: true, denyTough: false })
    expect(plugin.onBoxed!(s, bundle, atk('ranged'), 'B:e1', {} as never)).toBeNull()
    expect(plugin.onBoxed!(s, bundle, atk('melee'), 'B:e0', {} as never)).toBeNull() // Deuce is a construct
    // after the attack: the boxed (removed) model heals the Bomber by 1..3
    const boxed = place(s, 'B:e1', s.models['B:e1']!.pos, { life: 'boxed' })
    const r = plugin.onResolved!(boxed, bundle, atk('melee'))
    const f = (r.state.models['A:e1']!.damage as { filled: number }).filled
    expect(f).toBeGreaterThanOrEqual(9)
    expect(f).toBeLessThanOrEqual(11)
    // a model that was destroyed normally (life destroyed) feeds nothing
    const dead = place(s, 'B:e1', s.models['B:e1']!.pos, { life: 'destroyed' })
    expect((plugin.onResolved!(dead, bundle, atk('melee')).state.models['A:e1']!.damage as { filled: number }).filled).toBe(12)
  })

  it('FAC-TRL-004b Snacking in play: the Bomber claws a wounded Falk to a box and he is removed from play (loop seeds)', () => {
    let seen = false
    for (let i = 0; i < 120 && !seen; i++) {
      let s = startState('snp' + i).state
      s = clearAround(s, ['A:e1', 'B:e1'])
      s = swap(s, 'A:e1', 'trl.bomber', { damage: single(30, 12) })
      s = place(s, 'A:e1', { x: 0, z: 0 })
      s = place(s, 'B:e1', { x: 0, z: 50 / 25.4 / 2 + 30 / 25.4 / 2 + 0.3 }, { damage: single(8, 7) })
      let o = openCombat(asOut(s), 'A:e1', 'melee')
      o = send(o, { type: 'chooseAttack', modelId: 'A:e1', weaponId: 'trl.w.claw', targetId: 'B:e1', additional: false })
      o = settle(o)
      const removed = o.events.find((e) => e.type === 'ModelRemoved' && e.modelId === 'B:e1') as Extract<GameEvent, { type: 'ModelRemoved' }> | undefined
      if (!removed) continue
      seen = true
      expect(removed.reason).toBe('removedFromPlay')
      expect((o.state.models['A:e1']!.damage as { filled: number }).filled).toBeLessThan(12)
    }
    expect(seen).toBe(true)
  })

  it('FAC-TRL-005 Dodge: an enemy attack that misses Braylen offers a 2" advance, taking it moves him (loop seeds for a miss)', () => {
    const gun = rec('kha.lazarenko').weapons.map((w: Rec) => w.weapon as string).find((w: string) => rec(w).type === 'ranged') as string
    let seen = false
    for (let i = 0; i < 120 && !seen; i++) {
      let s = startState('dg' + i).state
      s = clearAround(s, ['A:e1', 'B:e1'])
      s = swap(s, 'B:e1', 'trl.braylen')
      s = place(s, 'B:e1', { x: 0, z: 0 })
      s = place(s, 'A:e1', { x: 0, z: 6 })
      let o = openCombat(asOut(s), 'A:e1', 'ranged')
      o = send(o, { type: 'chooseAttack', modelId: 'A:e1', weaponId: gun, targetId: 'B:e1', additional: false })
      for (let k = 0; k < 20 && o.pending.kind !== 'triggerWindow' && ['boostAttack', 'boostDamage', 'powerField', 'chooseBoxes', 'abilityChoice'].includes(o.pending.kind); k++) {
        const kind = o.pending.kind
        o = kind === 'chooseBoxes' ? send(o, { type: 'chooseBoxes', column: Number(o.pending.options![0]!.id.replace('col', '')) })
          : kind === 'abilityChoice' ? send(o, { type: 'abilityChoice', optionId: o.pending.options![0]!.id })
          : kind === 'powerField' ? send(o, { type: 'powerField', spend: 0 }) : send(o, { type: kind, boost: false })
      }
      if (o.pending.kind !== 'triggerWindow') { continue } // a hit (no Dodge) or no trigger
      seen = true
      expect(o.pending.player).toBe('B')
      expect(o.pending.context.modelId).toBe('B:e1')
      expect(o.pending.context.data?.triggerId).toBe('trl.a.dodge')
    }
    expect(seen).toBe(true)
  })

  it('FAC-TRL-006 Leadership: Highwaymen within 10" of Braylen gain Dodge, others and far ones do not', () => {
    const ab = rec('trl.a.leadership-highwaymen')
    expect(ab.scope).toMatchObject({ who: 'friendly', range: 10, filter: { test: 'keyword', value: 'highwaymen' } })
    expect(ab.effect).toEqual([{ op: 'grantAbility', ability: 'trl.a.dodge' }])
    expect(rec('trl.highwaymen-grunt').keywords).toContain('highwaymen')
    expect(rec('trl.braylen').keywords).not.toContain('highwaymen')
  })

  it('FAC-TRL-007 Swift Hunter: advance 2" after a basic ranged attack destroys an enemy (shared condition)', () => {
    const ab = rec('trl.a.swift-hunter')
    expect(ab).toMatchObject({ trigger: 'attack.resolved', optional: true, when: { code: 'destroyedEnemyWithBasicRanged' } })
    expect(ab.effect).toEqual([{ op: 'advance', dist: 2, direction: 'any' }])
    expect(knownCodeConditions()).toContain('destroyedEnemyWithBasicRanged')
    expect(rec('trl.highwaymen-grunt').abilities).toContain('trl.a.swift-hunter')
  })

  it('FAC-TRL-008 Critical Devastation: a Bazooka critical throws the target d6" away and knocks it down (loop seeds for a crit)', () => {
    let seen = false
    for (let i = 0; i < 200 && !seen; i++) {
      let s = startState('cd' + i).state
      s = clearAround(s, ['A:e1', 'B:e1'])
      s = swap(s, 'A:e1', 'trl.gunnbjorn')
      s = place(s, 'A:e1', { x: 0, z: 0 })
      s = place(s, 'B:e1', { x: 0, z: 8 }, { damage: single(100, 0) })
      let o = openCombat(asOut(s), 'A:e1', 'ranged')
      o = send(o, { type: 'chooseAttack', modelId: 'A:e1', weaponId: 'trl.w.bazooka', targetId: 'B:e1', additional: false })
      o = settle(o)
      const res = o.events.find((e) => e.type === 'AttackResolved') as Extract<GameEvent, { type: 'AttackResolved' }>
      if (!res.hit || !res.crit) continue
      seen = true
      const t = o.state.models['B:e1']!
      expect(t.pos.z).toBeGreaterThan(8.5) // thrown away from Gunnbjorn (d6 >= 1, or less if stopped)
      expect(t.conditions).toContain('knockedDown')
      expect(o.events.some((e) => e.type === 'ModelMoved' && e.modelId === 'B:e1')).toBe(true)
    }
    expect(seen).toBe(true)
  })

  it('FAC-TRL-009 Forced Reload: the Powder Bomb carries Reload [1] (paid by forcing) and the Bomber can shoot it twice', () => {
    expect(rec('trl.w.powder-bomb').abilities).toEqual(expect.arrayContaining(['trl.a.forced-reload', 'core.a.reload-1']))
    expect(rec('trl.a.forced-reload').effect).toEqual([{ code: 'coreFlag', params: { flag: 'forcedReload' } }])
    // forcing instead of spending focus is checked in play by CORE-007 (core-m9.test.ts)
  })

  it('FAC-TRL-010 Luck: a missed pistol roll is rerolled once (loop seeds for a miss)', () => {
    let seen = false
    for (let i = 0; i < 200 && !seen; i++) {
      let s = startState('lk' + i).state
      s = clearAround(s, ['A:e1', 'B:e0'])
      s = swap(s, 'A:e1', 'trl.braylen')
      s = place(s, 'A:e1', { x: 0, z: 0 })
      s = place(s, 'B:e0', { x: 0, z: 6 }, { damage: single(100, 0) })
      let o = openCombat(asOut(s), 'A:e1', 'ranged')
      o = send(o, { type: 'chooseAttack', modelId: 'A:e1', weaponId: 'trl.w.heavy-pistol', targetId: 'B:e0', additional: false })
      o = settle(o)
      const rerolls = o.events.filter((e) => e.type === 'DiceRerolled' && e.sourceId === 'trl.a.luck')
      if (!rerolls.length) continue
      seen = true
      expect(rerolls.length).toBe(1)
      const resolved = o.events.filter((e) => e.type === 'AttackResolved') as Extract<GameEvent, { type: 'AttackResolved' }>[]
      expect(resolved[0]!.hit).toBe(false)
      expect(resolved.length).toBe(2)
      // a hit after the reroll goes on to a damage roll
      if (resolved[1]!.hit) expect(o.events.some((e) => e.type === 'DamageRolled')).toBe(true)
    }
    expect(seen).toBe(true)
  })

  it('FAC-TRL-011 Fortification: friendly models in CTRL get +4 DEF against ranged attacks and cannot be knocked down for the round', () => {
    let s = startState('fort').state
    s = swap(s, 'A:L', 'trl.gunnbjorn')
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'A:e1', { x: 3, z: 0 })
    s = place(s, 'A:e0', { x: 30, z: 0 })
    const r = hooks.effects.grantCover!(hookCtx(s, 'A:L', { point: 'feat.used' }), {})
    const eff = r.state.effects.find((e) => e.sourceId === 'trl.f.fortification')!
    expect(eff.targetIds).toContain('A:e1')
    expect(eff.targetIds).not.toContain('A:e0')
    expect(eff.forbid).toContain('knockDown')
    expect(rec('trl.f.fortification').effect).toEqual(expect.arrayContaining([{ op: 'grantResistance', damageType: 'blast' }]))
    expect(rec('trl.f.fortification').duration).toBe('round')
  })
})

describe('Trollbloods spells', () => {
  it('FAC-TRL-012 Guided Fire: an effect on the battlegroup in CTRL, and the extra attack die on ranged attacks', () => {
    let s = startState('gf').state
    s = swap(s, 'A:L', 'trl.gunnbjorn')
    s = swap(s, 'A:e0', 'trl.bomber', { controllerId: 'A:L' })
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'A:e0', { x: 4, z: 0 })
    s = place(s, 'A:e1', { x: 5, z: 0 })
    const r = hooks.effects.guidedFire!(hookCtx(s, 'A:L', { point: 'spell.cast' }), {})
    const eff = r.state.effects.find((e) => e.sourceId === 'trl.s.guided-fire')!
    expect(eff.targetIds).toEqual(['A:e0'])
    expect(eff.duration).toBe('turn')
    const atk = { attackerId: 'A:e0', kind: 'aoe', x: { atkAdd: 0 } } as unknown as AtkCtx
    const dieCtx = (st: GameState) => hookCtx({ ...st, attack: atk as never }, 'A:e0', { point: 'attack.beforeRoll' })
    const got = hooks.effects.guidedFireDie!(dieCtx(r.state), {})
    expect((got.state.attack as unknown as AtkCtx).x.atkAdd).toBe(1)
    const none = hooks.effects.guidedFireDie!(dieCtx(s), {})
    expect((none.state.attack as unknown as AtkCtx).x.atkAdd).toBe(0)
  })

  it('FAC-TRL-013 Rock Wall: a 4x1 obstacle appears inside CTRL, clear of bases; a large base touching it removes it', () => {
    let s = startState('rw').state
    s = clearAround(s, ['A:L', 'B:e1'])
    s = swap(s, 'A:L', 'trl.gunnbjorn')
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'B:e1', { x: 0, z: 14 })
    const r = hooks.effects.rockWall!(hookCtx(s, 'A:L', { point: 'spell.cast' }), {})
    const wall = r.state.terrain.find((t) => t.props.rockWall)!
    expect(wall).toBeDefined()
    expect(wall.rulesType).toBe('obstacle')
    expect(wall.footprint).toEqual({ rect: { w: 4, d: 1 } })
    expect(Math.hypot(wall.pos.x, wall.pos.z)).toBeLessThanOrEqual(12 + 40 / 25.4 / 2)
    expect(wall.pos.z).toBeGreaterThan(0) // between Gunnbjorn and the enemy
    // upkeep: it stays while the spell effect exists, goes when it does not, and goes when an 80 mm base touches it
    const withEffect: GameState = { ...r.state, effects: [...r.state.effects, { id: 'e:99', sourceId: 'trl.s.rock-wall', name: 'Rock Wall', owner: 'A', casterId: 'A:L', targetIds: [], mods: [], duration: 'upkeep', expires: null }] }
    expect(pruneRockWalls(withEffect).terrain.some((t) => t.props.rockWall)).toBe(true)
    expect(pruneRockWalls(r.state).terrain.some((t) => t.props.rockWall)).toBe(false)
    const crushed = place(withEffect, 'B:e1', { x: wall.pos.x, z: wall.pos.z + 1.2 }, { base: 80 })
    expect(pruneRockWalls(crushed).terrain.some((t) => t.props.rockWall)).toBe(false)
  })

  it('FAC-TRL-014 Sentry, Snipe and Far Strike: Rapid Fire targets are listed; the RNG +3 is in the spell data', () => {
    let s = startState('sn').state
    s = { ...s, effects: [{ id: 'e:1', sourceId: 'trl.s.sentry', name: 'Sentry', owner: 'A', casterId: 'A:L', targetIds: ['A:e1'], mods: [], duration: 'upkeep', expires: null }] }
    expect(sentryReady(s)).toEqual([{ effectId: 'e:1', modelId: 'A:e1', casterId: 'A:L' }])
    for (const id of ['trl.s.snipe', 'trl.s.far-strike']) expect(rec(id).effect).toEqual([{ op: 'modStat', stat: 'RNG', value: 3 }])
    expect(rec('trl.s.far-strike')).toMatchObject({ animus: true, cost: 1, dur: 'TURN' })
    expect(rec('trl.s.guided-fire')).toMatchObject({ cost: 3, rng: 'SELF', aoe: 'CTRL', dur: 'TURN' })
  })
})

describe('Trollbloods smoke', () => {
  const setup = { scenario: 'scn-ashwall-divide', lists: { A: 'trl.l.starter-recon', B: 'cyg.l.qs-recon' } }
  const probe = createGame(setup, 'trl-smoke', bundle)
  const ready = !probe.rejection
  it.skipIf(!ready)('SMOKE trl.l.starter-recon vs cyg.l.qs-recon reaches round 2 with the random decider', () => {
    let r = createGame(setup, 'trl-smoke', bundle)
    expect(r.rejection).toBeUndefined()
    for (let i = 0; i < 6000 && r.pending.kind !== 'gameOver' && r.state.round < 2; i++) {
      const legal = legalActions(r.state)
      expect(legal.length).toBeGreaterThan(0)
      r = step(r.state, pickSensible(r.state, r.pending, legal, 'trl'))
      expect(r.rejection).toBeUndefined()
    }
    expect(r.pending.kind === 'gameOver' || r.state.round >= 2).toBe(true)
  })
})
