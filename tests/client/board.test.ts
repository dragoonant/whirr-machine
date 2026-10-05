// Board agent (50 sections 4, 5, 9, 10): layout helpers, figure kit, per-decision controllers. Headless: no canvas.
import { beforeEach, describe, expect, it } from 'vitest'
import type { GameState, TerrainInstance } from '../../src/engine/index'
import { newGame, resetGameStore, useGameStore, setController } from '../../src/client/store/gameStore'
import { memoryStorage, setStorage } from '../../src/client/store/storage'
import { useSettingsStore } from '../../src/client/store/settingsStore'
import { setDirectorClock, setPaused } from '../../src/client/presentation/director'
import { createBotDriver } from '../../src/client/bot/botDriver'
import { uiActions, queryThreat } from '../../src/client/contract'
import { useUiStore } from '../../src/client/store/uiStore'
import {
  CAMERA_TRANSITION_MS, cameraPose, controllerColour, elementViews, losReasonText, moveReasonText, proxyAttrs, SIDE_COLOURS,
  terrainDrawHeight, terrainOutlines, terrainStyle, threatRings, zoneViews,
} from '../../src/client/board/layout'
import { archetypeOf, damageFraction, meshHeight } from '../../src/client/figures/kit'
import {
  activationOption, commitStaged, defaultStraightPath, handleGroundClick, handleModelClick, placementIds, TARGET_KINDS,
} from '../../src/client/interaction/controller'
import { onBoardKey } from '../../src/client/interaction/keys'
import { interactionActions, useInteractionStore } from '../../src/client/interaction/store'

const ASH = { scenario: 'scn-ashwall-divide', lists: { A: 'kha.l.qs-recon', B: 'cyg.l.qs-recon' } }
const st = (): GameState => useGameStore.getState().state!

beforeEach(() => {
  setStorage(memoryStorage())
  setDirectorClock(null)
  useSettingsStore.getState().set({ speed: 0 })
  setPaused(false)
  resetGameStore()
  interactionActions.reset()
  uiActions.setMode('select')
})

/** Let bots play until `pred` holds, then hand both sides to the human. */
function playUntil(pred: (s: GameState) => boolean): void {
  newGame({ ...ASH, controllers: { A: 'bot', B: 'bot' }, seed: 'board-1' })
  const d = createBotDriver({ thinkMs: 0 })
  for (let i = 0; i < 4000 && !pred(st()); i++) d.tick()
  expect(pred(st())).toBe(true)
  setController('A', 'human'); setController('B', 'human')
}

describe('board layout: terrain, zones, elements', () => {
  it('BRD-001 every terrain piece is semi-transparent and low enough not to hide a figure', () => {
    newGame({ ...ASH, controllers: { A: 'human', B: 'human' }, seed: 'board-t' })
    const s = st()
    expect(s.terrain.length).toBeGreaterThan(0)
    for (const o of terrainOutlines(s.terrain)) {
      expect(o.style.opacity).toBeLessThan(1)
      expect(o.height).toBeLessThanOrEqual(o.style.maxHeight + 1e-9)
    }
    const tall = { rulesType: 'building', height: 12 } as TerrainInstance
    expect(terrainDrawHeight(tall)).toBeLessThanOrEqual(terrainStyle(tall).maxHeight)
  })

  it('BRD-002 the 36x36 Recon table comes from the engine state', () => {
    newGame({ ...ASH, controllers: { A: 'human', B: 'human' }, seed: 'board-tb' })
    expect(st().scenario.table).toEqual({ w: 36, d: 36 })
  })

  it('BRD-003 zones appear once edges are chosen; elements carry the engine controller colour', () => {
    newGame({ ...ASH, controllers: { A: 'human', B: 'human' }, seed: 'board-z' })
    expect(zoneViews(st())).toEqual([])
    playUntil((s) => s.phase === 'deploy' && !!s.players.A.edge && !!s.players.B.edge && !!s.firstPlayer)
    const zones = zoneViews(st())
    expect(zones.map((z) => z.player).sort()).toEqual(['A', 'B'])
    for (const z of zones) expect(z.rect.x1).toBeGreaterThan(z.rect.x0)
    const els = elementViews(st())
    expect(els.length).toBeGreaterThan(0)
    for (const e of els) expect(e.colour).toBe(controllerColour(st().scenario.elements[e.def.id]))
    expect(controllerColour({ controller: 'A', contested: false, holders: [], contesters: [], reason: '' })).toBe(SIDE_COLOURS.A.ring)
    expect(controllerColour({ controller: 'A', contested: true, holders: [], contesters: [], reason: '' })).not.toBe(SIDE_COLOURS.A.ring)
  })

  it('BRD-004 threat rings are the engine radii plus the base radius, in engine order', () => {
    playUntil((s) => s.phase === 'activation')
    const m = Object.values(st().models).find((x) => x.type === 'leader' && !x.offTable)!
    const t = queryThreat(m.id)!
    const rings = threatRings(m, t)
    const adv = rings.find((r) => r.key === 'advance')!, ch = rings.find((r) => r.key === 'charge')!
    expect(ch.radius - adv.radius).toBeCloseTo(t.charge - t.advance, 6)
    expect(rings.find((r) => r.key === 'run')!.radius - adv.radius).toBeCloseTo(t.run - t.advance, 6)
  })

  it('BRD-005 proxy attributes mirror a model position and our words cover every engine reason', () => {
    playUntil((s) => s.phase === 'activation')
    const m = Object.values(st().models).find((x) => !x.offTable)!
    const a = proxyAttrs(m)
    expect(a.id).toBe(m.id)
    expect(Number(a.x)).toBeCloseTo(m.pos.x, 1)
    expect(Number(a.z)).toBeCloseTo(m.pos.z, 1)
    for (const r of ['ok', 'collision', 'rough', 'obstacle', 'obstruction', 'tooFar', 'edge', 'notStraight', null]) expect(moveReasonText(r)).toBeTruthy()
    for (const r of ['clear', 'terrain', 'model', 'cloud', 'forestDepth', 'outOfTable', 'self']) expect(losReasonText(r, ['x'])).not.toBe(r)
  })

  it('BRD-006 camera transitions never exceed 600 ms and presets fit the table', () => {
    expect(CAMERA_TRANSITION_MS).toBeLessThanOrEqual(600)
    for (const p of ['top', 'edgeA', 'edgeB', 'follow'] as const) {
      const pose = cameraPose(p, { w: 36, d: 36 }, { x: 3, z: 4 })
      expect(pose.position[1]).toBeGreaterThan(0)
    }
  })
})

