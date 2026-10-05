// Army painter settings (30-figures section 4): per faction, two colours. Unset = the faction's stock look (no remap).
// Client-only, never seen by the engine. Persisted per faction as `wm.paint.<faction>`; a per-side override (session only)
// lets a mirror match give each side its own colours. Kept out of settingsStore.ts so that file stays frozen.
import { create } from 'zustand'
import type { PlayerId } from '../../engine/index'
import { readJson, writeJson } from '../store/storage'

export interface ArmyPaint { primary?: string; secondary?: string }
export interface PaintPreset { id: string; label: string; primary: string; secondary: string }

/** Four original schemes; the faction's own colours are the implicit fifth ("Stock", no paint). */
export const PAINT_PRESETS: readonly PaintPreset[] = [
  { id: 'verdigris', label: 'Verdigris', primary: '#1f7a6e', secondary: '#c98a3c' },
  { id: 'ashen', label: 'Ashen', primary: '#5a6270', secondary: '#d9d4c7' },
  { id: 'dusk', label: 'Dusk violet', primary: '#5b3a8c', secondary: '#e0b84a' },
  { id: 'emberline', label: 'Emberline', primary: '#c4501f', secondary: '#2a2a30' },
]

const HEX = /^#[0-9a-fA-F]{6}$/
export const paintKeyFor = (faction: string): string => `wm.paint.${faction}`

export function sanitizePaint(raw: unknown): ArmyPaint {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: ArmyPaint = {}
  if (typeof o.primary === 'string' && HEX.test(o.primary)) out.primary = o.primary.toLowerCase()
  if (typeof o.secondary === 'string' && HEX.test(o.secondary)) out.secondary = o.secondary.toLowerCase()
  return out
}

/** Stable key for a paint (cache keys and effect dependencies). '' = unpainted. */
export const paintKey = (p?: ArmyPaint): string => (p && (p.primary || p.secondary) ? `${p.primary ?? '-'}|${p.secondary ?? '-'}` : '')

interface PaintStore {
  byFaction: Record<string, ArmyPaint>
  bySide: Partial<Record<PlayerId, ArmyPaint>>
  /** Set (or clear with {}) the persisted paint for a faction. */
  setFaction(faction: string, paint: ArmyPaint): void
  /** Set (or clear with undefined) a session-only override for one side. */
  setSide(side: PlayerId, paint: ArmyPaint | undefined): void
  /** Re-read a faction from storage (call once per faction before first use). */
  load(faction: string): void
}

export const usePaintStore = create<PaintStore>((set, get) => ({
  byFaction: {},
  bySide: {},
  setFaction(faction, paint) {
    const clean = sanitizePaint(paint)
    set({ byFaction: { ...get().byFaction, [faction]: clean } })
    writeJson(paintKeyFor(faction), clean)
  },
  setSide(side, paint) {
    const next = { ...get().bySide }
    if (paint && paintKey(sanitizePaint(paint))) next[side] = sanitizePaint(paint)
    else delete next[side]
    set({ bySide: next })
  },
  load(faction) {
    if (get().byFaction[faction]) return
    set({ byFaction: { ...get().byFaction, [faction]: sanitizePaint(readJson(paintKeyFor(faction))) } })
  },
}))

/** The paint a figure of (faction, side) wears: the side override, else the faction's saved paint, else undefined. */
export function resolvePaint(faction: string, side: PlayerId, s: Pick<PaintStore, 'byFaction' | 'bySide'> = usePaintStore.getState()): ArmyPaint | undefined {
  const p = s.bySide[side] ?? s.byFaction[faction]
  return p && paintKey(p) ? p : undefined
}

/** React hook form of resolvePaint; loads the faction's saved paint on first use. */
export function usePaint(faction: string, side: PlayerId): ArmyPaint | undefined {
  const sideP = usePaintStore((s) => s.bySide[side])
  const facP = usePaintStore((s) => s.byFaction[faction])
  if (!facP && !usePaintStore.getState().byFaction[faction]) queueMicrotask(() => usePaintStore.getState().load(faction))
  const p = sideP ?? facP
  return p && paintKey(p) ? p : undefined
}
