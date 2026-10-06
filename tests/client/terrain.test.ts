// M8 terrain client: GLB fitting, piece -> slug map, board table, battlefield pick, tooltip text, start options.
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { Shape, TerrainInstance } from '../../src/engine/index'
import { BOARDS, boardFor, boardFromUrl, mergeBoardsJson, parseBoardChoice } from '../../src/client/board/boards'
import { boardForLoad, boardFromSeed, pickBattlefield } from '../../src/client/board/boardPick'
import { getBoardId, useBoardStore } from '../../src/client/board/boardStore'
import { fitWithinFootprint, idVariant, localBounds, looksSameAfterHalfTurn, planFit, simpleTurns } from '../../src/client/board/terrainFit'
import { terrainInfo } from '../../src/client/board/terrainInfo'
import { PIECE_MODELS, modelFor } from '../../src/client/board/terrainModels'
import { buildNewGame, battlefieldChoices } from '../../src/client/ui/start/startOptions'
import { exportSave, importSave, newGame, resetGameStore, useGameStore } from '../../src/client/store/gameStore'
import { memoryStorage, setStorage } from '../../src/client/store/storage'
import { useSettingsStore } from '../../src/client/store/settingsStore'
import { setupFromUrl } from '../../src/client/store/testHooks'

const catalog = JSON.parse(readFileSync('tools/terrain-catalog.json', 'utf8')) as { slug: string; pieceId: string; footprint: Shape; visualHeight: number }[]
const rect = (w: number, d: number): Shape => ({ rect: { w, d } })
const inst = (over: Partial<TerrainInstance>): TerrainInstance => ({ id: 't', pieceId: 'terrain.x', rulesType: 'obstacle', pos: { x: 0, z: 0 }, rot: 0, footprint: rect(4, 0.75), height: 0.75, props: {}, ...over })

beforeEach(() => { setStorage(memoryStorage()); resetGameStore(); useBoardStore.setState({ boards: BOARDS }) })

describe('terrain GLB fitting', () => {
  it('bounds of rect, circle and polygon', () => {
    expect(localBounds(rect(4, 2))).toMatchObject({ w: 4, d: 2, cx: 0, cz: 0 })
    expect(localBounds({ circle: { r: 1.5 } })).toMatchObject({ w: 3, d: 3 })
    expect(localBounds({ polygon: [{ x: 1, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 2 }, { x: 1, z: 2 }] })).toMatchObject({ w: 4, d: 2, cx: 3, cz: 1 })
  })

  it('turns a quarter when the long sides disagree, never for circles', () => {
    const b = localBounds(rect(4, 1))
    expect(simpleTurns([2, 1, 0.5], b)).toBe(0)
    expect(simpleTurns([0.5, 1, 2], b)).toBe(1)
    expect(simpleTurns([0.5, 1, 2], localBounds({ circle: { r: 1 } }), { circle: { r: 1 } })).toBe(0)
  })

  it('idVariant uses trailing digits so twins differ', () => {
    expect(idVariant('w1')).toBe(1)
    expect(idVariant('w2')).toBe(2)
    expect(idVariant('terrain.x#f12a')).toBe(12)
  })

  it('squashed factors fall back to the smaller uniform scale and the model stays inside the footprint', () => {
    const fp: Shape = { polygon: [{ x: 3, z: 0 }, { x: 0, z: 2.25 }, { x: -3, z: 0 }, { x: 0, z: -2.25 }] }
    const plan = planFit('f1', fp, 0, 5, [2, 3, 2])
    expect(plan.sx).toBe(plan.sz)
    expect(plan.sx).toBeCloseTo(2.25, 5)
    expect(plan.size[1]).toBeCloseTo(5, 5)
    expect(fitWithinFootprint(plan, fp, 5)).toBe(true)
    const near = planFit('w1', rect(4, 0.75), 0, 0.9, [4.2, 1, 0.8])
    expect(near.sx).toBeCloseTo(4 / 4.2, 5)
    expect(near.sz).toBeCloseTo(0.75 / 0.8, 5)
  })

  it('scales y to the visual height and turns a long-side-z model', () => {
    const p = planFit('t', rect(5, 1), 0, 2, [1, 4, 6])
    expect(p.turns).toBe(1)
    expect(p.size[0]).toBeLessThanOrEqual(5 * 1.05)
    expect(p.size[2]).toBeLessThanOrEqual(1 * 1.05)
    expect(p.sy).toBeCloseTo(0.5, 5)
  })

  it('twins never end up facing the same way (flip parity follows the id and the rotation)', () => {
    const yaw = (id: string, rot: number) => (Math.round(rot / Math.PI) + (planFit(id, rect(4, 0.75), rot, 1, [4, 1, 0.75]).flip ? 1 : 0)) % 2
    expect(yaw('w1', 0)).not.toBe(yaw('w2', 0))
    expect(yaw('f1', 0)).not.toBe(yaw('f2', Math.PI))
  })

  it('does not flip footprints that look different after a half turn', () => {
    const tri: Shape = { polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 2 }] }
    expect(looksSameAfterHalfTurn(tri)).toBe(false)
    expect(planFit('t2', tri, 0, 1, [4, 1, 2]).flip).toBe(false)
  })

  it('TER-121: every catalog footprint takes a model of its own proportions', () => {
    for (const p of catalog) {
      const b = localBounds(p.footprint)
      const plan = planFit(p.slug, p.footprint, 0, p.visualHeight, [b.w, p.visualHeight, b.d])
      expect(fitWithinFootprint(plan, p.footprint, p.visualHeight), p.slug).toBe(true)
    }
  })
})

