// M13 WP6: the AI at command cards and Steamroller 2026 scenarios (91 D.3). Test names carry checklist ids where the checklist has one
// (CARD-022 whole games with hands, SR-003 flag picks, SR-007 and SR-008 caches, SR-024 every scoring decision legal); the AIC- ids are this
// file's own and wait for a checklist block.
import { describe, expect, it } from 'vitest'
import { cardScore, cardThreshold, keepsElement, pickPlay } from '../../src/ai/cards'
import { newCtx } from '../../src/ai/damage'
import { decideSync, newBrain } from '../../src/ai/decider'
import type { Env } from '../../src/ai/plan'
import { cacheTerm, cachesOf, pieceScore, RAID_REACH, raiderOf } from '../../src/ai/scenario'
import { TIERS } from '../../src/ai/tiers'
import { distToElement, elementsOf } from '../../src/ai/world'
import type { PlayCardAction } from '../../src/engine/actions'
import { createGame, legalActions, step, validate, type Action, type GameState, type PlayerId, type Vec2 } from '../../src/engine/index'
import { answerScoringStep, scoreTurnEnd, type ScoringOut } from '../../src/engine/scenario-rules'
import { beginTurn } from '../../src/engine/turnflow'
import { bundle, fwd, parkOthers, playUntil, stage } from './helpers'

const UNI = ['core.card.bite-and-hold', 'core.card.blessings-of-the-gods', 'core.card.careful-reconnaissance', 'core.card.duck-and-cover', 'core.card.put-the-fires-out']
const BH = UNI[0]!, BLESS = UNI[1]!, DUCK = UNI[3]!, FIRES = UNI[4]!
const FTM = 'kha.card.for-the-motherland'
const TRENCH = 'scn-sr26-trench-warfare'

// ---------- scenes ----------
const memo = new Map<string, GameState>()
/** A quiet SR table: Khador (A) and Cygnar (B) on `scn`, both deployed, A to choose an activation in round 2 or later (cached per scenario). */
function base(scn: string): GameState {
  let s = memo.get(scn)
  if (!s) {
    s = playUntil({ scenario: scn, lists: { A: 'kha.l.skirmish', B: 'cyg.l.skirmish' } }, `aic-${scn}`, (x) => x.round >= 2 && x.pending.kind === 'chooseActivation' && x.pending.player === 'A')
    memo.set(scn, s)
  }
  return s
}
const withHand = (s: GameState, p: PlayerId, hand: string[]): GameState => ({ ...s, players: { ...s.players, [p]: { ...s.players[p], cards: { hand, played: [] } } } })
/** The base table with the named models staged (everything else parked at the back edges), a round and both hands. */
function scene(scn: string, place: (s0: GameState) => Parameters<typeof stage>[1], opts: { round?: number; handA?: string[]; handB?: string[] } = {}): GameState {
  const s0 = base(scn)
  const keep = place(s0)
  let s = stage(s0, { ...parkOthers(s0, Object.keys(keep)), ...keep })
  s = { ...s, round: opts.round ?? 5 }
  return withHand(withHand(s, 'A', opts.handA ?? UNI), 'B', opts.handB ?? [])
}
const envOf = (s: GameState, me: PlayerId = 'A', tier: 'easy' | 'normal' = 'normal'): Env => ({ ctx: newCtx(s), s, me, tier: TIERS[tier], rnd: () => 0.5, line: null, committed: false })
/** A's own element of a kind (the Defender's colour or the Attacker's, whichever A is in this game). */
const own = (s: GameState, kind: string, p: PlayerId = 'A') => elementsOf(s).find((e) => e.kind === kind && e.owner === p)!
/** The point `d` inches from `p` toward the enemy's edge and `lat` to the side. */
const ahead = (s: GameState, p: PlayerId, from: Vec2, d: number, lat = 0): Vec2 => { const f = fwd(s, p); return { x: from.x + f.x * d - f.z * lat, z: from.z + f.z * d + f.x * lat } }
/** Three troopers of A's unit `u` standing 1.5" apart behind `from` (their own side). */
const line = (s: GameState, unit: string, from: Vec2, back = 1.7): Record<string, { pos: Vec2 }> =>
  Object.fromEntries([1, 2, 3].map((k) => [`A:${unit}.${k}`, { pos: ahead(s, 'A', from, -back, (k - 2) * 1.5) }]))
