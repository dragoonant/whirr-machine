// Deployment (40-ai §2): role-based spots, built model by model with the engine as the legality oracle (validate on a
// partial answer whose not-yet-placed models sit off the table, so the first rejection names the first bad model).
// Units chain-deploy: each trooper goes as close to its spot as it can while staying within unit spread of every
// placed mate; when a spot cannot take the whole unit, the next anchor along the zone is tried. Never fails while any
// legal deployment the sampler can reach exists; shallow zones fall back to chain placement along the zone's width.
import type { Action, GameState, ModelId, Placement, PlayerId, Vec2 } from '../engine/index'
import { validate } from '../engine/index'
import { elementSpecs, groupCanHold } from './scenario'
import { baseRadius, dist, elementsOf, forwardOf } from './world'

interface Zone { x0: number; x1: number; z0: number; z1: number }

const FAR: Vec2 = { x: 9999, z: 9999 }
const EPS = 1e-6

function mkAction(s: GameState, placements: Placement[]): Action {
  const pd = s.pending
  return (pd.kind === 'advanceDeploy'
    ? { type: 'advanceDeploy', decisionId: pd.id, player: pd.player, placements }
    : { type: 'deploy', decisionId: pd.id, player: pd.player, placements }) as Action
}

/** Is `pos` legal for model `idx` given the placements before it? (engine oracle) */
function legalAt(s: GameState, ids: ModelId[], placed: Placement[], id: ModelId, pos: Vec2): boolean {
  const rest = ids.filter((x) => x !== id && !placed.some((p) => p.modelId === x))
  const a = mkAction(s, [...placed, { modelId: id, pos }, ...rest.map((r) => ({ modelId: r, pos: FAR }))])
  const rej = validate(s, a)
  if (!rej) return true
  if (rest.length && rej.code === 'E_OUT_OF_ZONE' && rest.some((r) => rej.message.startsWith(r))) return true
  if (!rest.length && rej.code === 'E_PLACEMENT' && /must be within/.test(rej.message)) return true // unit spread: we check it ourselves
  return false
}

const edgeD = (s: GameState, a: ModelId, pa: Vec2, b: ModelId, pb: Vec2): number =>
  dist(pa, pb) - baseRadius(s.models[a]!.base) - baseRadius(s.models[b]!.base)

/** Hold weight of a group when choosing who stands on an objective: a heavier jack, a bigger unit. */
function holdWeight(s: GameState, ids: ModelId[]): number {
  const m = s.models[ids[0]!]!
  return m.type === 'warEngine' || m.type === 'battleEngine' ? 10 + (m.base ?? 0) / 100 : m.type === 'beast' ? 9 : m.unitId ? ids.length : 0.5
}

/**
 * The spot each model would like. Groups (a unit, or one model) are matched to the scenario's elements by what each element
 * accepts (a warjack or warbeast for a 50 mm objective, a whole unit for a 40 mm one), the elements nearest our edge first,
 * and deploy in line with their element so a four-objective table is split into lanes instead of one pile. Spares go to
 * the nearer elements with the fewest holders; solos go to the far side to contest; the Leader sits behind the line.
 */
