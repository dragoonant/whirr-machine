// Headless smoke: the Menoth starter against the Cygnar Quick Start list, both sides driven by the sensible random decider, to round 2.
import { describe, expect, it } from 'vitest'
import { pickSensible } from '../../src/ai/random'
import { loadBundle } from '../../src/data/index'
import { createGame, legalActions, step, type GameSetup, type StepResult } from '../../src/engine/index'

const bundle = loadBundle()
const SETUP: GameSetup = { scenario: 'scn-ashwall-divide', lists: { A: 'men.l.starter-recon', B: 'cyg.l.qs-recon' } }

function playToRound(seed: string, round: number, cap = 6000): { r: StepResult; steps: number } {
  let r = createGame(SETUP, seed, bundle)
  expect(r.rejection).toBeUndefined()
  let steps = 0
  while (r.pending.kind !== 'gameOver' && r.state.round < round && steps < cap) {
    const legal = legalActions(r.state)
    expect(legal.length).toBeGreaterThan(0)
    r = step(r.state, pickSensible(r.state, r.pending, legal, seed))
    expect(r.rejection, `step ${steps}: ${JSON.stringify(r.rejection)}`).toBeUndefined()
    steps++
  }
  return { r, steps }
}

describe('FAC-MEN smoke: Menoth starter vs Cygnar Quick Start', () => {
  for (const seed of ['men-smoke-1', 'men-smoke-2', 'men-smoke-3']) {
    it(`plays to round 2 without a rejection or a throw (${seed})`, () => {
      const { r, steps } = playToRound(seed, 2)
      expect(r.state.round >= 2 || r.pending.kind === 'gameOver').toBe(true)
      expect(steps).toBeGreaterThan(20)
      expect(Object.values(r.state.models).filter((m) => m.owner === 'A').length).toBe(9)
    })
  }
})
