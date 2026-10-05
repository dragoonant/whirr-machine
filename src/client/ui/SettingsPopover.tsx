import { useEffect, useRef, useState } from 'react'
import { audio, useAudioSettings } from '../audio'
import { settings, useSettings } from '../contract'
import './hud.css'
import { setTipsEnabled, useTipsEnabled } from './help/CoachLine'
import { SPEED_CHOICES } from './start/startOptions'

const BUSES = [['master', 'Master'], ['sfx', 'Effects'], ['voice', 'Narrator'], ['music', 'Music']] as const

/** The sound sliders of the start screen's Sound card, without its title-music side effect (the battle music keeps playing). */
function Volumes() {
  const s = useAudioSettings()
  return (
    <div className="set-group" data-testid="set-sound">
      <div className="set-label">Sound</div>
      {BUSES.map(([bus, label]) => (
        <label key={bus} className="set-row">{label}
          <input type="range" min={0} max={100} step={1} value={Math.round(s[bus] * 100)} aria-label={`${label} volume`}
            data-testid={`set-sound-${bus}`} onChange={(e) => audio.setVolume(bus, Number(e.target.value) / 100)} />
        </label>
      ))}
      <label className="set-row set-check">
        <input type="checkbox" checked={s.muted} data-testid="set-mute" onChange={(e) => audio.setMuted(e.target.checked)} /> Mute all sound
      </label>
    </div>
  )
}

export function SettingsPanel() {
  const st = useSettings()
  const tips = useTipsEnabled()
  return (
    <div className="hud-card set-pop" data-testid="settings-popover" role="dialog" aria-label="Settings">
      <h3 className="hud-h">Settings</h3>
      <div className="set-group">
        <div className="set-label">Animation speed</div>
        <div className="set-seg">
          {SPEED_CHOICES.map((c) => (
            <button key={c.id} type="button" data-testid={`set-speed-${c.id}`} className={c.value === st.speed ? 'on' : ''} aria-pressed={c.value === st.speed}
              onClick={() => settings.set({ speed: c.value })}>{c.label}</button>
          ))}
        </div>
      </div>
      <div className="set-group">
        <div className="set-label">Graphics</div>
        <div className="set-seg">
          {(['low', 'high'] as const).map((g) => (
            <button key={g} type="button" data-testid={`set-graphics-${g}`} className={st.graphics === g ? 'on' : ''} aria-pressed={st.graphics === g}
              onClick={() => settings.set({ graphics: g })}>{g === 'low' ? 'Low' : 'High'}</button>
          ))}
        </div>
      </div>
      <label className="set-row set-check">
        <input type="checkbox" data-testid="set-narration" checked={st.narration} onChange={(e) => settings.set({ narration: e.target.checked })} />
        Narration pauses (round and turn banners hold; click to skip)
      </label>
      <label className="set-row set-check">
        <input type="checkbox" data-testid="set-tips" checked={tips} onChange={(e) => setTipsEnabled(e.target.checked)} /> Show tips
      </label>
      <label className="set-row set-check">
        <input type="checkbox" data-testid="set-confirm-end" checked={st.confirmEndTurn} onChange={(e) => settings.set({ confirmEndTurn: e.target.checked })} /> Ask before ending a turn
      </label>
      <Volumes />
    </div>
  )
}

/** Gear button for the top bar; opens the settings popover, closed by Escape or a click outside. */
export function SettingsButton() {
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
      <button type="button" className="hud-btn set-gear" data-testid="settings-button" aria-label="Settings" aria-expanded={open} title="Settings" onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
          <circle cx="12" cy="12" r="6.6" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      {open && <SettingsPanel />}
    </div>
  )
}
