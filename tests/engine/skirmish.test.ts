// 90-skirmish E: the 50 point game size in the engine (E1 level caps, S3 Copperline Crossing deployment, scoring and Kill Box).
// The real *-skirmish lists come from the faction data packages, so the engine tests build ad hoc skirmish lists out of existing
// starter profiles in a copy of the bundle: buildArmy checks cost, level and the Cohort rule, not faction or FA.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data/index'
import { createGame } from '../../src/engine/index'
import { baseRadius } from '../../src/engine/geometry'
import { computeControl, endOfTurnScoring, inKillBox, killBoxActive, scenarioDef, scoringActive } from '../../src/engine/scenario'
import { LEVEL_CAP, answerSetup, buildArmy, createInitialState, deploymentZone } from '../../src/engine/setup'
import type { DataBundle, GameSetup, GameState, ModelState, PlayerId, Vec2 } from '../../src/engine/types'
import { runGame } from '../../tools/sim'
import { must } from './turn-helpers'

type Any = Record<string, any>
const real = loadBundle()

/** The real bundle plus ad hoc lists. Entries are (profile, size?) pairs; costs are recomputed by the engine. */
function withLists(lists: Record<string, Any>): DataBundle {
  const byId = { ...real.byId } as Record<string, any>
  // a 46 point solo that is no Cohort model, to test the Cohort rule on its own
  byId['t.solo'] = { id: 't.solo', name: 't.solo', recordType: 'model', faction: 'cyg', type: 'solo', cost: 46, fa: 'U', base: 30, damage: { track: 'single', boxes: 1 } }
  for (const [id, l] of Object.entries(lists)) byId[id] = { id, name: id, recordType: 'list', faction: 'cyg', leader: 'cyg.caine', ...l }
  return { ...real, byId }
}
const SK_ENTRIES = [{ profile: 'cyg.deuce' }, { profile: 'kha.razor' }, { profile: 'cyg.falk' }, { profile: 'cyg.black13', size: 3 }] // 17 + 17 + 4 + 9 = 47
const B = withLists({
  't.l.sk-a': { level: 'skirmish', entries: SK_ENTRIES },
  't.l.sk-b': { level: 'skirmish', entries: SK_ENTRIES },
  't.l.sk-30': { level: 'skirmish', entries: [{ profile: 'cyg.deuce' }, { profile: 'cyg.falk' }, { profile: 'cyg.black13', size: 3 }] }, // 30: under the 46 floor
  't.l.sk-51': { level: 'skirmish', entries: [...SK_ENTRIES, { profile: 'kha.lazarenko' }, { profile: 'kha.hounds' }] }, // 60: over the cap
  't.l.rc-47': { level: 'recon', points: 47, entries: SK_ENTRIES }, // a recon list may not declare its way past 30
  't.l.sk-nocohort': { level: 'skirmish', entries: [{ profile: 't.solo' }] }, // 46, no warjack or warbeast
})
const S3 = 'scn-copperline-crossing'
const setupSk = (scenario = S3): GameSetup => ({ scenario, lists: { A: 't.l.sk-a', B: 't.l.sk-b' } })
const costOf = (b: DataBundle, listId: string): number => {
  const l = b.byId[listId] as Any
  return (l.entries as Any[]).reduce((n, e) => {
    const p = b.byId[e.profile] as Any
    return n + ((e.size !== undefined && p.composition?.costBySize?.[String(e.size)]) || p.cost)
  }, 0)
}

