import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../src/engine/events'
import { armOf, codeHooks, knownCodeConditions, statOf } from '../../src/engine/code-hooks'
import { asOut, bundle, choose, openCombat, place, send, settle, startState, trySend } from './action-helpers'

type Node = Record<string, unknown>
function walk(n: unknown, f: (x: Node) => void) {
  if (Array.isArray(n)) n.forEach((x) => walk(x, f))
  else if (n && typeof n === 'object') { f(n as Node); Object.values(n as Node).forEach((x) => walk(x, f)) }
}
/** Cygnar acts second in the QS game: hand the turn to B so a Cygnar model can activate. */
const asB = (s: ReturnType<typeof startState>['state']) =>
  asOut({ ...s, activePlayer: 'B', pending: { ...s.pending, kind: 'chooseActivation', player: 'B', id: 'd:900', options: [] }, decisionSeq: 900 })

/** Park every other model far away so it cannot engage, block LOS or join a blast. */
function clearAround(s: ReturnType<typeof startState>['state'], keep: string[]) {
  let i = 0
  for (const m of Object.values(s.models)) {
    if (keep.includes(m.id)) continue
    s = place(s, m.id, { x: -16 + (i % 8) * 4, z: 16 - Math.floor(i / 8) * 3 })
    i++
  }
  return s
}

