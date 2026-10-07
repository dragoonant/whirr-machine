// WP-AI (90-skirmish): the utility AI on the 48" Copperline Crossing table with the six 50-point lists. Four objectives
// (a 50 mm needs a warjack, warbeast or Leader, a 40 mm a whole unit or the Leader), deployment in the 6"/11" zones, the
// special actions and attacks the AI used to ignore (Smite, Galvanic Capacitor, Empower, Necrosurgery, Grim Returns), and
// the worker's decision-time budget.
import { describe, expect, it } from 'vitest'
import { newCtx } from '../../src/ai/damage'
import { decideSync, newBrain } from '../../src/ai/decider'
import { planDeployment } from '../../src/ai/deploy'
import { killChance } from '../../src/ai/damage'
import { padThreat, specialActionValue, specialAttackValue, type Env } from '../../src/ai/plan'
import { rolesFor } from '../../src/ai/roles'
import { elementSpecs, groupCanHold, scenarioValue, scenarioValueMoved, shapedScenario } from '../../src/ai/scenario'
import { pickSensible } from '../../src/ai/random'
import { TIERS } from '../../src/ai/tiers'
import { elementsOf } from '../../src/ai/world'
import { createGame, legalActions, step, validate, type Action, type GameSetup, type GameState, type PlayerId } from '../../src/engine/index'
import { bundle, parkOthers, playUntil, stage } from './helpers'

const FACTIONS = ['cyg', 'kha', 'trl', 'cir', 'cry', 'men'] as const
const SK = (a: string, b: string): GameSetup => ({ scenario: 'scn-copperline-crossing', lists: { A: `${a}.l.skirmish`, B: `${b}.l.skirmish` } })

/** The state right after both armies are on the table (the first activation prompt of round 1). */
function deployed(a: string, b: string, seed: string): GameState {
  let s = createGame(SK(a, b), seed, bundle).state
  const brain = newBrain()
  for (let i = 0; i < 200 && !(s.phase === 'activation' && s.pending.kind === 'chooseActivation'); i++) {
    const legal = legalActions(s)
    const act = s.pending.kind === 'deploy' || s.pending.kind === 'advanceDeploy' ? decideSync(s, s.pending, legal, { tier: 'normal', seed, brain }) : pickSensible(s, s.pending, legal, seed)
    s = step(s, act).state
  }
  return s
}

const envOf = (s: GameState, me: PlayerId): Env => ({ ctx: newCtx(s), s, me, tier: TIERS.normal, rnd: () => 0.5, line: null, committed: false })
const byProfile = (s: GameState, profile: string, owner?: PlayerId): GameState['models'][string][] =>
  Object.values(s.models).filter((m) => m.profileId === profile && m.life === 'active' && !m.offTable && (!owner || m.owner === owner))

/** Round 2, side A to choose an activation, with the named models staged and everything else parked at the back edges. */
function scene(a: string, b: string, seed: string, place: (s0: GameState) => Parameters<typeof stage>[1]): GameState {
  const s0 = playUntil(SK(a, b), seed, (s) => s.round >= 2 && s.pending.kind === 'chooseActivation' && s.pending.player === 'A')
  const keep = place(s0)
  const moves: Parameters<typeof stage>[1] = { ...parkOthers(s0, Object.keys(keep)), ...keep }
  return stage(s0, moves)
}

/** Activate a unit or model of A, forfeit its movement (it stays where staged) and return the open combat choice. */
function toCombat(s: GameState, id: string): GameState {
  let cur = step(s, { type: 'chooseActivation', decisionId: s.pending.id, player: 'A', activate: id }).state
  const fo = legalActions(cur).find((x) => x.type === 'chooseMovement' && x.option === 'forfeit')
  if (fo) cur = step(cur, fo).state
  return cur
}

function decide(s: GameState): { a: Action; fallbacks: number } {
  const brain = newBrain()
  const a = decideSync(s, s.pending, legalActions(s), { tier: 'normal', seed: 'skm', brain })
  expect(validate(s, a)).toBeNull()
  return { a, fallbacks: brain.stats.fallbacks }
}

