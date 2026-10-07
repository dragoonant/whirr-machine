// M11 client: in-game army painter, collapsible slim rails, drag-to-move and multi-waypoint paths. Headless (node):
// components render with react-dom/server after copying live store state into zustand's server snapshot.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import type { GameState, Vec2 } from '../../src/engine/index'
import { uiActions, queryMoveCheck } from '../../src/client/contract'
import { createBotDriver } from '../../src/client/bot/botDriver'
import { useAnnounceStore } from '../../src/client/presentation/announceStore'
import { setDirectorClock, setPaused } from '../../src/client/presentation/director'
import { usePresentedStore } from '../../src/client/presentation/presentedStore'
import { newGame, resetGameStore, setController, useGameStore } from '../../src/client/store/gameStore'
import { PANELS_KEY, panelActions, sanitizePanels, usePanelStore } from '../../src/client/store/panelStore'
import { useSettingsStore } from '../../src/client/store/settingsStore'
import { memoryStorage, readJson, setStorage } from '../../src/client/store/storage'
import { ui, useUiStore } from '../../src/client/store/uiStore'
import { useTrayStore } from '../../src/client/dice/trayStore'
import { PAINT_PRESETS, paintKeyFor, resolvePaint, usePaintStore } from '../../src/client/figures/paintStore'
import { canDrag, COMMIT_RADIUS, clampMovePoint, commitStaged, dropDrag, handleGroundClick, handleModelClick, nextPath, startDrag } from '../../src/client/interaction/controller'
import { onBoardKey } from '../../src/client/interaction/keys'
import { insideRect, rayToTable, toNdc } from '../../src/client/interaction/ray'
import { interactionActions, useInteractionStore } from '../../src/client/interaction/store'
import { ActivationPanel } from '../../src/client/ui/ActivationPanel'
import { GridCard } from '../../src/client/ui/GridCard'
import { Hud } from '../../src/client/ui/Hud'
import { PaintPanel } from '../../src/client/ui/PaintPanel'
import { humanSide, isStock, paintRows, presetOn } from '../../src/client/ui/paintView'

const QS = { scenario: 'scn-qs-demo', lists: { A: 'cyg.l.qs-recon', B: 'kha.l.qs-recon' } }
const ASH = { scenario: 'scn-ashwall-divide', lists: { A: 'kha.l.qs-recon', B: 'cyg.l.qs-recon' } }
const st = (): GameState => useGameStore.getState().state!
const key = (k: string) => onBoardKey({ key: k, ctrlKey: false, metaKey: false, altKey: false })

beforeEach(() => {
  setStorage(memoryStorage())
  setDirectorClock(null)
  useSettingsStore.getState().set({ speed: 0 })
  setPaused(false)
  resetGameStore()
  interactionActions.reset()
  ui.reset()
  usePaintStore.setState({ byFaction: {}, bySide: {} })
  usePanelStore.setState({ left: false, right: false })
})

function syncServerSnapshot(): void {
  for (const s of [usePresentedStore, useGameStore, useUiStore, useAnnounceStore, useSettingsStore, useTrayStore, usePanelStore, usePaintStore, useInteractionStore]) {
    Object.assign(s.getInitialState() as object, s.getState() as object)
  }
}
const html = (el: ReturnType<typeof createElement>): string => { syncServerSnapshot(); return renderToStaticMarkup(el) }

function playUntil(pred: (s: GameState) => boolean): void {
  newGame({ ...ASH, controllers: { A: 'bot', B: 'bot' }, seed: 'board-1' })
  const d = createBotDriver({ thinkMs: 0 })
  for (let i = 0; i < 4000 && !pred(st()); i++) d.tick()
  expect(pred(st())).toBe(true)
  setController('A', 'human'); setController('B', 'human')
}
const freeMove = (s: GameState): boolean => s.pending.kind === 'moveModel' && !!s.pending.constraints && !s.pending.constraints.straightLine

