// Utility decider (40-ai §1-§8): createAiDecider(tier) implements the engine Decider. Each decision builds candidates,
// filters them by the engine (legalActions / validate), applies the Leader's hard safety constraint, scores and picks
// the best (ties broken by the AI seed: hash(seed, decisionId, tier), never state.rng). Anything unexpected falls back
// to the sensible random bot, and the answer is always re-checked with validate before it is returned.
import type { Action, Decider, GameState, ModelId, ModelState, PendingDecision, PlayerView } from '../engine/index'
import { deriveSeed, legalActions, nextFloat, query, validate } from '../engine/index'
import { findLine, type AssassinLine } from './assassin'
import { newCtx, planSequence, profileOf, type Ctx } from './damage'
import { deployAction } from './deploy'
import { allocate, reserveNeeded } from './focus'
import { actKey, activationPriority, bestMove, evalPosition, leaderAllIn, pickBest, planMovement, seqValue, type ActPlan, type Env } from './plan'
import { damageDist, expected, pKillSequence } from './prob'
import { pickSensible } from './random'
import { TIERS, type AiTierId, type TierParams } from './tiers'
import { legalMoveCandidates } from './moves'
import {
  baseRadius, boxesLeft, boxesTotal, dist, enemiesOf, hasAbility, leaderOf, live, meleeWeapons, modelsOf, other, rangedWeapons, rec, valueOf,
} from './world'

// ---------- memory ----------
export interface Brain {
  plans: Map<string, ActPlan>
  line: { key: string; line: AssassinLine | null; committed: boolean } | null
  stats: { decisions: number; ms: number; linesFound: number; linesCommitted: number; fallbacks: number; byKind: Record<string, { n: number; ms: number; max: number }> }
}
export const newBrain = (): Brain => ({ plans: new Map(), line: null, stats: { decisions: 0, ms: 0, linesFound: 0, linesCommitted: 0, fallbacks: 0, byKind: {} } })

export interface DecideOpts { tier: AiTierId; seed: string; brain?: Brain }

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

function rngFor(seed: string, decisionId: string, tier: string): () => number {
  let st = deriveSeed(seed, decisionId, tier)
  return () => { const [f, n] = nextFloat(st); st = n; return f }
}

const turnKey = (s: GameState): string => `${s.round}:${s.turn}:${s.activePlayer}`

// ---------- spells and feats ----------
const effectNamed = (s: GameState, targetId: string, name: string): boolean => s.effects.some((e) => e.name === name && e.targetIds.includes(targetId))

/** Value of casting a spell now (value units), 0 when pointless. */
function spellValue(env: Env, a: Extract<Action, { type: 'castSpell' }>): number {
  const s = env.s
  const sp = rec(a.spellId) as { name?: string; cost?: number; scope?: { who?: string; range?: string }; effect?: { op?: string; stat?: string; value?: number; code?: string }[]; dur?: string; when?: unknown } | undefined
  if (!sp) return 0
  const caster = s.models[a.casterId]
  if (!caster) return 0
  const name = sp.name ?? a.spellId
  const ops = sp.effect ?? []
  if (a.targetId) {
    const t = s.models[a.targetId]
    if (!live(t) || effectNamed(s, t.id, name)) return 0
    const activated = t.unitId ? !!s.units[t.unitId]?.activated : t.activated
    const foesNear = enemiesOf(s, t.owner).filter((e) => dist(e.pos, t.pos) < 16).length
    if (ops.some((o) => o.code === 'avengingForce')) return foesNear ? 1.6 : 0.4
    const buff = ops.filter((o) => o.op === 'modStat').reduce((x, o) => x + (o.value ?? 0), 0)
    if (buff <= 0) return 0.3
    return (activated ? 0.6 : 1.4) + buff * 0.35 + (foesNear ? 0.8 : 0)
  }
  // area buff in CTRL (Deflection): only worth it while it will still be up in the enemy's turn
  if (sp.scope?.who === 'friendly') {
    if (s.firstPlayer !== env.me) return 0
    if (ops.some((o) => o.op === 'modStat' && o.stat === 'DEF') && sp.when) {
      const shooters = enemiesOf(s, env.me).filter((e) => rangedWeapons(e).length > 0).length
      const covered = modelsOf(s, env.me).filter((m) => dist(m.pos, caster.pos) <= 12).length
      return shooters ? 0.3 * covered * Math.min(3, shooters) : 0
    }
    return 0.8
  }
  return 0.5
}

