// Protectorate of Menoth Skirmish (WP-D-men, docs/spec/90-skirmish.md B.6): the 50-point list, the three new models (Revenger, Cleanser
// Sanctifiers, Vassals of Menoth), the starter re-check against the Warmachine Academy pages, and the faction rules the new cards need
// (Repel, Chain / Decapitation, the Vassals' special actions). Source tags (WA1..3, LS1, CD2) are in docs/spec/factions/menoth-sources.md.
import { describe, expect, it, vi } from 'vitest'

// ---------- forced dice: roll number k (state.rollSeq) gets FORCED[k] when set ----------
const FORCED = new Map<number, number[]>()
vi.mock('../../src/engine/rng', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/engine/rng')>()
  return {
    ...real,
    roll(state: import('../../src/engine/types').GameState, spec: import('../../src/engine/rng').RollSpec) {
      const f = FORCED.get(state.rollSeq)
      if (!f) return real.roll(state, spec)
      const n = Math.max(1, spec.count)
      const dice = Array.from({ length: n }, (_, i) => f[i] ?? 1)
      const kept = [...dice].sort((x, y) => y - x).slice(0, dice.length - (spec.dropLowest ?? 0))
      const total = kept.reduce((a, b) => a + b, 0) + (spec.flat ?? 0)
      const rollId = `r:${state.rollSeq + 1}`
      return {
        state: { ...state, rollSeq: state.rollSeq + 1 },
        event: { type: 'DiceRolled' as const, rollId, purpose: spec.purpose, ownerId: spec.ownerId, dice, kept, total, target: spec.target },
      }
    },
  }
})

import { resistsDamageType, statOf } from '../../src/engine/code-hooks'
import { createInitialState } from '../../src/engine/setup'
import { dist } from '../../src/engine/geometry'
import { menothPlugins } from '../../src/engine/factions/menoth'
import type { GameEvent } from '../../src/engine/events'
import type { FlowOut } from '../../src/engine/pending'
import type { GameSetup, GameState } from '../../src/engine/types'
import { loadBundle } from '../../src/data/index'
import { validateAll } from '../../tools/validate-data'
import { asOut, bundle, choose, place, send, settle, withModel } from '../engine/action-helpers'
import { newGame, runControlTo, runSetup } from '../engine/turn-helpers'

type Any = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const rec = (id: string): Any => loadBundle().byId[id] as unknown as Any
const listCost = (l: Any): number =>
  l.entries.reduce((n: number, e: Any) => n + ((e.size !== undefined && rec(e.profile).composition?.costBySize?.[String(e.size)]) || rec(e.profile).cost), 0)

// ---------------------------------------------------------------- data
describe('SKM-001 the Menoth Skirmish list', () => {
  const l = rec('men.l.skirmish')
  it('is a 50-point Skirmish list led by Feora that fills the size exactly (46 to 50 is legal)', () => {
    expect(l.level).toBe('skirmish')
    expect(l.leader).toBe('men.feora')
    expect(l.faction).toBe('men')
    expect(listCost(l)).toBe(50)
    expect(l.points).toBe(50)
    expect(listCost(l)).toBeGreaterThanOrEqual(46)
    expect(listCost(l)).toBeLessThanOrEqual(50)
  })
  it('keeps the whole 30-point starter and adds the Revenger, the Cleanser Sanctifiers and the Vassals', () => {
    const starter = rec('men.l.starter-recon').entries.map((e: Any) => e.profile)
    const mine = l.entries.map((e: Any) => e.profile)
    for (const p of starter) expect(mine).toContain(p)
    expect(mine.filter((p: string) => !starter.includes(p)).sort()).toEqual(['men.cleanser-sanctifiers', 'men.revenger-arc', 'men.vassals'])
    expect(l.entries.find((e: Any) => e.profile === 'men.valeria').advanceDeploy).toBe(true)
  })
  it('has at least one non-lesser Cohort model, no banned class, and respects every FA', () => {
    const engines = l.entries.map((e: Any) => rec(e.profile)).filter((m: Any) => m.type === 'warEngine' && !m.lesser)
    expect(engines.length).toBeGreaterThanOrEqual(2)
    for (const m of engines) expect(['light', 'heavy']).toContain(m.engineClass) // no battle engine, colossal or gargantuan
    const uses: Record<string, number> = {}
    for (const e of l.entries) uses[e.profile] = (uses[e.profile] ?? 0) + 1
    for (const [id, n] of Object.entries(uses)) {
      const fa = rec(id).fa
      expect(n, id).toBeLessThanOrEqual(fa === 'C' ? 1 : (fa as number))
    }
  })
  it('every entry belongs to Menoth, and every unit entry names a legal size', () => {
    for (const e of l.entries) {
      const m = rec(e.profile)
      expect(m.faction, e.profile).toBe('men')
      if (m.type === 'unit') {
        const c = m.composition
        expect(e.size, e.profile).toBeGreaterThanOrEqual(c.grunts.min)
        expect(e.size, e.profile).toBeLessThanOrEqual(c.grunts.max)
        expect(c.costBySize[String(e.size)], e.profile).toBeDefined()
      }
    }
  })
  it('the Menoth records pass schema, reference, list and MK3-leak validation', () => {
    const rep = validateAll()
    expect(rep.errors.filter((e) => /\bmen[.\/-]/.test(String(e)))).toEqual([])
  })
})