describe('M11 painter in the game', () => {
  it('PNT-101 the painter rows are you first, then the opponent, each with its own faction and stock palette', () => {
    expect(newGame({ ...QS, controllers: { A: 'human', B: 'bot' }, seed: 'p1' })).toBeNull()
    let rows = paintRows(st(), useGameStore.getState().controllers)
    expect(rows.map((r) => [r.role, r.side, r.faction, r.override])).toEqual([['you', 'A', 'cyg', false], ['opponent', 'B', 'kha', false]])
    expect(rows[0]!.palette.primary).toMatch(/^#[0-9a-f]{6}$/i)
    expect(newGame({ ...QS, controllers: { A: 'bot', B: 'human' }, seed: 'p1' })).toBeNull()
    expect(humanSide(useGameStore.getState().controllers)).toBe('B')
    rows = paintRows(st(), useGameStore.getState().controllers)
    expect(rows.map((r) => [r.role, r.side, r.faction])).toEqual([['you', 'B', 'kha'], ['opponent', 'A', 'cyg']])
  })

  it('PNT-102 a mirror match paints the opponent as a this-game override; different factions paint the saved faction', () => {
    expect(newGame({ scenario: 'scn-qs-demo', lists: { A: 'cyg.l.qs-recon', B: 'cyg.l.qs-recon' }, controllers: { A: 'human', B: 'bot' }, seed: 'p2' })).toBeNull()
    const rows = paintRows(st(), useGameStore.getState().controllers)
    expect(rows.map((r) => r.override)).toEqual([false, true])
  })

  it('PNT-103 painting a faction is live for its figures and remembered', () => {
    const pr = PAINT_PRESETS[0]!
    usePaintStore.getState().setFaction('kha', { primary: pr.primary, secondary: pr.secondary })
    expect(resolvePaint('kha', 'B')).toEqual({ primary: pr.primary, secondary: pr.secondary })
    expect(resolvePaint('cyg', 'A')).toBeUndefined()
    expect(readJson(paintKeyFor('kha'))).toEqual({ primary: pr.primary, secondary: pr.secondary })
    // a fresh session loads it back
    usePaintStore.setState({ byFaction: {} })
    usePaintStore.getState().load('kha')
    expect(resolvePaint('kha', 'B')?.primary).toBe(pr.primary)
    // stock clears it
    usePaintStore.getState().setFaction('kha', {})
    expect(resolvePaint('kha', 'B')).toBeUndefined()
    expect(isStock({})).toBe(true)
    expect(presetOn(pr, { primary: pr.primary.toUpperCase(), secondary: pr.secondary })).toBe(true)
  })

  it('PNT-104 the popover lists both armies with presets and both colour pickers', () => {
    newGame({ ...QS, controllers: { A: 'human', B: 'bot' }, seed: 'p4' })
    const out = html(createElement(PaintPanel))
    for (const r of ['you', 'opponent']) {
      expect(out).toContain(`data-testid="paint-row-${r}"`)
      expect(out).toContain(`data-testid="paint-${r}-stock"`)
      expect(out).toContain(`data-testid="paint-${r}-main"`)
      expect(out).toContain(`data-testid="paint-${r}-trim"`)
      for (const p of PAINT_PRESETS) expect(out).toContain(`data-testid="paint-${r}-preset-${p.id}"`)
    }
  })
})

describe('M11 slim, collapsible rails', () => {
  it('RAIL-101 a rail folds away, the state is remembered, and bad saved data means open rails', () => {
    expect(sanitizePanels(null)).toEqual({ left: false, right: false })
    expect(sanitizePanels({ left: 'yes', right: true })).toEqual({ left: false, right: true })
    panelActions.set('left', true)
    expect(readJson(PANELS_KEY)).toEqual({ left: true, right: false })
    usePanelStore.setState({ left: false })
    usePanelStore.getState().reload()
    expect(usePanelStore.getState().left).toBe(true)
    panelActions.toggle('left')
    expect(readJson(PANELS_KEY)).toEqual({ left: false, right: false })
  })

  it('RAIL-102 the [ and ] keys fold the rails; a collapsed rail still renders its tab', () => {
    newGame({ ...QS, controllers: { A: 'human', B: 'bot' }, seed: 'r2' })
    expect(key('[')).toBe(true)
    expect(usePanelStore.getState().left).toBe(true)
    expect(key(']')).toBe(true)
    const out = html(createElement(Hud))
    expect(out).toContain('data-testid="rail-left" data-collapsed="true"')
    expect(out).toContain('data-testid="rail-right" data-collapsed="true"')
    expect(out).toContain('data-testid="rail-left-toggle"')
    expect(out).toContain('hidden=""')
  })

  it('RAIL-103 the activation panel no longer repeats the stats and weapons that are on the card', () => {
    newGame({ ...QS, controllers: { A: 'human', B: 'bot' }, seed: 'r3' })
    const id = Object.values(st().models).find((m) => m.owner === 'A')!.id
    ui.select(id)
    const left = html(createElement(ActivationPanel))
    expect(left).toContain('data-testid="act-panel"')
    expect(left).not.toContain('act-stat-')
    expect(left).not.toContain('act-weapon-')
    expect(left).not.toContain('card-weapons-')
    const right = html(createElement(GridCard))
    expect(right).toContain('act-stat-')
  })
})

describe('M11 drag to move and waypoint paths', () => {
  it('DRAG-101 screen points map to the table plane', () => {
    const r = { left: 10, top: 20, width: 200, height: 100 }
    expect(toNdc(r, 110, 70)).toEqual({ x: 0, y: 0 })
    expect(toNdc(r, 10, 20)).toEqual({ x: -1, y: 1 })
    expect(insideRect(r, 50, 50)).toBe(true)
    expect(insideRect(r, 5, 50)).toBe(false)
    // a camera 10 up looking down and forward lands 10 ahead of its foot
    expect(rayToTable({ x: 0, y: 10, z: 0 }, { x: 0, y: -1, z: -1 })).toEqual({ x: 0, z: -10 })
    expect(rayToTable({ x: 0, y: 10, z: 0 }, { x: 0, y: 1, z: 0 })).toBeNull()
    expect(rayToTable({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 })).toBeNull()
  })

  it('DRAG-102 only the moving model can be dragged, in move mode, on a free move', () => {
    playUntil(freeMove)
    const c = useGameStore.getState().pending!.constraints!
    uiActions.setMode('move')
    expect(canDrag(c.modelId)).toBe(true)
    const other = Object.values(st().models).find((m) => m.id !== c.modelId)!.id
    expect(canDrag(other)).toBe(false)
    uiActions.setMode('select')
    expect(canDrag(c.modelId)).toBe(false)
    uiActions.setMode('move')
    expect(startDrag(other, 0, 0)).toBe(false)
    expect(useInteractionStore.getState().drag).toBeNull()
    expect(startDrag(c.modelId, 100, 100)).toBe(true)
    expect(useInteractionStore.getState().drag).toMatchObject({ modelId: c.modelId, moved: false })
    interactionActions.dragMoved()
    expect(useInteractionStore.getState().drag?.moved).toBe(true)
    interactionActions.endDrag()
    expect(useInteractionStore.getState().drag).toBeNull()
  })

  it('DRAG-103 a drop stages one clamped, engine-legal waypoint; a drop on the start stages nothing', () => {
    playUntil(freeMove)
    const p = useGameStore.getState().pending!
    const c = p.constraints!
    uiActions.setMode('move')
    const far = { x: c.from.x + 300, z: c.from.z }
    const dropped = dropDrag(far)
    const staged = useInteractionStore.getState().staged
    if (dropped) {
      expect(staged).toHaveLength(1)
      expect(Math.hypot(staged[0]!.x - c.from.x, staged[0]!.z - c.from.z)).toBeLessThanOrEqual(c.maxDist + 1e-6)
      expect(queryMoveCheck(c.modelId, staged)!.ok).toBe(true)
    } else expect(staged).toHaveLength(0)
    expect(dropDrag({ ...c.from })).toBe(false)
    expect(useInteractionStore.getState().staged).toHaveLength(0)
  })

  it('PATH-101 each click adds a waypoint, the engine keeps the whole path in reach, a click on the last one confirms', () => {
    playUntil(freeMove)
    const p = useGameStore.getState().pending!
    const c = p.constraints!
    uiActions.setMode('move')
    const dirs = Array.from({ length: 12 }, (_, i) => ({ x: Math.cos((i / 12) * Math.PI * 2), z: Math.sin((i / 12) * Math.PI * 2) }))
    const leg = Math.min(1.5, c.maxDist / 4)
    let first: Vec2 | null = null
    for (const d of dirs) {
      const at = { x: c.from.x + d.x * leg, z: c.from.z + d.z * leg }
      if (queryMoveCheck(c.modelId, [at])?.ok) { first = at; break }
    }
    expect(first).not.toBeNull()
    handleGroundClick(first!)
    expect(useInteractionStore.getState().staged).toHaveLength(1)
    let second: Vec2 | null = null
    for (const d of dirs) {
      const at = { x: first!.x + d.x * leg, z: first!.z + d.z * leg }
      const q = clampMovePoint(p, at, [first!])
      if (Math.hypot(q.x - first!.x, q.z - first!.z) > COMMIT_RADIUS + 0.2 && queryMoveCheck(c.modelId, [first!, q])?.ok) { second = at; break }
    }
    expect(second).not.toBeNull()
    handleGroundClick(second!)
    const staged = useInteractionStore.getState().staged
    expect(staged).toHaveLength(2)
    expect(staged[0]).toEqual(first)
    const chk = queryMoveCheck(c.modelId, staged)!
    expect(chk.ok).toBe(true)
    expect(chk.distance).toBeLessThanOrEqual(c.maxDist + 1e-6)
    // nextPath is pure: the same inputs give the same answer and never touch the store
    const r = nextPath(p, staged, staged[1]!)
    expect(r.commit).toBe(true)
    expect(useInteractionStore.getState().staged).toHaveLength(2)
    expect(commitStaged()).toBeNull()
    expect(useGameStore.getState().pending!.id).not.toBe(p.id)
  })

  it('PATH-103 a click on another figure during a free move is a click on the table behind it', () => {
    playUntil(freeMove)
    const p = useGameStore.getState().pending!
    const c = p.constraints!
    uiActions.setMode('move')
    const other = Object.values(st().models).find((m) => m.id !== c.modelId && !m.offTable)!.id
    const at = clampMovePoint(p, { x: c.from.x + 1.2, z: c.from.z + 0.4 })
    handleModelClick(other, { at })
    expect(useInteractionStore.getState().staged).toEqual(nextPath(p, [], at).path)
    expect(useUiStore.getState().selectedId).not.toBe(other) // the other figure was not selected
    handleModelClick(c.modelId, { at: { x: 0, z: 0 } }) // the mover itself keeps its normal click
    expect(useInteractionStore.getState().staged).toHaveLength(1)
  })

  it('PATH-102 Backspace removes the last waypoint, Shift-click starts the path over, a far click is clamped to what is left', () => {
    playUntil(freeMove)
    const p = useGameStore.getState().pending!
    const c = p.constraints!
    uiActions.setMode('move')
    interactionActions.setStaged([{ x: c.from.x + 0.01, z: c.from.z }])
    expect(key('Backspace')).toBe(true)
    expect(useInteractionStore.getState().staged).toHaveLength(0)
    expect(key('Backspace')).toBe(false) // nothing staged: the key is left alone
    const a = clampMovePoint(p, { x: c.from.x + 1.2, z: c.from.z })
    interactionActions.setStaged([a, { x: a.x, z: a.z + 0.01 }])
    const r = nextPath(p, useInteractionStore.getState().staged, { x: c.from.x + 200, z: c.from.z }, true)
    expect(r.path).toHaveLength(1) // shift: fresh single waypoint
    const far = nextPath(p, [a], { x: c.from.x + 200, z: c.from.z + 200 })
    expect(far.commit).toBe(false)
    expect(queryMoveCheck(c.modelId, far.path)!.distance).toBeLessThanOrEqual(c.maxDist + 1e-6)
    // with the whole move used up, a click somewhere else adds nothing and never confirms by accident
    const full = clampMovePoint(p, { x: c.from.x + 200, z: c.from.z })
    const spent = nextPath(p, [full], { x: c.from.x, z: c.from.z + 200 })
    expect(spent).toEqual({ path: [full], commit: false })
  })
})
