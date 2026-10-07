// M10 Trollbloods follow-up: Highwaymen are 5 grunts on 40 mm bases (Ambush arrival, Snipe on a unit).
import { describe, expect, it } from 'vitest'
import { rangeBonus } from '../../src/engine/factions/trollbloods'
import { suggestAmbush, validateAmbush } from '../../src/engine/ambush'
import { answerSetup } from '../../src/engine/setup'
import { asOut, bundle, choose, place, send, withModel } from './action-helpers'
import { must, newGame, runControlTo, runSetup } from './turn-helpers'
import type { GameState } from '../../src/engine/types'

const TRL = 'trl.l.starter-recon'

describe('Trollbloods Highwaymen (5 grunts)', () => {
  it('CORE-040b Ambush: all five 40 mm Highwaymen get a legal arrival inside the 3" strip, within the unit spread', () => {
    let out = newGame({ scenario: 'scn-ashwall-divide', lists: { A: TRL, B: 'cyg.l.qs-recon' } }, 'trl-amb')
    for (let i = 0; i < 20 && out.state.phase !== 'control'; i++) {
      const opts = out.pending.options ?? []
      const amb = opts.find((x) => x.id === 'ambush')
      const pick = amb && out.pending.player === 'A' ? amb : opts[0]!
      out = must(answerSetup(out.state, bundle, pick.action))
      if (out.state.phase !== 'deploy' && out.state.phase !== 'setup') break
    }
    const waiting = out.state.players.A.ambushIds
    const unit = waiting.filter((id) => out.state.models[id]!.unitId)
    expect(unit.length).toBe(5)
    const sug = suggestAmbush(out.state, bundle, 'A')
    expect(sug.map((p) => p.modelId).sort()).toEqual([...waiting].sort())
    const bad = validateAmbush(out.state, bundle, { type: 'placeTroopers', decisionId: 'x', player: 'A', placements: sug } as never)
    expect(bad).toBeNull()
  })

  it('FAC-TRL-014c Snipe on a Highwayman covers the whole unit, as one upkeep', () => {
    let s: GameState = runControlTo(runSetup(newGame({ scenario: 'scn-qs-demo', lists: { A: TRL, B: 'cyg.l.qs-recon' } }, 'trl-snipe'))).state
    let i = 0
    for (const m of Object.values(s.models)) {
      if (m.id === 'A:L') continue
      s = place(s, m.id, m.owner === 'A' ? { x: -16 + (i % 8) * 1.8, z: 14 } : { x: -16 + (i % 8) * 4, z: -16 })
      i++
    }
    s = place(s, 'A:L', { x: 0, z: 0 })
    const unit = Object.values(s.models).filter((m) => m.unitId && m.owner === 'A')
    expect(unit.length).toBe(5)
    unit.forEach((m, k) => { s = place(s, m.id, { x: 2 + k * 1.2, z: 1 }) })
    s = withModel(s, 'A:L', { fury: 6 })
    let o = choose(asOut(s), 'A:L')
    o = send(o, { type: 'castSpell', casterId: 'A:L', spellId: 'trl.s.snipe', targetId: unit[0]!.id })
    for (const m of unit) expect(rangeBonus(o.state, m.id), m.id).toBe(3)
    expect(o.state.effects.filter((e) => e.sourceId === 'trl.s.snipe').length).toBe(1)
  })
})
