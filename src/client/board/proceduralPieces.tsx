// Procedural terrain pieces (M8): two pieces are too flat for image-to-3D, so they are built here instead of loading
// their GLBs. Both work in the piece's LOCAL space (footprint centred on the origin, long side along x); the engine's
// pos and rot are applied to the group, like the GLB fit (70 section F). Looks only: the rules come from engine data.
//   wt-outpost-trench       a zig-zag sunken channel: dark earth floor below the mat (stencil cut), timber plank
//                           revetments with posts, duckboards, snow-dusted earth berms along both lips.
//   wt-wasteland-ash-flats  a scorched-ash decal blended into the mat, ember glow in its cracks, charred stump stubs.
import { useEffect, useMemo, type ReactElement } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Shape, TerrainInstance } from '../../engine/index'
import { localBounds } from './terrainFit'
import { useMatAlbedo } from './matShare'
import { usePresentedState } from '../contract'
import { tableOf } from './layout'
import { PROCEDURAL_PIECE_SLUGS } from './terrainModels'

export const PROCEDURAL_SLUGS: ReadonlySet<string> = new Set(PROCEDURAL_PIECE_SLUGS)
export const isProcedural = (slug: string | undefined): boolean => !!slug && PROCEDURAL_SLUGS.has(slug)

/** Render order of the trench cut: after the mat (-10), before everything else (0). */
export const TRENCH_MASK_ORDER = -6
export const TRENCH_FLOOR_ORDER = -5

type P2 = { x: number; z: number }

/** Deterministic 0..1 generator from a string. */
export function seeded(key: string): () => number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) }
  let s = (h >>> 0) || 1
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
}

const C = (hex: string): THREE.Color => new THREE.Color(hex)

/** A non-indexed box with per-vertex colour, centred at (cx, cy, cz), turned `ry` about +y. */
function box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, ry: number, color: THREE.Color): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed()
  g.rotateY(ry); g.translate(cx, cy, cz)
  const n = g.getAttribute('position').count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.deleteAttribute('uv')
  return g
}

/** Offset a polyline sideways by `off` (left = +), mitred at the corners. */
export function offsetLine(path: P2[], off: number): P2[] {
  const segN = (a: P2, b: P2): P2 => { const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return { x: -dz / l, z: dx / l } }
  return path.map((p, i) => {
    const n0 = i > 0 ? segN(path[i - 1]!, p) : null
    const n1 = i < path.length - 1 ? segN(p, path[i + 1]!) : null
    let n = n0 && n1 ? { x: n0.x + n1.x, z: n0.z + n1.z } : (n0 ?? n1)!
    const l = Math.hypot(n.x, n.z) || 1
    n = { x: n.x / l, z: n.z / l }
    const cos = n0 && n1 ? Math.max(0.5, n.x * n0.x + n.z * n0.z) : 1
    return { x: p.x + (n.x * off) / cos, z: p.z + (n.z * off) / cos }
  })
}

/** Linear densify: `k` sub-steps per segment. */
const densify = (pts: P2[], k: number): P2[] => {
  const out: P2[] = []
  for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < k; j++) { const t = j / k, a = pts[i]!, b = pts[i + 1]!; out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }) }
  out.push(pts[pts.length - 1]!)
  return out
}

export interface TrenchParts { path: P2[]; mask: THREE.BufferGeometry; floor: THREE.BufferGeometry; timber: THREE.BufferGeometry; berms: THREE.BufferGeometry; halfWidth: number; depth: number }

