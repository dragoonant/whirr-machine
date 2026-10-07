// 90-skirmish C1-C4 (client side of the game-size work): the Game size choice on the start screen, `?size=` in the URL,
// the 48" table on screen (camera, Kill Box line) and the help line. Headless: no DOM.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { game, settings } from '../../src/client/contract'
import { cameraPose, killBoxViews } from '../../src/client/board/layout'
import { memoryStorage, setStorage } from '../../src/client/store/storage'
import { newGame, resetGameStore, useGameStore } from '../../src/client/store/gameStore'
import { DEFAULT_SETTINGS, SETTINGS_KEY, useSettingsStore } from '../../src/client/store/settingsStore'
import { setupFromUrl, sizeFromSetup } from '../../src/client/store/testHooks'
import { HELP_TABS } from '../../src/client/ui/help/helpContent'
import { StartScreen } from '../../src/client/ui/start/StartScreen'
import {
  buildNewGame, defaultScenarioId, GAME_SIZES, parseGameSize, scenarioChoices, sideChoices, SR_D8_ORDER, sizeFromUrl,
} from '../../src/client/ui/start/startOptions'

const FACTIONS = ['cir', 'cry', 'cyg', 'kha', 'men', 'trl']
const S3 = 'scn-copperline-crossing'

beforeEach(() => { setStorage(memoryStorage()); resetGameStore(); useSettingsStore.setState({ ...DEFAULT_SETTINGS }) })
afterEach(() => { vi.restoreAllMocks() })

describe('start screen game size (C1)', () => {
  it('SKM-007 sideChoices is per size: recon keeps the six starters, skirmish offers the six 50-point lists (46 to 50)', () => {
    const recon = sideChoices()
    expect(sideChoices('recon').map((s) => s.listId)).toEqual(recon.map((s) => s.listId))
    expect(recon.map((s) => s.factionId).sort()).toEqual(FACTIONS)
    expect(recon.every((s) => s.level === 'recon' && !s.listId.endsWith('.skirmish'))).toBe(true)
    const sk = sideChoices('skirmish')
    expect(sk.map((s) => s.factionId).sort()).toEqual(FACTIONS)
    for (const s of sk) {
      expect(s.listId, s.factionName).toBe(`${s.factionId}.l.skirmish`)
      expect(s.level).toBe('skirmish')
      expect(s.points).toBeGreaterThanOrEqual(46)
      expect(s.points).toBeLessThanOrEqual(50)
      expect(s.models.length).toBeGreaterThan(recon.find((r) => r.factionId === s.factionId)!.models.length)
    }
  })

  it('SKM-007 scenarioChoices is per size: Copperline Crossing is skirmish only, the recon scenarios stay recon only', () => {
    const recon = scenarioChoices().map((s) => s.id)
    expect(recon).toContain('scn-qs-demo')
    expect(recon).not.toContain(S3)
    // Copperline Crossing, then the seven Steamroller 2026 scenarios in the order of the SR d8 table (91 B.4)
    expect(scenarioChoices('skirmish').map((s) => s.id)).toEqual([S3, ...SR_D8_ORDER])
    expect(defaultScenarioId('skirmish')).toBe(S3)
    expect(defaultScenarioId('recon')).toBe(scenarioChoices()[0]!.id)
  })

  it('SKM-007 the game size ids parse and the table lists the points and table of each level', () => {
    expect(parseGameSize('skirmish')).toBe('skirmish')
    expect(parseGameSize('recon')).toBe('recon')
    for (const bad of ['pitched', '', 'Skirmish', null, undefined, 50]) expect(parseGameSize(bad)).toBeNull()
    expect(GAME_SIZES.map((g) => [g.id, g.points, g.table])).toEqual([['recon', 30, 36], ['skirmish', 50, 48]])
  })

  it('SKM-007 a skirmish side picked on the start screen starts a 48" game against another skirmish list', () => {
    const sides = sideChoices('skirmish')
    const kha = sides.find((s) => s.factionId === 'kha')!
    const o = buildNewGame({ listId: kha.listId, scenario: defaultScenarioId('skirmish'), seed: 'size-1' }, sides)!
    expect(o.lists.A).toBe('kha.l.skirmish')
    expect(o.lists.B.endsWith('.skirmish')).toBe(true)
    expect(newGame(o)).toBeNull()
    const s = useGameStore.getState().state!
    expect(s.scenario.table).toEqual({ w: 48, d: 48 })
  })

  it('SKM-002 a skirmish list on a recon scenario, and a recon list on a skirmish scenario, are rejected by the engine', () => {
    const sk = sideChoices('skirmish'), rc = sideChoices('recon')
    const a = buildNewGame({ listId: sk[0]!.listId, scenario: 'scn-qs-demo', seed: 'size-2' }, sk)!
    expect(newGame(a)).not.toBeNull()
    resetGameStore()
    const b = buildNewGame({ listId: rc[0]!.listId, scenario: S3, seed: 'size-3' }, rc)!
    expect(newGame(b)).not.toBeNull()
  })

  it('SKM-007 the choice is remembered in wm.settings and a bad stored value falls back to recon', () => {
    expect(useSettingsStore.getState().size).toBe('recon')
    settings.set({ size: 'skirmish' })
    expect(useSettingsStore.getState().size).toBe('skirmish')
    useSettingsStore.setState({ ...DEFAULT_SETTINGS })
    useSettingsStore.getState().reload()
    expect(useSettingsStore.getState().size).toBe('skirmish')
    // another setting's patch keeps the size
    settings.set({ battlefield: 'board.bog' })
    expect(useSettingsStore.getState().size).toBe('skirmish')
    memoryStorage()
    useSettingsStore.getState().set({ size: 'huge' as never })
    expect(useSettingsStore.getState().size).toBe('recon')
    void SETTINGS_KEY
  })

  it('SKM-007 the start screen renders the Game size select above Your side, with the size filtering the armies and scenarios', () => {
    const html = renderToString(createElement(StartScreen, { onStart: () => null }))
    expect(html).toContain('data-testid="start-size"')
    expect(html.indexOf('data-testid="start-size"')).toBeLessThan(html.indexOf('Your side'))
    expect(html).toContain('Recon: 30 points, 36 inch table')
    expect(html).toContain('Skirmish: 50 points, 48 inch table')
    expect(html).toContain('Quick Start Demo')
    expect(html).not.toContain('Copperline Crossing</option>')
    expect(html).toContain('Quick Start Cygnar')

    // (server rendering shows the store's initial state, so the size comes in through the URL here)
    vi.stubGlobal('location', { search: '?size=skirmish' })
    let sk = ''
    try { sk = renderToString(createElement(StartScreen, { onStart: () => null })) } finally { vi.unstubAllGlobals() }
    expect(sk).toContain('Copperline Crossing</option>')
    expect(sk).not.toContain('Quick Start Demo')
    expect(sk).toContain('Storm Legion Skirmish')
    expect(sk).toMatch(/\d\d<!-- --> points\./)
    for (const f of FACTIONS) expect(sk).toContain(`data-testid="setup-faction-${f}"`)
  })
})

