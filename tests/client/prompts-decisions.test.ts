// Dock prompts for the newer engine decisions (reroll, rollAnyway, chooseGrid, channel, combinedAttack, free attacks).
import { beforeEach, describe, expect, it } from 'vitest'
import type { Action, PendingDecision } from '../../src/engine/index'
import { setDirectorClock, setPaused } from '../../src/client/presentation/director'
import { newGame, resetGameStore, useGameStore } from '../../src/client/store/gameStore'
import { useSettingsStore } from '../../src/client/store/settingsStore'
import { memoryStorage, setStorage } from '../../src/client/store/storage'
import { buildPromptView } from '../../src/client/ui/promptView'

const QS = { scenario: 'scn-qs-demo', lists: { A: 'cyg.l.qs-recon', B: 'kha.l.qs-recon' }, controllers: { A: 'human', B: 'human' } as const, seed: 'pd' }

beforeEach(() => {
  setStorage(memoryStorage())
  setDirectorClock(null)
  useSettingsStore.getState().set({ speed: 0 })
  setPaused(false)
  resetGameStore()
  expect(newGame(QS)).toBeNull()
})

const act = (type: string, extra: Record<string, unknown> = {}) => ({ type, decisionId: 'd1', player: 'A', ...extra }) as unknown as Action
function pend(over: Partial<PendingDecision>): PendingDecision {
  const state = useGameStore.getState().state!
  return { ...state.pending, canPass: false, options: [], context: {}, ...over }
}
const view = (pd: PendingDecision) => buildPromptView(useGameStore.getState().state!, pd)

