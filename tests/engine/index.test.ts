// Public engine API (00 §2, §5, §8, §10) and the 60 §2 invariants, through src/engine/index.ts only.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data/index'
import { pickSensible } from '../../src/ai/random'
import {
  createGame, describe as describeNums, legalActions, load, query, replay, save, step, validate,
  type Action, type GameSetup, type StepResult,
} from '../../src/engine/index'
import { runGame } from '../../tools/sim'

const bundle = loadBundle()
const S1: GameSetup = { scenario: 'scn-ashwall-divide', lists: { A: 'kha.l.qs-recon', B: 'cyg.l.qs-recon' } }
const QS: GameSetup = { scenario: 'scn-qs-demo', lists: { A: 'kha.l.qs-recon', B: 'cyg.l.qs-recon' } }

/** Play with the sensible bot until `until` holds or the game ends. */
function playUntil(start: StepResult, seed: string, until: (r: StepResult) => boolean, cap = 4000): StepResult {
  let r = start
  for (let i = 0; i < cap && r.pending.kind !== 'gameOver' && !until(r); i++) {
    const legal = legalActions(r.state)
    expect(legal.length).toBeGreaterThan(0)
    r = step(r.state, pickSensible(r.state, r.pending, legal, seed))
    expect(r.rejection).toBeUndefined()
  }
  return r
}

describe('engine API', () => {
  it('ACT-004 createGame rolls off itself and raises chooseTurnOrder for the winner', () => {
    const r = createGame(S1, 'api-1', bundle)
    expect(r.rejection).toBeUndefined()
    expect(r.pending.kind).toBe('chooseTurnOrder')
    expect(r.events.some((e) => e.type === 'RollOffWon')).toBe(true)
    expect(legalActions(r.state).length).toBe(2)
  })

  it('createGame with an unknown list is rejected with E_BAD_SETUP, never thrown', () => {
    const r = createGame({ ...S1, lists: { A: 'nope', B: 'cyg.l.qs-recon' } }, 'x', bundle)
    expect(r.rejection?.code).toBe('E_BAD_SETUP')
  })

  it('INV-reject a wrong decision id or player is rejected with the same state reference', () => {
    const r = createGame(S1, 'api-2', bundle)
    const good = legalActions(r.state)[0]!
    const wrongId = step(r.state, { ...good, decisionId: 'd:999' } as Action)
    expect(wrongId.rejection?.code).toBe('E_WRONG_DECISION')
    expect(wrongId.state).toBe(r.state)
    expect(wrongId.events[0]?.type).toBe('ActionRejected')
    const wrongPlayer = validate(r.state, { ...good, player: good.player === 'A' ? 'B' : 'A' } as Action)
    expect(wrongPlayer?.code).toBe('E_NOT_YOUR_DECISION')
  })

  it('ACT-001 endTurn while models are unactivated is rejected', () => {
    const r = playUntil(createGame(QS, 'api-3', bundle), 'bot', (x) => x.pending.kind === 'chooseActivation')
    expect(r.pending.kind).toBe('chooseActivation')
    const end = validate(r.state, { type: 'endTurn', decisionId: r.pending.id, player: r.pending.player })
    expect(end?.code).toBe('E_NOT_AN_OPTION')
  })

  it('INV-legal every offered action validates, and play reaches the activation phase', () => {
    let r = createGame(QS, 'api-4', bundle)
    for (let i = 0; i < 60 && r.pending.kind !== 'gameOver'; i++) {
      const legal = legalActions(r.state)
      expect(legal.length).toBeGreaterThan(0)
      for (const a of legal) expect(validate(r.state, a)).toBeNull()
      r = step(r.state, pickSensible(r.state, r.pending, legal, 'inv'))
    }
    expect(r.state.round).toBeGreaterThanOrEqual(1)
  })

  it('INV-determinism replay and save/load reproduce the played state', () => {
    const r = playUntil(createGame(S1, 'api-5', bundle), 'det', (x) => x.state.log.length >= 120)
    const again = replay(S1, 'api-5', bundle, r.state.log)
    expect(again.rejection).toBeUndefined()
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(r.state))
    const file = save(r.state, 'mid')
    expect(file.actions.length).toBe(r.state.log.length)
    const back = load(file, bundle)
    expect(back.pending.id).toBe(r.pending.id)
    expect(JSON.stringify(back.state)).toBe(JSON.stringify(r.state))
    expect(load({ ...file, dataVersion: 'other' }, bundle).rejection?.code).toBe('E_DATA_VERSION')
  })

  it('query helpers give the UI its numbers: distance, LOS, threat, attack odds, control', () => {
    const r = playUntil(createGame(QS, 'api-6', bundle), 'q', (x) => x.pending.kind === 'chooseActivation')
    const s = r.state
    expect(query.distance(s, 'A:L', 'B:L')).toBeGreaterThan(0)
    const t = query.threat(s, 'A:L')
    expect(t.run).toBe(t.advance + 5) // MK4: run = SPD + 5
    expect(t.charge).toBe(t.advance + 3 + t.meleeRange)
    expect(t.meleeRange).toBeGreaterThanOrEqual(1)
    const los = query.los(s, 'A:L', 'B:L')
    expect(typeof los.visible).toBe('boolean')
    const ctl = query.control(s)
    expect(Object.keys(ctl.elements).length).toBe(2)
    expect(query.powerAttackPow(30, 50)).toBe(12)
    expect(query.powerAttackPow(50, 30)).toBe(14)
    // a melee preview from far away is out of range; from base contact it has real odds
    const far = query.attackPreview(s, 'A:L', 'kha.w.mechanika-axe', 'B:L')
    expect(far.legal?.code).toBe('E_OUT_OF_RANGE')
    const tgt = s.models['B:L']!
    const near = query.attackPreview(s, 'A:L', 'kha.w.mechanika-axe', 'B:L', { fromPos: { x: tgt.pos.x, z: tgt.pos.z - 1.2 } })
    if (near.legal === null) {
      expect(near.pHit).toBeGreaterThan(0)
      expect(near.pHit).toBeLessThanOrEqual(1)
      expect(near.expectedDamage).toBeGreaterThanOrEqual(0)
      expect(describeNums.percent(near.pHit)).toMatch(/%$/)
    }
    expect(describeNums.decision(s, r.pending).title).toContain('chooseActivation')
  })

  it('SIM a short headless batch ends every game with no invariant violations', () => {
    for (let g = 0; g < 3; g++) {
      const { summary, violations } = runGame(g, { seed: 'vitest', scenario: 'scn-ashwall-divide', cap: 5000, stall: 200, wallMs: 60_000 }, bundle)
      expect(violations).toEqual([])
      expect(summary.ended).toBe(true)
    }
  })
})
