// LOS (10-rules-core R6) with an explaining verdict, plus DEF modifiers (R6.11, R9, R10). Pure functions.
// LOS = some straight line from any part of A's volume to any part of B's volume passes every test:
// terrain by height in 3D (R6.3), intervening models in 2D (R6.4), clouds in 2D (R6.5).
import {
  angleOf, baseRadius, dist, edgeDistance, isOnTable, segPointDist, sub, volumeHeight,
} from './geometry'
import { modelDistance, within } from './measure'
import {
  circleInsideShape, distToShape, insideCoverOf, pointInShape, segmentInsideIntervals,
  terrainPieces, type CoverKind, type TerrainPiece, type WorldShape,
} from './terrain'
import type { Cloud, GameState, Id, LosReason, LosVerdict, ModelState, Mod, Vec2 } from './types'

const STEALTH_REACH = 5

export interface LosOptions {
  /** weapon RNG; sets verdict.inRange (LOS itself ignores range) */
  range?: number
  /** True Sight / Alchemical Mask */
  ignoreClouds?: boolean
  /** Arcing Fire, spray: intervening models never block */
  ignoreModels?: boolean
  /** Stealth callback: stealth models farther than 5" from the viewer are never intervening (R6.4) */
  hasStealth?: (m: ModelState) => boolean
  /** viewer is the channelling arc node etc.: use this model as point of origin (default: the first arg) */
}

/** The verdict plus everything the LOS view needs to draw the answer. */
export interface LosReport extends LosVerdict {
  /** best line tried (the passing one if visible, else the least-blocked one) */
  line: { from: Vec2; to: Vec2; fromZ: number; toZ: number } | null
  terrainBlockers: Id[]
  modelBlockers: Id[]
  cloudBlockers: Id[]
  /** short human sentence for the UI */
  why: string
}

type Line = { a: Vec2; za: number; b: Vec2; zb: number }

function basePoints(c: Vec2, r: number, toward: Vec2): Vec2[] {
  const base = angleOf(sub(toward, c))
  const pts: Vec2[] = [c]
  for (const off of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) pts.push({ x: c.x + Math.cos(base + off) * r, z: c.z + Math.sin(base + off) * r })
  return pts
}

/** Candidate lines, centre-to-centre first. */
export function sampleLines(A: ModelState, B: ModelState): Line[] {
  const rA = baseRadius(A.base), rB = baseRadius(B.base)
  const hA = volumeHeight(A.base), hB = volumeHeight(B.base)
  const pa = basePoints(A.pos, rA, B.pos), pb = basePoints(B.pos, rB, A.pos)
  const zA = [A.elev + hA * 0.95, A.elev + hA * 0.5]
  const zB = [B.elev + hB * 0.95, B.elev + hB * 0.5, B.elev + 0.1]
  const out: Line[] = []
  for (const a of pa) for (const b of pb) for (const za of zA) for (const zb of zB) out.push({ a, za, b, zb })
  return out
}

function cloudBlocks(c: Cloud): boolean {
  return c.blocksLos ?? c.kind !== 'flare'
}
function cloudConceals(c: Cloud): boolean {
  return c.concealment ?? c.kind !== 'flare'
}
export const cloudShape = (c: Cloud): WorldShape => ({ kind: 'circle', c: c.pos, r: c.diameter / 2 })
const inCloud = (m: ModelState, c: Cloud): boolean => dist(m.pos, c.pos) < c.diameter / 2 + baseRadius(m.base) - 1e-9

/** True when the line is stopped by this terrain piece (height test; forests by depth are separate). */
function pieceBlocksLine(p: TerrainPiece, l: Line): boolean {
  if (!p.traits.blocksLos) return false
  if (pointInShape(l.a, p.shape) || pointInShape(l.b, p.shape)) return false // a model standing on it
  const top = (typeof p.t.props['baseElev'] === 'number' ? (p.t.props['baseElev'] as number) : 0) + p.traits.height
  for (const [t0, t1] of segmentInsideIntervals(l.a, l.b, p.shape)) {
    const z0 = l.za + (l.zb - l.za) * t0, z1 = l.za + (l.zb - l.za) * t1
    if (Math.min(z0, z1) < top - 1e-9) return true
  }
  return false
}
function forestBlocksLine(p: TerrainPiece, l: Line): boolean {
  const iv = segmentInsideIntervals(l.a, l.b, p.shape)
  if (!iv.length) return false
  const L = dist(l.a, l.b)
  const inside = iv.reduce((s, [t0, t1]) => s + (t1 - t0) * L, 0)
  const endInside = pointInShape(l.a, p.shape) || pointInShape(l.b, p.shape)
  return endInside ? inside > p.traits.losThrough + 1e-9 : inside > 1e-9
}

