// Hover tooltip for terrain: the piece's name and what it does to movement, sight and defence (our words, 70 section F).
import { useEffect, useMemo, type ReactElement } from 'react'
import { dataName, useHoverId, usePresentedState } from '../contract'
import { terrainInfo } from './terrainInfo'
import { clearTerrainHover, useTerrainHover } from './terrainHover'

export function TerrainTooltip(): ReactElement | null {
  const { id, x, y } = useTerrainHover()
  const hoveredModel = useHoverId()
  useEffect(() => {
    if (!id) return
    const off = () => clearTerrainHover()
    window.addEventListener('pointerdown', off, { capture: true })
    return () => window.removeEventListener('pointerdown', off, { capture: true })
  }, [id])
  const state = usePresentedState()
  const piece = useMemo(() => (id ? state?.terrain.find((t) => t.id === id) : undefined), [id, state?.terrain])
  const info = useMemo(() => (piece ? terrainInfo(piece) : null), [piece])
  if (!piece || !info || hoveredModel) return null
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth
  const left = Math.min(x + 16, vw - 280)
  return (
    <div data-testid="terrain-tooltip" role="tooltip" style={{
      position: 'fixed', left, top: y + 18, width: 260, pointerEvents: 'none', zIndex: 30, background: '#1e2127f2', color: '#e8e6e1',
      border: '1px solid #c9a22788', borderRadius: 8, padding: '8px 10px', font: '13px/1.35 system-ui', boxShadow: '0 4px 14px #0008',
    }}>
      <div style={{ font: '600 14px system-ui', color: '#c9a227' }} data-testid="terrain-tooltip-name">{dataName(piece.pieceId)}</div>
      <div style={{ opacity: 0.7, marginBottom: 4 }} data-testid="terrain-tooltip-kind">{info.kind}</div>
      {info.lines.map((l, i) => <div key={i} style={{ marginTop: 3 }}>{l}</div>)}
    </div>
  )
}