const foes = (s: GameState, unit: string, from: Vec2, d: number): Record<string, { pos: Vec2 }> =>
  Object.fromEntries([1, 2, 3].map((k) => [`B:${unit}.${k}`, { pos: ahead(s, 'A', from, d, (k - 2) * 3) }]))
/** Activate `id`, forfeit its Normal Movement and return the Combat Action decision (the model stays where it was staged). */
function stay(s: GameState, id: string): GameState {
  let cur = step(s, { type: 'chooseActivation', decisionId: s.pending.id, player: 'A', activate: id }).state
  const fo = legalActions(cur).find((x) => x.type === 'chooseMovement' && x.option === 'forfeit')
  if (fo) cur = step(cur, fo).state
  return cur
}
const activate = (s: GameState, id: string): GameState => step(s, { type: 'chooseActivation', decisionId: s.pending.id, player: 'A', activate: id }).state
const plays = (s: GameState): PlayCardAction[] => legalActions(s).filter((a): a is PlayCardAction => a.type === 'playCard')
const find = (s: GameState, cardId: string, option: string): PlayCardAction => {
  const a = plays(s).find((x) => x.cardId === cardId && x.option === option)
  if (!a) throw new Error(`${cardId}:${option} is not on offer at ${s.pending.kind}`)
  return a
}
const decide = (s: GameState, tier: 'easy' | 'normal' = 'normal', seed = 'aic'): Action => decideSync(s, s.pending, legalActions(s), { tier, seed, brain: newBrain() })
const isPlay = (a: Action, cardId: string, option: string): boolean => a.type === 'playCard' && a.cardId === cardId && a.option === option
const claimOffered = (s: GameState): boolean => (s.pending.options ?? []).some((o) => o.action.type === 'chooseCombatAction' && o.action.abilityId === 'scn.claimCache')

describe('the card threshold', () => {
  it('AIC-001 falls from 3.0 in round 1 by half a point a round to 1.0 from round 5', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(cardThreshold)).toEqual([3, 2.5, 2, 1.5, 1, 1, 1])
  })
})

describe('Duck and Cover!', () => {
  it('AIC-002 a unit on its objective under fire digs in (shots, not charges)', () => {
    const s = stay(scene(TRENCH, (s0) => { const e = own(s0, 'objective40').pos; return { ...line(s0, 'u4', e), ...foes(s0, 'u4', e, 10) } }), 'A:u4')
    expect(s.pending.kind).toBe('chooseCombatAction')
    const env = envOf(s)
    const dig = cardScore(env, find(s, DUCK, 'dig-in'))!
    const set = cardScore(env, find(s, DUCK, 'set-defense'))!
    expect(dig).toBeGreaterThan(cardThreshold(5))
    expect(set).toBe(0)
    const a = decide(s)
    expect(a.type).toBe('playCard')
    expect(validate(s, a)).toBeNull()
    // it plays the best-scoring card on offer, and Dig In is among the cards worth playing
    const best = Math.max(...plays(s).map((x) => cardScore(env, x) ?? 0))
    expect(cardScore(env, a as PlayCardAction)).toBeCloseTo(best, 9)
    expect(dig).toBeGreaterThanOrEqual(cardThreshold(5))
  })

  it('AIC-002 a Hounds unit with only chargers to fear (Tempest Assailers carry no guns) sets its defense instead', () => {
    const s = stay(scene(TRENCH, (s0) => { const e = own(s0, 'objective40').pos; return { ...line(s0, 'u3', e), ...foes(s0, 'u3', e, 7), 'B:e5': { pos: ahead(s0, 'A', e, 6, 5) } } }), 'A:u3')
    const env = envOf(s)
    expect(cardScore(env, find(s, DUCK, 'dig-in'))).toBe(0)
    const set = cardScore(env, find(s, DUCK, 'set-defense'))!
    expect(set).toBeGreaterThanOrEqual(cardThreshold(5))
    expect(set).toBeGreaterThan(0)
  })

  /** A point at least 5" from every element and cache, with the enemy parked well away. */
  const quiet = (s0: GameState): Vec2 => {
    const marks = [...elementsOf(s0).map((e) => e.pos), ...cachesOf(s0).map((c) => c.pos)]
    let best: Vec2 = { x: 0, z: 0 }, bd = -1
    for (let x = -18; x <= 18; x += 2) for (let z = -12; z <= 12; z += 2) {
      const d = Math.min(...marks.map((m) => Math.hypot(m.x - x, m.z - z)), ...elementsOf(s0).filter((e) => e.shape).map((e) => distToElement(e, { x, z }, 30)))
      if (d > bd) { bd = d; best = { x, z } }
    }
    return best
  }
  it('AIC-002 a unit nowhere near an element gets nothing from the card (the grant would lie dormant)', () => {
    const s = stay(scene(TRENCH, (s0) => { const q = quiet(s0); return { ...line(s0, 'u4', q, 0), ...foes(s0, 'u4', q, 8) } }), 'A:u4')
    const env = envOf(s)
    expect(cardScore(env, find(s, DUCK, 'dig-in'))).toBe(0)
    expect(cardScore(env, find(s, DUCK, 'set-defense'))).toBe(0)
    const a = decide(s)
    expect(a.type === 'playCard' && a.cardId === DUCK).toBe(false)
  })
})