/** Value of using the feat now. */
function featValue(env: Env, casterId: ModelId): number {
  const s = env.s
  const c = s.models[casterId]
  if (!c) return 0
  const near = enemiesOf(s, env.me).filter((e) => dist(e.pos, c.pos) <= 14).length
  if (env.committed && env.line?.useLeader) return 6
  if (s.round >= 6) return 5
  if (s.round >= 2 && near >= 3) return 4
  if (s.round >= 3 && near >= 2) return 3
  return 0
}

/** The best spell/feat to use now, if it beats its cost and keeps the Leader's reserve. */
function anytimePick(env: Env, legal: Action[], reserve: number): Action | null {
  let best: Action | null = null, bv = 0
  for (const a of legal) {
    if (a.type === 'castSpell') {
      const c = env.s.models[a.casterId]
      const cost = (rec(a.spellId)?.cost as number | undefined) ?? 2
      if (!c || c.focus - cost < reserve) continue
      const v = spellValue(env, a) - cost * 0.55
      if (v > bv) { bv = v; best = a }
    } else if (a.type === 'useFeat') {
      const v = featValue(env, a.casterId) - 1
      if (v > bv) { bv = v; best = a }
    }
  }
  return best
}

// ---------- the line ----------
function refreshLine(env: Env, brain: Brain): void {
  if (env.tier.tauGo === null) { env.line = null; env.committed = false; return }
  const key = `${turnKey(env.s)}:${Object.values(env.s.models).filter((m) => m.activated).length}:${Object.values(env.s.units).filter((u) => u.activated).length}`
  if (brain.line?.key === key) { env.line = brain.line.line; env.committed = brain.line.committed; return }
  const line = findLine(env.ctx, env.s, env.me)
  const behind = env.s.scenario.vp[other(env.me)] > env.s.scenario.vp[env.me]
  const go = env.s.round >= 5 && behind ? 0.35 : env.tier.tauGo
  const was = brain.line && brain.line.key.startsWith(turnKey(env.s)) ? brain.line.committed : false
  const pk = line ? Math.max(line.pKillNoLeader, line.useLeader ? line.pKill : 0) : 0
  let committed = false
  if (line) {
    if (pk >= go) committed = true
    else if (was && pk >= env.tier.tauAbort) committed = true
    if (line.pKillNoLeader >= go) line.useLeader = false
    else if (line.pKill >= go) line.useLeader = true
  }
  if (committed && !was) brain.stats.linesCommitted++
  if (line && pk >= go) brain.stats.linesFound++
  brain.line = { key, line, committed }
  env.line = line
  env.committed = committed
}

// ---------- per-decision handlers ----------
function myLeader(env: Env): ModelState | undefined { const L = leaderOf(env.s, env.me); return live(L) ? L : undefined }

const reserveMemo = new WeakMap<Ctx, number>()
function leaderReserve(env: Env, at?: { x: number; z: number }): number {
  const L = myLeader(env)
  if (!L || leaderAllIn(env, L)) return 0
  if (!at) { const hit = reserveMemo.get(env.ctx); if (hit !== undefined) return hit }
  let r: number
  if (env.tier.knapsack) r = reserveNeeded(env.ctx, env.s, env.me, env.tier.tauSafe, env.tier.minReserve, at).reserve
  else {
    // easy: the hard threshold only
    r = reserveNeeded(env.ctx, env.s, env.me, env.tier.tauSafe, env.tier.minReserve, at, false).reserve
  }
  if (!at) reserveMemo.set(env.ctx, r)
  return r
}

