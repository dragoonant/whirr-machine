// Activation ordering and per-activation planning (40-ai §2). A plan picks the movement option, the end point and the
// attack mode/target for one activation by scoring sampled destinations:
//   U = offense (expected damage value + pKill value) + wS * scenario - wT * threat exposure + progress
// with the Leader's safety as a hard filter (40-ai §6). Plans are cached per activation and recomputed on a miss.
import type { Action, GameState, ModelId, ModelState, MovementOption, PlayerId, Vec2 } from '../engine/index'
import { legalActions, query, step, validate } from '../engine/index'
import type { AssassinLine } from './assassin'
import { contactPoint, killChance, planSequence, profileOf, type Ctx } from './damage'
import { attackValueWithFocus, smartReserve } from './focus'
import { rawCandidates, type MoveCand } from './moves'
import { damageDist, expected, type SeqAttack } from './prob'
import { edgeGap, roleGap, rolesFor } from './roles'
import { nearestOpenElement, scenarioValueMoved } from './scenario'
import { forcePenalty, spendCost } from './fury'
import { exposureValue, threatAt, type ThreatReport } from './threat'
import type { TierParams } from './tiers'
import {
  baseRadius, boxesLeft, boxesTotal, dist, distToElement, isBeast, resourceOf, hazardCost, elementsOf, enemiesOf, threatView, leaderOf, live, meleeWeapons, modelsOf, other, rangedWeapons, unitMates, valueOf, weaponsOf, withPositions, rec,
} from './world'

export interface ActPlan {
  key: string
  lead: ModelId
  option: MovementOption
  dest?: Vec2
  targetId?: ModelId
  mode: 'melee' | 'ranged' | 'none'
  score: number
  risk?: number
}

export interface Env {
  ctx: Ctx
  s: GameState
  me: PlayerId
  tier: TierParams
  rnd: () => number
  line: AssassinLine | null
  committed: boolean
}

export const actKey = (s: GameState): string => `${s.round}:${s.turn}:${s.activation?.activeId ?? '-'}`

// ---------- target value ----------
/** Value of an attack sequence on `t` (40 §2: wD E[damage value] + wK pKill value). */
export function seqValue(env: Env, t: ModelState, attacks: SeqAttack[], exp: number): number {
  const v = valueOf(env.s, t), bt = boxesTotal(t)
  const pk = killChance(t, attacks)
  const isL = t.type === 'leader'
  const lineBonus = env.committed && env.line?.targetId === t.id ? 1.6 : 1
  // killing a model that holds or contests an element swings the scenario
  const onElement = elementsOf(env.s).some((el) => distToElement(el, t.pos, t.base) <= el.contestWithin + 0.75)
  const scen = onElement ? (env.tier.wScenario / 6) * 3 * pk : 0
  return ((Math.min(exp, bt) / bt) * v * (isL ? 0.6 : 1) + pk * (isL ? 400 : v * 0.7)) * lineBonus + scen
}

// ---------- threat (fast for most models, exact for the Leader) ----------
interface FixedThreat { e: ModelState; melee: SeqAttack[] | null; meleeExp: number; meleeReach: number; ranged: SeqAttack[] | null; rangedExp: number; rangedReach: number }
const fixedCache = new WeakMap<Ctx, Map<string, FixedThreat[]>>()
function fixedThreats(env: Env, me: ModelState): FixedThreat[] {
  let m = fixedCache.get(env.ctx)
  if (!m) { m = new Map(); fixedCache.set(env.ctx, m) }
  const hit = m.get(me.id)
  if (hit) return hit
  const out: FixedThreat[] = []
  const sv = threatView(env.s, me.owner)
  for (const e of enemiesOf(sv, me.owner)) {
    if (e.inert) continue
    const th = query.threat(sv, e.id)
    const f: FixedThreat = { e, melee: null, meleeExp: 0, meleeReach: th.charge, ranged: null, rangedExp: 0, rangedReach: (th.ranged ?? 0) }
    const focus = e.type === 'warEngine' ? 3 : e.type === 'leader' ? 6 : 0
    if (meleeWeapons(e).length) {
      const ps = planSequence(env.ctx, sv, e, me, 'melee', contactPoint(e, e.pos, me), { charge: true, focus: e.type === 'warEngine' ? 2 : focus })
      if (ps) { f.melee = ps.attacks; f.meleeExp = ps.exp }
    }
    const rws = rangedWeapons(e)
    if (rws.length) {
      // profile from point blank: LOS/range gates are the reach check below
      let best: { attacks: SeqAttack[]; exp: number } | null = null
      for (const w of rws) {
        const from = contactPoint(e, e.pos, me, me.pos, 1.5)
        const pr = profileOf(env.ctx, sv, e, w, me, { fromPos: from })
        if (!pr) continue
        const attacks: SeqAttack[] = Array.from({ length: Math.max(1, w.rof) }, () => ({ p: pr.p, onHit: pr.onHit }))
        const exp = attacks.reduce((a, x) => a + x.p * expectedOf(x.onHit), 0)
        if (!best || exp > best.exp) best = { attacks, exp }
      }
      if (best) { f.ranged = best.attacks; f.rangedExp = best.exp }
    }
    out.push(f)
  }
  m.set(me.id, out)
  return out
}
const expectedOf = (d: number[]): number => d.reduce((a, p, i) => a + p * i, 0)

