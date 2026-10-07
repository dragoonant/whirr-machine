// One figure on the table: body (GLB when one is enabled and loaded, else procedural), base, selection/target rings,
// focus orbs, damage and status visuals. Renders from the PRESENTED state; position follows the move tween while one plays.
// Status visuals are driven by state, never by animation clips (30-figures section 5).
import { memo, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Billboard, Html } from '@react-three/drei'
import type * as THREE from 'three'
import type { ModelId, ModelState, PlayerId } from '../../engine/index'
import { directorNow, tweenPosition, uiActions, useHoverId, usePresentedModel, useSelectedId, useSettings, useTween, useUiMode } from '../contract'
import { SIDE_COLOURS } from '../board/layout'
import { handleModelClick } from '../interaction/controller'
import { StatusFx } from '../vfx/StatusFx'
import { FuryBoardTag } from '../ui/fury/FuryPips'
import { VfxHost } from '../vfx/VfxLayer'
import { GLB_BASE_H, GlbBase, GlbBody, createFader, useGlbParts, type Fader } from './GlbBody'
import { glbSlugFor, useGlbManifestReady } from './glbModels'
import { usePaint } from './paintStore'
import { facingYaw, turnToward } from './facing'
import { usePresentedStore } from '../presentation/presentedStore'
import { ProceduralBody } from './Procedural'
import { dataArchetype, dataHeightIn, factionOf, factionPaint } from './profile'
import { BASE_MATERIAL, GEO, HIT_MATERIAL, archetypeOf, baseRadiusOf, damageFraction, iceMaterial, lineMaterial, meshHeight, partMaterial, shellMaterial } from './kit'
import { markShadowsDirty } from '../board/frameRate'

const BASE_H = GLB_BASE_H
const ORB_COUNT_MAX = 3
const TIP_ANGLE = 1.4 // ~80 degrees
const SHARDS = 6

export interface FigureProps { id: ModelId; upkeepSides: PlayerId[]; target: boolean }

/** Seconds a destroyed figure takes to fade (at speed 1). */
const FADE_S = 0.65

