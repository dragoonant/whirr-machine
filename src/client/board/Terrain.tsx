// Terrain pieces (70 section F). Each piece draws its GLB (public/assets/terrain/<slug>.glb) fitted to the engine
// footprint; every repeat of a slug is one InstancedMesh per template mesh (one draw call for a one-mesh model).
// While a GLB loads, or if it is missing or fails, the procedural stand-in draws (tinted by the board).
// The trench and the ash flats are built procedurally (proceduralPieces.tsx) and never load a GLB.
// The rules footprint outline shows only while something is selected or "Show terrain zones" is on.
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactElement } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { pointInShape } from '../../engine/terrain'
import type { TerrainInstance } from '../../engine/index'
import { useSelectedId, useSettings, usePresentedState } from '../contract'
import { terrainOutlines, type TerrainOutline } from './layout'
import { useBoard } from './boardStore'
import type { BoardDef } from './boards'
import { planFit } from './terrainFit'
import { tintedMaterial, useTerrainTemplate, type TerrainTemplate } from './terrainGlb'
import { clearTerrainHover, hoverTerrain } from './terrainHover'
import { modelFor } from './terrainModels'
import { ProceduralGroup, isProcedural } from './proceduralPieces'

// ---------- procedural stand-in (today's look, tinted per board) ----------
const matCache = new Map<string, THREE.MeshStandardMaterial>()
function pieceMat(color: string, opacity: number): THREE.MeshStandardMaterial {
  const k = `${color}:${opacity}`
  let m = matCache.get(k)
  if (!m) { m = new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.85, depthWrite: false }); matCache.set(k, m) }
  return m
}
const EDGE_MAT = new THREE.LineBasicMaterial({ color: '#e8e6e1', transparent: true, opacity: 0.45 })
const FOOT_MAT = new THREE.LineBasicMaterial({ color: '#e8e6e1', transparent: true, opacity: 0.38 })
const DECAL_MAT = new THREE.MeshBasicMaterial({ color: '#080b06', transparent: true, opacity: 0.24, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })

