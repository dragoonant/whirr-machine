// Out-of-activation attacks (R4.10, R7.18): Avenging Force's Maintenance attack and Reciprocate, including one answering the other.
import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../src/engine/events'
import { step, type Action } from '../../src/engine/index'
import { runAvengingForce } from '../../src/engine/phases/avenging'
import type { EffectInstance, GameState } from '../../src/engine/types'
import { bundle, place, startState } from './action-helpers'

/** Khador's Maintenance Phase with Avenging Force armed on Razor, a Black 13th trooper in its sights and Falk nearby. */
function maintenanceWithAvengingForce(seed: string): GameState {
  let s = startState(seed).state
  let i = 0
  for (const m of Object.values(s.models)) {
    if (['A:e0', 'B:u2.1', 'B:e1'].includes(m.id)) continue
    s = place(s, m.id, { x: -16 + (i % 8) * 4, z: 16 - Math.floor(i / 8) * 3 })
    i++
  }
  s = place(s, 'A:e0', { x: 0, z: 0 }, { focus: 3 })
  s = place(s, 'B:u2.1', { x: 0, z: 7 }) // Ryan
  s = place(s, 'B:e1', { x: 4, z: 9 }) // Falk: Leadership [Gun Mages] grants Reciprocate within 10"
  const af = { id: 'e:af', sourceId: 'kha.s.avenging-force', name: 'Avenging Force', owner: 'A', casterId: 'A:L', targetIds: ['A:e0'], mods: [], duration: 'upkeep', expires: null, upkeep: { casterId: 'A:L' }, triggered: true } as EffectInstance
  s = { ...s, phase: 'maintenance', activePlayer: 'A', activation: null, effects: [...s.effects, af] }
  return runAvengingForce(s, bundle, [], (st, ev) => ({ state: st, events: ev, pending: st.pending })).state
}
const act = (s: GameState, a: Record<string, unknown>) => {
  const r = step(s, { ...a, decisionId: s.pending.id, player: s.pending.player } as unknown as Action)
  if (r.rejection) throw new Error(`${String(a.type)}: ${r.rejection.code} ${r.rejection.message}`)
  return r
}

describe('ATK out-of-activation attacks', () => {
  it('ATK-022 / FAC-CYG-004 an Avenging Force shot that misses a Black 13th trooper is answered by Reciprocate; neither attack can be boosted', () => {
    let seen = false
    for (let i = 0; i < 80 && !seen; i++) {
      let s = maintenanceWithAvengingForce('oa' + i)
      expect(s.pending.kind).toBe('moveModel')
      s = act(s, { type: 'moveModel', modelId: 'A:e0', path: [s.models['A:e0']!.pos] }).state
      expect(s.pending.kind).toBe('chooseAttack')
      const events: GameEvent[] = []
      const kinds: string[] = []
      let r = act(s, { type: 'chooseAttack', modelId: 'A:e0', weaponId: 'kha.w.slug-cannon', targetId: 'B:u2.1', additional: false })
      events.push(...r.events)
      // answer anything the attacks raise (optional triggers are declined); no boost decision may appear
      for (let k = 0; k < 20 && r.state.phase === 'maintenance' && r.state.attack; k++) {
        kinds.push(r.pending.kind)
        r = r.pending.canPass ? act(r.state, { type: 'pass' }) : act(r.state, r.pending.options![0]!.action as unknown as Record<string, unknown>)
        events.push(...r.events)
      }
      expect(kinds.filter((k) => k === 'boostAttack' || k === 'boostDamage')).toEqual([])
      const first = events.find((e): e is Extract<GameEvent, { type: 'AttackResolved' }> => e.type === 'AttackResolved')!
      if (first.hit) continue
      seen = true
      const declared = events.filter((e): e is Extract<GameEvent, { type: 'AttackDeclared' }> => e.type === 'AttackDeclared')
      expect(declared.map((d) => [d.attackerId, d.targetId])).toEqual([['A:e0', 'B:u2.1'], ['B:u2.1', 'A:e0']])
      expect(events.some((e) => e.type === 'FocusChanged' && (e as { delta: number }).delta < 0)).toBe(false)
      expect(r.state.attack).toBeNull()
      expect(r.state.phase).not.toBe('maintenance') // Avenging Force is done; the turn moves on to Control
    }
    expect(seen).toBe(true)
  })
})
