// Table-edge markers: which side is north and which is south. While a player picks an edge, both candidate edges glow and carry a
// large label; once the edges are taken, a small tag at each edge names the player deploying from it. North is -z, south is +z.
import { type ReactElement } from 'react'
import { LabelSprite } from './labelSprite'
import type { EdgeId, GameState, PlayerId } from '../../engine/index'
import { usePresentedState, usePrompt } from '../contract'
import { GEO, lineMaterial } from '../figures/kit'
import { playerName } from '../presentation/labels'
import { SIDE_COLOURS, tableOf } from './layout'

const PICK_COLOUR = '#f0d36a'
const EDGES: EdgeId[] = ['north', 'south', 'west', 'east']

/** Centre of an edge's strip and whether it runs along x. */
function edgeGeom(edge: EdgeId, w: number, d: number): { x: number; z: number; alongX: boolean; len: number } {
  switch (edge) {
    case 'north': return { x: 0, z: -d / 2, alongX: true, len: w }
    case 'south': return { x: 0, z: d / 2, alongX: true, len: w }
    case 'west': return { x: -w / 2, z: 0, alongX: false, len: d }
    default: return { x: w / 2, z: 0, alongX: false, len: d }
  }
}

const ownerOf = (s: GameState, edge: EdgeId): PlayerId | null =>
  s.players.A.edge === edge ? 'A' : s.players.B.edge === edge ? 'B' : null

export function EdgeMarkers(): ReactElement | null {
  const state = usePresentedState()
  const pd = usePrompt()
  if (!state || state.phase === 'ended') return null
  const { w, d } = tableOf(state)
  const picking = pd?.kind === 'chooseEdge'
  const offered = new Set<EdgeId>(picking ? (pd.options?.map((o) => (o.action as { edge?: EdgeId }).edge).filter((e): e is EdgeId => !!e) ?? ['north', 'south']) : [])
  const anyChosen = !!(state.players.A.edge || state.players.B.edge)
  if (!picking && !anyChosen) return null
  return (
    <group>
      {EDGES.map((edge) => {
        const owner = ownerOf(state, edge)
        const isOffered = offered.has(edge)
        if (!isOffered && !owner) return null
        const g = edgeGeom(edge, w, d)
        const colour = owner ? SIDE_COLOURS[owner].ring : PICK_COLOUR
        // the label sits well inside the table so the HUD bars along the screen edges never cover it
        const inset = 7
        const lx = g.alongX ? 0 : g.x - Math.sign(g.x) * inset
        const lz = g.alongX ? g.z - Math.sign(g.z) * inset : 0
        const text = isOffered ? `${edge} edge` : `${edge} · ${playerName(state, owner)}`
        return (
          <group key={edge}>
            <mesh geometry={GEO.plane} material={lineMaterial(`edge:${colour}:${isOffered}`, colour, isOffered ? 0.75 : 0.4)} rotation={[-Math.PI / 2, 0, 0]}
              position={[g.x - (g.alongX ? 0 : Math.sign(g.x) * 0.5), 0.06, g.z - (g.alongX ? Math.sign(g.z) * 0.5 : 0)]} scale={g.alongX ? [g.len, 1, 1] : [1, g.len, 1]} />
            <LabelSprite position={[lx, 0.4, lz]} border={colour} text={text.toUpperCase()} size={isOffered ? 0.042 : 0.028} fontPx={isOffered ? 18 : 13} />
          </group>
        )
      })}
    </group>
  )
}