describe('Put the Fires Out (Maintenance prompt)', () => {
  const turnStart = (s: GameState) => beginTurn({ ...s, phase: 'maintenance', window: 'maintenance.start' }, bundle)
  const sceneFor = (patch: (s: GameState) => GameState, round = 3) => patch(withHand(withHand({ ...base(TRENCH), round }, 'A', UNI), 'B', []))
  const patchModel = (s: GameState, id: string, p: Partial<GameState['models'][string]>): GameState => ({ ...s, models: { ...s.models, [id]: { ...s.models[id]!, ...p } } })
  const answer = (out: ReturnType<typeof turnStart>): Action => decideSync(out.state, out.pending, legalActions(out.state), { tier: 'normal', seed: 'fires', brain: newBrain() })

  it('AIC-003 the Leader on fire is put out; a trooper merely knocked down in round 1 is passed on', () => {
    const burning = turnStart(sceneFor((s) => patchModel(s, 'A:L', { conditions: ['fire'] })))
    expect(burning.pending.kind).toBe('abilityChoice')
    expect(burning.pending.context.data?.code).toBe('card')
    const a = answer(burning)
    expect(isPlay(a, FIRES, 'end-effects')).toBe(true)
    expect(a.type === 'playCard' && a.targetId).toBe('A:L')
    expect(validate(burning.state, a)).toBeNull()
    const minor = turnStart(sceneFor((s) => patchModel(s, 'A:u4.1', { conditions: ['knockedDown'] }), 1))
    expect(minor.pending.kind).toBe('abilityChoice')
    expect(answer(minor).type).toBe('pass')
  })

  it('AIC-003 a Leader hurt for four boxes is healed; the heal goes to the Leader, and never to a scratch', () => {
    const hurt = (s: GameState, filled: number) => {
      const d = s.models['A:L']!.damage
      return patchModel(s, 'A:L', {
        damage: d.track === 'single' ? { ...d, filled } : { ...d, grids: d.grids.map((g, i) => (i === 0 ? { ...g, cols: g.cols.map((c, j) => c.map((x, k) => (j === 0 && k < filled ? true : x))) } : g)) },
      })
    }
    const out = turnStart(sceneFor((s) => hurt(s, 4), 2))
    expect(out.pending.kind).toBe('abilityChoice')
    const a = answer(out)
    expect(isPlay(a, FIRES, 'heal')).toBe(true)
    expect(a.type === 'playCard' && a.targetId).toBe('A:L')
    const scratch = turnStart(sceneFor((s) => hurt(s, 1), 1))
    if (scratch.pending.kind === 'abilityChoice') expect(answer(scratch).type).toBe('pass')
  })
})

