// Scenario value of a position (40-ai §2 wS term). Control itself is the engine's (query.control on a hypothetical
// state); the shaped part rewards being what an element needs to be held (a warjack or warbeast on a 50 mm objective, a
// whole unit on a 40 mm one, the Leader on either), contesting the enemy's holds, and standing close while it is not yet
// true. The element's own hold rule is read from the scenario record, so the same code serves the 36" Recon scenarios and
// the four-objective Skirmish one.
//
// M13 (91 D.3, WP6): the Steamroller 2026 scenarios add runtime elements (rotated, moved, removed, tokened), per-player scoring
// rules, caches, and decisions raised inside end-of-turn scoring. This file also holds the scenario roles and answers those
// decisions: `pickScenario` is the one call the decider makes (flag terrain pick, cache claim, fuse, heel tokens, Payload, haul).
import type { Action, GameState, ModelId, ModelState, PendingDecision, PlayerId, Vec2 } from '../engine/index'
import { query } from '../engine/index'
import { contesters, scenarioDef, scoringActive } from '../engine/scenario'
import { CLAIM_CACHE_ABILITY } from '../engine/scenario-rules'
import { terrainTraits } from '../engine/terrain'
import { killChance, planSequence } from './damage'
import type { Env } from './plan'
import { exposureValue, threatAt } from './threat'
import {
  baseRadius, boxesLeft, boxesTotal, bundle, dist, distToElement, elementsOf, enemiesOf, forwardOf, halfTable, live, meleeWeapons, modelsOf, other, rangedWeapons, rec, resourceOf,
  valueOf, withPositions, type Element,
} from './world'

// ---------- what an element accepts ----------
export interface ElementSpec { eligible: string[]; excludes: string[]; radius: number; /** SR9: one model of these kinds holds it alone */ single: string[] }
const specCache = new Map<string, Map<string, ElementSpec>>()
const KIND_BASE: Record<string, number> = { objective50: 50, objective40: 40, flag: 30 }

/** Hold-eligibility tokens, contest exclusions and the objective's own base radius, per element id of the open scenario. */
export function elementSpecs(s: GameState): Map<string, ElementSpec> {
  const key = s.setup.scenario
  let hit = specCache.get(key)
  if (hit) return hit
  hit = new Map()
  const def = rec(key) as { elements?: { id: string; kind?: string; hold?: { eligible?: string[]; single?: string[] }; contest?: { excludes?: string[] } }[] } | undefined
  for (const e of def?.elements ?? []) {
    hit.set(e.id, { eligible: e.hold?.eligible ?? ['any'], excludes: e.contest?.excludes ?? ['leader', 'inert', 'disabled', 'wild'], radius: e.kind && KIND_BASE[e.kind] ? baseRadius(KIND_BASE[e.kind]!) : 0, single: e.hold?.single ?? [] })
  }
  specCache.set(key, hit)
  return hit
}
const specOf = (s: GameState, el: Element): ElementSpec => elementSpecs(s).get(el.id) ?? { eligible: ['any'], excludes: ['leader', 'inert', 'disabled', 'wild'], radius: 0, single: [] }

const isCohortType = (m: ModelState): boolean => m.type === 'warEngine' || m.type === 'beast' || m.type === 'battleEngine'
/** Can this group (one unit or one model, never the Leader) satisfy the element's hold rule on its own? */
export function groupCanHold(tokens: string[], g: ModelState[]): boolean {
  if (tokens.includes('any')) return true
  const lead = g[0]!
  if (g.length === 1 && !lead.unitId) {
    if (isCohortType(lead) && (tokens.includes('warEngine') || tokens.includes('battleEngine'))) return true
    if (lead.type === 'solo' && tokens.includes('solo')) return true
    return false
  }
  return tokens.includes('unitAll')
}

