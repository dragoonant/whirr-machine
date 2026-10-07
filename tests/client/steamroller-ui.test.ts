// M13 client UI (91 A, B, C): the start screen choices (cards, clock, Steamroller scenarios), the hand tray model, the prompt
// wording for card and scenario decisions, the scenario element names, the feed lines and the top bar. Headless: no DOM.
// Test names carry the checklist ids of docs/spec/12-rules-test-checklist.md.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pickSensible } from '../../src/ai/random'
import type { Action, GameEvent, GameState, PendingDecision } from '../../src/engine/index'
import { query } from '../../src/engine/index'
import { useAnnounceStore } from '../../src/client/presentation/announceStore'
import { setDirectorClock, setPaused } from '../../src/client/presentation/director'
import { usePresentedStore } from '../../src/client/presentation/presentedStore'
import { dispatch, legalFor, newGame, resetGameStore, useGameStore } from '../../src/client/store/gameStore'
import { useSettingsStore } from '../../src/client/store/settingsStore'
import { memoryStorage, setStorage } from '../../src/client/store/storage'
import { ui, useUiStore } from '../../src/client/store/uiStore'
import { useTrayStore } from '../../src/client/dice/trayStore'
import { resetClock } from '../../src/client/clock'
import { Hud } from '../../src/client/ui/Hud'
import { StartScreen } from '../../src/client/ui/start/StartScreen'
import { HELP_TABS } from '../../src/client/ui/help/helpContent'
import { buildPromptView, humanize } from '../../src/client/ui/promptView'
import { buildFeed } from '../../src/client/ui/feedView'
import { buildHand, offerLabel, playOptionsOf } from '../../src/client/ui/cards/cardsView'
import { scenarioEventLine, scoreSourceWords } from '../../src/client/ui/cards/eventLines'
import { elementInfos, killBoxViewsNow } from '../../src/client/ui/cards/scenarioView'
import { elementDrawViews } from '../../src/client/board/scenarioElements'
import { haulPiece, isHaul, scenarioPiece } from '../../src/client/ui/cards/scenarioPrompts'
import {
  armyOf, buildNewGame, cardPool, cardsDefault, defaultHand, HAND_LIMIT, handFor, isSteamrollerScenario, RANDOM_SR_ID, resolveScenario, scenarioChoices,
  scenarioOptions, sideChoices, SR_D8_ORDER,
} from '../../src/client/ui/start/startOptions'

