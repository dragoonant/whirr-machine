// Where and how often a status emits particles (pure; the component calls it every frame). Crippled systems come out of
// the socket nearest the system (30-figures section 5): arms spark, the head smokes, movement steams, the cortex flickers.
import { COLOURS, flash, mote, puff, sparks } from './particles'

export type SocketKind = 'spark' | 'smoke' | 'steam' | 'flicker' | 'flame' | 'drip'
export interface Socket { x: number; y: number; z: number; kind: SocketKind; rate: number }

/** Local-frame socket (origin = base centre, y up, +z front) for a crippled system letter on a body of radius r and height h. */
export function socketFor(system: string, r: number, h: number): Socket {
  switch (system) {
    case 'L': return { x: r * 0.95, y: h * 0.55, z: r * 0.15, kind: 'spark', rate: 5 }
    case 'R': return { x: -r * 0.95, y: h * 0.55, z: r * 0.15, kind: 'spark', rate: 5 }
    case 'H': return { x: 0, y: h * 0.95, z: 0, kind: 'smoke', rate: 4 }
    case 'M': return { x: 0, y: h * 0.18, z: -r * 0.5, kind: 'steam', rate: 4 }
    case 'C': return { x: 0, y: h * 0.7, z: 0, kind: 'flicker', rate: 3 }
    default: return { x: 0, y: h * 0.6, z: 0, kind: 'smoke', rate: 3 } // arc node and model-specific systems
  }
}

/** Sockets of every effect a figure shows right now (crippled systems, fire, corrosion). */
export function socketsFor(crippled: readonly string[], conditions: readonly string[], r: number, h: number): Socket[] {
  const out = crippled.map((c) => socketFor(c, r, h))
  if (conditions.includes('fire')) out.push({ x: 0, y: h * 0.45, z: 0, kind: 'flame', rate: 9 })
  if (conditions.includes('corrosion')) out.push({ x: 0, y: h * 0.8, z: 0, kind: 'drip', rate: 3 })
  return out
}

/** Emit this frame's particles for one socket: dt seconds, world position (wx, wy, wz) of the figure, yaw of the figure. */
export function emitSocket(s: Socket, dt: number, wx: number, wy: number, wz: number, yaw: number): void {
  if (Math.random() > s.rate * dt) return
  const c = Math.cos(yaw), sn = Math.sin(yaw)
  const x = wx + s.x * c + s.z * sn, z = wz - s.x * sn + s.z * c, y = wy + s.y
  switch (s.kind) {
    case 'spark': sparks(x, y, z, 3, COLOURS.electric, 2.2); break
    case 'smoke': puff(x, y, z, COLOURS.smoke, 0.45, 1.3, 0.8); break
    case 'steam': puff(x, y, z, COLOURS.steam, 0.4, 0.9, 1.2); break
    case 'flicker': flash(x, y, z, 0.5, COLOURS.electric, 0.08); break
    case 'flame': mote(x, y, z, COLOURS.flame, 0.34, 0.55); break
    case 'drip': mote(x, y, z, [0.45, 0.9, 0.3], 0.16, 0.7); break
  }
}
