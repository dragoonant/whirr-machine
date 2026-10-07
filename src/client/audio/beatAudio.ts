// The presentation director's single hook: play the sounds for the events of one beat.
import type { GameEvent, GameState, PlayerId } from '../../engine/index'
import { useGameStore } from '../store/gameStore'
import { audio, initAudio } from './audio'
import { playEventSounds } from './eventSounds'

/** The seat a person is playing, or undefined when neither or both seats are human (neutral narration). */
export function humanSeat(): PlayerId | undefined {
  const c = useGameStore.getState().controllers
  const humans = (['A', 'B'] as const).filter((p) => c[p] === 'human')
  return humans.length === 1 ? humans[0] : undefined
}

/** Faction id to the music track of its battle theme. Cygnar and Khador have none and keep the shared battle loops. */
export const FACTION_THEMES: Readonly<Record<string, string>> = {
  trl: 'music-faction-trollbloods', cir: 'music-faction-circle', cry: 'music-faction-cryx', men: 'music-faction-menoth',
}

/** Point the music bus at the human player's faction theme (null when there is no single human or no theme). */
export function syncBattleTheme(state: GameState | null = useGameStore.getState().state): void {
  try {
    const seat = humanSeat()
    const faction = seat && state ? state.players?.[seat]?.faction : undefined
    audio.music.setTheme((faction && FACTION_THEMES[faction]) || null)
  } catch { /* sound must never break the game */ }
}

export function playBeatAudio(events: readonly GameEvent[], state: GameState | null): void {
  try {
    initAudio()
    syncBattleTheme(state)
    if (audio.music.getScene() === 'none') audio.setMusicScene('battle')
    playEventSounds(audio, events, { perspective: humanSeat(), state })
  } catch { /* sound must never break the game */ }
}