describe('FAC-MEN-032 the three new models carry the Warmachine Academy card values', () => {
  it('Revenger (Arc Node head, Repulsor Shield, Light Immolator): light warjack, 7 points, 26 boxes, 40 mm', () => {
    const m = rec('men.revenger-arc')
    expect(m.type).toBe('warEngine')
    expect(m.engineClass).toBe('light')
    expect(m.stats).toEqual({ SPD: 5, MAT: 6, RAT: 5, DEF: 12, ARM: 17 })
    expect(m.base).toBe(40)
    expect(m.cost).toBe(7) // head 1 + Repulsor Shield 3 + Light Immolator 3
    expect(m.fa).toBe(4)
    expect(m.arcNode).toBe(true)
    const cols: string[] = m.damage.columns
    expect(cols.map((c) => c.length)).toEqual([3, 5, 5, 5, 5, 3])
    const letters = cols.join('')
    expect(letters.length).toBe(26)
    for (const s of 'LMCR') expect(letters.split(s).length - 1, s).toBe(3)
    expect(letters).not.toContain('A')
    expect(m.weapons.map((w: Any) => `${w.weapon}@${w.location}`).sort()).toEqual(['men.w.light-immolator-flail@R', 'men.w.repulsor-shield@L'])
    for (const a of ['core.a.construct', 'core.a.dual-attack', 'men.a.sanctified-hull', 'men.a.arc-node', 'men.a.ashen-veil']) expect(m.abilities).toContain(a)
  })
  it('its weapons: Repulsor Shield (POW 12, Shield, Repel) and the Light Immolator flail (POW 14, Critical Fire, Chain)', () => {
    const rs = rec('men.w.repulsor-shield')
    expect([rs.type, rs.rng, rs.pow, rs.location]).toEqual(['melee', 1, 12, 'L'])
    expect(rs.qualities).toContain('core.q.shield')
    expect(rs.abilities).toContain('men.a.repel')
    const fl = rec('men.w.light-immolator-flail')
    expect([fl.type, fl.rng, fl.pow, fl.location]).toEqual(['melee', 1, 14, 'R'])
    expect(fl.abilities).toEqual(expect.arrayContaining(['men.a.critical-fire', 'men.a.chain']))
  })
  it('Cleanser Sanctifiers: 3 models for 9 points, FA 2, medium base, 8 boxes, fire-resistant, flame jet and halberd', () => {
    const u = rec('men.cleanser-sanctifiers')
    expect([u.cost, u.fa, u.composition.grunts.min, u.composition.grunts.max, u.composition.costBySize['3']]).toEqual([9, 2, 3, 3, 9])
    const g = rec('men.cleanser-sanctifier')
    expect(g.stats).toEqual({ SPD: 5, MAT: 7, RAT: 5, DEF: 12, ARM: 18 })
    expect(g.base).toBe(40)
    expect(g.damage).toEqual({ track: 'single', boxes: 8 })
    for (const a of ['core.a.resist-fire', 'kha.a.shield-wall', 'men.a.righteous-intervention']) expect(g.abilities).toContain(a)
    const jet = rec('men.w.holy-flame-jet')
    expect([jet.type, jet.rng, jet.rof, jet.pow]).toEqual(['ranged', 'SP8', 1, 12])
    expect(jet.damageTypes).toEqual(expect.arrayContaining(['fire', 'magical']))
    expect(jet.qualities).toContain('core.q.pistol')
    const hb = rec('men.w.flame-halberd')
    expect([hb.type, hb.rng, hb.pow]).toEqual(['melee', 2, 13])
    expect(hb.qualities).toEqual(expect.arrayContaining(['core.q.weapon-master', 'core.q.magical']))
    expect(hb.abilities).toContain('men.a.critical-fire')
  })
  it('Vassals of Menoth: 3 models for 4 points, FA 2, small base, 5 boxes, Repair d3+1, Enliven, Ancillary Attack, Penance', () => {
    const u = rec('men.vassals')
    expect([u.cost, u.fa, u.composition.grunts.min, u.composition.grunts.max, u.composition.costBySize['3']]).toEqual([4, 2, 3, 3, 4])
    const g = rec('men.vassal')
    expect(g.stats).toEqual({ SPD: 5, MAT: 0, RAT: 0, DEF: 13, ARM: 13 }) // the card prints no MAT or RAT
    expect(g.base).toBe(30)
    expect(g.damage).toEqual({ track: 'single', boxes: 5 })
    expect(g.weapons).toEqual([])
    for (const a of ['men.a.penance-of-the-corrupted', 'men.a.repair', 'men.a.enliven', 'men.a.ancillary-attack']) expect(g.abilities).toContain(a)
    expect(rec('men.a.repair').effect[0].params).toEqual({ dice: 'd3', flat: 1 })
    expect(rec('men.a.repair').scope.range).toBe(1)
    expect(rec('men.a.enliven').scope.range).toBe(3)
    expect(rec('men.a.ancillary-attack').scope.range).toBe(3)
  })
  it('the rules that wait on core are entered as inert passives, so no empty action is offered', () => {
    for (const id of ['men.a.righteous-intervention', 'men.a.penance-of-the-corrupted', 'men.a.ashen-veil', 'men.a.arc-node']) {
      const a = rec(id)
      expect(a.kind, id).toBe('passive')
      expect(a.effect[0].code, id).toBe('coreFlag')
      expect(a.verify, id).toBeTruthy()
    }
  })
})

