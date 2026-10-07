// Per-figure particle status effects (crippled systems, fire, corrosion). Emits into the shared pools from the
// figure's world position; keeps the demand frameloop running at full rate while there is something to show.
import { useFrame } from '@react-three/fiber'
import { useMemo, type RefObject } from 'react'
import { useAmbientFrames } from '../board/frameRate'
import type { Group } from 'three'
import { emitSocket, socketsFor } from './sockets'

export interface StatusFxProps {
  root: RefObject<Group | null>
  r: number
  h: number
  crippled: readonly string[]
  conditions: readonly string[]
  /** False in Low graphics (static icons stand in). */
  enabled: boolean
}

export function StatusFx({ root, r, h, crippled, conditions, enabled }: StatusFxProps): null {
  const sockets = useMemo(() => socketsFor(crippled, conditions, r, h), [crippled, conditions, r, h])
  const active = enabled && sockets.length > 0
  useAmbientFrames(active, false)
  useFrame((_, delta) => {
    const g = root.current
    if (!active || !g) return
    const dt = Math.min(0.1, delta)
    for (const s of sockets) emitSocket(s, dt, g.position.x, g.position.y + 0.12, g.position.z, g.rotation.y)
  })
  return null
}