/** The trench in local space for a footprint (fills the bbox: long side along x). */
export function buildTrench(id: string, fp: Shape): TrenchParts {
  const b = localBounds(fp)
  const turned = b.d > b.w
  const L = Math.max(b.w, b.d), D = Math.min(b.w, b.d)
  const rnd = seeded(id)
  const hw = Math.min(0.4, D * 0.13)             // half channel width
  const bw = Math.min(0.6, D * 0.2)              // berm width
  const bh = 0.2                                 // berm height (visual height 0.4 incl. posts)
  const depth = 0.22                             // floor below the mat
  const amp = Math.max(0, D / 2 - hw - bw - 0.08)
  // three runs at about 35 degrees (a fire-step zig-zag, never right angles), shrunk until the mitred berms fit
  const span = L - 2 * (bw + 0.1)
  const zig = (a: number): P2[] => [-1, 1, -1, 1].map((k, i, all) => ({ x: -span / 2 + (span * i) / (all.length - 1), z: k * a }))
  let a = Math.min(amp, 0.42)
  const fits = (pts: P2[]) => [offsetLine(pts, hw + bw), offsetLine(pts, -hw - bw)].every((l) => l.every((q) => Math.abs(q.x) <= L / 2 - 0.02 && Math.abs(q.z) <= D / 2 - 0.02))
  while (a > 0.05 && !fits(zig(a))) a -= 0.02
  const path0 = zig(a)
  const path = turned ? path0.map((p) => ({ x: p.z, z: p.x })) : path0

  // channel outline (left then right reversed) -> mask and floor
  const left = offsetLine(path, hw), right = offsetLine(path, -hw)
  const outline = [...left, ...right.slice().reverse()]
  const shape = new THREE.Shape()
  outline.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, -p.z) : shape.lineTo(p.x, -p.z)))
  const flat = new THREE.ShapeGeometry(shape)
  flat.rotateX(-Math.PI / 2)
  const mask = flat.clone(); mask.translate(0, 0.004, 0)
  const floor = flat.clone(); floor.translate(0, -depth, 0)
  flat.dispose()

  // timber: plank walls (three strips per run), posts, duckboard slats
  const parts: THREE.BufferGeometry[] = []
  const planks = ['#6f4c2f', '#5b3e26', '#7b5838', '#664629'].map(C)
  const strips = 3
  const wallTop = 0.02
  const wall = (a: P2, c: P2) => {
    const dx = c.x - a.x, dz = c.z - a.z, len = Math.hypot(dx, dz)
    if (len < 1e-4) return
    const ry = -Math.atan2(dz, dx)
    for (let s = 0; s < strips; s++) {
      const y0 = -depth + ((wallTop + depth) * s) / strips, y1 = -depth + ((wallTop + depth) * (s + 1)) / strips
      const col = planks[Math.floor(rnd() * planks.length)]!.clone().multiplyScalar(0.85 + rnd() * 0.3)
      parts.push(box((a.x + c.x) / 2, (y0 + y1) / 2, (a.z + c.z) / 2, len, (y1 - y0) * 0.92, 0.03, ry, col))
    }
  }
  for (const side of [left, right]) for (let i = 0; i < side.length - 1; i++) wall(side[i]!, side[i + 1]!)
  wall(left[0]!, right[0]!); wall(left[left.length - 1]!, right[right.length - 1]!)
  const post = C('#4a321f')
  for (const side of [offsetLine(path, hw + 0.02), offsetLine(path, -hw - 0.02)]) {
    const dense = densify(side, 2)
    for (const p of dense) parts.push(box(p.x, (-depth + 0.1) / 2, p.z, 0.07, depth + 0.1, 0.07, rnd() * 0.4, post))
  }
  const slat = C('#6a5236')
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!, c = path[i + 1]!, dx = c.x - a.x, dz = c.z - a.z, len = Math.hypot(dx, dz)
    const ry = -Math.atan2(dz, dx)
    const n = Math.max(1, Math.floor(len / 0.2))
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n
      parts.push(box(a.x + dx * t, -depth + 0.03, a.z + dz * t, 0.09, 0.025, hw * 1.35, ry, slat.clone().multiplyScalar(0.8 + rnd() * 0.35)))
    }
    for (const o of [-1, 1]) {
      const nx = (-dz / len) * o * hw * 0.45, nz = (dx / len) * o * hw * 0.45
      parts.push(box(a.x + dx / 2 + nx, -depth + 0.012, a.z + dz / 2 + nz, len, 0.02, 0.05, ry, C('#4d3622')))
    }
  }
  const timber = mergeGeometries(parts, false)!
  for (const p of parts) p.dispose()
  timber.computeVertexNormals()

  // berms: a grid per side, rows along the path, columns across (lip -> outer toe)
  const earth = C('#5a4634'), earthDark = C('#3e2f22'), snow = C('#e6ebf1')
  const cols: [number, number][] = [[0, 0.02 / bh], [0.05, 0.55], [0.2, 0.95], [0.38, 1], [0.58, 0.72], [0.78, 0.3], [1, 0]]
  const ph = [rnd() * 6.3, rnd() * 6.3, rnd() * 6.3]
  const bermGeos: THREE.BufferGeometry[] = []
  for (const s of [1, -1]) {
    const lines = cols.map(([t]) => densify(offsetLine(path, s * (hw + t * bw)), 10))
    const rows = lines[0]!.length
    const pos: number[] = [], col: number[] = [], idx: number[] = [], across: number[] = []
    for (let i = 0; i < rows; i++) {
      const along = i / (rows - 1)
      const taper = Math.min(1, Math.min(along, 1 - along) / 0.08) * 0.6 + 0.4
      for (let j = 0; j < cols.length; j++) {
        const p = lines[j]![i]!
        const hk = cols[j]![1]
        const lump = 0.78 + 0.16 * Math.sin(along * 19 + ph[0]! + s) + 0.1 * Math.sin(along * 53 + ph[1]! + j) + rnd() * 0.16
        const y = j === 0 ? wallTop : bh * hk * taper * lump
        pos.push(p.x, y, p.z)
        const drift = 0.5 + 0.5 * Math.sin(along * 23 + ph[2]! + j * 0.7)
        const snowy = j === cols.length - 1 ? 0.6 : THREE.MathUtils.smoothstep(hk * 0.5 + drift * 0.55 + (rnd() - 0.5) * 0.3, 0.72, 1.02)
        const c = earth.clone().lerp(earthDark, rnd() * 0.55).lerp(snow, snowy * 0.88)
        col.push(c.r, c.g, c.b)
        across.push(cols[j]![0])
      }
    }
    const nc = cols.length
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < nc - 1; j++) {
      const a = i * nc + j, bb = (i + 1) * nc + j, c = i * nc + j + 1, d = (i + 1) * nc + j + 1
      idx.push(a, bb, c, c, bb, d)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.setAttribute('across', new THREE.Float32BufferAttribute(across, 1))
    g.setIndex(idx)
    // face the berm up: flip the winding when the first triangle points down
    const v = (k: number) => new THREE.Vector3(pos[k * 3]!, pos[k * 3 + 1]!, pos[k * 3 + 2]!)
    const ny = new THREE.Vector3().crossVectors(v(idx[1]!).sub(v(idx[0]!)), v(idx[2]!).sub(v(idx[0]!))).y
    if (ny < 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]!; idx[k + 1] = idx[k + 2]!; idx[k + 2] = t } g.setIndex(idx) }
    g.computeVertexNormals()
    bermGeos.push(g)
  }
  const berms = mergeGeometries(bermGeos, false)!
  for (const g of bermGeos) g.dispose()
  return { path, mask, floor, timber, berms, halfWidth: hw, depth }
}

