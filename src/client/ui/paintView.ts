// What the in-game Paint popover edits: one row per side (you, then the opponent) with that side's faction, and where
// a change is stored. Pure; the popover is PaintPanel.tsx. Colours are display only, the engine never sees them.
import type { GameState, PlayerId } from '../../engine/index'
import { factionData, factionOf } from '../figures/profile'
import { paintKey, type ArmyPaint, type PaintPreset } from '../figures/paintStore'

export interface PaintRow {
  side: PlayerId
  role: 'you' | 'opponent'
  faction: string
  /** True when both armies are the same faction, so the opponent's paint is a this-game override instead of the faction's saved paint. */
  override: boolean
  /** The faction's own two colours: what the pickers show before anything is painted. */
  palette: { primary: string; secondary: string }
}

/** The side the person plays: the first human-controlled one (A when none or both are). */
export function humanSide(controllers: Record<PlayerId, 'human' | 'bot'>): PlayerId {
  return controllers.A === 'human' || controllers.B !== 'human' ? 'A' : 'B'
}

export function paintRows(state: GameState, controllers: Record<PlayerId, 'human' | 'bot'>): PaintRow[] {
  const me = humanSide(controllers)
  const sides: PlayerId[] = [me, me === 'A' ? 'B' : 'A']
  const facOf = (s: PlayerId): string => factionOf(state.models[state.players[s].leaderId]?.profileId ?? '')
  const same = facOf('A') === facOf('B')
  return sides.map((side, i) => {
    const faction = facOf(side)
    const pal = factionData(faction).palette
    return {
      side, role: i === 0 ? 'you' : 'opponent', faction, override: same && i === 1,
      palette: { primary: pal?.primary ?? '#444444', secondary: pal?.secondary ?? '#888888' },
    }
  })
}

/** Preset swatch is "on" when the current paint is exactly that preset. */
export const presetOn = (p: PaintPreset, paint: ArmyPaint | undefined): boolean =>
  !!paint && paint.primary?.toLowerCase() === p.primary.toLowerCase() && paint.secondary?.toLowerCase() === p.secondary.toLowerCase()

/** True when nothing is painted (the stock look). */
export const isStock = (paint: ArmyPaint | undefined): boolean => !paintKey(paint)