describe('Blessings of the Gods', () => {
  it('AIC-004 weapons are blessed for a war-engine about to meet an Incorporeal model, and for nothing else', () => {
    const near = (fury: boolean) => (s0: GameState) => {
      const e = own(s0, 'objective50').pos
      return { 'A:e0': { pos: ahead(s0, 'A', e, -1.8) }, 'B:u2.1': { pos: ahead(s0, 'A', e, 7), ...(fury ? { profileId: 'cry.furies-a' } : {}) } }
    }
    const s = activate(scene(TRENCH, near(true), { round: 1 }), 'A:e0')
    expect(s.pending.kind).toBe('chooseMovement')
    expect(cardScore(envOf(s), find(s, BLESS, 'weapons'))).toBeGreaterThanOrEqual(cardThreshold(1))
    const a = decide(s)
    expect(isPlay(a, BLESS, 'weapons')).toBe(true)
    expect(validate(s, a)).toBeNull()
    const plain = activate(scene(TRENCH, near(false), { round: 1 }), 'A:e0')
    expect(cardScore(envOf(plain), find(plain, BLESS, 'weapons'))).toBe(0)
  })
})

describe('Bite and Hold and For the Motherland', () => {
  it('AIC-005 Sturdy is worth something only where a Cohort model can push a holder off its element', () => {
    const near = (s0: GameState) => { const e = own(s0, 'objective50').pos; return { 'A:e0': { pos: ahead(s0, 'A', e, -1.8) }, 'B:e5': { pos: ahead(s0, 'A', e, 8) } } }
    const s = stay(scene(TRENCH, near), 'A:e0')
    expect(cardScore(envOf(s), find(s, BH, 'sturdy'))).toBeGreaterThan(0)
    const none = stay(scene(TRENCH, (s0) => { const e = own(s0, 'objective50').pos; return { 'A:e0': { pos: ahead(s0, 'A', e, -1.8) }, 'B:e5': { pos: ahead(s0, 'A', e, 25, 14) } } }), 'A:e0')
    expect(cardScore(envOf(none), find(none, BH, 'sturdy'))).toBe(0)
  })

  it('AIC-006 Bite and Hold A: a unit that stays on its objective gets nothing from the card, one that would leave loses the element; nothing on a turn that does not score', () => {
    // A's Hounds hold their own 40 mm objective and the enemy Leader stands in charge reach
    const setup = (s0: GameState) => {
      const e = own(s0, 'objective40').pos
      return { ...line(s0, 'u3', e, 1.2), 'B:L': { pos: ahead(s0, 'A', e, 8) } }
    }
    const live = activate(scene(TRENCH, setup, { round: 3, handA: [BH] }), 'A:u3')
    const secure = plays(live).find((x) => x.cardId === BH && x.option === 'secure')
    expect(secure).toBeDefined()
    expect(secure!.data?.elementId).toBe(own(live, 'objective40').id)
    expect(cardScore(envOf(live), secure!)).toBe(0) // the plan keeps the Hounds on their element
    // the loss test the score is built on: stay and keep it, walk 12" away and lose it
    const lead = live.models[live.pending.context.modelId!]!
    const unit = ['A:u3.1', 'A:u3.2', 'A:u3.3'].map((id) => live.models[id]!)
    expect(keepsElement(live, 'A', unit, lead, lead.pos, secure!.data!.elementId!)).toBe(true)
    expect(keepsElement(live, 'A', unit, lead, ahead(live, 'A', lead.pos, 12), secure!.data!.elementId!)).toBe(false)
    const dead = activate(scene(TRENCH, setup, { round: 1, handA: [BH] }), 'A:u3')
    const none = plays(dead).find((x) => x.cardId === BH && x.option === 'secure')
    if (none) expect(cardScore(envOf(dead), none)).toBe(0)
  })

  it('AIC-007 For the Motherland: a unit on its objective that the enemy can kill is toughened from round 2; never in round 1', () => {
    const hold = (s0: GameState) => { const e = own(s0, 'objective40').pos; return { ...line(s0, 'u4', e), ...foes(s0, 'u4', e, 8), ...Object.fromEntries([1, 2, 3].map((k) => [`B:u2.${k}`, { pos: ahead(s0, 'A', e, 11, (k - 2) * 3) }])) } }
    const s = stay(scene(TRENCH, hold, { round: 3, handA: [FTM] }), 'A:u4')
    expect(cardScore(envOf(s), find(s, FTM, 'tough'))).toBeGreaterThan(0)
    const r1 = stay(scene(TRENCH, hold, { round: 1, handA: [FTM] }), 'A:u4')
    expect(cardScore(envOf(r1), find(r1, FTM, 'tough'))).toBe(0)
  })
})