describe('figure kit', () => {
  it('BRD-010 archetypes by rules type, heights by base, damage fraction from the model boxes', () => {
    expect(archetypeOf('leader')).toBe('caster')
    expect(archetypeOf('warEngine')).toBe('heavyEngine')
    expect(archetypeOf('solo')).toBe('solo')
    expect(archetypeOf('trooper')).toBe('trooper')
    expect(archetypeOf('trooper', 'lightEngine')).toBe('lightEngine')
    expect(meshHeight(50, 'heavyEngine')).toBeGreaterThan(meshHeight(30, 'trooper'))
    expect(damageFraction({ damage: { track: 'single', filled: 3, boxes: 12 } })).toBeCloseTo(0.25)
    expect(damageFraction({ damage: { track: 'grid', grids: [{ id: 'main', cols: [[true, false], [false, false]] }] } })).toBeCloseTo(0.25)
  })
})

describe('interaction controllers', () => {
  it('BRD-020 clicking a ready model answers chooseActivation through the engine option', () => {
    playUntil((s) => s.pending.kind === 'chooseActivation')
    const p = useGameStore.getState().pending!
    const opt = p.options![0]!
    const act = (opt.action as { activate: string }).activate
    const m = st().models[act] ?? st().models[st().units[act]!.troopers[0]!]!
    expect(activationOption(p, m)).not.toBeNull()
    handleModelClick(m.id)
    expect(useGameStore.getState().pending!.id).not.toBe(p.id)
    expect(useGameStore.getState().lastRejection).toBeNull()
  })

  it('BRD-021 a model click never answers while a tool is measuring; the ruler takes both ends', () => {
    playUntil((s) => s.pending.kind === 'chooseActivation')
    const p = useGameStore.getState().pending!
    const [a, b] = Object.values(st().models).filter((m) => !m.offTable)
    uiActions.setMode('measure')
    handleModelClick(a!.id)
    handleGroundClick({ x: b!.pos.x, z: b!.pos.z })
    const ui = useUiStore.getState()
    expect(ui.measureFrom).toEqual({ modelId: a!.id })
    expect(ui.measureTo).toEqual({ point: { x: b!.pos.x, z: b!.pos.z } })
    expect(useGameStore.getState().pending!.id).toBe(p.id)
  })

  it('BRD-022 a staged move commits through moveModel; Esc clears it', () => {
    playUntil((s) => s.pending.kind === 'moveModel')
    const p = useGameStore.getState().pending!
    expect(p.constraints).toBeTruthy()
    uiActions.setMode('move')
    const opt = p.options![0]!
    const path = (opt.action as { path: { x: number; z: number }[] }).path
    if (defaultStraightPath(p)) {
      expect(commitStaged()).toBeNull()
    } else {
      handleGroundClick(path[path.length - 1]!)
      expect(useInteractionStore.getState().staged).toHaveLength(1)
      expect(onBoardKey({ key: 'Escape', ctrlKey: false, metaKey: false, altKey: false })).toBe(true)
      expect(useInteractionStore.getState().staged).toHaveLength(0)
      handleGroundClick(path[path.length - 1]!)
      expect(commitStaged()).toBeNull()
    }
    expect(useGameStore.getState().pending!.id).not.toBe(p.id)
  })

  it('BRD-023 target decisions are the ones the board maps to clicks; placement ids come from the engine', () => {
    for (const k of ['chargeTarget', 'chooseAttack', 'castSpell']) expect(TARGET_KINDS.has(k)).toBe(true)
    playUntil((s) => s.pending.kind === 'deploy')
    const p = useGameStore.getState().pending!
    const ids = placementIds(p)
    expect(ids.length).toBeGreaterThan(0)
    uiActions.setMode('move')
    for (const id of ids) { uiActions.select(id); handleGroundClick({ x: 0, z: 0 }) }
    // every model staged at the origin: the engine (not the client) refuses it
    const r = commitStaged()
    expect(r).not.toBeNull()
    expect(useGameStore.getState().pending!.id).toBe(p.id)
  })
})
