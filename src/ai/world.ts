// Read-only views of the game for the AI: models, values, weapons from the data bundle, scenario elements and their
// shapes, and hypothetical states (a model moved to a point). Reads only the engine's public API and the data bundle.
import { loadBundle } from '../data/index'
import type { DataBundle, GameState, ModelId, ModelState, PlayerId, TerrainInstance, UnitId, Vec2 } from '../engine/index'
import { query } from '../engine/index'

export const MM_PER_INCH = 25.4
export const baseRadius = (mm: number): number => mm / MM_PER_INCH / 2
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z)
export const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

let bundleRef: DataBundle | null = null
export function bundle(): DataBundle { return (bundleRef ??= loadBundle()) }

type Rec = Record<string, unknown>
export const rec = (id: string): Rec | undefined => bundle().byId[id] as Rec | undefined

/** On the table and able to act or be targeted. */
export const live = (m: ModelState | undefined): m is ModelState => !!m && !m.offTable && m.life === 'active'
export const modelsOf = (s: GameState, p: PlayerId): ModelState[] => Object.values(s.models).filter((m) => m.owner === p && live(m))
export const enemiesOf = (s: GameState, p: PlayerId): ModelState[] => modelsOf(s, other(p))
export const leaderOf = (s: GameState, p: PlayerId): ModelState | undefined => s.models[s.players[p].leaderId]
export const edgeDist = (s: GameState, a: ModelId, b: ModelId | Vec2): number => query.distance(s, a, b)
/** Edge-to-edge distance if model `a` stood at `pa` and `b` at its own spot. */
export function edgeDistAt(s: GameState, a: ModelState, pa: Vec2, b: ModelState, pb: Vec2 = b.pos): number {
  return Math.max(0, dist(pa, pb) - baseRadius(a.base) - baseRadius(b.base))
}

// ---------- weapons ----------
export interface WeaponInfo { id: string; melee: boolean; rng: number; rof: number; pow: number; aoe: boolean; location?: string; reload: number; powerful: boolean }
const weaponCache = new Map<string, WeaponInfo[]>()
/** The model's weapons (profile plus hardpoints), skipping crippled locations. */
export function weaponsOf(m: ModelState): WeaponInfo[] {
  const key = `${m.profileId}|${Object.values(m.hardpoints ?? {}).join(',')}`
  let all = weaponCache.get(key)
  if (!all) {
    const p = rec(m.profileId) ?? {}
    const list = ((p.weapons ?? []) as { weapon: string; location?: string }[]).slice()
    for (const hp of Object.values(m.hardpoints ?? {})) {
      const opt = rec(hp) as { weapons?: { weapon: string; location?: string }[] } | undefined
      for (const w of opt?.weapons ?? []) list.push(w)
    }
    all = []
    for (const w of list) {
      const r = rec(w.weapon) as Rec | undefined
      if (!r) continue
      const rngRaw = r.rng
      const rng = typeof rngRaw === 'number' ? rngRaw : typeof rngRaw === 'string' ? Number(String(rngRaw).replace(/^\D+/, '')) || 1 : 1
      const rofRaw = r.rof
      const rof = typeof rofRaw === 'number' ? rofRaw : typeof rofRaw === 'string' && /d3\+1/.test(rofRaw) ? 3 : typeof rofRaw === 'string' && /d3/.test(rofRaw) ? 2 : 1
      const abil = (r.abilities ?? []) as string[]
      all.push({
        id: w.weapon, melee: r.type === 'melee', rng, rof, pow: typeof r.pow === 'number' ? r.pow : 0, aoe: typeof r.aoe === 'number',
        location: (w.location ?? r.location) as string | undefined,
        reload: abil.includes('core.a.reload-inf') ? 9 : abil.includes('core.a.reload-1') ? 1 : 0,
        powerful: abil.includes('cyg.a.powerful-attack'),
      })
    }
    weaponCache.set(key, all)
  }
  return all.filter((w) => !w.location || !m.crippled.includes(w.location))
}
export const meleeWeapons = (m: ModelState): WeaponInfo[] => weaponsOf(m).filter((w) => w.melee)
export const rangedWeapons = (m: ModelState): WeaponInfo[] => weaponsOf(m).filter((w) => !w.melee)
export const hasAbility = (m: ModelState, id: string): boolean => ((rec(m.profileId)?.abilities ?? []) as string[]).includes(id)

// ---------- value ----------
/** Remaining damage boxes (grids: empty boxes over every grid). */
export function boxesLeft(m: ModelState): number {
  const d = m.damage
  if (d.track === 'single') return Math.max(1, d.boxes - d.filled)
  return Math.max(1, d.grids.reduce((a, g) => a + g.cols.reduce((c, col) => c + col.filter((x) => !x).length, 0), 0))
}
export function boxesTotal(m: ModelState): number {
  const d = m.damage
  if (d.track === 'single') return Math.max(1, d.boxes)
  return Math.max(1, d.grids.reduce((a, g) => a + g.cols.reduce((c, col) => c + col.length, 0), 0))
}
/** Points cost of a model (unit troopers share the unit's cost). */
export function costOf(s: GameState, m: ModelState): number {
  if (m.unitId) {
    const u = s.units[m.unitId]
    const ur = u ? rec(u.profileId) : undefined
    const n = Math.max(1, (u?.troopers.length ?? 1) + (u?.attachments.length ?? 0))
    const c = typeof ur?.cost === 'number' ? ur.cost : 6
    return Math.max(1, c / Math.max(n, 3))
  }
  const r = rec(m.profileId)
  const c = typeof r?.cost === 'number' ? r.cost : 0
  if (m.type === 'leader') return 20
  return c > 0 ? c : m.type === 'warEngine' ? 10 : 4
}
/** value(model) = cost x role factor (40 §2); the Leader is valued high because losing it ends the game. */
export function valueOf(s: GameState, m: ModelState): number {
  const c = costOf(s, m)
  if (m.type === 'leader') return 40
  if (m.type === 'warEngine') return c * 1.2
  return c
}