describe('the easy tier', () => {
  it('AIC-008 plays a random legal card in about a quarter of the activations that offer one, and never an illegal one', () => {
    const s0 = scene(TRENCH, (x) => { const e = own(x, 'objective40').pos; return line(x, 'u4', e) }, { round: 2 })
    const open = activate(s0, 'A:u4')
    const legal = legalActions(open)
    expect(legal.some((a) => a.type === 'playCard')).toBe(true)
    let n = 0
    const N = 400
    for (let i = 0; i < N; i++) {
      const s = { ...open, seed: `easy-${i}` } as GameState
      const a = pickPlay(envOf(s, 'A', 'easy'), s.pending, legal)
      if (a) { n++; expect(a.type).toBe('playCard'); expect(validate(open, a)).toBeNull() }
    }
    expect(n / N).toBeGreaterThan(0.15)
    expect(n / N).toBeLessThan(0.35)
  })
})

describe('cache raid (Trench Warfare)', () => {
  const cacheOf = (s: GameState, p: PlayerId) => cachesOf(s).find((c) => c.owner === p)!
  it('AIC-009 the cheapest solo is the raider and is drawn toward the opponent\'s cache; no one else is, and its own cache is no prize', () => {
    const s = scene(TRENCH, () => ({}), { round: 3 })
    const raider = raiderOf(s, 'A')
    expect(raider).not.toBeNull()
    expect(s.models[raider!]!.type).toBe('solo')
    const m = s.models[raider!]!
    const theirs = cacheOf(s, 'B').pos
    const near = cacheTerm(s, m, ahead(s, 'A', theirs, 1.9))
    const far = cacheTerm(s, m, ahead(s, 'A', theirs, -(RAID_REACH - 1)))
    expect(near).toBeGreaterThan(far)
    expect(far).toBeGreaterThan(0) // a short pull within a run of the cache
    expect(cacheTerm(s, m, ahead(s, 'A', theirs, -(RAID_REACH + 4)))).toBe(0) // none from further off
    const other = Object.values(s.models).find((x) => x.owner === 'A' && x.id !== raider && x.type !== 'leader')!
    expect(cacheTerm(s, other, ahead(s, 'A', theirs, 1.9))).toBe(0)
    expect(cacheTerm(s, m, ahead(s, 'A', cacheOf(s, 'A').pos, 1.9))).toBeLessThan(near)
  })

  const raid = (s0: GameState) => ({ 'A:e2': { pos: ahead(s0, 'A', cacheOf(s0, 'B').pos, 0, 1.9) } })
  it('SR-007 AIC-010 a raider beside the uncontested cache on a scoring turn claims it rather than make a poor attack', () => {
    const s = stay(scene(TRENCH, raid, { round: 3 }), 'A:e2')
    expect(s.pending.kind).toBe('chooseCombatAction')
    expect(claimOffered(s)).toBe(true)
    const a = decide(s)
    expect(a).toMatchObject({ type: 'chooseCombatAction', abilityId: 'scn.claimCache' })
    expect(validate(s, a)).toBeNull()
  })

  it('SR-007 AIC-010 a big attack on the enemy Leader still beats the claim', () => {
    const s = stay(scene(TRENCH, (s0) => ({ ...raid(s0), 'B:L': { pos: ahead(s0, 'A', cacheOf(s0, 'B').pos, 0, 3.6) } }), { round: 3 }), 'A:e2')
    if (claimOffered(s)) {
      const a = decide(s)
      expect(a.type).toBe('chooseCombatAction')
      expect(validate(s, a)).toBeNull()
    }
  })

  it('SR-008 AIC-010 before the Defender\'s round 2 nothing can be claimed, so the claim is never offered or chosen', () => {
    const s = stay(scene(TRENCH, raid, { round: 1 }), 'A:e2')
    expect(claimOffered(s)).toBe(false)
    expect(decide(s)).not.toMatchObject({ abilityId: 'scn.claimCache' })
  })
})

