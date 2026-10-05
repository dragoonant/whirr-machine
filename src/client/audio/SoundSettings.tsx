// Sound section for the start screen: four volume sliders and a mute switch. Mounting it also starts the title theme
// (once the first click unlocks audio); leaving it (the game starts) hands over to the battle music.
import { useEffect } from 'react'
import { audio, initAudio } from './audio'
import { useAudioSettings } from './useAudioSettings'

const BUSES = [['master', 'Master'], ['sfx', 'Effects'], ['voice', 'Narrator'], ['music', 'Music']] as const

export function SoundSettings() {
  const s = useAudioSettings()
  useEffect(() => {
    initAudio()
    audio.setMusicScene('title')
    return () => { audio.setMusicScene('battle') }
  }, [])
  return (
    <section className="start-card start-sound" data-testid="sound-settings">
      <h2>Sound</h2>
      {BUSES.map(([bus, label]) => (
        <label key={bus}>{label}
          <input type="range" min={0} max={100} step={1} value={Math.round(s[bus] * 100)} aria-label={`${label} volume`}
            data-testid={`sound-${bus}`} onChange={(e) => audio.setVolume(bus, Number(e.target.value) / 100)} />
        </label>
      ))}
      <label className="start-sound-mute">
        <input type="checkbox" checked={s.muted} data-testid="sound-mute" onChange={(e) => audio.setMuted(e.target.checked)} />
        Mute all sound
      </label>
    </section>
  )
}