interface Ctx {
  state: GameState
  A: ModelState
  B: ModelState
  bHuge: boolean
  pieces: TerrainPiece[]
  clouds: Cloud[]
  interveners: ModelState[]
}
interface LineResult { reasons: LosReason[]; terrain: Id[]; models: Id[]; clouds: Id[] }

function buildCtx(state: GameState, A: ModelState, B: ModelState, opts: LosOptions): Ctx {
  const interveners: ModelState[] = []
  if (!opts.ignoreModels) {
    for (const o of Object.values(state.models)) {
      if (o.id === A.id || o.id === B.id || !isOnTable(o)) continue
      if (o.conditions.includes('knockedDown')) continue
      if (A.unitId && o.unitId === A.unitId) continue
      if (opts.hasStealth?.(o) && modelDistance(A, o) > STEALTH_REACH) continue
      if (o.base < B.base) continue // only bases >= the target's can block
      interveners.push(o)
    }
  }
  const clouds = opts.ignoreClouds || B.base >= 120 ? [] : state.clouds.filter((c) => cloudBlocks(c) && !inCloud(A, c) && !inCloud(B, c))
  return { state, A, B, bHuge: B.base >= 120, pieces: terrainPieces(state), clouds, interveners }
}

function evalLine(ctx: Ctx, l: Line): LineResult {
  const r: LineResult = { reasons: [], terrain: [], models: [], clouds: [] }
  let forest = false, terr = false
  for (const p of ctx.pieces) {
    if (p.traits.forest) {
      if (!ctx.bHuge && forestBlocksLine(p, l)) { forest = true; r.terrain.push(p.t.id) }
    } else if (pieceBlocksLine(p, l)) { terr = true; r.terrain.push(p.t.id) }
  }
  if (terr) r.reasons.push('terrain')
  if (forest) r.reasons.push('forestDepth')
  const { A, B } = ctx
  for (const o of ctx.interveners) {
    if (segPointDist(l.a, l.b, o.pos).d >= baseRadius(o.base) - 1e-9) continue
    if (A.elev - o.elev >= 1 && edgeDistance(o.pos, o.base, B.pos, B.base) > 1) continue // elevated viewer (R6.6)
    if (B.elev - A.elev >= 1 && o.elev <= B.elev - 1) continue // lower viewer ignores models below the target
    r.models.push(o.id)
  }
  if (r.models.length) r.reasons.push('model')
  for (const c of ctx.clouds) {
    if (segmentInsideIntervals(l.a, l.b, cloudShape(c)).length) r.clouds.push(c.id)
  }
  if (r.clouds.length) r.reasons.push('cloud')
  return r
}

const score = (r: LineResult) => r.terrain.length * 4 + r.models.length * 2 + r.clouds.length

function sentence(reasons: LosReason[], blockers: Id[]): string {
  if (reasons.includes('self')) return 'A model cannot target itself.'
  if (reasons.includes('outOfTable')) return 'One of the models is not on the table.'
  if (reasons.includes('clear')) return 'Clear line of sight.'
  const parts: string[] = []
  if (reasons.includes('terrain')) parts.push('terrain blocks the line')
  if (reasons.includes('forestDepth')) parts.push('too much forest in the way')
  if (reasons.includes('model')) parts.push('a model in the way is at least as big as the target')
  if (reasons.includes('cloud')) parts.push('a cloud is in the way')
  return `Blocked: ${parts.join('; ')}${blockers.length ? ` (${blockers.join(', ')})` : ''}.`
}