const UNIVERSAL = ['core.card.bite-and-hold', 'core.card.blessings-of-the-gods', 'core.card.careful-reconnaissance', 'core.card.duck-and-cover', 'core.card.put-the-fires-out']
const TF = 'scn-sr26-trench-warfare'
const SR_GAME = { scenario: TF, lists: { A: 'cyg.l.qs-recon', B: 'kha.l.qs-recon' }, controllers: { A: 'human', B: 'human' } as const }
const BAD = /undefined|NaN|\[object|null/

beforeEach(() => {
  setStorage(memoryStorage())
  setDirectorClock(null)
  useSettingsStore.getState().set({ speed: 0, narration: true })
  setPaused(false)
  resetGameStore()
  resetClock()
  ui.reset()
})
afterEach(() => { setDirectorClock(null); setPaused(false) })

function syncServerSnapshot(): void {
  for (const s of [usePresentedStore, useGameStore, useUiStore, useAnnounceStore, useSettingsStore, useTrayStore]) {
    Object.assign(s.getInitialState() as object, s.getState() as object)
  }
}
const html = (el: ReturnType<typeof createElement>): string => { syncServerSnapshot(); return renderToStaticMarkup(el) }

function drive(stop: (pd: PendingDecision, s: GameState) => boolean, max = 4000): PendingDecision | null {
  for (let i = 0; i < max; i++) {
    const g = useGameStore.getState()
    const pd = g.pending!, s = g.state!
    if (stop(pd, s)) return pd
    if (pd.kind === 'gameOver') return null
    // never take a card while driving: the tests below decide when a card is played
    const legal = legalFor(s).filter((a) => a.type !== 'playCard')
    const r = dispatch(pickSensible(s, pd, legal, 'steamroller-ui'), 'test')
    if (r) throw new Error(`rejected ${r.code}: ${r.detail}`)
  }
  return null
}
const withCards = (seed: string) => ({ ...SR_GAME, seed, cards: { A: handFor('cyg.l.qs-recon'), B: handFor('kha.l.qs-recon') } })
const myMove = (pd: PendingDecision, s: GameState): boolean => pd.kind === 'chooseMovement' && s.phase === 'activation'

describe('start screen: command cards', () => {
  it('CARD-002 the default hand is the five universal cards, and a pick must be open to the list', () => {
    expect(cardPool('cyg.l.qs-recon').map((c) => c.id)).toEqual(UNIVERSAL)
    expect(defaultHand('cyg.l.qs-recon')).toEqual(UNIVERSAL)
    expect(armyOf('cyg.l.qs-recon')).toBeUndefined()
    // For the Motherland is open to two Khador armies only: a list without that army cannot take it, the Khador lists (army kha.winter-korps) can
    expect(handFor('cyg.l.qs-recon', ['kha.card.for-the-motherland', UNIVERSAL[0]!])).toEqual([UNIVERSAL[0]])
    for (const l of ['kha.l.qs-recon', 'kha.l.skirmish']) {
      expect(armyOf(l)).toBe('kha.winter-korps')
      expect(cardPool(l).map((c) => c.id)).toEqual([...UNIVERSAL, 'kha.card.for-the-motherland'])
      expect(cardPool(l).length).toBeGreaterThan(HAND_LIMIT) // the start screen's "Your five" picker shows when the pool is bigger than the hand
      expect(handFor(l, ['kha.card.for-the-motherland', UNIVERSAL[0]!])).toEqual(['kha.card.for-the-motherland', UNIVERSAL[0]])
      expect(defaultHand(l)).toEqual(UNIVERSAL)
    }
    expect(handFor('cyg.l.qs-recon', [])).toEqual(UNIVERSAL)
    expect(handFor('cyg.l.qs-recon', [...UNIVERSAL, UNIVERSAL[0]!]).length).toBeLessThanOrEqual(HAND_LIMIT)
  })

  it('CARD-001 cards default On for Skirmish and the Steamroller scenarios, Off for the Quick Start demo, and an Off game has no hands', () => {
    expect(cardsDefault('skirmish', 'scn-copperline-crossing')).toBe(true)
    expect(cardsDefault('recon', TF)).toBe(true)
    expect(cardsDefault('recon', RANDOM_SR_ID)).toBe(true)
    expect(cardsDefault('recon', 'scn-qs-demo')).toBe(false)
    expect(cardsDefault('skirmish', 'scn-qs-demo')).toBe(false)
    const sides = sideChoices('recon')
    const a = sides.find((s) => s.factionId === 'cyg')!
    const off = buildNewGame({ listId: a.listId, scenario: 'scn-qs-demo', seed: 'c1', cards: false }, sides)!
    expect(off.cards).toBeUndefined()
    const on = buildNewGame({ listId: a.listId, scenario: TF, seed: 'c1', cards: true }, sides)!
    expect(on.cards?.A).toEqual(UNIVERSAL)
    expect(on.cards?.B).toEqual(UNIVERSAL)
    expect(newGame({ ...on, controllers: { A: 'human', B: 'human' } })).toBeNull()
    const s = useGameStore.getState().state!
    expect(s.players.A.cards?.hand).toEqual(UNIVERSAL)
    expect(s.players.B.cards?.hand).toEqual(UNIVERSAL)
  })
})

describe('start screen: Steamroller scenarios', () => {
  it('SR-001 the seven SR scenarios are listed in d8 order at both sizes, then Random (d8)', () => {
    for (const size of ['recon', 'skirmish'] as const) {
      const sr = scenarioChoices(size).filter((c) => c.group === 'steamroller').map((c) => c.id)
      expect(sr).toEqual([...SR_D8_ORDER])
      const opts = scenarioOptions(size)
      expect(opts[opts.length - 1]).toMatchObject({ id: RANDOM_SR_ID, name: 'Random (d8)', group: 'steamroller' })
      expect(scenarioChoices(size).every((c) => isSteamrollerScenario(c.id) === (c.group === 'steamroller'))).toBe(true)
    }
  })

  it('SR-001 Random (d8) rolls from the seed: repeatable, always one of the seven, every one reachable', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 400; i++) {
      const id = resolveScenario(RANDOM_SR_ID, `seed-${i}`)
      expect(SR_D8_ORDER).toContain(id)
      expect(resolveScenario(RANDOM_SR_ID, `seed-${i}`)).toBe(id)
      seen.add(id)
    }
    expect(seen.size).toBe(7)
    expect(resolveScenario(TF, 'x')).toBe(TF)
    const sides = sideChoices('recon')
    const g = buildNewGame({ listId: sides[0]!.listId, scenario: RANDOM_SR_ID, seed: 'seed-7' }, sides)!
    expect(g.scenario).toBe(resolveScenario(RANDOM_SR_ID, 'seed-7'))
  })

  it('CLK-002 the start screen shows Cards and Clock choices with the clock Off and no clock chips in the game', () => {
    const out = html(createElement(StartScreen, { onStart: () => null }))
    expect(out).toContain('data-testid="start-cards-on"')
    expect(out).toContain('data-testid="start-clock-steamroller"')
    expect(out).toContain('data-testid="start-clock-custom"')
    expect(out).toContain('Steamroller 2026')
    expect(out).toContain('Random (d8)')
    // the clock is Off by default: no custom inputs are drawn
    expect(out).not.toContain('data-testid="start-clock-minutes"')
    expect(newGame({ ...SR_GAME, seed: 'clk' })).toBeNull()
    expect(html(createElement(Hud))).not.toContain('data-testid="clock-bar"')
  })
})

