// Command cards for the AI (91 D.3, WP6). The engine offers every legal play as a `playCard` action on the activation's decisions
// (`chooseMovement`, `chooseCombatAction`, `chooseAttack`, or the `startTrigger` prompt) and on the Maintenance prompt (`abilityChoice`,
// `data.code = 'card'`); this file picks one of those actions, or none. Score units are expected boxes of damage, 4 to 5 per VP swing.
// A card is played when its score reaches a threshold that falls from 3.0 in round 1 to 1.0 from round 5 on (cards are worth more late,
// and a hand left unplayed is worth nothing). The easy tier does not score at all: it plays a random legal card in 25 percent of
// the activations (and of the Maintenance prompts) that offer one.
import type { Action, GameState, ModelState, PendingDecision, PlayerId, Vec2 } from '../engine/index'
import type { PlayCardAction } from '../engine/actions'
import { deriveSeed, legalActions, nextFloat, query, step } from '../engine/index'
import { nearScenarioElement } from '../engine/scenario-rules'
import { distToShape, terrainPieces } from '../engine/terrain'
import { contactPoint, planSequence, rangePoint } from './damage'
import { rawCandidates } from './moves'
import { actKey, evalPosition, fastThreat, planMovement, type Env } from './plan'
import { expected } from './prob'
import { threatAt } from './threat'
import {
  activatableOwner, baseRadius, boxesLeft, boxesTotal, bundle, dist, elementsOf, enemiesOf, live, meleeWeapons, modelsOf, rangedWeapons, rec, resourceOf, valueOf, withPositions,
} from './world'

/** Score a card must reach to be played: 3.0 in round 1, falling by 0.5 a round to 1.0 from round 5 (91 D.3). */
export const cardThreshold = (round: number): number => Math.max(1, 3 - 0.5 * (round - 1))

type When = 'start' | 'move' | 'after' | 'maint'
type Scorer = (env: Env, a: PlayCardAction) => number
interface Rule { when: When; score: Scorer }

// ---------------------------------------------------------------------------------------------------------------------------------
// small reads
// ---------------------------------------------------------------------------------------------------------------------------------
const armOf = (m: ModelState): number => ((rec(m.profileId)?.stats ?? {}) as Record<string, number>).ARM ?? 14
const marked = (m: ModelState): number => Math.max(0, boxesTotal(m) - boxesLeft(m))
const edge = (a: ModelState, b: ModelState): number => Math.max(0, dist(a.pos, b.pos) - baseRadius(a.base) - baseRadius(b.base))
const subjectOf = (s: GameState, a: PlayCardAction): ModelState[] => {
  const ms = activatableOwner(s, a.targetId)
  return ms.length ? ms : [s.models[a.targetId]].filter(live)
}
const isIncorporeal = (e: ModelState): boolean =>
  ((rec(e.profileId)?.abilities ?? []) as string[]).some((id) => ((rec(id)?.effect ?? []) as { code?: string; params?: { flag?: string } }[]).some((n) => n.code === 'coreFlag' && n.params?.flag === 'incorporeal'))
/** Any enemy within `r` inches of the model's base (a cheap "is it in danger" test). */
const foesWithin = (s: GameState, m: ModelState, r: number): number => enemiesOf(s, m.owner).filter((e) => !e.inert && edge(m, e) <= r).length