describe('?size= in the URL (C2)', () => {
  it('SKM-007 sizeFromUrl: absent is null, known sizes parse, an unknown one is null with a single console warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(sizeFromUrl('?test=1')).toBeNull()
    expect(sizeFromUrl('?size=skirmish')).toBe('skirmish')
    expect(sizeFromUrl('?size=recon')).toBe('recon')
    expect(warn).not.toHaveBeenCalled()
    expect(sizeFromUrl('?size=gigantic')).toBeNull()
    expect(sizeFromUrl('?size=gigantic')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('SKM-007 ?size=skirmish&lists=cyg,kha starts a 48" game with both skirmish lists on Copperline Crossing', () => {
    const o = setupFromUrl('?test=1&size=skirmish&lists=cyg,kha&seed=u1')!
    expect(o.lists).toEqual({ A: 'cyg.l.skirmish', B: 'kha.l.skirmish' })
    expect(o.scenario).toBe(S3)
    expect(game.newGame(o)).toBeNull()
    const s = useGameStore.getState().state!
    expect(s.scenario.table).toEqual({ w: 48, d: 48 })
    expect(s.scenario.id).toBe(S3)
    expect(s.players.A.faction).toBe('cyg')
    expect(s.players.B.faction).toBe('kha')
  })

  it('SKM-007 every faction resolves to its own skirmish list', () => {
    for (const f of FACTIONS) expect(setupFromUrl(`?size=skirmish&lists=${f},${f}`)!.lists).toEqual({ A: `${f}.l.skirmish`, B: `${f}.l.skirmish` })
  })

  it('SKM-007 no size means recon: faction ids give the starter lists, the Quick Start Demo is the default scenario', () => {
    const o = setupFromUrl('?lists=trl,cir')!
    expect(o.lists).toEqual({ A: 'trl.l.starter-recon', B: 'cir.l.starter-recon' })
    expect(o.scenario).toBe('scn-qs-demo')
    expect(setupFromUrl('?scenario=scn-ashwall-divide&lists=cyg,kha')!.lists).toEqual({ A: 'cyg.l.qs-recon', B: 'kha.l.qs-recon' })
  })

  it('SKM-007 an unknown size is recon; a skirmish-only scenario implies skirmish; exact list ids are kept as given', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(setupFromUrl('?size=nope&lists=cyg,kha')!.lists).toEqual({ A: 'cyg.l.qs-recon', B: 'kha.l.qs-recon' })
    expect(sizeFromSetup(`?scenario=${S3}`)).toBe('skirmish')
    expect(setupFromUrl(`?scenario=${S3}&lists=men,cry`)!.lists).toEqual({ A: 'men.l.skirmish', B: 'cry.l.skirmish' })
    expect(setupFromUrl('?lists=cyg.l.skirmish,kha.l.qs-recon')!.lists).toEqual({ A: 'cyg.l.skirmish', B: 'kha.l.qs-recon' })
  })

  it('SKM-007 a URL that names neither scenario nor lists leaves the start screen up (size only preselects)', () => {
    expect(setupFromUrl('?size=skirmish')).toBeNull()
  })

  it('SKM-007 the start screen reads the size from the location (URL beats the remembered one)', () => {
    useSettingsStore.getState().set({ size: 'recon' })
    vi.stubGlobal('location', { search: '?size=skirmish' })
    try {
      const html = renderToString(createElement(StartScreen, { onStart: () => null }))
      expect(html).toContain('Storm Legion Skirmish')
    } finally { vi.unstubAllGlobals() }
  })
})

describe('48 inch table on screen (C3)', () => {
  it('SKM-007 camera presets scale with the table: 48 inches is 4/3 of 36', () => {
    for (const preset of ['top', 'edgeA', 'edgeB'] as const) {
      const a = cameraPose(preset, { w: 36, d: 36 }, undefined, 1)
      const b = cameraPose(preset, { w: 48, d: 48 }, undefined, 1)
      b.position.forEach((v, i) => expect(v).toBeCloseTo((a.position[i]! * 4) / 3, 6))
      b.target.forEach((v, i) => expect(v).toBeCloseTo((a.target[i]! * 4) / 3, 6))
    }
    // the edge presets look from behind player A's own zone, whichever end it is
    expect(cameraPose('edgeA', { w: 48, d: 48 }, undefined, -1).position[2]).toBeLessThan(0)
  })

  it('SKM-005 the Kill Box line sits 12 inches in from each edge, wakes at the first player\'s round 2 and tints while a Leader is inside', () => {
    expect(game.newGame({ scenario: S3, lists: { A: 'cyg.l.skirmish', B: 'kha.l.skirmish' }, seed: 'kb-1' })).toBeNull()
    const base = useGameStore.getState().state!
    const withEdges = { ...base, firstPlayer: 'A' as const, players: { A: { ...base.players.A, edge: 'south' as const }, B: { ...base.players.B, edge: 'north' as const } } }
    const early = killBoxViews({ ...withEdges, round: 1 })
    expect(early.map((v) => v.player)).toEqual(['A', 'B'])
    expect(early.every((v) => !v.active && !v.occupied && v.vp === 2)).toBe(true)
    const a = early[0]!, b = early[1]!
    expect(a.line).toEqual([{ x: -24, z: 12 }, { x: 24, z: 12 }])
    expect(b.line).toEqual([{ x: -24, z: -12 }, { x: 24, z: -12 }])
    expect(a.rect).toEqual({ x0: -24, x1: 24, z0: 12, z1: 24 })
    const late = killBoxViews({ ...withEdges, round: 2, activePlayer: 'A', scenario: { ...withEdges.scenario, killBox: { A: true, B: false } } })
    expect(late.every((v) => v.active)).toBe(true)
    expect(late.map((v) => v.occupied)).toEqual([true, false])
    // side edges draw a vertical line
    const sides = killBoxViews({ ...withEdges, players: { A: { ...base.players.A, edge: 'west' as const }, B: { ...base.players.B, edge: 'east' as const } } })
    expect(sides[0]!.line).toEqual([{ x: -12, z: -24 }, { x: -12, z: 24 }])
    expect(sides[1]!.line).toEqual([{ x: 12, z: -24 }, { x: 12, z: 24 }])
  })

  it('SKM-005 recon scenarios and games not yet started draw no Kill Box line', () => {
    expect(killBoxViews(null)).toEqual([])
    expect(game.newGame({ scenario: 'scn-qs-demo', lists: { A: 'cyg.l.qs-recon', B: 'kha.l.qs-recon' }, seed: 'kb-2' })).toBeNull()
    const s = useGameStore.getState().state!
    const edged = { ...s, players: { A: { ...s.players.A, edge: 'south' as const }, B: { ...s.players.B, edge: 'north' as const } } }
    expect(killBoxViews(edged)).toEqual([])
    // skirmish before the edges are chosen: nothing to draw yet
    resetGameStore()
    expect(game.newGame({ scenario: S3, lists: { A: 'cyg.l.skirmish', B: 'kha.l.skirmish' }, seed: 'kb-3' })).toBeNull()
    expect(killBoxViews(useGameStore.getState().state)).toEqual([])
  })
})

describe('help (C4)', () => {
  it('SKM-007 the goal tab explains the two game sizes and the Kill Box strip', () => {
    const goal = HELP_TABS.find((t) => t.id === 'goal')!
    const text = goal.blocks.map((b) => ('text' in b ? b.text : 'items' in b ? b.items.join(' ') : '')).join(' ')
    expect(text).toMatch(/Recon/)
    expect(text).toMatch(/Skirmish/)
    expect(text).toMatch(/48 inch/)
    expect(text).toMatch(/12 inches/)
  })
})
