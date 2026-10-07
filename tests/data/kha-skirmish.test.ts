// Khador Skirmish list (docs/spec/90-skirmish.md B.2, WP-D-kha): data values, the 49-point list, and the new rules in play
// (docs/spec/factions/khador.md, Skirmish section). Test ids: SKM-001 (list), DATA-KHA-02x, FAC-KHA-02x.
import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../src/engine/events'
import { codeHooks, knownCodeConditions, statOf } from '../../src/engine/code-hooks'
import type { AtkCtx } from '../../src/engine/code-hooks'
import { khadorPlugins, meanPoints } from '../../src/engine/factions/khador'
import type { GameState } from '../../src/engine/types'
import { loadBundle, modelWeapons } from '../../src/data/index'
import { validateAll } from '../../tools/validate-data'
import { asOut, choose, openCombat, place, send, settle } from '../engine/action-helpers'
import { bundle as engineBundle, newGame, runControlTo, runSetup } from '../engine/turn-helpers'

type Any = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>
const evs = <T extends GameEvent['type']>(es: GameEvent[], t: T): Ev<T>[] => es.filter((e): e is Ev<T> => e.type === t)
const bundle = loadBundle()
const rec = (id: string): Any => bundle.byId[id] as unknown as Any
const hooks = codeHooks()
const plugin = khadorPlugins.find((p) => p.id === 'khador-skirmish')!
const hookCtx = (state: GameState, selfId: string, extra: Record<string, unknown> = {}) =>
  ({ state, point: 'combat.choose', selfId, activePlayer: state.activePlayer, bundle: engineBundle, ...extra }) as never

/**
 * The Khador Skirmish list against itself on Copperline Crossing, at A's first activation choice.
 * Ids: A:L Vilkul, A:e0 Razor, A:e1 Dire Wolf, A:e2 Lazarenko, A:u3.1-3 Hounds, A:u4.1-3 Arkanists, A:u5.1-3 Snipers.
 */
const game = (seed: string): GameState => {
  for (let k = 0; k < 20; k++) {
    const s = runControlTo(runSetup(newGame({ scenario: 'scn-copperline-crossing', lists: { A: 'kha.l.skirmish', B: 'kha.l.skirmish' } }, `${seed}-${k}`))).state
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
/** Open a unit trooper's Combat Action: activate the unit, forfeit Normal Movement, pick the action. */
function openUnit(s: GameState, unit: string, lead: string, choice: string, extra: Record<string, unknown> = {}) {
  let o = choose(asOut(s), unit)
  o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: lead })
  return send(o, { type: 'chooseCombatAction', modelId: lead, choice, ...extra })
}
const filledOf = (s: GameState, id: string): number => {
  const d = s.models[id]!.damage
  return d.track === 'single' ? d.filled : d.grids.reduce((n, g) => n + g.cols.reduce((k, c) => k + c.filter(Boolean).length, 0), 0)
}

