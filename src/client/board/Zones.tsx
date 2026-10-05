// Deployment zones and scenario elements (control colours come from the engine's scenario state).
import { useMemo, type ReactElement } from 'react'
import * as THREE from 'three'
import { usePresentedState } from '../contract'
import { GEO, lineMaterial } from '../figures/kit'
import { SIDE_COLOURS, elementViews, zoneViews, type Rect } from './layout'

const outline = (r: Rect, y: number): THREE.BufferGeometry =>
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(r.x0, y, r.z0), new THREE.Vector3(r.x1, y, r.z0), new THREE.Vector3(r.x1, y, r.z1), new THREE.Vector3(r.x0, y, r.z1),
  ])
const BORDER_MATS = new Map<string, THREE.LineBasicMaterial>()
const borderMat = (c: string, dashed: boolean): THREE.LineBasicMaterial => {
  const k = `${c}${dashed}`
  let m = BORDER_MATS.get(k)
  if (!m) { m = dashed ? new THREE.LineDashedMaterial({ color: c, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.7 }) : new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.8 }); BORDER_MATS.set(k, m) }
  return m
}

function ZoneRect({ rect, colour, opacity, dashed }: { rect: Rect; colour: string; opacity: number; dashed: boolean }): ReactElement {
  const geo = useMemo(() => outline(rect, 0.03), [rect])
  const line = useMemo(() => { const l = new THREE.LineLoop(geo, borderMat(colour, dashed)); if (dashed) l.computeLineDistances(); return l }, [geo, colour, dashed])
  return (
    <group>
      <mesh geometry={GEO.plane} material={lineMaterial(`zone:${colour}`, colour, opacity)} rotation={[-Math.PI / 2, 0, 0]} position={[(rect.x0 + rect.x1) / 2, 0.02, (rect.z0 + rect.z1) / 2]} scale={[rect.x1 - rect.x0, rect.z1 - rect.z0, 1]} renderOrder={0} />
      <primitive object={line} />
    </group>
  )
}

export function Zones(): ReactElement | null {
  const state = usePresentedState()
  const deploying = state?.phase === 'deploy'
  const zones = useMemo(() => zoneViews(state), [state?.players.A.edge, state?.players.B.edge, state?.firstPlayer, state?.scenario.id])
  if (!zones.length) return null
  return (
    <group>
      {zones.map((z) => (
        <group key={z.player}>
          <ZoneRect rect={z.rect} colour={SIDE_COLOURS[z.player].zone} opacity={deploying ? 0.2 : 0.035} dashed={false} />
          {deploying && z.advance && <ZoneRect rect={z.advance} colour={SIDE_COLOURS[z.player].zone} opacity={0.06} dashed />}
        </group>
      ))}
    </group>
  )
}

export function ScenarioElements(): ReactElement | null {
  const state = usePresentedState()
  const elements = state?.scenario.elements
  const views = useMemo(() => elementViews(state), [state?.scenario.id, elements])
  if (!views.length) return null
  return (
    <group>
      {views.map((v) => {
        const r = v.def.hold.within
        const big = v.def.kind === 'objective50'
        return (
          <group key={v.def.id} position={[v.def.pos.x, 0, v.def.pos.z]}>
            {/* hold radius ring, coloured by who controls it (engine verdict) */}
            <mesh geometry={GEO.ring} material={lineMaterial(`el:${v.colour}`, v.colour, v.control?.contested ? 0.9 : 0.75)} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]} scale={[r, r, 1]} />
            <mesh geometry={GEO.disc} material={lineMaterial(`elf:${v.colour}`, v.colour, 0.1)} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} scale={[r, r, 1]} />
            {v.def.kind !== 'scenarioTerrain' && v.def.kind !== 'zone' && (
              <>
                <mesh geometry={GEO.cyl} material={lineMaterial(`elp:${v.colour}`, v.colour, 1)} position={[0, big ? 0.15 : 0.1, 0]} scale={[big ? 1.97 : 1.57, big ? 0.3 : 0.2, big ? 1.97 : 1.57]} />
                <mesh geometry={GEO.cyl} material={lineMaterial('elpole', '#e8e6e1', 1)} position={[0, 0.9, 0]} scale={[0.08, 1.4, 0.08]} />
                <mesh geometry={GEO.box} material={lineMaterial(`elflag:${v.colour}`, v.colour, 1)} position={[0.3, 1.4, 0]} scale={[0.55, 0.35, 0.03]} />
              </>
            )}
          </group>
        )
      })}
    </group>
  )
}