/** Full LOS report from the point of origin to the target. */
export function losReport(state: GameState, originId: Id, targetId: Id, opts: LosOptions = {}): LosReport {
  const A = state.models[originId], B = state.models[targetId]
  const mk = (visible: boolean, reasons: LosReason[], d: number, extra: Partial<LosReport> = {}): LosReport => ({
    visible, reasons, blockers: [], inRange: false, distance: d, line: null,
    terrainBlockers: [], modelBlockers: [], cloudBlockers: [], why: sentence(reasons, []), ...extra,
  })
  if (!A || !B) return mk(false, ['outOfTable'], Infinity)
  if (A.id === B.id) return mk(false, ['self'], 0)
  const d = modelDistance(A, B)
  const rangeOk = opts.range === undefined || d <= opts.range + 1e-6
  if (!isOnTable(A) || !isOnTable(B)) return mk(false, ['outOfTable'], d, { inRange: rangeOk })

  const ctx = buildCtx(state, A, B, opts)
  let best: { l: Line; r: LineResult } | null = null
  for (const l of sampleLines(A, B)) {
    const r = evalLine(ctx, l)
    if (!r.reasons.length) {
      return mk(true, ['clear'], d, {
        inRange: rangeOk, line: { from: l.a, to: l.b, fromZ: l.za, toZ: l.zb }, why: 'Clear line of sight.',
      })
    }
    if (!best || score(r) < score(best.r)) best = { l, r }
  }
  const { l, r } = best!
  const blockers = [...r.terrain, ...r.models, ...r.clouds]
  return {
    visible: false, reasons: r.reasons, blockers, inRange: rangeOk, distance: d,
    line: { from: l.a, to: l.b, fromZ: l.za, toZ: l.zb },
    terrainBlockers: r.terrain, modelBlockers: r.models, cloudBlockers: r.clouds, why: sentence(r.reasons, blockers),
  }
}

/** Frozen-contract verdict (what AttackContext.losVerdict holds). */
export function losVerdict(state: GameState, originId: Id, targetId: Id, opts: LosOptions = {}): LosVerdict {
  const { visible, reasons, blockers, inRange, distance } = losReport(state, originId, targetId, opts)
  return { visible, reasons, blockers, inRange, distance }
}
export const hasLos = (state: GameState, originId: Id, targetId: Id, opts: LosOptions = {}): boolean =>
  losReport(state, originId, targetId, opts).visible

/** LOS from a model to an arbitrary pose (placement checks: a trooper placed at pos must see the anchor). */
export function hasLosFromPose(state: GameState, moverId: Id, pos: Vec2, targetId: Id, opts: LosOptions = {}): boolean {
  const m = state.models[moverId]!
  const probe: GameState = { ...state, models: { ...state.models, [moverId]: { ...m, pos } } }
  return hasLos(probe, moverId, targetId, opts)
}

// ---------- engagement ----------
export interface MeleeOptions {
  /** melee reach in inches per model: 0 = no melee weapon, default 1 (R0) */
  reach?: (m: ModelState) => number
}
const cantEngage = (m: ModelState): boolean =>
  m.conditions.includes('knockedDown') || m.conditions.includes('stationary') || !!m.inert || !isOnTable(m)

/** Enemy models in melee with the target (it engages them or they engage it). */
export function engagedWith(state: GameState, targetId: Id, opts: MeleeOptions = {}): ModelState[] {
  const t = state.models[targetId]!
  if (cantEngage(t)) return []
  const reach = opts.reach ?? (() => 1)
  return Object.values(state.models).filter((e) => {
    if (e.id === t.id || e.owner === t.owner || cantEngage(e)) return false
    return (reach(e) > 0 && within(e, t, reach(e))) || (reach(t) > 0 && within(t, e, reach(t)))
  })
}
export const isInMelee = (state: GameState, targetId: Id, opts: MeleeOptions = {}): boolean =>
  engagedWith(state, targetId, opts).length > 0

// ---------- DEF modifiers ----------
export interface DefModOptions {
  kind: 'ranged' | 'arcane' | 'melee' | 'spray'
  baseDef: number
  /** point of origin (attacker or channelling node) */
  originId: Id
  melee?: MeleeOptions
  /** Pistol / Black Penny: ignore Target in Melee ('attacker' = only when the model engaged is the attacker) */
  ignoreTargetInMelee?: boolean | 'attacker'
  /** effect-granted concealment (Prowl etc.) */
  grantedConcealment?: boolean
  /** Alchemical Mask: cloud concealment ignored; Enhanced Mask: all concealment */
  ignoreCloudConcealment?: boolean
  ignoreAllConcealment?: boolean
}
export interface DefModResult {
  baseDef: number // after a "set" (knocked down / stationary)
  mods: Mod[]
  def: number
  concealment: boolean
  cover: boolean
  elevation: boolean
  targetInMelee: boolean
  /** knocked-down, stationary and inert targets are hit automatically in melee */
  autoHitMelee: boolean
}