describe('piece to slug map', () => {
  it('covers exactly the catalog pieces with the catalog slugs and visual heights', () => {
    expect(Object.keys(PIECE_MODELS).length).toBe(catalog.length)
    for (const p of catalog) expect(PIECE_MODELS[p.pieceId], p.pieceId).toEqual([p.slug, p.visualHeight])
  })

  it('generic wall and pond follow the board reskin; ruins keep a procedural pond', () => {
    const [bog, ruins, village, wasteland, outpost] = BOARDS
    expect(modelFor('terrain.low-wall', bog!)?.slug).toBe('wt-bog-log-barrier')
    expect(modelFor('terrain.low-wall', ruins!)?.slug).toBe('wt-ruins-colonnade')
    expect(modelFor('terrain.pond', village!)?.slug).toBe('wt-village-pond')
    expect(modelFor('terrain.pond', wasteland!)?.slug).toBe('wt-wasteland-ash-flats')
    expect(modelFor('terrain.pond', outpost!)?.slug).toBe('wt-outpost-frozen-pond')
    expect(modelFor('terrain.pond', ruins!)).toBeNull()
    expect(modelFor('terrain.unknown', bog!)).toBeNull()
  })

  it('reskin slugs are catalog slugs and pond reskins stay flat', () => {
    const slugs = new Set(catalog.map((p) => p.slug))
    for (const b of BOARDS) {
      expect(slugs.has(b.reskin.wall), b.id).toBe(true)
      if (b.reskin.pond) { expect(slugs.has(b.reskin.pond), b.id).toBe(true); expect(modelFor('terrain.pond', b)!.visualHeight).toBeLessThanOrEqual(0.4) }
    }
  })
})

describe('boards and battlefield pick', () => {
  it('five boards with the section C names and ids', () => {
    expect(BOARDS.map((b) => b.name)).toEqual(['Hollowmere Bog', 'Veilstone Ruins', 'Ironpine Hamlet', 'Cinder Blight', 'Frostline Outpost'])
    expect(boardFor('bog')?.id).toBe('board.bog')
    expect(boardFor('board.outpost')?.short).toBe('outpost')
    expect(boardFor('nope')).toBeUndefined()
    expect(parseBoardChoice('wasteland')).toEqual({ choice: 'board.wasteland', known: true })
    expect(parseBoardChoice('zzz')).toEqual({ choice: 'random', known: false })
    expect(battlefieldChoices().map((c) => c.id)).toEqual(['random', ...BOARDS.map((b) => b.id)])
  })

  it('?board= reads short names and ids; unknown means random', () => {
    expect(boardFromUrl('?board=ruins')).toBe('board.ruins')
    expect(boardFromUrl('?board=random')).toBe('random')
    expect(boardFromUrl('?board=bogus')).toBe('random')
    expect(boardFromUrl('?x=1')).toBeUndefined()
  })

  it('the seed picks a board deterministically and the choice beats the seed', () => {
    expect(boardFromSeed('abc')).toBe(boardFromSeed('abc'))
    const seen = new Set(Array.from({ length: 60 }, (_, i) => boardFromSeed(`s${i}`)))
    expect(seen.size).toBe(5)
    expect(pickBattlefield({ seed: 'abc', scenario: 'scn-ashwall-divide', board: 'board.village' }).board).toBe('board.village')
    expect(pickBattlefield({ seed: 'abc', scenario: 'scn-ashwall-divide', board: 'random' }).board).toBe(boardFromSeed('abc'))
  })

  it('a loaded save finds its board: saved, then layout id, then the seed', () => {
    expect(boardForLoad('board.bog', 'layout.ruins-1', 's')).toBe('board.bog')
    expect(boardForLoad(undefined, 'layout.outpost-2', 's')).toBe('board.outpost')
    expect(boardForLoad(undefined, undefined, 's')).toBe(boardFromSeed('s'))
  })

  it('boards.json overrides fields and ignores junk', () => {
    const merged = mergeBoardsJson({ boards: [{ id: 'board.bog', light: { fogNear: 20, key: '#ffffff' }, fallbackColor: '#101010', junk: 4 }, { id: 'board.nope' }] })
    expect(merged[0]!.light.fogNear).toBe(20)
    expect(merged[0]!.light.key).toBe('#ffffff')
    expect(merged[0]!.light.fogFar).toBe(BOARDS[0]!.light.fogFar)
    expect(merged[0]!.fallback.ground).toBe('#101010')
    expect(merged[1]).toEqual(BOARDS[1])
    expect(mergeBoardsJson('garbage')).toEqual([...BOARDS])
  })
})