// ---------- materials (shared) ----------
const MASK_MAT = new THREE.MeshBasicMaterial({
  colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1,
  stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp,
})
const FLOOR_MAT = new THREE.MeshStandardMaterial({
  color: '#2c2219', roughness: 1, depthFunc: THREE.AlwaysDepth,
  stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc,
  stencilZPass: THREE.KeepStencilOp, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp,
})
const TIMBER_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide })
const BERM_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })

/**
 * Berms that sample the board's own mat: UVs from world position (Surface's plane: u = 0.5 + x/w, v = 0.5 - z/d) and
 * vertex colours fading to white at the outer toe, so the mound grows out of the ground under it.
 */
export function bermOnMat(berms: THREE.BufferGeometry, pos: { x: number; z: number }, rot: number, table: { w: number; d: number }): THREE.BufferGeometry {
  const g = berms.clone()
  const p = g.getAttribute('position'), a = g.getAttribute('across'), c = g.getAttribute('color')
  const uv = new Float32Array(p.count * 2)
  const cs = Math.cos(rot), sn = Math.sin(rot)
  const white = new THREE.Color(1, 1, 1), tmp = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i)
    const wx = x * cs + z * sn + pos.x, wz = -x * sn + z * cs + pos.z
    uv[i * 2] = 0.5 + wx / table.w; uv[i * 2 + 1] = 0.5 - wz / table.d
    const k = THREE.MathUtils.smoothstep(a ? a.getX(i) : 0, 0.25, 1)
    tmp.setRGB(c.getX(i), c.getY(i), c.getZ(i)).lerp(white, k)
    c.setXYZ(i, tmp.r, tmp.g, tmp.b)
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