/** A skirmish game on S3 after the roll-off and edge choice: the first player on the north edge, deployment open, nothing placed. */
function atDeployment(seed = 'sk1'): GameState {
  let out = must(createInitialState(setupSk(), seed, B))
  out = must(answerSetup(out.state, B, out.pending.options!.find((o) => o.id === 'first')!.action))
  out = must(answerSetup(out.state, B, out.pending.options!.find((o) => o.id === 'south')!.action)) // the second player picks south, so the first is north
  expect(out.state.pending.kind).toBe('deploy')
  return out.state
}
const firstOf = (s: GameState): PlayerId => s.firstPlayer!
const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')
const park = (s: GameState): GameState => ({ ...s, models: Object.fromEntries(Object.entries(s.models).map(([k, m]) => [k, { ...m, offTable: true }])) })
const put = (s: GameState, id: string, pos: Vec2): GameState => ({ ...s, models: { ...s.models, [id]: { ...s.models[id]!, pos, offTable: false, life: 'active' } as ModelState } })
/** A point whose base edge is 1" from the objective's base edge. */
const near = (el: { pos: Vec2; mm: number }, baseMm: number, k = 0): Vec2 => ({ x: el.pos.x + baseRadius(el.mm) + baseRadius(baseMm) + 1, z: el.pos.z + k * 0.4 })

