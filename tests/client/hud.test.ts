// In-game HUD (50 section 3, 6, 8): prompt text with engine numbers, dice tray renderers, damage cards, server-rendered panels.
// Node environment: components are rendered with react-dom/server; zustand's server snapshot is the store's initial
// state, so the helper below copies the live state into it first.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pickSensible } from '../../src/ai/random'
import type { DiceRolled, GameState, PendingDecision, RollPurpose } from '../../src/engine/index'
import { useAnnounceStore } from '../../src/client/presentation/announceStore'
import { setDirectorClock, setPaused } from '../../src/client/presentation/director'
import { ROLL_PURPOSE_LABELS } from '../../src/client/presentation/labels'
import { usePresentedStore } from '../../src/client/presentation/presentedStore'
import { dispatch, legalFor, newGame, resetGameStore, useGameStore } from '../../src/client/store/gameStore'
import { useSettingsStore } from '../../src/client/store/settingsStore'
import { memoryStorage, setStorage } from '../../src/client/store/storage'
import { ui, useUiStore } from '../../src/client/store/uiStore'
import { Hud } from '../../src/client/ui/Hud'
import { GridCardFor } from '../../src/client/ui/GridCard'
import { buildPromptView } from '../../src/client/ui/promptView'
import { groupActions } from '../../src/client/ui/activationView'
import { buildFeed } from '../../src/client/ui/feedView'
import { cardDamage, systemsOf } from '../../src/client/ui/gridView'
import { PURPOSE_RENDERERS, keptFlags, rollTarget, viewRoll } from '../../src/client/dice/diceView'
import { useTrayStore } from '../../src/client/dice/trayStore'
import { usePrompt } from '../../src/client/contract'

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

/** zustand renders its INITIAL state on the server: copy the live state in so renderToStaticMarkup sees the game. */
function syncServerSnapshot(): void {
  for (const s of [usePresentedStore, useGameStore, useUiStore, useAnnounceStore, useSettingsStore, useTrayStore]) {
    Object.assign(s.getInitialState() as object, s.getState() as object)
  }
}
const html = (el: ReturnType<typeof createElement>): string => { syncServerSnapshot(); return renderToStaticMarkup(el) }