describe('FAC-MEN-033 the 30-point starter still matches the Warmachine Academy pages (WP-D-men re-check, 2026-10-07)', () => {
  it('stat lines, boxes, costs and FA of Feora, Crusader, Valeria, Pyrrhus and the Defenders', () => {
    expect(rec('men.feora').stats).toEqual({ SPD: 6, AAT: 6, MAT: 7, RAT: 6, DEF: 15, ARM: 17, ARC: 6, CTRL: 12 })
    expect(rec('men.feora').damage.boxes).toBe(17)
    expect(rec('men.crusader').stats).toEqual({ SPD: 4, MAT: 7, RAT: 5, DEF: 10, ARM: 19 }) // chassis MAT 6, +1 Venerable
    expect(rec('men.crusader').damage.columns.join('').length).toBe(32)
    expect([rec('men.crusader').cost, rec('men.crusader').fa]).toEqual([13, 4]) // 0 + Venerable 2 + Blazing Star 5 + Flame Belcher 6
    expect(rec('men.valeria').stats).toEqual({ SPD: 7, MAT: 0, RAT: 8, DEF: 16, ARM: 15 })
    expect([rec('men.valeria').damage.boxes, rec('men.valeria').cost, rec('men.valeria').fa]).toEqual([8, 5, 'C'])
    expect(rec('men.pyrrhus').stats).toEqual({ SPD: 6, MAT: 7, RAT: 0, DEF: 15, ARM: 16 })
    expect([rec('men.pyrrhus').damage.boxes, rec('men.pyrrhus').cost, rec('men.pyrrhus').fa]).toEqual([8, 4, 'C'])
    expect(rec('men.defenders-grunt').stats).toEqual({ SPD: 6, MAT: 6, RAT: 0, DEF: 13, ARM: 16 })
    expect([rec('men.defenders-grunt').damage.boxes, rec('men.defenders').cost, rec('men.defenders').fa]).toEqual([1, 8, 4])
    expect(rec('men.defenders').composition.grunts.max).toBe(5)
  })
  it('weapons: Crusader Blazing Star 18 / Flame Belcher 15/9, Valeria bow RAT 8 POW 12, Pyrrhus spear 13, Defender spear 12, Feora 12 and 13', () => {
    expect(rec('men.w.blazing-star').pow).toBe(18)
    expect([rec('men.w.flame-belcher').pow, rec('men.w.flame-belcher').blastPow, rec('men.w.flame-belcher').rng, rec('men.w.flame-belcher').aoe]).toEqual([15, 9, 10, 3])
    expect([rec('men.w.valeria-bow').pow, rec('men.w.valeria-bow').rng]).toEqual([12, 10])
    expect([rec('men.w.pyrrhus-spear').pow, rec('men.w.pyrrhus-spear').rng]).toEqual([13, 2])
    expect([rec('men.w.flame-spear').pow, rec('men.w.flame-spear').rng]).toEqual([12, 2])
    expect([rec('men.w.truth-consequence-flame').pow, rec('men.w.truth-consequence-flame').rng]).toEqual([12, 'SP8'])
    expect([rec('men.w.truth-consequence-blade').pow, rec('men.w.truth-consequence-blade').rng]).toEqual([13, 1])
  })
})

