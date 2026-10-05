// The in-game screen: the 3D battlefield with the HUD over it. Lazy-loaded by App (three.js lives in this chunk).
import { useEffect } from 'react'
import { Battlefield } from './board/Board'
import { usePrompt } from './contract'
import { interactionActions } from './interaction/store'
import { Hud } from './ui/Hud'

/** Staged moves and placements belong to one decision: drop them whenever the open decision changes. */
function StagedReset(): null {
  const id = usePrompt()?.id ?? null
  useEffect(() => { interactionActions.clearStaged() }, [id])
  return null
}

export function GameScreen({ onExit }: { onExit?: () => void }) {
  return (
    <>
      <StagedReset />
      <Battlefield />
      <Hud onExit={onExit} />
    </>
  )
}

export default GameScreen