function featureAlongLine(ctx: Ctx, B: ModelState, want: CoverKind, lines: Line[]): boolean {
  const rB = baseRadius(B.base)
  for (const p of ctx.pieces) {
    if (p.traits.cover !== want) continue
    if (distToShape(B.pos, p.shape) - rB > 1 + 1e-6) continue // within 1" of the feature
    if (pointInShape(ctx.A.pos, p.shape)) continue
    for (const l of lines) if (pieceBlocksLine(p, l)) return true
  }
  return false
}

/** Melee: any part of the target's volume obscured from the attacker by an obstacle/obstruction (+2). */
function meleeObscured(ctx: Ctx): boolean {
  const { A, B } = ctx
  const rB = baseRadius(B.base)
  const za = A.elev + volumeHeight(A.base) * 0.95
  for (const pb of basePoints(B.pos, rB, A.pos)) {
    for (const zb of [B.elev + 0.1, B.elev + volumeHeight(B.base) * 0.5, B.elev + volumeHeight(B.base) * 0.95]) {
      for (const p of ctx.pieces) {
        if (p.traits.move === 'none' || !p.traits.blocksLos) continue
        if (pieceBlocksLine(p, { a: A.pos, za, b: pb, zb })) return true
      }
    }
  }
  return false
}

/** Everything that changes the target's DEF for this attack, itemised for the UI (R6.11). */
export function defModifiers(state: GameState, targetId: Id, o: DefModOptions): DefModResult {
  const A = state.models[o.originId]!
  const B = state.models[targetId]!
  const mods: Mod[] = []
  let baseDef = o.baseDef
  const downed = B.conditions.includes('knockedDown') || B.conditions.includes('stationary')
  if (downed) {
    baseDef = 5
    mods.push({ source: 'condition', label: B.conditions.includes('knockedDown') ? 'Knocked down: base DEF 5' : 'Stationary: base DEF 5', value: 5, mode: 'set' })
  }
  const big = B.base >= 80 // 80/120 mm never gain concealment, cover, elevation or target in melee
  let concealment = false, cover = false, elevation = false, targetInMelee = false
  const ctx = buildCtx(state, A, B, { ignoreModels: true, ignoreClouds: true })

  if (o.kind === 'melee') {
    if (meleeObscured(ctx)) mods.push({ source: 'terrain', label: 'Partly obscured by an obstacle', value: 2, mode: 'add' })
  } else if (!big) {
    // cover / concealment (not against spray); cover and concealment do not stack
    let cov: CoverKind = 'none'
    if (o.kind !== 'spray') {
      const rB = baseRadius(B.base)
      const inside = insideCoverOf(state, B.pos, rB)
      if (inside === 'cover') cov = 'cover'
      const lines = sampleLines(A, B)
      if (cov !== 'cover' && featureAlongLine(ctx, B, 'cover', lines)) cov = 'cover'
      if (cov !== 'cover') {
        const cloud = state.clouds.some((c) => cloudConceals(c) && circleInsideShape(B.pos, rB, cloudShape(c)))
        let conc = inside === 'concealment' || o.grantedConcealment === true || featureAlongLine(ctx, B, 'concealment', lines)
        if (cloud && !o.ignoreCloudConcealment) conc = true
        if (o.ignoreAllConcealment) conc = false
        if (conc) cov = 'concealment'
      }
    }
    if (cov === 'cover') { cover = true; mods.push({ source: 'terrain', label: 'Cover', value: 4, mode: 'add' }) }
    else if (cov === 'concealment') { concealment = true; mods.push({ source: 'terrain', label: 'Concealment', value: 2, mode: 'add' }) }
    if (B.elev - A.elev >= 1 - 1e-9) { elevation = true; mods.push({ source: 'terrain', label: 'Higher elevation', value: 2, mode: 'add' }) }
    if (B.base <= 50 && o.ignoreTargetInMelee !== true) {
      let eng = engagedWith(state, targetId, o.melee)
      if (o.ignoreTargetInMelee === 'attacker') eng = eng.filter((e) => e.id !== o.originId)
      if (eng.length) { targetInMelee = true; mods.push({ source: 'engagement', label: 'Target in melee', value: 4, mode: 'add' }) }
    }
  }
  const def = mods.reduce((d, m) => (m.mode === 'set' ? m.value : d), o.baseDef) + mods.filter((m) => m.mode !== 'set').reduce((s, m) => s + m.value, 0)
  const autoHitMelee = o.kind === 'melee' && (downed || !!B.inert)
  return { baseDef, mods, def, concealment, cover, elevation, targetInMelee, autoHitMelee }
}