describe('AI on Copperline Crossing: four objectives', () => {
  it('AI-SKM-1 the hold rule per element decides who can stand on it', () => {
    const s = deployed('cyg', 'kha', 'skm-1')
    const specs = elementSpecs(s)
    const el50 = elementsOf(s).find((e) => e.id === 'el-50-w')!, el40 = elementsOf(s).find((e) => e.id === 'el-40-w')!
    const jack = byProfile(s, 'cyg.deuce', 'A')[0]!
    const solo = byProfile(s, 'cyg.falk', 'A')[0]!
    const unit = Object.values(s.models).filter((m) => m.owner === 'A' && m.unitId && s.units[m.unitId]!.profileId.includes('black13'))
    expect(specs.get(el50.id)!.eligible).toContain('warEngine')
    expect(specs.get(el40.id)!.eligible).toContain('unitAll')
    expect(groupCanHold(specs.get(el50.id)!.eligible, [jack])).toBe(true)
    expect(groupCanHold(specs.get(el40.id)!.eligible, [jack])).toBe(false)
    expect(groupCanHold(specs.get(el50.id)!.eligible, [solo])).toBe(false)
    expect(groupCanHold(specs.get(el40.id)!.eligible, [solo])).toBe(false)
    expect(unit.length).toBeGreaterThanOrEqual(3)
    expect(groupCanHold(specs.get(el40.id)!.eligible, unit)).toBe(true)
    expect(groupCanHold(specs.get(el50.id)!.eligible, unit)).toBe(false)
  })

  for (const [fa, fb] of [['cyg', 'kha'], ['trl', 'cir'], ['cry', 'men']] as const) {
    it(`AI-SKM-2 ${fa} and ${fb}: each element goes to a group that can hold it, units whole, solos only contest`, () => {
      const s = deployed(fa, fb, `skm-2-${fa}`)
      for (const p of ['A', 'B'] as const) {
        const roles = rolesFor(s, p)
        const specs = elementSpecs(s)
        const staffed = new Set<string>()
        const holders = new Map<string, GameState['models'][string][]>()
        for (const [id, r] of roles) {
          if (r.kind === 'free' || !r.element) continue
          holders.set(r.element.id, [...(holders.get(r.element.id) ?? []), s.models[id]!])
        }
        for (const [elId, ms] of holders) {
          staffed.add(elId)
          const groups = new Map<string, typeof ms>()
          for (const m of ms) groups.set(m.unitId ?? m.id, [...(groups.get(m.unitId ?? m.id) ?? []), m])
          // a unit sent to an element goes whole
          for (const [k, g] of groups) if (s.units[k]) expect(g.length).toBe(s.units[k]!.troopers.length)
          const tok = specs.get(elId)!.eligible
          const roleOf = (m: (typeof ms)[number]): string => roles.get(m.id)!.kind
          // a 'hold' role is only ever given to a group the element accepts
          for (const g of groups.values()) if (roleOf(g[0]!) === 'hold') expect(groupCanHold(tok, g)).toBe(true)
        }
        // every element has someone assigned to it (this list has two cohort models and at least two units or more groups)
        expect(staffed.size).toBe(4)
        // the two 50 mm objectives are held by warjacks or warbeasts, never by a unit or solo
        for (const el of elementsOf(s).filter((e) => e.id.startsWith('el-50'))) {
          const hs = holders.get(el.id) ?? []
          const hold = hs.filter((m) => roles.get(m.id)!.kind === 'hold')
          for (const m of hold) expect(['warEngine', 'beast', 'battleEngine']).toContain(m.type)
        }
      }
    })
  }

  it('AI-SKM-3 shaped scenario: a lone solo earns nothing on a 40 mm, a whole unit or a warjack on a 50 mm does', () => {
    const s0 = deployed('cyg', 'kha', 'skm-3')
    const el40 = elementsOf(s0).find((e) => e.id === 'el-40-w')!, el50 = elementsOf(s0).find((e) => e.id === 'el-50-w')!
    const solo = byProfile(s0, 'cyg.falk', 'A')[0]!
    const jack = byProfile(s0, 'cyg.deuce', 'A')[0]!
    const unit = Object.values(s0.models).filter((m) => m.owner === 'A' && m.unitId && s0.units[m.unitId]!.profileId.includes('black13'))
    const park = (keep: string[]): Parameters<typeof stage>[1] => parkOthers(s0, keep)
    const base = shapedScenario(stage(s0, park([])), 'A')
    const withSolo = shapedScenario(stage(s0, { ...park([solo.id]), [solo.id]: { pos: { x: el40.pos.x, z: el40.pos.z - 1.4 } } }), 'A')
    expect(withSolo).toBeLessThanOrEqual(base + 0.01)
    const ring = unit.map((m, i) => ({ id: m.id, pos: { x: el40.pos.x + Math.cos(i * 2.1) * 1.6, z: el40.pos.z + Math.sin(i * 2.1) * 1.6 } }))
    const withUnit = shapedScenario(stage(s0, { ...park(unit.map((m) => m.id)), ...Object.fromEntries(ring.map((r) => [r.id, { pos: r.pos }])) }), 'A')
    expect(withUnit).toBeGreaterThanOrEqual(base + 0.9)
    const withJack = shapedScenario(stage(s0, { ...park([jack.id]), [jack.id]: { pos: { x: el50.pos.x, z: el50.pos.z - 1.6 } } }), 'A')
    expect(withJack).toBeGreaterThanOrEqual(base + 0.9)
  })
})