function chooseActivation(env: Env, legal: Action[], brain: Brain): Action {
  const acts = legal.filter((a) => a.type === 'chooseActivation') as Extract<Action, { type: 'chooseActivation' }>[]
  if (!acts.length) return legal.find((a) => a.type === 'endTurn') ?? legal[0]!
  refreshLine(env, brain)
  const L = myLeader(env)
  // does the caster want to buff before others act?
  let leaderBuffs = false
  if (L && !L.activated) {
    const jack = modelsOf(env.s, env.me).find((m) => m.type === 'warEngine' && m.controllerId === L.id && !m.activated)
    if (jack) {
      const spells = (rec(L.profileId)?.spells ?? []) as string[]
      for (const id of spells) {
        const sp = rec(id) as { name?: string; cost?: number; scope?: { who?: string }; rng?: unknown } | undefined
        if (!sp || sp.scope?.who !== 'warEngines') continue
        if (!effectNamed(env.s, jack.id, sp.name ?? id) && L.focus >= (sp.cost ?? 2) + env.tier.minReserve && dist(L.pos, jack.pos) <= 10 + 7) leaderBuffs = true
      }
    }
  }
  const ranked = acts.map((a) => ({ a, c: activationPriority(env, a.activate, leaderBuffs) }))
  ranked.sort((x, y) => x.c.priority - y.c.priority || y.c.value - x.c.value || x.a.activate.localeCompare(y.a.activate))
  if (env.tier.noise > 0 && ranked.length > 1 && env.rnd() < env.tier.noise) return ranked[1]!.a
  return ranked[0]!.a
}

function chooseMovement(env: Env, legal: Action[], brain: Brain): Action {
  const pd = env.s.pending
  const leadId = pd.context.modelId
  const lead = leadId ? env.s.models[leadId] : undefined
  if (!live(lead)) return legal[0]!
  refreshLine(env, brain)
  if (lead.type === 'leader') {
    const pick = anytimePick(env, legal, leaderReserve(env))
    if (pick) return pick
  }
  const r = planMovement(env, lead, legal)
  if (!r) return legal.find((a) => a.type === 'chooseMovement' && (a as { option: string }).option === 'advance') ?? legal[0]!
  brain.plans.set(r.plan.key, r.plan)
  return r.action
}

function moveModel(env: Env, legal: Action[], brain: Brain): Action {
  const s = env.s
  const pd = s.pending
  const id = pd.constraints?.modelId ?? pd.context.modelId
  const m = id ? s.models[id] : undefined
  if (!live(m)) return legal[0]!
  const data = (pd.context.data ?? {}) as { trigger?: unknown; mode?: string }
  // charge/slam/trample straight-in options: the engine's point is the plan
  const full = legal.find((a) => a.type === 'moveModel' && (pd.options ?? []).find((o) => o.action === a)?.id === 'full')
  if (full) return full
  if (data.mode === 'trample') return legal[0]!
  const plan = brain.plans.get(actKey(s))
  if (!data.trigger && plan && plan.lead === m.id && plan.dest) {
    const a = { type: 'moveModel', decisionId: pd.id, player: pd.player, modelId: m.id, path: [plan.dest] } as Action
    if (validate(s, a) === null) return a
  }
  // re-plan (a trigger move such as Reposition, or the planned point is gone)
  const maxDist = pd.constraints?.maxDist ?? 0
  const trig = !!data.trigger
  const best = trig
    ? pickBest(env, m, legalMoveCandidates(s, m, maxDist, env.tier.moveSamples).map((c) => evalPosition(env, m, c.pos, { melee: false, ranged: false })))
    : bestMove(env, m, maxDist, { melee: plan?.mode !== 'none', ranged: plan?.mode !== 'none' })
  if (best) {
    const a = { type: 'moveModel', decisionId: pd.id, player: pd.player, modelId: m.id, path: [best.pos] } as Action
    if (trig && dist(best.pos, m.pos) < 0.05 && legal.some((x) => x.type === 'pass')) return legal.find((x) => x.type === 'pass')!
    if (validate(s, a) === null) {
      if (plan && !trig) brain.plans.set(plan.key, { ...plan, dest: best.pos, targetId: best.targetId ?? plan.targetId })
      return a
    }
  }
  return legal[0]!
}