/** How many of our models (other than me) each enemy can already reach: its attention is shared among them. */
function otherTargets(env: Env, f: FixedThreat, me: ModelState): number {
  let n = 0
  const reach = Math.max(f.melee ? f.meleeReach : 0, f.ranged ? f.rangedReach : 0)
  for (const o of modelsOf(env.s, me.owner)) {
    if (o.id === me.id || (me.unitId && o.unitId === me.unitId)) continue
    if (Math.max(0, dist(f.e.pos, o.pos) - baseRadius(f.e.base) - baseRadius(o.base)) <= reach) n++
  }
  return n
}

/** Threat to a non-Leader model at p from cached per-enemy sequences, weighted by how many other targets each enemy has. */
export function fastThreat(env: Env, me: ModelState, p: Vec2, ignore?: Set<string>): ThreatReport {
  const seqs: SeqAttack[] = [], focused: SeqAttack[] = []
  let exp = 0, attackers = 0
  let hs: GameState | undefined
  for (const f of fixedThreats(env, me)) {
    if (ignore?.has(f.e.id)) continue
    const d = Math.max(0, dist(f.e.pos, p) - baseRadius(f.e.base) - baseRadius(me.base))
    let best: { a: SeqAttack[]; x: number } | null = null
    if (f.melee && d <= f.meleeReach + 0.25) best = { a: f.melee, x: f.meleeExp }
    if (f.ranged && d <= f.rangedReach + 0.25 && (!best || f.rangedExp > best.x)) {
      // terrain cover at p: the shooter's line from where it stands now (it may still step around: never below 35%)
      hs ??= dist(p, me.pos) < 1e-6 ? env.s : withPositions(env.s, { [me.id]: p })
      let k = 1
      if (env.tier.cover) try {
        const los = query.los(hs, f.e.id, me.id)
        // no line at all (a wall, building or hill between): they must move to get one, which costs them reach
        k = !los.visible ? 0.75 : los.mods.cover ? 0.6 : los.mods.concealment ? 0.8 : 1
      } catch { k = 1 }
      const x = f.rangedExp * k
      if (!best || x > best.x) best = { a: k === 1 ? f.ranged : f.ranged.map((r) => ({ ...r, p: r.p * k })), x }
    }
    if (!best) continue
    const n = otherTargets(env, f, me)
    const w = 1 / Math.pow(1 + n, 0.7)
    seqs.push(...best.a)
    if (n === 0) focused.push(...best.a)
    exp += best.x * w
    attackers++
  }
  let pKill = 0
  if (seqs.length) {
    const all = killChance(me, seqs)
    const foc = focused.length ? killChance(me, focused) : 0
    pKill = foc + (all - foc) * 0.35
  }
  return { exp, pKill, seqs, attackers }
}

/**
 * Margin on every hit chance in the Leader's threat. The projection reads the board as it stands, but the enemy still has its
 * feat, spells and auras to play before it shoots (Pall of Ashes takes 2 off DEF, Superiority and Avenging Force add attacks and
 * accuracy), and a Leader that looked 0.2% to die at 3% a shot was dying at 17%. Without the margin a four-objective table
 * lured the Leader onto an objective (it is a legal holder of both kinds) at one assassination loss in ten games; 0.12 cut that
 * to about one in thirty while keeping Normal ahead of Easy (bench seeds 1-4, 40 games each, 69% against 60% with no margin).
 */
export const LEADER_PAD = 0.12
export function padThreat(rep: ThreatReport, pad = LEADER_PAD): ThreatReport {
  if (pad <= 0 || !rep.seqs.length) return rep
  return { ...rep, seqs: rep.seqs.map((q) => ({ ...q, p: q.p + (1 - q.p) * pad })) }
}

// ---------- positions ----------
export interface PosEval { score: number; off: number; pos: Vec2; targetId?: ModelId; mode: 'melee' | 'ranged' | 'none'; risk: number; focusUse: number }

/** Offense from `p`: best single target for the allowed modes. */
function offenseAt(env: Env, m: ModelState, p: Vec2, modes: { melee: boolean; ranged: boolean; charge?: ModelId }, focus: number, mates: number): { v: number; targetId?: ModelId; mode: 'melee' | 'ranged' | 'none'; used: number } {
  let best = { v: 0, targetId: undefined as ModelId | undefined, mode: 'none' as 'melee' | 'ranged' | 'none', used: 0 }
  const simple = !env.tier.knapsack
  const reach = query.threat(env.s, m.id).meleeRange
  for (const t of enemiesOf(env.s, m.owner)) {
    if (modes.charge && t.id !== modes.charge) continue
    const d = Math.max(0, dist(p, t.pos) - baseRadius(m.base) - baseRadius(t.base))
    if ((modes.melee || modes.charge) && meleeWeapons(m).length && d <= reach + 0.05) {
      const ps = planSequence(env.ctx, env.s, m, t, 'melee', p, { focus, charge: !!modes.charge, simpleBoost: simple })
      if (ps) {
        const v = seqValue(env, t, ps.attacks, ps.exp) * (1 + 0.75 * (mates - 1))
        if (v > best.v) best = { v, targetId: t.id, mode: 'melee', used: ps.focusUsed }
      }
    }
    if (modes.ranged && rangedWeapons(m).length) {
      const ps = planSequence(env.ctx, env.s, m, t, 'ranged', p, { focus, simpleBoost: simple })
      if (ps) {
        const v = seqValue(env, t, ps.attacks, ps.exp) * (1 + 0.75 * (mates - 1))
        if (v > best.v) best = { v, targetId: t.id, mode: 'ranged', used: ps.focusUsed }
      }
    }
  }
  return best
}