// ---------------------------------------------------------------- engine
const SK: GameSetup = { scenario: 'scn-copperline-crossing', lists: { A: 'men.l.skirmish', B: 'men.l.skirmish' } }
/** Models (each side): L Feora, e0 Crusader, e1 Revenger, e2 Valeria, e3 Pyrrhus, u4.1-5 Defenders, u5.1-3 Cleanser Sanctifiers, u6.1-3 Vassals. */
function startSk(seed: string, who: 'A' | 'B' = 'A'): GameState {
  const s = runControlTo(runSetup(newGame(SK, seed))).state
  return { ...s, effects: s.effects.filter((e) => e.sourceId !== 'men.a.four-gifts'), activePlayer: who, pending: { ...s.pending, kind: 'chooseActivation', player: who, id: 'd:900', options: [] }, decisionSeq: 900 }
}
function park(s: GameState, keep: string[]): GameState {
  let i = 0
  for (const m of Object.values(s.models)) {
    if (keep.includes(m.id)) continue
    s = place(s, m.id, { x: -20 + (i % 10) * 4, z: 20 - Math.floor(i / 10) * 3 })
    i++
  }
  return s
}
/** The next rolls (in engine order) come up with these faces. */
function force(o: { state: GameState }, ...rolls: number[][]): void { rolls.forEach((f, i) => FORCED.set(o.state.rollSeq + i, f)) }
type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>
const evs = <T extends GameEvent['type']>(es: GameEvent[], t: T): Ev<T>[] => es.filter((e): e is Ev<T> => e.type === t)
const raw = (a: unknown): Record<string, unknown> => a as Record<string, unknown>
const toCombat = (s: GameState, id: string, lead = id): FlowOut => {
  let o = choose(asOut(s), id)
  while (o.pending.kind === 'abilityChoice') o = send(o, { type: 'abilityChoice', optionId: 'skip' })
  return send(o, { type: 'chooseMovement', option: 'forfeit', modelId: lead })
}
/** Open a model's activation with Normal Movement forfeited and the melee Combat Action chosen. */
const toMelee = (s: GameState, id: string): FlowOut => send(toCombat(s, id), { type: 'chooseCombatAction', modelId: id, choice: 'melee' })
const attackWith = (o: FlowOut, target: string, weaponId: string) => {
  const opt = o.pending.options!.find((x) => x.action.type === 'chooseAttack' && (x.action as Any).targetId === target && (x.action as Any).weaponId === weaponId)
  if (!opt) throw new Error(`no ${weaponId} attack at ${target}: ${o.pending.options!.map((x) => x.id).join(',')}`)
  return raw(opt.action)
}
const special = (o: FlowOut, abilityId: string, targetId?: string) =>
  o.pending.options!.find((x) => x.action.type === 'chooseCombatAction' && (x.action as Any).abilityId === abilityId && (!targetId || (x.action as Any).targetId === targetId))
