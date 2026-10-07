// Presentation beats -> visual effect specs (pure: no three.js, no timers). The layer plays them. Reads the engine
// events a beat carries (and the presented state for positions); invents no rules numbers. One flavour per weapon
// comes from weaponFlavour.ts, the same classification the sound layer uses.
import type { GameEvent, GameState, ModelId, Vec2 } from '../../engine/index'
import { loadBundle } from '../../data/index'
import { weaponFlavour, type Flavour } from '../weaponFlavour'
import { MESH_HEIGHT } from '../figures/kit'

export interface V3 { x: number; y: number; z: number }
export type TracerStyle = 'tracer' | 'bolt' | 'arc'
/** The M9 weapons' own looks (claws, jaws, chain weapons, soul cannons, flame, holy fire, lightning, thorns, threshers). */
export type FxLook = 'claws' | 'bite' | 'chain' | 'soul' | 'flame' | 'holy-fire' | 'lightning' | 'thorn' | 'thresher'
const LOOKS: ReadonlySet<string> = new Set<FxLook>(['claws', 'bite', 'chain', 'soul', 'flame', 'holy-fire', 'lightning', 'thorn', 'thresher'])
/** The flavour's special look, if it has one. */
export const lookOf = (f: Flavour | undefined): FxLook | undefined => (f && LOOKS.has(f.vfx) ? (f.vfx as FxLook) : undefined)

export type FxSpec =
  | { kind: 'muzzle'; at: V3; dir: V3; big: boolean }
  | { kind: 'projectile'; from: V3; to: V3; style: TracerStyle; arcane: boolean; delay: number; dur: number; look?: FxLook }
  | { kind: 'impact'; at: V3; mode: 'melee' | 'ranged' | 'arcane' | 'blast'; delay: number; look?: FxLook }
  | { kind: 'ring'; at: V3; radius: number; mode: 'blast' | 'arcane'; delay: number; dur: number }
  | { kind: 'cripple'; at: V3 }
  | { kind: 'down'; at: V3 }

/** What a declared attack was, remembered until its damage shows (a later beat). */
export interface AttackMemo { mode: 'melee' | 'ranged' | 'arcane' | 'blast'; weaponId?: string }
export type AttackMemos = Map<string, AttackMemo>

const MAX_MEMOS = 64
export function remember(memos: AttackMemos, id: string, m: AttackMemo): void {
  memos.set(id, m)
  if (memos.size > MAX_MEMOS) memos.delete(memos.keys().next().value as string)
}

/** Torso-height point above a model, for muzzles, tracers and impacts. */
export function centreOf(s: GameState, id: ModelId | undefined): V3 | null {
  const m = id ? s.models[id] : undefined
  if (!m || m.offTable) return null
  const h = MESH_HEIGHT[m.base] ?? 1.25
  return { x: m.pos.x, y: m.elev + 0.12 + h * 0.6, z: m.pos.z }
}
const pointOf = (p: Vec2): V3 => ({ x: p.x, y: 0.12, z: p.z })
const norm = (a: V3, b: V3): V3 => {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l = Math.hypot(dx, dy, dz) || 1
  return { x: dx / l, y: dy / l, z: dz / l }
}
const dist = (a: V3, b: V3) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)

/** Radius (inches) of a weapon's blast from the data's `aoe` diameter; 1.5 when the data says nothing. */
export function blastRadius(weaponId: string | undefined): number {
  const rec = weaponId ? (loadBundle().byId[weaponId] as { aoe?: number } | undefined) : undefined
  return rec?.aoe && rec.aoe > 0 ? rec.aoe / 2 : 1.5
}

/** Travel time of a projectile in seconds at speed 1: short for tracers, longer for lobbed shells. */
export const travelSeconds = (d: number, style: TracerStyle): number =>
  Math.min(0.5, Math.max(0.1, (style === 'arc' ? 0.22 : 0.1) + d * (style === 'arc' ? 0.012 : 0.006)))

const styleOf = (f: Flavour): TracerStyle => {
  switch (f.vfx) {
    case 'tracer': case 'spray': case 'spark-burst': case 'flame': case 'holy-fire': return 'tracer'
    case 'soul': case 'lightning': return 'bolt'
    case 'thorn': return 'arc'
    case 'shell': case 'lob': case 'rocket': case 'thrown': return 'arc'
    default: return 'bolt'
  }
}

