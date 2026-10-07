// M12 follow-ups for WP-AI (AIF-nnn): what the planner reads from the engine's new answers (free boosts, Incorporeal, Warping Winds), the targeted special actions,
// Penance of the Corrupted in the focus allocation, Righteous Intervention, and the ai-bench list options (mirror, rotation).
import { describe, expect, it } from 'vitest'
import { contactPoint, newCtx, profileOf } from '../../src/ai/damage'
import { decideSync, newBrain } from '../../src/ai/decider'
import { specialActionValue, type Env } from '../../src/ai/plan'
import { threatAt } from '../../src/ai/threat'
import { TIERS } from '../../src/ai/tiers'
import { weaponsOf } from '../../src/ai/world'
import { pickSensible } from '../../src/ai/random'
import { applyEffect } from '../../src/engine/effects'
import { createGame, legalActions, step, validate, type Action, type GameSetup, type GameState, type PlayerId } from '../../src/engine/index'
import { raiseChooseActivation } from '../../src/engine/turnflow'
import { continueControl } from '../../src/engine/phases/control'
import { listsForGame, playGame, rotationPairs } from '../../tools/ai-bench'
import { bundle, parkOthers, stage } from './helpers'

const SK = (a: string, b: string): GameSetup => ({ scenario: 'scn-copperline-crossing', lists: { A: `${a}.l.skirmish`, B: `${b}.l.skirmish` } })
const envOf = (s: GameState, me: PlayerId): Env => ({ ctx: newCtx(s), s, me, tier: TIERS.normal, rnd: () => 0.5, line: null, committed: false })
const byProfile = (s: GameState, profile: string, owner?: PlayerId): GameState['models'][string][] =>
  Object.values(s.models).filter((m) => m.profileId === profile && m.life === 'active' && !m.offTable && (!owner || m.owner === owner))
/** Both armies deployed (the AI deploys), then A to choose an activation, the named models staged and everything else parked; no effects are left on the table. */
function scene(a: string, b: string, seed: string, place: (s0: GameState) => Parameters<typeof stage>[1]): GameState {
  let s = createGame(SK(a, b), seed, bundle).state
  const brain = newBrain()
  for (let i = 0; i < 200 && !(s.phase === 'activation' && s.pending.kind === 'chooseActivation'); i++) {
    const legal = legalActions(s)
    const act = s.pending.kind === 'deploy' || s.pending.kind === 'advanceDeploy' ? decideSync(s, s.pending, legal, { tier: 'normal', seed, brain }) : pickSensible(s, s.pending, legal, seed)
    s = step(s, act).state
  }
  const s0 = raiseChooseActivation({ ...s, activePlayer: 'A', effects: [] }, []).state
  const keep = place(s0)
  return stage(s0, { ...parkOthers(s0, Object.keys(keep)), ...keep })
}

describe('AIF-001 a free boost (Cavalry on a charge) is not bought a second time', () => {
  it('the charge profile of a Wolf Rider has no gain from a boost, a Ravager\'s charge does', () => {
    const s = scene('cir', 'cyg', 'aif1', (s0) => {
      const wr = byProfile(s0, 'cir.wolf-rider', 'A')[0]!
      const rv = byProfile(s0, 'cir.ravager-1', 'A')[0] ?? Object.values(s0.models).find((m) => m.owner === 'A' && m.unitId && s0.units[m.unitId]!.profileId.includes('ravagers'))!
      const foe = byProfile(s0, 'cyg.deuce', 'B')[0]!
      return { [wr.id]: { pos: { x: -4, z: 0 }, conditions: [] }, [rv.id]: { pos: { x: 4, z: 0 }, conditions: [] }, [foe.id]: { pos: { x: 0, z: 6 }, conditions: [] } }
    })
    const ctx = newCtx(s)
    const foe = byProfile(s, 'cyg.deuce', 'B')[0]!
    const rider = byProfile(s, 'cir.wolf-rider', 'A')[0]!
    const rv = Object.values(s.models).find((m) => m.owner === 'A' && m.unitId && s.units[m.unitId]!.profileId.includes('ravagers') && m.life === 'active')!
    const prof = (m: GameState['models'][string]) => {
      const w = weaponsOf(m).find((x) => x.melee)!
      return profileOf(ctx, s, m, w, foe, { charge: true, fromPos: contactPoint(m, m.pos, foe) })!
    }
    const pr = prof(rider)
    expect(pr).not.toBeNull()
    expect(pr.pB).toBeCloseTo(pr.p, 6)
    const pv = prof(rv)
    expect(pv.pB).toBeGreaterThan(pv.p + 0.05)
  })
})

