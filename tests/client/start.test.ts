// Start screen and guide logic (headless): choices, game options, help content, coach memory.
import { describe, expect, it } from 'vitest'
import { buildNewGame, scenarioChoices, sideChoices } from '../../src/client/ui/start/startOptions'
import { HELP_TABS } from '../../src/client/ui/help/helpContent'
import { coachTip, dismissKind, parseCoach, shouldCoach } from '../../src/client/ui/help/coachText'
import { newGame, resetGameStore } from '../../src/client/store/gameStore'
import { setDirectorClock } from '../../src/client/presentation/director'

describe('start screen options', () => {
  it('offers both starter sides with four entries each', () => {
    const sides = sideChoices()
    expect(sides.length).toBeGreaterThanOrEqual(2)
    for (const s of sides) expect(s.models).toHaveLength(4)
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
