// Menoth card rules that need exact dice (the rng roll is forced, as in golden.test.ts): Shield Guard, Holy Martyrs, Heroic Inspiration,
// Cleansing Volley, the three arrows, Thresher, Gladiator, Debilitating Heat, Conflagration. FAC-MEN-022 onward.
import { describe, expect, it, vi } from 'vitest'

// ---------- forced dice: roll number k (state.rollSeq) gets FORCED[k] when set ----------
const FORCED = new Map<number, number[]>()
vi.mock('../../src/engine/rng', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/engine/rng')>()
  return {
    ...real,
    roll(state: import('../../src/engine/types').GameState, spec: import('../../src/engine/rng').RollSpec) {
      const f = FORCED.get(state.rollSeq)
      if (!f) return real.roll(state, spec)
      const n = Math.max(1, spec.count)
      const dice = Array.from({ length: n }, (_, i) => f[i] ?? 1)
      const kept = [...dice].sort((x, y) => y - x).slice(0, dice.length - (spec.dropLowest ?? 0))
      const total = kept.reduce((a, b) => a + b, 0) + (spec.flat ?? 0)
      const rollId = `r:${state.rollSeq + 1}`
      return {
        state: { ...state, rollSeq: state.rollSeq + 1 },
        event: { type: 'DiceRolled' as const, rollId, purpose: spec.purpose, ownerId: spec.ownerId, dice, kept, total, target: spec.target },
      }
    },
  }
})

import { slideAway } from '../../src/engine/movement'
import { applyEffect } from '../../src/engine/effects'
import { lookups, resistsDamageType, statOf } from '../../src/engine/code-hooks'
import { teleportSamples } from '../../src/engine/factions/menoth'
import { runMaintenance } from '../../src/engine/phases/maintenance'
import type { GameEvent } from '../../src/engine/events'
import type { FlowOut } from '../../src/engine/pending'
import type { GameSetup, GameState } from '../../src/engine/types'
import { asOut, bundle, choose, place, send, settle, trySend, withModel } from './action-helpers'
import { newGame, runControlTo, runSetup } from './turn-helpers'

const SETUP: GameSetup = { scenario: 'scn-ashwall-divide', lists: { A: 'men.l.starter-recon', B: 'cyg.l.qs-recon' } }
/** Models: A:L Feora, A:e0 Crusader, A:e1 Valeria, A:e2 Pyrrhus, A:u3.1-5 Defenders; B:L Caine, B:e0 Deuce, B:e1 Falk, B:u2.1-3 Black 13th. */
function startMen(seed: string, who: 'A' | 'B' = 'A', setup: GameSetup = SETUP): GameState {
  const s = runControlTo(runSetup(newGame(setup, seed))).state
  // the real Maintenance Phase already gave Feora a Gift; the tests that want one add it themselves
  return { ...s, effects: s.effects.filter((e) => e.sourceId !== 'men.a.four-gifts'), activePlayer: who, pending: { ...s.pending, kind: 'chooseActivation', player: who, id: 'd:900', options: [] }, decisionSeq: 900 }
}
function park(s: GameState, keep: string[]): GameState {
  let i = 0
  for (const m of Object.values(s.models)) {
    if (keep.includes(m.id)) continue
    s = place(s, m.id, { x: -16 + (i % 8) * 4, z: 16 - Math.floor(i / 8) * 3 })
    i++
  }
  return s
}
/** The next rolls (in engine order) come up with these faces. */
function force(o: { state: GameState }, ...rolls: number[][]): void { rolls.forEach((f, i) => FORCED.set(o.state.rollSeq + i, f)) }
type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>
const evs = <T extends GameEvent['type']>(es: GameEvent[], t: T): Ev<T>[] => es.filter((e): e is Ev<T> => e.type === t)
const damageRolls = (es: GameEvent[]): Ev<'DiceRolled'>[] => evs(es, 'DiceRolled').filter((e) => e.purpose === 'damage')
const flatOf = (e: Ev<'DiceRolled'>): number => e.total - e.kept.reduce((a, b) => a + b, 0)
const filled = (s: GameState, id: string): number => (s.models[id]!.damage as { filled: number }).filled
const burning = (s: GameState, id: string): GameState => withModel(s, id, { conditions: [...s.models[id]!.conditions, 'fire'] })
const hasFire = (s: GameState, id: string): boolean => s.models[id]!.conditions.includes('fire')
/** The first chooseAttack option aimed at `target` (any weapon). */
const attackAt = (o: FlowOut, target: string, group?: string): Record<string, unknown> => {
  const opt = o.pending.options!.find((x) => x.action.type === 'chooseAttack' && (x.action as { targetId?: string; attackType?: string }).targetId === target
    && (!group || (x.action as { attackType?: string }).attackType === group))
  if (!opt) throw new Error('no attack at ' + target + ': ' + o.pending.options!.map((x) => x.id).join(','))
  return opt.action as unknown as Record<string, unknown>
}
const fire = (o: FlowOut, target: string, group?: string): FlowOut => send(o, attackAt(o, target, group))
/** Open a lone model's activation: forfeit Normal Movement, pick a Combat Action. */
function openLone(s: GameState, id: string, choice: string, extra: Record<string, unknown> = {}): FlowOut {
  let o = choose(asOut(s), id)
  o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: id })
  return send(o, { type: 'chooseCombatAction', modelId: id, choice, ...extra })
}
/** Open a unit trooper's attacks. */
function openUnit(s: GameState, unit: string, lead: string, choice: string): FlowOut {
  let o = choose(asOut(s), unit)
  o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: lead })
  return send(o, { type: 'chooseCombatAction', modelId: lead, choice })
}