function Trench({ t, shadows }: { t: TerrainInstance; shadows: boolean }): ReactElement {
  const parts = useMemo(() => buildTrench(t.id, t.footprint), [t.id, t.footprint])
  useEffect(() => () => { for (const g of [parts.mask, parts.floor, parts.timber, parts.berms]) g.dispose() }, [parts])
  const albedo = useMatAlbedo()
  const table = tableOf(usePresentedState())
  const onMat = useMemo(() => (albedo ? bermOnMat(parts.berms, t.pos, t.rot, table) : null), [albedo, parts, t.pos, t.rot, table.w, table.d]) // eslint-disable-line react-hooks/exhaustive-deps
  const matBerm = useMemo(() => (albedo ? new THREE.MeshStandardMaterial({ vertexColors: true, map: albedo, roughness: 0.95, flatShading: true }) : null), [albedo])
  useEffect(() => () => { onMat?.dispose(); matBerm?.dispose() }, [onMat, matBerm])
  return (
    <group position={[t.pos.x, 0, t.pos.z]} rotation={[0, t.rot, 0]}>
      <mesh geometry={parts.mask} material={MASK_MAT} renderOrder={TRENCH_MASK_ORDER} />
      <mesh geometry={parts.floor} material={FLOOR_MAT} renderOrder={TRENCH_FLOOR_ORDER} receiveShadow={shadows} />
      <mesh geometry={parts.timber} material={TIMBER_MAT} castShadow={shadows} receiveShadow={shadows} />
      <mesh geometry={onMat ?? parts.berms} material={matBerm ?? BERM_MAT} castShadow={shadows} receiveShadow={shadows} />
    </group>
  )
}

