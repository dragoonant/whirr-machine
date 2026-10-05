// Deployment (40-ai §2): role-based spots, built model by model with the engine as the legality oracle (validate on a
// partial answer whose not-yet-placed models sit off the table, so the first rejection names the first bad model).
// Units chain-deploy: each trooper goes as close to its spot as it can while staying within unit spread of every
// placed mate; when a spot cannot take the whole unit, the next anchor along the zone is tried. Never fails while any
// legal deployment the sampler can reach exists; shallow zones fall back to chain placement along the zone's width.
import type { Action, GameState, ModelId, Placement, PlayerId, Vec2 } from '../engine/index'
import { validate } from '../engine/index'
import { baseRadius, dist, elementsOf, forwardOf, live, other } from './world'

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

/** The spot each model would like, by role. */
function wishes(s: GameState, ids: ModelId[], zone: Zone, player: PlayerId): Record<ModelId, Vec2> {
  const fwd = forwardOf(s, player)
  const alongX = fwd.x === 0
  const centre = { x: (zone.x0 + zone.x1) / 2, z: (zone.z0 + zone.z1) / 2 }
  const depth = alongX ? zone.z1 - zone.z0 : zone.x1 - zone.x0
  const front = (inset: number): Vec2 => alongX
    ? { x: centre.x, z: fwd.z > 0 ? zone.z1 - inset : zone.z0 + inset }
    : { x: fwd.x > 0 ? zone.x1 - inset : zone.x0 + inset, z: centre.z }
  const lateral = (p: Vec2, off: number): Vec2 => alongX ? { x: p.x + off, z: p.z } : { x: p.x, z: p.z + off }
  // our near element (the one closer to our edge) and the far one, as lateral offsets
  const els = elementsOf(s).slice().sort((a, b) => (a.pos.x * fwd.x + a.pos.z * fwd.z) - (b.pos.x * fwd.x + b.pos.z * fwd.z))
  const latOf = (v: Vec2): number => (alongX ? v.x : v.z)
  const nearLat = els[0] ? latOf(els[0].pos) : 0
  const farLat = els[1] ? latOf(els[1].pos) : -nearLat
  const out: Record<ModelId, Vec2> = {}
  const enemies = Object.values(s.models).filter((m) => m.owner === other(player) && live(m))
  let unitN = 0
  for (const id of ids) {
    const m = s.models[id]!
    if (m.type === 'leader') {
      // behind the line, a little toward the near element, deep in the zone
      out[id] = lateral(front(Math.max(baseRadius(m.base) + 0.3, depth - 2.5)), nearLat * 0.4 - (alongX ? centre.x : centre.z))
    } else if (m.type === 'warEngine') {
      out[id] = lateral(front(1.5), nearLat * 0.6 - (alongX ? centre.x : centre.z))
    } else if (m.unitId) {
      out[id] = lateral(front(1.2), nearLat - (alongX ? centre.x : centre.z) + unitN * 0.01)
      unitN++
    } else {
      out[id] = lateral(front(1.2), farLat - (alongX ? centre.x : centre.z))
    }
    // shade away from enemy guns already on the table (second player): no change needed for the starter sizes
    void enemies
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
