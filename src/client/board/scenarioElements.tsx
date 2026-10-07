// Scenario elements on the table (91 B): objectives, flags with the terrain they picked, caches, countdown tokens, moved and removed
// elements, the terrain pieces on offer while a flag picks, and the Kill Box strips at their running depth.
// Everything is read from the presented state and the engine's own geometry (elementGeom); nothing here decides a rule.
// The flag-obstruction is virtual (not in state.terrain): it is drawn from elementState[flag].terrainId === null at the flag's position.
import { useMemo, type ReactElement } from 'react'
import * as THREE from 'three'
import type { GameState, Id, PlayerId, Vec2 } from '../../engine/index'
import { elementGeom, elementOwner, elementRadius } from '../../engine/scenario'
import { worldShape, type WorldShape } from '../../engine/terrain'
import { usePresentedState, usePrompt } from '../contract'
import { GEO, lineMaterial } from '../figures/kit'
import { killBoxViewsNow } from '../ui/cards/scenarioView'
import { usePickHover } from '../ui/cards/pickHover'
import { NEUTRAL_COLOUR, SIDE_COLOURS, controllerColour, elementDefs, type ElementDef } from './layout'

const TOKEN_COLOUR = '#e0a93b'
const OBSTRUCTION_HEIGHT = 1.5 // RULING: the flag-obstruction is a 30 mm round obstruction 1.5" tall (91 B.6)

const ownerColour = (p: PlayerId | null): string => (p ? SIDE_COLOURS[p].ring : NEUTRAL_COLOUR)

// ---------- shape helpers ----------
function loopPoints(shape: WorldShape, y: number): THREE.Vector3[] {
  if (shape.kind === 'circle') {
    return Array.from({ length: 48 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2
      return new THREE.Vector3(shape.c.x + Math.cos(a) * shape.r, y, shape.c.z + Math.sin(a) * shape.r)
    })
  }
  return shape.pts.map((p) => new THREE.Vector3(p.x, y, p.z))
}

const LINE_MATS = new Map<string, THREE.LineBasicMaterial>()
const lineMat = (colour: string, opacity: number): THREE.LineBasicMaterial => {
  const k = `${colour}:${opacity}`
  let m = LINE_MATS.get(k)
  if (!m) { m = new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity }); LINE_MATS.set(k, m) }
  return m
}

function fillGeometry(shape: WorldShape): THREE.BufferGeometry {
  if (shape.kind === 'circle') {
    const g = new THREE.CircleGeometry(shape.r, 40)
    g.rotateX(-Math.PI / 2)
    g.translate(shape.c.x, 0, shape.c.z)
    return g
  }
  const g = new THREE.ShapeGeometry(new THREE.Shape(shape.pts.map((p) => new THREE.Vector2(p.x, -p.z))))
  g.rotateX(-Math.PI / 2)
  return g
}

/** A terrain footprint drawn as an outline and a faint wash. */
function Footprint({ shape, colour, outline = 0.9, wash = 0.12, y = 0.06 }: { shape: WorldShape; colour: string; outline?: number; wash?: number; y?: number }): ReactElement {
  const line = useMemo(() => new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(loopPoints(shape, y)), lineMat(colour, outline)), [shape, colour, outline, y])
  const fill = useMemo(() => fillGeometry(shape), [shape])
  return (
    <group>
      <primitive object={line} />
      <mesh geometry={fill} material={lineMaterial(`fp:${colour}`, colour, wash)} position={[0, y - 0.02, 0]} renderOrder={1} />
    </group>
  )
}

// ---------- one element ----------
export interface ElementDrawView { def: ElementDef; pos: Vec2; r: number; shape: WorldShape | null; colour: string; contested: boolean; tokens: number | null; owner: PlayerId | null; terrainId: Id | null | undefined }

export function elementDrawViews(state: GameState): ElementDrawView[] {
  return elementDefs(state).flatMap((def) => {
    if (def.kind === 'zone') return []
    const g = elementGeom(state, def)
    if (!g.present) return []
    const rt = state.scenario.elementState?.[def.id]
    const control = state.scenario.elements[def.id]
    return [{
      def, pos: g.pos, r: g.r || elementRadius(def.kind), shape: g.shape, colour: controllerColour(control), contested: !!control?.contested,
      tokens: typeof rt?.tokens === 'number' ? rt.tokens : null, owner: elementOwner(state, def), terrainId: rt?.terrainId,
    }]
  })
}