describe('game and board', () => {
  const lists = { A: 'kha.l.qs-recon', B: 'cyg.l.qs-recon' }
  it('newGame picks the board from the seed, honours a choice, and saves it', () => {
    expect(newGame({ scenario: 'scn-ashwall-divide', lists, seed: 'bd-1' })).toBeNull()
    expect(getBoardId()).toBe(boardFromSeed('bd-1'))
    expect(newGame({ scenario: 'scn-ashwall-divide', lists, seed: 'bd-1', board: 'board.wasteland' })).toBeNull()
    expect(getBoardId()).toBe('board.wasteland')
    const save = exportSave('t')!
    expect(save.board).toBe('board.wasteland')
    newGame({ scenario: 'scn-ashwall-divide', lists, seed: 'bd-1', board: 'board.bog' })
    expect(importSave(save)).toBeNull()
    expect(getBoardId()).toBe('board.wasteland')
    expect(useGameStore.getState().state?.seed).toBe('bd-1')
  })

  it('buildNewGame carries the board choice and always a seed; ?seed= stays repeatable', () => {
    const o = buildNewGame({ listId: 'kha.l.qs-recon', scenario: 'scn-ashwall-divide', board: 'board.ruins' })!
    expect(o.board).toBe('board.ruins')
    expect(typeof o.seed).toBe('string')
    expect(buildNewGame({ listId: 'kha.l.qs-recon', scenario: 'scn-ashwall-divide', seed: 'x' })!.seed).toBe('x')
    expect(buildNewGame({ listId: 'kha.l.qs-recon', scenario: 'scn-ashwall-divide' })!.board).toBe('random')
  })

  it('the URL fast-setup reads ?board=', () => {
    expect(setupFromUrl('?scenario=scn-ashwall-divide&lists=kha,cyg&board=outpost')?.board).toBe('board.outpost')
  })

  it('settings remember the battlefield choice and the zones toggle', () => {
    useSettingsStore.getState().set({ battlefield: 'board.bog', showZones: true })
    useSettingsStore.getState().reload()
    expect(useSettingsStore.getState().battlefield).toBe('board.bog')
    expect(useSettingsStore.getState().showZones).toBe(true)
  })
})

describe('terrain tooltip text', () => {
  it('says the right thing for each rules type', () => {
    expect(terrainInfo(inst({ rulesType: 'obstacle' })).lines.join(' ')).toMatch(/cover \(\+4/)
    expect(terrainInfo(inst({ rulesType: 'obstacle', props: { concealment: true } })).lines.join(' ')).toMatch(/concealment \(\+2/)
    expect(terrainInfo(inst({ rulesType: 'building' })).kind).toBe('Building')
    expect(terrainInfo(inst({ rulesType: 'obstruction' })).lines.join(' ')).toMatch(/Impassable/)
    expect(terrainInfo(inst({ rulesType: 'forest' })).lines.join(' ')).toMatch(/concealment/)
    expect(terrainInfo(inst({ rulesType: 'rubble' })).lines.join(' ')).toMatch(/cover/)
    expect(terrainInfo(inst({ rulesType: 'shallowWater' })).lines.join(' ')).toMatch(/Rough ground/)
    expect(terrainInfo(inst({ rulesType: 'hill', height: 1 })).lines.join(' ')).toMatch(/1" higher/)
    expect(terrainInfo(inst({ rulesType: 'hazard' })).lines.join(' ')).toMatch(/not yet active/)
    expect(terrainInfo(inst({ rulesType: 'hazard', props: { hazard: {} } })).lines.join(' ')).toMatch(/risks damage/)
    expect(terrainInfo(inst({ rulesType: 'scenarioTerrain', props: { baseType: 'obstacle' } })).lines.join(' ')).toMatch(/Scenario terrain/)
  })
})