/** What the other side can do to `m` where it stands, split by kind: expected boxes from shots and from charges, and P(kill). */
function exposure(env: Env, m: ModelState): { ranged: number; melee: number; pKill: number } {
  const rep = m.type === 'leader' ? threatAt(env.ctx, env.s, m, m.pos) : fastThreat(env, m, m.pos)
  let r = 0, ml = 0
  for (const q of rep.seqs) { const e = q.p * expected(q.onHit); if (q.melee) ml += e; else r += e }
  const tot = r + ml
  const k = tot > 1e-9 ? Math.min(1, rep.exp / tot) : 0 // the engine's own weighting of shared attention
  const cap = Math.max(1, boxesLeft(m)) // a model cannot lose more than it has
  return { ranged: Math.min(cap, r * k), melee: Math.min(cap, ml * k), pKill: rep.pKill }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Put the Fires Out (Maintenance prompt)
// ---------------------------------------------------------------------------------------------------------------------------------
function firesOutEnd(env: Env, a: PlayCardAction): number {
  const s = env.s
  let total = 0
  for (const m of subjectOf(s, a)) {
    const w = m.type === 'leader' || valueOf(s, m) >= 5 ? 1 : 0.5
    let sc = 0
    const heavy = m.type === 'warEngine' || m.type === 'beast' || valueOf(s, m) >= 8
    for (const c of m.conditions) {
      // fire resolves on 3+ each Maintenance (two on average before it burns out): POW 12 against the model's ARM
      if (c === 'fire') sc += Math.min(boxesLeft(m), 2 * Math.max(0.5, 19 - armOf(m)))
      else if (c === 'corrosion') sc += Math.min(boxesLeft(m), 2)
      else if (c === 'knockedDown') sc += (m.type === 'leader' ? 5 : heavy ? 3 : 0.7) * (foesWithin(s, m, 16) > 0 ? 1 : 0.3)
      else if (c === 'stationary') sc += (heavy ? 2 : 0.5) * (foesWithin(s, m, 16) > 0 ? 1 : 0.3)
      else sc += 0.8
    }
    sc += 0.6 * s.effects.filter((e) => e.shakeable && e.targetIds.includes(m.id)).length
    total += sc * w
  }
  return total
}
function firesOutHeal(env: Env, a: PlayCardAction): number {
  const m = env.s.models[a.targetId]
  if (!live(m)) return 0
  const dmg = marked(m)
  const w = m.type === 'leader' ? 1.5 : valueOf(env.s, m) >= 8 ? 1 : 0.4
  return Math.min(3, dmg) * w * (dmg >= 3 ? 1 : 0.6)
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Blessings of the Gods (start of the activation)
// ---------------------------------------------------------------------------------------------------------------------------------
function blessWeapons(env: Env, a: PlayCardAction): number {
  const s = env.s
  const m = subjectOf(s, a)[0]
  if (!m || !live(m)) return 0
  const th = query.threat(s, m.id)
  const rng = Math.max(0, ...rangedWeapons(m).map((w) => w.rng))
  const reach = Math.max(meleeWeapons(m).length ? th.charge : 0, rangedWeapons(m).length ? th.advance + rng : 0)
  const inc = enemiesOf(s, m.owner).filter((e) => isIncorporeal(e) && edge(m, e) <= reach).length
  if (!inc) return 0
  const n = m.unitId ? (s.units[m.unitId]?.troopers.length ?? 1) : 1
  return Math.min(5, 2.5 + 1.2 * inc) / Math.sqrt(n)
}
/** The best expected boxes `m` can deal this activation with `focus` points to spend (charge, walk-in or shot, from where it stands). */
function bestExp(env: Env, m: ModelState, focus: number): number {
  const s = env.s
  const th = query.threat(s, m.id)
  const rws = rangedWeapons(m)
  const rng = rws.length ? Math.max(...rws.map((w) => w.rng)) : 0
  let best = 0
  for (const t of enemiesOf(s, m.owner)) {
    const d = edge(m, t), bt = boxesTotal(t)
    if (meleeWeapons(m).length && d <= th.charge) {
      const ps = planSequence(env.ctx, s, m, t, 'melee', contactPoint(m, m.pos, t), { charge: d > th.meleeRange, focus })
      if (ps) best = Math.max(best, Math.min(ps.exp, bt))
    }
    if (rws.length && d <= th.advance + rng) {
      const ps = planSequence(env.ctx, s, m, t, 'ranged', rangePoint(m, m.pos, t, rng), { focus })
      if (ps) best = Math.max(best, Math.min(ps.exp, bt))
    }
  }
  return best
}
/** A Leader one point short of the spell it wants is worth the point (an offensive spell more than a buff). */
function spellShortfall(env: Env, m: ModelState): number {
  if (m.type !== 'leader') return 0
  const have = resourceOf(m)
  let best = 0
  for (const id of (rec(m.profileId)?.spells ?? []) as string[]) {
    const sp = rec(id) as { cost?: number; offensive?: boolean } | undefined
    if (!sp?.cost || sp.cost !== have + 1) continue
    const near = enemiesOf(env.s, m.owner).some((e) => edge(m, e) <= 20)
    best = Math.max(best, sp.offensive && near ? 3 : near ? 1.5 : 0.5)
  }
  return best
}
function blessGain(env: Env, a: PlayCardAction): number {
  const s = env.s
  const m = subjectOf(s, a)[0]
  if (!m || !live(m)) return 0
  const gain = a.data?.gain
  if (gain === 'soul' || gain === 'corpse') return 1.0
  if (gain === 'fury' && m.type === 'beast') return 0 // a warbeast's fury is a risk, not a resource
  const f = m.type === 'beast' ? 0 : resourceOf(m)
  if (gain === 'focus' || gain === 'fury') {
    const up = bestExp(env, m, f + 1) - bestExp(env, m, f)
    return Math.max(up >= 2 ? up : up * 0.5, spellShortfall(env, m))
  }
  return 0
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Careful Reconnaissance
// ---------------------------------------------------------------------------------------------------------------------------------
/** Terrain that slows or blocks a walker (rough ground, low walls) within a march of the model: Pathfinder is worth nothing on bare ground. */
function roughNear(s: GameState, m: ModelState): boolean {
  const reach = (query.threat(s, m.id).advance || 6) + 3
  return terrainPieces(s).some((p) => (p.traits.rough || p.traits.move === 'obstacle') && distToShape(m.pos, p.shape) - baseRadius(m.base) <= reach)
}
/** The movement plan the AI would make now (and its score), shared by the cards that compare against it. */
const planMemo = new WeakMap<GameState, { plan: NonNullable<ReturnType<typeof planMovement>>['plan'] | null }>()
function planFor(env: Env, s: GameState, lead: ModelState): NonNullable<ReturnType<typeof planMovement>>['plan'] | null {
  const hit = planMemo.get(s)
  if (hit) return hit.plan
  let plan = null as NonNullable<ReturnType<typeof planMovement>>['plan'] | null
  try { const r = planMovement({ ...env, s }, lead, legalActions(s)); plan = r ? r.plan : null } catch { plan = null }
  planMemo.set(s, { plan })
  return plan
}
const planScore = (env: Env, s: GameState, lead: ModelState): number | null => planFor(env, s, lead)?.score ?? null
const activating = (s: GameState, fallback: ModelState): ModelState => (s.pending.context.modelId ? s.models[s.pending.context.modelId] : undefined) ?? fallback
function reconPathfinder(env: Env, a: PlayCardAction): number {
  const s = env.s
  const m = subjectOf(s, a)[0]
  if (!m || !live(m) || !roughNear(s, m)) return 0
  const base = planScore(env, s, activating(s, m))
  if (base === null) return 0
  let s1: GameState
  try { const r = step(s, a); if (r.rejection) return 0; s1 = r.state } catch { return 0 }
  const lead = s1.models[activating(s, m).id]
  if (!lead) return 0
  const after = planScore(env, s1, lead)
  return after === null ? 0 : Math.max(0, after - base)
}
/** Reposition [3"]: the best spot within 3" of where the model will stand, against where it stands, as a plain score gain. */
const repoMemo = new WeakMap<ModelState, number>() // per model object: it is the same object until something changes it, so the second look in an activation is free
function reconReposition(env: Env, a: PlayCardAction): number {
  const s = env.s
  const subject = subjectOf(s, a)
  const m = subject[0]
  if (!m || !live(m) || foesWithin(s, m, 18) === 0) return 0 // nothing to step away from
  let gain = repoMemo.get(m)
  if (gain === undefined) {
    const here = evalPosition(env, m, m.pos, { melee: false, ranged: false })
    let best = here.score
    for (const c of rawCandidates(s, m, 3, m.type === 'leader' ? 10 : 14)) {
      if (dist(c.pos, m.pos) > 3.01) continue
      const e = evalPosition(env, m, c.pos, { melee: false, ranged: false })
      if (e.score > best) best = e.score
    }
    gain = Math.max(0, best - here.score)
    repoMemo.set(m, gain)
  }
  // the whole unit steps, so the gain counts for each trooper that would
  return gain * Math.min(2, 0.7 * subject.length + 0.3)
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Duck and Cover!
// ---------------------------------------------------------------------------------------------------------------------------------
/** Dig In: cover (+4 DEF against shots) and Resistance: Blast for models near an element; Set Defense: -2 on charge and slam rolls. */
function duck(env: Env, a: PlayCardAction, kind: 'dig' | 'set'): number {
  const s = env.s
  const b = bundle()
  const near = subjectOf(s, a).filter((m) => live(m) && nearScenarioElement(s, b, m.id)).slice(0, 6)
  if (!near.length) return 0
  let ranged = 0, melee = 0
  for (const m of near) { const x = exposure(env, m); ranged += x.ranged; melee += x.melee }
  if (kind === 'dig') return 0.45 * ranged
  return melee > ranged ? 0.25 * melee : 0
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Bite and Hold
// ---------------------------------------------------------------------------------------------------------------------------------
/** A: keep an element this turn that the plan is about to leave. Worth the VP it keeps at this turn's scoring. */
function biteSecure(env: Env, a: PlayCardAction): number {
  const s = env.s
  const eid = a.data?.elementId
  if (!eid) return 0
  const el = elementsOf(s).find((e) => e.id === eid)
  const vp = el ? (el.vpFor?.[env.me] ?? el.vp) : 0
  if (vp <= 0) return 0
  const lead = s.pending.context.modelId ? s.models[s.pending.context.modelId] : undefined
  if (!lead || !live(lead)) return 0
  // only a scoring turn banks it
  const scoring = (rec(s.setup.scenario) as { scoring?: { fromRound?: number; fromPlayer?: string } } | undefined)?.scoring
  const from = scoring?.fromRound ?? 1
  const live2 = s.round > from || (s.round === from && (scoring?.fromPlayer !== 'second' || s.firstPlayer !== env.me))
  if (!live2) return 0
  const dest = planFor(env, s, lead)?.dest
  if (!dest) return 0
  return keepsElement(s, env.me, subjectOf(s, a), lead, dest, eid) ? 0 : 5 * vp
}
/** Does `me` still control the element if the subject (a unit keeps its shape) moves so that `lead` ends at `dest`? */
export function keepsElement(s: GameState, me: PlayerId, subject: ModelState[], lead: ModelState, dest: Vec2, elementId: string): boolean {
  const dx = dest.x - lead.pos.x, dz = dest.z - lead.pos.z
  const moves: Record<string, Vec2> = {}
  for (const m of subject) moves[m.id] = { x: m.pos.x + dx, z: m.pos.z + dz }
  return query.control(withPositions(s, moves)).elements[elementId]?.controller === me
}
/** B: an enemy Cohort model that could push the holder off an element it holds (every warjack and warbeast has the push). */
function biteSturdy(env: Env, a: PlayCardAction): number {
  const s = env.s
  const b = bundle()
  const rep = query.control(s)
  const els = elementsOf(s)
  let total = 0
  for (const m of subjectOf(s, a)) {
    if (!live(m) || !nearScenarioElement(s, b, m.id)) continue
    const th = (id: string): number => query.threat(s, id).charge
    const pushers = enemiesOf(s, m.owner).filter((e) => (e.type === 'warEngine' || e.type === 'beast') && edge(m, e) <= th(e.id) + 0.25).length
    if (!pushers) continue
    for (const [id, c] of Object.entries(rep.elements)) {
      if (c.controller !== env.me || !c.holders.includes(m.id)) continue
      const el = els.find((e) => e.id === id)
      total += 5 * (el ? (el.vpFor?.[env.me] ?? el.vp) : 1) * Math.min(0.5, 0.18 * pushers)
    }
  }
  return total
}

// ---------------------------------------------------------------------------------------------------------------------------------
// For the Motherland (Khador Winter Korps / Old Umbrey)
// ---------------------------------------------------------------------------------------------------------------------------------
function motherland(env: Env, a: PlayCardAction): number {
  const s = env.s
  if (s.round < 2) return 0
  const b = bundle()
  const near = subjectOf(s, a).filter((m) => live(m) && nearScenarioElement(s, b, m.id)).slice(0, 8)
  if (!near.length) return 0
  let kills = 0
  for (const m of near) kills += exposure(env, m).pKill
  return 1.2 * kills
}

// ---------------------------------------------------------------------------------------------------------------------------------
// the table
// ---------------------------------------------------------------------------------------------------------------------------------
const RULES: Record<string, Rule> = {
  'core.card.put-the-fires-out:end-effects': { when: 'maint', score: firesOutEnd },
  'core.card.put-the-fires-out:heal': { when: 'maint', score: firesOutHeal },
  'core.card.blessings-of-the-gods:weapons': { when: 'start', score: blessWeapons },
  'core.card.blessings-of-the-gods:gain': { when: 'start', score: blessGain },
  'core.card.careful-reconnaissance:pathfinder': { when: 'move', score: reconPathfinder },
  'core.card.careful-reconnaissance:reposition': { when: 'after', score: reconReposition },
  'core.card.duck-and-cover:dig-in': { when: 'after', score: (e, a) => duck(e, a, 'dig') },
  'core.card.duck-and-cover:set-defense': { when: 'after', score: (e, a) => duck(e, a, 'set') },
  'core.card.bite-and-hold:secure': { when: 'move', score: biteSecure },
  'core.card.bite-and-hold:sturdy': { when: 'after', score: biteSturdy },
  'kha.card.for-the-motherland:tough': { when: 'after', score: motherland },
}

const isMaintenancePrompt = (pd: PendingDecision): boolean => pd.kind === 'abilityChoice' && (pd.context.data as { code?: string } | undefined)?.code === 'card'

/** Does the rule apply at this decision? Blessings rides the first decision (a movement choice or the start trigger), the others as listed. */
function appliesAt(when: When, pd: PendingDecision): boolean {
  switch (when) {
    case 'maint': return isMaintenancePrompt(pd)
    case 'start': return pd.kind === 'chooseMovement' || (pd.kind === 'abilityChoice' && !isMaintenancePrompt(pd))
    case 'move': return pd.kind === 'chooseMovement'
    case 'after': return pd.kind === 'chooseCombatAction' || pd.kind === 'chooseAttack'
  }
}

/** The score of one play (null when the card has no rule), for tests and tuning. */
export function cardScore(env: Env, a: PlayCardAction): number | null {
  const r = RULES[`${a.cardId}:${a.option}`]
  return r ? r.score(env, a) : null
}

const playKey = (a: PlayCardAction): string => `${a.cardId}:${a.option}:${a.targetId}:${a.data?.elementId ?? ''}${a.data?.gain ?? ''}`

/** Easy tier: a seeded 25 percent roll per activation (or Maintenance prompt) that decides whether it plays a random card at all. */
function easyWants(env: Env, pd: PendingDecision): boolean {
  const key = isMaintenancePrompt(pd) ? `maint:${env.s.round}:${env.s.turn}` : actKey(env.s)
  const [f] = nextFloat(deriveSeed(env.ctx.s.seed, 'card', env.me, key))
  return f < 0.25
}

/**
 * The decider's one call for command cards. Returns a `playCard` action from `legal` worth playing now, the pass answer to the
 * Maintenance prompt when nothing is worth it, or null (the decider carries on with its own handler).
 */
export function pickPlay(env: Env, pd: PendingDecision, legal: Action[]): Action | null {
  if (pd.kind !== 'chooseMovement' && pd.kind !== 'chooseCombatAction' && pd.kind !== 'chooseAttack' && pd.kind !== 'abilityChoice') return null
  const plays = legal.filter((a): a is PlayCardAction => a.type === 'playCard')
  if (!plays.length) return null
  const maint = isMaintenancePrompt(pd)
  const pass = maint ? legal.find((a) => a.type === 'pass') : undefined
  if (env.tier.id === 'easy') {
    if (!easyWants(env, pd)) return pass ?? null
    const ok = plays.filter((a) => { const r = RULES[`${a.cardId}:${a.option}`]; return !r || appliesAt(r.when, pd) })
    return ok.length ? ok[Math.min(ok.length - 1, Math.floor(env.rnd() * ok.length))]! : (pass ?? null)
  }
  const need = cardThreshold(env.s.round)
  let best: PlayCardAction | null = null, bv = -Infinity
  for (const a of plays) {
    const r = RULES[`${a.cardId}:${a.option}`]
    if (!r || !appliesAt(r.when, pd)) continue
    let v: number
    try { v = r.score(env, a) } catch { continue }
    if (v > bv + 1e-9 || (Math.abs(v - bv) <= 1e-9 && best !== null && playKey(a) < playKey(best))) { bv = v; best = a }
  }
  if (best && bv >= need) return best
  return pass ?? null
}