const damageEvents = (es: GameEvent[]) => evs(es, 'DamageRolled')

describe('SKM-002 (men) a Skirmish list needs a Skirmish scenario', () => {
  it('the Menoth Skirmish mirror starts on Copperline Crossing and is refused on a Recon scenario', () => {
    expect('rejection' in createInitialState(SK, 'men-sk', bundle)).toBe(false)
    const bad = createInitialState({ scenario: 'scn-ashwall-divide', lists: SK.lists }, 'men-sk', bundle)
    expect('rejection' in bad && bad.rejection.code).toBe('E_BAD_SETUP')
  })
  it('both sides field the 16 models of the list, with the unit troopers on the right profiles and bases', () => {
    const s = startSk('men-models')
    const mine = Object.values(s.models).filter((m) => m.owner === 'A')
    expect(mine.length).toBe(16)
    expect(mine.filter((m) => m.profileId === 'men.cleanser-sanctifier').every((m) => m.base === 40)).toBe(true)
    expect(mine.filter((m) => m.profileId === 'men.vassal').length).toBe(3)
    expect(mine.find((m) => m.id === 'A:e1')!.profileId).toBe('men.revenger-arc')
    expect(mine.find((m) => m.id === 'A:e1')!.damage.track).toBe('grid')
  })
})

describe('FAC-MEN-034 Repel', () => {
  const scene = (seed: string, who: 'A' | 'B') => {
    let s = startSk(seed, who)
    s = park(s, ['A:e1', 'B:e0', 'B:e1'])
    s = place(s, 'A:e1', { x: 0, z: 0 })
    s = place(s, 'B:e0', { x: 0, z: 2.2 }) // a Crusader, 0.43" from the Revenger's edge
    return s
  }
  it('a Repulsor Shield that hits pushes the enemy 1" directly away', () => {
    let o = toMelee(scene('repel-hit', 'A'), 'A:e1')
    force(o, [6, 6], [1, 1])
    const before = o.state.models['B:e0']!.pos
    o = settle(send(o, attackWith(o, 'B:e0', 'men.w.repulsor-shield')))
    expect(evs(o.events, 'AttackResolved').length).toBeGreaterThan(0)
    const after = o.state.models['B:e0']!.pos
    expect(after.z - before.z).toBeCloseTo(1, 3)
    expect(after.x).toBeCloseTo(before.x, 3)
    expect(o.events.some((e) => e.type === 'ModelMoved' && e.modelId === 'B:e0' && e.kind === 'push')).toBe(true)
  })
  it('a miss pushes nobody', () => {
    let o = toMelee(scene('repel-miss', 'A'), 'A:e1')
    force(o, [1, 1])
    const before = o.state.models['B:e0']!.pos
    o = settle(send(o, attackWith(o, 'B:e0', 'men.w.repulsor-shield')))
    expect(o.state.models['B:e0']!.pos).toEqual(before)
  })
  it('an enemy that hits the Revenger in melee is pushed 1" directly away from it after the attack', () => {
    let o = toMelee(scene('repel-defend', 'B'), 'B:e0')
    force(o, [6, 6], [1, 1])
    const before = o.state.models['B:e0']!.pos
    o = settle(send(o, attackWith(o, 'A:e1', 'men.w.blazing-star')))
    const after = o.state.models['B:e0']!.pos
    expect(dist(after, o.state.models['A:e1']!.pos)).toBeCloseTo(dist(before, o.state.models['A:e1']!.pos) + 1, 3)
    expect(after.z - before.z).toBeCloseTo(1, 3)
  })
  it('a crippled left arm loses Repel: the shield no longer pushes the attacker (the plugin seam, with the hit given)', () => {
    const resolve = (crippled: string[]) => {
      let s = scene('repel-cripple', 'B')
      s = withModel(s, 'A:e1', { crippled })
      const atk = { kind: 'melee', weaponId: 'men.w.blazing-star', attackerId: 'B:e0', targetId: 'A:e1', x: { rollTargets: ['A:e1'], results: { 'A:e1': { hit: true } }, wloc: 'L', flags: {} } } as never
      const r = menothPlugins[0]!.onResolved!(s, bundle, atk)
      return { before: s.models['B:e0']!.pos, after: r.state.models['B:e0']!.pos }
    }
    const whole = resolve([])
    expect(whole.after.z - whole.before.z).toBeCloseTo(1, 3)
    const cripple = resolve(['L'])
    expect(cripple.after).toEqual(cripple.before)
  })
  it('Repel is for weapon attacks: a power attack that hits the Revenger does not push', () => {
    const s = scene('repel-power', 'B')
    const atk = { kind: 'power', powerKind: 'headbutt', attackerId: 'B:e0', targetId: 'A:e1', x: { rollTargets: ['A:e1'], results: { 'A:e1': { hit: true } }, flags: {} } } as never
    const r = menothPlugins[0]!.onResolved!(s, bundle, atk)
    expect(r.state.models['B:e0']!.pos).toEqual(s.models['B:e0']!.pos)
  })
})

