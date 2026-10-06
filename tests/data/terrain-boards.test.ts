import { describe, expect, it } from 'vitest'
import catalog from '../../tools/terrain-catalog.json'
import { BOARDS, boardOfLayout, eligibleLayouts, pickBattlefield, scaleLayout48 } from '../../src/data/battlefields'
import { checkRefs, loadBundle, type TypedRecord } from '../../src/data/index'
import { createGame, query } from '../../src/engine/index'
import { scenarioAnchorProblems } from '../../src/engine/scenario'
import { distToShape, worldShape, type WorldShape } from '../../src/engine/terrain'
import type { TerrainInstance, Vec2 } from '../../src/engine/types'
import { validateAll } from '../../tools/validate-data'

type Any = Record<string, any>
const bundle = loadBundle()
const rec = (id: string): Any => bundle.byId[id] as unknown as Any
const layoutIds = BOARDS.flatMap((b) => rec(b).layouts as string[])

const ngon = (r: number): Vec2[] => Array.from({ length: 48 }, (_, k) => ({ x: r * Math.cos((k * Math.PI) / 24), z: r * Math.sin((k * Math.PI) / 24) }))
function shapeOf(p: Any): WorldShape {
  const piece = rec(p.terrain)
  const fp = 'circle' in piece.footprint ? { polygon: ngon(piece.footprint.circle.r) } : piece.footprint
  const t: TerrainInstance = { id: p.id, pieceId: p.terrain, rulesType: piece.rulesType, pos: p.pos, rot: p.rot ?? 0, footprint: fp, height: piece.height, props: {} }
  return worldShape(t)
}
const pts = (s: WorldShape): Vec2[] => (s.kind === 'poly' ? s.pts : [])
const gapBetween = (a: WorldShape, b: WorldShape): number => Math.min(...pts(a).map((v) => distToShape(v, b)), ...pts(b).map((v) => distToShape(v, a)))
const impassable = (p: Any): boolean => ['building', 'obstruction'].includes(rec(p.terrain).rulesType)
const zExtent = (s: WorldShape): number => Math.max(...pts(s).map((v) => Math.abs(v.z)))
const xExtent = (s: WorldShape): number => Math.max(...pts(s).map((v) => Math.abs(v.x)))
// every footprint is centrally symmetric (rect, circle, 12-gon, octagon), so a half turn and no turn look the same: the S1 walls w1/w2 keep rot 0
const rotIsHalfTurn = (a: number, b: number, same: boolean): boolean => {
  const d = (((b - a - (same ? 0 : Math.PI)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  return d < 1e-6 || 2 * Math.PI - d < 1e-6
}

describe('TER terrain boards: data', () => {
  it('TER-101 every catalog entry is a data piece (id, type, footprint, height, mesh); 37 pieces; all boards complete', () => {
    expect(catalog).toHaveLength(37)
    for (const c of catalog as Any[]) {
      const p = rec(c.pieceId)
      expect(p, c.pieceId).toBeDefined()
      expect(p).toMatchObject({ rulesType: c.rulesType, footprint: c.footprint, height: c.height, mesh: c.slug })
    }
    for (const b of BOARDS) {
      expect(rec(b).pieces).toEqual((catalog as Any[]).filter((c) => `board.${c.board}` === b).map((c) => c.pieceId))
      expect(rec(b).layouts).toHaveLength(3)
    }
    expect(validateAll().errors).toEqual([])
  })

  it('TER-102 an obstacle at 1" or taller, or an obstruction/building under 1", is rejected; every shipped piece passes', () => {
    const mk = (id: string, rulesType: string, height: number): TypedRecord => ({ id, recordType: 'terrain', rulesType, height, footprint: { rect: { w: 1, d: 1 } } }) as unknown as TypedRecord
    const byId = (...r: TypedRecord[]) => Object.fromEntries(r.map((x) => [x.id, x]))
    expect(checkRefs(byId(mk('t.a', 'obstacle', 1)))).toHaveLength(1)
    expect(checkRefs(byId(mk('t.b', 'obstacle', 0.99)))).toEqual([])
    expect(checkRefs(byId(mk('t.c', 'obstruction', 0.9)))).toHaveLength(1)
    expect(checkRefs(byId(mk('t.d', 'building', 1)))).toEqual([])
    for (const r of Object.values(bundle.byId)) {
      const o = r as unknown as Any
      if (o.recordType !== 'terrain') continue
      if (o.rulesType === 'obstacle') expect(o.height, o.id).toBeLessThan(1)
      if (o.rulesType === 'obstruction' || o.rulesType === 'building') expect(o.height, o.id).toBeGreaterThanOrEqual(1)
    }
  })

  it('TER-103 every layout is point-symmetric: a twin at (-x, -z, rot + 180) or a centre piece', () => {
    expect(layoutIds).toHaveLength(15)
    for (const id of layoutIds) {
      const pcs = rec(id).pieces as Any[]
      expect(pcs.length, id).toBeGreaterThanOrEqual(5)
      expect(pcs.length, id).toBeLessThanOrEqual(8)
      for (const p of pcs) {
        const centre = Math.abs(p.pos.x) < 1e-9 && Math.abs(p.pos.z) < 1e-9
        const found = pcs.some((q) => q !== p && q.terrain === p.terrain && Math.abs(q.pos.x + p.pos.x) < 1e-9 && Math.abs(q.pos.z + p.pos.z) < 1e-9 && (rotIsHalfTurn(p.rot ?? 0, q.rot ?? 0, false) || (p.id.startsWith('w') && rotIsHalfTurn(p.rot ?? 0, q.rot ?? 0, true))))
        expect(centre || found, `${id} ${p.id}`).toBe(true)
      }
    }
  })

  it('TER-104 every layout: gaps >= 3", |x| <= 15, |z| <= 11, impassable |z| <= 8 (exact polygons)', () => {
    for (const id of layoutIds) {
      const pcs = rec(id).pieces as Any[]
      const shapes = pcs.map((p) => shapeOf(p))
      for (let i = 0; i < pcs.length; i++) {
        expect(xExtent(shapes[i]!), `${id} ${pcs[i].id} x`).toBeLessThanOrEqual(15 + 1e-6)
        expect(zExtent(shapes[i]!), `${id} ${pcs[i].id} z`).toBeLessThanOrEqual(11 + 1e-6)
        if (impassable(pcs[i])) expect(zExtent(shapes[i]!), `${id} ${pcs[i].id} impassable z`).toBeLessThanOrEqual(8 + 1e-6)
        for (let j = i + 1; j < pcs.length; j++) expect(gapBetween(shapes[i]!, shapes[j]!), `${id} ${pcs[i].id}-${pcs[j].id}`).toBeGreaterThanOrEqual(3 - 1e-6)
      }
    }
  })

  it('TER-105 every layout carries the Ashwall anchors, and control matches layout.ashwall-divide for the same models', () => {
    for (const id of layoutIds) {
      expect(scenarioAnchorProblems(bundle, 'scn-ashwall-divide', id), id).toEqual([])
      const w = (rec(id).pieces as Any[]).filter((p) => p.id === 'w1' || p.id === 'w2')
      expect(w.map((p) => [p.pos.x, p.pos.z, p.rot ?? 0])).toEqual([[-6, -4, 0], [6, 4, 0]])
      expect(rec(w[0].terrain)).toMatchObject({ rulesType: 'obstacle', footprint: { rect: { w: 4, d: 0.75 } }, height: 0.75 })
    }
    const mkGame = (layout?: string) => createGame({ scenario: 'scn-ashwall-divide', lists: { A: 'kha.l.qs-recon', B: 'cyg.l.qs-recon' }, layout }, 'ctl', bundle).state
    const base = mkGame()
    let seed = 12345
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
    const ids = Object.keys(base.models)
    for (const lid of ['layout.bog-1', 'layout.outpost-3', 'layout.village-2']) {
      const other = mkGame(lid)
      for (let k = 0; k < 6; k++) {
        const wall = k % 2 ? { x: 6, z: 4 } : { x: -6, z: -4 }
        const pos: Record<string, Vec2> = {}
        for (const m of ids) pos[m] = { x: wall.x + (rnd() - 0.5) * 8, z: wall.z + (rnd() - 0.5) * 8 }
        const put = (s: typeof base) => ({ ...s, models: Object.fromEntries(Object.entries(s.models).map(([mid, m]) => [mid, { ...m, pos: pos[mid]! }])) })
        expect(query.control(put(other)).elements).toEqual(query.control(put(base)).elements)
      }
    }
  })

  it('TER-106 48" scale-up keeps symmetry, gaps >= 3", impassable |z| <= 10.67 and all |z| <= 16', () => {
    for (const id of layoutIds) {
      const big = scaleLayout48(rec(id) as never)
      expect(big.table).toEqual({ w: 48, d: 48 })
      const pcs = big.pieces as Any[]
      const shapes = pcs.map((p) => shapeOf(p))
      for (let i = 0; i < pcs.length; i++) {
        const centre = Math.abs(pcs[i].pos.x) < 1e-9 && Math.abs(pcs[i].pos.z) < 1e-9
        const twin = pcs.some((q, j) => j !== i && q.terrain === pcs[i].terrain && Math.abs(q.pos.x + pcs[i].pos.x) < 1e-9 && Math.abs(q.pos.z + pcs[i].pos.z) < 1e-9)
        expect(centre || twin, `${id} ${pcs[i].id}`).toBe(true)
        expect(zExtent(shapes[i]!)).toBeLessThanOrEqual(16)
        if (impassable(pcs[i])) expect(zExtent(shapes[i]!)).toBeLessThanOrEqual(10.67 + 1e-2)
        for (let j = i + 1; j < pcs.length; j++) expect(gapBetween(shapes[i]!, shapes[j]!), id).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('TER-107 pickBattlefield is deterministic, spreads over every board and layout, and honours a board choice', () => {
    expect(pickBattlefield('s42', 'scn-ashwall-divide', 'random')).toEqual(pickBattlefield('s42', 'scn-ashwall-divide', 'random'))
    const boards: Record<string, number> = {}
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      const r = pickBattlefield(`s${i}`, 'scn-ashwall-divide', 'random')
      boards[r.board] = (boards[r.board] ?? 0) + 1
      seen.add(r.layoutId)
      expect(boardOfLayout(r.layoutId)).toBe(r.board)
    }
    for (const b of BOARDS) { expect(boards[b]).toBeGreaterThanOrEqual(150); expect(boards[b]).toBeLessThanOrEqual(250) }
    expect(seen.size).toBe(15)
    expect(pickBattlefield('s1', 'scn-ashwall-divide', 'village').board).toBe('board.village')
    expect(pickBattlefield('s1', 'scn-ashwall-divide', 'board.outpost').board).toBe('board.outpost')
    expect(pickBattlefield('s1', 'scn-ashwall-divide', 'nonsense')).toEqual(pickBattlefield('s1', 'scn-ashwall-divide', undefined))
  })

  it('TER-109 the fixed-layout Quick Start demo always gets layout.ashwall-divide, whatever the board', () => {
    for (let i = 0; i < 20; i++) expect(pickBattlefield(`q${i}`, 'scn-qs-demo', i % 2 ? 'random' : BOARDS[i % 5]).layoutId).toBe('layout.ashwall-divide')
  })

  it('TER-111 a layout without the scenario anchors is rejected by createGame and never offered by selection', () => {
    const broken = { ...rec('layout.bog-1'), id: 'layout.broken', pieces: (rec('layout.bog-1').pieces as Any[]).filter((p) => p.id !== 'w1') }
    const b2 = { ...bundle, byId: { ...bundle.byId, 'layout.broken': { ...broken, recordType: 'terrain-layout' } as never } }
    const r = createGame({ scenario: 'scn-ashwall-divide', lists: { A: 'kha.l.qs-recon', B: 'cyg.l.qs-recon' }, layout: 'layout.broken' }, 's', b2)
    expect(r.rejection?.code).toBe('E_BAD_SETUP')
    for (const b of BOARDS) expect(eligibleLayouts(bundle, b, 'scn-ashwall-divide')).toHaveLength(3)
    expect(scenarioAnchorProblems(b2, 'scn-ashwall-divide', 'layout.broken').length).toBeGreaterThan(0)
  })
})
