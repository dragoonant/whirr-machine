// 90-skirmish E: derived 48" layouts (SKM-006), the Copperline Crossing data (S3), TER-110 objective clearance, and the sim size helpers.
import { describe, expect, it } from 'vitest'
import { BOARDS, boardOfLayout, droppedPieces, eligibleLayouts, pickBattlefield } from '../../src/data/battlefields'
import { derivedLayouts, loadBundle, type TypedRecord } from '../../src/data/index'
import { isLayout48Id, layout48Id, layout48Source, scaleLayout48 } from '../../src/data/layout48'
import { createGame } from '../../src/engine/index'
import { scenarioAnchorProblems } from '../../src/engine/scenario'
import type { DataBundle } from '../../src/engine/types'
import { objectiveClearanceProblems, objectiveClearances } from '../../tools/validate-data'
import { resolveList, sizeProblem } from '../../tools/sim'

type Any = Record<string, any>
const bundle = loadBundle()
const rec = (id: string): Any => bundle.byId[id] as unknown as Any
const S3 = 'scn-copperline-crossing'
const boardLayouts = BOARDS.flatMap((b) => rec(b).layouts as string[])

describe('SKM skirmish scenario data', () => {
  it('SKM-006 every board layout has a <layout>-48 record in the bundle equal to scaleLayout48 of its source', () => {
    expect(boardLayouts).toHaveLength(15)
    for (const id of boardLayouts) {
      const twin = rec(layout48Id(id))
      expect(twin, id).toBeDefined()
      const { recordType, ...plain } = twin
      expect(recordType).toBe('terrain-layout')
      expect(plain).toEqual(scaleLayout48(rec(id) as never))
      expect(plain.table).toEqual({ w: 48, d: 48 })
      expect(plain.pieces).toHaveLength(rec(id).pieces.length)
      expect(layout48Source(twin.id)).toBe(id)
      expect(boardOfLayout(twin.id)).toBe(boardOfLayout(id))
    }
    // only the board layouts get a twin: the scenario-owned Ashwall Divide stays 36", the board records still list 36" ids
    expect(Object.keys(bundle.byId).filter(isLayout48Id)).toHaveLength(15)
    expect(bundle.byId['layout.ashwall-divide-48']).toBeUndefined()
    for (const b of BOARDS) for (const l of rec(b).layouts as string[]) expect(isLayout48Id(l)).toBe(false)
    // derivedLayouts is the pure source of those records and never re-derives a twin
    const raw = Object.fromEntries(Object.entries(bundle.byId).filter(([k]) => !isLayout48Id(k)))
    expect(Object.keys(derivedLayouts(raw as Record<string, TypedRecord>)).sort()).toEqual(boardLayouts.map(layout48Id).sort())
    expect(derivedLayouts(bundle.byId as Record<string, TypedRecord>)).toEqual({})
  })

  it('S3 data matches the spec: skirmish only, 48", 6/11 deployment, scoring from the second player\'s round 2, Kill Box, four objectives', () => {
    const sc = rec(S3)
    expect(sc).toMatchObject({
      id: S3, levels: ['skirmish'], table: { w: 48, d: 48 }, rounds: 7, terrainLayout: 'layout.village-2-48',
      deployment: { first: 6, second: 11, advance: 3, unitSpread: 3 },
      scoring: { fromRound: 2, fromPlayer: 'second', winMargin: 3, winOnOpponentTurnOnly: true, leaderPresence: 10 },
      killBox: { fromRound: 2, fromPlayer: 'first', depth: 12, vp: 2 },
    })
    expect((sc.elements as Any[]).map((e) => [e.id, e.kind, e.pos.x, e.pos.z])).toEqual([
      ['el-50-w', 'objective50', -10, -3], ['el-50-e', 'objective50', 10, 3], ['el-40-w', 'objective40', -10, 3], ['el-40-e', 'objective40', 10, -3],
    ])
    expect(sc.text).not.toMatch(/\bSteamforged\b/i)
    // recon scenarios are untouched by the new size
    expect(rec('scn-ashwall-divide').levels).toEqual(['recon'])
    expect(rec('scn-qs-demo').levels).toEqual(['recon'])
  })

  it('TER-110 S3 objectives clear every impassable footprint by >= 1" and overlap no other footprint in all 15 scaled layouts', () => {
    const rows = objectiveClearances(bundle.byId as Record<string, TypedRecord>).filter((r) => r.scenario === S3)
    expect(new Set(rows.map((r) => r.layout)).size).toBe(15)
    expect(new Set(rows.map((r) => r.element)).size).toBe(4)
    expect(objectiveClearanceProblems(bundle.byId as Record<string, TypedRecord>)).toEqual([])
    const impassable = rows.filter((r) => r.impassable)
    expect(impassable.length).toBeGreaterThan(0)
    expect(Math.min(...impassable.map((r) => r.gap))).toBeGreaterThanOrEqual(1)
    expect(Math.min(...rows.map((r) => r.gap))).toBeGreaterThan(0)
  })

  it('TER-110 the check catches an objective sitting on a building or against a wall', () => {
    const lay = rec('layout.outpost-3-48')
    const wall = (lay.pieces as Any[]).find((p) => ['building', 'obstruction'].includes(rec(p.terrain).rulesType))!
    const bad = { ...bundle.byId, 'scn-bad': { ...rec(S3), id: 'scn-bad', terrainLayout: 'layout.outpost-3-48', elements: [{ ...(rec(S3).elements as Any[])[0], pos: { ...wall.pos } }] } } as unknown as Record<string, TypedRecord>
    const problems = objectiveClearanceProblems(bad)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join('\n')).toMatch(/needs 1"/)
    // 1" clear is fine, 0.5" is not: an objective 50 mm base at distance d from a rect piece's edge
    const rows = objectiveClearances(bad).filter((r) => r.scenario === 'scn-bad' && r.impassable)
    expect(rows.some((r) => r.gap === 0)).toBe(true)
  })

  it('E3 eligibleLayouts and pickBattlefield give the -48 twins for a 48" scenario and the 36" ids otherwise', () => {
    for (const b of BOARDS) {
      expect(eligibleLayouts(bundle, b, S3)).toEqual((rec(b).layouts as string[]).map(layout48Id))
      expect(eligibleLayouts(bundle, b, 'scn-ashwall-divide')).toHaveLength(3)
      for (const l of eligibleLayouts(bundle, b, S3)) expect(scenarioAnchorProblems(bundle, S3, l)).toEqual([])
    }
    const seen = new Set<string>()
    const boards = new Set<string>()
    for (let i = 0; i < 60; i++) {
      const pick = pickBattlefield(`s${i}`, S3)
      expect(pick).toEqual(pickBattlefield(`s${i}`, S3))
      expect(isLayout48Id(pick.layoutId)).toBe(true)
      expect(boardOfLayout(pick.layoutId)).toBe(pick.board)
      seen.add(pick.layoutId)
      boards.add(pick.board)
    }
    expect(seen.size).toBeGreaterThan(8)
    expect(boards.size).toBe(5)
    expect(pickBattlefield('s1', S3, 'bog').board).toBe('board.bog')
    expect(pickBattlefield('s1', 'scn-ashwall-divide', 'bog').layoutId.endsWith('-48')).toBe(false)
  })

  it('S3 starts a game on every one of the 15 scaled layouts (and a 36" layout is refused)', () => {
    const entries = [{ profile: 'cyg.deuce' }, { profile: 'kha.razor' }, { profile: 'cyg.falk' }, { profile: 'cyg.black13', size: 3 }]
    const byId = { ...bundle.byId } as Record<string, any>
    for (const id of ['t.a', 't.b']) byId[`${id}`] = { id, name: id, recordType: 'list', faction: 'cyg', leader: 'cyg.caine', level: 'skirmish', entries }
    const B: DataBundle = { ...bundle, byId }
    for (const id of boardLayouts.map(layout48Id)) {
      const r = createGame({ scenario: S3, lists: { A: 't.a', B: 't.b' }, layout: id }, 'lay', B)
      expect(r.rejection, id).toBeUndefined()
      expect(r.state.terrain.length).toBe(rec(id).pieces.length - droppedPieces(bundle, S3, id).length) // setup drops the impassable pieces near an objective
      expect(r.state.scenario.table).toEqual({ w: 48, d: 48 })
    }
    const bad = createGame({ scenario: S3, lists: { A: 't.a', B: 't.b' }, layout: boardLayouts[0]! }, 'lay', B)
    expect(bad.rejection?.code).toBe('E_BAD_SETUP')
    expect(bad.rejection?.message).toMatch(/does not match/)
  })

  it('E6 the sim and bench size helpers resolve faction ids and refuse a missing list, a wrong size or a wrong scenario', () => {
    expect(resolveList('trl', 'skirmish')).toBe('trl.l.skirmish')
    expect(resolveList('cry', 'recon')).toBe('cry.l.necro-recon')
    expect(resolveList('men.l.skirmish', 'recon')).toBe('men.l.skirmish')
    expect(sizeProblem(bundle, 'recon', 'scn-ashwall-divide', ['kha.l.qs-recon', 'cyg.l.qs-recon'])).toBeNull()
    expect(sizeProblem(bundle, 'recon', S3, ['kha.l.qs-recon', 'cyg.l.qs-recon'])).toMatch(/not played at recon/)
    expect(sizeProblem(bundle, 'skirmish', S3, ['kha.l.qs-recon'])).toMatch(/is a recon list, not skirmish/)
    expect(sizeProblem(bundle, 'skirmish', S3, ['zzz.l.skirmish'])).toMatch(/does not exist/)
    expect(sizeProblem(bundle, 'skirmish', 'scn-nope', [])).toMatch(/does not exist/)
  })
})