function chargeTarget(env: Env, legal: Action[], brain: Brain): Action {
  const plan = brain.plans.get(actKey(env.s))
  const hit = plan?.targetId ? legal.find((a) => a.type === 'chargeTarget' && a.targetId === plan.targetId) : undefined
  if (hit) return hit
  // best target by melee value from contact
  const me = env.s.pending.context.modelId ? env.s.models[env.s.pending.context.modelId] : undefined
  let best: Action = legal[0]!, bv = -Infinity
  for (const a of legal) {
    if (a.type !== 'chargeTarget' || !me) continue
    const t = env.s.models[a.targetId]
    if (!live(t)) continue
    const d = query.distance(env.s, me.id, t.id)
    const v = valueOf(env.s, t) - d * 0.5 + (t.type === 'leader' ? 2 : 0)
    if (v > bv) { bv = v; best = a }
  }
  return best
}

/** Value of the attacks a combat choice allows from where the model stands. */
function combatValue(env: Env, m: ModelState, mode: 'melee' | 'ranged', focus: number): { v: number; targetId?: ModelId } {
  let best = { v: 0, targetId: undefined as ModelId | undefined }
  const reach = query.threat(env.s, m.id).meleeRange
  const chargeTgt = env.s.activation?.charge?.targetId
  for (const t of enemiesOf(env.s, m.owner)) {
    if (mode === 'melee') {
      const d = query.distance(env.s, m.id, t.id)
      if (d > reach + 0.02) continue
    }
    const ps = planSequence(env.ctx, env.s, m, t, mode, m.pos, { focus, simpleBoost: !env.tier.knapsack, charge: mode === 'melee' && chargeTgt === t.id && !env.s.activation?.perModel[m.id]?.chargeAttackUsed })
    if (!ps) continue
    const v = seqValue(env, t, ps.attacks, ps.exp)
    if (v > best.v) best = { v, targetId: t.id }
  }
  return best
}

function focusFor(env: Env, m: ModelState): number {
  if (m.type !== 'leader') return m.focus
  if (leaderAllIn(env, m) || (env.committed && env.line && !env.line.useLeader && false)) return m.focus
  return Math.max(0, m.focus - leaderReserve(env))
}

function chooseCombatAction(env: Env, legal: Action[], brain: Brain): Action {
  const pd = env.s.pending
  const m = pd.context.modelId ? env.s.models[pd.context.modelId] : undefined
  if (!live(m)) return legal[0]!
  refreshLine(env, brain)
  if (m.type === 'leader') {
    const pick = anytimePick(env, legal, leaderReserve(env))
    if (pick) return pick
  }
  const focus = focusFor(env, m)
  let best: Action | null = null, bv = -Infinity
  const mv = combatValue(env, m, 'melee', focus), rv = combatValue(env, m, 'ranged', focus)
  for (const a of legal) {
    if (a.type !== 'chooseCombatAction') continue
    let v = -1
    switch (a.choice) {
      case 'melee': v = mv.v; break
      case 'ranged': v = rv.v; break
      case 'dual': v = mv.v + rv.v * 0.8 - (mv.v > 0 && rv.v > 0 ? 0 : 0.5); break
      case 'specialAttack': v = rv.v * 0.85 - 0.1; break
      case 'powerAttack': v = mv.v * 0.3 - 0.2; break
      case 'standUp': v = 0.05; break
      case 'specialAction': v = 0.02; break
      case 'forfeit': v = 0; break
    }
    if (v > bv) { bv = v; best = a }
  }
  return best ?? legal[0]!
}