describe('FAC code hooks and faction rules', () => {
  it('FAC-001 every {code} the starter data references has an implementation', () => {
    const effectCodes = new Set<string>()
    const condCodes = new Set<string>()
    for (const r of Object.values(bundle.byId) as Node[]) {
      if (!['ability', 'spell', 'feat'].includes(r.recordType as string)) continue
      walk(r.effect, (n) => { if (typeof n.code === 'string') effectCodes.add(n.code) })
      walk(r.when, (n) => { if (typeof n.code === 'string') condCodes.add(n.code) })
    }
    const have = new Set(Object.keys(codeHooks().effects))
    expect([...effectCodes].filter((c) => c !== 'coreFlag' && !have.has(c))).toEqual([])
    expect([...condCodes].filter((c) => !knownCodeConditions().includes(c))).toEqual([])
    expect(effectCodes.size).toBeGreaterThanOrEqual(10)
  })

  it('ATK-015 Armor-Piercing halves base ARM first: Deuce ARM 18 + 1 Buckler -> 9 + 1 = 10', () => {
    const s = startState('ap').state
    expect(armOf(s, bundle, 'B:e0')).toBe(19)
    expect(armOf(s, bundle, 'B:e0', { armorPiercing: true })).toBe(10)
  })

  it('DMG-010 Shield Wall: a Hound in base contact with another gets +2 ARM; alone it does not', () => {
    let s = startState('sw').state
    s = place(s, 'A:u2.1', { x: 0, z: 0 })
    s = place(s, 'A:u2.2', { x: 30 / 25.4, z: 0 })
    s = place(s, 'A:u2.3', { x: 10, z: 10 })
    expect(statOf(s, bundle, 'A:u2.1', 'ARM')).toBe(17)
    expect(statOf(s, bundle, 'A:u2.3', 'ARM')).toBe(15)
  })

  it('ATK-010 Witch Mark on a direct hit marks the target for the caster spells (loop seeds for a hit)', () => {
    let seen = false
    for (let i = 0; i < 80 && !seen; i++) {
      let s = startState('wm' + i).state
      s = place(s, 'B:L', { x: 0, z: 0 })
      s = place(s, 'A:e1', { x: 5, z: 0 })
      let o = openCombat(asB(s), 'B:L', 'ranged')
      o = send(o, { type: 'chooseAttack', modelId: 'B:L', weaponId: 'cyg.w.spellstorm-pistol', targetId: 'A:e1', additional: false, attackType: 'witch-mark' })
      o = settle(o)
      const res = o.events.find((e) => e.type === 'AttackResolved') as Extract<GameEvent, { type: 'AttackResolved' }>
      if (!res.hit) continue
      seen = true
      expect(o.state.effects.some((e) => e.sourceId === 'cyg.a.witch-mark' && e.targetIds.includes('A:e1'))).toBe(true)
    }
    expect(seen).toBe(true)
  })

  it('ATK-011 Thunderbolt: a hit pushes the target away before damage (loop seeds)', () => {
    let seen = false
    for (let i = 0; i < 80 && !seen; i++) {
      let s = startState('tb' + i).state
      s = place(s, 'B:L', { x: 0, z: 0 })
      s = place(s, 'A:e1', { x: 6, z: 0 })
      let o = openCombat(asB(s), 'B:L', 'ranged')
      o = send(o, { type: 'chooseAttack', modelId: 'B:L', weaponId: 'cyg.w.spellstorm-pistol', targetId: 'A:e1', additional: false, attackType: 'thunderbolt' })
      o = settle(o)
      const res = o.events.find((e) => e.type === 'AttackResolved') as Extract<GameEvent, { type: 'AttackResolved' }>
      if (!res.hit) continue
      seen = true
      const types = o.events.map((e) => e.type)
      const push = types.indexOf('ModelMoved')
      expect(push).toBeGreaterThan(-1)
      expect(push).toBeLessThan(types.indexOf('DamageRolled'))
      expect(o.state.models['A:e1']!.pos.x).toBeGreaterThan(6)
    }
    expect(seen).toBe(true)
  })

  it('CHG Lazarenko charges Deuce; the first melee hit rolls a boosted damage die (charge attack)', () => {
    let seen = false
    for (let i = 0; i < 80 && !seen; i++) {
      let s = startState('ch' + i).state
      s = place(s, 'A:e1', { x: 0, z: 0 })
      s = place(s, 'B:e0', { x: 0, z: 7 })
      let o = choose(asOut(s), 'A:e1')
      o = send(o, { type: 'chooseMovement', option: 'charge', modelId: 'A:e1' })
      expect(o.pending.kind).toBe('chargeTarget')
      o = send(o, { type: 'chargeTarget', targetId: 'B:e0' })
      // R5.2: the charge move is a straight-line moveModel; the offered answer charges straight in
      expect(o.pending.kind).toBe('moveModel')
      expect(o.pending.constraints?.straightLine).toBe(true)
      o = send(o, o.pending.options![0]!.action as unknown as Record<string, unknown>)
      expect(o.pending.kind).toBe('chooseCombatAction')
      expect(o.pending.options!.map((x) => x.id).some((id) => id.startsWith('ranged'))).toBe(false) // melee only after a charge
      o = send(o, { type: 'chooseCombatAction', modelId: 'A:e1', choice: 'melee' })
      o = send(o, { type: 'chooseAttack', modelId: 'A:e1', weaponId: 'kha.w.lazarenko-knife', targetId: 'B:e0', additional: false })
      o = settle(o)
      if (!o.events.some((e) => e.type === 'DamageRolled')) continue
      seen = true
      expect(o.events.some((e) => e.type === 'RollBoosted' && e.roll === 'damage' && e.source === 'charge')).toBe(true)
    }
    expect(seen).toBe(true)
  })

  it('ATK-014 Reciprocate: Falk missed by a ranged attack shoots back after it resolves (loop seeds for a miss)', () => {
    let seen = false
    for (let i = 0; i < 80 && !seen; i++) {
      let s = startState('rc' + i).state
      s = clearAround(s, ['B:e1', 'A:e1'])
      s = place(s, 'B:e1', { x: 0, z: 0 })
      s = place(s, 'A:e1', { x: 0, z: 6 })
      let o = openCombat(asOut(s), 'A:e1', 'ranged')
      o = send(o, { type: 'chooseAttack', modelId: 'A:e1', weaponId: 'kha.w.jack-buster', targetId: 'B:e1', additional: false })
      o = settle(o)
      const res = o.events.find((e) => e.type === 'AttackResolved') as Extract<GameEvent, { type: 'AttackResolved' }>
      if (res.hit) continue
      seen = true
      const declared = o.events.filter((e): e is Extract<GameEvent, { type: 'AttackDeclared' }> => e.type === 'AttackDeclared')
      expect(declared.map((d) => d.attackerId)).toEqual(['A:e1', 'B:e1'])
      expect(declared[1]!.targetId).toBe('A:e1')
      expect(o.pending.kind).toBe('chooseActivation') // the shot was Lazarenko's only one: the activation ends after the generated attack
    }
    expect(seen).toBe(true)
  })

  it('ATK-012 Critical Shred: a crit with the Ripper Shield makes one more attack with it, no focus (loop seeds for a crit)', () => {
    let seen = false
    for (let i = 0; i < 160 && !seen; i++) {
      let s = startState('cs' + i).state
      s = place(s, 'A:e0', { x: 0, z: 0 })
      s = place(s, 'B:e0', { x: 30 / 25.4 / 2 + 50 / 25.4 / 2 + 0.5 + 0.3, z: 0 })
      let o = openCombat(asOut(s), 'A:e0', 'melee')
      o = send(o, { type: 'chooseAttack', modelId: 'A:e0', weaponId: 'kha.w.ripper-shield', targetId: 'B:e0', additional: false })
      o = settle(o)
      const res = o.events.find((e) => e.type === 'AttackResolved') as Extract<GameEvent, { type: 'AttackResolved' }>
      if (!res.crit) continue
      seen = true
      const declared = o.events.filter((e) => e.type === 'AttackDeclared')
      expect(declared.length).toBeGreaterThanOrEqual(2)
    }
    expect(seen).toBe(true)
  })

  it('ATK-009 Both Barrels: one shot with the Dual Magelock Pistol, any further shots are rejected', () => {
    let s = startState('bb').state
    s = clearAround(s, ['B:u2.1', 'B:u2.2', 'B:u2.3', 'A:e1'])
    s = place(s, 'B:u2.2', { x: 0, z: 0 })
    s = place(s, 'B:u2.1', { x: 1.2, z: 0 })
    s = place(s, 'B:u2.3', { x: -1.2, z: 0 })
    s = place(s, 'A:e1', { x: 0, z: 6 })
    let o = asB(s)
    o = choose(o, 'B:u2')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'B:u2.2' })
    // the troopers choose in unit order; skip Ryan, then pick the star attack for Glover
    while (o.pending.context.modelId !== 'B:u2.2') o = send(o, { type: 'chooseCombatAction', modelId: o.pending.context.modelId, choice: 'forfeit' })
    o = send(o, { type: 'chooseCombatAction', modelId: 'B:u2.2', choice: 'specialAttack', abilityId: 'cyg.a.both-barrels' })
    o = send(o, { type: 'chooseAttack', modelId: 'B:u2.2', weaponId: 'cyg.w.dual-magelock-pistol', targetId: 'A:e1', additional: false })
    o = settle(o)
    const again = trySend(o, { type: 'chooseAttack', modelId: 'B:u2.2', weaponId: 'cyg.w.dual-magelock-pistol', targetId: 'A:e1', additional: false })
    expect(again && 'rejection' in again).toBe(true)
  })

  it('ACT full activation: Razor forfeits movement and combat, may Reposition 3", then the next activation is offered', () => {
    const s = startState('rp').state
    let o = choose(asOut(s), 'A:e0')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e0' })
    o = send(o, { type: 'chooseCombatAction', modelId: 'A:e0', choice: 'forfeit' })
    expect(o.pending.kind).toBe('moveModel')
    expect(o.pending.canPass).toBe(true)
    expect(o.pending.constraints!.maxDist).toBe(3)
    const pick = o.pending.options![1]!.action as unknown as { path: { x: number; z: number }[] }
    o = send(o, { type: 'moveModel', modelId: 'A:e0', path: pick.path })
    expect(o.pending.kind).toBe('chooseActivation')
    expect(o.state.models['A:e0']!.activated).toBe(true)
    expect(o.state.activation).toBeNull()
  })

  it('ACT unit activation: the Hounds move one trooper, the rest are placed, each trooper then chooses a Combat Action', () => {
    let o = choose(startState('unit'), 'A:u2')
    o = send(o, { type: 'chooseMovement', option: 'advance', modelId: 'A:u2.1' })
    expect(o.pending.kind).toBe('moveModel')
    const from = o.state.models['A:u2.1']!.pos
    o = send(o, { type: 'moveModel', modelId: 'A:u2.1', path: [{ x: from.x, z: from.z + 4 }] })
    expect(o.state.models['A:u2.1']!.pos.z).toBeCloseTo(from.z + 4)
    // R5.8: the rest of the unit is placed within 2" of the moved trooper (placeTroopers, auto option offered)
    expect(o.pending.kind).toBe('placeTroopers')
    const auto = o.pending.options![0]!.action as { placements: { modelId: string }[] }
    expect(auto.placements.map((p) => p.modelId).sort()).toEqual(['A:u2.2', 'A:u2.3'])
    o = send(o, { type: 'placeTroopers', placements: auto.placements }) // the suggested placement validates
    const seen: string[] = []
    for (let i = 0; i < 3; i++) {
      expect(o.pending.kind).toBe('chooseCombatAction')
      seen.push(o.pending.context.modelId!)
      o = send(o, { type: 'chooseCombatAction', modelId: o.pending.context.modelId, choice: 'forfeit' })
    }
    expect(new Set(seen).size).toBe(3)
    expect(o.pending.kind).toBe('moveModel') // each trooper may Reposition on its own
  })
})