/** Positions of the activating model's unit mates if the lead stood at `p` (the unit keeps its shape). */
function shiftedMates(s: GameState, m: ModelState, p: Vec2): Record<ModelId, Vec2> {
  const out: Record<ModelId, Vec2> = { [m.id]: p }
  const dx = p.x - m.pos.x, dz = p.z - m.pos.z
  for (const x of unitMates(s, m)) if (x.id !== m.id) out[x.id] = { x: x.pos.x + dx, z: x.pos.z + dz }
  return out
}

/** Score `m` ending at `p` with the given attack modes. */
export function evalPosition(env: Env, m: ModelState, p: Vec2, modes: { melee: boolean; ranged: boolean; charge?: ModelId; aim?: boolean }): PosEval {
  const s = env.s
  const isLeader = m.type === 'leader'
  const mates = unitMates(s, m).length
  // Leader: exact threat, reserve and hard risk
  let risk = 0, reserve = 0, exposure = 0
  if (isLeader) {
    const rep = padThreat(threatAt(env.ctx, s, m, p))
    reserve = leaderAllIn(env, m) ? 0 : env.tier.minReserve
    if (rep.seqs.length && !leaderAllIn(env, m)) {
      const r = env.tier.knapsack ? smartReserve(m, rep.seqs, env.tier.tauSafe, env.tier.minReserve) : null
      if (r) { reserve = r.reserve; risk = r.risk }
      else {
        while (reserve < resourceOf(m) && killChance(m, rep.seqs, reserve) > env.tier.tauSafe) reserve++
        risk = killChance(m, rep.seqs, reserve)
      }
    }
    exposure = (Math.min(rep.exp, boxesTotal(m)) / boxesTotal(m)) * 4 + risk * 30
  } else if (env.tier.wThreat > 0) {
    const rep = fastThreat(env, m, p)
    exposure = exposureValue(s, m, rep) * (mates > 1 ? Math.min(2, 0.7 * mates) : 1) * (rep.attackers > 2 ? 0.8 : 1)
  }
  // a beast's boosts are forced onto it: plan with up to two points of room (the decisions price the frenzy risk)
  const pool = isBeast(m) && env.tier.knapsack ? Math.min(2, query.fury(s, m.id).room) : resourceOf(m)
  const usable = Math.max(0, pool - reserve)
  const committedAll = env.committed && env.line?.steps.some((x) => x.modelId === m.id) && (!isLeader || env.line.useLeader)
  const off = offenseAt(env, m, p, modes, committedAll ? resourceOf(m) : usable, mates)
  // scenario: the engine's control on a hypothetical board with the unit shifted
  const scen = scenarioValueMoved(s, m, shiftedMates(s, m, p))
  // progress toward something useful when nothing scores yet
  let prog = 0
  if (isLeader) {
    const jack = modelsOf(s, m.owner).find((x) => x.type === 'warEngine' && x.controllerId === m.id)
    if (jack) prog -= 0.12 * Math.max(0, dist(p, jack.pos) - 8)
    // stay behind the line: the Leader should not be the closest of ours to the enemy
    const foes = enemiesOf(s, m.owner)
    const dmin = Math.min(...foes.map((e) => dist(e.pos, p)), 99)
    const ours = modelsOf(s, m.owner).filter((x) => x.id !== m.id)
    const oursMin = Math.min(...ours.map((x) => Math.min(...foes.map((e) => dist(e.pos, x.pos)), 99)), 99)
    if (dmin < oursMin) prog -= 0.4 * (oursMin - dmin)
    prog -= 0.05 * nearestOpenElement(s, m.owner, p, m.base)
  } else {
    const role = rolesFor(s, m.owner).get(m.id)
    if (role && role.kind !== 'free') prog -= env.tier.wRole * roleGap(role, p, m.base)
    else {
      const foes = enemiesOf(s, m.owner)
      const dEnemy = Math.min(...foes.map((e) => dist(e.pos, p) - baseRadius(e.base) - baseRadius(m.base)), 99)
      const rng = Math.max(1, ...rangedWeapons(m).map((w) => w.rng))
      prog -= 0.12 * Math.max(0, dEnemy - rng + 1) + 0.04 * nearestOpenElement(s, m.owner, p, m.base)
    }
  }
  prog -= 0.25 * Math.max(0, 3 - edgeGap(s, p, m.base))
  prog += supportPull(env, m, p)
  // terrain hazards: entering one on the way or ending the activation in it costs expected damage (R9.8)
  const hz = hazardCost(s, m, m.pos, p)
  const score = off.v + env.tier.wScenario * scen - env.tier.wThreat * exposure - hz - (isLeader && env.tier.wThreat === 0 ? risk * 60 : 0) + prog
  return { score, off: off.v, pos: p, targetId: off.targetId, mode: off.mode, risk, focusUse: off.used }
}