function chooseAttack(env: Env, legal: Action[], brain: Brain): Action {
  const s = env.s
  const pd = s.pending
  const m = pd.context.modelId ? s.models[pd.context.modelId] : undefined
  if (!live(m)) return legal[0]!
  refreshLine(env, brain)
  if (m.type === 'leader') {
    const pick = anytimePick(env, legal, leaderReserve(env))
    if (pick) return pick
  }
  const reserve = m.type === 'leader' && !leaderAllIn(env, m) ? leaderReserve(env) : 0
  let best: Action | null = null, bv = 0.0001
  for (const a of legal) {
    if (a.type !== 'chooseAttack') continue
    const t = s.models[a.targetId]
    if (!live(t)) continue
    if (a.additional && m.focus - 1 < reserve) continue
    let pv
    try { pv = query.attackPreview(s, m.id, a.weaponId, a.targetId, { additional: a.additional, ...(a.attackType ? { attackType: a.attackType } : {}) }) } catch { continue }
    if (pv.legal) continue
    const v = valueOf(s, t), bt = boxesTotal(t)
    const isL = t.type === 'leader'
    let val = (Math.min(pv.expectedDamage, bt) / bt) * v * (isL ? 0.6 : 1) + pv.pKill * (isL ? 400 : v * 0.7)
    if (env.committed && env.line?.targetId === t.id) val *= 1.8
    // finish damaged targets
    val *= 1 + 0.3 * (1 - boxesLeft(t) / bt)
    if (a.additional) val -= m.type === 'leader' ? 0.25 : 0.05
    if (val > bv) { bv = val; best = a }
  }
  if (best) return best
  return legal.find((a) => a.type === 'endAttacks') ?? legal[0]!
}

/** Value of keeping one focus for later in this activation (an additional attack), per model. */
function focusOpportunity(env: Env, m: ModelState): number {
  const s = env.s
  let best = 0
  const reach = query.threat(s, m.id).meleeRange
  for (const t of enemiesOf(s, m.owner)) {
    const d = query.distance(s, m.id, t.id)
    if (d <= reach + 0.02) for (const w of meleeWeapons(m)) {
      const pr = profileOf(env.ctx, s, m, w, t)
      if (pr) best = Math.max(best, seqValue(env, t, [{ p: pr.p, onHit: pr.onHit }], pr.p * expected(pr.onHit)))
    }
    for (const w of rangedWeapons(m)) {
      if (w.reload < 9) continue
      const pr = profileOf(env.ctx, s, m, w, t)
      if (pr) best = Math.max(best, seqValue(env, t, [{ p: pr.p, onHit: pr.onHit }], pr.p * expected(pr.onHit)))
    }
  }
  return best
}

function boostAttack(env: Env, legal: Action[]): Action {
  const s = env.s
  const pd = s.pending
  const yes = legal.find((a) => a.type === 'boostAttack' && a.boost)
  const no = legal.find((a) => a.type === 'boostAttack' && !a.boost) ?? legal[0]!
  const m = pd.context.modelId ? s.models[pd.context.modelId] : undefined
  const t = pd.context.targetId ? s.models[pd.context.targetId] : undefined
  if (!yes || !live(m) || !t) return no
  const reserve = m.type === 'leader' && !leaderAllIn(env, m) ? leaderReserve(env) : 0
  if (m.focus - 1 < reserve) return no
  const p0 = pd.context.odds?.pHit ?? 0, p1 = pd.context.odds?.pHitBoosted ?? p0
  if (!env.tier.knapsack) return p0 < 0.6 && p1 > p0 ? yes : no
  const atk = s.attack
  const k = 2 + (atk?.chargeAttack ? 1 : 0)
  const x = (atk?.powDirect ?? 10) - (atk?.damageTarget ?? 15)
  const onHit = damageDist(k, x)
  const gain = seqValue(env, t, [{ p: p1, onHit }], p1 * expected(onHit)) - seqValue(env, t, [{ p: p0, onHit }], p0 * expected(onHit))
  const opp = focusOpportunity(env, m) * (m.focus <= 1 ? 1 : m.focus === 2 ? 0.6 : 0.35)
  return gain > opp && gain > 0.05 ? yes : no
}

