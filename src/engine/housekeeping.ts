// State clean-up that follows every step: things that must disappear the moment their cause does (Rock Wall when its upkeep ends or a
// big base touches it; temporary rough ground at the end of its round). Pure; returns the same object when nothing changed.
import { pruneRockWalls } from './factions/trollbloods'
import type { GameState } from './types'

export function housekeeping(state: GameState): GameState {
  let s = state
  if (s.terrain.some((t) => t.props.rockWall)) s = pruneRockWalls(s)
  // Rift: its rough ground lasts the round it was made in
  if (s.terrain.some((t) => typeof t.props.tempRound === 'number' && (t.props.tempRound as number) < s.round)) {
    s = { ...s, terrain: s.terrain.filter((t) => !(typeof t.props.tempRound === 'number' && (t.props.tempRound as number) < s.round)) }
  }
  return s
}