function Tokens({ n, r }: { n: number; r: number }): ReactElement {
  if (n <= 0) return <mesh geometry={GEO.ring} material={lineMaterial('tok0', '#e0584a', 0.95)} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.09, 0]} scale={[r + 0.6, r + 0.6, 1]} />
  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const a = ((i + 0.5) / Math.max(n, 5)) * Math.PI * 2 + Math.PI / 2
        return <mesh key={i} geometry={GEO.cyl} material={lineMaterial('tok', TOKEN_COLOUR, 1)} position={[Math.cos(a) * (r + 0.55), 0.11, Math.sin(a) * (r + 0.55)]} scale={[0.3, 0.2, 0.3]} />
      })}
    </group>
  )
}

function Flag({ colour, y = 0 }: { colour: string; y?: number }): ReactElement {
  return (
    <group position={[0, y, 0]}>
      <mesh geometry={GEO.cyl} material={lineMaterial('elpole', '#e8e6e1', 1)} position={[0, 0.9, 0]} scale={[0.08, 1.4, 0.08]} />
      <mesh geometry={GEO.box} material={lineMaterial(`elflag:${colour}`, colour, 1)} position={[0.3, 1.4, 0]} scale={[0.55, 0.35, 0.03]} />
    </group>
  )
}

function Element({ v }: { v: ElementDrawView }): ReactElement {
  const { def } = v
  const ring = def.hold.within + v.r
  const isFlag = def.kind === 'flag'
  const hasTerrain = !!v.shape
  const obstruction = isFlag && v.terrainId === null // the flag-obstruction: virtual, drawn here
  return (
    <group>
      {hasTerrain && <Footprint shape={v.shape!} colour={v.colour} outline={v.contested ? 0.95 : 0.8} wash={0.14} />}
      <group position={[v.pos.x, 0, v.pos.z]}>
        {!hasTerrain && (
          <>
            <mesh geometry={GEO.ring} material={lineMaterial(`el:${v.colour}`, v.colour, v.contested ? 0.9 : 0.75)} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]} scale={[ring, ring, 1]} />
            <mesh geometry={GEO.disc} material={lineMaterial(`elf:${v.colour}`, v.colour, def.kind === 'cache' ? 0.05 : 0.1)} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} scale={[ring, ring, 1]} />
          </>
        )}
        {(def.kind === 'objective50' || def.kind === 'objective40') && (
          <>
            <mesh geometry={GEO.cyl} material={lineMaterial(`elp:${v.colour}`, v.colour, 1)} position={[0, def.kind === 'objective50' ? 0.15 : 0.1, 0]} scale={def.kind === 'objective50' ? [1.97, 0.3, 1.97] : [1.57, 0.2, 1.57]} />
            <Flag colour={v.colour} />
          </>
        )}
        {def.kind === 'cache' && (
          <group>
            <mesh geometry={GEO.box} material={lineMaterial(`cache:${v.owner}`, ownerColour(v.owner), 1)} position={[0, 0.3, 0]} scale={[0.85, 0.6, 0.85]} />
            <mesh geometry={GEO.box} material={lineMaterial('cache-band', '#2a2d33', 1)} position={[0, 0.34, 0]} scale={[0.9, 0.12, 0.9]} />
            <mesh geometry={GEO.box} material={lineMaterial('cache-lid', '#d8d3c4', 1)} position={[0, 0.63, 0]} scale={[0.5, 0.06, 0.5]} />
          </group>
        )}
        {isFlag && !obstruction && <Flag colour={v.colour} />}
        {obstruction && (
          <group>
            <mesh geometry={GEO.cyl} material={lineMaterial('obst', '#5b5f66', 1)} position={[0, OBSTRUCTION_HEIGHT / 2, 0]} scale={[1.18, OBSTRUCTION_HEIGHT, 1.18]} />
            <mesh geometry={GEO.cyl} material={lineMaterial(`obst-band:${v.colour}`, v.colour, 1)} position={[0, OBSTRUCTION_HEIGHT - 0.2, 0]} scale={[1.24, 0.22, 1.24]} />
            <Flag colour={v.colour} y={OBSTRUCTION_HEIGHT - 0.6} />
          </group>
        )}
        {v.tokens !== null && <Tokens n={v.tokens} r={Math.max(v.r, 1)} />}
      </group>
    </group>
  )
}

