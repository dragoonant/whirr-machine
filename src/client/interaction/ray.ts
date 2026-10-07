// Screen-to-table maths for the drag (pure): a pointer position to normalised device coordinates, and a camera ray to the
// table plane (y = 0). The drag uses these instead of the scene's own pointer events so it keeps tracking the pointer over
// the HUD and between figures.
import type { Vec2 } from '../../engine/index'

export interface RectLike { left: number; top: number; width: number; height: number }
export interface V3 { x: number; y: number; z: number }

/** NDC (-1..1, y up) of a client point inside the canvas rect. */
export const toNdc = (r: RectLike, cx: number, cy: number): { x: number; y: number } => ({
  x: ((cx - r.left) / r.width) * 2 - 1,
  y: -((cy - r.top) / r.height) * 2 + 1,
})

/** Is the client point inside the rect? */
export const insideRect = (r: RectLike, cx: number, cy: number): boolean => cx >= r.left && cx <= r.left + r.width && cy >= r.top && cy <= r.top + r.height

/** Where a ray meets the table plane, or null when it points level or away from it. */
export function rayToTable(origin: V3, dir: V3): Vec2 | null {
  if (dir.y >= -1e-6) return null
  const t = -origin.y / dir.y
  if (t <= 0) return null
  return { x: origin.x + dir.x * t, z: origin.z + dir.z * t }
}
