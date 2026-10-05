// query.attackPreview: exact odds for the attack the player is about to declare (attack type / shot mode, charge attack).
import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../src/engine/events'
import { query } from '../../src/engine/index'
import { asOut, choose, place, send, startState } from './action-helpers'

const CANNON = 'cyg.w.spellstorm-cannon'

/** Deuce (B:e0) 6" from Razor (A:e0, a construct), everything else parked far away. */
function cannonState(seed: string) {
  let s = startState(seed).state
  let i = 0
  for (const m of Object.values(s.models)) {
    if (m.id === 'A:e0' || m.id === 'B:e0') continue
    s = place(s, m.id, { x: -16 + (i % 8) * 4, z: 16 - Math.floor(i / 8) * 3 })
    i++
  }
  s = place(s, 'B:e0', { x: 0, z: 0 })
  return place(s, 'A:e0', { x: 0, z: 6 })
}

describe('ATK attack previews', () => {
  it('ATK-PRV-001 the Spellstorm Cannon preview follows the chosen attack type (Beat Back, Decrepitation, Blast)', () => {
    const s = cannonState('prv1')
    const beat = query.attackPreview(s, 'B:e0', CANNON, 'A:e0', { attackType: 'beat-back' })
    const dec = query.attackPreview(s, 'B:e0', CANNON, 'A:e0', { attackType: 'decrepitation' })
    const blast = query.attackPreview(s, 'B:e0', CANNON, 'A:e0', { attackType: 'blast' })
    for (const p of [beat, dec, blast]) expect(p.legal).toBeNull()
    // Decrepitation adds a damage die against a construct; Beat Back rolls the plain 2 dice
    expect(beat.damageDice).toBe(2)
    expect(dec.damageDice).toBe(3)
    expect(dec.expectedDamage).toBeGreaterThan(beat.expectedDamage)
    // the blast shot is a POW 12 AOE: a lower direct POW, but a miss in range still deals blast damage to the target
    expect(blast.damageDice).toBe(2)
    expect(blast.pHit).toBeCloseTo(beat.pHit, 9)
    expect(blast.expectedDamage).not.toBeCloseTo(beat.expectedDamage, 6)
    // an unknown mode is refused like the attack would be
    expect(query.attackPreview(s, 'B:e0', CANNON, 'A:e0', { attackType: 'nope' }).legal?.code).toBe('E_NOT_AN_OPTION')
  })

  it('ATK-PRV-002 the preview infers the charge attack: boosted damage on the first melee attack at the charge target only', () => {
    let s = startState('prv2').state
    s = place(s, 'A:e1', { x: 0, z: 0 })
    s = place(s, 'B:e0', { x: 0, z: 7 })
    let o = choose(asOut(s), 'A:e1')
    o = send(o, { type: 'chooseMovement', option: 'charge', modelId: 'A:e1' })
    o = send(o, { type: 'chargeTarget', targetId: 'B:e0' })
    o = send(o, o.pending.options![0]!.action as unknown as Record<string, unknown>)
    const charged = o.events.find((e): e is Extract<GameEvent, { type: 'ChargeResolved' }> => e.type === 'ChargeResolved')!
    expect(charged.chargeAttack).toBe(true)
    o = send(o, { type: 'chooseCombatAction', modelId: 'A:e1', choice: 'melee' })
    const pv = query.attackPreview(o.state, 'A:e1', 'kha.w.lazarenko-knife', 'B:e0')
    expect(pv.legal).toBeNull()
    expect(pv.damageDice).toBe(3) // auto-boosted, no focus asked
    expect(query.attackPreview(o.state, 'A:e1', 'kha.w.lazarenko-knife', 'B:e0', { chargeAttack: false }).damageDice).toBe(2)
    expect(pv.expectedDamage).toBeGreaterThan(query.attackPreview(o.state, 'A:e1', 'kha.w.lazarenko-knife', 'B:e0', { chargeAttack: false }).expectedDamage)
    // an additional attack is never the charge attack
    expect(query.attackPreview(o.state, 'A:e1', 'kha.w.lazarenko-knife', 'B:e0', { additional: true }).damageDice).toBe(2)
  })

  it('ATK-PRV-003 the preview hit chance matches the attack the engine then declares with that mode', () => {
    const s = cannonState('prv3')
    for (const mode of ['beat-back', 'decrepitation', 'blast']) {
      const pv = query.attackPreview(s, 'B:e0', CANNON, 'A:e0', { attackType: mode })
      const asB = asOut({ ...s, activePlayer: 'B', pending: { ...s.pending, kind: 'chooseActivation', player: 'B', id: 'd:900', options: [] }, decisionSeq: 900 })
      let o = choose(asB, 'B:e0')
      o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'B:e0' })
      o = send(o, { type: 'chooseCombatAction', modelId: 'B:e0', choice: 'ranged' })
      o = send(o, { type: 'chooseAttack', modelId: 'B:e0', weaponId: CANNON, targetId: 'A:e0', additional: false, attackType: mode })
      const measured = o.events.find((e): e is Extract<GameEvent, { type: 'AttackMeasured' }> => e.type === 'AttackMeasured')!
      expect(pv.pHit).toBeCloseTo(measured.pHit, 9)
      expect(pv.hitTarget).toBe(measured.hitTarget)
    }
  })
})