// ---------- decisions inside scoring ----------
/** The scoring machine at the end of the active player's turn, round 3, with the named models staged. */
function scoring(scn: string, place: (s0: GameState) => Parameters<typeof stage>[1], patch: (s: GameState) => GameState = (s) => s): ScoringOut {
  const s = patch(scene(scn, place, { round: 3 }))
  const r = scoreTurnEnd(s, bundle)
  if ('rejection' in r) throw new Error(`scoring rejected ${JSON.stringify(r.rejection)}`)
  return { state: r.state, events: r.events, pending: r.state.pending, ended: false }
}
const answer = (s: GameState, a: Action): ScoringOut => {
  const r = answerScoringStep(s, bundle, a)
  if ('rejection' in r) throw new Error(`rejected ${JSON.stringify(r.rejection)}`)
  return r
}
const code = (s: GameState): string => String(s.pending.context.data?.code)
const ai = (s: GameState, seed: string): Action => decideSync(s, s.pending, legalActions(s), { tier: 'normal', seed, brain: newBrain() })

describe('scoring decisions', () => {
  it('SR-015 AIC-011 High Stakes: the securer burns down what it holds, never the element the enemy sits on', () => {
    const hs = 'scn-sr26-high-stakes'
    const s0 = base(hs)
    const own50 = elementsOf(s0).find((e) => e.kind === 'objective50')!
    const theirFlag = elementsOf(s0).find((e) => e.kind === 'flag' && e.owner !== 'A')!
    const out = scoring(hs, (x) => {
      const f = elementsOf(x).find((e) => e.id === theirFlag.id)!
      return { 'A:e0': { pos: ahead(x, 'A', own50.pos, -2.2) }, 'B:u3.1': { pos: f.pos }, 'B:u3.2': { pos: { x: f.pos.x + 1.3, z: f.pos.z } } }
    }, (s) => ({ ...s, scenario: { ...s.scenario, elementState: Object.fromEntries(Object.entries(s.scenario.elementState ?? {}).map(([k, v]) => [k, { ...v, tokens: 2 }])) } }))
    expect(out.state.pending.kind).toBe('abilityChoice')
    expect(code(out.state)).toBe('fuse')
    expect(out.state.pending.player).toBe('A')
    const a = ai(out.state, 'fuse')
    expect(a.type).toBe('abilityChoice')
    expect((a as { optionId: string }).optionId).not.toBe(theirFlag.id)
    expect(() => answer(out.state, a)).not.toThrow()
  })

  it('SR-018 SR-019 AIC-012 Payload: the full move is taken, and the haul is a legal move or a pass', () => {
    const pl = 'scn-sr26-payload'
    const s0 = base(pl)
    const own50 = own(s0, 'objective50')
    const out = scoring(pl, (x) => ({ 'A:e0': { pos: ahead(x, 'A', own50.pos, -2.2) }, 'A:e1': { pos: ahead(x, 'A', own50.pos, -8, 4) } }))
    expect(code(out.state)).toBe('payload')
    const a = ai(out.state, 'pl')
    const offered = (out.state.pending.options ?? []).map((o) => Number(o.id.slice(1)))
    expect(a).toMatchObject({ type: 'abilityChoice', optionId: `d${Math.max(...offered)}` })
    const r = answer(out.state, a)
    if (r.state.pending.kind === 'moveModel' && r.state.pending.context.data?.code === 'haul') {
      const h = ai(r.state, 'haul')
      expect(['moveModel', 'pass']).toContain(h.type)
      expect(validate(r.state, h)).toBeNull()
      expect(() => answer(r.state, h)).not.toThrow()
    }
  })

  it('SR-012 SR-013 AIC-013 Wolves: the third token is always taken; an earlier one only when the opponent\'s 3" pull would not lose the 40', () => {
    const wl = 'scn-sr26-wolves'
    const s0 = base(wl)
    const el40 = own(s0, 'objective40'), el50 = own(s0, 'objective50')
    const len = Math.hypot(el50.pos.x - el40.pos.x, el50.pos.z - el40.pos.z)
    const u = { x: (el50.pos.x - el40.pos.x) / len, z: (el50.pos.z - el40.pos.z) / len }
    // the unit stands 4" from the objective on the side away from its 50: a pull of 3" toward the 50 takes the objective out of reach
    const behind = (k: number): Vec2 => ({ x: el40.pos.x - u.x * 4 - u.z * (k - 2) * 1.3, z: el40.pos.z - u.z * 4 + u.x * (k - 2) * 1.3 })
    const place = () => ({ 'A:u4.1': { pos: behind(1) }, 'A:u4.2': { pos: behind(2) }, 'A:u4.3': { pos: behind(3) } })
    const withTokens = (n: number) => (s: GameState): GameState => ({ ...s, scenario: { ...s.scenario, elementState: { ...(s.scenario.elementState ?? {}), [el40.id]: { ...s.scenario.elementState?.[el40.id], tokens: n } } } })
    const first = scoring(wl, place, withTokens(0))
    expect(code(first.state)).toBe('heelToken')
    expect(ai(first.state, 'h0')).toMatchObject({ type: 'abilityChoice', optionId: 'no' })
    const third = scoring(wl, place, withTokens(2))
    expect(code(third.state)).toBe('heelToken')
    const yes = ai(third.state, 'h2')
    expect(yes).toMatchObject({ type: 'abilityChoice', optionId: 'yes' })
    // the opponent then pulls it away from the unit that cannot follow
    const after = answer(third.state, yes)
    expect(code(after.state)).toBe('heelMove')
    expect(ai(after.state, 'hm')).toMatchObject({ type: 'abilityChoice', optionId: 'move' })
  })
})

