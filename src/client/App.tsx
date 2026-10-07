// Routes start screen <-> game. Hooks: ?test=1 (window.__game), ?scenario=&lists=&seed= (skip start), ?gallery (figures).
import { Suspense, lazy, useEffect, useState } from 'react'
import { bootClient, game, setupFromUrl, useHasGame } from './contract'
import { restoreClock } from './clock'
import { CoachLine } from './ui/help/CoachLine'
import { HelpButton, HelpOverlay } from './ui/help/HelpGuide'
import { StartScreen } from './ui/start/StartScreen'
import { useGameStore } from './store/gameStore'

// three.js and the board live in their own chunk; the start screen loads without them.
const GameView = lazy(() => import('./GameScreen'))
// ?gallery: every figure GLB on a turntable for owner review, in its own chunk.
const GalleryView = lazy(() => import('./figures/Gallery'))

const params = () => new URLSearchParams(typeof location !== 'undefined' ? location.search : '')

export function App() {
  if (params().has('gallery')) return <Suspense fallback={<Loading />}><GalleryView /></Suspense>
  return <GameApp />
}

function GameApp() {
  const hasGame = useHasGame()
  const [screen, setScreen] = useState<'start' | 'game'>(() => (setupFromUrl() ? 'game' : 'start'))

  useEffect(() => {
    const off = bootClient({ testHooks: params().get('test') === '1' })
    const url = setupFromUrl()
    if (url) game.newGame(url)
    return off
  }, [])

  const start = (opts: Parameters<typeof game.newGame>[0]): string | null => {
    const rej = game.newGame(opts)
    if (rej) return rej.text
    setScreen('game')
    return null
  }

  // Continue: the game still in memory (unless it ended), else the autosave from an earlier visit.
  const ongoing = useGameStore((g) => !!g.state && g.state.phase !== 'ended')
  const continueLabel = ongoing ? 'Continue game' : game.hasSave() ? 'Continue saved game' : null
  const resume = (): string | null => {
    if (!ongoing) {
      const rej = game.load()
      if (rej) return rej.text
      restoreClock() // the saved clock, paused until the first decision shows; a save with no clock plays untimed
    }
    setScreen('game')
    return null
  }

  const playing = screen === 'game' && hasGame
  return (
    <>
      {playing ? (
        <div style={{ position: 'fixed', inset: 0, background: '#14161a' }}>
          <Suspense fallback={<Loading />}><GameView onExit={() => setScreen('start')} /></Suspense>
          <button type="button" className="menu-fab" data-testid="menu-button" title="Back to the start screen (the game is kept)" onClick={() => setScreen('start')}>Menu</button>
          <HelpButton />
          <CoachLine />
        </div>
      ) : (
        <StartScreen onStart={start} onContinue={resume} continueLabel={continueLabel} />
      )}
      <HelpOverlay />
    </>
  )
}

function Loading() {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', color: '#c9a227', font: '600 18px system-ui' }}>
      Setting up the table...
    </div>
  )
}