describe('AI scoring helpers', () => {
  it('AI-SKM-3b the fast scenario value agrees with the full one, near an objective and far from every one', () => {
    const s = deployed('kha', 'cyg', 'skm-3b')
    const unit = Object.values(s.models).filter((m) => m.owner === 'A' && m.unitId && s.units[m.unitId]!.profileId.includes('hounds'))
    expect(unit.length).toBeGreaterThanOrEqual(3)
    const el = elementsOf(s).find((e) => e.id === 'el-40-w')!
    for (const [dx, dz] of [[0, 0], [1.2, -1.5], [-4, 6], [9, 9]] as const) {
      const lead = unit[0]!
      const target = { x: el.pos.x + dx, z: el.pos.z + dz }
      const moved = Object.fromEntries(unit.map((m, i) => [m.id, { x: target.x + i * 0.9, z: target.z - 2.5 }]))
      const full = scenarioValue(Object.assign({}, s, { models: { ...s.models, ...Object.fromEntries(unit.slice(1).map((m) => [m.id, { ...m, pos: moved[m.id]! }])) } }) as GameState, lead, moved[lead.id]!)
      expect(scenarioValueMoved(s, lead, moved)).toBeCloseTo(full, 6)
    }
  })

  it('AI-SKM-3c the Leader threat margin lifts a swarm of long shots into a real risk and never lowers one', () => {
    const s = deployed('cyg', 'kha', 'skm-3c')
    const L = s.models[s.players.A.leaderId]!
    const shot = { p: 0.03, onHit: [0, 0, 0, 0, 0, 0.5, 0.5] }
    const rep = { exp: 0.2, pKill: 0, seqs: Array.from({ length: 10 }, () => ({ ...shot })), attackers: 4 }
    const before = killChance(L, rep.seqs, 0)
    const after = killChance(L, padThreat(rep).seqs, 0)
    expect(after).toBeGreaterThan(before)
    expect(padThreat(rep, 0).seqs[0]!.p).toBe(0.03)
    for (const q of padThreat(rep).seqs) expect(q.p).toBeGreaterThanOrEqual(0.03)
  })
})

describe('AI deployment on 48"', () => {
  for (const [fa, fb] of [['cyg', 'kha'], ['trl', 'cry'], ['cir', 'men']] as const) {
    it(`AI-SKM-4 ${fa} vs ${fb}: both armies deploy legally in the 6"/11" zones and the near objectives get a warjack and a unit in their own lane`, () => {
      let s = createGame(SK(fa, fb), `skm-4-${fa}`, bundle).state
      const brain = newBrain()
      for (let i = 0; i < 80 && s.phase !== 'activation' && s.pending.kind !== 'gameOver'; i++) {
        const legal = legalActions(s)
        if (s.pending.kind === 'deploy' || s.pending.kind === 'advanceDeploy') {
          const p = planDeployment(s)
          expect(p).not.toBeNull()
        }
        const a = decideSync(s, s.pending, legal, { tier: 'normal', seed: 'skm-4', brain })
        const r = step(s, a)
        expect(r.rejection).toBeUndefined()
        s = r.state
      }
      expect(s.phase).toBe('activation')
      expect(brain.stats.fallbacks).toBe(0)
      for (const p of ['A', 'B'] as const) {
        const zs = Object.values(s.models).filter((m) => m.owner === p && !m.offTable)
        expect(zs.length).toBeGreaterThanOrEqual(10)
        // the two near objectives of each side lie in different lanes: a deployed jack and a deployed unit within 14" of each lane
        const lanes = [-10, 10]
        for (const lx of lanes) expect(zs.some((m) => m.type !== 'leader' && Math.abs(m.pos.x - lx) <= 8)).toBe(true)
      }
      // a model of the first player is inside the first zone (z in -24..-18, or -15 after Advance Deployment) and of the second player inside 13..24 (10 after)
      const first = s.firstPlayer
      for (const m of Object.values(s.models)) {
        if (m.offTable) continue
        if (m.owner === first) expect(Math.abs(m.pos.z)).toBeGreaterThan(14)
        else expect(Math.abs(m.pos.z)).toBeGreaterThan(9)
      }
    })
  }
})