describe('AIF-002 Incorporeal: threat from attackers that cannot hurt it is nothing', () => {
  it('Razor\'s non-magical weapons threaten Hades but not a Night Terror standing in the same place', () => {
    const s0 = scene('kha', 'cry', 'aif2', (s1) => {
      const razor = byProfile(s1, 'kha.razor', 'A')[0]!
      return { [razor.id]: { pos: { x: 0, z: -4 }, conditions: [], focus: 2 } }
    })
    // only Razor, the Night Terror and Hades are on the table (the rest of A could have magical weapons)
    const razor = byProfile(s0, 'kha.razor', 'A')[0]!
    const nt = byProfile(s0, 'cry.night-terror', 'B')[0]!
    const hades = byProfile(s0, 'cry.hades', 'B')[0]!
    const s = stage(s0, Object.fromEntries(Object.values(s0.models).filter((m) => ![razor.id, nt.id, hades.id].includes(m.id)).map((m) => [m.id, { offTable: true }])))
    const at = { x: 0, z: 0 }
    // Razor is on side A: look at what A's models can do to B's
    const ghost = threatAt(newCtx(s), s, nt, at)
    const jack = threatAt(newCtx(s), s, hades, at)
    expect(jack.exp).toBeGreaterThan(0.5)
    expect(ghost.exp).toBeLessThan(jack.exp * 0.1)
    void razor
  })
})

describe('AIF-003 Warping Winds shortens the shots the AI expects against the protected model', () => {
  it('a gun that just reaches a Cygnar model is a threat to it; once a Vane near it holds Warping Winds, it is not', () => {
    const base = scene('cyg', 'kha', 'aif3', (s0) => {
      const falk = byProfile(s0, 'cyg.falk', 'A')[0]!
      const vane = byProfile(s0, 'cyg.storm-vane', 'A')[0]!
      const dw = byProfile(s0, 'kha.dire-wolf-gun', 'B')[0]!
      return { [falk.id]: { pos: { x: 0, z: -2 }, conditions: [] }, [vane.id]: { pos: { x: 0, z: -4 }, conditions: [] }, [dw.id]: { pos: { x: 0, z: 14.4 }, conditions: [], focus: 0 } }
    })
    const falk = byProfile(base, 'cyg.falk', 'A')[0]!
    const vane = byProfile(base, 'cyg.storm-vane', 'A')[0]!
    const plain = threatAt(newCtx(base), base, falk, falk.pos)
    const winds = applyEffect(base, { sourceId: 'cyg.a.wind-weaver', name: 'Warping Winds', owner: 'A', casterId: vane.id, targetIds: [vane.id], mods: [], duration: 'round' }).state
    const covered = threatAt(newCtx(winds), winds, falk, falk.pos)
    expect(plain.exp).toBeGreaterThan(0.2)
    expect(covered.exp).toBeLessThan(plain.exp * 0.5)
  })
})

describe('AIF-004 targeted special actions are valued per target', () => {
  it('Lightning Wreath is worth more on a model about to fight than on one with nobody near', () => {
    const s = scene('cyg', 'kha', 'aif4', (s0) => {
      const vane = byProfile(s0, 'cyg.storm-vane', 'A')[0]!
      const falk = byProfile(s0, 'cyg.falk', 'A')[0]!
      const deuce = byProfile(s0, 'cyg.deuce', 'A')[0]!
      const foe = byProfile(s0, 'kha.razor', 'B')[0]!
      return { [vane.id]: { pos: { x: 0, z: 0 }, conditions: [], activated: false }, [falk.id]: { pos: { x: 2, z: 0 }, conditions: [], activated: false }, [deuce.id]: { pos: { x: -2, z: 0 }, conditions: [], activated: false }, [foe.id]: { pos: { x: 2, z: 4 }, conditions: [] } }
    })
    const vane = byProfile(s, 'cyg.storm-vane', 'A')[0]!
    const falk = byProfile(s, 'cyg.falk', 'A')[0]!
    const deuce = byProfile(s, 'cyg.deuce', 'A')[0]!
    const pick = (targetId: string) => ({ type: 'chooseCombatAction', decisionId: s.pending.id, player: 'A', modelId: vane.id, choice: 'specialAction', abilityId: 'cyg.a.lightning-wreath', targetId }) as Action & { type: 'chooseCombatAction' }
    const near = specialActionValue(envOf(s, 'A'), vane, pick(falk.id))
    const far = specialActionValue(envOf(stage(s, { [deuce.id]: { pos: { x: -2, z: -3 } } }), 'A'), vane, pick(deuce.id))
    expect(near).toBeGreaterThan(far)
    expect(far).toBeGreaterThan(0)
  })
  it('Righteous Intervention is armed only with a fight near and a Faction model worth stepping in for', () => {
    const mk = (foeAt: number) => scene('men', 'kha', `aif5-${foeAt}`, (s0) => {
      const san = Object.values(s0.models).filter((m) => m.owner === 'A' && m.profileId === 'men.cleanser-sanctifier' && m.life === 'active')
      const def = byProfile(s0, 'men.defenders-grunt', 'A')[0]!
      const foe = byProfile(s0, 'kha.razor', 'B')[0]!
      const out: Parameters<typeof stage>[1] = {}
      san.forEach((m, i) => { out[m.id] = { pos: { x: -2 + i * 1.6, z: 0 }, conditions: [], activated: false } })
      out[def.id] = { pos: { x: 0, z: 4 }, conditions: [] }
      out[foe.id] = { pos: { x: 0, z: foeAt }, conditions: [] }
      return out
    })
    const near = mk(10), far = mk(-30)
    const san = (s: GameState) => Object.values(s.models).filter((m) => m.owner === 'A' && m.profileId === 'men.cleanser-sanctifier' && m.life === 'active')[0]!
    const act = (s: GameState) => ({ type: 'chooseCombatAction', decisionId: s.pending.id, player: 'A', modelId: san(s).id, choice: 'specialAction', abilityId: 'men.a.righteous-intervention' }) as Action & { type: 'chooseCombatAction' }
    expect(specialActionValue(envOf(near, 'A'), san(near), act(near))).toBeGreaterThan(0.35)
    expect(specialActionValue(envOf(far, 'A'), san(far), act(far))).toBe(0)
  })
})

