// M7 UI polish: feed breakdowns, end screen, settings popover, title art, bot selector.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pickSensible } from '../../src/ai/random'
import { useAnnounceStore } from '../../src/client/presentation/announceStore'
import { setDirectorClock, setPaused } from '../../src/client/presentation/director'
import { usePresentedStore } from '../../src/client/presentation/presentedStore'
import { dispatch, legalFor, newGame, resetGameStore, useGameStore } from '../../src/client/store/gameStore'
import { useSettingsStore } from '../../src/client/store/settingsStore'
import { memoryStorage, setStorage } from '../../src/client/store/storage'
import { ui, useUiStore } from '../../src/client/store/uiStore'
import { buildFeed, expectedDamageFor } from '../../src/client/ui/feedView'
import { Hud } from '../../src/client/ui/Hud'
import { causeText, playAgain, vpByRound } from '../../src/client/ui/GameOver'
import { getMatchStats } from '../../src/client/ui/matchStats'
import { SettingsPanel } from '../../src/client/ui/SettingsPopover'
import { TitleArt } from '../../src/client/ui/start/TitleArt'
import { BOT_TIERS, buildNewGame, DEFAULT_BOT_TIER } from '../../src/client/ui/start/startOptions'
import { parseCoach, shouldCoach } from '../../src/client/ui/help/coachText'

const QS = { scenario: 'scn-qs-demo', lists: { A: 'cyg.l.qs-recon', B: 'kha.l.qs-recon' }, controllers: { A: 'human', B: 'human' } as const }

beforeEach(() => {
  setStorage(memoryStorage())
  setDirectorClock(null)
  useSettingsStore.getState().set({ speed: 0, narration: true })
  setPaused(false)
  resetGameStore()
  ui.reset()
})
afterEach(() => { setDirectorClock(null); setPaused(false) })

function syncServerSnapshot(): void {
  for (const s of [usePresentedStore, useGameStore, useUiStore, useAnnounceStore, useSettingsStore]) {
    Object.assign(s.getInitialState() as object, s.getState() as object)
  }
}
const html = (el: ReturnType<typeof createElement>): string => { syncServerSnapshot(); return renderToStaticMarkup(el) }

function playOut(seed: string): void {
  expect(newGame({ ...QS, seed })).toBeNull()
  for (let i = 0; i < 8000; i++) {
    const g = useGameStore.getState()
    if (g.pending!.kind === 'gameOver') return
    const r = dispatch(pickSensible(g.state!, g.pending!, legalFor(g.state!), 'm7'), 'test')
    if (r) throw new Error(`rejected ${r.code}`)
  }
}

describe('event feed breakdowns', () => {
  it('M7-001 attack rows carry dice, target number, expected vs actual damage and per-turn totals', () => {
    playOut('m7-1')
    const p = usePresentedStore.getState()
    const expected = new Map<number, number>()
    for (const { seq, event } of p.feed) {
      if (event.type !== 'AttackDeclared') continue
      const e = expectedDamageFor(p.state, event)
      if (e !== null) expected.set(seq, e)
    }
    const lines = buildFeed(p.state, p.feed, expected)
    const detail = lines.flatMap((l) => l.detail)
    expect(detail.some((d) => /^Dice \[[\d, ]+\].* = \d+ against \d+/.test(d))).toBe(true)
    expect(detail.some((d) => /^Expected about \d+\.\d, actual \d+/.test(d))).toBe(true)
    expect(lines.some((l) => /^Turn \d+ damage: \d+ in all/.test(l.text) && l.detail.some((d) => / took \d+$/.test(d)))).toBe(true)
  })
})

describe('end screen', () => {
  it('M7-002 shows cause, VP by round, damage dealt per side and Play again / Menu', () => {
    playOut('m7-2')
    const s = usePresentedStore.getState().state!
    const out = html(createElement(Hud))
    expect(out).toContain('data-testid="gameover-cause"')
    expect(out).toContain('data-testid="gameover-damage"')
    expect(out).toContain('data-testid="gameover-again"')
    expect(out).toContain('data-testid="gameover-menu"')
    for (const r of vpByRound(s)) expect(out).toContain(`data-testid="gameover-round-${r.round}"`)
    const st = getMatchStats()
    expect(st.dealt.A + st.dealt.B).toBeGreaterThan(0)
    expect(out).toContain(`data-testid="gameover-dealt-A">${st.dealt.A}<`)
    expect(causeText(s.scenario.result!).length).toBeGreaterThan(5)
  })

  it('M7-003 Play again starts a fresh game on the same lists and scenario', () => {
    playOut('m7-3')
    const s = usePresentedStore.getState().state!
    expect(playAgain(s)).toBeNull()
    const g = useGameStore.getState().state!
    expect(g.phase).not.toBe('ended')
    expect(g.setup.scenario).toBe(s.setup.scenario)
    expect(g.setup.lists).toEqual(s.setup.lists)
  })
})

describe('settings, title and start screen', () => {
  it('M7-004 the settings popover offers speed, graphics, narration, tips and sound', () => {
    const out = html(createElement(SettingsPanel))
    for (const id of ['set-speed-slow', 'set-speed-instant', 'set-graphics-low', 'set-graphics-high', 'set-narration', 'set-tips', 'set-sound-master', 'set-sound-music']) {
      expect(out).toContain(`data-testid="${id}"`)
    }
  })

  it('M7-005 the top bar has the gear button', () => {
    expect(newGame({ ...QS, seed: 'm7-5' })).toBeNull()
    expect(html(createElement(Hud))).toContain('data-testid="settings-button"')
  })

  it('M7-006 title art renders and the bot strength defaults to normal', () => {
    expect(renderToStaticMarkup(createElement(TitleArt))).toContain('<svg')
    expect(BOT_TIERS.map((b) => b.id)).toEqual(['normal', 'easy', 'random'])
    expect(DEFAULT_BOT_TIER).toBe('normal')
    const g = buildNewGame({ listId: 'cyg.l.qs-recon', scenario: 'scn-qs-demo' })
    expect(g?.bot?.tier).toBe('normal')
  })

  it('M7-007 tips can be switched off', () => {
    expect(shouldCoach(parseCoach(JSON.stringify({ off: true, seen: [] })), 'chooseMove' as never)).toBe(false)
  })
})
