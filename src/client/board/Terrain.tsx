// Terrain pieces by rules type. Footprints and heights come from the engine's TerrainInstance; pieces are drawn
// semi-transparent and low so they never hide a model. Trees and rubble are instanced from shared geometry.
import { useLayoutEffect, useMemo, useRef, type ReactElement } from 'react'
import * as THREE from 'three'
import { pointInShape } from '../../engine/terrain'
import { usePresentedState } from '../contract'
import { terrainOutlines, type TerrainOutline } from './layout'

const matCache = new Map<string, THREE.MeshStandardMaterial>()
function pieceMat(color: string, opacity: number): THREE.MeshStandardMaterial {
  const k = `${color}:${opacity}`
  let m = matCache.get(k)
  if (!m) { m = new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.85, depthWrite: false }); matCache.set(k, m) }
  return m
}
const EDGE_MAT = new THREE.LineBasicMaterial({ color: '#e8e6e1', transparent: true, opacity: 0.45 })

export function outlineGeometry(o: TerrainOutline): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  if (o.shape.kind === 'circle') shape.absarc(o.shape.c.x, -o.shape.c.z, o.shape.r, 0, Math.PI * 2, false)
  else o.shape.pts.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, -p.z) : shape.lineTo(p.x, -p.z)))
  const g = new THREE.ExtrudeGeometry(shape, { depth: o.height, bevelEnabled: false, curveSegments: 18 })
  g.rotateX(-Math.PI / 2) // shape y -> -z; extrusion -> +y
  return g
}

const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0) / 4294967296 }
const bounds = (o: TerrainOutline) => {
  if (o.shape.kind === 'circle') return { x0: o.shape.c.x - o.shape.r, x1: o.shape.c.x + o.shape.r, z0: o.shape.c.z - o.shape.r, z1: o.shape.c.z + o.shape.r }
  const xs = o.shape.pts.map((p) => p.x), zs = o.shape.pts.map((p) => p.z)
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }
}

/** Deterministic scatter of prop points inside a piece (display only). */
export function scatter(o: TerrainOutline, n: number): { x: number; z: number; k: number }[] {
  const b = bounds(o)
  const out: { x: number; z: number; k: number }[] = []
  let seed = Math.floor(hash(o.id) * 1e9) || 1
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  for (let tries = 0; tries < n * 12 && out.length < n; tries++) {
    const x = b.x0 + rnd() * (b.x1 - b.x0), z = b.z0 + rnd() * (b.z1 - b.z0)
    if (pointInShape({ x, z }, o.shape)) out.push({ x, z, k: rnd() })
  }
  return out
}

const TREE = new THREE.ConeGeometry(0.5, 1, 7)
const CHUNK = new THREE.BoxGeometry(1, 1, 1)
const TREE_MAT = new THREE.MeshStandardMaterial({ color: '#2f5a2e', transparent: true, opacity: 0.6, roughness: 0.9, depthWrite: false })
const CHUNK_MAT = new THREE.MeshStandardMaterial({ color: '#7e7667', roughness: 1 })

function Props({ outlines }: { outlines: TerrainOutline[] }): ReactElement {
  const trees = useRef<THREE.InstancedMesh>(null)
  const chunks = useRef<THREE.InstancedMesh>(null)
  const { treeList, chunkList } = useMemo(() => {
    const t: { x: number; z: number; k: number; h: number }[] = []
    const c: { x: number; z: number; k: number; h: number }[] = []
    for (const o of outlines) {
      if (o.style.kind === 'forest') for (const p of scatter(o, 14)) t.push({ ...p, h: o.height })
      if (o.style.kind === 'rubble') for (const p of scatter(o, 10)) c.push({ ...p, h: o.height })
    }
    return { treeList: t, chunkList: c }
  }, [outlines])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler()
    treeList.forEach((p, i) => {
      const s = 0.5 + p.k * 0.35, h = Math.min(1.6, 0.8 + p.k * 0.9)
      m.compose(new THREE.Vector3(p.x, h / 2, p.z), q.identity(), new THREE.Vector3(s, h, s))
      trees.current?.setMatrixAt(i, m)
    })
    chunkList.forEach((p, i) => {
      const s = 0.18 + p.k * 0.22
      q.setFromEuler(e.set(p.k * 3, p.k * 5, p.k * 2))
      m.compose(new THREE.Vector3(p.x, s / 2, p.z), q, new THREE.Vector3(s, s * 0.7, s * 1.2))
      chunks.current?.setMatrixAt(i, m)
    })
    for (const r of [trees.current, chunks.current]) if (r) { r.instanceMatrix.needsUpdate = true; r.computeBoundingSphere() }
  }, [treeList, chunkList])
  return (
    <>
      {treeList.length > 0 && <instancedMesh ref={trees} args={[TREE, TREE_MAT, treeList.length]} />}
      {chunkList.length > 0 && <instancedMesh ref={chunks} args={[CHUNK, CHUNK_MAT, chunkList.length]} />}
    </>
  )
}

function Piece({ o }: { o: TerrainOutline }): ReactElement {
  const geo = useMemo(() => outlineGeometry(o), [o])
  const edges = useMemo(() => new THREE.EdgesGeometry(geo, 40), [geo])
  const solid = o.style.kind === 'wall' || o.style.kind === 'block'
  return (
    <group>
      <mesh geometry={geo} material={pieceMat(o.style.color, o.style.opacity)} position={[0, o.style.kind === 'water' ? 0.01 : 0.005, 0]} renderOrder={1} />
      {solid && <lineSegments geometry={edges} material={EDGE_MAT} />}
    </group>
  )
}

export function Terrain(): ReactElement | null {
  const state = usePresentedState()
  const terrain = state?.terrain
  const outlines = useMemo(() => (terrain ? terrainOutlines(terrain) : []), [terrain])
  if (!outlines.length) return null
  return (
    <group>
      {outlines.map((o) => <Piece key={o.id} o={o} />)}
      <Props outlines={outlines} />
    </group>
  )
}