function wishes(s: GameState, ids: ModelId[], zone: Zone, player: PlayerId): Record<ModelId, Vec2> {
  const fwd = forwardOf(s, player)
  const alongX = fwd.x === 0
  const centre = { x: (zone.x0 + zone.x1) / 2, z: (zone.z0 + zone.z1) / 2 }
  const depth = alongX ? zone.z1 - zone.z0 : zone.x1 - zone.x0
  const front = (inset: number): Vec2 => alongX
    ? { x: centre.x, z: fwd.z > 0 ? zone.z1 - inset : zone.z0 + inset }
    : { x: fwd.x > 0 ? zone.x1 - inset : zone.x0 + inset, z: centre.z }
  const lateral = (p: Vec2, lat: number): Vec2 => alongX ? { x: lat, z: p.z } : { x: p.x, z: lat }
  const latOf = (v: Vec2): number => (alongX ? v.x : v.z)
  const lo = alongX ? zone.x0 : zone.z0, hi = alongX ? zone.x1 : zone.z1
  const clampLat = (v: number): number => Math.max(lo + 1, Math.min(hi - 1, v))
  // elements nearest our edge first (ties keep scenario order)
  const proj = (e: { pos: Vec2 }): number => e.pos.x * fwd.x + e.pos.z * fwd.z
  const els = elementsOf(s).slice().sort((a, b) => proj(a) - proj(b))
  const specs = elementSpecs(s)
  const nearCut = els.length ? proj(els[0]!) + 1.5 : 0
  const nearEls = els.filter((e) => proj(e) <= nearCut)
  const farEls = els.filter((e) => proj(e) > nearCut)
  const nearLat = nearEls.length ? nearEls.reduce((a, e) => a + latOf(e.pos), 0) / nearEls.length : 0
  // groups
  const groups: ModelId[][] = []
  const byUnit = new Map<string, ModelId[]>()
  for (const id of ids) {
    const m = s.models[id]!
    if (m.unitId) { let g = byUnit.get(m.unitId); if (!g) { g = []; byUnit.set(m.unitId, g); groups.push(g) } g.push(id) } else groups.push([id])
  }
  const out: Record<ModelId, Vec2> = {}
  const place = (g: ModelId[], lat: number, inset: number): void => { for (const id of g) out[id] = lateral(front(inset), clampLat(lat)) }
  const free = groups.filter((g) => s.models[g[0]!]!.type !== 'leader')
  const holders = new Map<string, number>()
  const claim = (el: { id: string; pos: Vec2 }, inset = 1.2): boolean => {
    const tok = specs.get(el.id)?.eligible ?? ['any']
    let best: ModelId[] | null = null, bv = -Infinity
    for (const g of free) {
      const ms = g.map((id) => s.models[id]!)
      if (!groupCanHold(tok, ms)) continue
      const w = holdWeight(s, g)
      if (w > bv) { bv = w; best = g }
    }
    if (!best) return false
    free.splice(free.indexOf(best), 1)
    const lead = s.models[best[0]!]!
    place(best, latOf(el.pos), lead.type === 'warEngine' || lead.type === 'beast' ? 1.5 : inset)
    holders.set(el.id, (holders.get(el.id) ?? 0) + 1)
    return true
  }
  for (const el of nearEls) claim(el)
  for (const el of farEls) claim(el)
  // spares: war-engines and units behind the nearer elements that have the fewest holders, solos to the far side
  const lanes = (nearEls.length ? nearEls : els).slice()
  for (const g of free) {
    const lead = s.models[g[0]!]!
    if (lead.type === 'solo' || (!lead.unitId && lead.type !== 'warEngine' && lead.type !== 'beast')) {
      const target = farEls.length ? farEls[0]! : lanes[lanes.length - 1]
      place(g, target ? latOf(target.pos) : nearLat, 1.2)
    } else {
      lanes.sort((a, b) => (holders.get(a.id) ?? 0) - (holders.get(b.id) ?? 0))
      const el = lanes[0]
      place(g, el ? latOf(el.pos) : nearLat, lead.unitId ? 1.2 : 1.5)
      if (el) holders.set(el.id, (holders.get(el.id) ?? 0) + 1)
    }
  }
  // the Leader: toward the middle of our near elements, just behind the line (a short walk out of the Kill Box on a 48" table)
  for (const g of groups) {
    const m = s.models[g[0]!]!
    if (m.type !== 'leader') continue
    const inset = Math.min(Math.max(depth - 1.2, 1), Math.max(baseRadius(m.base) + 0.3, depth * 0.45 + 1))
    out[m.id] = lateral(front(inset), clampLat(nearLat * 0.4))
  }
  return out
}