describe('SKM skirmish setup (E1)', () => {
  it('SKM-001 a 46 to 50 point skirmish list with a Cohort model builds; every real *-skirmish list passes the same checks', () => {
    expect(costOf(B, 't.l.sk-a')).toBe(47)
    expect(() => buildArmy('A', 't.l.sk-a', B)).not.toThrow()
    expect(LEVEL_CAP).toMatchObject({ recon: 30, skirmish: 50, pitched: 75, grandMelee: 100 })
    // under the floor, over the cap, a recon list claiming a bigger total, and no non-lesser Cohort model
    expect(() => buildArmy('A', 't.l.sk-30', B)).toThrow(/under 46/)
    expect(() => buildArmy('A', 't.l.sk-51', B)).toThrow(/over 50/)
    expect(() => buildArmy('A', 't.l.rc-47', B)).toThrow(/over 30/)
    expect(() => buildArmy('A', 't.l.sk-nocohort', B)).toThrow(/non-lesser/)
    // the shipped lists: level skirmish, recomputed cost 46..50, a Cohort model, FA and character limits
    const shipped = Object.values(real.byId).filter((r) => (r as Any).recordType === 'list' && (r as Any).level === 'skirmish') as Any[]
    for (const l of shipped) {
      const total = costOf(real, l.id)
      expect(total, l.id).toBeGreaterThanOrEqual(46)
      expect(total, l.id).toBeLessThanOrEqual(50)
      expect(() => buildArmy('A', l.id, real), l.id).not.toThrow()
      const count: Record<string, number> = {}
      for (const e of l.entries as Any[]) count[e.profile] = (count[e.profile] ?? 0) + 1
      for (const [pid, n] of Object.entries(count)) {
        const fa = (real.byId[pid] as Any).fa
        expect(n, `${l.id} ${pid}`).toBeLessThanOrEqual(fa === 'C' ? 1 : typeof fa === 'number' ? fa : Infinity)
      }
    }
  })

  it('SKM-002 createGame rejects a skirmish list on a recon-only scenario, recon lists on a skirmish-only one, and mixed levels', () => {
    const bad = (r: { rejection?: { code: string; message: string } }): string => { expect(r.rejection?.code).toBe('E_BAD_SETUP'); return r.rejection!.message }
    expect(bad(createGame({ scenario: 'scn-ashwall-divide', lists: { A: 't.l.sk-a', B: 't.l.sk-b' } }, 's', B))).toMatch(/not played at skirmish/)
    expect(bad(createGame({ scenario: S3, lists: { A: 'kha.l.qs-recon', B: 'cyg.l.qs-recon' } }, 's', B))).toMatch(/not played at recon/)
    expect(bad(createGame({ scenario: S3, lists: { A: 't.l.sk-a', B: 'cyg.l.qs-recon' } }, 's', B))).toMatch(/different game sizes/)
    expect(bad(createGame({ scenario: 'scn-qs-demo', lists: { A: 't.l.sk-a', B: 'kha.l.qs-recon' } }, 's', B))).toMatch(/different game sizes/)
    // the good cases
    expect(createGame(setupSk(), 's', B).rejection).toBeUndefined()
    expect(createGame({ scenario: 'scn-ashwall-divide', lists: { A: 'kha.l.qs-recon', B: 'cyg.l.qs-recon' } }, 's', B).rejection).toBeUndefined()
    // a recon list is still capped at 30 and floored at 26 by its level
    expect(bad(createGame({ scenario: 'scn-ashwall-divide', lists: { A: 't.l.rc-47', B: 'cyg.l.qs-recon' } }, 's', B))).toMatch(/over 30/)
  })

  it('SKM-003 S3 deployment: first player z in [-24,-18] (6"), second [13,24] (11"), Advance Deployment 3" deeper', () => {
    const s = atDeployment()
    const def = scenarioDef(B, S3)
    expect(def.table).toEqual({ w: 48, d: 48 })
    expect(def.deployment).toEqual({ first: 6, second: 11, advance: 3, unitSpread: 3 })
    const f = firstOf(s), g = other(f)
    expect(s.players[f].edge).toBe('north')
    expect(deploymentZone(s, B, f)).toEqual({ x0: -24, x1: 24, z0: -24, z1: -18 })
    expect(deploymentZone(s, B, g)).toEqual({ x0: -24, x1: 24, z0: 13, z1: 24 })
    expect(deploymentZone(s, B, f, true)).toEqual({ x0: -24, x1: 24, z0: -24, z1: -15 })
    expect(deploymentZone(s, B, g, true)).toEqual({ x0: -24, x1: 24, z0: 10, z1: 24 })
    // the opening deploy decision offers a tidy line that fits the 6" strip
    expect(s.pending.options?.some((o) => o.id === 'auto')).toBe(true)
  })

  it('SKM-004 S3 scores from the second player\'s round-2 turn; a lone solo cannot secure a 50 mm; a whole unit secures a 40 mm', () => {
    const s0 = atDeployment()
    const def = scenarioDef(B, S3)
    const f = firstOf(s0), g = other(f)
    expect(def.scoring).toMatchObject({ fromRound: 2, fromPlayer: 'second', winMargin: 3, winOnOpponentTurnOnly: true })
    expect(scoringActive({ ...s0, round: 1, activePlayer: f }, def)).toBe(false)
    expect(scoringActive({ ...s0, round: 1, activePlayer: g }, def)).toBe(false)
    expect(scoringActive({ ...s0, round: 2, activePlayer: f }, def)).toBe(false)
    expect(scoringActive({ ...s0, round: 2, activePlayer: g }, def)).toBe(true)
    expect(scoringActive({ ...s0, round: 3, activePlayer: f }, def)).toBe(true)

    const el = Object.fromEntries(def.elements.map((e) => [e.id, { pos: e.pos, mm: e.kind === 'objective50' ? 50 : 40 }]))
    const me = f, id = (tag: string) => `${me}:${tag}`
    const base = park(s0)
    const ctl = (s: GameState, element: string) => computeControl(s, def)[element]!.controller
    // 50 mm: a lone solo (Falk) is not enough, the Leader is, a war-engine is
    expect(ctl(put(base, id('e2'), near(el['el-50-w']!, 30)), 'el-50-w')).toBeNull()
    expect(ctl(put(base, id('L'), near(el['el-50-w']!, 30)), 'el-50-w')).toBe(me)
    expect(ctl(put(base, id('e0'), near(el['el-50-w']!, 50)), 'el-50-w')).toBe(me)
    // 40 mm: the Leader, or every remaining trooper of one unit, not part of a unit and not a solo
    expect(ctl(put(base, id('e2'), near(el['el-40-w']!, 30)), 'el-40-w')).toBeNull()
    expect(ctl(put(base, id('L'), near(el['el-40-w']!, 30)), 'el-40-w')).toBe(me)
    const unit = [1, 2, 3].map((k) => id(`u3.${k}`))
    expect(unit.every((m) => base.models[m] !== undefined)).toBe(true)
    let two = base
    unit.slice(0, 2).forEach((m, k) => { two = put(two, m, near(el['el-40-w']!, 30, k)) })
    expect(ctl(two, 'el-40-w')).toBeNull()
    expect(ctl(put(two, unit[2]!, near(el['el-40-w']!, 30, 2)), 'el-40-w')).toBe(me)
    // an enemy within 3" contests it (but an enemy Leader does not: SR p3)
    const foe = other(me)
    const full = put(two, unit[2]!, near(el['el-40-w']!, 30, 2))
    expect(ctl(put(full, `${foe}:e2`, { x: el['el-40-w']!.pos.x - 2.5, z: el['el-40-w']!.pos.z }), 'el-40-w')).toBeNull()
    expect(ctl(put(full, `${foe}:L`, { x: el['el-40-w']!.pos.x - 2.5, z: el['el-40-w']!.pos.z }), 'el-40-w')).toBe(me)
    // all four objectives are on the table, point symmetric about the origin, each kind twice
    expect(def.elements.map((e) => e.kind).sort()).toEqual(['objective40', 'objective40', 'objective50', 'objective50'])
    for (const e of def.elements) expect(def.elements.some((o) => o.kind === e.kind && o.pos.x === -e.pos.x && o.pos.z === -e.pos.z)).toBe(true)
  })

  it('SKM-005 Kill Box on S3: from the first player\'s round 2 a Leader completely within 12" of its own edge gives the opponent 2 VP', () => {
    const s0 = atDeployment()
    const def = scenarioDef(B, S3)
    const f = firstOf(s0), g = other(f)
    expect(def.killBox).toEqual({ fromRound: 2, fromPlayer: 'first', depth: 12, vp: 2 })
    expect(killBoxActive({ ...s0, round: 1, activePlayer: g }, def)).toBe(false)
    expect(killBoxActive({ ...s0, round: 2, activePlayer: f }, def)).toBe(true)
    const r = baseRadius(30)
    const inBox = put(park(s0), `${f}:L`, { x: 0, z: -24 + r + 2 }) // first player is on the north edge
    const outBox = put(park(s0), `${f}:L`, { x: 0, z: -24 + 12 + r + 0.5 })
    expect(inKillBox(inBox, def, f)).toBe(true)
    expect(inKillBox(outBox, def, f)).toBe(false)
    // the 12" depth is not scaled with the table: it is measured from the edge of the 48" table
    const edge = put(park(s0), `${f}:L`, { x: 0, z: -24 + 12 - r })
    expect(inKillBox(edge, def, f)).toBe(true)
    const round2 = (s: GameState): GameState => ({ ...s, round: 2, turn: 1, activePlayer: f, phase: 'activation' })
    const scored = endOfTurnScoring(round2(inBox), B)
    expect(scored.state.scenario.vp[g]).toBe(2)
    expect(scored.state.scenario.vp[f]).toBe(0)
    expect(scored.events.some((e) => e.type === 'KillBoxScored')).toBe(true)
    expect(endOfTurnScoring(round2(outBox), B).state.scenario.vp).toEqual({ A: 0, B: 0 })
    // nothing in round 1
    expect(endOfTurnScoring({ ...round2(inBox), round: 1 }, B).state.scenario.vp).toEqual({ A: 0, B: 0 })
  })

  it('SKM-008 two ad hoc 47 point lists play a whole game on S3 with no invariant violation and a replay that matches', () => {
    const r = runGame(0, { seed: 'sk-sim', scenario: S3, cap: 6000, stall: 300, wallMs: 120_000, lists: ['t.l.sk-a', 't.l.sk-b'], size: 'skirmish' }, B)
    expect(r.violations).toEqual([])
    expect(r.summary.ended).toBe(true)
    expect(r.summary.rounds).toBeLessThanOrEqual(7)
  }, 150_000)
})