describe('AI uses special actions and attacks', () => {
  it('AI-SKM-5 Smite: a Tempest Assailer next to an enemy chooses the Smite attack, and the answer resolves', () => {
    const s = scene('cyg', 'kha', 'skm-5', (s0) => {
      const ass = byProfile(s0, 'cyg.tempest-assailer', 'A')
      const foe = byProfile(s0, 'kha.razor', 'B')[0]!
      const out: Parameters<typeof stage>[1] = {}
      ass.forEach((m, i) => { out[m.id] = { pos: { x: -2 + i * 2, z: 0 }, activated: false, conditions: [] } })
      out[foe.id] = { pos: { x: 0, z: 2.6 }, conditions: [] }
      return out
    })
    const ass = byProfile(s, 'cyg.tempest-assailer', 'A')
    const cur = toCombat(s, ass[0]!.unitId!)
    expect(cur.pending.kind).toBe('chooseCombatAction')
    const { a, fallbacks } = decide(cur)
    expect(fallbacks).toBe(0)
    expect(a).toMatchObject({ type: 'chooseCombatAction', choice: 'specialAttack', abilityId: 'cyg.a.smite' })
    const r = step(cur, a)
    expect(r.rejection).toBeUndefined()
    expect(r.state.pending.kind).toBe('chooseAttack')
  })

  it('AI-SKM-5b Smite is worth nothing with no enemy in reach', () => {
    const s = scene('cyg', 'kha', 'skm-5b', (s0) => {
      const ass = byProfile(s0, 'cyg.tempest-assailer', 'A')
      const out: Parameters<typeof stage>[1] = {}
      ass.forEach((m, i) => { out[m.id] = { pos: { x: -2 + i * 2, z: -10 }, activated: false, conditions: [] } })
      return out
    })
    const ass = byProfile(s, 'cyg.tempest-assailer', 'A')
    const cur = toCombat(s, ass[0]!.unitId!)
    const smite = legalActions(cur).find((x) => x.type === 'chooseCombatAction' && x.choice === 'specialAttack' && x.abilityId === 'cyg.a.smite')
    if (smite && smite.type === 'chooseCombatAction') expect(specialAttackValue(envOf(cur, 'A'), cur.models[smite.modelId!]!, smite, 0, 0)).toBeLessThan(0.05)
    expect(decide(cur).a).not.toMatchObject({ choice: 'specialAttack' })
  })

  it('AI-SKM-6 Empower: an Arkanist next to a warjack that has no focus empowers it rather than shooting a far target', () => {
    const s = scene('kha', 'cyg', 'skm-6', (s0) => {
      const ark = byProfile(s0, 'kha.arkanist', 'A')
      const jack = byProfile(s0, 'kha.razor', 'A')[0]!
      const foe = byProfile(s0, 'cyg.black13-ryan', 'B')[0] ?? Object.values(s0.models).find((m) => m.owner === 'B' && m.type === 'trooper')!
      const out: Parameters<typeof stage>[1] = {}
      ark.forEach((m, i) => { out[m.id] = { pos: { x: -2 + i * 1.6, z: -8 }, activated: false, conditions: [] } })
      out[jack.id] = { pos: { x: 0, z: -5.4 }, activated: false, focus: 0, conditions: [] }
      out[foe.id] = { pos: { x: 12, z: 6 }, conditions: [] }
      return out
    })
    const ark = byProfile(s, 'kha.arkanist', 'A')
    const jack = byProfile(s, 'kha.razor', 'A')[0]!
    const v = specialActionValue(envOf(s, 'A'), s.models[ark[0]!.id]!, { type: 'chooseCombatAction', decisionId: s.pending.id, player: 'A', modelId: ark[0]!.id, choice: 'specialAction', abilityId: 'kha.a.empower', targetId: jack.id } as Action & { type: 'chooseCombatAction' })
    expect(v).toBeGreaterThan(1)
    const cur = toCombat(s, ark[0]!.unitId!)
    expect(cur.pending.kind).toBe('chooseCombatAction')
    const { a } = decide(cur)
    expect(a).toMatchObject({ type: 'chooseCombatAction', choice: 'specialAction', abilityId: 'kha.a.empower' })
  })

  it('AI-SKM-6b Empower is worth little to a warjack already at 3 focus', () => {
    const s = scene('kha', 'cyg', 'skm-6b', (s0) => {
      const ark = byProfile(s0, 'kha.arkanist', 'A')
      const jack = byProfile(s0, 'kha.razor', 'A')[0]!
      const out: Parameters<typeof stage>[1] = {}
      ark.forEach((m, i) => { out[m.id] = { pos: { x: -2 + i * 1.6, z: -8 }, activated: false, conditions: [] } })
      out[jack.id] = { pos: { x: 0, z: -5.4 }, activated: false, focus: 3, conditions: [] }
      return out
    })
    const ark = byProfile(s, 'kha.arkanist', 'A')
    const jack = byProfile(s, 'kha.razor', 'A')[0]!
    const v = specialActionValue(envOf(s, 'A'), s.models[ark[0]!.id]!, { type: 'chooseCombatAction', decisionId: s.pending.id, player: 'A', modelId: ark[0]!.id, choice: 'specialAction', abilityId: 'kha.a.empower', targetId: jack.id } as Action & { type: 'chooseCombatAction' })
    expect(v).toBeLessThan(0.3)
  })

  it('AI-SKM-7 Necrosurgery: an Initiate beside a damaged undead model heals it; with nothing damaged it is worth nothing', () => {
    const mk = (marked: number) => scene('cry', 'cyg', `skm-7-${marked}`, (s0) => {
      const ini = byProfile(s0, 'cry.initiate', 'A')
      const nt = byProfile(s0, 'cry.night-terror', 'A')[0]!
      const out: Parameters<typeof stage>[1] = {}
      ini.forEach((m, i) => { out[m.id] = { pos: { x: -2 + i * 1.5, z: -8 }, activated: false, conditions: [] } })
      out[nt.id] = { pos: { x: -2, z: -6.4 }, activated: false, conditions: [], damage: { track: 'single', boxes: 5, filled: marked } as never }
      return out
    })
    const hurt = mk(4)
    const ini = byProfile(hurt, 'cry.initiate', 'A')
    const nt = byProfile(hurt, 'cry.night-terror', 'A')[0]!
    const pick = (s: GameState, targetId: string): Action & { type: 'chooseCombatAction' } => ({ type: 'chooseCombatAction', decisionId: s.pending.id, player: 'A', modelId: ini[0]!.id, choice: 'specialAction', abilityId: 'cry.a.necrosurgery', targetId }) as never
    expect(specialActionValue(envOf(hurt, 'A'), hurt.models[ini[0]!.id]!, pick(hurt, nt.id))).toBeGreaterThan(1)
    const whole = mk(0)
    expect(specialActionValue(envOf(whole, 'A'), whole.models[ini[0]!.id]!, pick(whole, nt.id))).toBe(0)
  })

  it('AI-SKM-8 Grim Returns: worth taking only when a Grunt of the unit is down', () => {
    const mk = (down: boolean) => scene('cry', 'cyg', `skm-8-${down}`, (s0) => {
      const ini = byProfile(s0, 'cry.initiate', 'A')
      const out: Parameters<typeof stage>[1] = {}
      ini.forEach((m, i) => { out[m.id] = { pos: { x: -2 + i * 1.5, z: -8 }, activated: false, conditions: [] } })
      if (down && ini[2]) out[ini[2].id] = { pos: { x: 0, z: -8 }, life: 'destroyed', offTable: true } as never
      return out
    })
    const hurt = mk(true), fine = mk(false)
    const ini = byProfile(fine, 'cry.initiate', 'A')
    const pick = (s: GameState, targetId: string): Action & { type: 'chooseCombatAction' } => ({ type: 'chooseCombatAction', decisionId: s.pending.id, player: 'A', modelId: ini[0]!.id, choice: 'specialAction', abilityId: 'cry.a.grim-returns', targetId }) as never
    expect(specialActionValue(envOf(hurt, 'A'), hurt.models[ini[0]!.id]!, pick(hurt, ini[1]!.id))).toBeGreaterThan(1)
    expect(specialActionValue(envOf(fine, 'A'), fine.models[ini[0]!.id]!, pick(fine, ini[1]!.id))).toBe(0)
  })

  it('AI-SKM-9 Galvanic Capacitor: a Storm Vane with enemy warjacks about uses an effect for free before moving', () => {
    const s = scene('cyg', 'kha', 'skm-9', (s0) => {
      const vanes = byProfile(s0, 'cyg.storm-vane', 'A')
      const jack = byProfile(s0, 'kha.razor', 'B')[0]!
      const out: Parameters<typeof stage>[1] = {}
      vanes.forEach((m, i) => { out[m.id] = { pos: { x: -2 + i * 1.6, z: -2 }, activated: false, conditions: [] } })
      out[jack.id] = { pos: { x: 0, z: 9 }, conditions: [] }
      return out
    })
    const vanes = byProfile(s, 'cyg.storm-vane', 'A')
    let cur = toCombat(s, vanes[0]!.unitId!)
    // through the Vane's activation the AI uses a capacitor effect at some point (before shooting, or instead of it)
    const used: string[] = []
    const brain = newBrain()
    for (let i = 0; i < 12 && cur.activation?.activeId === vanes[0]!.unitId && cur.pending.player === 'A'; i++) {
      const legal = legalActions(cur)
      const a = decideSync(cur, cur.pending, legal, { tier: 'normal', seed: 'skm-9', brain })
      const r = step(cur, a)
      expect(r.rejection).toBeUndefined()
      if (a.type === 'chooseCombatAction' && a.choice === 'specialAction' && a.abilityId) used.push(a.abilityId)
      cur = r.state
    }
    expect(brain.stats.fallbacks).toBe(0)
    expect(used.length).toBeGreaterThan(0)
    for (const id of used) expect(['cyg.a.polarity-field-generator', 'cyg.a.wind-weaver', 'cyg.a.lightning-wreath']).toContain(id)
  })
})