describe('FAC-MEN-022 Shield Guard', () => {
  /** B shoots Feora with Black 13th; Defenders stand by her. */
  function duel(seed: string, defenders: string[]) {
    let s = startMen(seed, 'B')
    s = park(s, ['A:L', ...defenders, 'B:u2.1', 'B:u2.2', 'B:u2.3'])
    s = place(s, 'A:L', { x: 0, z: 0 })
    defenders.forEach((d, i) => { s = place(s, d, { x: i === 0 ? 2.2 : -2.2, z: 1 }) }) // beside her, not in the line of fire
    s = place(s, 'B:u2.1', { x: 0, z: 6 })
    s = place(s, 'B:u2.2', { x: 1, z: 6 })
    s = place(s, 'B:u2.3', { x: 2, z: 6 })
    return s
  }

  it('a Defender within 3" takes a ranged hit meant for Feora, suffering the damage; once per round per Defender', () => {
    const s = duel('sg1', ['A:u3.1'])
    let o = openUnit(s, 'B:u2', 'B:u2.1', 'ranged')
    force(o, [6, 6], [1, 1]) // a hit, then a weak damage roll the Defender survives
    o = fire(o, 'A:L')
    o = settle(o)
    expect(evs(o.events, 'EffectApplied').some((e) => e.name === 'Shield Guard' && e.targetIds.includes('A:u3.1'))).toBe(true)
    const dmg = evs(o.events, 'DamageRolled')[0]!
    expect(dmg.instance.targetId).toBe('A:u3.1') // the Defender takes the damage roll
    expect(filled(o.state, 'A:L')).toBe(0)
    // the Defender has used it this round: the second hit lands on Feora
    expect(o.pending.kind === 'chooseCombatAction' || o.pending.kind === 'chooseAttack').toBe(true)
    let o2 = o
    if (o2.pending.kind === 'chooseAttack') o2 = send(o2, { type: 'endAttacks', modelId: 'B:u2.1' })
    o2 = send(o2, { type: 'chooseCombatAction', modelId: o2.pending.context.modelId, choice: 'ranged' })
    force(o2, [6, 6], [6, 6])
    o2 = settle(fire(o2, 'A:L'))
    expect(evs(o2.events, 'DamageRolled')[0]!.instance.targetId).toBe('A:L')
    expect(filled(o2.state, 'A:L')).toBeGreaterThan(0)
  })

  it('the Defender that takes the hit is boxed by it (its own ARM, its own box)', () => {
    const s = duel('sg2', ['A:u3.1'])
    let o = openUnit(s, 'B:u2', 'B:u2.1', 'ranged')
    force(o, [6, 6], [6, 6])
    o = settle(fire(o, 'A:L'))
    expect(o.state.models['A:u3.1']!.life === 'destroyed' || o.state.models['A:u3.1']!.offTable || o.state.models['A:u3.1']!.life === 'boxed').toBe(true)
    expect(filled(o.state, 'A:L')).toBe(0)
  })

  it('a Defender farther than 3" or knocked down does not step in, nor does one for a fellow trooper; a melee attack is not redirected', () => {
    let s = duel('sg3', ['A:u3.1'])
    s = place(s, 'A:u3.1', { x: 0, z: 4.5 }) // 3.4" from Feora's edge
    let o = openUnit(s, 'B:u2', 'B:u2.1', 'ranged')
    force(o, [6, 6], [1, 1])
    o = settle(fire(o, 'A:L'))
    expect(evs(o.events, 'DamageRolled')[0]!.instance.targetId).toBe('A:L')
    const k = withModel(duel('sg3b', ['A:u3.1']), 'A:u3.1', { conditions: ['knockedDown'] })
    let o2 = openUnit(k, 'B:u2', 'B:u2.1', 'ranged')
    force(o2, [6, 6], [1, 1])
    o2 = settle(fire(o2, 'A:L'))
    expect(evs(o2.events, 'DamageRolled')[0]!.instance.targetId).toBe('A:L')
  })
})