function grid(zone: Zone, r: number): Vec2[] {
  const out: Vec2[] = []
  for (let x = zone.x0 + r; x <= zone.x1 - r + EPS; x += 0.5) for (let z = zone.z0 + r; z <= zone.z1 - r + EPS; z += 0.5) out.push({ x, z })
  // exact edges too, for very shallow zones
  return out
}

/** Build a full legal placement for the open deploy/advanceDeploy decision, or null. */
export function planDeployment(s: GameState): Placement[] | null {
  const pd = s.pending
  const data = (pd.context.data ?? {}) as { modelIds?: ModelId[]; zone?: Zone; unitSpread?: number }
  const ids = (data.modelIds ?? []).filter((id) => s.models[id])
  const zone = data.zone
  if (!ids.length || !zone) return null
  const spread = data.unitSpread ?? 3
  const want = wishes(s, ids, zone, pd.player)
  // order: war-engines, units, solos, leader last (it tucks in behind)
  const rank = (id: ModelId): number => { const t = s.models[id]!.type; return t === 'warEngine' ? 0 : s.models[id]!.unitId ? 1 : t === 'leader' ? 3 : 2 }
  const order = ids.slice().sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  // group unit troopers together
  const groups: ModelId[][] = []
  const byUnit = new Map<string, ModelId[]>()
  for (const id of order) {
    const u = s.models[id]!.unitId
    if (u) { if (!byUnit.has(u)) { const g: ModelId[] = []; byUnit.set(u, g); groups.push(g) } byUnit.get(u)!.push(id) } else groups.push([id])
  }
  const placed: Placement[] = []
  const fwd = forwardOf(s, pd.player)
  const alongX = fwd.x === 0
  for (const g of groups) {
    const r = baseRadius(s.models[g[0]!]!.base)
    const cells = grid(zone, Math.min(r, (alongX ? zone.z1 - zone.z0 : zone.x1 - zone.x0) / 2))
    // anchors: the wish first, then points along the zone's width (chain fallback)
    const w = want[g[0]!]!
    const anchors: Vec2[] = [w]
    const span = alongX ? zone.x1 - zone.x0 : zone.z1 - zone.z0
    for (let k = 1; k <= 12; k++) for (const sgn of [1, -1]) {
      const off = sgn * k * span / 14
      anchors.push(alongX ? { x: w.x + off, z: w.z } : { x: w.x, z: w.z + off })
    }
    let done: Placement[] | null = null
    for (const anchor of anchors) {
      const trial: Placement[] = []
      let ok = true
      for (const id of g) {
        const m = s.models[id]!
        const rr = baseRadius(m.base)
        const target = trial.length ? trial[trial.length - 1]!.pos : anchor
        const sorted = cells.slice().sort((a, b) => dist(a, target) - dist(b, target))
        let got: Vec2 | null = null
        let tries = 0
        for (const c of sorted) {
          if (c.x - rr < zone.x0 - EPS || c.x + rr > zone.x1 + EPS || c.z - rr < zone.z0 - EPS || c.z + rr > zone.z1 + EPS) continue
          if ([...placed, ...trial].some((p) => dist(p.pos, c) < rr + baseRadius(s.models[p.modelId]!.base) - EPS)) continue
          if (trial.some((p) => edgeD(s, id, c, p.modelId, p.pos) > spread * 0.98)) continue
          if (++tries > 60) break
          if (legalAt(s, ids, [...placed, ...trial], id, c)) { got = c; break }
        }
        if (!got) { ok = false; break }
        trial.push({ modelId: id, pos: got })
      }
      if (ok) { done = trial; break }
    }
    if (!done) return null
    placed.push(...done)
  }
  const final = mkAction(s, placed)
  return validate(s, final) === null ? placed : null
}

export function deployAction(s: GameState, legal: Action[]): Action | null {
  const p = planDeployment(s)
  if (p) return mkAction(s, p)
  return legal[0] ?? null
}
