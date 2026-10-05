// Floating damage / heal / miss pops over models (DOM labels; the director owns their lifetime).
import { useEffect, useState, type ReactElement } from 'react'
import { Html } from '@react-three/drei'
import { directorNow, useDamagePops, usePresentedState } from '../contract'

const COLOURS: Record<string, string> = { damage: '#ff6b5a', heal: '#7fd18b', focus: '#ffd866', miss: '#c8c8c8', crit: '#ffb02e', info: '#e8e6e1' }

export function Pops(): ReactElement | null {
  const pops = useDamagePops()
  const state = usePresentedState()
  const [, tick] = useState(0)
  useEffect(() => {
    if (!pops.length) return
    const t = setInterval(() => tick((n) => n + 1), 120)
    return () => clearInterval(t)
  }, [pops.length])
  if (!state || !pops.length) return null
  const now = directorNow()
  return (
    <>
      {pops.map((p) => {
        const age = (now - p.startedAt) / Math.max(1, p.durationMs)
        const m = state.models[p.modelId]
        if (!m || age > 1.2) return null
        return (
          <Html key={p.id} position={[m.pos.x, 2.4 + Math.max(0, age) * 1.2, m.pos.z]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
            <span style={{ color: COLOURS[p.kind] ?? '#fff', font: '700 15px system-ui', textShadow: '0 1px 3px #000', opacity: Math.max(0, 1 - Math.max(0, age - 0.6) * 2.5), whiteSpace: 'nowrap' }}>{p.text}</span>
          </Html>
        )
      })}
    </>
  )
}