export const Figure = memo(function Figure({ id, upkeepSides, target }: FigureProps): ReactElement | null {
  const live = usePresentedModel(id)
  const lastModel = useRef<ModelState | undefined>(undefined)
  if (live) lastModel.current = live
  const m = live ?? lastModel.current
  const tween = useTween(id)
  const selectedId = useSelectedId()
  const hoverId = useHoverId()
  const mode = useUiMode()
  const { graphics, speed } = useSettings()
  const invalidate = useThree((s) => s.invalidate)
  const root = useRef<THREE.Group>(null)
  const bodyGroup = useRef<THREE.Group>(null)
  const orbs = useRef<THREE.Group>(null)
  const tipNow = useRef<number | null>(null)
  const fadeAt = useRef<number | null>(null)
  const yaw = useRef<number | null>(null)

  const side: PlayerId = m?.owner ?? 'A'
  const faction = factionOf(m?.profileId ?? '')
  const paint = usePaint(faction, side)
  const procPaint = paint ?? factionPaint(faction) // the procedural stand-in wears the faction palette until a GLB shows
  useGlbManifestReady()
  const archetype = useMemo(() => (m ? archetypeOf(m.type, dataArchetype(m.profileId)) : 'trooper'), [m?.type, m?.profileId])
  const r = m ? baseRadiusOf(m) : 0.6
  const slug = m ? glbSlugFor(m.profileId) : undefined
  const parts = useGlbParts(slug, r)
  const h = parts ? parts.height : (m && dataHeightIn(m.profileId)) || (m ? meshHeight(m.base, archetype) : 1.25)

  const gone = !live || live.offTable || live.life === 'destroyed' || live.life === 'boxed'
  const down = !!m && m.conditions.includes('knockedDown')
  const disabled = !!m && m.life === 'disabled'

  // destroyed = fade out, then removal. Only a figure that was visible when it went plays the fade (not on first load).
  const wasVisible = useRef(false)
  const [dying, setDying] = useState(false)
  useEffect(() => {
    if (!gone) { wasVisible.current = true; fadeAt.current = null; setDying(false); return }
    if (!wasVisible.current || !lastModel.current || speed <= 0) { wasVisible.current = false; return }
    wasVisible.current = false
    fadeAt.current = performance.now()
    setDying(true)
    invalidate()
    const t = setTimeout(() => { fadeAt.current = null; setDying(false); invalidate() }, (FADE_S * 1000) / speed + 60)
    return () => clearTimeout(t)
  }, [gone, speed, invalidate])

  const fader = useRef<Fader | null>(null)
  useEffect(() => {
    if (!dying || !parts) return
    const f = createFader(parts.body)
    fader.current = f
    return () => { f.dispose(); if (fader.current === f) fader.current = null }
  }, [dying, parts])

  const tiltTarget = down ? TIP_ANGLE : 0
  const slump = disabled && !down ? 0.2 : 0
  const lift = down ? Math.max(0, (parts ? parts.halfWidth : r * 0.6) * Math.sin(TIP_ANGLE) - BASE_H + 0.04) : 0
  const stationary = !!m && m.conditions.includes('stationary')
  const lowGfx = graphics === 'low'

  useFrame((_, delta) => {
    const g = root.current
    if (!g || !m) return
    const here = tween ? tweenPosition(tween, directorNow()) : m.pos
    g.position.set(here.x, m.elev, here.z)
    // Cosmetic facing: look at the nearest enemy (else across the table). Down/destroyed figures keep their last yaw.
    if (!down && !gone) {
      const want = facingYaw(usePresentedStore.getState().state, id, here)
      if (want !== null) {
        if (yaw.current === null) yaw.current = want
        const next = turnToward(yaw.current, want, delta * 6)
        if (next !== yaw.current) { yaw.current = next; markShadowsDirty(); invalidate() }
      }
    }
    if (yaw.current !== null) g.rotation.y = yaw.current
    const o = orbs.current
    if (o) {
      const t = performance.now()
      o.rotation.y = t / 900
      o.position.y = h * 0.7 + Math.sin(t / 420) * 0.06
    }
    // tip over / stand up, eased; settles in place on first render
    const bg = bodyGroup.current
    if (bg) {
      const want = tiltTarget + slump
      let cur = tipNow.current ?? want
      if (Math.abs(want - cur) > 0.005) {
        cur = speed <= 0 ? want : cur + (want - cur) * Math.min(1, delta * 8 * Math.max(0.5, speed))
        markShadowsDirty(); invalidate()
      } else cur = want
      tipNow.current = cur
      bg.rotation.z = cur
      bg.position.y = BASE_H + (lift * Math.min(1, cur / TIP_ANGLE))
      // destroyed figures sink and shrink a little while they fade
      const f = fadeAt.current
      if (f !== null) {
        const k = Math.min(1, (performance.now() - f) / ((FADE_S * 1000) / Math.max(0.25, speed)))
        fader.current?.set(1 - k)
        bg.scale.setScalar(1 - 0.18 * k)
        bg.position.y -= 0.35 * k
        if (k < 1) { markShadowsDirty(); invalidate() }
      } else if (bg.scale.x !== 1) bg.scale.setScalar(1)
    }
    if (stationary && !lowGfx) {
      shellMaterial.opacity = 0.2 + 0.07 * Math.sin(performance.now() / 380)
      iceMaterial.opacity = 0.75 + 0.2 * Math.sin(performance.now() / 260)
    }
  })

  if (!m || (gone && !dying)) return null
  const inert = !!m.inert || m.conditions.includes('inert')
  const selected = !gone && (selectedId === id || (!!m.unitId && selectedId === m.unitId))
  const hovered = hoverId === id
  const frac = damageFraction(m)
  const focusOrbs = Math.min(m.focus, ORB_COUNT_MAX)
  const orbR = r + 0.35
  const grey = disabled || inert
  const showUi = !gone
  const particles = !lowGfx

  return (
    <group
      ref={root}
      position={[m.pos.x, m.elev, m.pos.z]}
      onClick={(e) => {
        if (gone || e.nativeEvent.button !== 0 || e.delta > 4) return // camera drags and right/middle clicks never act
        e.stopPropagation()
        handleModelClick(id)
      }}
    >
      <VfxHost />
      {/* base: the GLB's own disc when one is showing, else a plain one */}
      {parts ? <GlbBase parts={parts} /> : <mesh geometry={GEO.cyl} material={BASE_MATERIAL} scale={[r * 2, BASE_H, r * 2]} position={[0, BASE_H / 2, 0]} receiveShadow />}
      {/* body (tipped onto its side when knocked down; the base stays flat) */}
      <group ref={bodyGroup} position={[0, BASE_H, 0]} userData={{ inert }}>
        {parts
          ? <group position={[0, -BASE_H, 0]}><GlbBody parts={parts} faction={faction} paint={paint} grey={grey} /></group>
          : <ProceduralBody archetype={archetype} h={h} r={r} side={side} grey={grey} paint={procPaint} />}
        {stationary && !lowGfx && <mesh geometry={GEO.sphere} material={shellMaterial} scale={[r * 2.3, h * 1.3, r * 2.3]} position={[0, h * 0.5, 0]} />}
        {stationary && (
          <group>
            {Array.from({ length: SHARDS }, (_, i) => {
              const a = (i / SHARDS) * Math.PI * 2
              return <mesh key={i} geometry={GEO.cone} material={iceMaterial} scale={[0.16, 0.5 + (i % 2) * 0.25, 0.16]} position={[Math.cos(a) * (r + 0.1), 0.25, Math.sin(a) * (r + 0.1)]} rotation={[Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]} />
            })}
          </group>
        )}
      </group>
      {/* invisible pick volume */}
      {showUi && (
        <mesh geometry={GEO.cyl} material={HIT_MATERIAL} scale={[r * 2 + 0.3, h + 0.3, r * 2 + 0.3]} position={[0, (h + 0.3) / 2, 0]}
          onPointerOver={(e) => { e.stopPropagation(); uiActions.hover(id) }}
          onPointerOut={() => uiActions.hover(null)} />
      )}
      {/* selection / target / hover rings */}
      {selected && <mesh geometry={GEO.ring} material={lineMaterial('sel', '#c9a227')} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} scale={[r + 0.3, r + 0.3, 1]} />}
      {(showUi && target && (hovered || mode === 'target')) && <mesh geometry={GEO.ring} material={lineMaterial('tgt', '#e0483a', hovered ? 1 : 0.7)} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} scale={[r + 0.42, r + 0.42, 1]} />}
      {showUi && hovered && !selected && <mesh geometry={GEO.ring} material={lineMaterial('hov', '#e8e6e1', 0.7)} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} scale={[r + 0.2, r + 0.2, 1]} />}
      {/* upkeep rings, one per side that has an upkeep on this model */}
      {showUi && upkeepSides.map((s, i) => (
        <mesh key={s} geometry={GEO.torus} material={lineMaterial(`up${s}`, SIDE_COLOURS[s].ring)} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06 + i * 0.03, 0]} scale={[r + 0.08 + i * 0.06, r + 0.08 + i * 0.06, 1]} />
      ))}
      {/* focus orbs (0-3) orbiting the hull */}
      {showUi && focusOrbs > 0 && (
        <group ref={orbs} position={[0, h * 0.7, 0]}>
          {Array.from({ length: focusOrbs }, (_, i) => {
            const a = (i / focusOrbs) * Math.PI * 2
            return <mesh key={i} geometry={GEO.sphere} material={partMaterial(side, 'glow')} scale={[0.26, 0.26, 0.26]} position={[Math.cos(a) * orbR, 0, Math.sin(a) * orbR]} />
          })}
        </group>
      )}
      {showUi && m.type === 'leader' && m.focus > 0 && (
        <Html position={[0, h + 0.9, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <span style={{ background: '#1e2127cc', color: '#ffd866', border: '1px solid #c9a227', borderRadius: 8, padding: '0 5px', font: '600 11px system-ui' }}>{m.focus}</span>
        </Html>
      )}
      {/* fury flames and frenzy chance (warlocks and warbeasts only; renders nothing for other models) */}
      {showUi && m.fury !== undefined && (
        <Html position={[0, h + (m.type === 'leader' ? 1.5 : 0.9), 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}><FuryBoardTag id={id} /></Html>
      )}
      {/* crippled systems: sparks / smoke / steam / flicker from the nearest socket; static icons in Low graphics */}
      {showUi && <StatusFx root={root} r={r} h={h} crippled={m.crippled} conditions={m.conditions} enabled={particles} />}
      {showUi && lowGfx && m.crippled.length > 0 && (
        <group position={[0, h + 0.35, 0]}>
          {m.crippled.map((c, i) => (
            <mesh key={`${c}${i}`} geometry={GEO.sphere} material={lineMaterial('cr', '#ff7a3a')} scale={[0.16, 0.16, 0.16]} position={[(i - (m.crippled.length - 1) / 2) * 0.26, 0, 0]} />
          ))}
        </group>
      )}
      {/* damage bar */}
      {showUi && frac > 0 && (
        <Billboard position={[0, h + 0.65, 0]}>
          <mesh geometry={GEO.plane} material={lineMaterial('bar-bg', '#15161a', 0.85)} scale={[1.2, 0.14, 1]} />
          <mesh geometry={GEO.plane} material={lineMaterial('bar-fill', frac > 0.66 ? '#c0392b' : '#d9822b')} scale={[1.14 * frac, 0.09, 1]} position={[-(1.14 * (1 - frac)) / 2, 0, 0.001]} />
        </Billboard>
      )}
    </group>
  )
})
