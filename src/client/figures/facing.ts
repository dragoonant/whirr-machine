// Which way a figure looks. MK4 has no facing, so this is purely cosmetic: face the nearest living enemy, else
// across the table from the owner's deployment edge. Figures (GLB and procedural) have their front on +Z, so a
// world direction (dx, dz) maps to a yaw of atan2(dx, dz) about +Y.
import type { GameState, ModelId, Vec2 } from '../../engine/index'

const EDGE_YAW: Record<string, number> = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 }

export function facingYaw(state: GameState | null | undefined, id: ModelId, pos: Vec2): number | null {
  const m = state?.models[id]
  if (!state || !m) return null
  let best: Vec2 | null = null
  let bestD = Infinity
  for (const o of Object.values(state.models)) {
    if (o.owner === m.owner || o.offTable || o.life === 'destroyed' || o.life === 'boxed') continue
    const d = (o.pos.x - pos.x) ** 2 + (o.pos.z - pos.z) ** 2
    if (d < bestD && d > 1e-6) { bestD = d; best = o.pos }
  }
  if (best) return Math.atan2(best.x - pos.x, best.z - pos.z)
  const edge = state.players[m.owner]?.edge
  return edge ? EDGE_YAW[edge] ?? null : null
}

/** Step `from` toward `to` along the shorter arc by at most `maxStep` radians. */
export function turnToward(from: number, to: number, maxStep: number): number {
  let d = to - from
  d = Math.atan2(Math.sin(d), Math.cos(d))
  return Math.abs(d) <= maxStep ? to : from + Math.sign(d) * maxStep
}
