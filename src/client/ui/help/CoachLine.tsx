// Dismissible first-time tip at the bottom of the screen, driven by the engine's pending decision.
import { useState } from 'react'
import { usePrompt } from '../../contract'
import { COACH_KEY, coachTip, dismissKind, parseCoach, shouldCoach, type CoachMemory } from './coachText'
import { openHelp } from './HelpGuide'
import './help.css'

let mem: CoachMemory | null = null
function load(): CoachMemory {
  if (mem) return mem
  let raw: string | null = null
  try { raw = localStorage.getItem(COACH_KEY) } catch { /* blocked */ }
  return (mem = parseCoach(raw))
}
function save(next: CoachMemory): void {
  mem = next
  try { localStorage.setItem(COACH_KEY, JSON.stringify(next)) } catch { /* blocked */ }
}

export function CoachLine() {
  const prompt = usePrompt()
  const [, bump] = useState(0)
  const m = load()
  const kind = prompt?.kind
  if (!kind || !shouldCoach(m, kind)) return null
  const tip = coachTip(kind)
  return (
    <div className="coach" role="status" data-testid="coach-line">
      <span className="coach-text">{tip}</span>
      <button type="button" className="coach-link" onClick={() => openHelp()}>How to play</button>
      <button type="button" className="coach-x" data-testid="coach-dismiss" aria-label="Dismiss this tip" title="Dismiss this tip"
        onClick={() => { save(dismissKind(m, kind)); bump((n) => n + 1) }}>x</button>
      <button type="button" className="coach-link" data-testid="coach-off" onClick={() => { save({ ...m, off: true }); bump((n) => n + 1) }}>Turn tips off</button>
    </div>
  )
}
