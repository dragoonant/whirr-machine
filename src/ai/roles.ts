// Scenario roles (40-ai §2 bucket 4, "scenario movers"): each turn the AI decides which models hold our near element
// (it needs `models` bodies within `within`), which contest or take the far one, and which are free to fight. The role's
// goal point pulls a model's move scoring toward it; the engine's control check still decides what scores.
import type { GameState, ModelId, ModelState, PlayerId, Vec2 } from '../engine/index'
import { query } from '../engine/index'
import { baseRadius, dist, distToElement, elementsOf, forwardOf, modelsOf, type Element } from './world'

export interface Role { kind: 'hold' | 'contest' | 'free'; element?: Element; goal?: Vec2 }

const cache = new WeakMap<GameState, Map<PlayerId, Map<ModelId, Role>>>()

/** Durability for contesting: war-engines first, then multi-model units, then solos. */
const durability = (s: GameState, m: ModelState): number =>
  m.type === 'warEngine' ? 3 : m.unitId ? 1 + (s.units[m.unitId]?.troopers.length ?? 1) * 0.4 : m.type === 'solo' ? 1 : 0

export function rolesFor(s: GameState, me: PlayerId): Map<ModelId, Role> {
  let byP = cache.get(s)
  if (!byP) { byP = new Map(); cache.set(s, byP) }
  const hit = byP.get(me)
  if (hit) return hit
  const out = new Map<ModelId, Role>()
  const fwd = forwardOf(s, me)
  const els = elementsOf(s).slice().sort((a, b) => (a.pos.x * fwd.x + a.pos.z * fwd.z) - (b.pos.x * fwd.x + b.pos.z * fwd.z))
  const ours = modelsOf(s, me).filter((m) => m.type !== 'leader' && !m.inert)
  // activation groups (a unit moves together)
  const groups = new Map<string, ModelState[]>()
  for (const m of ours) { const k = m.unitId ?? m.id; groups.set(k, [...(groups.get(k) ?? []), m]) }
  const free = new Set(groups.keys())
  const goalOf = (el: Element, from: Vec2): Vec2 => {
    // stand on our side of the element, just inside the hold distance
    const back = { x: -fwd.x, z: -fwd.z }
    const off = 1.4
    const p = { x: el.pos.x + back.x * off, z: el.pos.z + back.z * off }
    // slide along the element toward where the model comes from
    const lat = { x: fwd.z, z: -fwd.x }
    const side = (from.x - el.pos.x) * lat.x + (from.z - el.pos.z) * lat.z
    const k = Math.max(-1.5, Math.min(1.5, side))
    return { x: p.x + lat.x * k, z: p.z + lat.z * k }
  }
  const assign = (el: Element, kind: Role['kind'], bodies: number, prefer: (g: ModelState[]) => number): void => {
    let have = 0
    while (have < bodies && free.size) {
      let bestK: string | null = null, bv = Infinity
      for (const k of free) {
        const g = groups.get(k)!
        const lead = g[0]!
        const spd = query.threat(s, lead.id).advance || 5
        const d = Math.max(0, distToElement(el, lead.pos, lead.base) - el.within)
        const cost = d / spd - prefer(g)
        if (cost < bv) { bv = cost; bestK = k }
      }
      if (!bestK) break
      const g = groups.get(bestK)!
      free.delete(bestK)
      for (const m of g) out.set(m.id, { kind, element: el, goal: goalOf(el, m.pos) })
      have += g.length
    }
  }
  const near = els[0], far = els[1]
  if (near) assign(near, 'hold', near.models, (g) => (g.length >= 2 ? 0.8 : 0) - (g[0]!.type === 'warEngine' ? 0.3 : 0))
  if (far) assign(far, 'contest', 1, (g) => durability(s, g[0]!) * 0.35)
  for (const k of free) for (const m of groups.get(k)!) out.set(m.id, { kind: 'free' })
  byP.set(me, out)
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

export { dist }
