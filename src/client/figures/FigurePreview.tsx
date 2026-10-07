// A figure drawn at a staged (not yet committed) position: the deployment preview. Same body as Figure (GLB when
// one is loaded, else the procedural stand-in) with none of the in-play UI; `opacity` < 1 fades a GLB body for the
// pointer ghost.
import { useEffect, useMemo, type ReactElement } from 'react'
import { useThree } from '@react-three/fiber'
import type { ModelState, Vec2 } from '../../engine/index'
import { GLB_BASE_H, GlbBase, GlbBody, createFader, useGlbParts } from './GlbBody'
import { glbSlugFor, useGlbManifestReady } from './glbModels'
import { usePaint } from './paintStore'
import { ProceduralBody } from './Procedural'
import { dataArchetype, dataHeightIn, factionOf, factionPaint } from './profile'
import { BASE_MATERIAL, GEO, archetypeOf, baseRadiusOf, lineMaterial, meshHeight } from './kit'

export interface FigurePreviewProps { m: ModelState; pos: Vec2; yaw: number; ring: string; opacity?: number }

export function FigurePreview({ m, pos, yaw, ring, opacity = 1 }: FigurePreviewProps): ReactElement {
  const invalidate = useThree((s) => s.invalidate)
  const faction = factionOf(m.profileId)
  const paint = usePaint(faction, m.owner)
  useGlbManifestReady()
  const archetype = useMemo(() => archetypeOf(m.type, dataArchetype(m.profileId)), [m.type, m.profileId])
  const r = baseRadiusOf(m)
  const parts = useGlbParts(glbSlugFor(m.profileId), r)
  const h = parts ? parts.height : dataHeightIn(m.profileId) || meshHeight(m.base, archetype)

  useEffect(() => {
    if (!parts || opacity >= 1) return
    const f = createFader(parts.body)
    f.set(opacity)
    invalidate()
    return () => { f.dispose(); invalidate() }
  }, [parts, opacity, invalidate])

  return (
    <group position={[pos.x, 0, pos.z]} rotation={[0, yaw, 0]}>
      {parts ? <GlbBase parts={parts} /> : <mesh geometry={GEO.cyl} material={BASE_MATERIAL} scale={[r * 2, GLB_BASE_H, r * 2]} position={[0, GLB_BASE_H / 2, 0]} />}
      <group position={[0, GLB_BASE_H, 0]}>
        {parts
          ? <group position={[0, -GLB_BASE_H, 0]}><GlbBody parts={parts} faction={faction} paint={paint} grey={false} /></group>
          : <ProceduralBody archetype={archetype} h={h} r={r} side={m.owner} grey={false} paint={paint ?? factionPaint(faction)} />}
      </group>
      <mesh geometry={GEO.ring} material={lineMaterial(`pv:${ring}:${opacity}`, ring, opacity < 1 ? 0.7 : 1)} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} scale={[r + 0.25, r + 0.25, 1]} />
    </group>
  )
}