const mix = (a: string, b: string, t: number): string => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`

/** Procedural colour of a piece: solid pieces lean to the board's piece colour, forests to its accent, flat ground to its mat. */
export function tintFor(o: TerrainOutline, board: BoardDef): string {
  const base = o.style.color
  switch (o.style.kind) {
    case 'wall': case 'block': return mix(base, board.fallback.piece, 0.5)
    case 'forest': return mix(base, board.fallback.accent, 0.35)
    case 'flat': return o.rulesType === 'hazard' ? base : mix(base, board.fallback.ground, 0.3)
    default: return base
  }
}

export function outlineGeometry(o: TerrainOutline): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  if (o.shape.kind === 'circle') shape.absarc(o.shape.c.x, -o.shape.c.z, o.shape.r, 0, Math.PI * 2, false)
  else o.shape.pts.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, -p.z) : shape.lineTo(p.x, -p.z)))
  const g = new THREE.ExtrudeGeometry(shape, { depth: o.height, bevelEnabled: false, curveSegments: 18 })
  g.rotateX(-Math.PI / 2) // shape y -> -z; extrusion -> +y
  return g
}

function flatGeometry(o: TerrainOutline): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  if (o.shape.kind === 'circle') shape.absarc(o.shape.c.x, -o.shape.c.z, o.shape.r, 0, Math.PI * 2, false)
  else o.shape.pts.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, -p.z) : shape.lineTo(p.x, -p.z)))
  const g = new THREE.ShapeGeometry(shape, 24)
  g.rotateX(-Math.PI / 2)
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
const treeMats = new Map<string, THREE.MeshStandardMaterial>()
const chunkMats = new Map<string, THREE.MeshStandardMaterial>()
const treeMat = (c: string) => { let m = treeMats.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity: 0.6, roughness: 0.9, depthWrite: false }); treeMats.set(c, m) } return m }
const chunkMat = (c: string) => { let m = chunkMats.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 1 }); chunkMats.set(c, m) } return m }

function Props({ outlines, board }: { outlines: TerrainOutline[]; board: BoardDef }): ReactElement {
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
      {treeList.length > 0 && <instancedMesh ref={trees} args={[TREE, treeMat(mix('#2f5a2e', board.fallback.accent, 0.3)), treeList.length]} />}
      {chunkList.length > 0 && <instancedMesh ref={chunks} args={[CHUNK, chunkMat(mix('#7e7667', board.fallback.piece, 0.5)), chunkList.length]} />}
    </>
  )
}

function Piece({ o, board }: { o: TerrainOutline; board: BoardDef }): ReactElement {
  const geo = useMemo(() => outlineGeometry(o), [o])
  const edges = useMemo(() => new THREE.EdgesGeometry(geo, 40), [geo])
  const solid = o.style.kind === 'wall' || o.style.kind === 'block'
  return (
    <group>
      <mesh geometry={geo} material={pieceMat(tintFor(o, board), o.style.opacity)} position={[0, o.style.kind === 'water' ? 0.01 : 0.005, 0]} renderOrder={1} />
      {solid && <lineSegments geometry={edges} material={EDGE_MAT} />}
    </group>
  )
}

// ---------- GLB pieces, instanced per slug ----------
interface Item { t: TerrainInstance; o: TerrainOutline; vh: number }

const compose = (...ms: THREE.Matrix4[]): THREE.Matrix4 => ms.reduce((a, b) => a.multiply(b), new THREE.Matrix4())

/** Instance matrices: engine pose * fit (centre on the footprint, quarter turn, scale, stand on y=0) * the mesh's own matrix. */
export function buildInstances(tpl: TerrainTemplate, slug: string, items: Item[], board: BoardDef, shadows: boolean): THREE.InstancedMesh[] {
  const meshes = tpl.meshes.map((m, i) => {
    const im = new THREE.InstancedMesh(m.geometry, tintedMaterial(`${slug}:${board.id}:${i}`, m.material, board.fallback.piece), items.length)
    im.frustumCulled = false
    im.castShadow = shadows && (items[0]?.vh ?? 1) > 0.4 // flat pieces (pools, ponds) cast no useful shadow
    im.receiveShadow = shadows
    return im
  })
  const toOrigin = new THREE.Matrix4().makeTranslation(-tpl.cx, -tpl.minY, -tpl.cz)
  items.forEach((it, k) => {
    const plan = planFit(it.t.id, it.t.footprint, it.t.rot, it.vh, tpl.size)
    const pose = compose(new THREE.Matrix4().makeTranslation(it.t.pos.x, 0, it.t.pos.z), new THREE.Matrix4().makeRotationY(it.t.rot))
    const fit = compose(
      new THREE.Matrix4().makeTranslation(plan.cx, 0, plan.cz),
      new THREE.Matrix4().makeScale(plan.sx, plan.sy, plan.sz),
      new THREE.Matrix4().makeRotationY(plan.turns * Math.PI / 2 + (plan.flip ? Math.PI : 0)),
      toOrigin,
    )
    const base = compose(pose, fit)
    tpl.meshes.forEach((m, i) => meshes[i]!.setMatrixAt(k, compose(base, m.matrix)))
  })
  for (const im of meshes) im.instanceMatrix.needsUpdate = true
  return meshes
}

function Instanced({ tpl, slug, items, board, shadows }: { tpl: TerrainTemplate; slug: string; items: Item[]; board: BoardDef; shadows: boolean }): ReactElement {
  const meshes = useMemo(() => buildInstances(tpl, slug, items, board, shadows), [tpl, slug, items, board, shadows])
  useEffect(() => () => { for (const m of meshes) m.dispose() }, [meshes])
  return <>{meshes.map((m) => <primitive key={m.uuid} object={m} />)}</>
}

function SlugGroup({ slug, items, board, shadows }: { slug: string; items: Item[]; board: BoardDef; shadows: boolean }): ReactElement {
  if (isProcedural(slug)) return <ProceduralGroup slug={slug} items={items} shadows={shadows} />
  return <GlbGroup slug={slug} items={items} board={board} shadows={shadows} />
}

function GlbGroup({ slug, items, board, shadows }: { slug: string; items: Item[]; board: BoardDef; shadows: boolean }): ReactElement {
  const tpl = useTerrainTemplate(slug || undefined)
  const outlines = useMemo(() => items.map((i) => i.o), [items])
  if (tpl) return <Instanced tpl={tpl} slug={slug} items={items} board={board} shadows={shadows} />
  return (
    <>
      {outlines.map((o) => <Piece key={o.id} o={o} board={board} />)}
      <Props outlines={outlines} board={board} />
    </>
  )
}

// ---------- ground decals, footprint outlines, hover areas ----------
function ForestDecals({ outlines }: { outlines: TerrainOutline[] }): ReactElement | null {
  const geo = useMemo(() => {
    const parts = outlines.filter((o) => o.rulesType === 'forest').map(flatGeometry)
    if (!parts.length) return null
    const g = mergeGeometries(parts, false)
    for (const p of parts) p.dispose()
    return g
  }, [outlines])
  useEffect(() => () => geo?.dispose(), [geo])
  if (!geo) return null
  return <mesh geometry={geo} material={DECAL_MAT} position={[0, 0.012, 0]} renderOrder={0} />
}

function Footprints({ outlines }: { outlines: TerrainOutline[] }): ReactElement | null {
  const geo = useMemo(() => {
    const pts: number[] = []
    const seg = (ax: number, az: number, bx: number, bz: number) => pts.push(ax, 0.05, az, bx, 0.05, bz)
    for (const o of outlines) {
      if (o.shape.kind === 'circle') {
        const { c, r } = o.shape
        for (let i = 0; i < 48; i++) {
          const a0 = (i / 48) * Math.PI * 2, a1 = ((i + 1) / 48) * Math.PI * 2
          seg(c.x + Math.cos(a0) * r, c.z + Math.sin(a0) * r, c.x + Math.cos(a1) * r, c.z + Math.sin(a1) * r)
        }
      } else {
        const p = o.shape.pts
        for (let i = 0; i < p.length; i++) { const a = p[i]!, b = p[(i + 1) % p.length]!; seg(a.x, a.z, b.x, b.z) }
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [outlines])
  useEffect(() => () => geo.dispose(), [geo])
  return <lineSegments geometry={geo} material={FOOT_MAT} renderOrder={2} />
}

/** Invisible prisms the pointer can hit (no draw call): they feed the terrain tooltip only. */
function HitAreas({ outlines }: { outlines: TerrainOutline[] }): ReactElement {
  const geos = useMemo(() => outlines.map(outlineGeometry), [outlines])
  useEffect(() => () => { for (const g of geos) g.dispose() }, [geos])
  let last = 0
  return (
    <group>
      {outlines.map((o, i) => (
        <mesh key={o.id} geometry={geos[i]} visible={false}
          onPointerMove={(e) => {
            const now = performance.now()
            if (now - last < 33) return
            last = now
            hoverTerrain(o.id, e.nativeEvent.clientX, e.nativeEvent.clientY)
          }}
          onPointerOut={() => clearTerrainHover(o.id)} />
      ))}
    </group>
  )
}

export function Terrain(): ReactElement | null {
  const state = usePresentedState()
  const board = useBoard()
  const { graphics, showZones } = useSettings()
  const selected = useSelectedId()
  const terrain = state?.terrain
  const outlines = useMemo(() => (terrain ? terrainOutlines(terrain) : []), [terrain])
  const groups = useMemo(() => {
    const by = new Map<string, Item[]>()
    terrain?.forEach((t, i) => {
      const ref = modelFor(t.pieceId, board)
      const key = ref?.slug ?? ''
      const list = by.get(key) ?? []
      list.push({ t, o: outlines[i]!, vh: ref?.visualHeight ?? 0 })
      by.set(key, list)
    })
    return [...by.entries()].map(([slug, items]) => ({ slug, items }))
  }, [terrain, outlines, board])
  if (!outlines.length) return null
  return (
    <group>
      <ForestDecals outlines={outlines} />
      {groups.map((g) => <SlugGroup key={g.slug || 'procedural'} slug={g.slug} items={g.items} board={board} shadows={graphics === 'high'} />)}
      {(selected != null || showZones) && <Footprints outlines={outlines} />}
      <HitAreas outlines={outlines} />
    </group>
  )
}