// ---------- ash flats ----------
let ashTex: { map: THREE.Texture; glow: THREE.Texture } | null = null
/** 512 px ash decal (albedo with alpha, plus an ember emissive map), drawn once per page. Null without a DOM. */
export function ashTextures(): { map: THREE.Texture; glow: THREE.Texture } | null {
  if (ashTex) return ashTex
  if (typeof document === 'undefined') return null
  const S = 512
  const rnd = seeded('ash-flats')
  // value noise
  const grid = (n: number) => { const g = new Float32Array((n + 1) * (n + 1)); for (let i = 0; i < g.length; i++) g[i] = rnd(); return g }
  const octs = [8, 16, 32, 64].map((n) => ({ n, g: grid(n) }))
  const noise = (u: number, v: number): number => {
    let s = 0, w = 0, a = 1
    for (const { n, g } of octs) {
      const x = u * n, y = v * n, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0
      const at = (i: number, j: number) => g[Math.min(n, j) * (n + 1) + Math.min(n, i)]!
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
      const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx, bot = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx
      s += (top + (bot - top) * sy) * a; w += a; a *= 0.55
    }
    return s / w
  }
  // cracks: distance to the nearest cell border of a jittered Voronoi
  const cells: P2[] = Array.from({ length: 34 }, () => ({ x: 0.08 + rnd() * 0.84, z: 0.08 + rnd() * 0.84 }))
  const base = document.createElement('canvas'); base.width = base.height = S
  const glow = document.createElement('canvas'); glow.width = glow.height = S
  const bc = base.getContext('2d'), gc = glow.getContext('2d')
  if (!bc || !gc) return null
  const bi = bc.createImageData(S, S), gi = gc.createImageData(S, S)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S
    const wu = u + (noise(u + 3.1, v) - 0.5) * 0.06, wv = v + (noise(u, v + 7.3) - 0.5) * 0.06
    let d1 = 9, d2 = 9
    for (const c of cells) { const d = Math.hypot(wu - c.x, wv - c.z); if (d < d1) { d2 = d1; d1 = d } else if (d < d2) d2 = d }
    const edge = d2 - d1
    const crack = Math.max(0, 1 - edge / 0.007)
    const n = noise(u * 1.7, v * 1.7)
    const r = Math.hypot(u - 0.5, v - 0.5) * 2
    const fade = 1 - THREE.MathUtils.smoothstep(r + (n - 0.5) * 0.35, 0.55, 0.98)
    // pale ash to grey cinder, darker toward the rim (blends into the mat)
    const ash = 0.27 + 0.2 * n - 0.08 * THREE.MathUtils.smoothstep(r, 0.4, 0.9)
    const speck = noise(u * 9, v * 9) > 0.78 ? -0.12 : 0
    const k = (y * S + x) * 4
    const lum = Math.max(0, ash + speck - crack * 0.2)
    bi.data[k] = Math.round(255 * Math.min(1, lum * 1.02)); bi.data[k + 1] = Math.round(255 * lum * 0.97); bi.data[k + 2] = Math.round(255 * lum * 0.94)
    bi.data[k + 3] = Math.round(255 * fade * 0.9)
    const hot = crack * crack * THREE.MathUtils.smoothstep(noise(u * 4 + 11, v * 4), 0.45, 0.7) * fade
    gi.data[k] = Math.round(255 * Math.min(1, hot * 1.0)); gi.data[k + 1] = Math.round(255 * hot * 0.38); gi.data[k + 2] = Math.round(255 * hot * 0.08); gi.data[k + 3] = 255
  }
  bc.putImageData(bi, 0, 0); gc.putImageData(gi, 0, 0)
  const map = new THREE.CanvasTexture(base); map.colorSpace = THREE.SRGBColorSpace
  const glowTex = new THREE.CanvasTexture(glow); glowTex.colorSpace = THREE.SRGBColorSpace
  ashTex = { map, glow: glowTex }
  return ashTex
}

/** The footprint as a flat shape with UVs over its bbox (local space). */
export function footprintDecal(fp: Shape): THREE.BufferGeometry {
  const b = localBounds(fp)
  const shape = new THREE.Shape()
  if ('circle' in fp) shape.absarc(0, 0, fp.circle.r, 0, Math.PI * 2, false)
  else {
    const pts = 'rect' in fp
      ? [{ x: -fp.rect.w / 2, z: -fp.rect.d / 2 }, { x: fp.rect.w / 2, z: -fp.rect.d / 2 }, { x: fp.rect.w / 2, z: fp.rect.d / 2 }, { x: -fp.rect.w / 2, z: fp.rect.d / 2 }]
      : fp.polygon
    pts.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, -p.z) : shape.lineTo(p.x, -p.z)))
  }
  const g = new THREE.ShapeGeometry(shape, 24)
  g.rotateX(-Math.PI / 2)
  const pos = g.getAttribute('position')
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = (pos.getX(i) - b.minX) / b.w; uv[i * 2 + 1] = (pos.getZ(i) - b.minZ) / b.d }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