describe('Khador Skirmish data', () => {
  it('DATA-KHA-020 the whole data set validates with no error naming a Khador record', () => {
    expect(validateAll().errors.filter((e) => e.includes('kha'))).toEqual([])
  })

  it('SKM-001 kha.l.skirmish: level skirmish, 49 points recomputed, two non-lesser warjacks, FA and character limits hold', () => {
    const l = rec('kha.l.skirmish')
    expect(l).toMatchObject({ faction: 'kha', level: 'skirmish', points: 49, leader: 'kha.vilkul' })
    const cost = l.entries.reduce((n: number, e: Any) => {
      const m = rec(e.profile)
      if (m.type !== 'unit') return n + m.cost
      const min = m.composition.grunts.min + (m.composition.extra ?? []).reduce((a: number, x: Any) => a + x.min, 0)
      return n + (m.composition.costBySize[e.size ?? min] ?? m.cost)
    }, 0)
    expect(cost).toBe(49)
    expect(cost).toBeGreaterThanOrEqual(46)
    expect(cost).toBeLessThanOrEqual(50)
    const jacks = l.entries.map((e: Any) => rec(e.profile)).filter((m: Any) => m.type === 'warEngine' && !m.lesser)
    expect(jacks.map((m: Any) => m.id).sort()).toEqual(['kha.dire-wolf-gun', 'kha.razor'])
    expect(jacks.every((m: Any) => ['light', 'heavy'].includes(m.engineClass))).toBe(true) // no battle engine, colossal or gargantuan
    const seen = new Set<string>()
    for (const e of l.entries) { expect(seen.has(e.profile)).toBe(false); seen.add(e.profile) } // one of each entry
    expect(rec('kha.razor').fa).toBe('C')
    expect(rec('kha.dire-wolf-gun').fa).toBe(4)
    expect(rec('kha.arkanists').fa).toBe(4)
    expect(rec('kha.wk-snipers').fa).toBe(3)
    expect(l.entries.filter((e: Any) => e.advanceDeploy).map((e: Any) => e.profile).sort()).toEqual(['kha.hounds', 'kha.lazarenko', 'kha.wk-snipers'])
  })

  it('SKM-001b the list builds a game on the Skirmish scenario with the whole roster on the table', () => {
    const s = game('kha-skm-1')
    const mine = Object.values(s.models).filter((m) => m.owner === 'A')
    expect(mine.map((m) => m.profileId).sort()).toEqual([
      'kha.arkanist', 'kha.arkanist', 'kha.arkanist', 'kha.dire-wolf-gun', 'kha.hounds-fedyniak', 'kha.hounds-skrobala', 'kha.hounds-tererya',
      'kha.lazarenko', 'kha.razor', 'kha.vilkul', 'kha.wk-sniper', 'kha.wk-sniper', 'kha.wk-sniper',
    ])
    expect(s.models['A:e1']!.profileId).toBe('kha.dire-wolf-gun')
    expect(s.models['A:e1']!.controllerId).toBe('A:L') // the Dire Wolf joins Vilkul's battlegroup
  })

  it('DATA-KHA-021 Dire Wolf: stat line, 30-box grid with a Head system, weapons, abilities, cost 11 (Accuracy 1 + Cannon 5 + Heavy Chain Gun 5)', () => {
    const d = rec('kha.dire-wolf-gun')
    expect(d).toMatchObject({ type: 'warEngine', engineClass: 'heavy', base: 50, cost: 11, fa: 4 })
    expect(d.stats).toEqual({ SPD: 5, MAT: 6, RAT: 4, DEF: 10, ARM: 19 })
    const cols: string[] = d.damage.columns
    expect(cols.map((c) => c.length)).toEqual([4, 5, 6, 6, 5, 4])
    const all = cols.join('')
    expect(all.length).toBe(30)
    for (const [letter, n] of [['L', 3], ['M', 3], ['H', 2], ['C', 3], ['R', 3]] as const) expect(all.split('').filter((c) => c === letter).length, letter).toBe(n)
    expect(rec('kha.w.cannon')).toMatchObject({ type: 'ranged', rng: 12, rof: 1, pow: 15, location: 'R' })
    expect(rec('kha.w.cannon').abilities).toEqual(['core.a.beat-back', 'core.a.critical-knockdown'])
    expect(rec('kha.w.heavy-chain-gun')).toMatchObject({ type: 'ranged', rng: 10, rof: 'd3+1', pow: 12, location: 'L' })
    expect(rec('kha.w.heavy-chain-gun').abilities).toEqual(['kha.a.volley-fire'])
    expect(modelWeapons(bundle, 'kha.dire-wolf-gun').map((w) => w.weapon.id)).toEqual(['kha.w.cannon', 'kha.w.heavy-chain-gun'])
    for (const a of ['core.a.construct', 'core.a.dual-attack', 'kha.a.anchor', 'kha.a.accuracy']) expect(d.abilities).toContain(a)
  })

  it('DATA-KHA-022 Arkanists and Snipers: units of 3 for 4 points, 30 mm, 1 box, stat lines, weapons and abilities', () => {
    expect(rec('kha.arkanists')).toMatchObject({ type: 'unit', cost: 4, fa: 4 })
    expect(rec('kha.arkanists').composition).toMatchObject({ grunts: { profile: 'kha.arkanist', min: 3, max: 3 }, costBySize: { '3': 4 } })
    expect(rec('kha.arkanist')).toMatchObject({ base: 30, damage: { track: 'single', boxes: 1 } })
    expect(rec('kha.arkanist').stats).toMatchObject({ SPD: 6, AAT: 4, DEF: 13, ARM: 13 })
    expect(rec('kha.arkanist').abilities).toEqual(['kha.a.magic-ability', 'kha.a.empower', 'kha.a.sigil-of-power', 'kha.a.razor-wind'])
    expect(rec('kha.w.razor-wind')).toMatchObject({ rng: 10, pow: 12 })
    expect(rec('kha.a.razor-wind').attack).toBe('kha.w.razor-wind')
    expect(rec('kha.wk-snipers')).toMatchObject({ type: 'unit', cost: 4, fa: 3 })
    expect(rec('kha.wk-snipers').composition).toMatchObject({ grunts: { profile: 'kha.wk-sniper', min: 3, max: 3 }, costBySize: { '3': 4 } })
    expect(rec('kha.wk-sniper')).toMatchObject({ base: 30, damage: { track: 'single', boxes: 1 } })
    expect(rec('kha.wk-sniper').stats).toEqual({ SPD: 6, MAT: 4, RAT: 6, DEF: 13, ARM: 13 })
    expect(rec('kha.w.hunting-rifle')).toMatchObject({ type: 'ranged', rng: 14, rof: 1, pow: 10 })
    expect(rec('kha.w.hand-weapon')).toMatchObject({ type: 'melee', rng: 1, pow: 9 })
    expect(rec('kha.wk-sniper').abilities).toEqual(['core.a.advance-deployment', 'kha.a.sniper'])
  })

  it('DATA-KHA-023 every code hook the Khador data names is registered', () => {
    const walk = (n: unknown, f: (x: Any) => void): void => {
      if (Array.isArray(n)) n.forEach((x) => walk(x, f))
      else if (n && typeof n === 'object') { f(n as Any); Object.values(n as Any).forEach((x) => walk(x, f)) }
    }
    for (const r of Object.values(bundle.byId) as Any[]) {
      if (!String(r.id).startsWith('kha.') || !['ability', 'spell', 'feat'].includes(r.recordType)) continue
      walk(r.effect, (n) => { if (typeof n.code === 'string') expect(hooks.effects[n.code] ?? (n.code === 'coreFlag' ? true : undefined), `${r.id} ${n.code}`).toBeTruthy() })
      walk(r.when, (n) => { if (typeof n.code === 'string') expect(knownCodeConditions()).toContain(n.code) })
    }
  })
})