describe('AIF-006 the focus allocation uses Penance when a Vassal has boxes to spare', () => {
  it('Normal pays damage for a warjack\'s missing focus, keeping the Vassals at 3 unmarked boxes or more, and the answer validates', () => {
    const s = scene('men', 'cyg', 'aif6', (s0) => {
      const L = s0.models[s0.players.A.leaderId]!
      const crusader = byProfile(s0, 'men.crusader', 'A')[0]!
      const vassals = Object.values(s0.models).filter((m) => m.owner === 'A' && m.profileId === 'men.vassal' && m.life === 'active')
      const keep: Parameters<typeof stage>[1] = { [L.id]: { pos: { x: 0, z: -8 }, focus: 0, conditions: [] }, [crusader.id]: { pos: { x: 0, z: -4 }, focus: 0, conditions: [] } }
      vassals.forEach((v, i) => { keep[v.id] = { pos: { x: -3 + i * 1.5, z: -7 }, conditions: [] } })
      return keep
    })
    const c = continueControl({ ...s, phase: 'control', activePlayer: 'A' }, bundle, 'start', [])
    expect(c.pending?.kind).toBe('allocateFocus')
    const a = decideSync(c.state, c.pending!, legalActions(c.state), { tier: 'normal', seed: 'aif6', brain: newBrain() })
    expect(validate(c.state, a)).toBeNull()
    expect(a.type).toBe('allocateFocus')
    const pen = (a as Extract<Action, { type: 'allocateFocus' }>).penance ?? []
    expect(pen.length).toBeGreaterThan(0)
    expect(pen.reduce((n, e) => n + e.points, 0)).toBeLessThanOrEqual(2)
    for (const e of pen) expect(e.points).toBeLessThanOrEqual(2) // 5 boxes - 3 kept
    const r = step(c.state, a)
    expect(r.rejection).toBeUndefined()
  })
})

describe('AIF-007 ai-bench list options: mirror and rotation', () => {
  it('rotationPairs lists every ordered pair (each pair then its swap); listsForGame follows the mode', () => {
    const p = rotationPairs(['cyg', 'kha', 'trl'])
    expect(p).toEqual([['cyg', 'kha'], ['kha', 'cyg'], ['cyg', 'trl'], ['trl', 'cyg'], ['kha', 'trl'], ['trl', 'kha']])
    const args = { mirror: false, rotate: ['cyg.l.skirmish', 'kha.l.skirmish', 'trl.l.skirmish'], xList: undefined, yList: undefined, size: 'skirmish' as const }
    expect(listsForGame(args, 0)).toEqual({ xList: 'cyg.l.skirmish', yList: 'kha.l.skirmish' })
    expect(listsForGame(args, 6)).toEqual({ xList: 'cyg.l.skirmish', yList: 'kha.l.skirmish' }) // wraps after 6
    expect(listsForGame({ ...args, rotate: undefined, mirror: true }, 3)).toEqual({ xList: 'kha.l.skirmish', yList: 'kha.l.skirmish' })
    expect(listsForGame({ ...args, rotate: undefined, mirror: true, xList: 'men.l.skirmish' }, 0)).toEqual({ xList: 'men.l.skirmish', yList: 'men.l.skirmish' })
    expect(listsForGame({ ...args, rotate: undefined }, 0)).toEqual({ xList: undefined, yList: undefined })
  })
  it('a mirror game gives both tiers the same list and still plays to its end', () => {
    const r = playGame('normal', 'easy', 'A', false, 'aif7', 'scn-copperline-crossing', 4000, 'trl.l.skirmish', 'trl.l.skirmish', 'skirmish')
    expect(r.lists).toEqual({ x: 'trl.l.skirmish', y: 'trl.l.skirmish' })
    expect(r.rejected).toBe(0)
    expect(r.stall).toBe(false)
  }, 120000)
})

void createGame