/** Edge-to-edge distance from a model of base `mm` at `p` to the element, counting the objective's own base (as the engine does). */
function edgeToElement(el: Element, spec: ElementSpec, p: Vec2, mm: number): number {
  if (el.shape) return Math.max(0, distPoly(el, p) - baseRadius(mm))
  return Math.max(0, dist(p, el.pos) - baseRadius(mm) - spec.radius)
}
function distPoly(el: Element, p: Vec2): number {
  // inside the footprint counts as 0 (the same shape test world.ts uses)
  const pts = el.shape!
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!, b = pts[j]!
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  if (inside) return 0
  let d = Infinity
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!
    const dx = b.x - a.x, dz = b.z - a.z
    const l2 = dx * dx + dz * dz
    const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2))
    d = Math.min(d, Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)))
  }
  return d
}

interface Presence { holdOk: boolean; progress: number; contest: number }
/** What player `p` has at the element right now: can it hold (the element's rule), how far along is it, who contests. */
function presence(s: GameState, el: Element, spec: ElementSpec, p: PlayerId, byUnit: Map<string, ModelState[]>, mine: ModelState[]): Presence {
  const within = el.within - 0.05
  const near = mine.filter((m) => edgeToElement(el, spec, m.pos, m.base) <= within)
  const tok = spec.eligible
  let contest = 0
  for (const m of mine) {
    if (spec.excludes.includes(m.type) || (spec.excludes.includes('inert') && m.inert)) continue
    if (edgeToElement(el, spec, m.pos, m.base) <= el.contestWithin + 0.05) contest++
  }
  if (tok.includes('any')) {
    const n = near.length
    // SR9: a Leader or a solo secures scenario terrain alone
    const alone = spec.single.length > 0 && near.some((m) => (spec.single.includes('leader') && m.type === 'leader') || (spec.single.includes('solo') && m.type === 'solo'))
    return { holdOk: alone || n >= el.models, progress: alone ? 1 : Math.min(1, n / Math.max(1, el.models)) * 0.35, contest }
  }
  const direct = near.filter((m) => (tok.includes('leader') && m.type === 'leader') || (isCohortType(m) && (tok.includes('warEngine') || tok.includes('battleEngine'))) || (m.type === 'solo' && tok.includes('solo')))
  let holdOk = direct.length >= 1, progress = direct.length ? 1 : 0
  if (!holdOk && tok.includes('unitAll')) {
    for (const g of byUnit.values()) {
      if (g[0]!.owner !== p) continue
      const inn = g.filter((m) => edgeToElement(el, spec, m.pos, m.base) <= within).length
      if (inn === g.length) { holdOk = true; progress = 1; break }
      progress = Math.max(progress, 0.35 * (inn / g.length))
    }
  }
  return { holdOk, progress, contest }
}

/** Score of the whole board for `p` from what each side has at each element (shaped), in VP-like units. */
export function shapedScenario(s: GameState, p: PlayerId): number {
  const els = elementsOf(s)
  if (!els.length) return 0
  const byUnit = new Map<string, ModelState[]>()
  const mine: ModelState[] = [], theirs: ModelState[] = []
  for (const m of Object.values(s.models)) {
    if (!live(m) || m.inert) continue
    ;(m.owner === p ? mine : theirs).push(m)
    if (m.unitId) { const g = byUnit.get(m.unitId); if (g) g.push(m); else byUnit.set(m.unitId, [m]) }
  }
  // a unit is whole only if every living trooper is counted: models with a unit id that are live are exactly the troopers
  let score = 0
  for (const el of els) {
    const spec = specOf(s, el)
    const a = presence(s, el, spec, p, byUnit, mine)
    const b = presence(s, el, spec, other(p), byUnit, theirs)
    // M13: an element can be worth different VP to each side (Trench Warfare: a flag's terrain scores only for the opponent of its colour)
    const vMe = el.vpFor?.[p] ?? el.vp, vThem = el.vpFor?.[other(p)] ?? el.vp
    if (b.contest === 0) score += vMe * (a.holdOk ? 1 : a.progress)
    else {
      if (a.contest > 0) score += 0.45 * vThem // contesting denies their point
      if (a.holdOk) score += 0.1
      if (b.holdOk && a.contest === 0) score -= vThem * 0.9
      else if (a.contest === 0 && b.progress > 0) score -= vThem * 0.3
    }
  }
  return score
}