function boostDamage(env: Env, legal: Action[]): Action {
  const s = env.s
  const pd = s.pending
  const opts = pd.options ?? []
  const yesO = opts.find((o) => o.id === 'boost'), noO = opts.find((o) => o.id === 'no')
  const no = (noO?.action ?? legal.find((a) => a.type === 'boostDamage' && !a.boost) ?? legal[0])!
  const m = pd.context.modelId ? s.models[pd.context.modelId] : undefined
  const t = pd.context.targetId ? s.models[pd.context.targetId] : undefined
  if (!yesO || !live(m) || !t || !legal.includes(yesO.action)) return no
  const reserve = m.type === 'leader' && !leaderAllIn(env, m) ? leaderReserve(env) : 0
  if (m.focus - 1 < reserve) return no
  if (!env.tier.knapsack) return t.type === 'leader' || boxesLeft(t) <= 6 ? yesO.action : no
  const v = valueOf(s, t), bt = boxesTotal(t), H = boxesLeft(t)
  const e0 = noO?.odds?.expectedDamage ?? 0, e1 = yesO.odds?.expectedDamage ?? e0
  // pKill against the real remaining boxes (the engine's option odds use a fixed count for grids)
  const k0 = t.damage.track === 'single' ? (noO?.odds?.pKill ?? 0) : 0, k1 = t.damage.track === 'single' ? (yesO.odds?.pKill ?? 0) : 0
  const isL = t.type === 'leader'
  const gain = ((e1 - e0) / bt) * v + (k1 - k0) * (isL ? 400 : v * 0.7) + (H <= e1 + 3 ? 0.2 : 0)
  const opp = focusOpportunity(env, m) * (m.focus <= 1 ? 1 : m.focus === 2 ? 0.6 : 0.35)
  return gain > opp && gain > 0.05 ? yesO.action : no
}

function powerField(env: Env, legal: Action[]): Action {
  const s = env.s
  const pd = s.pending
  const spend = legal.find((a) => a.type === 'powerField' && a.spend === 1)
  const keep = legal.find((a) => a.type === 'powerField' && a.spend === 0) ?? legal[0]!
  const m = pd.context.modelId ? s.models[pd.context.modelId] : undefined
  if (!spend || !m) return keep
  const pts = Number((pd.context.data as { points?: number } | undefined)?.points ?? 0)
  const left = boxesLeft(m)
  if (pts >= left) return spend
  if (left - pts <= 5) return spend
  if (pts >= 3 || m.focus >= 3) return spend
  return keep
}

function allocateFocus(env: Env, legal: Action[]): Action {
  const s = env.s
  const pd = s.pending
  const targets = ((pd.context.data ?? {}) as { targets?: { casterId: ModelId; modelId: ModelId; focus: number }[] }).targets ?? []
  if (!env.tier.knapsack) {
    // easy: fill cohorts, but the Leader keeps one
    const def = legal.find((a) => a.type === 'allocateFocus' && Object.keys(a.allocation).length > 0) as Extract<Action, { type: 'allocateFocus' }> | undefined
    if (!def) return legal[0]!
    const alloc: Record<ModelId, number> = {}
    for (const [id, n] of Object.entries(def.allocation)) {
      const c = s.models[s.models[id]?.controllerId ?? '']
      alloc[id] = c ? Math.max(0, Math.min(n, c.focus - env.tier.minReserve)) : n
    }
    const a = { ...def, allocation: alloc } as Action
    return validate(s, a) === null ? a : def
  }
  const upkeeps = s.effects.filter((e) => e.upkeep && s.models[e.upkeep.casterId]?.owner === env.me)
  const alloc = allocate(env.ctx, s, env.me, env.tier.tauSafe, env.tier.minReserve, targets, {
    upkeepValue: 1.4, upkeeps: upkeeps.length,
    spellValue: (f) => {
      const L = myLeader(env)
      if (!L) return 0
      let v = 0
      for (const id of (rec(L.profileId)?.spells ?? []) as string[]) {
        const sp = rec(id) as { cost?: number } | undefined
        if (sp?.cost && sp.cost <= f) v = Math.max(v, 1.2)
      }
      return v
    },
  })
  const a = { type: 'allocateFocus', decisionId: pd.id, player: pd.player, allocation: alloc } as Action
  return validate(s, a) === null ? a : legal[0]!
}

