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

export function playBeatAudio(events: readonly GameEvent[], state: GameState | null): void {
  try {
    initAudio()
    if (audio.music.getScene() === 'none') audio.setMusicScene('battle')
    playEventSounds(audio, events, { perspective: humanSeat(), state })
  } catch { /* sound must never break the game */ }
}