/** VP swing of the engine's control check if `m` stood at `pos` (our VP minus theirs, this scoring point). */
export function controlSwing(s: GameState, m: ModelState, pos: Vec2): number {
  const hs = withPositions(s, { [m.id]: pos })
  return swingOf(hs, m)
}
/** True when the scenario scores through the M13 rules list (the Steamroller 2026 scenarios): the engine's `vpNow` then says what a scoring point would add. */
const usesRules = (s: GameState): boolean => ((rec(s.setup.scenario) as { scoring?: { rules?: unknown[] } } | undefined)?.scoring?.rules?.length ?? 0) > 0
function swingOf(hs: GameState, m: ModelState): number {
  const rep = query.control(hs)
  const me = m.owner
  let v = 0
  if (usesRules(hs)) v = rep.vpNow[me] - hs.scenario.vp[me] - (rep.vpNow[other(me)] - hs.scenario.vp[other(me)])
  else for (const e of Object.values(rep.elements)) { if (e.controller === me) v += 1; else if (e.controller === other(me)) v -= 1 }
  if (rep.killBox[me] && m.type === 'leader') v -= 3
  return v
}

/** Scenario value of `m` at `pos`: engine control swing plus the shaped term. */
export function scenarioValue(s: GameState, m: ModelState, pos: Vec2): number {
  const hs = withPositions(s, { [m.id]: pos })
  return swingOf(hs, m) * 0.6 + shapedScenario(hs, m.owner) + cacheTerm(s, m, pos)
}

// ---------- fast path for move scoring ----------
const baseMemo = new WeakMap<GameState, Map<PlayerId, number>>()

/**
 * Scenario value of the state if the models in `moved` stood at the given points (a unit keeps its shape). A model that is
 * nowhere near an element before and after the move cannot change control, so the board's unmoved value stands in for it
 * (the Leader is the exception: the Kill Box depends on where it stands). Everything else goes through the engine.
 */
export function scenarioValueMoved(s: GameState, m: ModelState, moved: Record<ModelId, Vec2>): number {
  const extra = cacheTerm(s, m, moved[m.id] ?? m.pos)
  const els = elementsOf(s)
  if (!els.length) return extra
  let near = m.type === 'leader'
  if (!near) {
    outer: for (const [id, p] of Object.entries(moved)) {
      const mm = s.models[id]
      if (!mm) continue
      for (const el of els) {
        const reach = Math.max(el.within, el.contestWithin) + 2.4
        const spec = specOf(s, el)
        if (edgeToElement(el, spec, mm.pos, mm.base) <= reach || edgeToElement(el, spec, p, mm.base) <= reach) { near = true; break outer }
      }
    }
  }
  if (near) {
    const hs = withPositions(s, moved)
    return swingOf(hs, m) * 0.6 + shapedScenario(hs, m.owner) + extra
  }
  let byP = baseMemo.get(s)
  if (!byP) { byP = new Map(); baseMemo.set(s, byP) }
  let v = byP.get(m.owner)
  if (v === undefined) { v = swingOf(s, m) * 0.6 + shapedScenario(s, m.owner); byP.set(m.owner, v) }
  return v + extra
}

/** Distance from a point to the nearest element we do not yet hold (for progress when nothing else scores). */
const controlMemo = new WeakMap<GameState, ReturnType<typeof query.control>>()
const controlOf = (s: GameState): ReturnType<typeof query.control> => { let r = controlMemo.get(s); if (!r) { r = query.control(s); controlMemo.set(s, r) } return r }

export function nearestOpenElement(s: GameState, p: PlayerId, pos: Vec2, mm: number): number {
  const rep = controlOf(s)
  let best = Infinity
  for (const el of elementsOf(s)) {
    if (rep.elements[el.id]?.controller === p) continue
    best = Math.min(best, edgeToElement(el, specOf(s, el), pos, mm))
  }
  return Number.isFinite(best) ? best : 0
}