// ---------- scenario elements ----------
export interface Element { id: string; pos: Vec2; within: number; models: number; contestWithin: number; shape: Vec2[] | null; vp: number }
type WorldPoly = Vec2[]
function polyOf(t: TerrainInstance): WorldPoly | null {
  const f = t.footprint as { rect?: { w: number; d: number }; polygon?: Vec2[]; circle?: { r: number } }
  const c = Math.cos(t.rot), sn = Math.sin(t.rot)
  const rot = (p: Vec2): Vec2 => ({ x: t.pos.x + p.x * c + p.z * sn, z: t.pos.z - p.x * sn + p.z * c })
  if (f.rect) { const hw = f.rect.w / 2, hd = f.rect.d / 2; return [{ x: -hw, z: -hd }, { x: hw, z: -hd }, { x: hw, z: hd }, { x: -hw, z: hd }].map(rot) }
  if (f.polygon) return f.polygon.map(rot)
  return null
}
const elemCache = new Map<string, Element[]>()
export function elementsOf(s: GameState): Element[] {
  const key = `${s.dataVersion}|${s.setup.scenario}|${s.terrain.length}`
  const hit = elemCache.get(key)
  if (hit) return hit
  const def = rec(s.setup.scenario) as { elements?: { id: string; pos?: Vec2; terrain?: string; hold?: { within?: number; models?: number }; contest?: { within?: number }; vp?: { control?: number } }[] } | undefined
  const out: Element[] = (def?.elements ?? []).map((e) => {
    const t = e.terrain ? s.terrain.find((x) => x.id === e.terrain || x.pieceId === e.terrain) : undefined
    return {
      id: e.id, pos: e.pos ?? t?.pos ?? { x: 0, z: 0 }, within: e.hold?.within ?? 2, models: e.hold?.models ?? 1,
      contestWithin: e.contest?.within ?? 2, shape: t ? polyOf(t) : null, vp: e.vp?.control ?? 1,
    }
  })
  elemCache.set(key, out)
  return out
}
function segDist(a: Vec2, b: Vec2, p: Vec2): number {
  const dx = b.x - a.x, dz = b.z - a.z
  const l2 = dx * dx + dz * dz
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2))
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t))
}
function inPoly(p: Vec2, pts: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!, b = pts[j]!
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}
/** Base-edge distance from a model of base `mm` at `p` to the element. */
export function distToElement(el: Element, p: Vec2, mm: number): number {
  const r = baseRadius(mm)
  if (el.shape) {
    if (inPoly(p, el.shape)) return 0
    let d = Infinity
    for (let i = 0; i < el.shape.length; i++) d = Math.min(d, segDist(el.shape[i]!, el.shape[(i + 1) % el.shape.length]!, p))
    return Math.max(0, d - r)
  }
  return Math.max(0, dist(p, el.pos) - r)
}

// ---------- hypothetical states ----------
/** The same state with some models moved (no rules applied: a planning view only). */
export function withPositions(s: GameState, moves: Record<ModelId, Vec2>): GameState {
  const models = { ...s.models }
  for (const [id, pos] of Object.entries(moves)) { const m = models[id]; if (m) models[id] = { ...m, pos } }
  return { ...s, models }
}
export const withPos = (s: GameState, id: ModelId, pos: Vec2): GameState => withPositions(s, { [id]: pos })

/** Unit mates of a model (alive troopers, the model included). */
export function unitMates(s: GameState, m: ModelState): ModelState[] {
  if (!m.unitId) return [m]
  const u = s.units[m.unitId]
  return (u?.troopers ?? [m.id]).map((id) => s.models[id]).filter(live)
}
export function activatableOwner(s: GameState, id: ModelId | UnitId): ModelState[] {
  const u = s.units[id]
  if (u) return u.troopers.map((t) => s.models[t]).filter(live)
  const m = s.models[id]
  return live(m) ? [m] : []
}

/** Table bounds (half sizes). */
export function halfTable(s: GameState): { hw: number; hd: number } {
  return { hw: (s.scenario.table?.w ?? 36) / 2, hd: (s.scenario.table?.d ?? 36) / 2 }
}
/** Unit vector pointing from our edge toward the enemy's. */
export function forwardOf(s: GameState, p: PlayerId): Vec2 {
  switch (s.players[p].edge) {
    case 'north': return { x: 0, z: 1 }
    case 'south': return { x: 0, z: -1 }
    case 'west': return { x: 1, z: 0 }
    case 'east': return { x: -1, z: 0 }
    default: return { x: 0, z: p === 'A' ? 1 : -1 }
  }
}