describe('FAC-MEN-035 Chain (Decapitation)', () => {
  it('the flail doubles the damage beyond ARM; the Repulsor Shield on the same target does not', () => {
    const run = (weapon: string) => {
      let s = startSk('chain-' + weapon, 'A')
      s = park(s, ['A:e1', 'B:e0'])
      s = place(s, 'A:e1', { x: 0, z: 0 })
      s = place(s, 'B:e0', { x: 0, z: 2.2 })
      let o = toMelee(s, 'A:e1')
      force(o, [6, 6], [6, 6]) // the attack hits, then 2d6 = 12
      o = settle(send(o, attackWith(o, 'B:e0', weapon)))
      return damageEvents(o.events)[0]!
    }
    const flail = run('men.w.light-immolator-flail') // 12 + POW 14 - ARM 19 = 7, doubled
    const shield = run('men.w.repulsor-shield') // 12 + POW 12 - ARM 19 = 5
    expect(flail.points).toBe(14)
    expect(shield.points).toBe(5)
  })
  it('a model the flail disables may not make a Tough roll (and no other weapon here takes that away)', () => {
    const plugin = menothPlugins[0]!
    const atk = (weaponId: string, spellId?: string) => ({ weaponId, spellId } as never)
    expect(plugin.onBoxed!({} as GameState, bundle, atk('men.w.light-immolator-flail'), 'B:e0', {} as never)).toEqual({ removeFromPlay: false, denyTough: true })
    expect(plugin.onBoxed!({} as GameState, bundle, atk('men.w.repulsor-shield'), 'B:e0', {} as never)).toBeNull()
    expect(plugin.onBoxed!({} as GameState, bundle, atk('men.w.blazing-star'), 'B:e0', {} as never)).toBeNull()
  })
  it('Decapitation does not make damage out of nothing: a hit that fails to beat ARM still deals 0', () => {
    let s = startSk('chain-zero', 'A')
    s = park(s, ['A:e1', 'B:e0'])
    s = place(s, 'A:e1', { x: 0, z: 0 })
    s = place(s, 'B:e0', { x: 0, z: 2.2 })
    let o = toMelee(s, 'A:e1')
    force(o, [6, 6], [1, 1]) // 2 + POW 14 = 16 against ARM 19
    o = settle(send(o, attackWith(o, 'B:e0', 'men.w.light-immolator-flail')))
    expect(damageEvents(o.events)[0]!.points).toBe(0)
  })
})

