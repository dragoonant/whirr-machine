import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../src/engine/events'
import { armOf, statOf, codeHooks, rec } from '../../src/engine/code-hooks'
import { asOut, bundle, choose, evTypes, openCombat, place, send, settle, startState, trySend, withModel } from './action-helpers'

const far = { x: 15, z: 15 }
/** Park every model except `keep` far from the action so it cannot interfere (LOS, engagement, blast sets). */
function clear(out: ReturnType<typeof startState>, keep: string[], spots: Record<string, { x: number; z: number }>) {
  let s = out.state
  let i = 0
  for (const m of Object.values(s.models)) {
    if (keep.includes(m.id)) continue
    s = place(s, m.id, { x: -16 + (i % 8) * 4, z: 16 - Math.floor(i / 8) * 3 })
    i++
  }
  for (const [id, p] of Object.entries(spots)) s = place(s, id, p)
  return asOut(s)
}
void far

describe('ATK combat action flow', () => {
  it('ATK-001 melee range is 1": 1.0 allowed, 1.1 rejected', () => {
    const r1 = 30 / 25.4 / 2, r2 = 50 / 25.4 / 2
    const mk = (gap: number) => {
      const out = clear(startState(), ['A:L', 'B:e0'], { 'A:L': { x: 0, z: 0 }, 'B:e0': { x: r1 + r2 + gap, z: 0 } })
      return openCombat(out, 'A:L', 'melee')
    }
    const ok = trySend(mk(1.0), { type: 'chooseAttack', modelId: 'A:L', weaponId: 'kha.w.mechanika-axe', targetId: 'B:e0', additional: false })
    expect(ok && 'rejection' in ok).toBe(false)
    const bad = trySend(mk(1.1), { type: 'chooseAttack', modelId: 'A:L', weaponId: 'kha.w.mechanika-axe', targetId: 'B:e0', additional: false })
    expect(bad && 'rejection' in bad && bad.rejection.code).toBe('E_OUT_OF_RANGE')
  })

  it('ATK-003/004 only Dual Attack models mix melee and ranged', () => {
    const out = clear(startState(), ['A:e1', 'B:e0'], { 'A:e1': { x: 0, z: 0 }, 'B:e0': { x: 4, z: 0 } })
    const o = openCombat(out, 'A:e1', 'ranged')
    const bad = trySend(o, { type: 'chooseAttack', modelId: 'A:e1', weaponId: 'kha.w.lazarenko-knife', targetId: 'B:e0', additional: false })
    expect(bad && 'rejection' in bad && bad.rejection.code).toBe('E_NO_DUAL_ATTACK')
    // Deuce has Dual Attack: ranged then melee in one Combat Action
    let d = clear(startState(), ['B:e0', 'A:e0'], { 'B:e0': { x: 0, z: 0 }, 'A:e0': { x: 2.2, z: 0 } })
    d = asOut({ ...d.state, activePlayer: 'B' })
    d = { ...d, state: { ...d.state, models: { ...d.state.models } } }
    const st = withModel(d.state, 'B:e0', { activated: false })
    const dd = asOut({ ...st, pending: { ...st.pending, kind: 'chooseActivation', player: 'B', id: 'd:900', options: [] }, decisionSeq: 900 })
    let o2 = send(dd, { type: 'chooseActivation', activate: 'B:e0' })
    o2 = send(o2, { type: 'chooseMovement', option: 'forfeit', modelId: 'B:e0' })
    o2 = send(o2, { type: 'chooseCombatAction', modelId: 'B:e0', choice: 'dual' })
    o2 = send(o2, { type: 'chooseAttack', modelId: 'B:e0', weaponId: 'cyg.w.spellstorm-cannon', targetId: 'A:e0', additional: false })
    o2 = settle(o2)
    expect(o2.pending.kind).toBe('chooseAttack')
    const blade = trySend(o2, { type: 'chooseAttack', modelId: 'B:e0', weaponId: 'cyg.w.crescent-blade', targetId: 'A:e0', additional: false })
    expect(blade && 'rejection' in blade).toBe(false)
  })

  it('ATK-006 an additional melee attack costs 1 focus and needs it', () => {
    let out = clear(startState(), ['A:L', 'B:e0'], { 'A:L': { x: 0, z: 0 }, 'B:e0': { x: 30 / 25.4 / 2 + 50 / 25.4 / 2 + 0.9, z: 0 } })
    out = asOut(withModel(out.state, 'A:L', { focus: 1 }))
    let o = openCombat(out, 'A:L', 'melee')
    o = settle(send(o, { type: 'chooseAttack', modelId: 'A:L', weaponId: 'kha.w.mechanika-axe', targetId: 'B:e0', additional: false }))
    o = settle(send(o, { type: 'chooseAttack', modelId: 'A:L', weaponId: 'kha.w.combat-knife', targetId: 'B:e0', additional: false }))
    expect(o.state.models['A:L']!.focus).toBe(1)
    const early = trySend(o, { type: 'chooseAttack', modelId: 'A:L', weaponId: 'kha.w.mechanika-axe', targetId: 'B:e0', additional: true })
    o = settle(send(o, { type: 'chooseAttack', modelId: 'A:L', weaponId: 'kha.w.mechanika-axe', targetId: 'B:e0', additional: true }))
    void early
    expect(o.state.models['A:L']!.focus).toBe(0)
    const none = trySend(o, { type: 'chooseAttack', modelId: 'A:L', weaponId: 'kha.w.mechanika-axe', targetId: 'B:e0', additional: true })
    expect(none && 'rejection' in none && none.rejection.code).toBe('E_INSUFFICIENT_FOCUS')
  })
})