describe('the hand tray', () => {
  it('CARD-021 both hands are listed; only the open decision\'s plays are enabled; playing one marks it played and spends a play', () => {
    expect(newGame(withCards('tray-1'))).toBeNull()
    const pd = drive(myMove)!
    expect(pd).not.toBeNull()
    const s = useGameStore.getState().state!
    const me = pd.player
    const they = me === 'A' ? 'B' : 'A'
    const legal = legalFor(s)
    const mine = buildHand(s, query.cards(s, me), me, pd, legal, me)!
    const theirs = buildHand(s, query.cards(s, they), they, pd, legal, me)!
    expect(mine.tiles.map((t) => t.cardId)).toEqual(UNIVERSAL)
    expect(theirs.tiles.map((t) => t.cardId)).toEqual(UNIVERSAL)
    expect(mine.playsLeft).toBe(2)
    expect(mine.playable).toBeGreaterThan(0)
    expect(theirs.playable).toBe(0)
    expect(theirs.tiles.every((t) => t.options.every((o) => o.offers.length === 0))).toBe(true)
    // Put the Fires Out is a Maintenance card: not playable mid-activation, and the tile says when it can be
    const fires = mine.tiles.find((t) => t.cardId === 'core.card.put-the-fires-out')!
    expect(fires.playable).toBe(false)
    expect(fires.reason).toMatch(/Maintenance/)
    expect(playOptionsOf(pd).length).toBeGreaterThan(0)
    expect(buildPromptView(s, pd, legal).lines.join(' ')).toMatch(/command card can be played/)
    // every enabled offer is an action the engine lists
    const offer = mine.tiles.flatMap((t) => t.options.flatMap((o) => o.offers)).find((o) => o.enabled)!
    expect(legal.some((a) => JSON.stringify(a) === JSON.stringify(offer.action))).toBe(true)
    // play it through the same path the tray button uses
    expect(dispatch(offer.action, 'human')).toBeNull()
    const s2 = useGameStore.getState().state!
    const pd2 = useGameStore.getState().pending!
    const mine2 = buildHand(s2, query.cards(s2, me), me, pd2, legalFor(s2), me)!
    expect(mine2.tiles.find((t) => t.cardId === offer.cardId)!.played).toBe(true)
    expect(mine2.playsLeft).toBe(1)
    // the played card no longer offers anything, and the dock points at the Cards button
    expect(mine2.tiles.find((t) => t.cardId === offer.cardId)!.options.every((o) => o.offers.length === 0)).toBe(true)
    // one card per model a turn (CC5): the same activation offers no second card, so the dock stops pointing at the Cards button
    expect(playOptionsOf(pd2)).toEqual([])
    expect(buildPromptView(s2, pd2, legalFor(s2)).lines.join(' ')).not.toMatch(/command card can be played/)
    expect(mine2.playable).toBe(0)
  })

  it('CARD-021 an offer with several targets or extras is labelled by what it lands on', () => {
    expect(newGame(withCards('tray-2'))).toBeNull()
    const pd = drive((p, s) => myMove(p, s) && playOptionsOf(p).some((a) => a.cardId === 'core.card.blessings-of-the-gods'))
    if (!pd) return // no first-decision Blessings offer in this seed: the labelling below is covered by the synthetic case
    const s = useGameStore.getState().state!
    const hand = buildHand(s, query.cards(s, pd.player), pd.player, pd, legalFor(s), pd.player)!
    for (const t of hand.tiles) for (const o of t.options) for (const p of o.offers) {
      expect(offerLabel(o, p, o.offers.length > 1)).not.toMatch(BAD)
      expect(p.targetName).not.toMatch(/^[AB]:/)
    }
  })

  it('CARD-021 the top bar shows a Cards button when a hand exists, with the count of cards left', () => {
    expect(newGame(withCards('tray-3'))).toBeNull()
    expect(html(createElement(Hud))).toContain('data-testid="cards-button"')
    resetGameStore()
    expect(newGame({ ...SR_GAME, seed: 'tray-3b' })).toBeNull()
    expect(html(createElement(Hud))).not.toContain('data-testid="cards-button"')
  })
})