/** The Leader goes all in only as part of a committed assassination line that needs it. */
export const leaderAllIn = (env: Env, m: ModelState): boolean =>
  m.type === 'leader' && env.committed && !!env.line?.useLeader && env.line.steps.some((x) => x.modelId === m.id)

/** Apply the Leader hard constraint, then pick the best. */
export function pickBest(env: Env, m: ModelState, evals: PosEval[]): PosEval | null {
  if (!evals.length) return null
  let pool = evals
  if (m.type === 'leader' && !leaderAllIn(env, m)) {
    const safe = evals.filter((e) => e.risk <= env.tier.tauSafe + 1e-9)
    if (safe.length) pool = safe
    else { const minR = Math.min(...evals.map((e) => e.risk)); pool = evals.filter((e) => e.risk <= minR + 0.02) }
  }
  const spread = Math.max(1, Math.max(...pool.map((e) => e.score)) - Math.min(...pool.map((e) => e.score)))
  let best: PosEval | null = null, bv = -Infinity
  for (const e of pool) {
    const noise = env.tier.noise > 0 ? (env.rnd() * 2 - 1) * env.tier.noise * spread * 1.7 : env.rnd() * 1e-6
    const v = e.score + noise
    if (v > bv) { bv = v; best = e }
  }
  return best
}

// ---------- movement planning ----------
/** Plan the activation at its chooseMovement decision: option, end point and attack. */
export function planMovement(env: Env, lead: ModelState, legal: Action[]): { action: Action; plan: ActPlan } | null {
  const s = env.s
  const key = actKey(s)
  const options = legal.filter((a) => a.type === 'chooseMovement') as Extract<Action, { type: 'chooseMovement' }>[]
  const all: { action: Action; plan: ActPlan }[] = []
  const consider = (action: Action, plan: ActPlan): void => { all.push({ action, plan }) }
  // a beast pays the frenzy risk of the fury a run or charge puts on it (81 F5.1)
  const forced = (k: number): number => (lead.type === 'beast' && lead.fury !== undefined ? forcePenalty(s, lead, k) : 0)
  for (const o of options) {
    const opt = o.option
    if (opt === 'slam' || opt === 'trample') continue
    if (opt === 'forfeit' || opt === 'aim' || opt === 'standUp') {
      const e = evalPosition(env, lead, lead.pos, { melee: opt === 'standUp', ranged: opt !== 'forfeit' })
      const score = opt === 'forfeit' ? e.score - e.off - 2 : opt === 'aim' ? e.score + (e.mode === 'ranged' ? e.off * 0.25 : -1) : e.score
      consider(o, { key, lead: lead.id, option: opt, mode: opt === 'forfeit' ? 'none' : e.mode, targetId: opt === 'forfeit' ? undefined : e.targetId, score, risk: e.risk })
      continue
    }
    let s1: GameState
    try { const r = step(s, o); if (r.rejection) continue; s1 = r.state } catch { continue }
    if (opt === 'charge') {
      // every target the engine offers; success read from its straight-in end point
      for (const ct of legalOf(s1)) {
        if (ct.type !== 'chargeTarget') continue
        const t = s.models[ct.targetId]
        if (!live(t)) continue
        let s2: GameState
        try { const r = step(s1, ct); if (r.rejection) continue; s2 = r.state } catch { continue }
        const full = (s2.pending.options ?? []).find((x) => x.id === 'full')?.action as Extract<Action, { type: 'moveModel' }> | undefined
        const end = full?.path[full.path.length - 1]
        if (!end) continue
        const reach = query.threat(s, lead.id).meleeRange
        const gap = dist(end, t.pos) - baseRadius(lead.base) - baseRadius(t.base)
        if (gap > reach + 0.02) continue // a failed charge: never planned
        const e = evalPosition(env, lead, end, { melee: true, ranged: false, charge: t.id })
        consider(o, { key, lead: lead.id, option: 'charge', dest: end, targetId: t.id, mode: 'melee', score: e.score + 0.2 - forced(1), risk: e.risk })
      }
      continue
    }
    if (opt !== 'advance' && opt !== 'run') continue
    const maxDist = s1.pending.constraints?.maxDist ?? 0
    const cands: MoveCand[] = s1.pending.kind === 'moveModel' ? candidatePool(env, s1, s1.models[lead.id]!, maxDist, opt === 'advance') : [{ pos: lead.pos, tag: 'stay' }]
    const evals = cands.map((c) => evalPosition(env, lead, c.pos, { melee: opt === 'advance', ranged: opt === 'advance' }))
    const pick = s1.pending.kind === 'moveModel' ? bestLegal(env, s1, s1.models[lead.id]!, evals) : pickBest(env, lead, evals)
    if (pick) consider(o, { key, lead: lead.id, option: opt, dest: pick.pos, targetId: pick.targetId, mode: opt === 'run' ? 'none' : pick.mode, score: pick.score - (opt === 'run' && lead.type === 'warEngine' ? 0.4 : 0) - (opt === 'run' ? forced(1) : 0), risk: pick.risk })
  }
  if (!all.length) return null
  let pool = all
  if (lead.type === 'leader' && !leaderAllIn(env, lead)) {
    const safe = all.filter((x) => (x.plan.risk ?? 0) <= env.tier.tauSafe + 1e-9)
    if (safe.length) pool = safe
    else { const minR = Math.min(...all.map((x) => x.plan.risk ?? 0)); pool = all.filter((x) => (x.plan.risk ?? 0) <= minR + 0.02) }
  }
  return pool.reduce((a, b) => (b.plan.score > a.plan.score ? b : a))
}
/**
 * End points worth scoring for a move of up to maxDist. The raw sampler offers a contact point and a range point per enemy,
 * so with 15 or more enemies on the table most of them lie beyond anything this move can reach and only repeat the ring
 * candidates; those are kept only for the two nearest enemies, and a move that will not attack (a run) drops them all.
 * Points that sit on another base are dropped here; everything else is checked by the engine only for the point that wins
 * (bestLegal), because asking the engine to resolve every sample was most of a decision's cost.
 */
