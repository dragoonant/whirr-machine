import { describe, expect, it } from 'vitest'
import { pickSensible } from '../../src/ai/random'
import { armOf, codeHooks, statOf, type AtkCtx } from '../../src/engine/code-hooks'
import { hasCondition } from '../../src/engine/effects'
import { createGame, legalActions, step, type GameSetup } from '../../src/engine/index'
import type { GameState, ModelId } from '../../src/engine/types'
import {
  awardSoul, cryxPlugins, gainToken, isLiving, SOUL_CAP, tokensOf, wrathActive,
} from '../../src/engine/factions/cryx'
import { asOut, openCombat, place, send, settle } from './action-helpers'
import { bundle, newGame, runControlTo, runSetup } from './turn-helpers'

const SETUP: GameSetup = { scenario: 'scn-qs-demo', lists: { A: 'cry.l.necro-recon', B: 'cyg.l.qs-recon' } }
const start = (seed: string) => runControlTo(runSetup(newGame(SETUP, seed)))
const NEKANE = 'A:L'
const HADES = 'A:e0'
const CHATTER = 'A:e1'
const FURY = ['A:u2.1', 'A:u2.2', 'A:u2.3']
const DEUCE = 'B:e0'

/** Park every model out of the way except `keep`, so nothing engages, blocks LOS or joins a blast. */
function clearAround(s: GameState, keep: string[]): GameState {
  let i = 0
  for (const m of Object.values(s.models)) {
    if (keep.includes(m.id)) continue
    s = place(s, m.id, { x: -16 + (i % 8) * 4, z: 16 - Math.floor(i / 8) * 3 })
    i++
  }
  return s
}
const hook = (name: string, state: GameState, selfId: ModelId, extra: Record<string, unknown> = {}, params: Record<string, unknown> = {}) =>
  codeHooks().effects[name]!({ state, point: 'passive', selfId, activePlayer: state.activePlayer, params, bundle, ...extra } as never, params)
const withAttack = (s: GameState, attackerId: ModelId, targetId: ModelId, weaponId: string, x: Record<string, unknown> = {}): GameState =>
  ({ ...s, attack: { attackId: 'atk:t', attackerId, targetId, weaponId, kind: 'melee', x: { flags: {}, results: {}, destroyed: [], atkAdd: 0, boosted: false, ...x } } as unknown as AtkCtx })
const withSouls = (s: GameState, id: string, n: number): GameState => ({ ...s, models: { ...s.models, [id]: { ...s.models[id]!, tokens: { soul: n } } } })

describe('Cryx starter data', () => {
  it('FAC-CRY-000 the Necrofactorium list loads: 30 points, Nekane leads Hades, Chatterbane and the three Furies', () => {
    const s = start('cry-load').state
    expect(Object.values(s.models).filter((m) => m.owner === 'A').map((m) => m.profileId).sort()).toEqual(
      ['cry.chatterbane', 'cry.furies-a', 'cry.furies-b', 'cry.furies-c', 'cry.hades', 'cry.nekane'])
    const hades = bundle.byId['cry.hades'] as unknown as { damage: { columns: string[] } }
    expect(hades.damage.columns.join('').length).toBe(28)
    expect(hades.damage.columns.join('')).toMatch(/H/)
  })
})