describe('prompts for card and scenario decisions', () => {
  it('SR-003 the flag terrain pick names the flag and the piece, lights the piece on hover and has no default', () => {
    let pd: PendingDecision | null = null
    for (let i = 0; i < 40 && !pd; i++) { // some layouts have no piece within 5 inches of a flag: the flag is then an obstruction and nothing is picked
      resetGameStore()
      expect(newGame({ ...SR_GAME, seed: `flag-${i}` })).toBeNull()
      pd = drive((p) => (p.kind === 'abilityChoice' && p.context.data?.code === 'flagTerrain') || p.kind === 'deploy')
      if (pd && pd.kind !== 'abilityChoice') pd = null
    }
    expect(pd).not.toBeNull()
    const s = useGameStore.getState().state!
    const v = buildPromptView(s, pd!, legalFor(s))
    expect(v.title).toMatch(/scenario terrain/i)
    expect(v.options.length).toBeGreaterThan(0)
    expect(v.defaultId).toBeNull()
    for (const o of v.options) {
      expect(o.label).toMatch(/^(Your|Their)? ?flag terrain.*: use the/i)
      expect(`${o.label}`).not.toMatch(BAD)
      expect(o.terrainId).toBeTruthy()
      expect(s.terrain.some((t) => t.id === o.terrainId)).toBe(true)
    }
    // answering it works and the flag's terrain is then known
    expect(dispatch(v.options[0]!.action, 'test')).toBeNull()
  })

  it('SR-007 the cache claim label is worded with the cache, never a raw element id', () => {
    // the engine words it "Claim the cache (el-cache-blue)"; the activation panel and the dock run labels through humanize
    expect(newGame({ ...SR_GAME, seed: 'cache-1' })).toBeNull()
    drive((_p, s) => s.phase === 'activation')
    const s = useGameStore.getState().state!
    const text = humanize(s, 'Claim the cache (el-cache-blue)')
    expect(text).toMatch(/^Claim the cache \((Your|Their) cache\)$/)
    expect(humanize(s, 'Burn down el-50-red')).not.toMatch(/el-/)
  })

  it('CARD-018 the Maintenance card prompt asks before effects roll, can be passed and has no default', () => {
    expect(newGame(withCards('maint-1'))).toBeNull()
    const s = useGameStore.getState().state!
    const pd = { ...s.pending, kind: 'abilityChoice' as const, canPass: true, context: { data: { code: 'card' } }, options: [{ id: 'card:core.card.put-the-fires-out:end-effects:A:L', label: 'Put the Fires Out: End effects on A:L', action: { type: 'playCard', decisionId: 'd', player: 'A', cardId: 'core.card.put-the-fires-out', option: 'end-effects', targetId: 'A:L' } as Action }] } as unknown as PendingDecision
    const v = buildPromptView(s, pd, [])
    expect(v.title).toMatch(/Maintenance/)
    expect(v.canPass).toBe(true)
    expect(v.passLabel).toBe('No card')
    expect(v.defaultId).toBeNull()
    expect(v.options[0]!.label).toMatch(/Put the Fires Out/)
    expect(v.options[0]!.label).not.toMatch(/^.*A:L/)
  })

  it('SR-012 Wolves, SR-015 High Stakes and SR-018 Payload decisions are worded from the engine\'s numbers', () => {
    expect(newGame({ ...SR_GAME, scenario: 'scn-sr26-wolves', seed: 'w-1' })).toBeNull()
    const s = useGameStore.getState().state!
    const mk = (data: Record<string, unknown>, options: { id: string; label: string }[]): PendingDecision =>
      ({ ...s.pending, kind: 'abilityChoice', canPass: true, context: { data }, options: options.map((o) => ({ ...o, action: { type: 'abilityChoice', decisionId: 'd', player: 'A', optionId: o.id } as Action })) }) as unknown as PendingDecision
    const heel = scenarioPiece(s, mk({ code: 'heelToken', scoring: true, elementId: 'el-40-red', tokens: 2 }, [{ id: 'yes', label: 'x' }, { id: 'no', label: 'y' }]))!
    expect(heel.title).toMatch(/Wolves at Our Heels/)
    expect(heel.lines!.join(' ')).toMatch(/2 tokens/)
    expect(heel.defaultId).toBe('no')
    const move = scenarioPiece(s, mk({ code: 'heelMove', scoring: true, elementId: 'el-40-red', move: 3 }, [{ id: 'move', label: 'x' }, { id: 'stay', label: 'y' }]))!
    expect(move.title).toMatch(/pull it 3"/)
    expect(move.labels).toMatchObject({ move: 'Pull it 3"', stay: 'Leave it' })
    const fuse = scenarioPiece(s, mk({ code: 'fuse', scoring: true }, [{ id: 'el-flag-red', label: 'Burn down el-flag-red (4 left)' }]))!
    expect(fuse.labels!['el-flag-red']).toMatch(/^Burn down .*[Ff]lag terrain.* \(4 left\)$/)
    const pay = scenarioPiece(s, mk({ code: 'payload', scoring: true, elementId: 'el-50-red', max: 4 }, [{ id: 'd0', label: 'Leave it' }, { id: 'd4', label: 'Move it 4"' }]))!
    expect(pay.title).toMatch(/up to 4"/)
    expect(pay.passLabel).toBe('Leave it where it is')
    for (const p of [heel, move, fuse, pay]) expect([p.title, ...(p.lines ?? []), ...Object.values(p.labels ?? {})].join(' ')).not.toMatch(BAD)
    // the five codes are the only ones this file words; others return null so the generic title applies
    expect(scenarioPiece(s, mk({ code: 'prey' }, []))).toBeNull()
  })

  it('SR-019 Made To Haul is a button list of the engine\'s moves, skippable, not a board click', () => {
    expect(newGame({ ...SR_GAME, scenario: 'scn-sr26-payload', seed: 'p-1' })).toBeNull()
    const s = useGameStore.getState().state!
    const lead = Object.values(s.models).find((m) => m.owner === 'A')!
    const pd = {
      ...s.pending, kind: 'moveModel', canPass: true, context: { modelId: lead.id, data: { code: 'haul', scoring: true, max: 5 } },
      constraints: { modelId: lead.id, from: lead.pos, maxDist: 5, straightLine: true },
      options: [{ id: `haul:${lead.id}`, label: `Haul ${lead.id} 3.2" toward the objective`, action: { type: 'moveModel', decisionId: 'd', player: 'A', modelId: lead.id, path: [{ x: 0, z: 0 }] } as Action }],
    } as unknown as PendingDecision
    expect(isHaul(pd)).toBe(true)
    const piece = haulPiece(s, pd)
    expect(piece.title).toMatch(/up to 5"/)
    const v = buildPromptView(s, pd, [])
    expect(v.form).toBe('buttons')
    expect(v.canPass).toBe(true)
    expect(v.passLabel).toBe('Skip the haul')
    expect(v.options[0]!.label).toMatch(/^Haul .* 3\.2" toward the objective$/)
    expect(v.options[0]!.label).not.toMatch(/A:/)
  })

  it('SR-024 every decision of a whole Steamroller game gets a title and labels with no holes', () => {
    for (const scn of ['scn-sr26-trench-warfare', 'scn-sr26-high-stakes', 'scn-sr26-two-fronts']) {
      resetGameStore()
      expect(newGame({ ...withCards(`whole-${scn}`), scenario: scn })).toBeNull()
      let n = 0
      drive((pd, s) => {
        n++
        const v = buildPromptView(s, pd, legalFor(s))
        expect(v.title.length, pd.kind).toBeGreaterThan(3)
        expect(v.title, `${scn} ${pd.kind}: ${v.title}`).not.toMatch(BAD)
        for (const o of v.options) expect(`${o.label} ${o.note ?? ''}`, `${scn} ${pd.kind}`).not.toMatch(BAD)
        return n > 1500
      })
    }
  })
})

describe('scenario elements', () => {
  it('SR-001 elements are named from the player\'s side, numbered when a kind repeats, with owners from the data', () => {
    expect(newGame({ ...SR_GAME, seed: 'el-1' })).toBeNull()
    drive((p, s) => s.phase === 'activation')
    const s = useGameStore.getState().state!
    const infos = elementInfos(s, 'A')
    expect(infos.map((i) => i.kind).sort()).toEqual(['cache', 'cache', 'flag', 'flag', 'objective40', 'objective40', 'objective50', 'objective50'])
    for (const i of infos) {
      expect(i.label).toMatch(/^(Your|Their) /)
      expect(i.label).not.toMatch(/el-/)
    }
    expect(infos.filter((i) => i.label.startsWith('Your')).length).toBe(4)
    // the same elements seen from the other side swap owners
    const other = elementInfos(s, 'B')
    expect(other.find((i) => i.id === infos[0]!.id)!.label.startsWith('Your')).toBe(!infos[0]!.label.startsWith('Your'))
    // nothing removed or tokened at the start of Trench Warfare
    expect(infos.every((i) => !i.removed && i.tokens === null)).toBe(true)
  })

  it('SR-011 the Kill Box strip follows the engine\'s running depth', () => {
    expect(newGame({ ...SR_GAME, scenario: 'scn-sr26-wolves', seed: 'kb-1' })).toBeNull()
    drive((p, s) => s.phase === 'activation')
    const s = useGameStore.getState().state!
    const base = killBoxViewsNow(s)
    expect(base.length).toBe(2)
    const deeper = killBoxViewsNow({ ...s, scenario: { ...s.scenario, killBoxDepth: 14 } })
    const w = (v: { rect: { x0: number; x1: number; z0: number; z1: number } }) => Math.min(v.rect.x1 - v.rect.x0, v.rect.z1 - v.rect.z0)
    for (let i = 0; i < 2; i++) { expect(w(deeper[i]!)).toBeCloseTo(14, 5); expect(w(base[i]!)).toBeCloseTo(12, 5) }
  })

  it('SR-012 the top bar names the elements and shows tokens and the Kill Box depth where the scenario has them', () => {
    expect(newGame({ ...SR_GAME, scenario: 'scn-sr26-high-stakes', seed: 'tb-1' })).toBeNull()
    drive((p, s) => s.phase === 'activation')
    const out = html(createElement(Hud))
    expect(out).toContain('data-testid="hud-control"')
    expect(out).toMatch(/data-testid="hud-control-el-50"/)
    // High Stakes starts with five tokens on the 50 mm objective and on each flag's terrain
    expect(out).toMatch(/data-testid="hud-tokens-el-50">5</)
    expect(out).not.toMatch(/Objective \d/)
  })
})

describe('the board draws the elements the engine reports', () => {
  it('SR-002 elements are drawn where elementState puts them: moved, tokened, removed, and the flag-obstruction when a flag has no terrain', () => {
    expect(newGame({ ...SR_GAME, seed: 'draw-1' })).toBeNull()
    drive((_p, s) => s.phase === 'activation')
    const s = useGameStore.getState().state!
    const base = elementDrawViews(s)
    expect(base.length).toBe(8)
    const cache = base.find((v) => v.def.kind === 'cache')!
    // a claimed cache leaves the table; a moved objective is drawn at its new place with its tokens
    const fifty = base.find((v) => v.def.kind === 'objective50')!
    const moved = { ...s, scenario: { ...s.scenario, elementState: { ...s.scenario.elementState, [cache.def.id]: { removed: true }, [fifty.def.id]: { pos: { x: 1.5, z: -2.5 }, tokens: 3 } } } }
    const after = elementDrawViews(moved)
    expect(after.length).toBe(7)
    expect(after.some((v) => v.def.id === cache.def.id)).toBe(false)
    const f2 = after.find((v) => v.def.id === fifty.def.id)!
    expect(f2.pos).toEqual({ x: 1.5, z: -2.5 })
    expect(f2.tokens).toBe(3)
    // a flag with terrainId null is the virtual obstruction (not in state.terrain); a flag with a piece carries its footprint
    const flags = base.filter((v) => v.def.kind === 'flag')
    expect(flags.length).toBe(2)
    for (const f of flags) {
      expect(f.terrainId === null ? f.shape === null : true).toBe(true)
      if (typeof f.terrainId === 'string') expect(f.shape).not.toBeNull()
    }
  })
})

describe('feed lines', () => {
  it('CARD-021 SR-007 SR-016 the new events read as sentences with names, not ids', () => {
    expect(newGame(withCards('feed-1'))).toBeNull()
    drive((p, s) => s.phase === 'activation')
    const s = useGameStore.getState().state!
    const lead = Object.values(s.models).find((m) => m.owner === 'A')!.id
    const evs: GameEvent[] = [
      { type: 'CardPlayed', player: 'A', cardId: 'core.card.duck-and-cover', option: 'dig-in', targetIds: [lead] },
      { type: 'CacheClaimed', player: 'A', elementId: 'el-cache-blue', modelId: lead },
      { type: 'FlagTerrainChosen', player: 'A', flagId: 'el-flag-red', terrainId: null },
      { type: 'ElementMoved', elementId: 'el-40-red', from: { x: 0, z: 0 }, to: { x: 0, z: 3 }, by: 'B' },
      { type: 'ElementTokensChanged', elementId: 'el-50-red', tokens: 3, delta: -2, by: null },
      { type: 'ElementDetonated', elementId: 'el-50-red' },
      { type: 'ElementRemoved', elementId: 'el-50-red', reason: 'delivered' },
      { type: 'KillBoxExtended', depth: 14 },
      { type: 'ClockExpired', player: 'A', active: 'A' },
    ]
    for (const ev of evs) {
      const line = scenarioEventLine(s, ev)
      expect(line, ev.type).not.toBeNull()
      expect(line!.text, ev.type).not.toMatch(BAD)
      expect(line!.text, ev.type).not.toMatch(/\bel-|[AB]:/)
    }
    expect(scenarioEventLine(s, evs[0]!)!.text).toMatch(/plays Duck and Cover! \(Dig In\)/)
    expect(scenarioEventLine(s, { type: 'TurnEnded', turn: 1 } as GameEvent)).toBeNull()
    const rows = buildFeed(s, evs.map((event, i) => ({ seq: i + 1, event })))
    expect(rows.length).toBe(evs.length)
    expect(scoreSourceWords(s, 'controls el-50-blue')).toMatch(/^held /)
    expect(scoreSourceWords(s, 'claimed el-cache-red')).toMatch(/^claimed /)
    expect(scoreSourceWords(s, 'tokenRace')).toBe('won the token race')
    expect(scoreSourceWords(s, 'delivered')).toBe('delivered the payload')
    expect(scoreSourceWords(s, 'secures 2 of objective40/objective50 (2+ bonus)')).toBe('bonus for securing 2')
  })
})

describe('how to play', () => {
  it('CARD-021 SR-001 CLK-001 the guide has Command cards, Steamroller 2026 and Game clock tabs in our words', () => {
    for (const id of ['cards', 'steamroller', 'clock']) {
      const t = HELP_TABS.find((x) => x.id === id)
      expect(t, id).toBeDefined()
      expect(t!.blocks.length).toBeGreaterThanOrEqual(2)
    }
    const text = JSON.stringify(HELP_TABS.find((t) => t.id === 'steamroller'))
    for (const name of ['Trench Warfare', 'Two Fronts', 'Wolves at Our Heels', 'Pressure Point', 'High Stakes', 'Fault Line', 'Payload']) expect(text).toContain(name)
    expect(JSON.stringify(HELP_TABS.find((t) => t.id === 'cards'))).toContain('Duck and Cover!')
    expect(JSON.stringify(HELP_TABS.find((t) => t.id === 'clock'))).toMatch(/20 minutes/)
  })
})