function payUpkeep(env: Env, legal: Action[]): Action {
  const s = env.s
  const pd = s.pending
  const ids = pd.context.effectIds ?? []
  const keep: string[] = []
  const budget = new Map<ModelId, number>()
  for (const id of ids) {
    const e = s.effects.find((x) => x.id === id)
    if (!e?.upkeep) continue
    const c = s.models[e.upkeep.casterId]
    if (!c) continue
    const reserve = c.type === 'leader' ? env.tier.minReserve : 0
    const left = budget.get(c.id) ?? c.focus
    const tgtAlive = e.targetIds.some((t) => live(s.models[t]))
    if (tgtAlive && left - 1 >= reserve) { keep.push(id); budget.set(c.id, left - 1) }
  }
  const a = { type: 'payUpkeep', decisionId: pd.id, player: pd.player, keep } as Action
  return validate(s, a) === null ? a : legal[0]!
}

function chooseBoxes(env: Env, legal: Action[]): Action {
  const s = env.s
  const t = s.pending.context.modelId ? s.models[s.pending.context.modelId] : undefined
  const cols = ((rec(t?.profileId ?? '')?.damage ?? {}) as { columns?: string[] }).columns ?? []
  let best = legal[0]!, bv = -1
  for (const a of legal) {
    if (a.type !== 'chooseBoxes' || !a.column) continue
    const letters = cols[a.column - 1] ?? ''
    const v = (letters.includes('C') ? 3 : 0) + (/[LR]/.test(letters) ? 2 : 0) + (letters.includes('M') ? 1 : 0)
    if (v > bv) { bv = v; best = a }
  }
  return best
}

function abilityChoice(env: Env, legal: Action[]): Action {
  const s = env.s
  const code = (s.pending.context.data as { code?: string } | undefined)?.code
  if (code === 'powerfulAttack') {
    const m = s.pending.context.modelId ? s.models[s.pending.context.modelId] : undefined
    const yes = legal.find((a) => a.type === 'abilityChoice' && a.optionId === 'powerful')
    const no = legal.find((a) => a.type === 'abilityChoice' && a.optionId === 'no') ?? legal[0]!
    if (!yes || !m) return no
    const reserve = m.type === 'leader' ? leaderReserve(env) : 0
    const p = s.pending.context.odds?.pHit ?? 0.5
    return m.focus - 1 >= reserve && p < 0.9 ? yes : no
  }
  if (code === 'prey') {
    const L = leaderOf(s, other(env.me))
    const pick = legal.find((a) => a.type === 'abilityChoice' && a.optionId === L?.id)
    if (pick) return pick
    let best = legal[0]!, bv = -1
    for (const a of legal) {
      if (a.type !== 'abilityChoice') continue
      const t = s.models[a.optionId]
      const v = t ? valueOf(s, t) : 0
      if (v > bv) { bv = v; best = a }
    }
    return best
  }
  return legal[0]!
}

