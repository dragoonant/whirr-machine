// Board keyboard: M ruler, L LOS view, T threat rings, Enter commit staged move/placement, Esc clear, Backspace drops the
// last waypoint, [ and ] fold the side rails, V cycle camera.
// WASD panning lives in the camera rig. Keys are ignored while typing and never answer a rules decision on their own.
import { useEffect } from 'react'
import { uiActions } from '../contract'
import { panelActions } from '../store/panelStore'
import { modeForDecision, useUiStore } from '../store/uiStore'
import type { CameraPresetId } from '../board/layout'
import { currentPrompt } from './adapter'
import { cancelStaged, commitStaged, defaultStraightPath } from './controller'
import { interactionActions, useInteractionStore } from './store'

const CYCLE: CameraPresetId[] = ['top', 'edgeA', 'edgeB', 'follow']
let cycleIdx = -1

export function onBoardKey(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false
  const k = e.key.toLowerCase()
  const fallback = modeForDecision(currentPrompt()?.kind)
  switch (k) {
    case 'm': uiActions.toggleTool('measure', fallback); return true
    case 'l': uiActions.toggleTool('los', fallback); return true
    case 't': uiActions.toggleThreat(); return true
    case 'v': cycleIdx = (cycleIdx + 1) % CYCLE.length; interactionActions.cameraPreset(CYCLE[cycleIdx]!); return true
    case 'backspace': return currentPrompt()?.kind === 'moveModel' && interactionActions.popWaypoint()
    case '[': panelActions.toggle('left'); return true
    case ']': panelActions.toggle('right'); return true
    case 'enter': {
      const straight = defaultStraightPath(currentPrompt()) !== null
      if (!hasStaged() && !straight) return false // leave Enter to the prompt UI
      commitStaged()
      return true
    }
    case 'escape': {
      if (hasStaged()) { cancelStaged(); return true }
      const s = useUiStore.getState()
      if (s.modeLocked) { uiActions.setMode(fallback); return true }
      return false
    }
    default: return false
  }
}
const hasStaged = (): boolean => { const s = useInteractionStore.getState(); return s.staged.length > 0 || Object.keys(s.placements).length > 0 }

export function useBoardKeys(): void {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (onBoardKey(e)) e.preventDefault()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
}