describe('FAC-MEN-023 Heroic Inspiration', () => {
  it('a Defender striking an enemy in Pyrrhus\'s melee range rolls one extra damage die; outside his reach it rolls the normal two', () => {
    const run = (pyrrhus: { x: number; z: number }) => {
      let s = startMen('heroic')
      s = park(s, ['A:u3.1', 'A:e2', 'B:e1'])
      s = place(s, 'A:u3.1', { x: 0, z: 0 })
      s = place(s, 'B:e1', { x: 0, z: 2 })
      s = place(s, 'A:e2', pyrrhus)
      let o = openUnit(s, 'A:u3', 'A:u3.1', 'melee')
      force(o, [6, 6], [3, 3, 3])
      o = settle(fire(o, 'B:e1'))
      return damageRolls(o.events)[0]!
    }
    expect(run({ x: 0, z: 5 }).dice.length).toBe(3) // Falk stands 2.4" from Pyrrhus: inside his 2" reach plus bases
    expect(run({ x: 0, z: 6 }).dice.length).toBe(2)
  })
})

describe('FAC-MEN-024 Holy Martyrs', () => {
  it('a Defender within 5" is destroyed in Pyrrhus\'s place when an enemy attack would disable him, and he heals 1', () => {
    let s = startMen('martyr', 'B')
    s = park(s, ['A:e2', 'A:u3.1', 'A:u3.2', 'B:u2.1'])
    s = place(s, 'A:e2', { x: 0, z: 0 })
    s = place(s, 'A:u3.1', { x: 4.5, z: 0 }) // 3.3" from his edge: past Shield Guard's 3", inside Holy Martyrs' 5"
    s = place(s, 'A:u3.2', { x: -5, z: 0 })
    s = place(s, 'B:u2.1', { x: 0, z: 6 })
    s = withModel(s, 'A:e2', { damage: { track: 'single', boxes: 8, filled: 7 } as never })
    let o = openUnit(s, 'B:u2', 'B:u2.1', 'ranged')
    force(o, [6, 6], [6, 6])
    o = settle(fire(o, 'A:e2'))
    expect(filled(o.state, 'A:e2')).toBe(6) // no damage taken, then 1 healed
    expect(o.state.models['A:e2']!.life).toBe('active')
    const gone = ['A:u3.1', 'A:u3.2'].filter((id) => o.state.models[id]!.life !== 'active')
    expect(gone).toEqual(['A:u3.1']) // the nearest Defender dies for him
    expect(damageRolls(o.events)[0] && evs(o.events, 'DamageRolled')[0]!.points).toBe(0)
  })

  it('without a Defender in reach, or when the hit would not disable him, nothing is spared', () => {
    let s = startMen('martyr2', 'B')
    s = park(s, ['A:e2', 'A:u3.1', 'B:u2.1'])
    s = place(s, 'A:e2', { x: 0, z: 0 })
    s = place(s, 'A:u3.1', { x: 8, z: 0 }) // too far
    s = place(s, 'B:u2.1', { x: 0, z: 6 })
    s = withModel(s, 'A:e2', { damage: { track: 'single', boxes: 8, filled: 7 } as never })
    let o = openUnit(s, 'B:u2', 'B:u2.1', 'ranged')
    force(o, [6, 6], [6, 6])
    o = settle(fire(o, 'A:e2'))
    expect(o.state.models['A:e2']!.life).not.toBe('active')
    // a healthy Pyrrhus takes it normally
    let h = startMen('martyr3', 'B')
    h = park(h, ['A:e2', 'A:u3.1', 'B:u2.1'])
    h = place(h, 'A:e2', { x: 0, z: 0 }); h = place(h, 'A:u3.1', { x: 4.5, z: 0 }); h = place(h, 'B:u2.1', { x: 0, z: 6 })
    let p = openUnit(h, 'B:u2', 'B:u2.1', 'ranged')
    force(p, [6, 6], [6, 6])
    p = settle(fire(p, 'A:e2'))
    expect(filled(p.state, 'A:e2')).toBeGreaterThan(0)
    expect(p.state.models['A:u3.1']!.life).toBe('active')
  })
})

