// M8 integration: the trench and the ash flats are procedural (no GLB), stay inside their footprints, and the
// mat helpers (wood frame, ?layout=) behave.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { PROCEDURAL_SLUGS, bermOnMat, buildStumps, buildTrench, footprintDecal, isProcedural, offsetLine } from '../../src/client/board/proceduralPieces'
import { ENABLED_GLB_SLUGS, PIECE_MODELS, PROCEDURAL_PIECE_SLUGS } from '../../src/client/board/terrainModels'
import { woodFrame } from '../../src/client/board/Surface'
import { layoutFromUrl, pickBattlefield } from '../../src/client/board/boardPick'
import type { Shape } from '../../src/engine/index'

const box = (g: THREE.BufferGeometry): THREE.Box3 => { g.computeBoundingBox(); return g.boundingBox! }
const TRENCH: Shape = { rect: { w: 5, d: 3 } }
const ELLIPSE: Shape = { polygon: Array.from({ length: 12 }, (_, k) => ({ x: 2.5 * Math.cos((k * Math.PI) / 6), z: 2 * Math.sin((k * Math.PI) / 6) })) }

describe('procedural pieces', () => {
  it('the trench and the ash flats are procedural and out of the enabled GLB set', () => {
    expect([...PROCEDURAL_SLUGS].sort()).toEqual(['wt-outpost-trench', 'wt-wasteland-ash-flats'])
    expect(PROCEDURAL_PIECE_SLUGS.every((s) => !ENABLED_GLB_SLUGS.includes(s))).toBe(true)
    expect(ENABLED_GLB_SLUGS.length).toBe(new Set(Object.values(PIECE_MODELS).map(([s]) => s)).size - 2)
    expect(isProcedural('wt-outpost-trench')).toBe(true)
    expect(isProcedural('wt-outpost-wagon')).toBe(false)
  })

  it('the trench fits its 5 x 3 footprint: floor below the mat, berms within the visual height', () => {
    const t = buildTrench('terrain.outpost-trench#t1', TRENCH)
    for (const g of [t.mask, t.floor, t.timber, t.berms]) {
      const b = box(g)
      expect(b.min.x).toBeGreaterThanOrEqual(-2.5 - 1e-6); expect(b.max.x).toBeLessThanOrEqual(2.5 + 1e-6)
      expect(b.min.z).toBeGreaterThanOrEqual(-1.5 - 1e-6); expect(b.max.z).toBeLessThanOrEqual(1.5 + 1e-6)
    }
    expect(box(t.floor).max.y).toBeLessThan(0)
    expect(box(t.berms).max.y).toBeLessThanOrEqual(0.4)
    expect(box(t.timber).max.y).toBeLessThanOrEqual(0.4)
    // a zig-zag: the path changes direction at every corner, never at a right angle
    for (let i = 1; i < t.path.length - 1; i++) {
      const a = t.path[i - 1]!, b = t.path[i]!, c = t.path[i + 1]!
      const u = new THREE.Vector2(b.x - a.x, b.z - a.z).normalize(), v = new THREE.Vector2(c.x - b.x, c.z - b.z).normalize()
      const deg = (Math.acos(u.dot(v)) * 180) / Math.PI
      expect(deg).toBeGreaterThan(30); expect(deg).toBeLessThan(85)
    }
  })

  it('berms on the mat get mat UVs and fade to white at the toe', () => {
    const t = buildTrench('t', TRENCH)
    const g = bermOnMat(t.berms, { x: 0, z: 0 }, 0, { w: 36, d: 36 })
    const uv = g.getAttribute('uv'), a = g.getAttribute('across'), c = g.getAttribute('color')
    for (let i = 0; i < uv.count; i++) { expect(uv.getX(i)).toBeGreaterThan(0.4); expect(uv.getX(i)).toBeLessThan(0.6) }
    for (let i = 0; i < a.count; i++) if (a.getX(i) === 1) expect(c.getX(i)).toBeCloseTo(1, 5)
  })

  it('a mitred offset keeps its distance on straight runs', () => {
    const o = offsetLine([{ x: 0, z: 0 }, { x: 2, z: 0 }], 0.5)
    expect(o).toEqual([{ x: 0, z: 0.5 }, { x: 2, z: 0.5 }])
  })

  it('the ash decal covers the footprint with bbox UVs; stumps stay inside and low', () => {
    const d = footprintDecal(ELLIPSE)
    const uv = d.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) { expect(uv.getX(i)).toBeGreaterThanOrEqual(-1e-6); expect(uv.getX(i)).toBeLessThanOrEqual(1 + 1e-6) }
    const s = box(buildStumps('terrain.wasteland-ash-flats#a', ELLIPSE))
    expect(s.max.x).toBeLessThanOrEqual(2.5); expect(s.max.z).toBeLessThanOrEqual(2)
    expect(s.max.y).toBeLessThanOrEqual(0.6)
    expect(box(buildStumps('x', { circle: { r: 2 } })).max.x).toBeLessThanOrEqual(2)
  })
})

describe('table and battlefield helpers', () => {
  it('the wood surround is a frame with a hole under the mat', () => {
    const g = woodFrame(36, 36)
    const b = box(g)
    expect(b.max.x).toBeCloseTo(26); expect(b.max.z).toBeCloseTo(26)
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0))
    expect(ray.intersectObject(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))).length).toBe(0)
  })

  it('?layout= picks an eligible layout and is ignored otherwise', () => {
    expect(layoutFromUrl('?layout=outpost-1')).toBe('layout.outpost-1')
    expect(layoutFromUrl('?layout=layout.bog-2')).toBe('layout.bog-2')
    expect(layoutFromUrl('?x=1')).toBeUndefined()
    const base = pickBattlefield({ seed: 's1', scenario: 'scn-ashwall-divide', board: 'board.outpost' })
    const other = ['layout.outpost-1', 'layout.outpost-2', 'layout.outpost-3'].find((l) => l !== base.layout)!
    expect(pickBattlefield({ seed: 's1', scenario: 'scn-ashwall-divide', board: 'board.outpost', layout: other }).layout).toBe(other)
    expect(pickBattlefield({ seed: 's1', scenario: 'scn-ashwall-divide', board: 'board.outpost', layout: 'layout.bog-1' }).layout).toBe(base.layout)
    expect(pickBattlefield({ seed: 's1', scenario: 'scn-qs-demo', board: 'board.outpost', layout: other }).layout).not.toBe(other)
  })
})
