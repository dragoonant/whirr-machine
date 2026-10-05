// 40-ai §8 tiers in the client: the start screen's Opponent select picks the tier (default normal) and the bot
// driver answers with the utility AI for easy/normal (main thread when no worker exists, as in tests).
import { afterEach, describe, expect, it } from 'vitest'
import { chooseBotAction, isAiTier } from '../../src/client/bot/botDriver'
import { BOT_TIERS, buildNewGame, DEFAULT_BOT_TIER, sideChoices } from '../../src/client/ui/start/startOptions'
import { legalActions, validate } from '../../src/engine/index'
import { ASH, playUntil } from './helpers'

const g = globalThis as { document?: unknown }
afterEach(() => { delete g.document })

describe('bot tiers on the start screen and in the driver', () => {
  it('AI-TIER-1 lists normal, easy and random with normal first and default', () => {
    expect(BOT_TIERS.map((b) => b.id)).toEqual(['normal', 'easy', 'random'])
    expect(DEFAULT_BOT_TIER).toBe('normal')
    const sides = sideChoices()
    expect(buildNewGame({ listId: sides[0]!.listId, scenario: 'scn-ashwall-divide' }, sides)!.bot).toEqual({ tier: 'normal' })
    expect(buildNewGame({ listId: sides[0]!.listId, scenario: 'scn-ashwall-divide', tier: 'easy' }, sides)!.bot).toEqual({ tier: 'easy' })
  })
  it('AI-TIER-2 reads the Opponent select when the start screen does not pass a tier', () => {
    g.document = { querySelector: (sel: string) => (sel.includes('start-opponent') ? { value: 'random' } : null) }
    const sides = sideChoices()
    expect(buildNewGame({ listId: sides[0]!.listId, scenario: 'scn-ashwall-divide' }, sides)!.bot).toEqual({ tier: 'random' })
  })
  it('AI-TIER-3 easy and normal answer through the utility AI with legal actions', () => {
    expect(isAiTier('normal')).toBe(true)
    expect(isAiTier('easy')).toBe(true)
    expect(isAiTier('random')).toBe(false)
    const s = playUntil(ASH(), 'tier-1', (x) => x.round >= 1 && x.pending.kind === 'chooseMovement')
    for (const tier of ['easy', 'normal', 'random'] as const) {
      const a = chooseBotAction(s, s.pending, legalActions(s), 'tier-1', tier)
      expect(validate(s, a)).toBeNull()
    }
  })
})