// ---------- entry ----------
function route(env: Env, pd: PendingDecision, legal: Action[], brain: Brain): Action {
  switch (pd.kind) {
    case 'gameOver': return legal[0]!
    case 'chooseTurnOrder': return legal.find((a) => a.type === 'chooseTurnOrder' && a.order === 'first') ?? legal[0]!
    case 'deploy': case 'advanceDeploy': return deployAction(env.s, legal) ?? legal[0]!
    case 'chooseActivation': return chooseActivation(env, legal, brain)
    case 'chooseMovement': return chooseMovement(env, legal, brain)
    case 'moveModel': return moveModel(env, legal, brain)
    case 'chargeTarget': return chargeTarget(env, legal, brain)
    case 'chooseCombatAction': return chooseCombatAction(env, legal, brain)
    case 'chooseAttack': return chooseAttack(env, legal, brain)
    case 'boostAttack': return boostAttack(env, legal)
    case 'boostDamage': return boostDamage(env, legal)
    case 'powerField': return powerField(env, legal)
    case 'allocateFocus': return allocateFocus(env, legal)
    case 'payUpkeep': return payUpkeep(env, legal)
    case 'shake': return legal.find((a) => a.type === 'shake' && a.shake.length > 0) ?? legal[0]!
    case 'chooseBoxes': return chooseBoxes(env, legal)
    case 'abilityChoice': return abilityChoice(env, legal)
    case 'triggerWindow': return legal.find((a) => a.type === 'triggerWindow') ?? legal[0]!
    case 'placeTroopers': return legal[0]!
    default: return pickSensible(env.s, pd, legal, `${env.ctx.s.seed}:ai`)
  }
}

/** Synchronous core: the sim, the bench and the worker call this. Always returns an action that validates when one exists. */
export function decideSync(state: GameState, pending: PendingDecision, legalIn: Action[] | null, opts: DecideOpts): Action {
  const t0 = now()
  const brain = opts.brain ?? newBrain()
  const tier: TierParams = TIERS[opts.tier]
  let legal = legalIn ?? legalActions(state)
  if (!legal.length && pending.kind !== 'deploy' && pending.kind !== 'advanceDeploy') legal = legalActions(state)
  const env: Env = { ctx: newCtx(state), s: state, me: pending.player, tier, rnd: rngFor(opts.seed, pending.id, tier.id), line: null, committed: false }
  let pick: Action | null = null
  try {
    if (legal.length === 1 && pending.kind !== 'deploy' && pending.kind !== 'advanceDeploy') pick = legal[0]!
    else pick = route(env, pending, legal, brain)
  } catch (e) {
    brain.stats.fallbacks++
    if (typeof process !== 'undefined' && process.env?.AI_DEBUG) console.error('ai error', pending.kind, e)
    pick = null
  }
  if (!pick || (pick.type !== 'ack' && validate(state, pick) !== null)) {
    if (pick) brain.stats.fallbacks++
    pick = legal.length ? pickSensible(state, pending, legal, `${opts.seed}:${pending.player}`) : (deployAction(state, legal) ?? pick)
  }
  const ms = now() - t0
  brain.stats.decisions++
  brain.stats.ms += ms
  const k = (brain.stats.byKind[pending.kind] ??= { n: 0, ms: 0, max: 0 })
  k.n++; k.ms += ms; k.max = Math.max(k.max, ms)
  // nothing legal exists (a zone too small for a base): answer something the engine can reject, never null
  return pick ?? ({ type: pending.kind === 'advanceDeploy' ? 'advanceDeploy' : 'deploy', decisionId: pending.id, player: pending.player, placements: [] } as Action)
}

/** The engine Decider for a tier ('easy' | 'normal'). One brain per decider (per seat). */
export function createAiDecider(tier: AiTierId, seed = 'ai'): Decider & { brain: Brain } {
  const brain = newBrain()
  return {
    brain,
    async decide(view: PlayerView, pending: PendingDecision, legal: Action[]): Promise<Action> {
      return decideSync(view.state, pending, legal, { tier, seed, brain })
    },
  }
}

export { pKillSequence, baseRadius, hasAbility }
export type { Ctx }