/** Answer decisions with the sensible random picker until `stop(pending)` (or the game ends). */
function drive(stop: (pd: PendingDecision, s: GameState) => boolean, onEach?: (pd: PendingDecision, s: GameState) => void, max = 6000): PendingDecision | null {
  for (let i = 0; i < max; i++) {
    const g = useGameStore.getState()
    const pd = g.pending!, s = g.state!
    if (stop(pd, s)) return pd
    if (pd.kind === 'gameOver') return null
    onEach?.(pd, s)
    const r = dispatch(pickSensible(s, pd, legalFor(s), 'hud-test'), 'test')
    if (r) throw new Error(`rejected ${r.code}: ${r.detail}`)
  }
  return null
}
const start = (seed: string) => { expect(newGame({ ...QS, seed })).toBeNull() }
const BAD = /undefined|NaN|\[object|null/

describe('HUD prompts explain themselves', () => {
  it('HUD-001 every decision of a whole game gets a title with no holes, and the boosts quote engine odds', () => {
    start('hud-1')
    const kinds = new Set<string>()
    const boostTitles: string[] = []
    const dmgTitles: string[] = []
    drive(() => false, (pd, s) => {
      const v = buildPromptView(s, pd, legalFor(s))
      kinds.add(pd.kind)
      expect(v.title.length, pd.kind).toBeGreaterThan(3)
      expect(v.title, `${pd.kind}: ${v.title}`).not.toMatch(BAD)
      for (const o of v.options) {
        expect(`${o.label} ${o.note ?? ""}`, `${pd.kind} option`).not.toMatch(BAD)
        expect(o.label, "raw model id in a button").not.toMatch(/\b[AB]:[\w.]*\w/)
      }
      if (pd.kind === 'boostAttack') boostTitles.push(v.title)
      if (pd.kind === 'boostDamage') dmgTitles.push(v.title)
    })
    expect(kinds.has('chooseActivation')).toBe(true)
    expect(kinds.has('chooseMovement')).toBe(true)
    expect(boostTitles.length).toBeGreaterThan(0)
    // "Boost attack? Caine -> Grenadier: 2d6 vs DEF 13 - 72% -> 91% (1 focus, 4 left)"
    expect(boostTitles[0]).toMatch(/^Boost attack\? .+ → .+: \dd6 vs DEF \d+ — \d+% → \d+% \(1 focus, \d+ left\)$/)
    if (dmgTitles.length) expect(dmgTitles[0]).toMatch(/^Boost damage\? .+ → .+: POW \d+/)
  })

  it('HUD-002 boost prompt buttons carry the documented test ids and only legal actions', () => {
    start('hud-2')
    const pd = drive((p) => p.kind === 'boostAttack')
    expect(pd).not.toBeNull()
    const s = useGameStore.getState().state!
    ui.select(pd!.context.modelId!)
    const out = html(createElement(Hud))
    expect(out).toContain('data-testid="prompt-boostAttack"')
    expect(out).toContain('data-testid="prompt-boost-yes"')
    expect(out).toContain('data-testid="prompt-boost-no"')
    const v = buildPromptView(s, pd!, legalFor(s))
    expect(v.defaultId).toBe(v.options.find((o) => o.tone === 'decline')?.id)
    expect(v.options.every((o) => legalFor(s).some((l) => JSON.stringify(l) === JSON.stringify(o.action)))).toBe(true)
  })
})

describe('HUD panels', () => {
  it('HUD-003 the activation panel lists Normal Movement and the Combat Action choices the engine offers', () => {
    start('hud-3')
    const mv = drive((p) => p.kind === 'chooseMovement')
    expect(mv).not.toBeNull()
    const s = useGameStore.getState().state!
    const id = mv!.context.modelId!
    const g = groupActions(s, mv!, legalFor(s), id)
    expect(g.active).toBe(true)
    expect(g.movement.length).toBe(mv!.options!.filter((o) => o.action.type === 'chooseMovement').length)
    expect(g.movement.every((b) => b.enabled)).toBe(true)
    ui.select(id)
    const out = html(createElement(Hud))
    for (const b of g.movement) expect(out).toContain(`data-testid="${b.testid}"`)
    expect(out).toContain('data-testid="act-stat-DEF"')
    expect(out).toContain('data-testid="hud-vp-A"')
    expect(out).toContain('data-testid="tray"')
    expect(out).toContain('data-testid="dice-log"')
    expect(out).toContain('data-testid="feed"')
    // a model that is not the one deciding gets no action buttons
    const other = Object.values(s.models).find((m) => m.owner === s.pending.player && m.id !== id && !m.offTable)
    if (other) expect(groupActions(s, mv!, legalFor(s), other.id).active).toBe(false)
  })

  it('HUD-004 attacks list every legal weapon and target with engine hit numbers', () => {
    start('hud-4')
    const at = drive((p) => p.kind === 'chooseAttack' && !!p.options?.some((o) => o.action.type === 'chooseAttack'))
    expect(at).not.toBeNull()
    const s = useGameStore.getState().state!
    const g = groupActions(s, at!, legalFor(s), at!.context.modelId)
    expect(g.attacks.length).toBeGreaterThan(0)
    expect(g.attacks[0]!.detail.join(' ')).toMatch(/d6 vs DEF \d+/)
    expect(g.attacks[0]!.note).toMatch(/\d+% to hit|automatic/)
    expect(g.endAttacks).not.toBeNull()
  })

  it('HUD-005 the Control Phase focus allocation is a form with a fill button and a confirm', () => {
    start('hud-5')
    const al = drive((p) => p.kind === 'allocateFocus')
    if (!al) return // starter lists may skip allocation when no war engine is in range
    const s = useGameStore.getState().state!
    const v = buildPromptView(s, al, legalFor(s))
    expect(v.form).toBe('allocate')
    expect(v.canPass).toBe(true)
    const out = html(createElement(Hud))
    expect(out).toContain('data-testid="focus-form"')
    expect(out).toContain('data-testid="focus-confirm"')
    expect(out).toContain('data-testid="focus-fill"')
  })

  it('HUD-006 damage cards: single-track row, war-engine six-column grid with system letters', () => {
    start('hud-6')
    const s = useGameStore.getState().state!
    const we = Object.values(s.models).find((m) => m.damage.track === 'grid')!
    expect(we).toBeTruthy()
    const cd = cardDamage(we)
    expect(cd.track).toBe('grid')
    if (cd.track === 'grid') {
      expect(cd.grids[0]!.columns).toHaveLength(6)
      expect(cd.grids[0]!.columns.flatMap((c) => c.boxes).some((b) => b.system === 'L')).toBe(true)
    }
    expect(systemsOf(we).map((x) => x.letter)).toContain('M')
    const crippled = { ...we, crippled: ['M'] }
    expect(systemsOf(crippled).find((x) => x.letter === 'M')!.crippled).toBe(true)
    const cc = cardDamage(crippled)
    expect(cc.track === 'grid' && cc.grids[0]!.columns.flatMap((c) => c.boxes).filter((b) => b.system === 'M').every((b) => b.crippled)).toBe(true)
    const out = html(createElement(GridCardFor, { model: we }))
    expect(out).toContain(`data-testid="card-grid-${we.id}"`)
    expect(out).toContain('data-testid="card-box-0-0"')
    expect(out).toMatch(/data-system="L"/)
    const single = Object.values(s.models).find((m) => m.damage.track === 'single')!
    const out2 = html(createElement(GridCardFor, { model: single }))
    expect(out2).toContain(`data-testid="card-grid-${single.id}"`)
    expect(out2).toContain('data-track="single"')
  })
})

describe('dice tray', () => {
  it('HUD-007 every roll purpose has a renderer and an unknown purpose still renders', () => {
    for (const p of Object.keys(ROLL_PURPOSE_LABELS) as RollPurpose[]) expect(typeof PURPOSE_RENDERERS[p], p).toBe('function')
    const ev = { type: 'DiceRolled', rollId: 'r:9', purpose: 'brandNew' as RollPurpose, dice: [3, 4], kept: [3, 4], total: 7 } as DiceRolled
    const v = viewRoll({ seq: 1, event: ev, label: 'Mystery' }, null)
    expect(v.verdict.word).toBe('7')
    expect(v.dice).toHaveLength(2)
  })

  it('HUD-008 the target number is read from the state when the roll is the live attack, else from the event', () => {
    const ev = { type: 'DiceRolled', rollId: 'r:1', purpose: 'attack', dice: [4, 5], kept: [4, 5], total: 10, target: 9 } as DiceRolled
    const live = { attack: { rollId: 'r:1', hitTarget: 12, damageQueue: [] } } as unknown as GameState
    expect(rollTarget(live, ev)).toBe(12)
    expect(viewRoll({ seq: 1, event: ev, label: 'x' }, live).verdict.word).toBe('MISS')
    expect(rollTarget(null, ev)).toBe(9)
    expect(viewRoll({ seq: 1, event: ev, label: 'x' }, null).verdict.word).toBe('HIT')
    const dmg = { type: 'DiceRolled', rollId: 'r:2', purpose: 'damage', dice: [3, 3], kept: [3, 3], total: 18, target: 14 } as DiceRolled
    const live2 = { attack: { rollId: 'r:1', hitTarget: 12, damageQueue: [{ rollId: 'r:2', arm: 15 }] } } as unknown as GameState
    expect(viewRoll({ seq: 2, event: dmg, label: 'd' }, live2).verdict.word).toBe('3 dmg')
  })

  it('HUD-009 kept dice are marked when the lowest is dropped', () => {
    expect(keptFlags([2, 5, 5], [5, 5]).map((d) => d.kept)).toEqual([false, true, true])
  })

  it('HUD-010 a played game fills the log, the feed carries attack breakdowns, and the tray renders in the HUD', () => {
    start('hud-10')
    drive((p) => p.kind === 'gameOver', undefined, 8000)
    const p = usePresentedStore.getState()
    expect(p.diceLog.length).toBeGreaterThan(10)
    const purposes = new Set<string>()
    for (const r of p.diceLog) {
      const v = viewRoll(r, p.state, p.feed)
      purposes.add(v.purpose)
      expect(v.verdict.word.length).toBeGreaterThan(0)
      expect(v.label).not.toMatch(BAD)
    }
    expect(purposes.has('attack')).toBe(true)
    const lines = buildFeed(p.state, p.feed)
    expect(lines.some((l) => l.detail.some((d) => /^\dd6 \+ attack stat vs DEF \d+/.test(d)))).toBe(true)
    expect(lines.some((l) => l.detail.some((d) => /^POW \d+ \+ \dd6/.test(d)))).toBe(true)
    const out = html(createElement(Hud))
    expect(out).toContain(`data-testid="tray-roll-${p.roll!.event.rollId}"`)
    expect(out).toContain(`data-testid="log-row-${p.diceLog[0]!.event.rollId}"`)
    expect(out).toContain('data-testid="feed-row-')
  })
})

describe('game over and scoreboard', () => {
  it('HUD-011 the result screen shows the winner, how it ended and both VP totals', () => {
    start('hud-11')
    drive((p) => p.kind === 'gameOver', undefined, 8000)
    const s = usePresentedStore.getState().state!
    expect(s.phase).toBe('ended')
    const out = html(createElement(Hud))
    expect(out).toContain('data-testid="gameover"')
    expect(out).toContain('data-testid="gameover-result"')
    expect(out).toContain('data-testid="gameover-vp-A"')
    expect(out).toContain('data-testid="gameover-vp-B"')
    expect(out).toContain(`>${s.scenario.vp.A} VP<`)
    expect(out).toContain('not affiliated with Steamforged Games')
  })

  it('HUD-012 the top bar shows round, phase, VP and scenario control from the engine', () => {
    start('hud-12')
    drive((p) => p.kind === 'chooseActivation')
    const out = html(createElement(Hud))
    expect(out).toContain('data-testid="hud-round"')
    expect(out).toContain('data-testid="hud-phase"')
    expect(out).toContain('data-testid="hud-vp-n-A"')
    expect(out).toMatch(/data-testid="hud-control-[^"]+"/)
    expect(usePrompt).toBeTypeOf('function')
  })
})