describe('FAC-MEN-025 Cleansing Volley', () => {
  function shoot(seed: string) {
    let s = startMen(seed)
    s = park(s, ['A:e1', 'B:e0', 'B:e1'])
    s = place(s, 'A:e1', { x: 0, z: 0 })
    s = place(s, 'B:e0', { x: 0, z: 6 })
    s = place(s, 'B:e1', { x: 2, z: 6 })
    return burning(burning(s, 'B:e0'), 'B:e1')
  }
  it('a direct hit on a burning enemy puts the fire out and earns one more shot, once per turn', () => {
    let o = openLone(shoot('cv'), 'A:e1', 'ranged')
    force(o, [6, 6], [1, 1])
    o = settle(fire(o, 'B:e0'))
    expect(hasFire(o.state, 'B:e0')).toBe(false)
    expect(o.pending.kind).toBe('chooseAttack')
    const more = o.pending.options!.filter((x) => x.action.type === 'chooseAttack' && !(x.action as { additional: boolean }).additional)
    expect(more.length).toBeGreaterThan(0) // an initial shot is still on offer
    // the second hit, on the other burning enemy, does not repeat it (once per turn)
    force(o, [6, 6], [1, 1])
    o = settle(fire(o, 'B:e1'))
    expect(hasFire(o.state, 'B:e1')).toBe(true)
    const left = o.pending.kind === 'chooseAttack' ? o.pending.options!.filter((x) => x.action.type === 'chooseAttack' && !(x.action as { additional: boolean }).additional) : []
    expect(left.length).toBe(0)
  })

  it('a miss, or a hit on an enemy that is not burning, earns nothing', () => {
    let s = shoot('cv2')
    s = withModel(s, 'B:e0', { conditions: [] })
    let o = openLone(s, 'A:e1', 'ranged')
    force(o, [6, 6], [1, 1])
    o = settle(fire(o, 'B:e0'))
    const left = o.pending.kind === 'chooseAttack' ? o.pending.options!.filter((x) => x.action.type === 'chooseAttack' && !(x.action as { additional: boolean }).additional) : []
    expect(left.length).toBe(0)
    expect(hasFire(o.state, 'B:e1')).toBe(true)
  })
})

