import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data/index'
import { createGame, legalActions, step, validate, type StepResult } from '../../src/engine/index'
import { deriveSeed, nextFloat } from '../../src/engine/rng'

const bundle = loadBundle()

describe('ACT fuzz: random legal play through the public engine API', () => {
  it('ACT-FUZZ random games keep a non-empty legal list, never throw, and every sampled option validates', () => {
    let totalSteps = 0
    let attacks = 0
    for (let g = 0; g < 6; g++) {
      let out: StepResult = createGame({ scenario: 'scn-qs-demo', lists: { A: 'kha.l.qs-recon', B: 'cyg.l.qs-recon' } }, `fuzz-${g}`, bundle)
      let rng = deriveSeed('pick', g)
      const pick = (n: number) => { const [f, nx] = nextFloat(rng); rng = nx; return Math.floor(f * n) }
      for (let i = 0; i < 1500 && out.pending.kind !== 'gameOver'; i++) {
        const legal = legalActions(out.state)
        expect(legal.length).toBeGreaterThan(0)
        for (const a of legal.slice(0, 4)) expect(validate(out.state, a)).toBeNull()
        const next = step(out.state, legal[pick(legal.length)]!)
        expect(next.rejection).toBeUndefined()
        attacks += next.events.filter((e) => e.type === 'AttackDeclared').length
        out = next
        totalSteps++
      }
    }
    expect(totalSteps).toBeGreaterThan(200)
    expect(attacks).toBeGreaterThan(0)
  })
})