function candidatePool(env: Env, s: GameState, m: ModelState, maxDist: number, attack: boolean): MoveCand[] {
  const r = baseRadius(m.base)
  const rng = Math.max(0, ...rangedWeapons(m).map((w) => w.rng))
  const foes = new Map(enemiesOf(s, m.owner).map((e) => [e.id, Math.max(0, dist(e.pos, m.pos) - r - baseRadius(e.base))]))
  const nearest = new Set([...foes.entries()].sort((a, b) => a[1] - b[1]).slice(0, 2).map(([id]) => id))
  const others = Object.values(s.models).filter((o) => o.id !== m.id && live(o))
  const out: MoveCand[] = []
  for (const c of rawCandidates(s, m, maxDist, env.tier.moveSamples)) {
    const mm = /^(melee|range):(.+)$/.exec(c.tag)
    if (mm) {
      if (!attack) continue
      const gap = foes.get(mm[2]!) ?? 99
      const reach = mm[1] === 'melee' ? 1.5 : rng + 0.5
      if (gap - maxDist > reach + 1 && !nearest.has(mm[2]!)) continue
    }
    if (others.some((o) => dist(o.pos, c.pos) < r + baseRadius(o.base) - 0.01)) continue
    out.push(c)
  }
  return out
}

const moveAction = (s: GameState, m: ModelState, pos: Vec2): Action => ({ type: 'moveModel', decisionId: s.pending.id, player: s.pending.player, modelId: m.id, path: [pos] }) as Action

/** The best scored point the engine accepts on the open moveModel decision: try the winner, then the next, a few times. */
function bestLegal(env: Env, s: GameState, m: ModelState, evals: PosEval[]): PosEval | null {
  let pool = evals
  for (let i = 0; i < 8 && pool.length; i++) {
    const pick = pickBest(env, m, pool)
    if (!pick) return null
    if (validate(s, moveAction(s, m, pick.pos)) === null) return pick
    pool = pool.filter((e) => e !== pick)
  }
  return null
}

/** legalActions for a planning state (never throws). */
const legalOf = (s: GameState): Action[] => { try { return legalActions(s) } catch { return [] } }

/** Best end point for an open moveModel decision (no plan, or the plan's point is not legal). */
export function bestMove(env: Env, m: ModelState, maxDist: number, modes: { melee: boolean; ranged: boolean }): PosEval | null {
  const cands = candidatePool(env, env.s, m, maxDist, modes.melee || modes.ranged)
  const evals = cands.map((c) => evalPosition(env, m, c.pos, modes))
  return bestLegal(env, env.s, m, evals)
}

// ---------- activation order ----------
export interface ActChoice { id: string; priority: number; value: number }

/** Bucket per 40 §2: 0 assassination script, 1 enablers (caster that buffs), 2 shooters, 3 chargers, 4 movers, 9 caster. */
export function activationPriority(env: Env, id: string, leaderBuffs: boolean): ActChoice {
  const s = env.s
  const u = s.units[id]
  const ms = u ? u.troopers.map((t) => s.models[t]).filter(live) : [s.models[id]].filter(live)
  const lead = ms[0]
  if (!lead) return { id, priority: 8, value: 0 }
  if (env.committed && env.line) {
    const idx = env.line.steps.findIndex((x) => x.activationId === id && (!x.leader || env.line!.useLeader))
    if (idx >= 0) return { id, priority: idx * 0.01, value: 100 }
  }
  if (lead.type === 'leader') return { id, priority: leaderBuffs ? 1 : 9, value: 0 }
  if (isEnabler(env, lead)) return { id, priority: 1.5, value: 0 }
  const th = query.threat(s, lead.id)
  let rangedV = 0, meleeV = 0
  for (const t of enemiesOf(s, lead.owner)) {
    const d = Math.max(0, dist(lead.pos, t.pos) - baseRadius(lead.base) - baseRadius(t.base))
    const rws = rangedWeapons(lead)
    if (rws.length && d <= th.advance + Math.max(...rws.map((w) => w.rng))) rangedV = Math.max(rangedV, valueOf(s, t))
    if (meleeWeapons(lead).length && d <= th.charge) meleeV = Math.max(meleeV, valueOf(s, t))
  }
  const v = attackValueWithFocus(env.ctx, s, lead, lead.focus, !env.tier.knapsack) * ms.length
  if (rangedV > 0 && (meleeV === 0 || lead.type !== 'warEngine')) return { id, priority: 2, value: v }
  if (meleeV > 0) return { id, priority: 3, value: v }
  return { id, priority: 4, value: v }
}