describe('new decision prompts', () => {
  it('attack reroll shows the engine odds and defaults to keep when re-rolling does not help', () => {
    const v = view(pend({
      kind: 'reroll', context: { modelId: 'A:L', targetId: 'B:L', odds: { pHit: 0.4, pCrit: 0.1 }, data: { code: 'x.reroll', roll: 'attack', holder: 'B', before: [4, 4], total: 9, hit: true, crit: false, targetNumber: 8 } },
      options: [
        { id: 'reroll', label: 'Re-roll', action: act('reroll', { reroll: true }), odds: { pHit: 0.4, pCrit: 0.1 }, cost: { focus: 1 } },
        { id: 'keep', label: 'Keep', action: act('reroll', { reroll: false }), odds: { pHit: 1, pCrit: 0 } },
      ],
    }))
    expect(v.options.find((o) => o.id === 'reroll')!.note).toMatch(/hit 40%/)
    expect(v.options.find((o) => o.id === 'reroll')!.cost).toMatch(/1/)
    expect(v.defaultId).toBe('keep')
    expect(v.lines.join(' ')).toMatch(/4 \+ 4/)
  })

  it('damage reroll compares points with expected damage and defaults to re-roll when it is better', () => {
    const v = view(pend({
      kind: 'reroll', context: { modelId: 'A:L', targetId: 'B:L', data: { code: 'x', roll: 'damage', holder: 'A', before: [1, 2], total: 6, points: 1, armor: 5 } },
      options: [
        { id: 'reroll', label: 'Re-roll', action: act('reroll', { reroll: true }), odds: { expectedDamage: 3.2 } },
        { id: 'keep', label: 'Keep', action: act('reroll', { reroll: false }), odds: { expectedDamage: 1 } },
      ],
    }))
    expect(v.options.find((o) => o.id === 'reroll')!.note).toMatch(/avg 3\.2/)
    expect(v.options.find((o) => o.id === 'keep')!.note).toMatch(/1 damage/)
    expect(v.defaultId).toBe('reroll')
  })

  it('roll anyway shows hit and crit odds and defaults to the sure hit', () => {
    const v = view(pend({
      kind: 'rollAnyway', context: { targetId: 'B:L', odds: { pHit: 0.83, pCrit: 0.17 } },
      options: [
        { id: 'accept', label: 'a', action: act('rollAnyway', { roll: false }) },
        { id: 'roll', label: 'r', action: act('rollAnyway', { roll: true }) },
      ],
    }))
    expect(v.options.find((o) => o.id === 'roll')!.note).toMatch(/crit 17%/)
    expect(v.defaultId).toBe('accept')
  })

  it('grid choice gives one button per open grid with its fill', () => {
    const v = view(pend({
      kind: 'chooseGrid', context: { modelId: 'A:L', targetId: 'B:L', data: { points: 4, instanceId: 'j', grids: [{ id: 'left', filled: 2, boxes: 6, open: true }, { id: 'right', filled: 6, boxes: 6, open: false }] } },
      options: [{ id: 'left', label: 'Left grid', action: act('chooseGrid', { grid: 'left' }) }],
    }))
    expect(v.title).toMatch(/4 damage/)
    expect(v.options).toHaveLength(1)
    expect(v.options[0]!.note).toBe('2 of 6 boxes filled')
  })

  it('channel offers caster and nodes, and pass cancels the cast', () => {
    const v = view(pend({
      kind: 'channel', canPass: true, context: { modelId: 'A:L', data: { spellId: 'cyg.s.x', nodes: ['A:N'] } },
      options: [
        { id: 'caster', label: 'c', action: act('channel', { via: null }) },
        { id: 'via:A:N', label: 'n', action: act('channel', { via: 'A:N' }) },
      ],
    }))
    expect(v.options).toHaveLength(2)
    expect(v.defaultId).toBe('caster')
    expect(v.passLabel).toBe('Cancel the cast')
  })

  it('combined attack picker lists each group by name', () => {
    const v = view(pend({
      kind: 'combinedAttack', canPass: true, context: { modelId: 'A:L', targetId: 'B:L', data: { weaponId: 'w.x', eligible: ['A:L'] } },
      options: [{ id: 'join:A:L', label: '1 join', action: act('combinedAttack', { primaryId: 'A:L', contributorIds: ['A:L'], targetId: 'B:L', weaponId: 'w.x' }) }],
    }))
    expect(v.options[0]!.note).toBe('1 join')
    expect(v.passLabel).toMatch(/Back/)
  })

  it('chooseAttack with combined options adds dock buttons and the additional-attack note', () => {
    const v = view(pend({
      kind: 'chooseAttack', canPass: false, context: { modelId: 'A:L' },
      options: [
        { id: 'a1', label: 'x', action: act('chooseAttack', { modelId: 'A:L', weaponId: 'w.x', targetId: 'B:L', additional: false }) },
        { id: 'a2', label: 'y', action: act('chooseAttack', { modelId: 'A:L', weaponId: 'w.x', targetId: 'B:L', additional: true }), cost: { focus: 1 } },
        { id: 'c', label: 'z', action: act('combinedAttack', { primaryId: 'A:L', contributorIds: [], targetId: 'B:L', weaponId: 'w.x' }) },
      ],
    }))
    expect(v.form).toBe('buttons')
    expect(v.options.map((o) => o.id)).toEqual(['c'])
    expect(v.lines.join(' ')).toMatch(/additional/)
    expect(v.defaultId).toBeNull()
  })

  it('a trigger attack is a dock prompt with weapon odds and a pass button', () => {
    const v = view(pend({
      kind: 'chooseAttack', canPass: true, context: { modelId: 'A:L', targetId: 'B:L', data: { code: 'triggerAttack', abilityId: 'core.a.reciprocate' } },
      options: [{ id: 'w', label: 'w', action: act('chooseAttack', { modelId: 'A:L', weaponId: 'w.x', targetId: 'B:L', additional: false }), odds: { pHit: 0.72 } }],
    }))
    expect(v.form).toBe('buttons')
    expect(v.options[0]!.note).toMatch(/72%/)
    expect(v.canPass).toBe(true)
    expect(v.title).toMatch(/may attack/)
  })
})