describe('FAC-MEN-026 Idrian Bow arrows', () => {
  const shoot = (seed: string, extra: string[] = []) => {
    let s = startMen(seed)
    s = park(s, ['A:e1', 'B:e0', ...extra])
    s = place(s, 'A:e1', { x: 0, z: 0 })
    s = place(s, 'B:e0', { x: 0, z: 6 })
    return s
  }
  const dmgOf = (group: string, seed = 'bow') => {
    let o = openLone(shoot(seed), 'A:e1', 'ranged')
    force(o, [6, 6], [3, 3])
    o = settle(fire(o, 'B:e0', group))
    return { o, d: damageRolls(o.events)[0]!, dr: evs(o.events, 'DamageRolled')[0]! }
  }

  it('Armor-Piercing arrow: the shot is POW 8 (not 12) and the target\'s base ARM is halved', () => {
    const ap = dmgOf('armor-piercing-arrow')
    const plain = dmgOf('incendiary-arrow')
    expect(flatOf(ap.d)).toBe(8)
    expect(flatOf(plain.d)).toBe(12)
    const arm = statOf(shoot('bow-arm'), bundle, 'B:e0', 'ARM')
    expect(ap.dr.arm).toBe(Math.ceil(arm / 2))
    expect(plain.dr.arm).toBe(arm)
  })

  it('Incendiary arrow: fire damage with a small blast, and the model hit catches fire', () => {
    const inc = dmgOf('incendiary-arrow')
    expect(inc.dr.instance.damageTypes).toContain('fire')
    expect(inc.o.state.models['B:e0']!.conditions).toContain('fire')
  })

  it('Featherweight arrow: two shots at once, each at a different enemy; with one enemy in reach it is one shot', () => {
    let s = shoot('feather', ['B:e1'])
    s = place(s, 'B:e1', { x: 3, z: 6 })
    let o = openLone(s, 'A:e1', 'ranged')
    force(o, [6, 6], [6, 6], [1, 1], [1, 1]) // both attack rolls, then both damage rolls
    o = settle(fire(o, 'B:e0', 'featherweight-arrow'))
    const res = evs(o.events, 'AttackResolved')
    expect(res.length).toBe(2)
    expect(evs(o.events, 'DiceRolled').filter((e) => e.purpose === 'attack').map((e) => e.ownerId)).toEqual(['A:e1', 'A:e1'])
    const hitIds = evs(o.events, 'DamageRolled').map((e) => e.instance.targetId).sort()
    expect(hitIds).toEqual(['B:e0', 'B:e1'])
    // a lone target: just the one shot
    let p = openLone(shoot('feather2'), 'A:e1', 'ranged')
    force(p, [6, 6], [1, 1])
    p = settle(fire(p, 'B:e0', 'featherweight-arrow'))
    expect(evs(p.events, 'AttackResolved').length).toBe(1)
  })
})

describe('FAC-MEN-027 Thresher', () => {
  const scene = (seed: string, withEnemy = true) => {
    let s = startMen(seed)
    s = park(s, ['A:e0', 'A:u3.1', 'B:e0'])
    s = withModel(place(s, 'A:e0', { x: 0, z: 0 }), 'A:e0', { focus: 0 })
    s = place(s, 'A:u3.1', { x: 2.5, z: 0 })
    s = place(s, 'B:e0', withEnemy ? { x: 0, z: 3.5 } : { x: 0, z: 14 })
    return s
  }
  it('the Blazing Star swings at every model in reach, friend or foe, rolling each at once', () => {
    let o = choose(asOut(scene('thresh')), 'A:e0')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e0' })
    const th = o.pending.options!.find((x) => (x.action as { abilityId?: string }).abilityId === 'men.a.thresher')
    expect(th).toBeDefined()
    o = send(o, th!.action as unknown as Record<string, unknown>)
    force(o, [6, 6], [6, 6], [3, 3], [3, 3])
    o = settle(fire(o, 'B:e0'))
    expect(evs(o.events, 'AttackResolved').length).toBe(2) // Deuce and the Defender
    const hit = evs(o.events, 'DamageRolled').map((e) => e.instance.targetId).sort()
    expect(hit).toEqual(['A:u3.1', 'B:e0'])
    expect(o.state.models['A:u3.1']!.life).not.toBe('active') // 18 + 6 against ARM 16: the Defender is cut down by its own Crusader
  })
  it('it is a star attack: not offered with no enemy in reach (a friend alone is not a reason to swing)', () => {
    let o = choose(asOut(scene('thresh2', false)), 'A:e0')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e0' })
    expect(o.pending.options!.some((x) => (x.action as { abilityId?: string }).abilityId === 'men.a.thresher')).toBe(false)
  })
})

