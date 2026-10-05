// The battlefield canvas: demand frameloop, dpr cap, shared geometry. Mount <Battlefield /> where the board goes.
// Also renders the invisible DOM proxies (data-testid="model-<id>") from the presented store.
import { useEffect, useMemo, type ReactElement } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  useAnimating, useHoverId, useMeasure, useModelIds, usePresentedModels, usePresentedRev, usePresentedState, usePrompt, useSelectedId,
  useSettings, useShowThreat, useUiMode, uiActions,
} from '../contract'
import { Figure } from '../figures/Figure'
import { Ground, LosView, MoveOverlay, PlacementGhosts, Rings, Ruler, TargetBadges } from '../interaction/Overlays'
import { handleModelClick } from '../interaction/controller'
import { useBoardKeys } from '../interaction/keys'
import { useInteractionStore } from '../interaction/store'
import { Clouds } from '../vfx/Clouds'
import { Pops } from '../vfx/Pops'
import { CameraRig } from './Camera'
import { THEME, cameraPose, proxyAttrs, tableOf } from './layout'
import { Surface } from './Surface'
import { Terrain } from './Terrain'
import { ScenarioElements, Zones } from './Zones'
import type { PlayerId } from '../../engine/index'

/** Requests a frame whenever anything the board shows changes (frameloop="demand"). */
function Invalidator(): null {
  const invalidate = useThree((s) => s.invalidate)
  const rev = usePresentedRev()
  const mode = useUiMode()
  const sel = useSelectedId()
  const hover = useHoverId()
  const measure = useMeasure()
  const threat = useShowThreat()
  const prompt = usePrompt()
  const ghost = useInteractionStore((s) => s.ghost)
  const staged = useInteractionStore((s) => s.staged)
  const placements = useInteractionStore((s) => s.placements)
  const weapon = useInteractionStore((s) => s.weaponId)
  const { graphics } = useSettings()
  useEffect(() => { invalidate() }, [invalidate, rev, mode, sel, hover, measure, threat, prompt?.id, ghost, staged, placements, weapon, graphics])
  const animating = useAnimating()
  useFrame(() => { if (animating) invalidate() })
  return null
}

/** ~15 Hz heartbeat only while something ambient (orbs, domes, shells) is on screen. Off in Low graphics. */
function AmbientTick(): null {
  const invalidate = useThree((s) => s.invalidate)
  const state = usePresentedState()
  const { graphics } = useSettings()
  const ambient = !!state && (state.clouds.length > 0 || Object.values(state.models).some((m) => m.focus > 0 || m.conditions.includes('stationary')))
  useEffect(() => {
    if (!ambient || graphics === 'low') return
    const t = setInterval(invalidate, 66)
    return () => clearInterval(t)
  }, [ambient, graphics, invalidate])
  return null
}

function Figures(): ReactElement {
  const ids = useModelIds()
  const state = usePresentedState()
  const prompt = usePrompt()
  const effects = state?.effects
  const upkeep = useMemo(() => {
    const out: Record<string, PlayerId[]> = {}
    for (const e of effects ?? []) {
      if (!e.upkeep) continue
      for (const t of e.targetIds) { const l = (out[t] ??= []); if (!l.includes(e.owner)) l.push(e.owner) }
    }
    return out
  }, [effects])
  const targets = useMemo(() => new Set((prompt?.options ?? []).map((o) => (o.action as { targetId?: string }).targetId).filter((x): x is string => !!x)), [prompt])
  return <>{ids.map((id) => <Figure key={id} id={id} upkeepSides={upkeep[id] ?? EMPTY} target={targets.has(id)} />)}</>
}
const EMPTY: PlayerId[] = []

function Lights({ shadows }: { shadows: boolean }): ReactElement {
  return (
    <>
      <hemisphereLight args={['#e6ebf5', '#4a4c44', 1.5]} />
      <directionalLight position={[16, 34, 12]} intensity={2.4} castShadow={shadows} shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-26} shadow-camera-right={26} shadow-camera-top={26} shadow-camera-bottom={-26} shadow-camera-far={90} />
      <directionalLight position={[-18, 14, -16]} intensity={0.35} color="#b87333" />
    </>
  )
}

function Scene(): ReactElement {
  const state = usePresentedState()
  const { graphics } = useSettings()
  const { w, d } = tableOf(state)
  const shadows = graphics === 'high'
  return (
    <>
      <Invalidator />
      <AmbientTick />
      <Lights shadows={shadows} />
      <CameraRig />
      <Surface w={w} d={d} onShadows={shadows} />
      <Zones />
      <Terrain />
      <ScenarioElements />
      <Figures />
      <Clouds />
      <Ground />
      <Rings />
      <MoveOverlay />
      <PlacementGhosts />
      <Ruler />
      <LosView />
      <TargetBadges />
      <Pops />
    </>
  )
}

/** Invisible DOM proxies for tests: one per model, from the presented store (position = presented/end position). */
export function ModelProxies(): ReactElement | null {
  const models = usePresentedModels()
  if (!models) return null
  return (
    <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'hidden', pointerEvents: 'none', opacity: 0 }}>
      {Object.values(models).map((m) => {
        const a = proxyAttrs(m)
        return (
          <div key={m.id} data-testid={`model-${m.id}`} data-x={a.x} data-z={a.z} data-life={a.life} data-focus={a.focus} data-owner={a.owner}
            onClick={() => handleModelClick(m.id)} onPointerEnter={() => uiActions.hover(m.id)} style={{ width: 1, height: 1 }} />
        )
      })}
    </div>
  )
}

export function Battlefield(): ReactElement {
  const state = usePresentedState()
  const { graphics } = useSettings()
  useBoardKeys()
  const table = tableOf(state)
  const pose = cameraPose('edgeA', table)
  return (
    <div data-testid="battlefield" style={{ position: 'absolute', inset: 0, background: THEME.bg }} onContextMenu={(e) => e.preventDefault()}>
      <Canvas
        frameloop="demand"
        dpr={graphics === 'low' ? 1 : [1, 1.5]}
        shadows={graphics === 'high'}
        camera={{ position: pose.position, fov: 42, near: 0.5, far: 400 }}
        gl={{ antialias: graphics === 'high', powerPreference: 'high-performance' }}
        onPointerMissed={() => { /* background clicks are handled by <Ground /> */ }}
      >
        <color attach="background" args={[THEME.bg]} />
        <Scene />
      </Canvas>
      <ModelProxies />
    </div>
  )
}
