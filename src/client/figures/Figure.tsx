// One figure on the table: body, base, selection/target rings, focus orbs, damage and status indicators.
// Renders from the PRESENTED state; position follows the move tween while one plays.
import { memo, useMemo, useRef, type ReactElement } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Html } from '@react-three/drei'
import type * as THREE from 'three'
import type { ModelId, PlayerId } from '../../engine/index'
import { directorNow, tweenPosition, uiActions, useHoverId, usePresentedModel, useSelectedId, useTween, useUiMode } from '../contract'
import { SIDE_COLOURS } from '../board/layout'
import { handleModelClick } from '../interaction/controller'
import { ProceduralBody } from './Procedural'
import { dataArchetype } from './profile'
import { BASE_MATERIAL, GEO, HIT_MATERIAL, archetypeOf, baseRadiusOf, damageFraction, lineMaterial, meshHeight, partMaterial, shellMaterial } from './kit'

const BASE_H = 0.12
const ORB_COUNT_MAX = 3

export interface FigureProps { id: ModelId; upkeepSides: PlayerId[]; target: boolean }

export const Figure = memo(function Figure({ id, upkeepSides, target }: FigureProps): ReactElement | null {
  const m = usePresentedModel(id)
  const tween = useTween(id)
  const selectedId = useSelectedId()
  const hoverId = useHoverId()
  const mode = useUiMode()
  const root = useRef<THREE.Group>(null)
  const orbs = useRef<THREE.Group>(null)

  const hidden = !m || m.offTable || m.life === 'destroyed' || m.life === 'boxed'
  const archetype = useMemo(() => (m ? archetypeOf(m.type, dataArchetype(m.profileId)) : 'trooper'), [m?.type, m?.profileId])
  const r = m ? baseRadiusOf(m) : 0.6
  const h = m ? meshHeight(m.base, archetype) : 1.25
  const side = m?.owner ?? 'A'

  useFrame(() => {
    const g = root.current
    if (!g || !m) return
    if (tween) {
      const p = tweenPosition(tween, directorNow())
      g.position.set(p.x, m.elev, p.z)
    } else g.position.set(m.pos.x, m.elev, m.pos.z)
    const o = orbs.current
    if (o) o.rotation.y = performance.now() / 900
  })

  if (hidden || !m) return null
  const down = m.conditions.includes('knockedDown')
  const disabled = m.life === 'disabled'
  const inert = !!m.inert || m.conditions.includes('inert')
  const stationary = m.conditions.includes('stationary')
  const selected = selectedId === id || (!!m.unitId && selectedId === m.unitId)
  const hovered = hoverId === id
  const frac = damageFraction(m)
  const focusOrbs = Math.min(m.focus, ORB_COUNT_MAX)
  const tilt = down ? 1.4 : disabled ? 0.2 : 0
  const orbR = r + 0.35

  return (
    <group
      ref={root}
      position={[m.pos.x, m.elev, m.pos.z]}
      rotation={[0, side === 'A' ? 0 : Math.PI, 0]}
      onClick={(e) => {
        if (e.nativeEvent.button !== 0 || e.delta > 4) return // camera drags and right/middle clicks never act
        e.stopPropagation()
        handleModelClick(id)
      }}
    >
      {/* base */}
      <mesh geometry={GEO.cyl} material={BASE_MATERIAL} scale={[r * 2, BASE_H, r * 2]} position={[0, BASE_H / 2, 0]} receiveShadow />
      {/* body (tipped over when knocked down; the base stays flat) */}
      <group position={[0, BASE_H, 0]} rotation={[tilt, 0, 0]} userData={{ inert }}>
        <ProceduralBody archetype={archetype} h={h} r={r} side={side} grey={disabled || inert} />
        {stationary && <mesh geometry={GEO.sphere} material={shellMaterial} scale={[r * 2.3, h * 1.3, r * 2.3]} position={[0, h * 0.5, 0]} />}
      </group>
      {/* invisible pick volume */}
      <mesh geometry={GEO.cyl} material={HIT_MATERIAL} scale={[r * 2 + 0.3, h + 0.3, r * 2 + 0.3]} position={[0, (h + 0.3) / 2, 0]}
        onPointerOver={(e) => { e.stopPropagation(); uiActions.hover(id) }}
        onPointerOut={() => uiActions.hover(null)} />
      {/* selection / target / hover rings */}
      {selected && <mesh geometry={GEO.ring} material={lineMaterial('sel', '#c9a227')} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} scale={[r + 0.3, r + 0.3, 1]} />}
      {(target && (hovered || mode === 'target')) && <mesh geometry={GEO.ring} material={lineMaterial('tgt', '#e0483a', hovered ? 1 : 0.7)} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} scale={[r + 0.42, r + 0.42, 1]} />}
      {hovered && !selected && <mesh geometry={GEO.ring} material={lineMaterial('hov', '#e8e6e1', 0.7)} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} scale={[r + 0.2, r + 0.2, 1]} />}
      {/* upkeep rings, one per side that has an upkeep on this model */}
      {upkeepSides.map((s, i) => (
        <mesh key={s} geometry={GEO.torus} material={lineMaterial(`up${s}`, SIDE_COLOURS[s].ring)} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06 + i * 0.03, 0]} scale={[r + 0.08 + i * 0.06, r + 0.08 + i * 0.06, 1]} />
      ))}
      {/* focus orbs */}
      {focusOrbs > 0 && (
        <group ref={orbs} position={[0, h * 0.7, 0]}>
          {Array.from({ length: focusOrbs }, (_, i) => {
            const a = (i / focusOrbs) * Math.PI * 2
            return <mesh key={i} geometry={GEO.sphere} material={partMaterial(side, 'glow')} scale={[0.26, 0.26, 0.26]} position={[Math.cos(a) * orbR, 0, Math.sin(a) * orbR]} />
          })}
        </group>
      )}
      {m.type === 'leader' && m.focus > 0 && (
        <Html position={[0, h + 0.9, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <span style={{ background: '#1e2127cc', color: '#ffd866', border: '1px solid #c9a227', borderRadius: 8, padding: '0 5px', font: '600 11px system-ui' }}>{m.focus}</span>
        </Html>
      )}
      {/* crippled-system icons (static; no particles) */}
      {m.crippled.length > 0 && (
        <group position={[0, h + 0.35, 0]}>
          {m.crippled.map((c, i) => (
            <mesh key={`${c}${i}`} geometry={GEO.sphere} material={lineMaterial('cr', '#ff7a3a')} scale={[0.16, 0.16, 0.16]} position={[(i - (m.crippled.length - 1) / 2) * 0.26, 0, 0]} />
          ))}
        </group>
      )}
      {/* damage bar */}
      {frac > 0 && (
        <Billboard position={[0, h + 0.65, 0]}>
          <mesh geometry={GEO.plane} material={lineMaterial('bar-bg', '#15161a', 0.85)} scale={[1.2, 0.14, 1]} />
          <mesh geometry={GEO.plane} material={lineMaterial('bar-fill', frac > 0.66 ? '#c0392b' : '#d9822b')} scale={[1.14 * frac, 0.09, 1]} position={[-(1.14 * (1 - frac)) / 2, 0, 0.001]} />
        </Billboard>
      )}
    </group>
  )
})