/** Charred stump stubs, deterministic per piece, inside the inner 70% of the footprint ellipse. */
export function buildStumps(id: string, fp: Shape): THREE.BufferGeometry {
  const b = localBounds(fp)
  const rnd = seeded(`${id}:stumps`)
  const n = Math.max(3, Math.min(7, Math.round((b.w * b.d) / 3.5)))
  const parts: THREE.BufferGeometry[] = []
  const char = C('#16110e'), charTop = C('#2b1c14')
  for (let k = 0, tries = 0; k < n && tries < 80; tries++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.68
    const x = b.cx + Math.cos(a) * r * b.w / 2, z = b.cz + Math.sin(a) * r * b.d / 2
    const rad = 0.07 + rnd() * 0.08, h = 0.14 + rnd() * 0.26
    const g0 = new THREE.CylinderGeometry(rad * (0.72 + rnd() * 0.2), rad * 1.15, h, 8, 1)
    // jagged broken top: move the shared top-ring vertices (indexed), then split for flat shading
    const p0 = g0.getAttribute('position')
    const lift = new Map<string, number>()
    for (let i = 0; i < p0.count; i++) {
      if (p0.getY(i) <= 0) continue
      const key = `${p0.getX(i).toFixed(4)},${p0.getZ(i).toFixed(4)}`
      if (!lift.has(key)) lift.set(key, Math.abs(p0.getX(i)) + Math.abs(p0.getZ(i)) < 1e-6 ? -h * 0.1 : (rnd() - 0.3) * h * 0.45)
      p0.setY(i, p0.getY(i) + lift.get(key)!)
    }
    const g = g0.toNonIndexed()
    g0.dispose()
    const p = g.getAttribute('position')
    g.rotateY(rnd() * Math.PI); g.translate(x, h / 2, z)
    const col = new Float32Array(p.count * 3)
    for (let i = 0; i < p.count; i++) { const c = p.getY(i) > h * 0.8 ? charTop : char; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.deleteAttribute('uv')
    parts.push(g)
    k++
  }
  const out = mergeGeometries(parts, false)!
  for (const g of parts) g.dispose()
  out.computeVertexNormals()
  return out
}

const STUMP_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, emissive: '#2a0800', emissiveIntensity: 0.2 })
let ashMat: THREE.MeshStandardMaterial | null = null
function ashMaterial(): THREE.MeshStandardMaterial {
  if (ashMat) return ashMat
  const tex = ashTextures()
  ashMat = new THREE.MeshStandardMaterial({
    color: '#ffffff', map: tex?.map ?? null, emissiveMap: tex?.glow ?? null, emissive: tex ? '#ff7a2a' : '#000000', emissiveIntensity: 0.9,
    transparent: true, depthWrite: false, roughness: 0.97, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  })
  if (!tex) { ashMat.color.set('#6b625c'); ashMat.opacity = 0.7 }
  return ashMat
}

function AshFlats({ t, shadows }: { t: TerrainInstance; shadows: boolean }): ReactElement {
  const decal = useMemo(() => footprintDecal(t.footprint), [t.footprint])
  const stumps = useMemo(() => buildStumps(t.id, t.footprint), [t.id, t.footprint])
  useEffect(() => () => { decal.dispose(); stumps.dispose() }, [decal, stumps])
  return (
    <group position={[t.pos.x, 0, t.pos.z]} rotation={[0, t.rot, 0]}>
      <mesh geometry={decal} material={ashMaterial()} position={[0, 0.014, 0]} renderOrder={1} receiveShadow={shadows} />
      <mesh geometry={stumps} material={STUMP_MAT} castShadow={shadows} receiveShadow={shadows} />
    </group>
  )
}

/** Every piece of a procedural slug. */
export function ProceduralGroup({ slug, items, shadows }: { slug: string; items: { t: TerrainInstance }[]; shadows: boolean }): ReactElement {
  return (
    <>
      {items.map(({ t }) => slug === 'wt-outpost-trench'
        ? <Trench key={t.id} t={t} shadows={shadows} />
        : <AshFlats key={t.id} t={t} shadows={shadows} />)}
    </>
  )
}