// =====================================================================================================================
// M13 Steamroller 2026 (91 B, D.3): caches, scenario roles and the decisions inside scoring
// =====================================================================================================================
/** VP a claimed cache scores (the scenario's `cache` rule, 2 in Trench Warfare). */
export function cacheVp(s: GameState): number {
  const rules = ((rec(s.setup.scenario) as { scoring?: { rules?: { kind: string; vp?: number }[] } } | undefined)?.scoring?.rules ?? [])
  return rules.find((r) => r.kind === 'cache')?.vp ?? 2
}

export interface CacheInfo { id: string; pos: Vec2; r: number; owner: PlayerId | null }
const cacheMemo = new WeakMap<object, { first: PlayerId | null; list: CacheInfo[] }>()
/** Caches still on the table (a claimed one is gone), with their colour's player. */
export function cachesOf(s: GameState): CacheInfo[] {
  const first = s.firstPlayer ?? null
  const hit = cacheMemo.get(s.scenario)
  if (hit && hit.first === first) return hit.list
  const def = rec(s.setup.scenario) as { elements?: { id: string; kind?: string; owner?: string; pos?: Vec2 }[] } | undefined
  const out: CacheInfo[] = []
  for (const e of def?.elements ?? []) {
    if (e.kind !== 'cache') continue
    const rt = s.scenario.elementState?.[e.id]
    if (rt?.removed) continue
    const owner: PlayerId | null = e.owner === 'A' || e.owner === 'B' ? e.owner : e.owner === 'first' ? first : e.owner === 'second' && first ? other(first) : null
    out.push({ id: e.id, pos: rt?.pos ?? e.pos ?? { x: 0, z: 0 }, r: baseRadius(30), owner })
  }
  cacheMemo.set(s.scenario, { first, list: out })
  return out
}

const raiderMemo = new WeakMap<GameState, Map<PlayerId, ModelId | null>>()
/** The cache raider (91 D.3): the cheapest, quickest lone solo. Null when the army has none or the scenario has no cache to raid. */
export function raiderOf(s: GameState, p: PlayerId): ModelId | null {
  let byP = raiderMemo.get(s)
  if (!byP) { byP = new Map(); raiderMemo.set(s, byP) }
  const hit = byP.get(p)
  if (hit !== undefined) return hit
  let best: ModelState | null = null, bv = Infinity
  if (cachesOf(s).some((c) => c.owner === other(p))) {
    for (const m of modelsOf(s, p)) {
      if (m.type !== 'solo' || m.unitId || m.inert) continue
      let adv = 5
      try { adv = query.threat(s, m.id).advance || 5 } catch { adv = 5 }
      const v = valueOf(s, m) - adv * 0.4
      if (v < bv - 1e-9 || (Math.abs(v - bv) <= 1e-9 && best !== null && m.id < best.id)) { best = m; bv = v }
    }
  }
  const id = best ? best.id : null
  byP.set(p, id)
  return id
}

/**
 * Pull toward the opponent's cache for the raider (value units of the shaped scenario term): the claim itself when it ends within 3" of an
 * uncontested cache on a scoring turn, a smaller one when it would only be set up for the next, and a gentle gradient from afar.
 */
/** The raider is drawn toward a cache only from this close (about a run): a longer pull sent it on lonely marches and lost games (bench: Trench Warfare normal vs easy, 160 games, 52% with the pull from anywhere, 57% from 11", 59% with none). */
export const RAID_REACH = 10
export function cacheTerm(s: GameState, m: ModelState, pos: Vec2): number {
  const caches = cachesOf(s)
  if (!caches.length || raiderOf(s, m.owner) !== m.id) return 0
  const def = scenarioDef(bundle(), s.scenario.id)
  const now = scoringActive(s, def) && s.activePlayer === m.owner
  const vp = cacheVp(s)
  let best = 0
  for (const c of caches) {
    if (c.owner !== other(m.owner)) continue
    const el = def.elements.find((e) => e.id === c.id)
    const d = Math.max(0, dist(pos, c.pos) - c.r - baseRadius(m.base))
    const blocked = el ? contesters(s, el, other(m.owner)).length > 0 : false
    const gain = d <= 2.95 ? (now ? 1.9 : 0.9) : 0.025 * Math.max(0, RAID_REACH - d) // a short pull within a run of it, the claim itself inside 3 inches
    best = Math.max(best, vp * gain * (blocked ? 0.35 : 1))
  }
  return best
}

