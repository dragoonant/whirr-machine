import { useSyncExternalStore } from 'react'
import { audio } from './audio'
import type { AudioSettings } from './settings'

/** React hook: live audio settings plus the setters. */
export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore((cb) => audio.onSettingsChange(cb), () => audio.getSettings(), () => audio.getSettings())
}