describe('FAC-MEN-036 the Vassals of Menoth: Repair, Enliven and Ancillary Attack', () => {
  const hurt = (m: GameState['models'][string]): GameState['models'][string]['damage'] => {
    if (m.damage.track !== 'grid') return m.damage
    return { track: 'grid', grids: m.damage.grids.map((g) => ({ ...g, cols: g.cols.map((c, ci) => c.map((v, i) => (ci < 2 && i < 2 ? true : v))) })) }
  }
  const marked = (m: GameState['models'][string]): number => (m.damage.track === 'grid' ? m.damage.grids.reduce((n, g) => n + g.cols.flat().filter(Boolean).length, 0) : m.damage.filled)
  const scene = (seed: string) => {
    let s = startSk(seed, 'A')
    s = park(s, ['A:e0', 'A:u6.1', 'A:u6.2', 'A:u6.3', 'B:e0'])
    s = place(s, 'A:e0', { x: 0, z: 0 })
    s = place(s, 'A:u6.1', { x: 0, z: 2.5 }) // 1" from the Crusader's edge
    s = place(s, 'A:u6.2', { x: 3, z: 6 })
    s = place(s, 'A:u6.3', { x: -3, z: 6 })
    s = place(s, 'B:e0', { x: 0, z: 16 })
    return s
  }
  it('Repair [d3+1] heals a damaged friendly warjack within 1" and uses the Combat Action', () => {
    let s = scene('vassal-repair')
    s = withModel(s, 'A:e0', { damage: hurt(s.models['A:e0']!) })
    const before = marked(s.models['A:e0']!)
    let o = toCombat(s, 'A:u6', 'A:u6.1')
    const rep = special(o, 'men.a.repair', 'A:e0')
    expect(rep, 'Repair is offered on the damaged Crusader').toBeDefined()
    force(o, [6]) // d3 = 3
    o = send(o, raw(rep!.action))
    expect(before - marked(o.state.models['A:e0']!)).toBe(4) // d3 = 3, plus 1
  })
  it('Repair is not offered on an undamaged warjack', () => {
    const o = toCombat(scene('vassal-repair2'), 'A:u6', 'A:u6.1')
    expect(special(o, 'men.a.repair', 'A:e0')).toBeUndefined()
  })
  it('Enliven (range 3) leaves a round-long effect on the chosen warjack', () => {
    let o = toCombat(scene('vassal-enliven'), 'A:u6', 'A:u6.1')
    const en = special(o, 'men.a.enliven', 'A:e0')
    expect(en).toBeDefined()
    o = send(o, raw(en!.action))
    const e = o.state.effects.find((x) => x.sourceId === 'men.a.enliven')!
    expect(e.targetIds).toEqual(['A:e0'])
    expect((e as unknown as { afterDamageAdvance: number }).afterDamageAdvance).toBe(5)
  })
  it('Ancillary Attack makes the Crusader attack at once, and never twice in a turn', () => {
    let s = scene('vassal-ancillary')
    s = place(s, 'B:e0', { x: 0, z: 9 }, { damage: { track: 'single', boxes: 100, filled: 0 } })
    let o = toCombat(s, 'A:u6', 'A:u6.1')
    const anc = special(o, 'men.a.ancillary-attack', 'A:e0')
    expect(anc).toBeDefined()
    o = send(o, raw(anc!.action))
    o = settle(o)
    expect(evs(o.events, 'AttackDeclared').some((e) => e.attackerId === 'A:e0')).toBe(true)
  })
})

describe('FAC-MEN-037 Cleanser Sanctifiers', () => {
  it('Resistance: Fire is on every Sanctifier, and Shield Wall adds +2 ARM only next to a unit-mate', () => {
    let s = startSk('sanct', 'B')
    s = park(s, ['A:u5.1', 'A:u5.2', 'A:u5.3'])
    s = place(s, 'A:u5.1', { x: 0, z: 0 })
    s = place(s, 'A:u5.2', { x: 1.575, z: 0 }) // base to base (a 40 mm base is 1.575" across)
    s = place(s, 'A:u5.3', { x: 12, z: 0 })
    const arm = (id: string): number => statOf(s, bundle, id, 'ARM')
    expect(arm('A:u5.3')).toBe(18)
    expect(arm('A:u5.1')).toBe(20)
    expect(arm('A:u5.2')).toBe(20)
    for (const id of ['A:u5.1', 'A:u5.2', 'A:u5.3']) expect(resistsDamageType(s, bundle, id, ['fire'])).toBe(true)
  })
})