// ---------- decisions ----------
const choice = (legal: Action[], id: string): Action | undefined => legal.find((a) => a.type === 'abilityChoice' && a.optionId === id)
const passOf = (legal: Action[]): Action | undefined => legal.find((a) => a.type === 'pass')
const stepToward = (from: Vec2, to: Vec2, d: number): Vec2 => {
  const t = dist(from, to)
  if (t < 1e-6) return from
  const k = Math.min(d, t) / t
  return { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k }
}
function withElementPos(s: GameState, id: string, pos: Vec2): GameState {
  const es = s.scenario.elementState ?? {}
  return { ...s, scenario: { ...s.scenario, elementState: { ...es, [id]: { ...es[id], pos } } } }
}
const armOf = (m: ModelState): number => ((rec(m.profileId)?.stats ?? {}) as Record<string, number>).ARM ?? 14

/**
 * The decider's one call for scenario decisions: flag terrain picks, cache claims in the Combat Action, and the choices raised inside
 * end-of-turn scoring (fuse, heel tokens, Payload, haul). Null leaves the decision to the decider's own handlers.
 */
export function pickScenario(env: Env, pd: PendingDecision, legal: Action[]): Action | null {
  if (pd.kind === 'chooseCombatAction') return claimPick(env, pd, legal)
  const data = (pd.context.data ?? {}) as Record<string, unknown>
  if (pd.kind === 'moveModel') return data.code === 'haul' ? haulPick(env, pd, legal) : null
  if (pd.kind !== 'abilityChoice') return null
  switch (data.code) {
    case 'flagTerrain': return flagPick(env, legal)
    case 'fuse': return fusePick(env, legal)
    case 'heelToken': return heelTokenPick(env, pd, legal)
    case 'heelMove': return heelMovePick(env, pd, legal)
    case 'payload': return payloadPick(legal)
    default: return null
  }
}

// ---- flag terrain (SR10): the piece nearer our own edge with the most cover for the units that will stand in it ----
export function pieceScore(s: GameState, me: PlayerId, t: GameState['terrain'][number]): number {
  const tr = terrainTraits(t)
  const f = forwardOf(s, me)
  const { hw, hd } = halfTable(s)
  const depth = (t.pos.x + f.x * hw) * f.x + (t.pos.z + f.z * hd) * f.z // 0 on our edge, the table's depth on theirs
  let v = -0.18 * depth
  if (tr.insideCover !== 'none' || tr.forest) v += 2.5
  if (tr.move === 'none') v += 1 // a piece a base can stand inside
  else if (tr.move === 'impassable') v += 0.3
  return v
}
function flagPick(env: Env, legal: Action[]): Action | null {
  let best: Action | null = null, bv = -Infinity
  for (const a of legal) {
    if (a.type !== 'abilityChoice') continue
    const pieceId = a.optionId.split('|')[1]
    const t = env.s.terrain.find((x) => x.id === pieceId)
    if (!t) continue
    const v = pieceScore(env.s, env.me, t)
    if (v > bv + 1e-9) { bv = v; best = a }
  }
  return best
}

