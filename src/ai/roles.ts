// Scenario roles (40-ai §2 bucket 4, "scenario movers"): each turn the AI decides which models hold our elements (a hold
// needs a model the element accepts: a warjack or warbeast for a 50 mm objective, a whole unit for a 40 mm one), which
// contest the ones we cannot staff, and which are free to fight. The role's goal point pulls a model's move scoring toward
// it; the engine's control check still decides what scores. Works for any number of elements (two on the 36" boards, four
// on Copperline Crossing); the element's own hold rule, read from the scenario record, says which kinds of group can stand on it.
import type { GameState, ModelId, ModelState, PlayerId, Vec2 } from '../engine/index'
import { query } from '../engine/index'
import { elementSpecs, groupCanHold } from './scenario'
import { baseRadius, distToElement, elementsOf, enemiesOf, forwardOf, modelsOf, other, type Element } from './world'

export interface Role { kind: 'hold' | 'contest' | 'free'; element?: Element; goal?: Vec2 }

/**
 * An element that scores nothing for us and something for them (our own flag in Trench Warfare) is guarded only once an enemy is within this many
 * turns of it (at 7" a turn, minus the hold distance). Guarding it from the start tied four models to a flag nobody was near and lost games
 * (bench, Trench Warfare normal vs easy, 160 games a row: guard always 58%, 5 turns 58%, 3.5 66%, 2.5 73%, 1.5 64%, never 63%; 64% on 160 fresh seeds).
 */
export const DENY_TURNS = 2.5

const cache = new WeakMap<GameState, Map<PlayerId, Map<ModelId, Role>>>()

/** Durability for contesting and for holding: war-engines first, then multi-model units, then solos. */
const durability = (s: GameState, m: ModelState): number =>
  m.type === 'warEngine' || m.type === 'battleEngine' ? 3 : m.type === 'beast' ? 2.6 : m.unitId ? 1 + (s.units[m.unitId]?.troopers.length ?? 1) * 0.4 : m.type === 'solo' ? 1 : 0

interface Grp { key: string; ms: ModelState[]; lead: ModelState; pace: number; dur: number }

/** Where in the element's hold circle (our side of it) each model of the group should stand. */
function goalsFor(el: Element, fwd: Vec2, ms: ModelState[]): Map<ModelId, Vec2> {
  const out = new Map<ModelId, Vec2>()
  const n = ms.length
  // the direction from the element back toward our edge
  const back = Math.atan2(-fwd.z, -fwd.x)
  const radius = Math.max(0.6, Math.min(el.within - 0.9, 1.1 + 0.25 * n))
  const step = n <= 1 ? 0 : Math.min((60 * Math.PI) / 180, (300 * Math.PI) / 180 / n)
  const ordered = ms.slice().sort((a, b) => a.id.localeCompare(b.id))
  ordered.forEach((m, i) => {
    const a = back + (i - (n - 1) / 2) * step
    const r = n <= 1 ? 1.4 : radius
    out.set(m.id, { x: el.pos.x + Math.cos(a) * r, z: el.pos.z + Math.sin(a) * r })
  })
  return out
}