const rolls = (out: ReturnType<typeof startState>, purpose: string) =>
  out.events.filter((e): e is Extract<GameEvent, { type: 'DiceRolled' }> => e.type === 'DiceRolled' && e.purpose === purpose)
const seeded = (seed: string) => startState(seed)

describe('boost, power field', () => {
  it('ATK-008 boosting an attack costs 1 focus and rolls 3 dice; declining rolls 2', () => {
    const setup = (seed: string) => clear(seeded(seed), ['A:e0', 'B:e0'], { 'A:e0': { x: 0, z: 0 }, 'B:e0': { x: 0, z: 7 } })
    let o = openCombat(setup('b1'), 'A:e0', 'ranged')
    o = send(o, { type: 'chooseAttack', modelId: 'A:e0', weaponId: 'kha.w.slug-cannon', targetId: 'B:e0', additional: false })
    expect(o.pending.kind).toBe('boostAttack')
    expect(o.pending.options![1]!.odds!.pHit).toBeGreaterThan(o.pending.options![0]!.odds!.pHit!)
    const f0 = o.state.models['A:e0']!.focus
    const boosted = send(o, { type: 'boostAttack', boost: true })
    expect(rolls(boosted, 'attack')[0]!.dice).toHaveLength(3)
    expect(boosted.state.models['A:e0']!.focus).toBe(f0 - 1)
    const plain = send(o, { type: 'boostAttack', boost: false })
    expect(rolls(plain, 'attack')[0]!.dice).toHaveLength(2)
    expect(plain.state.models['A:e0']!.focus).toBe(f0)
  })

  it('DMG-014 Power Field: spend 1 focus to cut an instance by 5 (Vilkul hit by the Spellstorm Cannon)', () => {
    let seen = 0
    for (let i = 0; i < 60 && !seen; i++) {
      let out = clear(seeded('pf' + i), ['A:L', 'B:e0'], { 'A:L': { x: 0, z: 0 }, 'B:e0': { x: 0, z: 8 } })
      out = asOut({ ...out.state, activePlayer: 'B', pending: { ...out.state.pending, kind: 'chooseActivation', player: 'B', id: 'd:900', options: [] }, decisionSeq: 900 })
      let o = send(out, { type: 'chooseActivation', activate: 'B:e0' })
      o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'B:e0' })
      o = send(o, { type: 'chooseCombatAction', modelId: 'B:e0', choice: 'ranged' })
      o = send(o, { type: 'chooseAttack', modelId: 'B:e0', weaponId: 'cyg.w.spellstorm-cannon', targetId: 'A:L', additional: false })
      for (let k = 0; k < 6 && o.pending.kind !== 'powerField' && ['boostAttack', 'abilityChoice', 'boostDamage'].includes(o.pending.kind); k++) {
        o = o.pending.kind === 'abilityChoice' ? send(o, { type: 'abilityChoice', optionId: 'no' }) : send(o, { type: o.pending.kind, boost: false })
      }
      if (o.pending.kind !== 'powerField') continue
      seen++
      const before = o.state.models['A:L']!.focus
      expect(o.pending.player).toBe('A')
      const after = send(o, { type: 'powerField', spend: 1 })
      expect(after.state.models['A:L']!.focus).toBe(before - 1)
      const used = after.events.find((e) => e.type === 'PowerFieldUsed') as Extract<GameEvent, { type: 'PowerFieldUsed' }>
      expect(used.reduced).toBeGreaterThan(0)
    }
    expect(seen).toBe(1)
  })
})