// ---- High Stakes fuse: burn down what we hold (the zero-token bonus) and what hurts them, never what they hold ----
function blastValue(s: GameState, el: Element, radius: number, pow: number, me: PlayerId): number {
  let v = 0
  for (const m of Object.values(s.models)) {
    if (!live(m)) continue
    const d = distToElement(el, m.pos, m.base) - (el.shape ? 0 : radius)
    if (el.area ? d > 0.05 : d > 3) continue
    const E = Math.max(0, 7 + pow - armOf(m))
    const bl = boxesLeft(m), bt = boxesTotal(m)
    const isL = m.type === 'leader'
    const pk = Math.min(1, Math.max(0, (E - bl + 3) / 6))
    const val = (Math.min(E, bl) / bt) * valueOf(s, m) * (isL ? 0.6 : 1) + pk * (isL ? 400 : valueOf(s, m) * 0.7)
    v += m.owner === me ? -val : val
  }
  return v
}
function fusePick(env: Env, legal: Action[]): Action | null {
  const s = env.s
  const rep = query.control(s)
  const fuse = ((rec(s.setup.scenario) as { special?: { kind: string; blast?: { pow?: number } }[] } | undefined)?.special ?? []).find((x) => x.kind === 'fuse')
  const pow = fuse?.blast?.pow ?? 14
  const els = new Map(elementsOf(s).map((e) => [e.id, e]))
  let best: Action | null = null, bv = -Infinity
  for (const a of legal) {
    if (a.type !== 'abilityChoice') continue
    const el = els.get(a.optionId)
    if (!el) continue
    const t = el.tokens ?? 0
    const pZero = t <= 0 || t >= 4 ? 0 : (4 - t) / 3 // P(d3 takes the last token off)
    const ctrl = rep.elements[el.id]?.controller ?? null
    const zeroBonus = el.kind === 'objective50' || el.kind === 'flag' ? (ctrl === env.me ? 10 : ctrl === null ? 0 : -10) : 0
    const blast = blastValue(s, el, specOf(s, el).radius, pow, env.me)
    const v = pZero * (blast + zeroBonus) + (1 - pZero) * (ctrl === env.me ? 0.4 : ctrl === null ? 0 : -0.8) - t * 0.01
    if (v > bv + 1e-9) { bv = v; best = a }
  }
  return best
}

// ---- Wolves at Our Heels: tokens toward the race, the pull of the opponent's 3" move ----
function heelTokenPick(env: Env, pd: PendingDecision, legal: Action[]): Action | null {
  const d = (pd.context.data ?? {}) as { elementId?: string; tokens?: number }
  const yes = choice(legal, 'yes'), no = choice(legal, 'no') ?? passOf(legal)
  if (!yes) return no ?? null
  const s = env.s
  if ((s.scenario.onceDone ?? []).includes('tokenRace')) return no ?? yes // the race is settled: a token only invites the pull
  if ((d.tokens ?? 0) + 1 >= 3) return yes // the third token is the race
  const els = elementsOf(s)
  const el = els.find((e) => e.id === d.elementId)
  const fifty = el ? els.find((e) => e.kind === 'objective50' && e.owner === el.owner) : undefined
  if (!el) return no ?? yes
  if (!fifty) return yes
  const hs = withElementPos(s, el.id, stepToward(el.pos, fifty.pos, 3))
  return query.control(hs).elements[el.id]?.controller === env.me ? yes : (no ?? yes)
}
function heelMovePick(env: Env, pd: PendingDecision, legal: Action[]): Action | null {
  const d = (pd.context.data ?? {}) as { elementId?: string; move?: number }
  const move = choice(legal, 'move'), stay = choice(legal, 'stay') ?? passOf(legal)
  if (!move) return stay ?? null
  const s = env.s
  const els = elementsOf(s)
  const el = els.find((e) => e.id === d.elementId)
  const fifty = el ? els.find((e) => e.kind === 'objective50' && e.owner === el.owner) : undefined
  const owner = el?.owner ?? null
  if (!el || !fifty || !owner) return stay ?? move
  const to = stepToward(el.pos, fifty.pos, d.move ?? 3)
  if (dist(to, el.pos) < 0.05) return stay ?? move
  const before = query.control(s).elements[el.id]
  const after = query.control(withElementPos(s, el.id, to)).elements[el.id]
  const lost = before?.controller === owner && after?.controller !== owner
  const holders = (before?.holders ?? []).map((id) => s.models[id]).filter(live)
  const away = holders.length > 0 && Math.min(...holders.map((h) => dist(h.pos, to))) - Math.min(...holders.map((h) => dist(h.pos, el.pos))) >= 1.5
  const mine = modelsOf(s, env.me).filter((m) => m.type !== 'leader')
  const closer = mine.length > 0 && Math.min(...mine.map((m) => dist(m.pos, el.pos))) - Math.min(...mine.map((m) => dist(m.pos, to))) >= 1
  return lost || away || closer ? move : (stay ?? move)
}