export function rolesFor(s: GameState, me: PlayerId): Map<ModelId, Role> {
  let byP = cache.get(s)
  if (!byP) { byP = new Map(); cache.set(s, byP) }
  const hit = byP.get(me)
  if (hit) return hit
  const out = new Map<ModelId, Role>()
  byP.set(me, out)
  const fwd = forwardOf(s, me)
  const els = elementsOf(s)
  if (!els.length) return out
  const tok = new Map([...elementSpecs(s)].map(([k, v]) => [k, v.eligible]))
  const ours = modelsOf(s, me).filter((m) => m.type !== 'leader' && !m.inert && !m.offTable)
  // activation groups (a unit moves together)
  const byKey = new Map<string, ModelState[]>()
  for (const m of ours) { const k = m.unitId ?? m.id; byKey.set(k, [...(byKey.get(k) ?? []), m]) }
  const groups: Grp[] = []
  for (const [key, ms] of byKey) {
    const lead = ms[0]!
    let adv = 5
    try { adv = query.threat(s, lead.id).advance || 5 } catch { adv = lead.type === 'warEngine' ? 5 : 6 }
    groups.push({ key, ms, lead, pace: adv + 2.5, dur: durability(s, lead) })
  }
  const foes = enemiesOf(s, me).filter((e) => !e.inert)
  // arrival time of the nearest of ours and of theirs: elements we get to first are ours to hold
  const turns = (el: Element, p: Vec2, mm: number, pace: number): number => Math.max(0, distToElement(el, p, mm) - (el.within - 0.5)) / pace
  const adv = new Map<string, number>()
  for (const el of els) {
    let dm = Infinity, de = Infinity
    for (const g of groups) dm = Math.min(dm, turns(el, g.lead.pos, g.lead.base, g.pace))
    for (const e of foes) de = Math.min(de, turns(el, e.pos, e.base, 7))
    adv.set(el.id, (Number.isFinite(de) ? de : 4) - (Number.isFinite(dm) ? dm : 4))
  }
  // projection on the forward axis breaks ties: the elements nearer our edge are ours first
  const proj = (el: Element): number => el.pos.x * fwd.x + el.pos.z * fwd.z
  const order = els.slice().sort((a, b) => (adv.get(b.id)! - adv.get(a.id)!) || (proj(a) - proj(b)))
  const free = new Set(groups.map((g) => g.key))
  const byG = new Map(groups.map((g) => [g.key, g]))
  const bodiesNeeded = (el: Element): number => (tok.get(el.id) ?? ['any']).includes('any') ? Math.max(1, el.models) : 1

  const claim = (el: Element, kind: Role['kind'], g: Grp): void => {
    free.delete(g.key)
    const goals = goalsFor(el, fwd, g.ms)
    for (const m of g.ms) out.set(m.id, { kind, element: el, goal: goals.get(m.id) })
  }
  const cost = (el: Element, g: Grp, holding: boolean): number => {
    const t = turns(el, g.lead.pos, g.lead.base, g.pace)
    const ours = (adv.get(el.id) ?? 0) >= 0
    // a durable body belongs on an element we will have to defend; a fast one on the far side
    const prefer = holding ? (ours ? 0.25 * g.dur : 0.1 * g.dur + (g.pace >= 9 ? 0.4 : 0)) : 0.12 * g.dur + (g.pace >= 9 ? 0.3 : 0)
    return t - prefer
  }
  const unstaffed: Element[] = []
  const denyOnly = (el: Element): boolean => !!el.vpFor && el.vpFor[me] <= 0 && el.vpFor[other(me)] > 0
  const foeTurns = (el: Element): number => Math.min(...foes.map((e) => turns(el, e.pos, e.base, 7)), 99)
  for (const el of order) {
    if (denyOnly(el) && foeTurns(el) > DENY_TURNS) continue // an element that only denies them points: no guard until they are close
    const tokens = tok.get(el.id) ?? ['any']
    let need = bodiesNeeded(el)
    let staffed = false
    while (need > 0) {
      let best: Grp | null = null, bv = Infinity
      for (const k of free) {
        const g = byG.get(k)!
        if (!groupCanHold(tokens, g.ms)) continue
        const c = cost(el, g, true)
        if (c < bv) { bv = c; best = g }
      }
      if (!best) break
      claim(el, (adv.get(el.id) ?? 0) >= 0 ? 'hold' : 'contest', best)
      need -= tokens.includes('any') ? best.ms.length : 1
      staffed = true
    }
    if (!staffed) unstaffed.push(el)
  }
  // elements nobody can hold for us: send the toughest or fastest spare group to deny them (any non-Leader contests)
  for (const el of unstaffed) {
    let best: Grp | null = null, bv = Infinity
    for (const k of free) {
      const g = byG.get(k)!
      const c = cost(el, g, false)
      if (c < bv) { bv = c; best = g }
    }
    if (best) claim(el, 'contest', best)
  }
  for (const k of free) for (const m of byG.get(k)!.ms) out.set(m.id, { kind: 'free' })
  return out
}

/** Distance a model at p still has to go to its role's element (0 when it is inside the hold distance). */
export function roleGap(role: Role | undefined, p: Vec2, mm: number): number {
  if (!role?.element) return 0
  return Math.max(0, distToElement(role.element, p, mm) - (role.element.within - 0.3))
}

/** Distance to the table edge (inches). */
export function edgeGap(s: GameState, p: Vec2, mm: number): number {
  const hw = (s.scenario.table?.w ?? 36) / 2, hd = (s.scenario.table?.d ?? 36) / 2
  const r = baseRadius(mm)
  return Math.min(hw - Math.abs(p.x), hd - Math.abs(p.z)) - r
}
