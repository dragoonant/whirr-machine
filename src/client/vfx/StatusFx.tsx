// Per-figure particle status effects (crippled systems, fire, corrosion). Emits into the shared pools from the
// figure's world position; asks the demand frameloop for ~15 frames a second while there is something to show.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, type RefObject } from 'react'
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
  const invalidate = useThree((s) => s.invalidate)
  const sockets = useMemo(() => socketsFor(crippled, conditions, r, h), [crippled, conditions, r, h])
  const active = enabled && sockets.length > 0
  useEffect(() => {
    if (!active) return
    const t = setInterval(invalidate, 66)
    return () => clearInterval(t)
  }, [active, invalidate])
  useFrame((_, delta) => {
    const g = root.current
    if (!active || !g) return
    const dt = Math.min(0.1, delta)
    for (const s of sockets) emitSocket(s, dt, g.position.x, g.position.y + 0.12, g.position.z, g.rotation.y)
  })
  return null
}
