// A GLB figure split into its base disc (kept flat, resized to the engine's base) and its body (tipped, tinted, faded).
// The GLB is one rigid mesh with origin at the base centre, y up, 1 unit = 1 inch, front = +Z (the facing the
// procedural figures use). Geometry/textures are shared by every instance; only the node tree is private.
import { useEffect, useMemo, type ReactElement } from 'react'
import { useThree } from '@react-three/fiber'
import { Box3, Group, Mesh, Vector3, type Material, type Object3D } from 'three'
import { useGlbInstance } from './glbLoader'
import { applyGlbPaint, isBaseMesh } from './glbPaint'
import type { ArmyPaint } from './paintStore'

export const GLB_BASE_H = 0.12

export interface GlbParts {
  base: Object3D
  body: Object3D
  /** Half of the body's side-to-side width (inches): lifts a figure tipped onto its side clear of the table. */
  halfWidth: number
  /** Body height above the base top (inches). */
  height: number
}

/** Split a private GLB clone into base and body, base resized to the engine's radius `r`. Pure of React (tests). */
export function splitGlb(object: Object3D, r: number): GlbParts {
  const base = new Group()
  base.name = 'wm-base'
  const body = new Group()
  body.name = 'wm-body'
  const baseMeshes: Object3D[] = []
  const bodyMeshes: Object3D[] = []
  object.updateMatrixWorld(true)
  object.traverse((o) => {
    const m = o as Mesh
    if (!m.isMesh) return
    ;(isBaseMesh(m) ? baseMeshes : bodyMeshes).push(m)
  })
  // meshes keep their node transform (GLB nodes carry no transform here; attach() preserves it either way)
  for (const m of baseMeshes) base.attach(m)
  for (const m of bodyMeshes) body.attach(m)
  const bb = new Box3().setFromObject(base)
  const size = bb.getSize(new Vector3())
  const glbR = Math.max(size.x, size.z) / 2
  if (glbR > 1e-6 && r > 0) base.scale.set(r / glbR, 1, r / glbR)
  const bodyBox = new Box3().setFromObject(body)
  const bodySize = bodyBox.getSize(new Vector3())
  return { base, body, halfWidth: bodySize.x / 2, height: Math.max(0.5, bodyBox.max.y - GLB_BASE_H) }
}

/** The split parts of a slug's GLB for one figure, or null while it loads / when it failed (use the procedural body). */
export function useGlbParts(slug: string | undefined, r: number): GlbParts | null {
  const inst = useGlbInstance(slug)
  return useMemo(() => (inst ? splitGlb(inst, r) : null), [inst, r])
}

export function GlbBase({ parts }: { parts: GlbParts }): ReactElement {
  return <primitive object={parts.base} />
}

export interface GlbBodyProps { parts: GlbParts; faction: string; paint: ArmyPaint | undefined; grey: boolean }

/** Draws the body; recolours it for the army painter and the disabled/inert grey. */
export function GlbBody({ parts, faction, paint, grey }: GlbBodyProps): ReactElement {
  const invalidate = useThree((s) => s.invalidate)
  const pk = `${paint?.primary ?? ''}|${paint?.secondary ?? ''}`
  useEffect(() => {
    const restore = applyGlbPaint(parts.body, faction, paint, grey)
    invalidate()
    return restore
    // paint is covered by its key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, faction, pk, grey, invalidate])
  return <primitive object={parts.body} />
}

// ---------- fade (destroyed figures): per-instance material clones, only while dying ----------
export interface Fader { set(opacity: number): void; dispose(): void }
export function createFader(root: Object3D): Fader {
  const clones: { mesh: Mesh; original: Material | Material[]; own: Material[] }[] = []
  let started = false
  const start = () => {
    started = true
    root.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      const original = mesh.material
      const own = (Array.isArray(original) ? original : [original]).map((m) => {
        const c = m.clone()
        c.onBeforeCompile = m.onBeforeCompile // the clone keeps the paint remap
        c.customProgramCacheKey = m.customProgramCacheKey
        c.transparent = true
        c.depthWrite = false
        return c
      })
      mesh.material = Array.isArray(original) ? own : own[0]!
      clones.push({ mesh, original, own })
    })
  }
  return {
    set(opacity) {
      if (!started) start()
      for (const c of clones) for (const m of c.own) m.opacity = opacity
    },
    dispose() {
      for (const c of clones) { c.mesh.material = c.original; for (const m of c.own) m.dispose() }
      clones.length = 0
      started = false
    },
  }
}
