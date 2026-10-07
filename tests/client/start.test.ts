// Start screen and guide logic (headless): choices, game options, help content, coach memory.
import { describe, expect, it } from 'vitest'
import { buildNewGame, scenarioChoices, sideChoices } from '../../src/client/ui/start/startOptions'
import { HELP_TABS } from '../../src/client/ui/help/helpContent'
import { coachTip, dismissKind, parseCoach, shouldCoach } from '../../src/client/ui/help/coachText'
import { newGame, resetGameStore } from '../../src/client/store/gameStore'
import { altColour, factionSideColours, sideColoursFor } from '../../src/client/presentation/labels'
import { SIDE_COLOURS } from '../../src/client/board/layout'
import { usePaintStore } from '../../src/client/figures/paintStore'
import { setDirectorClock } from '../../src/client/presentation/director'

describe('start screen options', () => {
  it('offers every starter side with at least four entries each', () => {
    const sides = sideChoices()
    expect(sides.length).toBeGreaterThanOrEqual(2)
    for (const s of sides) expect(s.models.length).toBeGreaterThanOrEqual(4)
  })
  it('lists scenarios', () => {
    expect(scenarioChoices().map((s) => s.id)).toContain('scn-qs-demo')
  })
  it('puts the player on A against the other faction and the engine accepts it', () => {
    const sides = sideChoices()
    const o = buildNewGame({ listId: sides[0]!.listId, scenario: 'scn-qs-demo', seed: 'start-1' }, sides)!
    expect(o.lists.A).toBe(sides[0]!.listId)
    expect(o.lists.B).not.toBe(o.lists.A)
    expect(o.controllers).toEqual({ A: 'human', B: 'bot' })
    void setDirectorClock
    resetGameStore()
    expect(newGame(o)).toBeNull()
  })
  it('rejects an unknown list', () => {
    expect(buildNewGame({ listId: 'nope', scenario: 'scn-qs-demo' })).toBeNull()
  })
})

describe('how to play content', () => {
  it('has every required tab', () => {
    const ids = HELP_TABS.map((t) => t.id)
    for (const id of ['goal', 'army', 'turn', 'moving', 'attacking', 'focus', 'terrain', 'controls', 'first']) expect(ids).toContain(id)
    for (const t of HELP_TABS) expect(t.blocks.length).toBeGreaterThan(0)
  })
})

describe('coach memory', () => {
  it('has a tip for core decisions and remembers dismissals', () => {
    expect(coachTip('chooseActivation')).toBeTruthy()
    expect(coachTip('gameOver')).toBeNull()
    let m = parseCoach(null)
    expect(shouldCoach(m, 'allocateFocus')).toBe(true)
    m = dismissKind(m, 'allocateFocus')
    expect(shouldCoach(m, 'allocateFocus')).toBe(false)
    expect(shouldCoach(m, 'chooseActivation')).toBe(true)
    expect(shouldCoach({ ...m, off: true }, 'chooseActivation')).toBe(false)
    expect(parseCoach(JSON.stringify(m))).toEqual(m)
    expect(parseCoach('{bad')).toEqual({ off: false, seen: [] })
  })
})

describe('start screen opponent and side colours', () => {
  const sides = sideChoices()
  it('any faction can face any faction, including a mirror', () => {
    const o = buildNewGame({ listId: sides[0]!.listId, opponentListId: sides[0]!.listId, scenario: 'scn-qs-demo', seed: 'm1' }, sides)!
    expect(o.lists.A).toBe(o.lists.B)
    resetGameStore()
    expect(newGame(o)).toBeNull()
  })
  it('random opponent is repeatable per seed and varies across seeds', () => {
    const pick = (seed: string) => buildNewGame({ listId: sides[0]!.listId, scenario: 'scn-qs-demo', seed }, sides)!.lists.B
    expect(pick('s1')).toBe(pick('s1'))
    expect(new Set(Array.from({ length: 30 }, (_, i) => pick('seed' + i))).size).toBeGreaterThan(2)
  })
  it('sides take faction colours; a mirror gets a contrasting second palette', () => {
    const cygKha = sideColoursFor('cyg', 'kha')
    expect(cygKha.altB).toBe(false)
    expect(cygKha.colours.A.ring).toBe('#4f78c8')
    expect(cygKha.colours.B.ring).toBe('#d24545')
    const mirror = sideColoursFor('kha', 'kha')
    expect(mirror.altB).toBe(true)
    expect(mirror.colours.B.primary).not.toBe(mirror.colours.A.primary)
    expect(mirror.colours.B.ring).not.toBe(mirror.colours.A.ring)
    for (const f of ['cyg', 'kha', 'trl', 'cir', 'cry', 'men']) expect(altColour(factionSideColours(f).primary)).not.toBe(factionSideColours(f).primary)
  })
  it('starting a game applies the colours and the mirror paint override', () => {
    resetGameStore()
    const kha = sides.find((s) => s.factionId === 'kha')!
    expect(newGame(buildNewGame({ listId: kha.listId, opponentListId: kha.listId, scenario: 'scn-qs-demo', seed: 'm2' }, sides)!)).toBeNull()
    expect(SIDE_COLOURS.A.ring).toBe('#d24545')
    expect(SIDE_COLOURS.B.ring).not.toBe('#d24545')
    expect(usePaintStore.getState().bySide.B?.primary).toBeTruthy()
    resetGameStore()
    const cyg = sides.find((s) => s.factionId === 'cyg')!
    expect(newGame(buildNewGame({ listId: cyg.listId, opponentListId: kha.listId, scenario: 'scn-qs-demo', seed: 'm3' }, sides)!)).toBeNull()
    expect(usePaintStore.getState().bySide.B).toBeUndefined()
    expect(SIDE_COLOURS.B.ring).toBe('#d24545')
  })
})

describe('M9 army picker', () => {
  it('lists all six factions with warlocks and warbeasts named as such', () => {
    const sides = sideChoices()
    expect(sides.map((s) => s.factionId).sort()).toEqual(['cir', 'cry', 'cyg', 'kha', 'men', 'trl'])
    const trl = sides.find((s) => s.factionId === 'trl')!
    expect(trl.models[0]!.role).toBe('Warlock')
    expect(trl.models.some((m) => m.role === 'Warbeast')).toBe(true)
    expect(sides.find((s) => s.factionId === 'cry')!.models[0]!.role).toBe('Warcaster')
  })
})