export { leaderOf, other }

// ---------- special actions and special attacks ----------
// A special action or attack is a Combat Action choice: it gives up the model's own attacks, so it is worth taking only when its
// value beats what the model would otherwise hit for. Values are in the same units as seqValue (expected damage value plus kill
// value). The anytime ones (Galvanic Capacitor effects, Soul Phase) cost no Combat Action and are used whenever they pay.
type CombatPick = Extract<Action, { type: 'chooseCombatAction' }>
const abTail = (id: string): string => id.slice(id.indexOf('.a.') + 3)
const keywordsOf = (m: ModelState): string[] => ((rec(m.profileId)?.keywords ?? []) as string[])
const edge = (a: ModelState, b: ModelState): number => Math.max(0, dist(a.pos, b.pos) - baseRadius(a.base) - baseRadius(b.base))
const markedBoxes = (m: ModelState): number => Math.max(0, boxesTotal(m) - boxesLeft(m))

/** Value of one basic attack by `m` from where it stands (the Ancillary Attack it would be given). */
function singleAttackValue(env: Env, m: ModelState): number {
  let best = 0
  const reach = query.threat(env.s, m.id).meleeRange
  for (const e of enemiesOf(env.s, m.owner)) {
    const d = edge(m, e)
    for (const w of weaponsOf(m)) {
      if (w.melee ? d > reach + 0.02 : d > w.rng) continue
      const pr = profileOf(env.ctx, env.s, m, w, e)
      if (pr) best = Math.max(best, seqValue(env, e, [{ p: pr.p, onHit: pr.onHit }], pr.p * expected(pr.onHit)))
    }
  }
  return best
}

/** How much the models of `t` (and nearby) would gain from magical weapons: incorporeal enemies close to them. */
function magicNeed(env: Env, t: ModelState): number {
  const n = enemiesOf(env.s, t.owner).filter((e) => dist(e.pos, t.pos) < 12 && ((rec(e.profileId)?.abilities ?? []) as string[]).some((x) => x.includes('incorporeal'))).length
  return n > 0 ? Math.min(2.5, 0.9 * n) : 0.08
}

/** Friendly models a targeted action could name, when the engine has not named one (the code hook picks). */
function friendsIn(s: GameState, m: ModelState, range: number, pred: (x: ModelState) => boolean): ModelState[] {
  return modelsOf(s, m.owner).filter((x) => x.id !== m.id && edge(m, x) <= range && pred(x))
}