/** Effects for one event, using the presented state for positions. */
export function planEvent(ev: GameEvent, s: GameState, memos: AttackMemos): FxSpec[] {
  const out: FxSpec[] = []
  switch (ev.type) {
    case 'AttackDeclared': {
      const from = centreOf(s, ev.originId ?? ev.attackerId)
      const to = centreOf(s, ev.targetId)
      const weaponId = ev.weaponId
      const melee = ev.kind === 'melee' || ev.kind === 'power' || ev.kind === 'trample' || !!ev.powerKind
      const arcane = ev.kind === 'arcane' || (!!ev.spellId && !weaponId)
      const flavour = weaponId ? weaponFlavour(weaponId, melee) : undefined
      if (melee || (flavour?.melee && !arcane)) { remember(memos, ev.attackId, { mode: 'melee', weaponId }); break }
      remember(memos, ev.attackId, { mode: arcane ? 'arcane' : ev.kind === 'aoe' ? 'blast' : 'ranged', weaponId })
      if (!from || !to) break
      const d = dist(from, to)
      if (arcane) {
        out.push({ kind: 'projectile', from, to, style: 'bolt', arcane: true, delay: 0, dur: travelSeconds(d, 'bolt') })
        break
      }
      const style = flavour ? styleOf(flavour) : 'tracer'
      const look = lookOf(flavour)
      out.push({ kind: 'muzzle', at: from, dir: norm(from, to), big: style === 'arc' })
      out.push({ kind: 'projectile', from, to, style, arcane: false, delay: 0.03, dur: travelSeconds(d, style), ...(look ? { look } : {}) })
      break
    }
    case 'BlastTargetsFixed': {
      const centre = centreOf(s, ev.centreId)
      const ground = s.models[ev.centreId]?.pos
      if (!centre || !ground) break
      const radius = blastRadius(memos.get(ev.attackId)?.weaponId)
      remember(memos, ev.attackId, { mode: 'blast', weaponId: memos.get(ev.attackId)?.weaponId })
      out.push({ kind: 'ring', at: pointOf(ground), radius, mode: 'blast', delay: 0, dur: 0.55 })
      out.push({ kind: 'impact', at: centre, mode: 'blast', delay: 0 })
      break
    }
    case 'DamageApplied': {
      if (ev.points <= 0) break
      const at = centreOf(s, ev.targetId)
      const memo = ev.attackId ? memos.get(ev.attackId) : undefined
      if (!at) break
      // a blast already burst at its centre; neighbours get the ordinary ranged spark
      const look = memo?.weaponId ? lookOf(weaponFlavour(memo.weaponId, memo.mode === 'melee')) : undefined
      out.push({ kind: 'impact', at, mode: memo?.mode === 'blast' ? 'ranged' : memo?.mode ?? 'ranged', delay: 0, ...(look ? { look } : {}) })
      break
    }
    case 'SpellCast': {
      if (ev.attackId) break // an attack spell: the AttackDeclared that goes with it draws the bolt
      const from = centreOf(s, ev.casterId)
      const to = centreOf(s, ev.targetId)
      if (ev.point) out.push({ kind: 'ring', at: pointOf(ev.point), radius: 1.6, mode: 'arcane', delay: 0, dur: 0.6 })
      else if (from && to && ev.targetId !== ev.casterId) out.push({ kind: 'projectile', from, to, style: 'bolt', arcane: true, delay: 0, dur: travelSeconds(dist(from, to), 'bolt') })
      else if (from) out.push({ kind: 'ring', at: { x: from.x, y: 0.12, z: from.z }, radius: 1.1, mode: 'arcane', delay: 0, dur: 0.6 })
      break
    }
    case 'FeatUsed': {
      const at = s.models[ev.casterId]?.pos
      if (at) out.push({ kind: 'ring', at: pointOf(at), radius: 3, mode: 'arcane', delay: 0, dur: 0.9 })
      break
    }
    case 'SystemCrippled': {
      const at = centreOf(s, ev.modelId)
      if (at) out.push({ kind: 'cripple', at })
      break
    }
    case 'LifeStateChanged': {
      if (ev.to !== 'destroyed' && ev.to !== 'boxed' && ev.to !== 'disabled') break
      const at = centreOf(s, ev.modelId)
      if (at) out.push({ kind: 'down', at })
      break
    }
    default: break
  }
  return out
}

/** Effects for a run of newly shown events. A long run is a fast-forward (skip, load): it plays nothing. */
export function planEvents(events: readonly GameEvent[], s: GameState, memos: AttackMemos): FxSpec[] {
  const out: FxSpec[] = []
  if (events.length > 14) { for (const e of events) if (e.type === 'AttackDeclared') remember(memos, e.attackId, { mode: 'ranged', weaponId: e.weaponId }); return out }
  for (const e of events) out.push(...planEvent(e, s, memos))
  return out
}