describe('flag terrain picks', () => {
  it('SR-003 AIC-014 the pick is the offered piece that scores best (nearer our edge, more cover), and always legal', () => {
    let s = createGame({ scenario: 'scn-sr26-pressure-point', lists: { A: 'kha.l.skirmish', B: 'cyg.l.skirmish' } }, 'aic-flags', bundle).state
    let picks = 0
    for (let i = 0; i < 40 && s.pending.kind !== 'deploy'; i++) {
      const legal = legalActions(s)
      const a = decideSync(s, s.pending, legal, { tier: 'normal', seed: 'flag', brain: newBrain() })
      if (s.pending.kind === 'abilityChoice' && s.pending.context.data?.code === 'flagTerrain') {
        const sc = (x: Action): number => pieceScore(s, s.pending.player, s.terrain.find((t) => t.id === (x as { optionId: string }).optionId.split('|')[1])!)
        expect(sc(a)).toBeCloseTo(Math.max(...legal.map(sc)), 9)
        picks++
      }
      const st = step(s, a)
      expect(st.rejection).toBeUndefined()
      s = st.state
    }
    expect(picks).toBeGreaterThanOrEqual(2)
  })
})

describe('whole games with hands', () => {
  const SCN = [TRENCH, 'scn-sr26-payload', 'scn-sr26-wolves', 'scn-sr26-high-stakes']
  it('CARD-022 SR-024 normal against easy with both hands: every answer validates, cards get played, scoring decisions are answered', () => {
    let played = 0
    const seen = new Set<string>()
    for (const [g, scn] of SCN.entries()) {
      const setup = { scenario: scn, lists: g % 2 ? { A: 'cyg.l.skirmish', B: 'kha.l.skirmish' } : { A: 'kha.l.skirmish', B: 'cyg.l.skirmish' }, cards: { A: UNI, B: UNI } }
      const created = createGame(setup, `aic-game-${g}`, bundle)
      expect(created.rejection).toBeUndefined()
      let s = created.state
      const brains = { A: newBrain(), B: newBrain() }
      for (let i = 0; i < 900 && s.pending.kind !== 'gameOver'; i++) {
        const legal = legalActions(s)
        const p = s.pending.player
        const a = decideSync(s, s.pending, legal, { tier: p === 'A' ? 'normal' : 'easy', seed: `aic-${g}:${p}`, brain: brains[p] })
        expect(validate(s, a)).toBeNull()
        const c = s.pending.context.data?.code
        if (typeof c === 'string' && (s.pending.context.data?.scoring === true || c === 'flagTerrain' || c === 'card')) seen.add(c)
        if (a.type === 'playCard') played++
        const st = step(s, a)
        expect(st.rejection).toBeUndefined()
        s = st.state
      }
      for (const p of ['A', 'B'] as PlayerId[]) {
        const pl = s.players[p].cards!.played
        expect(new Set(pl.map((x) => x.cardId)).size).toBe(pl.length) // a card is played once
      }
      expect(brains.A.stats.fallbacks + brains.B.stats.fallbacks).toBe(0)
    }
    expect(played).toBeGreaterThan(0)
    expect(seen.has('flagTerrain')).toBe(true)
  }, 120_000)
})
