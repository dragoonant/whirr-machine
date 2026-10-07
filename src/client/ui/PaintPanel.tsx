import { useEffect, useRef, useState } from 'react'
import { dataName, useControllers, usePresentedState } from '../contract'
import { PAINT_PRESETS, usePaintStore, type ArmyPaint } from '../figures/paintStore'
import './hud.css'
import { isStock, paintRows, presetOn, type PaintRow } from './paintView'

/** Paint one side: a saved faction paint normally, a this-game override for the opponent in a mirror match. */
function setPaint(row: PaintRow, paint: ArmyPaint): void {
  const st = usePaintStore.getState()
  if (row.override) st.setSide(row.side, paint)
  else st.setFaction(row.faction, paint)
}

function SideRow({ row, who }: { row: PaintRow; who: string }) {
  const faction = usePaintStore((s) => s.byFaction[row.faction])
  const sideP = usePaintStore((s) => s.bySide[row.side])
  useEffect(() => { usePaintStore.getState().load(row.faction) }, [row.faction])
  const paint: ArmyPaint = (row.override ? sideP ?? faction : faction) ?? {}
  const t = (k: string) => `paint-${row.role}-${k}`
  return (
    <div className="set-group paint-row" data-testid={`paint-row-${row.role}`} data-faction={row.faction}>
      <div className="set-label">{who}: {dataName(row.faction)}{row.override ? ' (this game)' : ''}</div>
      <div className="paint-presets">
        <button type="button" className={`paint-chip${isStock(paint) ? ' on' : ''}`} data-testid={t('stock')} aria-pressed={isStock(paint)}
          onClick={() => setPaint(row, {})}>{row.override ? 'Match yours' : 'Stock'}</button>
        {PAINT_PRESETS.map((p) => (
          <button key={p.id} type="button" className={`paint-chip${presetOn(p, paint) ? ' on' : ''}`} data-testid={t(`preset-${p.id}`)} aria-pressed={presetOn(p, paint)}
            title={p.label} onClick={() => setPaint(row, { primary: p.primary, secondary: p.secondary })}>
            <span className="paint-sw" style={{ background: p.primary }} /><span className="paint-sw" style={{ background: p.secondary }} />{p.label}
          </button>
        ))}
      </div>
      <div className="paint-pick">
        <label>Main <input type="color" data-testid={t('main')} value={paint.primary ?? row.palette.primary} onChange={(e) => setPaint(row, { ...paint, primary: e.target.value })} /></label>
        <label>Trim <input type="color" data-testid={t('trim')} value={paint.secondary ?? row.palette.secondary} onChange={(e) => setPaint(row, { ...paint, secondary: e.target.value })} /></label>
      </div>
    </div>
  )
}

export function PaintPanel() {
  const state = usePresentedState()
  const controllers = useControllers()
  if (!state) return null
  const rows = paintRows(state, controllers)
  return (
    <div className="hud-card set-pop paint-pop" data-testid="paint-popover" role="dialog" aria-label="Army painter">
      <h3 className="hud-h">Army painter</h3>
      {rows.map((r) => <SideRow key={r.side} row={r} who={r.role === 'you' ? 'Your army' : 'Opponent'} />)}
      <p className="hud-dim paint-note">Colours apply to the figures on the table right away and are remembered for each faction.</p>
    </div>
  )
}

/** Palette button for the top bar: opens the painter, closed by Escape or a click outside. */
export function PaintButton() {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const down = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerdown', down)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', down) }
  }, [open])
  return (
    <div className="set-wrap" ref={box}>
      <button type="button" className="hud-btn set-gear paint-btn" data-testid="paint-button" aria-label="Paint your army" aria-expanded={open} title="Paint your army" onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" d="M12 3C6.5 3 3 7 3 11.5 3 16 6.5 19 10 19c1.6 0 2-1 1.4-2-.7-1.2.1-2.5 1.6-2.5H16c2.8 0 5-1.7 5-4.2C21 6 17 3 12 3z" />
          <circle cx="8" cy="10.5" r="1.3" fill="currentColor" /><circle cx="12" cy="7.5" r="1.3" fill="currentColor" /><circle cx="16.2" cy="10" r="1.3" fill="currentColor" />
        </svg>
        <span className="paint-btn-label">Paint</span>
      </button>
      {open && <PaintPanel />}
    </div>
  )
}
