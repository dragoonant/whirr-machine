// Activation ordering and per-activation planning (40-ai §2). A plan picks the movement option, the end point and the
// attack mode/target for one activation by scoring sampled destinations:
//   U = offense (expected damage value + pKill value) + wS * scenario - wT * threat exposure + progress
// with the Leader's safety as a hard filter (40-ai §6). Plans are cached per activation and recomputed on a miss.
import type { Action, GameState, ModelId, ModelState, MovementOption, PlayerId, Vec2 } from '../engine/index'
import { legalActions, query, step } from '../engine/index'
import type { AssassinLine } from './assassin'
import { contactPoint, killChance, planSequence, profileOf, type Ctx } from './damage'
import { attackValueWithFocus, smartReserve } from './focus'
import { legalMoveCandidates, type MoveCand } from './moves'
import type { SeqAttack } from './prob'
import { edgeGap, roleGap, rolesFor } from './roles'
import { nearestOpenElement, scenarioValue } from './scenario'
import { exposureValue, threatAt, type ThreatReport } from './threat'
import type { TierParams } from './tiers'
import {
  baseRadius, boxesTotal, dist, distToElement, hazardCost, elementsOf, enemiesOf, threatView, leaderOf, live, meleeWeapons, modelsOf, other, rangedWeapons, unitMates, valueOf, withPositions,
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
    const rep = threatAt(env.ctx, s, m, p)
    reserve = leaderAllIn(env, m) ? 0 : env.tier.minReserve
    if (rep.seqs.length && !leaderAllIn(env, m)) {
      const r = env.tier.knapsack ? smartReserve(m, rep.seqs, env.tier.tauSafe, env.tier.minReserve) : null
      if (r) { reserve = r.reserve; risk = r.risk }
      else {
        while (reserve < m.focus && killChance(m, rep.seqs, reserve) > env.tier.tauSafe) reserve++
        risk = killChance(m, rep.seqs, reserve)
      }
    }
    exposure = (Math.min(rep.exp, boxesTotal(m)) / boxesTotal(m)) * 4 + risk * 30
  } else if (env.tier.wThreat > 0) {
    const rep = fastThreat(env, m, p)
    exposure = exposureValue(s, m, rep) * (mates > 1 ? Math.min(2, 0.7 * mates) : 1) * (rep.attackers > 2 ? 0.8 : 1)
  }
  const usable = Math.max(0, m.focus - reserve)
  const committedAll = env.committed && env.line?.steps.some((x) => x.modelId === m.id) && (!isLeader || env.line.useLeader)
  const off = offenseAt(env, m, p, modes, committedAll ? m.focus : usable, mates)
  // scenario: the engine's control on a hypothetical board with the unit shifted
  const hs = withPositions(s, shiftedMates(s, m, p))
  const scen = scenarioValue(hs, hs.models[m.id]!, p)
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
        consider(o, { key, lead: lead.id, option: 'charge', dest: end, targetId: t.id, mode: 'melee', score: e.score + 0.2, risk: e.risk })
      }
      continue
    }
    if (opt !== 'advance' && opt !== 'run') continue
    const maxDist = s1.pending.constraints?.maxDist ?? 0
    const cands: MoveCand[] = s1.pending.kind === 'moveModel' ? legalMoveCandidates(s1, s1.models[lead.id]!, maxDist, env.tier.moveSamples) : [{ pos: lead.pos, tag: 'stay' }]
    const evals = cands.map((c) => evalPosition(env, lead, c.pos, { melee: opt === 'advance', ranged: opt === 'advance' }))
    const pick = pickBest(env, lead, evals)
    if (pick) consider(o, { key, lead: lead.id, option: opt, dest: pick.pos, targetId: pick.targetId, mode: opt === 'run' ? 'none' : pick.mode, score: pick.score - (opt === 'run' && lead.type === 'warEngine' ? 0.4 : 0), risk: pick.risk })
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
/** legalActions for a planning state (never throws). */
const legalOf = (s: GameState): Action[] => { try { return legalActions(s) } catch { return [] } }

/** Best end point for an open moveModel decision (no plan, or the plan's point is not legal). */
export function bestMove(env: Env, m: ModelState, maxDist: number, modes: { melee: boolean; ranged: boolean }): PosEval | null {
  const cands = legalMoveCandidates(env.s, m, maxDist, env.tier.moveSamples)
  const evals = cands.map((c) => evalPosition(env, m, c.pos, modes))
  return pickBest(env, m, evals)
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
