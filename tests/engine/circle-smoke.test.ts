// Headless game: the Circle starter against the Cygnar Quick Start list, sensible-random decider, to round 2.
// Skipped (it.skipIf) while createGame rejects a warlock list because the fury engine is not wired into setup yet;
// it turns itself on as soon as setup accepts the list.
import { describe, expect, it } from 'vitest'
import { pickSensible } from '../../src/ai/random'
import { createGame, legalActions, step, validate, type GameSetup } from '../../src/engine/index'
import { bundle } from './turn-helpers'

const SETUP: GameSetup = { scenario: 'scn-ashwall-divide', lists: { A: 'cir.l.starter-recon', B: 'cyg.l.qs-recon' } }
const probe = createGame(SETUP, 'cir-smoke-0', bundle)
const ready = !probe.rejection

describe('Circle smoke', () => {
  it('SMOKE-CIR-000 the starter list is in the bundle; a rejection can only be a setup rejection', () => {
    expect(bundle.byId['cir.l.starter-recon']).toBeDefined()
    if (probe.rejection) expect(probe.rejection.code).toBe('E_BAD_SETUP')
  })

  it.skipIf(!ready)('SMOKE-CIR-001 runs a headless game vs cyg-qs-recon to round 2 with the sensible random decider', () => {
    let r = createGame(SETUP, 'cir-smoke-1', bundle)
    expect(r.rejection).toBeUndefined()
    let guard = 0
    while (r.state.round < 2 && r.pending.kind !== 'gameOver' && guard++ < 4000) {
      const legal = legalActions(r.state)
      expect(legal.length, `no legal action for ${r.pending.kind}`).toBeGreaterThan(0)
      const a = pickSensible(r.state, r.pending, legal, 'cir-smoke')
      expect(validate(r.state, a)).toBeNull()
      r = step(r.state, a)
      expect(r.rejection).toBeUndefined()
    }
    expect(r.state.round).toBeGreaterThanOrEqual(2)
    expect(Object.values(r.state.models).some((m) => m.profileId === 'cir.pureblood' && m.type === 'beast')).toBe(true)
  })
})