describe('Khador Skirmish rules in play', () => {
  it('FAC-KHA-020 Accuracy: the Dire Wolf shoots at RAT 5 while its Head works and RAT 4 once the Head is crippled', () => {
    const s = game('kha-acc')
    expect(statOf(s, engineBundle, 'A:e1', 'RAT')).toBe(5)
    const hurt = place(s, 'A:e1', s.models['A:e1']!.pos, { crippled: ['H'] } as never)
    expect(statOf(hurt, engineBundle, 'A:e1', 'RAT')).toBe(4)
    expect(statOf(s, engineBundle, 'A:e0', 'RAT')).toBe(6) // Razor has no head fitting
  })

  it('FAC-KHA-021 Volley Fire: a Heavy Chain Gun attack roll against a warrior model is boosted for free and no boost is offered', () => {
    let s = park(game('kha-volley'), ['A:e1', 'B:e0'])
    s = place(s, 'A:e1', { x: 0, z: -4 })
    s = place(s, 'B:e0', { x: 0, z: 4 })
    let o = openCombat(asOut(s), 'A:e1', 'ranged')
    o = send(o, { type: 'chooseAttack', modelId: 'A:e1', weaponId: 'kha.w.heavy-chain-gun', targetId: 'B:e0', additional: false })
    expect(o.pending.kind).not.toBe('boostAttack')
    const boosted = evs(o.events, 'RollBoosted').filter((e) => e.roll === 'attack')
    expect(boosted.length).toBe(1)
    expect(boosted[0]!.source).toBe('effect')
    const atkRoll = evs(o.events, 'DiceRolled').find((e) => e.purpose === 'attack')!
    expect(atkRoll.dice.length).toBe(3) // 2d6 plus the boost die
    settle(o)
  })

  it('FAC-KHA-021b Volley Fire is skipped against a battle engine (not a warrior model), and so is the Cannon (no such rule)', () => {
    let s = park(game('kha-volley2'), ['A:e1', 'B:e0'])
    s = place(s, 'A:e1', { x: 0, z: -4 })
    s = place(s, 'B:e0', { x: 0, z: 4 }, { type: 'battleEngine' } as never)
    let o = openCombat(asOut(s), 'A:e1', 'ranged')
    o = send(o, { type: 'chooseAttack', modelId: 'A:e1', weaponId: 'kha.w.heavy-chain-gun', targetId: 'B:e0', additional: false })
    expect(evs(o.events, 'RollBoosted').filter((e) => e.roll === 'attack')).toEqual([])
    let s2 = park(game('kha-volley3'), ['A:e1', 'B:e0'])
    s2 = place(s2, 'A:e1', { x: 0, z: -4 })
    s2 = place(s2, 'B:e0', { x: 0, z: 4 })
    let o2 = openCombat(asOut(s2), 'A:e1', 'ranged')
    o2 = send(o2, { type: 'chooseAttack', modelId: 'A:e1', weaponId: 'kha.w.cannon', targetId: 'B:e0', additional: false })
    expect(evs(o2.events, 'RollBoosted').filter((e) => e.roll === 'attack')).toEqual([])
  })

  it('FAC-KHA-022 Sniper: a Sniper hit on a high-ARM warjack inflicts exactly 1 point instead of a roll that cannot beat ARM (loop seeds for a hit)', () => {
    expect(meanPoints(2, 10, 19)).toBeLessThan(1)
    let seen = false
    for (let i = 0; i < 60 && !seen; i++) {
      let s = park(game('kha-snip' + i), ['A:u5.1', 'B:e0'])
      s = place(s, 'A:u5.1', { x: 0, z: -6 })
      s = place(s, 'B:e0', { x: 0, z: 4 })
      let o = openUnit(s, 'A:u5', 'A:u5.1', 'ranged')
      o = send(o, { type: 'chooseAttack', modelId: 'A:u5.1', weaponId: 'kha.w.hunting-rifle', targetId: 'B:e0', additional: false })
      o = settle(o)
      const dmg = evs(o.events, 'DamageRolled')
      if (!dmg.length) continue // a miss
      seen = true
      expect(dmg[0]!.points).toBe(1)
      expect(filledOf(o.state, 'B:e0')).toBe(1)
    }
    expect(seen).toBe(true)
  })

  it('FAC-KHA-023 Sniper rule seams: 1 point replaces the roll on a one-box target or below 1 expected damage; Tough is denied on a ranged boxing', () => {
    let s = park(game('kha-snip-plugin'), ['A:u5.1', 'B:u3.1', 'B:u5.1'])
    const rolled = { dice: [3, 4], total: 7, flat: 10, arm: 13, nDice: 2, resist: false }
    const atk = (over: Record<string, unknown> = {}) => ({ attackerId: 'A:u5.1', targetId: 'B:u5.1', kind: 'ranged', x: { cur: { rolled }, flags: {}, results: {}, star: undefined, ...over } }) as unknown as AtkCtx
    const job = { id: 'j', targetId: 'B:u5.1', kind: 'direct' as const, pow: 10, types: [] }
    s = { ...s, attack: atk() } as GameState
    // a one-box trooper: 1 point is a sure kill, so the roll is replaced even when it would also kill
    const r1 = plugin.adjustPoints!(s, engineBundle, atk(), job, 5)
    expect(r1?.points).toBe(1)
    // a multi-box model that the roll beats on average keeps its roll
    const big = place(s, 'B:u5.1', s.models['B:u5.1']!.pos, { damage: { track: 'single', boxes: 5, filled: 0 } } as never)
    expect(plugin.adjustPoints!(big, engineBundle, atk(), job, 5)).toBeNull()
    // a non-Sniper shooter is never replaced
    expect(plugin.adjustPoints!(s, engineBundle, { ...atk(), attackerId: 'A:e0' } as AtkCtx, job, 5)).toBeNull()
    // Tough is denied for a ranged boxing by a Sniper, not for a melee one or another shooter
    expect(plugin.onBoxed!(s, engineBundle, atk(), 'B:u5.1', job)).toEqual({ removeFromPlay: false, denyTough: true })
    expect(plugin.onBoxed!(s, engineBundle, { ...atk(), kind: 'melee' } as AtkCtx, 'B:u5.1', job)).toBeNull()
    expect(plugin.onBoxed!(s, engineBundle, { ...atk(), attackerId: 'A:e0' } as AtkCtx, 'B:u5.1', job)).toBeNull()
  })

  it('FAC-KHA-024 Magic Ability: an Arkanist offers Razor Wind as a star attack and resolves it as an arcane attack at AAT 4', () => {
    expect(engineBundle.byId['kha.a.magic-ability']).toBeDefined()
    let s = park(game('kha-razor-wind'), ['A:u4.1', 'B:e0'])
    s = place(s, 'A:u4.1', { x: 0, z: -4 })
    s = place(s, 'B:e0', { x: 0, z: 4 })
    let o = openUnit(s, 'A:u4', 'A:u4.1', 'specialAttack', { abilityId: 'kha.a.razor-wind' })
    o = send(o, { type: 'chooseAttack', modelId: 'A:u4.1', weaponId: 'kha.w.razor-wind', targetId: 'B:e0', additional: false })
    const measured = evs(o.events, 'AttackMeasured')[0]!
    expect(measured.dice).toBe(2)
    expect(statOf(s, engineBundle, 'A:u4.1', 'AAT')).toBe(4)
    o = settle(o)
    const dmg = evs(o.events, 'DamageRolled')
    if (dmg.length) expect(dmg[0]!.instance.pow).toBe(12)
  })

  it('FAC-KHA-025 Empower: an Arkanist action gives the nearest-in-range warjack with the least focus 1 focus and ends its Disruption', () => {
    let s = park(game('kha-empower'), ['A:u4.1', 'A:e0', 'A:e1'])
    s = place(s, 'A:u4.1', { x: 0, z: -10 })
    s = place(s, 'A:e0', { x: 2, z: -10 }, { focus: 2 } as never)
    s = place(s, 'A:e1', { x: -2, z: -10 }, { focus: 0, conditions: ['disrupted'] } as never)
    const r = hooks.effects.khaEmpower!(hookCtx(s, 'A:u4.1'), {})
    expect(r.state.models['A:e1']!.focus).toBe(1)
    expect(r.state.models['A:e1']!.conditions).not.toContain('disrupted')
    expect(r.state.models['A:e0']!.focus).toBe(2)
    // out of range 6: nothing happens
    const far = place(s, 'A:e1', { x: -14, z: -10 })
    const far2 = place(far, 'A:e0', { x: 14, z: -10 })
    const none = hooks.effects.khaEmpower!(hookCtx(far2, 'A:u4.1'), {})
    expect(none.state.models['A:e1']!.focus).toBe(0)
    expect(none.events).toEqual([])
    // in play: the combat choice exists, takes the Combat Action, and the jack gains the focus
    const o = openUnit(s, 'A:u4', 'A:u4.1', 'specialAction', { abilityId: 'kha.a.empower' })
    expect(o.state.models['A:e1']!.focus).toBe(1)
    expect(o.state.models['A:e1']!.conditions).not.toContain('disrupted')
    expect(o.pending.context.modelId).toBe('A:u4.2') // the star Action used A:u4.1's Combat Action, the next trooper chooses
  })

  it('FAC-KHA-026 Sigil of Power: the friendly unit nearest an enemy makes magical damage for the turn; others do not', () => {
    let s = park(game('kha-sigil'), ['A:u4.1', 'A:u3.1', 'A:u3.2', 'A:u3.3', 'A:e2', 'B:e0'])
    s = place(s, 'A:u4.1', { x: 0, z: -10 })
    s = place(s, 'A:u3.1', { x: 3, z: -8 })
    s = place(s, 'A:u3.2', { x: 4, z: -8 })
    s = place(s, 'A:u3.3', { x: 5, z: -8 })
    s = place(s, 'A:e2', { x: -3, z: -12 })
    s = place(s, 'B:e0', { x: 4, z: 0 })
    const r = hooks.effects.khaSigilOfPower!(hookCtx(s, 'A:u4.1'), {})
    const eff = r.state.effects.find((e) => e.sourceId === 'kha.a.sigil-of-power')!
    expect(eff.targetIds.sort()).toEqual(['A:u3.1', 'A:u3.2', 'A:u3.3']) // the whole Hound unit, nearest the enemy
    const types = (id: string) => plugin.damageTypes!(r.state, engineBundle, { attackerId: id } as unknown as AtkCtx)
    expect(types('A:u3.1')).toEqual(['magical'])
    expect(types('A:e2')).toEqual([])
    expect(plugin.damageTypes!(s, engineBundle, { attackerId: 'A:u3.1' } as unknown as AtkCtx)).toEqual([]) // no effect, no change
  })

  it('FAC-KHA-027 Razor Wind critical: a crit on a warjack fills the unmarked boxes of the last column damaged; no crit, no fill', () => {
    let s = park(game('kha-rw-crit'), ['A:u4.1', 'B:e0'])
    const target = s.models['B:e0']!
    expect(target.damage.track).toBe('grid')
    const atk = (crit: boolean, column?: number) => ({
      attackerId: 'A:u4.1', targetId: 'B:e0', kind: 'arcane',
      x: { cur: { rolled: undefined }, flags: column ? { column } : {}, results: { 'B:e0': { hit: true, crit } }, star: 'kha.a.razor-wind' },
    }) as unknown as AtkCtx
    const job = { id: 'j', targetId: 'B:e0', kind: 'direct' as const, pow: 12, types: [] }
    s = { ...s, attack: atk(true, 5) } as GameState
    const cols = (rec(target.profileId).damage.columns as string[])
    // column 5 has cols[4].length boxes: 2 points mark two of them, the crit fills the rest of that column
    const r = plugin.adjustPoints!(s, engineBundle, atk(true, 5), job, 2)!
    expect(r.points).toBe(cols[4]!.length)
    expect((r.state.attack as unknown as AtkCtx).x.flags.column).toBe(5)
    // overflow into the next column: the last column damaged is the one filled last
    const r2 = plugin.adjustPoints!(s, engineBundle, atk(true, 5), job, cols[4]!.length + 1)!
    expect(r2.points).toBe(cols[4]!.length + cols[5]!.length)
    // no crit: untouched
    expect(plugin.adjustPoints!(s, engineBundle, atk(false, 5), job, 2)).toBeNull()
    // a column rolled here when none was chosen
    const r3 = plugin.adjustPoints!(s, engineBundle, atk(true), job, 1)!
    expect(r3.events.length).toBe(1)
    expect(r3.points).toBeGreaterThanOrEqual(1)
  })
})