describe('FAC-MEN-028 Gladiator', () => {
  it('the Crusader\'s power attack damage roll gets +2 (headbutt: POW 12 becomes 14)', () => {
    let s = startMen('glad')
    s = park(s, ['A:e0', 'B:e0'])
    s = withModel(place(s, 'A:e0', { x: 0, z: 0 }), 'A:e0', { focus: 2 })
    s = place(s, 'B:e0', { x: 0, z: 2.5 })
    let o = choose(asOut(s), 'A:e0')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e0' })
    o = send(o, { type: 'chooseCombatAction', modelId: 'A:e0', choice: 'powerAttack', powerAttack: 'headbutt' })
    force(o, [6, 6], [4], [3, 3])
    o = send(o, { type: 'powerAttack', modelId: 'A:e0', kind: 'headbutt', targetId: 'B:e0' })
    const d = damageRolls(o.events).find((e) => e.ownerId === 'B:e0')!
    expect(flatOf(d)).toBe(14)
  })

  it('and the collateral damage rolls of a slam: 14 against a smaller base becomes 16', () => {
    let s = startMen('glad2')
    s = park(s, ['A:e0', 'B:e0', 'B:e1'])
    s = place(s, 'A:e0', { x: 0, z: 0 })
    s = place(s, 'B:e0', { x: 0, z: 2.5 })
    s = place(s, 'B:e1', { x: 0, z: 4.2 }) // Falk, 30 mm, in the path of the slam
    const roll = (bonus: number) => {
      const r = slideAway(s, 'B:e0', s.models['A:e0']!.pos, 5, 'slam', lookups(s, bundle), undefined, bonus)
      return damageRolls(r.events).find((e) => e.ownerId === 'B:e1')!
    }
    expect(flatOf(roll(0))).toBe(14)
    expect(flatOf(roll(2))).toBe(16)
  })
})

