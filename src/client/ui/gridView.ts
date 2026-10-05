// Damage card model (50 section 6): the fill state comes from the presented ModelState, the system letters from the
// profile's grid strings (top box first, "-" = blank). Pure.
import { loadBundle } from '../../data/index'
import type { GameState, ModelState } from '../../engine/index'
import { profileOf } from './data'

export interface BoxView { filled: boolean; system: string | null; crippled: boolean }
export interface ColumnView { n: number; boxes: BoxView[] }
export interface GridView { id: 'main' | 'left' | 'right'; columns: ColumnView[] }
export type CardDamage =
  | { track: 'single'; boxes: BoxView[]; filled: number; total: number }
  | { track: 'grid'; grids: GridView[]; filled: number; total: number }

export interface SystemInfo { letter: string; name: string; effect: string; crippled: boolean }

const SYSTEM_EFFECT: Record<string, string> = {
  crippleLocation: 'Weapons here roll one fewer die and lose shield, buckler and special attacks.',
  crippleMovement: 'DEF drops to 5; no running, charging, slamming or trampling.',
  crippleCortex: 'Loses all focus and cannot gain or spend it.',
  crippleArcNode: 'Loses its Arc Node.',
}

export function systemInfo(letter: string, crippled: boolean): SystemInfo {
  const sys = (loadBundle().byId['core.systems'] as unknown as { systems?: Record<string, { name?: string; effect?: string }> } | undefined)?.systems?.[letter]
  return { letter, name: sys?.name ?? `System ${letter}`, effect: (sys?.effect && SYSTEM_EFFECT[sys.effect]) || '', crippled }
}

function layoutFor(m: ModelState, id: GridView['id']): string[] {
  const d = profileOf(m)?.damage
  if (!d) return []
  if (d.track === 'dualGrid') return (id === 'right' ? d.grids?.right : d.grids?.left) ?? []
  return d.columns ?? []
}

export function cardDamage(m: ModelState): CardDamage {
  const d = m.damage
  if (d.track === 'single') {
    const boxes: BoxView[] = Array.from({ length: d.boxes }, (_, i) => ({ filled: i < d.filled, system: null, crippled: false }))
    return { track: 'single', boxes, filled: d.filled, total: d.boxes }
  }
  let filled = 0, total = 0
  const grids: GridView[] = d.grids.map((g) => {
    const layout = layoutFor(m, g.id)
    return {
      id: g.id,
      columns: g.cols.map((col, c) => ({
        n: c + 1,
        boxes: col.map((f, i) => {
          const ch = layout[c]?.[i]
          const system = ch && ch !== '-' ? ch : null
          total++
          if (f) filled++
          return { filled: f, system, crippled: system !== null && m.crippled.includes(system) }
        }),
      })),
    }
  })
  return { track: 'grid', grids, filled, total }
}

/** Systems the model's grid carries (in letter order), with crippled flags from the state. */
export function systemsOf(m: ModelState): SystemInfo[] {
  const cd = cardDamage(m)
  if (cd.track !== 'grid') return []
  const seen = new Set<string>()
  for (const g of cd.grids) for (const c of g.columns) for (const b of c.boxes) if (b.system) seen.add(b.system)
  return [...seen].sort().map((l) => systemInfo(l, m.crippled.includes(l)))
}

/** Last box refs filled by damage to a model, from the event feed (for the flash). */
export function lastDamageKey(state: GameState | null, feed: readonly { seq: number; event: { type: string } }[], id: string): { seq: number; keys: Set<string> } | null {
  void state
  for (let i = feed.length - 1; i >= 0; i--) {
    const e = feed[i]!.event as { type: string; targetId?: string; boxes?: { grid?: string; col: number; row: number }[] }
    if (e.type === 'DamageApplied' && e.targetId === id && e.boxes?.length) {
      return { seq: feed[i]!.seq, keys: new Set(e.boxes.map((b) => `${b.grid ?? 'main'}:${b.col}:${b.row}`)) }
    }
  }
  return null
}