// ---- Payload: the bot always moves its 50 the full distance toward the opponent's terrain ----
function payloadPick(legal: Action[]): Action | null {
  let best: Action | null = null, bk = -1
  for (const a of legal) {
    if (a.type !== 'abilityChoice') continue
    const k = Number(a.optionId.slice(1))
    if (Number.isFinite(k) && k > bk) { bk = k; best = a }
  }
  return best
}
/** Made To Haul: bring a Cohort model up to the 50 when that puts it back in holding range (and not into a crowd of guns); else stay. */
function haulPick(env: Env, pd: PendingDecision, legal: Action[]): Action | null {
  const d = (pd.context.data ?? {}) as { toward?: Vec2 }
  const target = d.toward
  const stay = passOf(legal)
  if (!target) return stay ?? null
  const s = env.s
  let best: Action | null = null, bv = 0.5
  for (const a of legal) {
    if (a.type !== 'moveModel') continue
    const m = s.models[a.modelId]
    const to = a.path[a.path.length - 1]
    if (!live(m) || !to) continue
    const gap = (p: Vec2): number => Math.max(0, dist(p, target) - baseRadius(50) - baseRadius(m.base))
    const before = gap(m.pos), after = gap(to)
    let v = (before > 2.95 && after <= 2.95 ? 6 : 0) + 0.25 * (before - after)
    try { v -= env.tier.wThreat * exposureValue(s, m, threatAt(env.ctx, s, m, to, { cheap: true })) * 0.5 } catch { /* planning only */ }
    if (v > bv) { bv = v; best = a }
  }
  return best ?? stay ?? null
}

// ---- Trench Warfare caches: claim when the Combat Action is worth less than the VP ----
/** Value (same units as seqValue) of the best attack `m` can make from where it stands. */
function fightValue(env: Env, m: ModelState): number {
  const s = env.s
  const th = query.threat(s, m.id)
  const f = m.type === 'leader' ? Math.max(0, resourceOf(m) - 1) : m.type === 'beast' ? 0 : m.focus
  const rws = rangedWeapons(m)
  const rng = rws.length ? Math.max(...rws.map((w) => w.rng)) : 0
  let best = 0
  for (const t of enemiesOf(s, m.owner)) {
    const d = Math.max(0, dist(m.pos, t.pos) - baseRadius(m.base) - baseRadius(t.base))
    const bt = boxesTotal(t), v = valueOf(s, t), isL = t.type === 'leader'
    const val = (ps: ReturnType<typeof planSequence>): number => (ps ? (Math.min(ps.exp, bt) / bt) * v * (isL ? 0.6 : 1) + killChance(t, ps.attacks) * (isL ? 400 : v * 0.7) : 0)
    if (meleeWeapons(m).length && d <= th.meleeRange + 0.02) best = Math.max(best, val(planSequence(env.ctx, s, m, t, 'melee', m.pos, { focus: f })))
    if (rws.length && d <= rng) best = Math.max(best, val(planSequence(env.ctx, s, m, t, 'ranged', m.pos, { focus: f })))
  }
  return best
}
function claimPick(env: Env, pd: PendingDecision, legal: Action[]): Action | null {
  // the claim option is stamped with the open decision's id since the M13 seams fix; the pending's own options are read as well in case legalActions was not given them
  const claims = [...legal, ...(pd.options ?? []).map((o) => o.action)]
    .filter((a): a is Extract<Action, { type: 'chooseCombatAction' }> => a.type === 'chooseCombatAction' && a.abilityId === CLAIM_CACHE_ABILITY)
    .map((a) => ({ ...a, decisionId: pd.id }))
  if (!claims.length) return null
  const m = pd.context.modelId ? env.s.models[pd.context.modelId] : undefined
  if (!live(m)) return null
  // 4.5 value units a VP: a claim beats any ordinary attack, but not a kill on the Leader or a heavy
  return cacheVp(env.s) * 4.5 > fightValue(env, m) ? claims[0]! : null
}