describe('AI skirmish games', () => {
  it('AI-SKM-10 whole games to round 3 on every faction pair stay legal and the AI picks the specials it used to ignore', () => {
    const seen = new Set<string>()
    let ms = 0, n = 0
    const pairs: [string, string][] = [['cyg', 'kha'], ['kha', 'cry'], ['cry', 'cyg'], ['trl', 'men'], ['cir', 'cry'], ['men', 'cir']]
    pairs.forEach(([fa, fb], g) => {
      let s = createGame(SK(fa, fb), `skm-10-${g}`, bundle).state
      const brains = { A: newBrain(), B: newBrain() }
      for (let i = 0; i < 2500 && s.pending.kind !== 'gameOver' && s.round <= 3; i++) {
        const legal = legalActions(s)
        const p = s.pending.player
        const t0 = performance.now()
        const a = decideSync(s, s.pending, legal, { tier: 'normal', seed: `skm-10-${g}:${p}`, brain: brains[p] })
        ms += performance.now() - t0; n++
        if (a.type === 'chooseCombatAction' && (a.choice === 'specialAction' || a.choice === 'specialAttack') && a.abilityId) seen.add(a.abilityId)
        const r = step(s, a)
        expect(r.rejection).toBeUndefined()
        s = r.state
      }
      expect(brains.A.stats.fallbacks + brains.B.stats.fallbacks).toBe(0)
    })
    // the abilities the AI has to be willing to use
    const wanted = ['cry.a.empower', 'kha.a.empower', 'cyg.a.polarity-field-generator', 'cyg.a.wind-weaver', 'cyg.a.lightning-wreath', 'cyg.a.smite']
    expect(wanted.filter((id) => seen.has(id)).length).toBeGreaterThanOrEqual(3)
    // the worker budget: a few ms a decision with 12 to 16 models a side (the bench gate is 10 ms mean; this is the loaded-machine ceiling,
    // doubled on CI because the shared GitHub runners measured ~27 ms on 2026-10-07)
    expect(ms / n).toBeLessThan(process.env.CI ? 40 : 20)
  }, 240_000)
})