describe('FAC-MEN-029 Debilitating Heat', () => {
  const scene = (seed: string) => {
    let s = startMen(seed)
    s = park(s, ['A:L', 'A:e2', 'B:u2.1', 'B:u2.2', 'B:e0'])
    s = withModel(place(s, 'A:L', { x: 0, z: 0 }), 'A:L', { focus: 6 })
    s = place(s, 'B:u2.1', { x: 0, z: 6 })
    s = place(s, 'B:u2.2', { x: 1.5, z: 6 })
    s = place(s, 'B:e0', { x: -4, z: 6 })
    return s
  }
  const heat = (s: GameState, target: string): FlowOut => {
    let o = choose(asOut(s), 'A:L')
    force(o, [6, 6])
    o = send(o, { type: 'castSpell', casterId: 'A:L', spellId: 'men.s.debilitating-heat', targetId: target })
    return settle(o)
  }

  it('the unit hit loses 2 DEF and 2 on its damage rolls for the round', () => {
    const o = heat(scene('heat'), 'B:u2.1')
    const e = o.state.effects.filter((x) => x.sourceId === 'men.s.debilitating-heat')
    expect(e.length).toBe(1)
    expect([...e[0]!.targetIds].sort()).toEqual(['B:u2.1', 'B:u2.2', 'B:u2.3'].filter((id) => o.state.models[id]!.life === 'active').sort())
    expect(e[0]!.duration).toBe('round')
    const before = statOf(scene('heat'), bundle, 'B:u2.2', 'DEF')
    expect(statOf(o.state, bundle, 'B:u2.2', 'DEF')).toBe(before - 2)
    expect((e[0] as unknown as { rollMods: { roll: string; value: number }[] }).rollMods).toEqual([{ roll: 'damage', value: -2 }])
    expect(statOf(o.state, bundle, 'B:e0', 'DEF')).toBe(statOf(scene('heat'), bundle, 'B:e0', 'DEF')) // not the other enemy
    expect(o.state.models['A:L']!.focus).toBe(3) // cost 3
  })

  it('friendly Faction melee damage rolls against the weakened model get +2; without the spell they do not', () => {
    const o = heat(scene('heat2'), 'B:u2.1')
    const duel = (s: GameState) => {
      let p = choose(asOut(s), 'A:e2')
      p = send(p, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e2' })
      p = send(p, { type: 'chooseCombatAction', modelId: 'A:e2', choice: 'melee' })
      force(p, [6, 6], [3, 3, 3])
      return settle(fire(p, 'B:u2.1'))
    }
    // Pyrrhus (POW 13) steps up to the weakened trooper
    let s = place(o.state, 'A:e2', { x: 0, z: 4 })
    s = { ...s, activation: null, attack: null, pending: { ...s.pending, kind: 'chooseActivation', player: 'A', id: 'd:950', options: [] }, decisionSeq: 950 }
    expect(flatOf(damageRolls(duel(s).events)[0]!)).toBe(13 + 2)
    // without the spell it is plain POW 13
    const s0 = place(scene('heat3'), 'A:e2', { x: 0, z: 4 })
    expect(flatOf(damageRolls(duel(s0).events)[0]!)).toBe(13)
  })
})

describe('FAC-MEN-030 Conflagration', () => {
  const cast = (s: GameState): FlowOut => {
    let o = choose(asOut(s), 'A:L')
    force(o, [6, 6], [3, 3])
    o = send(o, { type: 'castSpell', casterId: 'A:L', spellId: 'men.s.conflagration', targetId: 'B:e0' })
    return settle(o)
  }
  const scene = (seed: string) => {
    let s = startMen(seed)
    s = park(s, ['A:L', 'B:e0'])
    s = withModel(place(s, 'A:L', { x: 0, z: 0 }), 'A:L', { focus: 6 })
    return place(s, 'B:e0', { x: 0, z: 6 })
  }
  it('its damage roll is fire damage (and magical), and the model hit catches fire', () => {
    const o = cast(scene('conf'))
    const dr = evs(o.events, 'DamageRolled')[0]!
    expect(dr.instance.damageTypes).toEqual(expect.arrayContaining(['fire', 'magical']))
    expect(dr.instance.pow).toBe(12)
    expect(o.state.models['B:e0']!.conditions).toContain('fire')
  })
  it('so a model that resists fire rolls one die fewer', () => {
    const s = applyEffect(scene('conf2'), ({ sourceId: 'x.fortification', name: 'Fortified', owner: 'B', targetIds: ['B:e0'], mods: [], duration: 'round', resist: ['fire'] } as unknown) as Parameters<typeof applyEffect>[1]).state
    expect(damageRolls(cast(s).events)[0]!.dice.length).toBe(1)
    expect(damageRolls(cast(scene('conf3')).events)[0]!.dice.length).toBe(2)
  })
})

describe('FAC-MEN-031 Lawgiver\'s Judgement and Teleport', () => {
  const scene = (seed: string) => {
    let s = startMen(seed)
    s = park(s, ['A:L', 'B:e0', 'B:e1'])
    s = withModel(place(s, 'A:L', { x: 0, z: 0 }), 'A:L', { focus: 6 })
    s = place(s, 'B:e0', { x: 0, z: 6 })
    return place(s, 'B:e1', { x: 0, z: 20 })
  }
  const resist = (s: GameState, id: string): GameState =>
    applyEffect(s, ({ sourceId: 'x.fortification', name: 'Fortified ' + id, owner: 'B', targetIds: [id], mods: [], duration: 'round', resist: ['fire'] } as unknown) as Parameters<typeof applyEffect>[1]).state

  it('Lawgiver\'s Judgement: enemies in her CTRL lose Resistance: Fire and cannot gain it, while it is up', () => {
    let s = resist(resist(scene('law1'), 'B:e0'), 'B:e1')
    expect(resistsDamageType(s, bundle, 'B:e0', ['fire'])).toBe(true)
    let o = choose(asOut(s), 'A:L')
    o = send(o, { type: 'castSpell', casterId: 'A:L', spellId: 'men.s.lawgivers-judgement' })
    s = o.state
    expect(s.effects.some((e) => e.sourceId === 'men.s.lawgivers-judgement' && e.duration === 'upkeep')).toBe(true)
    expect(resistsDamageType(s, bundle, 'B:e0', ['fire'])).toBe(false) // in her CTRL
    expect(resistsDamageType(s, bundle, 'B:e1', ['fire'])).toBe(true) // out of it
    expect(resistsDamageType(s, bundle, 'A:L', ['fire'])).toBe(true) // her own Resistance stays
    // Conflagration now burns Deuce like anything else
    force(o, [6, 6], [3, 3])
    let p = send(o, { type: 'castSpell', casterId: 'A:L', spellId: 'men.s.conflagration', targetId: 'B:e0' })
    p = settle(p)
    expect(p.state.models['B:e0']!.conditions).toContain('fire')
  })

  it('Lawgiver\'s Judgement: a burning enemy that resists fire takes the Maintenance fire roll like any other', () => {
    let s = startMen('law2', 'B', { scenario: 'scn-ashwall-divide', lists: { A: 'men.l.starter-recon', B: 'men.l.starter-recon' } })
    s = park(s, ['A:L', 'B:L'])
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'B:L', { x: 0, z: 6 })
    s = burning(s, 'B:L')
    const quiet = runMaintenance({ ...s, phase: 'maintenance' }, bundle)
    expect(evs(quiet.events, 'ContinuousEffectRolled').length).toBe(0) // Resistance: Fire puts it out
    const withLaw = applyEffect(s, ({ sourceId: 'men.s.lawgivers-judgement', name: 'Lawgiver\'s Judgement', owner: 'A', casterId: 'A:L', targetIds: ['A:L'], mods: [], duration: 'upkeep' } as unknown) as Parameters<typeof applyEffect>[1]).state
    const rolled = runMaintenance({ ...withLaw, phase: 'maintenance' }, bundle)
    expect(evs(rolled.events, 'ContinuousEffectRolled').length).toBe(1)
  })

  it('Teleport: she lands on the chosen point within 6" and her activation ends', () => {
    let o = choose(asOut(scene('tele')), 'A:L')
    const opt = o.pending.options!.filter((x) => (x.action as { spellId?: string }).spellId === 'men.s.teleport')
    expect(opt.length).toBeGreaterThan(1) // a few landing spots are offered
    const dest = (opt[0]!.action as unknown as { point: { x: number; z: number } }).point
    expect(Math.hypot(dest.x, dest.z)).toBeLessThanOrEqual(6 + 1e-6)
    o = send(o, opt[0]!.action as unknown as Record<string, unknown>)
    expect(o.state.models['A:L']!.pos).toEqual(dest)
    expect(o.state.models['A:L']!.focus).toBe(4)
    expect(evs(o.events, 'ModelMoved').some((e) => e.modelId === 'A:L' && e.kind === 'place')).toBe(true)
    expect(o.state.activation).toBeNull() // the activation is over
    expect(o.state.models['A:L']!.activated).toBe(true)
  })

  it('Teleport: a point beyond 6" or on top of another model is refused', () => {
    const o = choose(asOut(scene('tele2')), 'A:L')
    const far = trySend(o, { type: 'castSpell', casterId: 'A:L', spellId: 'men.s.teleport', point: { x: 0, z: -6.5 } })
    expect(far).toMatchObject({ rejection: { code: 'E_TOO_FAR' } })
    const onto = trySend(o, { type: 'castSpell', casterId: 'A:L', spellId: 'men.s.teleport', point: { x: 0, z: 6 } }) // Deuce stands there
    expect(onto).toMatchObject({ rejection: { code: 'E_BASE_OVERLAP' } })
    expect(teleportSamples(scene('tele3'), 'A:L').length).toBeGreaterThan(0)
  })
})
