// Table edge choice (91 B, SR1/SR5, 40-ai): the Defender picks north or south. The terrain stays where it is and the scenario elements turn to the
// real edges (the attacker frame), so the edge decides which terrain sits in whose deployment zone and next to whose objectives, flags and cache.
// Each legal edge is scored on the hypothetical table that edge produces (the same `applyAttackerFrame` the engine runs), as
// (what the terrain does for us) minus (what it does for them). Normal tier only; easy takes the sensible random pick.
import type { Action, GameState, PlayerId, Vec2 } from '../engine/index'
import { applyAttackerFrame } from '../engine/scenario-rules'
import { terrainPieces, type TerrainPiece } from '../engine/terrain'
import type { Env } from './plan'
import { bundle, dist, elementsOf, forwardOf, halfTable, other, rec } from './world'

const OPPOSITE: Record<string, string> = { north: 'south', south: 'north', east: 'west', west: 'east' }
const NEAR = 5 // terrain this close to an element shapes who can hold it (a flag picks a piece within 5")

/** How much a piece does for a unit standing behind it or in it: cover and concealment, line-of-sight blockers, nothing for hazards. */
export function pieceValue(p: TerrainPiece): number {
  const t = p.traits
  if (t.hazard) return -0.8
  let v = (t.cover === 'cover' ? 1 : t.cover === 'concealment' ? 0.5 : 0) + (t.insideCover === 'cover' ? 0.8 : t.insideCover === 'concealment' ? 0.5 : 0)
  if (t.blocksLos) v += 0.3
  if (t.rough && !t.forest) v -= 0.2 // slows both sides
  return Math.min(1.6, v)
}
const blocksMovement = (p: TerrainPiece): boolean => p.traits.move === 'impassable' || p.traits.move === 'obstacle'

/** Depth of a point into the table from the player's own edge (0 on the edge). */
function depthFrom(s: GameState, p: PlayerId, at: Vec2): number {
  const f = forwardOf(s, p)
  const { hw, hd } = halfTable(s)
  return (at.x + f.x * hw) * f.x + (at.z + f.z * hd) * f.z
}

interface Deploy { first?: number; second?: number; advance?: number }

/** Terrain value for `me` on the table where `s` has both edges set: positive is good for `me`. */
export function terrainBalance(s: GameState, me: PlayerId): number {
  const pieces = terrainPieces(s).map((p) => ({ p, v: pieceValue(p), pos: p.t.pos }))
  const dep = ((rec(s.setup.scenario) as { deployment?: Deploy } | undefined)?.deployment ?? {}) as Deploy
  const foe = other(me)
  const depthOf = (p: PlayerId): number => (s.firstPlayer === p ? dep.first ?? 6 : dep.second ?? 11) + (dep.advance ?? 3)
  let total = 0
  // cover where each side deploys: the Defender's deep zone is worth more as it holds more units
  for (const { v, pos } of pieces) {
    if (depthFrom(s, me, pos) <= depthOf(me) + 2) total += v * 0.6
    if (depthFrom(s, foe, pos) <= depthOf(foe) + 2) total -= v * 0.6
  }
  // terrain at the scenario's elements: cover helps whoever holds it; a flag wants a piece to take (SR10)
  const els = elementsOf(s)
  const weight: Record<string, number> = { objective50: 1.2, objective40: 1, flag: 1.6 }
  for (const el of els) {
    const w = weight[el.kind ?? ''] ?? 0.8
    const mine = el.owner === me, theirs = el.owner === foe
    let best = 0, sum = 0
    for (const { p, v, pos } of pieces) {
      const d = p.shape.kind === 'circle' ? Math.max(0, dist(el.pos, p.shape.c) - p.shape.r) : Math.max(0, dist(el.pos, pos) - 3)
      if (d > NEAR || v <= 0) continue
      best = Math.max(best, v); sum += v
    }
    const gain = Math.min(2.5, sum) * 0.5 + best
    if (el.kind === 'flag') {
      // the Attacker picks its flag terrain first, so a piece next to the opponent's flag is worth a little less to them than a piece next to ours is to us
      total += mine ? w * (gain > 0 ? gain : -1) : theirs ? -w * 0.8 * (gain > 0 ? gain : -1) : 0
    } else total += mine ? w * gain * 0.7 : theirs ? -w * gain * 0.7 : 0
  }
  // caches (Trench Warfare): walls that stop a model reaching a cache protect it, so they are good beside ours and bad beside theirs
  const def = rec(s.setup.scenario) as { elements?: { id: string; kind?: string; owner?: string; pos?: Vec2 }[] } | undefined
  for (const e of def?.elements ?? []) {
    if (e.kind !== 'cache') continue
    const owner = e.owner === 'first' ? s.firstPlayer : e.owner === 'second' ? (s.firstPlayer ? other(s.firstPlayer) : null) : null
    const at = s.scenario.elementState?.[e.id]?.pos ?? e.pos
    if (!owner || !at) continue
    const walls = pieces.filter(({ p }) => blocksMovement(p) && p.shape.kind === 'circle' ? dist(at, p.shape.c) - p.shape.r <= 4 : blocksMovement(p) && dist(at, p.t.pos) <= 6).length
    total += (owner === me ? 1 : -1) * Math.min(2, walls) * 0.7
  }
  return total
}

/** The chooseEdge action whose edge leaves the better terrain for the Defender (`env.me`); null when there is nothing to compare. */
export function edgePick(env: Env, legal: Action[]): Action | null {
  const s = env.s
  const first = s.firstPlayer
  if (!first) return null
  const me = env.me
  let best: Action | null = null, bv = -Infinity
  for (const a of legal) {
    if (a.type !== 'chooseEdge') continue
    const edge = a.edge, opp = OPPOSITE[edge] as typeof edge
    const players = { ...s.players, [me]: { ...s.players[me], edge }, [other(me)]: { ...s.players[other(me)], edge: opp } } as GameState['players']
    const hyp = applyAttackerFrame({ ...s, players }, bundle())
    const v = terrainBalance(hyp, me)
    if (v > bv + 1e-9) { bv = v; best = a }
  }
  return best
}