describe('AOE and spray', () => {
  const blastScene = (seed: string) => clear(seeded(seed), ['A:e0', 'B:e0', 'B:e1', 'B:u2.1', 'B:u2.3', 'B:u2.2'], {
    'A:e0': { x: 0, z: -8 }, 'B:e0': { x: 0, z: 0 }, 'B:e1': { x: 2.2, z: 0 }, 'B:u2.1': { x: -2.8, z: 0 }, 'B:u2.3': { x: 0, z: 3.1 }, 'B:u2.2': { x: 6, z: 3 },
  })
  const fire = (seed: string) => {
    let o = openCombat(blastScene(seed), 'A:e0', 'ranged')
    o = send(o, { type: 'chooseAttack', modelId: 'A:e0', weaponId: 'kha.w.grenade-launcher', targetId: 'B:e0', additional: false })
    return settle(o)
  }
  it('AOE-001/003 a direct hit blasts the 2 closest other models; a miss blasts only the target', () => {
    let hit = 0, miss = 0
    for (let i = 0; i < 80 && (hit < 2 || miss < 2); i++) {
      const o = fire('aoe' + i)
      const res = o.events.find((e) => e.type === 'AttackResolved') as Extract<GameEvent, { type: 'AttackResolved' }>
      const dmg = o.events.filter((e): e is Extract<GameEvent, { type: 'DamageApplied' }> => e.type === 'DamageApplied')
      if (res.hit) {
        hit++
        const fixed = o.events.find((e) => e.type === 'BlastTargetsFixed') as Extract<GameEvent, { type: 'BlastTargetsFixed' }>
        expect(fixed.targetIds).toHaveLength(2)
        expect(fixed.targetIds.sort()).toEqual(['B:e1', 'B:u2.1'])
        expect(dmg.filter((d) => d.source === 'blast').map((d) => d.targetId).sort()).toEqual(['B:e1', 'B:u2.1'])
        expect(dmg.find((d) => d.source === 'direct')!.targetId).toBe('B:e0')
      } else {
        miss++
        expect(dmg.every((d) => d.source === 'blast' && d.targetId === 'B:e0')).toBe(true)
        expect(dmg).toHaveLength(1)
      }
    }
    expect(hit).toBeGreaterThan(0)
    expect(miss).toBeGreaterThan(0)
  })

  it('SPR-001 a spray line rolls an attack against every model it crosses', () => {
    const out = clear(startState('spr'), ['B:e1', 'A:e1', 'A:u2.1', 'A:e0'], { 'B:e1': { x: 0, z: 0 }, 'A:e1': { x: 3, z: 0 }, 'A:u2.1': { x: 5, z: 0 }, 'A:e0': { x: 7.4, z: 0 } })
    let o = asOut({ ...out.state, activePlayer: 'B', pending: { ...out.state.pending, kind: 'chooseActivation', player: 'B', id: 'd:900', options: [] }, decisionSeq: 900 })
    o = send(o, { type: 'chooseActivation', activate: 'B:e1' })
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'B:e1' })
    o = send(o, { type: 'chooseCombatAction', modelId: 'B:e1', choice: 'ranged' })
    o = send(o, { type: 'chooseAttack', modelId: 'B:e1', weaponId: 'cyg.w.magelock-scattergun', targetId: 'A:e1', additional: false })
    expect(rolls(o, 'attack')).toHaveLength(3)
    expect(o.events.filter((e) => e.type === 'AttackResolved')).toHaveLength(3)
  })
})