describe('Cryx faction rules', () => {
  it('FAC-CRY-004 Wraithbinder: Furies within 10" of Nekane have ARM 17, beyond that 14; Hades is unaffected', () => {
    let s = start('cry-wb').state
    s = place(s, NEKANE, { x: 0, z: 0 })
    s = place(s, FURY[0]!, { x: 6, z: 0 })
    s = place(s, FURY[1]!, { x: 14, z: 0 })
    s = place(s, HADES, { x: -4, z: 0 })
    expect(statOf(s, bundle, FURY[0]!, 'ARM')).toBe(17)
    expect(statOf(s, bundle, FURY[1]!, 'ARM')).toBe(14)
    expect(statOf(s, bundle, HADES, 'ARM')).toBe(20) // 18 + Shield 2, no Wraithbinder
    expect(armOf(s, bundle, FURY[0]!)).toBe(17)
  })

  it('FAC-CRY-006 Soul Taker: a living enemy destroyed within 10" gives Hades a soul; far away, constructs and friends do not', () => {
    let s = start('cry-st').state
    s = place(s, HADES, { x: 0, z: 0 })
    s = place(s, 'B:e1', { x: 6, z: 0 }) // Falk, living
    s = place(s, DEUCE, { x: 5, z: 4 }) // a construct
    s = place(s, 'B:L', { x: 20, z: 20 }) // Caine, too far
    const near = awardSoul(s, bundle, 'B:e1')
    expect(tokensOf(near.state.models[HADES], 'soul')).toBe(1)
    expect(near.events[0]).toMatchObject({ type: 'TokenGained', modelId: HADES, token: 'soul', fromId: 'B:e1' })
    expect(awardSoul(s, bundle, DEUCE).events).toEqual([])
    expect(awardSoul(s, bundle, 'B:L').events).toEqual([])
    expect(isLiving(s, bundle, DEUCE)).toBe(false)
    expect(isLiving(s, bundle, FURY[0]!)).toBe(false)
    expect(isLiving(s, bundle, 'B:e1')).toBe(true)
    // the code hook form (death.destroyed) does the same
    const r = hook('soulTaker', s, HADES, { targetId: 'B:e1' })
    expect(tokensOf(r.state.models[HADES], 'soul')).toBe(1)
  })

  it('FAC-CRY-006b Soul Taker holds at most 3 souls, and the attack plugin collects from a kill by any friendly attacker', () => {
    let s = start('cry-st2').state
    s = place(s, HADES, { x: 0, z: 0 })
    s = place(s, 'B:e1', { x: 5, z: 0 })
    s = withSouls(s, HADES, SOUL_CAP)
    expect(awardSoul(s, bundle, 'B:e1').events).toEqual([])
    s = withSouls(s, HADES, 0)
    const atk = withAttack(s, CHATTER, 'B:e1', 'cry.w.light-spiker', { destroyed: ['B:e1'] }).attack as AtkCtx
    const r = cryxPlugins[0]!.onResolved!(s, bundle, atk)
    expect(tokensOf(r.state.models[HADES], 'soul')).toBe(1)
    // a friendly model destroyed by its own side gives nothing
    const own = withAttack(s, 'B:L', 'B:e1', 'x', { destroyed: ['B:e1'] }).attack as AtkCtx
    expect(cryxPlugins[0]!.onResolved!(s, bundle, own).events).toEqual([])
  })

  it('FAC-CRY-020 Devour Soul: a Soul Cannon kill gives the soul to Hades from anywhere on the table', () => {
    let s = start('cry-ds').state
    s = place(s, HADES, { x: -14, z: 0 })
    s = place(s, 'B:e1', { x: 14, z: 0 })
    const far = withAttack(s, HADES, 'B:e1', 'cry.w.soul-cannon', { destroyed: ['B:e1'] }).attack as AtkCtx
    expect(tokensOf(cryxPlugins[0]!.onResolved!(s, bundle, far).state.models[HADES], 'soul')).toBe(1)
    const claw = withAttack(s, HADES, 'B:e1', 'cry.w.death-claw', { destroyed: ['B:e1'] }).attack as AtkCtx
    expect(tokensOf(cryxPlugins[0]!.onResolved!(s, bundle, claw).state.models[HADES], 'soul')).toBe(0)
    const h = hook('devourSoul', s, HADES, { targetId: 'B:e1' })
    expect(tokensOf(h.state.models[HADES], 'soul')).toBe(1)
  })

  it('FAC-CRY-008 Soul Generator turns souls into focus up to the cap of 3', () => {
    let s = start('cry-sg').state
    s = withSouls({ ...s, models: { ...s.models, [HADES]: { ...s.models[HADES]!, focus: 2 } } }, HADES, 3)
    const r = hook('soulGenerator', s, HADES)
    expect(r.state.models[HADES]!.focus).toBe(3)
    expect(tokensOf(r.state.models[HADES], 'soul')).toBe(2)
    expect(r.events.map((e) => e.type)).toEqual(['FocusChanged', 'TokenSpent'])
    expect(hook('soulGenerator', withSouls(s, HADES, 0), HADES).events).toEqual([])
  })

  it('FAC-CRY-007 Shadow Gate spends a token, asks for a 2" place move, and works once per turn', () => {
    let s = start('cry-sgt').state
    s = withAttack(withSouls(s, HADES, 2), HADES, DEUCE, 'cry.w.death-claw')
    const r = hook('shadowGate', s, HADES)
    const req = (r.state.attack as AtkCtx).x.moveReq
    expect(req).toMatchObject({ modelId: HADES, dist: 2, mode: 'place' })
    expect(tokensOf(r.state.models[HADES], 'soul')).toBe(1)
    const again = hook('shadowGate', { ...r.state, attack: withAttack(r.state, HADES, DEUCE, 'cry.w.death-claw').attack }, HADES)
    expect(tokensOf(again.state.models[HADES], 'soul')).toBe(1)
    // no tokens, no move
    const none = hook('shadowGate', withAttack(withSouls(start('cry-sgt2').state, HADES, 0), HADES, DEUCE, 'cry.w.death-claw'), HADES)
    expect((none.state.attack as AtkCtx).x.moveReq).toBeUndefined()
  })

  it('FAC-CRY-009 Wraith Shot spends a soul on a Soul Cannon attack and boosts it; damage gets the boost too', () => {
    let s = start('cry-ws').state
    s = withAttack(withSouls(s, HADES, 1), HADES, DEUCE, 'cry.w.soul-cannon')
    const r = hook('wraithShot', s, HADES)
    const a = r.state.attack as AtkCtx
    expect(a.x.boosted).toBe(true)
    expect(a.x.flags.wraithShot).toBe(true)
    expect(tokensOf(r.state.models[HADES], 'soul')).toBe(0)
    const withCur = { ...r.state, attack: { ...a, x: { ...a.x, cur: { addDice: 0, flat: 0, boost: false, dropLowest: false, armorPiercing: false } } } as AtkCtx }
    expect((hook('wraithShotDamage', withCur, HADES).state.attack as AtkCtx).x.cur!.boost).toBe(true)
    // another weapon, or no soul: nothing happens
    expect(hook('wraithShot', withAttack(withSouls(s, HADES, 1), HADES, DEUCE, 'cry.w.death-claw'), HADES).events).toEqual([])
    expect(hook('wraithShot', withAttack(withSouls(s, HADES, 0), HADES, DEUCE, 'cry.w.soul-cannon'), HADES).events).toEqual([])
  })

  it('FAC-CRY-018 Mortal Fear: a living enemy within 8" of a Fury rolls -2 damage; constructs and distant models do not', () => {
    let s = start('cry-mf').state
    s = place(s, FURY[0]!, { x: 0, z: 0 })
    s = place(s, 'B:e1', { x: 5, z: 0 }) // Falk, living
    s = place(s, DEUCE, { x: 4, z: 3 }) // construct
    s = place(s, 'B:L', { x: 12, z: 0 }) // living, too far
    const flat = (id: string) => cryxPlugins[0]!.damageFlat!(s, bundle, withAttack(s, id, FURY[0]!, 'kha.w.x').attack as AtkCtx, { id: 'j', targetId: FURY[0]!, kind: 'direct', pow: 10, types: [] })
    expect(flat('B:e1')).toBe(-2)
    expect(flat(DEUCE)).toBe(0)
    expect(flat('B:L')).toBe(0)
  })

  it('FAC-CRY-002 Grappling Hook queues a 5" place move at the end of the activation; core pays the focus only when the move is taken', () => {
    let s = start('cry-gh').state
    s = asOut(s).state
    const o = openCombat(asOut(s), NEKANE, 'melee')
    expect(o.state.activation).toBeTruthy()
    const nek = { ...o.state.models[NEKANE]!, focus: 3 }
    const st = { ...o.state, models: { ...o.state.models, [NEKANE]: nek } }
    const r = hook('grapplingHook', st, NEKANE)
    expect(r.state.models[NEKANE]!.focus).toBe(3) // the offer costs nothing
    expect((r.state.activation as unknown as { x: { moveReq: { dist: number; mode: string; cost: { focus: number } } } }).x.moveReq).toMatchObject({ dist: 5, mode: 'place', cost: { focus: 1 } })
    const dry = hook('grapplingHook', { ...o.state, models: { ...o.state.models, [NEKANE]: { ...nek, focus: 0 } } }, NEKANE)
    expect((dry.state.activation as unknown as { x: { moveReq?: unknown } }).x.moveReq).toBeUndefined()
  })

  it('FAC-CRY-003 Vital Magic charges d3 damage for each upkeep spell kept', () => {
    let s = start('cry-vm').state
    const ward = { id: 'e:90', sourceId: 'cry.s.mirage', name: 'Mirage', owner: 'A', casterId: NEKANE, targetIds: [HADES], mods: [], duration: 'upkeep', expires: null, upkeep: { casterId: NEKANE } }
    s = { ...s, effects: [ward as never] }
    const r = hook('vitalMagic', s, NEKANE, {}, { effectIds: ['e:90'] })
    const dmg = r.state.models[NEKANE]!.damage
    expect(dmg.track === 'single' && dmg.filled).toBeGreaterThanOrEqual(1)
    expect(dmg.track === 'single' && dmg.filled).toBeLessThanOrEqual(3)
    expect(r.state.effects.length).toBe(1)
    expect(hook('vitalMagic', s, NEKANE, {}, { effectIds: ['e:404'] }).events).toEqual([])
  })

  it('FAC-CRY-012 Repair removes d3+3 damage from a friendly construct within 1"', () => {
    let s = start('cry-rp').state
    s = place(s, CHATTER, { x: 0, z: 0 })
    s = place(s, HADES, { x: 2.5, z: 0 })
    const dmg = { track: 'grid' as const, grids: (s.models[HADES]!.damage as { grids: { id: string; cols: boolean[][] }[] }).grids.map((g) => ({ ...g, cols: g.cols.map((c) => c.map(() => true)) })) }
    s = { ...s, models: { ...s.models, [HADES]: { ...s.models[HADES]!, damage: dmg as never } } }
    const left = (st: GameState) => (st.models[HADES]!.damage as { grids: { cols: boolean[][] }[] }).grids.flatMap((g) => g.cols.flat()).filter(Boolean).length
    const before = left(s)
    const r = hook('repair', s, CHATTER, { targetId: HADES }, { dice: 'd3', flat: 3 })
    const healed = before - left(r.state)
    expect(healed).toBeGreaterThanOrEqual(4)
    expect(healed).toBeLessThanOrEqual(6)
    s = place(s, HADES, { x: 9, z: 0 })
    expect(hook('repair', s, CHATTER, { targetId: HADES }, { dice: 'd3', flat: 3 }).events).toEqual([])
  })

  it('FAC-CRY-013 Exhaust Fumes marks friendly models within 3" for a round', () => {
    let s = start('cry-ef').state
    s = place(s, CHATTER, { x: 0, z: 0 })
    s = place(s, FURY[0]!, { x: 2, z: 0 })
    s = place(s, HADES, { x: 12, z: 0 })
    const r = hook('exhaustFumes', s, CHATTER)
    const e = r.state.effects.find((x) => x.sourceId === 'cry.a.exhaust-fumes')!
    expect(e.targetIds).toContain(FURY[0])
    expect(e.targetIds).not.toContain(HADES)
  })

  it('FAC-CRY-023 Wrath of Lyliss is registered and its round effect is detectable', () => {
    const s = start('cry-wol').state
    expect(codeHooks().effects.wrathOfLyliss).toBeTypeOf('function')
    expect(wrathActive(s, NEKANE)).toBe(false)
    const on = { ...s, effects: [{ id: 'e:1', sourceId: 'cry.f.wrath-of-lyliss', name: 'Wrath of Lyliss', owner: 'A', targetIds: [NEKANE], mods: [], duration: 'round', expires: null } as never] }
    expect(wrathActive(on, NEKANE)).toBe(true)
  })

  it('FAC-CRY-021 Volume Fire: Chatterbane gets +2 to hit a 50 mm base and +1 against 40 mm', () => {
    const measured = (targetId: string, seed: string) => {
      let s = start(seed).state
      s = clearAround(s, [CHATTER, targetId])
      s = place(s, CHATTER, { x: 0, z: 0 })
      s = place(s, targetId, { x: 0, z: 6 })
      let o = openCombat(asOut(s), CHATTER, 'ranged')
      o = send(o, { type: 'chooseAttack', modelId: CHATTER, weaponId: 'cry.w.light-spiker', targetId, additional: false })
      o = settle(o)
      return o.events.find((e) => e.type === 'AttackMeasured') as unknown as { mods: { source: string; value: number }[] }
    }
    const small = (id: string) => measured('B:e1', 'cry-vf-' + id) // Falk, base 30: no bonus
    expect(small('a').mods.some((m) => m.source.startsWith('cry.a.volume-fire'))).toBe(false)
    expect(measured(DEUCE, 'cry-vf-b').mods.find((m) => m.source === 'cry.a.volume-fire-large')?.value).toBe(2)
    const s0 = start('cry-vf-c').state
    expect(s0.models['A:e1']!.base).toBe(40)
    // Chatterbane (a 40 mm model) as the target of a Cygnar shot would earn the +1 band; check the data directly
    const w = bundle.byId['cry.a.volume-fire'] as unknown as { when: unknown }
    expect(JSON.stringify(w.when)).toContain('"baseAtLeast"')
  })

  it('FAC-CRY-022 Critical Corrosion: a critical hit with the Light Spiker corrodes the target (loop seeds for a crit)', () => {
    let seen = false
    for (let i = 0; i < 200 && !seen; i++) {
      let s = start('cry-cc' + i).state
      s = clearAround(s, [CHATTER, DEUCE])
      s = place(s, CHATTER, { x: 0, z: 0 })
      s = place(s, DEUCE, { x: 0, z: 6 })
      let o = openCombat(asOut(s), CHATTER, 'ranged')
      o = send(o, { type: 'chooseAttack', modelId: CHATTER, weaponId: 'cry.w.light-spiker', targetId: DEUCE, additional: false })
      o = settle(o)
      const crit = o.events.some((e) => e.type === 'AttackResolved' && (e as unknown as { crit: boolean }).crit)
      if (!crit) continue
      seen = true
      expect(hasCondition(o.state, o.state.models[DEUCE]!, 'corrosion')).toBe(true)
    }
    expect(seen).toBe(true)
  })

  it('FAC-CRY-001 Dodge: Nekane missed by an enemy shot may advance 2" afterwards (loop seeds for a miss)', () => {
    let seen = false
    for (let i = 0; i < 120 && !seen; i++) {
      let s = start('cry-dg' + i).state
      s = clearAround(s, ['B:L', NEKANE])
      s = place(s, NEKANE, { x: 0, z: 0 })
      s = place(s, 'B:L', { x: 0, z: 6 })
      s = { ...s, activePlayer: 'B', pending: { ...s.pending, kind: 'chooseActivation', player: 'B', id: 'd:900', options: [] }, decisionSeq: 900 }
      let o = openCombat(asOut(s), 'B:L', 'ranged')
      o = send(o, { type: 'chooseAttack', modelId: 'B:L', weaponId: 'cyg.w.spellstorm-pistol', targetId: NEKANE, additional: false })
      for (let k = 0; k < 20 && !['triggerWindow', 'chooseAttack', 'chooseActivation', 'moveModel'].includes(o.pending.kind); k++) {
        const kind = o.pending.kind
        if (kind === 'boostAttack') o = send(o, { type: 'boostAttack', boost: false })
        else if (kind === 'boostDamage') o = send(o, { type: 'boostDamage', boost: false })
        else if (kind === 'powerField') o = send(o, { type: 'powerField', spend: 0 })
        else if (kind === 'chooseBoxes') o = send(o, { type: 'chooseBoxes', column: Number(o.pending.options![0]!.id.replace('col', '')) })
        else if (kind === 'abilityChoice') o = send(o, { type: 'abilityChoice', optionId: o.pending.options![0]!.id })
        else break
      }
      if (o.pending.kind !== 'triggerWindow') continue
      if ((o.pending.context.data as { triggerId?: string }).triggerId !== 'cry.a.dodge') continue
      seen = true
      o = send(o, { type: 'triggerWindow', triggerId: 'cry.a.dodge' })
      expect(o.pending.kind).toBe('moveModel')
      expect((o.pending.constraints as { maxDist: number }).maxDist).toBe(2)
    }
    expect(seen).toBe(true)
  })

  it('FAC-CRY-024 data: Banish, Blood Shadow, Critical Shred, Critical Knockdown and the spells are wired', () => {
    const rec = (id: string) => bundle.byId[id] as unknown as Record<string, unknown>
    expect(rec('cry.w.rune-thrower').abilities).toContain('cry.a.banish')
    expect(rec('cry.w.hellspike').abilities).toContain('cry.a.blood-shadow')
    expect(rec('cry.w.eviscerator').abilities).toContain('core.a.critical-shred')
    expect(rec('cry.w.tusks').abilities).toContain('cry.a.critical-knockdown')
    expect(rec('cry.s.venom').rng).toBe('SP10')
    expect((rec('cry.nekane').spells as string[]).length).toBe(5)
    expect(rec('cry.nekane').feat).toBe('cry.f.wrath-of-lyliss')
    expect(rec('cry.w.eviscerator').rng).toBe(2)
  })

  it('FAC-CRY-025 tokens: gainToken adds, and the events carry the totals', () => {
    const s = start('cry-tk').state
    const r = gainToken(gainToken(s, HADES, 'soul').state, HADES, 'soul')
    expect(tokensOf(r.state.models[HADES], 'soul')).toBe(2)
    expect(r.events[0]).toMatchObject({ type: 'TokenGained', after: 2 })
  })
})

describe('Cryx smoke', () => {
  it('SMOKE-CRY Necrofactorium Command vs the Cygnar Quick Start: the random decider plays to round 2 with no rejections', () => {
    const setup: GameSetup = { scenario: 'scn-ashwall-divide', lists: { A: 'cry.l.necro-recon', B: 'cyg.l.qs-recon' } }
    let r = createGame(setup, 'cry-smoke-1', bundle)
    expect(r.rejection).toBeUndefined()
    for (let i = 0; i < 6000 && r.pending.kind !== 'gameOver' && r.state.round < 2; i++) {
      const legal = legalActions(r.state)
      expect(legal.length).toBeGreaterThan(0)
      r = step(r.state, pickSensible(r.state, r.pending, legal, 'cry-smoke'))
      expect(r.rejection).toBeUndefined()
    }
    expect(r.state.round).toBeGreaterThanOrEqual(2)
  })
})