export function specialActionValue(env: Env, m: ModelState, a: CombatPick): number {
  const s = env.s
  if (!a.abilityId) return 0.02
  const ab = rec(a.abilityId) as { effect?: { params?: { dice?: string; flat?: number } }[]; scope?: { range?: number } } | undefined
  if (!ab) return 0.02
  const explicit = a.targetId ? s.models[a.targetId] : undefined
  if (a.targetId && !live(explicit)) return 0
  const range = ab.scope?.range ?? 6
  const foes = enemiesOf(s, m.owner)
  const foesNear = (p: Vec2, r: number): number => foes.filter((e) => dist(e.pos, p) - baseRadius(e.base) <= r).length
  const over = (cands: ModelState[], f: (t: ModelState) => number): number => (explicit ? f(explicit) : cands.reduce((b, t) => Math.max(b, f(t)), 0))
  switch (abTail(a.abilityId)) {
    case 'empower': {
      const jacks = friendsIn(s, m, range, (x) => x.type === 'warEngine')
      return over(jacks, (t) => {
        const focusPart = t.crippled.includes('C') || t.focus >= 3 ? 0 : t.activated ? 0.6 : 1.7
        const disrupted = t.conditions.includes('disrupted') ? 1.2 : 0
        return focusPart + disrupted
      })
    }
    case 'sigil-of-power': return over(friendsIn(s, m, range, () => true).concat(m), (t) => magicNeed(env, t))
    case 'guidance': return over(friendsIn(s, m, range, () => true), (t) => 0.2 + magicNeed(env, t))
    case 'necrosurgery': case 'repair': case 'regeneration': {
      const p = ab.effect?.find((n) => n.params)?.params
      const avg = (p?.dice ? 2 : 0) + (p?.flat ?? 0) || 2
      const self = abTail(a.abilityId) === 'regeneration'
      const heal = (t: ModelState): number => {
        const k = Math.min(markedBoxes(t), avg)
        return k <= 0 ? 0 : (k / boxesTotal(t)) * valueOf(s, t) * (t.type === 'leader' ? 1.5 : 1) * 1.2
      }
      let v = self ? heal(m) : over(friendsIn(s, m, Math.max(1, range), () => true), heal)
      if (self && v > 0) { const sc = spendCost(s, m, 1, 0); v = sc.ok ? v - 0.4 - sc.pen : 0 }
      return v
    }
    case 'grim-returns': {
      const units = new Map<string, ModelState>()
      for (const t of explicit ? [explicit] : friendsIn(s, m, range, (x) => !!x.unitId)) if (t.unitId) units.set(t.unitId, t)
      let best = 0
      for (const [uid, t] of units) {
        const u = s.units[uid]
        if (!u || !u.troopers.some((id) => !live(s.models[id]))) continue
        best = Math.max(best, 1.2 + 0.6 * valueOf(s, t) + (elementsOf(s).some((el) => distToElement(el, t.pos, t.base) < 8) ? 0.8 : 0))
      }
      return best
    }
    case 'enliven': {
      const cohort = friendsIn(s, m, range, (x) => x.type === 'warEngine' || x.type === 'beast')
      return over(cohort, (t) => { const n = foesNear(t.pos, 16); return n ? Math.min(1.1, 0.4 + 0.1 * n) : 0.1 })
    }
    case 'ancillary-attack': return over(friendsIn(s, m, range, (x) => x.type === 'warEngine'), (t) => singleAttackValue(env, t) * 0.9)
    case 'power-of-death': {
      let v = 0
      for (const x of modelsOf(s, m.owner)) if (edge(m, x) <= 10 && !x.activated && keywordsOf(x).includes('undead') && meleeWeapons(x).length) v += foesNear(x.pos, 12) ? 0.4 : 0.05
      return Math.min(3, v)
    }
    case 'soul-phase': return foesNear(m.pos, 12) ? 0.4 : 0
    case 'hunters-grace': {
      const n = friendsIn(s, m, 5, (x) => keywordsOf(x).includes('tharn')).length + 1
      return foesNear(m.pos, 16) ? 0.3 + 0.1 * n : 0.1
    }
    case 'sky-shaker': case 'wind-weaver': {
      const shooters = foes.filter((e) => dist(e.pos, m.pos) < 18 && rangedWeapons(e).length > 0).length
      const mates = modelsOf(s, m.owner).filter((x) => x.id !== m.id && edge(m, x) <= 3).length
      return Math.min(2.2, shooters * 0.3 * Math.min(1, (mates + 1) / 3))
    }
    case 'polarity-field-generator': {
      const constructs = foes.filter((e) => (e.type === 'warEngine' || e.type === 'beast') && dist(e.pos, m.pos) < 16).length
      return 0.6 * Math.min(3, constructs)
    }
    case 'lightning-wreath': {
      // the engine names the model (a targeted action): worth most on one that is about to fight
      const melee = explicit ? (meleeWeapons(explicit).length ? [explicit] : []) : friendsIn(s, m, 3, (x) => meleeWeapons(x).length > 0).concat(meleeWeapons(m).length ? [m] : [])
      if (!melee.length) return 0
      return 0.5 + (melee.some((x) => foesNear(x.pos, 5) > 0) ? 0.4 : 0) - (melee.every((x) => x.activated) ? 0.45 : 0)
    }
    case 'righteous-intervention': {
      // once per game: arm it when a fight is near and there is somebody worth stepping in for (a friendly Faction model that is not a Cleanser Sanctifier)
      const kin = friendsIn(s, m, 6, (x) => !x.unitId || x.unitId !== m.unitId).filter((x) => x.profileId.startsWith('men.') && x.profileId !== 'men.cleanser-sanctifier')
      return foesNear(m.pos, 14) > 0 && kin.length > 0 ? 0.45 : 0
    }
    case 'harmonious-exaltation': {
      const L = leaderOf(s, m.owner)
      return L && live(L) && !L.activated && edge(m, L) <= range && resourceOf(L) >= 2 ? 0.7 : 0
    }
    default: return 0.02
  }
}

/** The weapon a star attack uses, when it is one of the model's own. */
function starWeaponOf(m: ModelState, abilityId: string): ReturnType<typeof weaponsOf>[number] | undefined {
  return weaponsOf(m).find((w) => ((rec(w.id)?.abilities ?? []) as string[]).includes(abilityId))
}

/** Best single attack the engine offers once star attack `a` is chosen (previewed with the star active), as a value; null when it cannot be opened. */
function starPreviewValue(env: Env, a: CombatPick): number | null {
  let s1: GameState
  try { const r = step(env.s, a); if (r.rejection) return null; s1 = r.state } catch { return null }
  if (s1.pending.kind !== 'chooseAttack') return null
  let best = 0
  for (const x of legalOf(s1)) {
    if (x.type !== 'chooseAttack' || x.additional) continue
    const t = s1.models[x.targetId]
    if (!live(t)) continue
    let pv
    try { pv = query.attackPreview(s1, a.modelId!, x.weaponId, x.targetId, {}) } catch { continue }
    if (pv.legal) continue
    const v = valueOf(s1, t), bt = boxesTotal(t), isL = t.type === 'leader'
    const val = (Math.min(pv.expectedDamage, bt) / bt) * v * (isL ? 0.6 : 1) + pv.pKill * (isL ? 400 : v * 0.7)
    if (val > best) best = val
  }
  return best > 0 ? best : null
}

