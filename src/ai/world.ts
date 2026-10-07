// Read-only views of the game for the AI: models, values, weapons from the data bundle, scenario elements and their
// shapes, and hypothetical states (a model moved to a point). Reads only the engine's public API and the data bundle.
import { loadBundle } from '../data/index'
import type { DataBundle, GameState, ModelId, ModelState, PlayerId, TerrainInstance, UnitId, Vec2 } from '../engine/index'
import { query } from '../engine/index'
import { circleOverlapsShape, terrainPieces, terrainTraits } from '../engine/terrain'

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
/** The pool a model spends from: fury for warlocks, focus for everything else (beasts hold fury but are forced, not spent from). */
export const resourceOf = (m: ModelState): number => (m.type === 'leader' && m.fury !== undefined ? m.fury : m.focus)
export const isWarlock = (m: ModelState): boolean => m.type === 'leader' && m.fury !== undefined
export const isBeast = (m: ModelState): boolean => m.type === 'beast' && m.fury !== undefined
export const edgeDist = (s: GameState, a: ModelId, b: ModelId | Vec2): number => query.distance(s, a, b)
/** Edge-to-edge distance if model `a` stood at `pa` and `b` at `pb` (default: where it stands). */
export function edgeDistAt(a: ModelState, pa: Vec2, b: ModelState, pb: Vec2 = b.pos): number {
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
/**
 * One scenario element as the AI sees it. M13: read from the live state, not only the record: the attacker frame rotates positions,
 * Wolves and Payload move objectives, a flag stands for the terrain piece it picked (or the 30 mm flag-obstruction), and a claimed or
 * delivered element is gone. Caches are not holdable and are left out (see scenario.ts `cachesOf`).
 */
export interface Element {
  id: string; pos: Vec2; within: number; models: number; contestWithin: number; shape: Vec2[] | null; vp: number
  kind?: string
  /** the colour's player (first = Attacker); null = neutral */
  owner?: PlayerId | null
  /** VP a turn this element is worth to each player under the scenario's rules (SR scoring rules); absent = `vp` for both */
  vpFor?: Record<PlayerId, number>
  /** a piece a base stands inside: holding and contesting need the base to overlap it */
  area?: boolean
  /** countdown tokens (High Stakes) or heel tokens (Wolves) */
  tokens?: number
}
type WorldPoly = Vec2[]
function polyOf(t: TerrainInstance): WorldPoly | null {
  const f = t.footprint as { rect?: { w: number; d: number }; polygon?: Vec2[]; circle?: { r: number } }
  const c = Math.cos(t.rot), sn = Math.sin(t.rot)
  const rot = (p: Vec2): Vec2 => ({ x: t.pos.x + p.x * c + p.z * sn, z: t.pos.z - p.x * sn + p.z * c })
  if (f.rect) { const hw = f.rect.w / 2, hd = f.rect.d / 2; return [{ x: -hw, z: -hd }, { x: hw, z: -hd }, { x: hw, z: hd }, { x: -hw, z: hd }].map(rot) }
  if (f.polygon) return f.polygon.map(rot)
  if (f.circle) return Array.from({ length: 20 }, (_, i) => ({ x: t.pos.x + Math.cos((i / 20) * Math.PI * 2) * f.circle!.r, z: t.pos.z + Math.sin((i / 20) * Math.PI * 2) * f.circle!.r }))
  return null
}
interface ScoringRuleRec { kind: string; select?: { kinds?: string[]; owner?: string }; vp?: number; atLeast?: number }
/** What one element is worth per turn to `p` under the scenario's scoring rules: control rules count in full, bonuses by their share. */
function vpUnder(rules: ScoringRuleRec[], kind: string, owner: PlayerId | null, p: PlayerId): number {
  let v = 0
  for (const r of rules) {
    const kinds = r.select?.kinds
    if (!kinds || !kinds.includes(kind)) continue
    const o = r.select?.owner ?? 'any'
    const ok = o === 'any' || (o === 'own' && owner === p) || (o === 'opponent' && owner !== null && owner !== p) || (o === 'neutral' && owner === null)
    if (!ok) continue
    if (r.kind === 'control') v += r.vp ?? 0
    else if (r.kind === 'countBonus') v += (r.vp ?? 0) / Math.max(1, r.atLeast ?? 1)
    else if (r.kind === 'zeroTokenBonus') v += (r.vp ?? 0) * 0.3
  }
  return v
}
const elemCache = new WeakMap<object, { terrain: TerrainInstance[]; first: PlayerId | null; els: Element[] }>()
export function elementsOf(s: GameState): Element[] {
  const hit = elemCache.get(s.scenario)
  if (hit && hit.terrain === s.terrain && hit.first === (s.firstPlayer ?? null)) return hit.els
  const def = rec(s.setup.scenario) as { scoring?: { rules?: ScoringRuleRec[] }; elements?: { id: string; kind?: string; owner?: string; pos?: Vec2; terrain?: string; hold?: { within?: number; models?: number; mode?: string }; contest?: { within?: number }; vp?: { control?: number } }[] } | undefined
  const rules = def?.scoring?.rules ?? []
  const first = s.firstPlayer ?? null
  const out: Element[] = []
  for (const e of def?.elements ?? []) {
    const rt = s.scenario.elementState?.[e.id]
    if (rt?.removed || e.kind === 'cache') continue
    const owner: PlayerId | null = e.owner === 'A' || e.owner === 'B' ? e.owner : e.owner === 'first' ? first : e.owner === 'second' && first ? other(first) : null
    const pieceId = e.kind === 'flag' ? (rt?.terrainId ?? undefined) : e.terrain
    const t = pieceId ? s.terrain.find((x) => x.id === pieceId || x.pieceId === pieceId) : undefined
    const shape = t ? polyOf(t) : null
    const area = !!t && !!shape && e.hold?.mode === 'area' && terrainTraits(t).move === 'none'
    const vpFor = rules.length && e.kind ? { A: vpUnder(rules, e.kind, owner, 'A'), B: vpUnder(rules, e.kind, owner, 'B') } : undefined
    out.push({
      id: e.id, pos: rt?.pos ?? e.pos ?? t?.pos ?? { x: 0, z: 0 }, within: area ? 0.05 : (e.hold?.within ?? 2), models: e.hold?.models ?? 1,
      contestWithin: area ? 0.05 : (e.contest?.within ?? 2), shape, vp: vpFor ? Math.max(vpFor.A, vpFor.B) : (e.vp?.control ?? 1),
      ...(e.kind ? { kind: e.kind } : {}), owner, ...(vpFor ? { vpFor } : {}), ...(area ? { area } : {}), ...(rt?.tokens !== undefined ? { tokens: rt.tokens } : {}),
    })
  }
  elemCache.set(s.scenario, { terrain: s.terrain, first, els: out })
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

const threatViews = new WeakMap<GameState, Map<PlayerId, GameState>>()
/**
 * The board as the enemies of `victim` will see it on their turn: their knocked-down or stationary models will have
 * stood up or shaken it off by then (a pessimistic view, used only to project threats).
 */
export function threatView(s: GameState, victim: PlayerId): GameState {
  let byP = threatViews.get(s)
  if (!byP) { byP = new Map(); threatViews.set(s, byP) }
  const hit = byP.get(victim)
  if (hit) return hit
  let models: GameState['models'] | null = null
  for (const m of Object.values(s.models)) {
    if (m.owner === victim || !m.conditions.some((c) => c === 'knockedDown' || c === 'stationary')) continue
    models ??= { ...s.models }
    models[m.id] = { ...m, conditions: m.conditions.filter((c) => c !== 'knockedDown' && c !== 'stationary') }
  }
  const out = models ? { ...s, models } : s
  byP.set(victim, out)
  return out
}

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

// ---------- terrain hazards (R9.8) ----------
/** True when the model is immune to this hazard's damage type (Resistance or Immunity in its profile). */
function hazardImmune(m: ModelState, type: string | undefined): boolean {
  return !!type && (hasAbility(m, `core.a.resist-${type}`) || hasAbility(m, `core.a.immunity-${type}`))
}
/**
 * Expected value lost to terrain hazards if `m` ends at `p` after walking straight from `from`: one hit for entering a
 * hazard piece it was not in, one more for ending the activation inside. A hit is 2d6 + POW against its base ARM, as a
 * share of its remaining boxes times its value. 0 when the table has no hazard piece.
 */
export function hazardCost(s: GameState, m: ModelState, from: Vec2, p: Vec2): number {
  let cost = 0
  const r = baseRadius(m.base)
  const arm = (((rec(m.profileId)?.stats ?? {}) as Record<string, number>).ARM) ?? 14
  for (const piece of terrainPieces(s)) {
    const spec = piece.traits.hazardSpec
    if (!piece.traits.hazard || !spec || hazardImmune(m, spec.damageType)) continue
    const hit = Math.max(0, 7 + spec.pow - arm)
    const per = Math.min(1, hit / boxesLeft(m)) * valueOf(s, m)
    const n = Math.max(1, Math.ceil(dist(from, p) / 0.5))
    let prev = circleOverlapsShape(from, r, piece.shape), entered = false
    for (let k = 1; k <= n && !entered; k++) {
      const t = k / n
      const ins = circleOverlapsShape({ x: from.x + (p.x - from.x) * t, z: from.z + (p.z - from.z) * t }, r, piece.shape)
      if (!prev && ins) entered = true
      prev = ins
    }
    if (entered && spec.on.includes('enter')) cost += per
    if (circleOverlapsShape(p, r, piece.shape) && spec.on.includes('endActivation')) cost += per
  }
  return cost
}