/** While a flag picks its terrain: every offered piece glows, the one the pointer rests on brightest. */
function PickHints({ state }: { state: GameState }): ReactElement | null {
  const pd = usePrompt()
  const hover = usePickHover((s) => s.id)
  const ids = useMemo(() => {
    if (!pd || pd.kind !== 'abilityChoice' || pd.context.data?.code !== 'flagTerrain') return [] as Id[]
    const flags = (pd.context.data?.flags ?? {}) as Record<string, Id[]>
    return [...new Set(Object.values(flags).flat())]
  }, [pd])
  const shapes = useMemo(() => {
    const out: { id: Id; shape: WorldShape }[] = []
    for (const id of ids) {
      const t = state.terrain.find((x) => x.id === id)
      if (!t) continue
      out.push({ id, shape: worldShape(t) })
    }
    return out
  }, [ids, state.terrain])
  if (shapes.length === 0) return null
  return (
    <group>
      {shapes.map(({ id, shape }) => <Footprint key={id} shape={shape} colour="#f0d36a" outline={hover === id ? 1 : 0.6} wash={hover === id ? 0.32 : 0.1} y={0.08} />)}
    </group>
  )
}

export function ScenarioElements(): ReactElement | null {
  const state = usePresentedState()
  const elementState = state?.scenario.elementState
  const elements = state?.scenario.elements
  const terrain = state?.terrain
  const views = useMemo(() => (state ? elementDrawViews(state) : []), [state?.scenario.id, elementState, elements, terrain, state?.firstPlayer]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!state) return null
  return (
    <group>
      {views.map((v) => <Element key={v.def.id} v={v} />)}
      <PickHints state={state} />
    </group>
  )
}

/**
 * Kill Box line: a thin strip at the inner border of the strip along each player's own edge. Faint until the scenario's first Kill Box turn,
 * brighter after, and the strip tints while that player's Leader stands inside it. The depth follows the engine's running value
 * (Wolves at Our Heels grows it each round).
 */
export function KillBoxLines(): ReactElement | null {
  const state = usePresentedState()
  const views = useMemo(() => killBoxViewsNow(state), [state?.players.A.edge, state?.players.B.edge, state?.scenario.id, state?.scenario.killBox.A, state?.scenario.killBox.B, state?.scenario.killBoxDepth, state?.round, state?.activePlayer, state?.firstPlayer]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!views.length) return null
  return (
    <group>
      {views.map((v) => {
        const [a, b] = v.line
        const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2
        const alongX = Math.abs(b.x - a.x) > Math.abs(b.z - a.z)
        const len = Math.hypot(b.x - a.x, b.z - a.z)
        const colour = SIDE_COLOURS[v.player].zone
        return (
          <group key={v.player}>
            <mesh geometry={GEO.plane} material={lineMaterial(`kb:${colour}`, colour, v.active ? 0.7 : 0.25)} rotation={[-Math.PI / 2, 0, 0]}
              position={[cx, 0.05, cz]} scale={alongX ? [len, 0.14, 1] : [0.14, len, 1]} />
            {v.occupied && (
              <mesh geometry={GEO.plane} material={lineMaterial('kb:occupied', '#e2735b', 0.16)} rotation={[-Math.PI / 2, 0, 0]}
                position={[(v.rect.x0 + v.rect.x1) / 2, 0.025, (v.rect.z0 + v.rect.z1) / 2]} scale={[v.rect.x1 - v.rect.x0, v.rect.z1 - v.rect.z0, 1]} />
            )}
          </group>
        )
      })}
    </group>
  )
}

/** Invisible DOM proxies for tests (like the model proxies): one per element, from the presented state. */
export function ElementProxies(): ReactElement | null {
  const state = usePresentedState()
  const views = state ? elementDrawViews(state) : []
  if (!state || views.length === 0) return null
  return (
    <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'hidden', pointerEvents: 'none', opacity: 0 }}>
      {views.map((v) => (
        <div key={v.def.id} data-testid={`element-${v.def.id}`} data-kind={v.def.kind} data-x={v.pos.x.toFixed(2)} data-z={v.pos.z.toFixed(2)}
          data-tokens={v.tokens ?? ''} data-terrain={v.terrainId === undefined ? '' : (v.terrainId ?? 'obstruction')} data-owner={v.owner ?? ''} style={{ width: 1, height: 1 }} />
      ))}
    </div>
  )
}
