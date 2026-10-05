// M3 integration: board decisions get a usable dock (auto-place, confirm), and moves raised outside the normal
// activation flow (Reposition, Avenging Force) say why they are happening.
import { beforeEach, describe, expect, it } from 'vitest'
import type { PendingDecision } from '../../src/engine/index'
import { setDirectorClock, setPaused } from '../../src/client/presentation/director'
import { newGame, resetGameStore, useGameStore, dispatch, legalFor } from '../../src/client/store/gameStore'
import { useSettingsStore } from '../../src/client/store/settingsStore'
import { memoryStorage, setStorage } from '../../src/client/store/storage'
import { buildPromptView, codeWords } from '../../src/client/ui/promptView'
import { coachTip } from '../../src/client/ui/help/coachText'
import { typeWord } from '../../src/client/ui/format'

const QS = { scenario: 'scn-qs-demo', lists: { A: 'cyg.l.qs-recon', B: 'kha.l.qs-recon' }, controllers: { A: 'human', B: 'human' } as const, seed: 'm3' }

beforeEach(() => {
  setStorage(memoryStorage())
  setDirectorClock(null)
  useSettingsStore.getState().set({ speed: 0 })
  setPaused(false)
  resetGameStore()
})

/** Answer with the first legal action until a decision of `kind` is open. */
function advanceTo(kind: string): PendingDecision {
  for (let i = 0; i < 200; i++) {
    const s = useGameStore.getState().state!
    if (s.pending.kind === kind) return s.pending
    dispatch(legalFor(s)[0]!, 'test')
  }
  throw new Error(`never reached ${kind}`)
}

describe('M3 prompts', () => {
  it('deploy is a board decision that says to click the zone and offers the engine auto-place', () => {
    expect(newGame(QS)).toBeNull()
    const pd = advanceTo('deploy')
    const v = buildPromptView(useGameStore.getState().state!, pd)
    expect(v.form).toBe('board')
    expect(v.title).toMatch(/place your models/i)
    expect(pd.options?.some((o) => o.id === 'auto')).toBe(true)
    expect(coachTip('deploy')).toMatch(/click/i)
  })

  it('a triggered move names its ability, its distance and that it is optional', () => {
    expect(newGame(QS)).toBeNull()
    const state = useGameStore.getState().state!
    const pd: PendingDecision = {
      ...state.pending, kind: 'moveModel', canPass: true, options: [],
      context: { modelId: 'A:L', data: { trigger: { abilityId: 'core.a.reposition', dist: 3, mode: 'advance' } } },
      constraints: { modelId: 'A:L', from: { x: 0, z: 0 }, maxDist: 3 },
    }
    const v = buildPromptView(state, pd)
    expect(v.title).toMatch(/may move up to 3" \(optional\)/)
    expect(v.passLabel).toBe('Skip this move')
  })

  it('effect-raised decisions read as words', () => {
    expect(codeWords('avengingForce')).toBe('Avenging Force')
    expect(typeWord('warEngine')).toBe('War-engine')
  })
})
