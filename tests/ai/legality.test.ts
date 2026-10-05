// 40-ai §2/§9: the utility decider never returns an illegal action. Five seeded games (normal vs easy and normal vs
// random, both sides and both factions) are played to the end; every AI answer must be accepted by step().
import { describe, expect, it } from 'vitest'
import { decideSync, newBrain } from '../../src/ai/decider'
import { pickSensible } from '../../src/ai/random'
import { createGame, legalActions, step, validate, type PlayerId } from '../../src/engine/index'
import { ASH, bundle } from './helpers'

type Tier = 'normal' | 'easy' | 'random'

function play(seed: string, a: Tier, b: Tier, swap: boolean): { rejected: string[]; ended: boolean; decisions: number; maxMs: number; fallbacks: number } {
  let s = createGame(ASH(swap), seed, bundle).state
  const tiers: Record<PlayerId, Tier> = { A: a, B: b }
  const brains = { A: newBrain(), B: newBrain() }
  const rejected: string[] = []
  let i = 0, maxMs = 0
  for (; i < 4000 && s.pending.kind !== 'gameOver'; i++) {
    const p = s.pending.player
    const legal = legalActions(s)
    const t0 = performance.now()
    const act = tiers[p] === 'random'
      ? pickSensible(s, s.pending, legal, `${seed}:${p}`)
      : decideSync(s, s.pending, legal, { tier: tiers[p] as 'normal' | 'easy', seed: `${seed}:${p}`, brain: brains[p] })
    maxMs = Math.max(maxMs, performance.now() - t0)
    const v = validate(s, act)
    if (v) { rejected.push(`${s.pending.kind}: ${act.type} ${v.code} ${v.message}`); break }
    const r = step(s, act)
    if (r.rejection) { rejected.push(`${s.pending.kind}: ${act.type} ${r.rejection.code}`); break }
    s = r.state
  }
  // the decider's own pick must be legal: a fallback to the random bot counts as a failure here
  return { rejected, ended: s.pending.kind === 'gameOver', decisions: i, maxMs, fallbacks: brains.A.stats.fallbacks + brains.B.stats.fallbacks }
}

describe('AI decider legality (5 seeded games)', () => {
  const games: [string, Tier, Tier, boolean][] = [
    ['leg-1', 'normal', 'easy', false],
    ['leg-2', 'easy', 'normal', true],
    ['leg-3', 'normal', 'random', false],
    ['leg-4', 'random', 'normal', true],
    ['leg-5', 'normal', 'normal', false],
  ]
  for (const [seed, a, b, swap] of games) {
    it(`AI-LEGAL ${seed}: ${a} vs ${b} plays to the end with no rejected answer`, () => {
      const r = play(seed, a, b, swap)
      expect(r.rejected).toEqual([])
      expect(r.ended).toBe(true)
      expect(r.fallbacks).toBe(0)
    }, 120_000)
  }
})
