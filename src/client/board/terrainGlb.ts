// Loads each terrain GLB at most once (module cache), without suspending. The scene is flattened into a template:
// its meshes (shared geometry + material) with their scene-space matrices, plus the model's bounding box, so the
// board can draw every repeat of a slug as instanced meshes. A failed load logs once and never throws.
import { useEffect, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Box3, Color, Matrix4, Vector3, type BufferGeometry, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export interface TemplateMesh { geometry: BufferGeometry; material: Material | Material[]; matrix: Matrix4 }
export interface TerrainTemplate {
  meshes: TemplateMesh[]
  /** Model bbox size (x, y, z), its xz centre and its lowest y, in the scene's own units. */
  size: [number, number, number]
  cx: number; cz: number; minY: number
}
type Entry = { status: 'loading' | 'ready' | 'failed'; tpl?: TerrainTemplate }
const cache = new Map<string, Entry>()
const listeners = new Set<() => void>()

export const terrainGlbUrl = (slug: string): string => `${import.meta.env.BASE_URL}assets/terrain/${slug}.glb`

function flatten(scene: Object3D): TerrainTemplate | null {
  scene.updateMatrixWorld(true)
  const box = new Box3().setFromObject(scene)
  if (box.isEmpty()) return null
  const meshes: TemplateMesh[] = []
  scene.traverse((o) => {
    const m = o as Mesh
    if (m.isMesh && m.geometry && m.material) meshes.push({ geometry: m.geometry, material: m.material, matrix: m.matrixWorld.clone() })
  })
  if (!meshes.length) return null
  const size = box.getSize(new Vector3())
  const c = box.getCenter(new Vector3())
  return { meshes, size: [size.x, size.y, size.z], cx: c.x, cz: c.z, minY: box.min.y }
}

function request(slug: string): Entry {
  let e = cache.get(slug)
  if (e) return e
  e = { status: 'loading' }
  cache.set(slug, e)
  const entry = e
  const fail = (why: unknown) => {
    entry.status = 'failed'
    console.warn(`terrain model ${slug} unavailable, using the procedural stand-in`, why instanceof Error ? why.message : '')
  }
  try {
    new GLTFLoader().loadAsync(terrainGlbUrl(slug))
      .then((gltf) => {
        const tpl = flatten(gltf.scene)
        if (tpl) { entry.tpl = tpl; entry.status = 'ready' } else fail('empty model')
      })
      .catch(fail)
      .finally(() => listeners.forEach((l) => l()))
  } catch (err) { fail(err) }
  return e
}

/** The slug's template once loaded; null while loading, when it failed, or when slug is undefined. */
export function useTerrainTemplate(slug: string | undefined): TerrainTemplate | null {
  const invalidate = useThree((s) => s.invalidate)
  const gl = useThree((s) => s.gl)
  const [, setTick] = useState(0)
  const entry = slug ? request(slug) : undefined
  useEffect(() => {
    if (!slug) return
    const l = () => { setTick((n) => n + 1); gl.shadowMap.needsUpdate = true; invalidate() }
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [slug, gl, invalidate])
  return entry?.status === 'ready' ? entry.tpl ?? null : null
}

const tinted = new Map<string, Material | Material[]>()
/** One tinted clone of a template material per (slug, board): the board's piece colour multiplies the baked albedo. */
export function tintedMaterial(key: string, src: Material | Material[], tint: string, amount = 0.4): Material | Material[] {
  const hit = tinted.get(key)
  if (hit) return hit
  const mul = new Color('#ffffff').lerp(new Color(tint), amount)
  const one = (m: Material): Material => {
    const c = m.clone()
    const s = c as MeshStandardMaterial
    if (s.color) s.color = s.color.clone().multiply(mul)
    return c
  }
  const out = Array.isArray(src) ? src.map(one) : one(src)
  tinted.set(key, out)
  return out
}