/** Value of a special attack choice (melee or ranged), given what the model's plain melee and ranged choices are worth. */
export function specialAttackValue(env: Env, m: ModelState, a: CombatPick, meleeV: number, rangedV: number): number {
  const s = env.s
  const fallback = rangedV * 0.85 - 0.1
  if (!a.abilityId) return fallback
  const name = abTail(a.abilityId)
  const w = starWeaponOf(m, a.abilityId)
  // a star attack whose weapon is not on the card (Razor Wind, Stygian Abyss, Chain Lightning): open it in the engine and read the attacks it offers
  if (!w) return starPreviewValue(env, a) ?? fallback
  if (!['smite', 'combo-strike', 'both-barrels'].includes(name)) return w.melee ? meleeV * 0.85 - 0.1 : fallback
  const reach = query.threat(s, m.id).meleeRange
  let best = 0
  for (const t of enemiesOf(s, m.owner)) {
    const d = edge(m, t)
    if (w.melee ? d > reach + 0.02 : d > w.rng) continue
    const charge = w.melee && !!s.activation?.charge && s.activation.charge.targetId === t.id && !s.activation.perModel[m.id]?.chargeAttackUsed
    const pr = profileOf(env.ctx, s, m, w, t, { charge })
    if (!pr) continue
    const onHit = name === 'smite' ? pr.onHit : damageDist(pr.k, pr.x + 4)
    let v = seqValue(env, t, [{ p: pr.p, onHit }], pr.p * expected(onHit))
    if (name === 'smite') {
      // the slam: a knocked-down, shoved model and collateral damage behind it; shoving a holder off an element is worth more
      const onEl = elementsOf(s).some((el) => distToElement(el, t.pos, t.base) <= el.contestWithin + 0.75)
      v += pr.p * (0.3 * valueOf(s, t) + (onEl ? 0.9 : 0))
    }
    if (v > best) best = v
  }
  return best > 0 ? best : -1
}

/** An anytime special action worth using right now (Galvanic Capacitor effect, Soul Phase), or null. */
export function anytimeSpecial(env: Env, m: ModelState, legal: Action[], floor = 0.35): Action | null {
  let best: Action | null = null, bv = floor
  for (const a of legal) {
    if (a.type !== 'chooseCombatAction' || a.choice !== 'specialAction' || !a.abilityId) continue
    if (env.s.effects.some((e) => e.sourceId === a.abilityId && e.casterId === m.id && (!a.targetId || e.targetIds.includes(a.targetId)))) continue
    const v = specialActionValue(env, m, a)
    if (v > bv) { bv = v; best = a }
  }
  return best
}

// ---------- supports ----------
const SUPPORT_RANGE: Record<string, number> = { empower: 6, 'ancillary-attack': 3, 'power-of-death': 10 }
const supportOf = (m: ModelState): [string, number] | null => {
  for (const id of (rec(m.profileId)?.abilities ?? []) as string[]) { const k = id.slice(id.indexOf('.a.') + 3); const r = SUPPORT_RANGE[k]; if (r !== undefined) return [k, r] }
  return null
}

/** A support model (Empower, Ancillary Attack, Power of Death) acts before the friends it will help, if one of them is within its reach. */
function isEnabler(env: Env, lead: ModelState): boolean {
  const sup = supportOf(lead)
  if (!sup) return false
  const reach = sup[1] + (query.threat(env.s, lead.id).advance || 5)
  return modelsOf(env.s, lead.owner).some((x) => x.id !== lead.id && !(x.unitId ? env.s.units[x.unitId]?.activated : x.activated)
    && (sup[0] === 'power-of-death' ? meleeWeapons(x).length > 0 && ((rec(x.profileId)?.keywords ?? []) as string[]).includes('undead') : x.type === 'warEngine')
    && Math.max(0, dist(x.pos, lead.pos) - baseRadius(x.base) - baseRadius(lead.base)) <= reach)
}

/** A small pull toward standing where the support's action will reach a friend that has not acted (so Empower happens at all). */
function supportPull(env: Env, m: ModelState, p: Vec2): number {
  const sup = supportOf(m)
  if (!sup || sup[0] === 'power-of-death') return 0
  const gap = (x: ModelState): number => Math.max(0, dist(x.pos, p) - baseRadius(x.base) - baseRadius(m.base))
  let best = 0
  for (const x of modelsOf(env.s, m.owner)) {
    if (x.id === m.id || x.type !== 'warEngine' || x.activated) continue
    if (sup[0] === 'empower' && (x.focus >= 3 || x.crippled.includes('C'))) continue
    const g = gap(x)
    if (g <= sup[1] - 0.4) { best = 0.9; break }
    best = Math.max(best, 0.9 - 0.06 * (g - sup[1]))
  }
  return Math.max(0, best)
}
