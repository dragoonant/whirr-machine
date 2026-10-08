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
import { MoveDrag } from '../interaction/MoveDrag'
import { useInteractionStore } from '../interaction/store'
import { Clouds } from '../vfx/Clouds'
import { Pops } from '../vfx/Pops'
import { CameraRig } from './Camera'
import { GEO, lineMaterial } from '../figures/kit'
import { THEME, cameraPose, proxyAttrs, tableOf } from './layout'
import { Surface } from './Surface'
import { loadBoardsJson, useBoard } from './boardStore'
import { TerrainTooltip } from './TerrainTooltip'
import { FpsMeter, FpsProbe, fpsEnabled } from './FpsMeter'
import { markShadowsDirty, takeShadowsDirty, useAmbientFrames } from './frameRate'
import * as THREE from 'three'
import { Terrain } from './Terrain'
import { Zones } from './Zones'
import { EdgeMarkers } from './EdgeMarkers'
import { ElementProxies, KillBoxLines, ScenarioElements } from './scenarioElements'
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
  const dragging = useInteractionStore((s) => s.drag?.moved ?? false)
  const weapon = useInteractionStore((s) => s.weaponId)
  const { graphics, showZones } = useSettings()
  const board = useBoard()
  useEffect(() => { invalidate() }, [invalidate, rev, mode, sel, hover, measure, threat, prompt?.id, ghost, staged, placements, dragging, weapon, graphics, showZones, board])
  const animating = useAnimating()
  useFrame(() => { if (animating) invalidate() })
  return null
}

/**
 * Shadow map on demand: re-rendered only when a shadow caster changed: the presented state, board, graphics or the
 * figure set, every frame while a move/attack animates, and once after a figure turns, tips, fades or loads
 * (markShadowsDirty). Camera pans and ambient animation (orbs, shells, particles) never re-render the shadow pass,
 * which is what used to cause a hitch every 400 ms.
 */
function ShadowGate(): null {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const rev = usePresentedRev()
  const ids = useModelIds()
  const board = useBoard()
  const { graphics } = useSettings()
  const animating = useAnimating()
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => { gl.shadowMap.autoUpdate = true }
  }, [gl])
  useEffect(() => { markShadowsDirty(); invalidate() }, [invalidate, rev, ids, board, graphics])
  useFrame(() => { if (takeShadowsDirty() || animating) gl.shadowMap.needsUpdate = true })
  return null
}

/** Keeps frames coming while something ambient (orbs, clouds, stationary shells) is on screen: full rate, 30 Hz on Low. */
function AmbientTick(): null {
  const state = usePresentedState()
  const { graphics } = useSettings()
  const ambient = !!state && (state.clouds.length > 0 || Object.values(state.models).some((m) => m.focus > 0 || m.conditions.includes('stationary')))
  useAmbientFrames(ambient, graphics === 'low')
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

/** Lighting from the board: key colour and intensity, a sky/ground ambient pair and a fog that matches the background. */
function Lights({ shadows, span }: { shadows: boolean; span: number }): ReactElement {
  const { light } = useBoard()
  // the shadow box covers the whole table (it was fixed at 26 for a 36 inch table; a 48 inch one needs 34)
  const half = Math.max(26, span * 0.7)
  const fogScale = Math.max(1, span / 36) // the camera sits further back over a bigger table: push the fog back with it
  const sky = useMemo(() => '#' + new THREE.Color(light.ambient).lerp(new THREE.Color('#ffffff'), 0.55).getHexString(), [light.ambient])
  return (
    <>
      <color attach="background" args={[light.fog]} />
      <fog attach="fog" args={[light.fog, light.fogNear * fogScale, light.fogFar * fogScale]} />
      <hemisphereLight args={[sky, light.ambient, 1.5]} />
      <directionalLight position={[16, 34, 12]} intensity={light.keyIntensity} color={light.key} castShadow={shadows} shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-half} shadow-camera-right={half} shadow-camera-top={half} shadow-camera-bottom={-half} shadow-camera-far={90 + (half - 26) * 2} />
      <directionalLight position={[-18, 14, -16]} intensity={0.35} color="#b87333" />
    </>
  )
}

function Scene(): ReactElement {
  const state = usePresentedState()
  const { graphics } = useSettings()
  const { w, d } = tableOf(state)
  const shadows = graphics === 'high'
  useEffect(() => { loadBoardsJson() }, [])
  return (
    <>
      <Invalidator />
      {shadows && <ShadowGate />}
      <AmbientTick />
      <Lights shadows={shadows} span={Math.max(w, d)} />
      <CameraRig />
      <Surface w={w} d={d} onShadows={shadows} />
      <Zones />
      <KillBoxLines />
      <EdgeMarkers />
      <Terrain />
      <ScenarioElements />
      <Figures />
      <Clouds />
      <Ground />
      <Rings />
      <MoveOverlay />
      <MoveDrag />
      <PlacementGhosts />
      <Ruler />
      <LosView />
      <TargetBadges />
      <Pops />
      {fpsEnabled() && <FpsProbe />}
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
        gl={{ antialias: graphics === 'high', powerPreference: 'high-performance', stencil: true }}
        onPointerMissed={() => { /* background clicks are handled by <Ground /> */ }}
      >
        <Scene />
      </Canvas>
      <ModelProxies />
      <ElementProxies />
      <TerrainTooltip />
      {fpsEnabled() && <FpsMeter />}
    </div>
  )
}
