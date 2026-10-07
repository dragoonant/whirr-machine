// Scenario value of a position (40-ai §2 wS term). Control itself is the engine's (query.control on a hypothetical
// state); the shaped part rewards being what an element needs to be held (a warjack or warbeast on a 50 mm objective, a
// whole unit on a 40 mm one, the Leader on either), contesting the enemy's holds, and standing close while it is not yet
// true. The element's own hold rule is read from the scenario record, so the same code serves the 36" Recon scenarios and
// the four-objective Skirmish one.
import type { GameState, ModelId, ModelState, PlayerId, Vec2 } from '../engine/index'
import { query } from '../engine/index'
import { baseRadius, dist, elementsOf, live, other, rec, withPositions, type Element } from './world'

// ---------- what an element accepts ----------
export interface ElementSpec { eligible: string[]; excludes: string[]; radius: number }
const specCache = new Map<string, Map<string, ElementSpec>>()
const KIND_BASE: Record<string, number> = { objective50: 50, objective40: 40, flag: 30 }

/** Hold-eligibility tokens, contest exclusions and the objective's own base radius, per element id of the open scenario. */
export function elementSpecs(s: GameState): Map<string, ElementSpec> {
  const key = s.setup.scenario
  let hit = specCache.get(key)
  if (hit) return hit
  hit = new Map()
  const def = rec(key) as { elements?: { id: string; kind?: string; hold?: { eligible?: string[] }; contest?: { excludes?: string[] } }[] } | undefined
  for (const e of def?.elements ?? []) {
    hit.set(e.id, { eligible: e.hold?.eligible ?? ['any'], excludes: e.contest?.excludes ?? ['leader', 'inert', 'disabled', 'wild'], radius: e.kind && KIND_BASE[e.kind] ? baseRadius(KIND_BASE[e.kind]!) : 0 })
  }
  specCache.set(key, hit)
  return hit
}
const specOf = (s: GameState, el: Element): ElementSpec => elementSpecs(s).get(el.id) ?? { eligible: ['any'], excludes: ['leader', 'inert', 'disabled', 'wild'], radius: 0 }

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
    return { holdOk: n >= el.models, progress: Math.min(1, n / Math.max(1, el.models)) * 0.35, contest }
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
    if (b.contest === 0) score += el.vp * (a.holdOk ? 1 : a.progress)
    else {
      if (a.contest > 0) score += 0.45 * el.vp // contesting denies their point
      if (a.holdOk) score += 0.1
      if (b.holdOk && a.contest === 0) score -= el.vp * 0.9
      else if (a.contest === 0 && b.progress > 0) score -= el.vp * 0.3
    }
  }
  return score
}

/** VP swing of the engine's control check if `m` stood at `pos` (our VP minus theirs, this scoring point). */
export function controlSwing(s: GameState, m: ModelState, pos: Vec2): number {
  const hs = withPositions(s, { [m.id]: pos })
  return swingOf(hs, m)
}
function swingOf(hs: GameState, m: ModelState): number {
  const rep = query.control(hs)
  const me = m.owner
  let v = 0
  for (const e of Object.values(rep.elements)) { if (e.controller === me) v += 1; else if (e.controller === other(me)) v -= 1 }
  if (rep.killBox[me] && m.type === 'leader') v -= 3
  return v
}

/** Scenario value of `m` at `pos`: engine control swing plus the shaped term. */
export function scenarioValue(s: GameState, m: ModelState, pos: Vec2): number {
  const hs = withPositions(s, { [m.id]: pos })
  return swingOf(hs, m) * 0.6 + shapedScenario(hs, m.owner)
}

// ---------- fast path for move scoring ----------
const baseMemo = new WeakMap<GameState, Map<PlayerId, number>>()

/**
 * Scenario value of the state if the models in `moved` stood at the given points (a unit keeps its shape). A model that is
 * nowhere near an element before and after the move cannot change control, so the board's unmoved value stands in for it
 * (the Leader is the exception: the Kill Box depends on where it stands). Everything else goes through the engine.
 */
export function scenarioValueMoved(s: GameState, m: ModelState, moved: Record<ModelId, Vec2>): number {
  const els = elementsOf(s)
  if (!els.length) return 0
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
    return swingOf(hs, m) * 0.6 + shapedScenario(hs, m.owner)
  }
  let byP = baseMemo.get(s)
  if (!byP) { byP = new Map(); baseMemo.set(s, byP) }
  let v = byP.get(m.owner)
  if (v === undefined) { v = swingOf(s, m) * 0.6 + shapedScenario(s, m.owner); byP.set(m.owner, v) }
  return v
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
