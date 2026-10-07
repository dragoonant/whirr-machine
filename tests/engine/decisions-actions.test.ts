// M10 core gaps, part 2: the action decisions. combinedAttack (picker), channel (R8.7: SPL-009..011), attacks a trigger makes outside the
// activation (R4.10, R7.18, R7.19: ATK-012, ATK-014, ATK-021, ATK-022) and additional attacks bought while initial attacks remain (R7.2: ATK-006).
import { describe, expect, it, vi } from 'vitest'

const FORCED = vi.hoisted(() => new Map<number, number[]>())
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
      return {
        state: { ...state, rollSeq: state.rollSeq + 1 },
        event: { type: 'DiceRolled' as const, rollId: `r:${state.rollSeq + 1}`, purpose: spec.purpose, ownerId: spec.ownerId, dice, kept, total, target: spec.target },
      }
    },
  }
})

import { legalActions, validate, type Action } from '../../src/engine/index'
import type { GameEvent } from '../../src/engine/events'
import type { GameState, UnitState } from '../../src/engine/types'
import { runAvengingForce } from '../../src/engine/phases/avenging'
import { SYN, act, begin, events, mk, toCombat, tryAct, world } from '../fixtures/synthetic-decisions'

const force = (s: GameState, ...dice: number[]): void => { FORCED.set(s.rollSeq, dice) }
const ev = <T extends GameEvent['type']>(list: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] => list.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const offersAnswers = (s: GameState): void => {
  const legal = legalActions(s)
  expect(legal.length).toBeGreaterThan(0)
  for (const a of legal) expect(validate(s, a as Action)).toBeNull()
}
const REST = ['chooseAttack', 'chooseCombatAction', 'chooseMovement', 'chooseActivation', 'gameOver']
/** Answer an attack's plain decisions (no boosts, nothing passed up) until the Combat Action decision is back. */
function settle(s0: GameState): { s: GameState; evs: GameEvent[]; kinds: string[] } {
  let s = s0
  const evs: GameEvent[] = []
  const kinds: string[] = []
  for (let i = 0; i < 40 && !REST.includes(s.pending.kind); i++) {
    const k = s.pending.kind
    kinds.push(k + ':' + s.pending.player)
    offersAnswers(s)
    const a = k === 'boostAttack' ? { type: 'boostAttack', boost: false } : k === 'boostDamage' ? { type: 'boostDamage', boost: false } : k === 'reroll' ? { type: 'reroll', reroll: false }
      : k === 'powerField' ? { type: 'powerField', spend: 0 } : k === 'triggerWindow' ? { type: 'pass' } : k === 'chooseGrid' ? { type: 'chooseGrid', grid: 'left' } : null
    if (!a) throw new Error(`settle: no answer for ${k}`)
    s = act(s, a)
    evs.push(...events())
  }
  return { s, evs, kinds }
}

// ---------------------------------------------------------------------------------------------------------------------------------
describe('combinedAttack: which unit mates join a combined melee attack (R7.16)', () => {
  /** A foe at the origin and `n` troopers of one unit ringed round it, all in melee range. */
  const ring = (n: number) => {
    const ids = Array.from({ length: n }, (_, i) => `A:t${i + 1}`)
    const troopers = ids.map((id, i) => mk(id, 'sx.p.trooper', 'A', Math.cos((i * 2 * Math.PI) / n) * 1.6, Math.sin((i * 2 * Math.PI) / n) * 1.6, { unitId: 'A:u1' }))
    const unit: UnitState = { id: 'A:u1', profileId: 'sx.u.guard', owner: 'A', troopers: ids, attachments: [], activated: false }
    return world([mk('A:L', 'sx.p.foe', 'A', -20, 0), mk('B:L', 'sx.p.foe', 'B', 0, 0), ...troopers], {}, [unit])
  }
  const atCombat = (s0: GameState): GameState => {
    let s = begin(s0, 'A:u1')
    s = act(s, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:t1' })
    return act(s, { type: 'chooseCombatAction', modelId: 'A:t1', choice: 'melee' })
  }
  const combined = (s: GameState) => (s.pending.options ?? []).filter((o) => o.action.type === 'combinedAttack')

  it('with two or more mates in reach the attack choice offers everyone joining and a picker; the picker is a combinedAttack decision', () => {
    let s = atCombat(ring(3))
    const opts = combined(s)
    expect(opts.map((o) => (o.action as { contributorIds: string[] }).contributorIds.length).sort()).toEqual([0, 2])
    offersAnswers(s)
    const picker = opts.find((o) => (o.action as { contributorIds: string[] }).contributorIds.length === 0)!
    s = act(s, picker.action as unknown as Record<string, unknown>)
    expect(s.pending.kind).toBe('combinedAttack')
    expect(s.pending.player).toBe('A')
    expect(s.pending.canPass).toBe(true)
    expect(s.pending.context).toMatchObject({ modelId: 'A:t1', targetId: 'B:L', data: { eligible: ['A:t2', 'A:t3'] } })
    expect(s.pending.options!.map((o) => (o.action as { contributorIds: string[] }).contributorIds)).toEqual([['A:t2', 'A:t3'], ['A:t2'], ['A:t3']])
    offersAnswers(s)
    expect(legalActions(s).some((a) => a.type === 'pass')).toBe(true)
  })

  it('answering with one mate: only that mate gives up its Combat Action, the attack gets +2 and the other mate still acts', () => {
    let s = atCombat(ring(3))
    s = act(s, combined(s).find((o) => (o.action as { contributorIds: string[] }).contributorIds.length === 0)!.action as unknown as Record<string, unknown>)
    s = act(s, { type: 'combinedAttack', primaryId: 'A:t1', contributorIds: ['A:t2'], targetId: 'B:L', weaponId: 'sx.w.spear' })
    const measured = ev(events(), 'AttackMeasured')[0]!
    expect(measured.mods.some((m) => /Combined/.test(m.label) && m.value === 2)).toBe(true)
    const r = settle(s)
    expect(r.s.activation!.perModel['A:t2']!.combat).toBe('forfeit')
    // t3 was never asked to give anything up: it chooses its own Combat Action next
    expect(r.s.pending.kind).toBe('chooseCombatAction')
    expect(r.s.pending.context.modelId).toBe('A:t3')
  })

  it('passing the picker goes back to the attack choice untouched', () => {
    let s = atCombat(ring(3))
    const before = s.pending.options!.map((o) => o.id)
    s = act(s, combined(s).find((o) => (o.action as { contributorIds: string[] }).contributorIds.length === 0)!.action as unknown as Record<string, unknown>)
    s = act(s, { type: 'pass' })
    expect(s.pending.kind).toBe('chooseAttack')
    expect(s.pending.options!.map((o) => o.id)).toEqual(before)
    expect(s.activation!.perModel['A:t2']!.combat).toBeNull()
  })

  it('a contributor that is not in reach, or an empty group from the picker, is refused', () => {
    let s = atCombat(ring(3))
    s = act(s, combined(s).find((o) => (o.action as { contributorIds: string[] }).contributorIds.length === 0)!.action as unknown as Record<string, unknown>)
    expect(tryAct(s, { type: 'combinedAttack', primaryId: 'A:t1', contributorIds: [], targetId: 'B:L', weaponId: 'sx.w.spear' }).rejection?.code).toBe('E_NOT_AN_OPTION')
    expect(tryAct(s, { type: 'combinedAttack', primaryId: 'A:t1', contributorIds: ['A:L'], targetId: 'B:L', weaponId: 'sx.w.spear' }).rejection?.code).toBe('E_NOT_AN_OPTION')
  })

  it('with a single mate there is nothing to choose: only the one combined option is offered, no picker', () => {
    const s = atCombat(ring(2))
    expect(combined(s)).toHaveLength(1)
    expect((combined(s)[0]!.action as { contributorIds: string[] }).contributorIds).toEqual(['A:t2'])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
describe('channel: cast from the caster or through an Arc Node (R8.7)', () => {
  /** A caster with 5 focus, an Arc Node in its CTRL (off the line to the target) and an enemy in range of both. */
  const scene = (extra: ReturnType<typeof mk>[] = []) => world([
    mk('A:L', 'sx.p.cast', 'A', 0, 0), mk('A:n', 'sx.p.node', 'A', 4, 6), mk('B:L', 'sx.p.foe', 'B', 10, 0), ...extra,
  ])
  const atCombat = (s0: GameState): GameState => {
    let s = begin(s0, 'A:L')
    return act(s, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:L' })
  }
  const cast = (s: GameState, spell: string, target?: string) => (s.pending.options ?? []).find((o) => o.id === `cast:${spell}${target ? ':' + target : ''}`)!

  it('SPL-009 casting a spell the node could carry as well raises the channel decision: the caster itself, or each node in reach', () => {
    let s = atCombat(scene())
    expect(s.pending.kind).toBe('chooseCombatAction')
    s = act(s, cast(s, 'sx.s.bolt', 'B:L').action as unknown as Record<string, unknown>)
    expect(s.pending.kind).toBe('channel')
    expect(s.pending.player).toBe('A')
    expect(s.pending.window).toBe('spell.declare')
    expect(s.pending.options!.map((o) => o.id)).toEqual(['caster', 'via:A:n'])
    expect(s.pending.context).toMatchObject({ modelId: 'A:L', targetId: 'B:L', data: { spellId: 'sx.s.bolt', nodes: ['A:n'] } })
    offersAnswers(s)
    expect(s.models['A:L']!.focus).toBe(5) // nothing is paid until the origin is chosen
  })

  it('SPL-009 channelling through the node: the spell and its attack come from the node (the origin is the point of origin of range and LOS, R6.8)', () => {
    let s = atCombat(scene())
    s = act(s, cast(s, 'sx.s.bolt', 'B:L').action as unknown as Record<string, unknown>)
    s = act(s, { type: 'channel', via: 'A:n' })
    const evs = events()
    expect(ev(evs, 'SpellCast')[0]).toMatchObject({ casterId: 'A:L', originId: 'A:n' })
    expect(ev(evs, 'AttackDeclared')[0]).toMatchObject({ attackerId: 'A:L', originId: 'A:n', spellId: 'sx.s.bolt' })
    expect(s.models['A:L']!.focus).toBe(3)
    expect((s.activation as unknown as { x: { channelVia: unknown } }).x.channelVia).toBeNull() // the channel is spent with the cast
  })

  it('answering with the caster casts it from the caster', () => {
    let s = atCombat(scene())
    s = act(s, cast(s, 'sx.s.bolt', 'B:L').action as unknown as Record<string, unknown>)
    s = act(s, { type: 'channel', via: null })
    expect(ev(events(), 'SpellCast')[0]).toMatchObject({ originId: 'A:L' })
    expect(ev(events(), 'AttackDeclared')[0]).toMatchObject({ originId: 'A:L' })
  })

  it('passing the channel decision cancels the cast: back to the combat choice, nothing paid', () => {
    let s = atCombat(scene())
    s = act(s, cast(s, 'sx.s.bolt', 'B:L').action as unknown as Record<string, unknown>)
    s = act(s, { type: 'pass' })
    expect(s.pending.kind).toBe('chooseCombatAction')
    expect(s.models['A:L']!.focus).toBe(5)
    expect(ev(events(), 'SpellCast')).toHaveLength(0)
  })

  it('SPL-010 a SELF spell is never channelled: it is cast at once with no question', () => {
    let s = atCombat(scene())
    s = act(s, cast(s, 'sx.s.ward').action as unknown as Record<string, unknown>)
    expect(s.pending.kind).toBe('chooseCombatAction')
    expect(ev(events(), 'SpellCast')[0]).toMatchObject({ spellId: 'sx.s.ward', originId: 'A:L' })
    expect(tryAct(begin(scene(), 'A:L'), { type: 'channel', via: 'A:n' }).rejection).toBeUndefined() // choosing a channel first is still allowed
  })

  it('SPL-011 an engaged node cannot channel: no node is offered, and an explicit channel through it is refused', () => {
    const foe = mk('B:x', 'sx.p.crit', 'B', 4, 7.6) // beside the node, inside its melee range
    let s = atCombat(scene([foe]))
    expect(tryAct(s, { type: 'channel', via: 'A:n' }).rejection?.code).toBe('E_ENGAGED')
    s = act(s, cast(s, 'sx.s.bolt', 'B:L').action as unknown as Record<string, unknown>)
    expect(s.pending.kind).not.toBe('channel') // the caster is the only origin: the cast goes ahead
    expect(ev(events(), 'SpellCast')[0]).toMatchObject({ originId: 'A:L' })
  })

  it('SPL-009 only an Arc Node can be channelled through', () => {
    const s = atCombat(scene([mk('A:d', 'sx.p.dummy', 'A', -4, 4)]))
    expect(tryAct(s, { type: 'channel', via: 'A:d' }).rejection?.code).toBe('E_TARGET_INVALID')
  })

  it('a channel chosen up front (the any-time action) is not asked about again', () => {
    let s = atCombat(scene())
    s = act(s, { type: 'channel', via: 'A:n' })
    expect(s.pending.kind).toBe('chooseCombatAction')
    s = act(s, cast(s, 'sx.s.bolt', 'B:L').action as unknown as Record<string, unknown>)
    expect(s.pending.kind).not.toBe('channel')
    expect(ev(events(), 'SpellCast')[0]).toMatchObject({ originId: 'A:n' })
  })

  it('a node out of the caster\'s CTRL is not offered', () => {
    const s0 = world([mk('A:L', 'sx.p.cast', 'A', 0, 0), mk('A:n', 'sx.p.node', 'A', -20, 6), mk('B:L', 'sx.p.foe', 'B', 10, 0)])
    let s = atCombat(s0)
    s = act(s, cast(s, 'sx.s.bolt', 'B:L').action as unknown as Record<string, unknown>)
    expect(s.pending.kind).not.toBe('channel')
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
describe('attacks a trigger makes outside the activation (00 section 5: Reciprocate style)', () => {
  /** A shooter beside a Test Counter Knight (blade and gun; after a ranged attack at it, it may attack back). */
  const duel = (focusB = 5) => world([mk('A:L', 'sx.p.shooter', 'A', 0, 0), mk('B:L', 'sx.p.counter', 'B', 1.9, 0, { focus: focusB })])
  const shoot = (s0: GameState): GameState => {
    let s = act(toCombat(s0, 'A:L', 'ranged'), { type: 'chooseAttack', modelId: 'A:L', weaponId: 'sx.w.gun', targetId: 'B:L', additional: false })
    force(s, 1, 2) // a miss: nothing for the damage steps to raise
    s = act(s, { type: 'boostAttack', boost: false })
    return s
  }

  it('ATK-014 a trigger with several ways to attack asks its owner (a chooseAttack outside the activation) and the owner may pick the weapon', () => {
    const s = shoot(duel())
    expect(s.pending.kind).toBe('chooseAttack')
    expect(s.pending.player).toBe('B')
    expect(s.pending.canPass).toBe(true)
    expect(s.pending.context.data).toMatchObject({ code: 'triggerAttack', abilityId: 'sx.a.counter' })
    expect(s.pending.options!.map((o) => o.id)).toEqual(['atk:sx.w.blade:A:L', 'atk:sx.w.gun:A:L'])
    offersAnswers(s)
    expect(s.activation!.activeId).toBe('A:L') // A's activation is untouched
  })

  it('ATK-022 the generated attack is out of the activation: no boost is offered even to a model with focus, and the cost is never paid', () => {
    let s = shoot(duel(5))
    s = act(s, { type: 'chooseAttack', modelId: 'B:L', weaponId: 'sx.w.gun', targetId: 'A:L', additional: false })
    const evs = [...events()]
    expect(ev(evs, 'AttackDeclared')[0]).toMatchObject({ attackerId: 'B:L', targetId: 'A:L', weaponId: 'sx.w.gun' })
    expect(s.attack === null || s.attack.outOfActivation === true).toBe(true)
    const r = settle(s)
    expect(r.kinds.filter((k) => /boost/.test(k) && k.endsWith(':B'))).toEqual([])
    expect(r.s.models['B:L']!.focus).toBe(5)
    expect(r.s.pending.player).toBe('A') // control is back with the active player
    expect(r.s.pending.kind).toBe('chooseActivation') // the shooter had one shot: its activation is over
  })

  it('ATK-022 a boost or an additional attack answer for the generated attack is refused', () => {
    const s = shoot(duel())
    expect(tryAct(s, { type: 'chooseAttack', modelId: 'B:L', weaponId: 'sx.w.gun', targetId: 'A:L', additional: true }).rejection?.code).toBe('E_NOT_AN_OPTION')
    expect(tryAct(s, { type: 'chooseAttack', modelId: 'B:L', weaponId: 'sx.w.hammer', targetId: 'A:L', additional: false }).rejection?.code).toBe('E_NOT_AN_OPTION')
    expect(tryAct(s, { type: 'boostAttack', boost: true }).rejection?.code).toBe('E_WRONG_DECISION')
  })

  it('declining (pass) makes no attack and carries on with the active player\'s turn', () => {
    let s = shoot(duel())
    s = act(s, { type: 'pass' })
    expect(ev(events(), 'AttackDeclared')).toHaveLength(0)
    expect(s.pending.player).toBe('A')
    expect(s.pending.kind).toBe('chooseActivation') // A's one shot is done: its activation is over
  })

  it('a trigger with exactly one way to attack just makes it (00 section 2: forced single option)', () => {
    const s0 = world([mk('A:L', 'sx.p.shooter', 'A', 0, 0), mk('B:L', 'sx.p.counter', 'B', 8, 0)]) // out of the blade\'s reach: only the gun
    let s = act(toCombat(s0, 'A:L', 'ranged'), { type: 'chooseAttack', modelId: 'A:L', weaponId: 'sx.w.gun', targetId: 'B:L', additional: false })
    force(s, 1, 2)
    s = act(s, { type: 'boostAttack', boost: false })
    expect(ev(events(), 'AttackDeclared').map((e) => e.attackerId)).toEqual(['B:L'])
    expect(s.pending.player).toBe('A')
  })

  it('ATK-012 / ATK-021 a trigger on a crit waits until the attack is resolved, then makes one more attack with the same weapon, with no focus spent (R7.19)', () => {
    const s0 = world([mk('A:L', 'sx.p.echo', 'A', 0, 0), mk('B:L', 'sx.p.foe', 'B', 20, 20), mk('B:d', 'sx.p.dummy', 'B', 2, 0)])
    let s = act(toCombat(s0, 'A:L'), { type: 'chooseAttack', modelId: 'A:L', weaponId: 'sx.w.echo-blade', targetId: 'B:d', additional: false })
    force(s, 3, 3) // 3+3+6 = 12 vs DEF 12: a hit and a crit
    s = act(s, { type: 'boostAttack', boost: false })
    expect(s.pending.kind).toBe('boostDamage')
    expect(s.attack!.attackId).toBe('a:1')
    // the next two rolls: the first attack's damage, then the generated attack's roll (forced to a miss so the chain stops)
    FORCED.set(s.rollSeq, [1, 1])
    FORCED.set(s.rollSeq + 1, [1, 2])
    s = act(s, { type: 'boostDamage', boost: false })
    const evs = [...events()]
    const declared = ev(evs, 'AttackDeclared')
    expect(declared).toHaveLength(1) // the generated attack was declared only once the first was resolved
    expect(declared[0]).toMatchObject({ attackerId: 'A:L', targetId: 'B:d', weaponId: 'sx.w.echo-blade' })
    expect(declared[0]!.attackId).not.toBe('a:1')
    const order = evs.filter((e) => ['DamageApplied', 'AttackDeclared'].includes(e.type)).map((e) => e.type)
    expect(order).toEqual(['DamageApplied', 'AttackDeclared'])
    // the generated attack is outside the focus economy: no boost question, a miss ends it, and the 5 focus is untouched
    expect(ev(evs, 'AttackResolved').at(-1)).toMatchObject({ hit: false })
    expect(s.models['A:L']!.focus).toBe(5)
    expect(s.pending.player).toBe('A')
    expect(s.pending.kind).toBe('chooseAttack') // A still has focus for an additional attack
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
describe('generic Maintenance attacks (an ability with trigger maintenance.effects and a makeAttack op)', () => {
  const dawn = (): GameState => {
    const s = world([mk('A:L', 'sx.p.dawn', 'A', 0, 0), mk('B:L', 'sx.p.foe', 'B', 1.9, 0)], { phase: 'maintenance', activation: null })
    return runAvengingForce(s, SYN, [], (st, ev) => ({ state: st, events: ev, pending: st.pending })).state
  }

  it('ATK-022 the owner is offered a basic attack in its Maintenance Phase: pick a weapon or hold fire, with no focus option', () => {
    const s = dawn()
    expect(s.pending.kind).toBe('chooseAttack')
    expect(s.pending.player).toBe('A')
    expect(s.pending.canPass).toBe(true)
    expect(s.pending.window).toBe('maintenance.effects')
    expect(s.pending.context.data).toMatchObject({ code: 'maintenanceAttack', abilityId: 'sx.a.dawn-shot' })
    expect(s.pending.options!.map((o) => o.id)).toEqual(['atk:sx.w.blade:B:L', 'atk:sx.w.gun:B:L', 'skip'])
    offersAnswers(s)
    expect(s.activation).toBeNull()
  })

  it('taking it runs the whole pipeline outside any activation: no boost question for a model that holds focus, and the offer is made once per turn', () => {
    let s = dawn()
    s = act(s, { type: 'chooseAttack', modelId: 'A:L', weaponId: 'sx.w.blade', targetId: 'B:L', additional: false })
    const evs = [...events()]
    for (let i = 0; i < 20 && s.phase === 'maintenance' && s.attack; i++) {
      const k = s.pending.kind
      expect(['boostAttack', 'boostDamage']).not.toContain(k)
      s = act(s, s.pending.canPass ? { type: 'pass' } : (s.pending.options![0]!.action as unknown as Record<string, unknown>))
      evs.push(...events())
    }
    expect(ev(evs, 'AttackDeclared')[0]).toMatchObject({ attackerId: 'A:L', targetId: 'B:L', weaponId: 'sx.w.blade' })
    expect(s.models['A:L']!.focus).toBe(5)
    expect(s.maintAttackDone).toHaveLength(1)
    expect(s.pending.kind === 'chooseAttack' && s.pending.context.data?.code === 'maintenanceAttack').toBe(false)
  })

  it('holding fire (pass) makes no attack and moves on', () => {
    let s = dawn()
    s = act(s, { type: 'pass' })
    expect(ev(events(), 'AttackDeclared')).toHaveLength(0)
    expect(s.pending.kind === 'chooseAttack' && s.pending.context.data?.code === 'maintenanceAttack').toBe(false)
    expect(s.maintAttackDone).toHaveLength(1)
  })

  it('a model that cannot attack (knocked down) is not offered one', () => {
    const s0 = world([mk('A:L', 'sx.p.dawn', 'A', 0, 0, { conditions: ['knockedDown'] }), mk('B:L', 'sx.p.foe', 'B', 1.9, 0)], { phase: 'maintenance', activation: null })
    const s = runAvengingForce(s0, SYN, [], (st, ev) => ({ state: st, events: ev, pending: st.pending })).state
    expect(s.pending.context.data?.code).not.toBe('maintenanceAttack')
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
describe('additional attacks are listed while initial attacks remain (R7.2)', () => {
  const twin = (focus = 3) => world([mk('A:L', 'sx.p.twin', 'A', 0, 0, { focus }), mk('B:L', 'sx.p.foe', 'B', 20, 20), mk('B:d', 'sx.p.dummy', 'B', 2, 0)])
  const swing = (s: GameState, additional = false): GameState => act(s, { type: 'chooseAttack', modelId: 'A:L', weaponId: 'sx.w.blade', targetId: 'B:d', additional })
  const adds = (s: GameState) => (s.pending.options ?? []).filter((o) => o.action.type === 'chooseAttack' && o.action.additional)

  it('ATK-006 before any attack is made no additional attack is offered (initial attacks come first)', () => {
    const s = toCombat(twin(), 'A:L')
    expect(s.pending.kind).toBe('chooseAttack')
    expect(adds(s)).toHaveLength(0)
  })

  it('ATK-006 once one initial attack is made, an additional attack for 1 focus is listed even though an initial attack remains', () => {
    let s = swing(toCombat(twin(), 'A:L'))
    s = settle(s).s
    expect(s.pending.kind).toBe('chooseAttack')
    expect(s.activation!.perModel['A:L']!.initialAttacksLeft['sx.w.blade']).toBe(1)
    expect(adds(s)).toHaveLength(1)
    expect(adds(s)[0]!.cost).toEqual({ focus: 1 })
    offersAnswers(s)
    expect(legalActions(s).some((a) => a.type === 'chooseAttack' && a.additional)).toBe(true)
  })

  it('ATK-006 taking it costs 1 focus and gives up the initial attack still to come (the RULING in 00 section 14)', () => {
    let s = settle(swing(toCombat(twin(), 'A:L'))).s
    s = swing(s, true)
    expect(s.models['A:L']!.focus).toBe(2) // the boost question is next; no boost taken
    s = settle(s).s
    expect(s.activation!.perModel['A:L']!.additionalAttacks).toBe(1)
    expect(Object.values(s.activation!.perModel['A:L']!.initialAttacksLeft).every((n) => n === 0)).toBe(true)
  })

  it('ATK-006 with no focus nothing is listed, and asking for one is refused', () => {
    let s = settle(swing(toCombat(twin(0), 'A:L'))).s
    expect(adds(s)).toHaveLength(0)
    expect(tryAct(s, { type: 'chooseAttack', modelId: 'A:L', weaponId: 'sx.w.blade', targetId: 'B:d', additional: true }).rejection?.code).toBe('E_INSUFFICIENT_FOCUS')
  })

  it('ATK-006 a model that cannot spend focus (a solo trooper) is never offered one', () => {
    const s0 = world([mk('A:L', 'sx.p.foe', 'A', -20, 0), mk('B:L', 'sx.p.foe', 'B', 20, 20), mk('A:t', 'sx.p.trooper', 'A', 0, 0), mk('B:d', 'sx.p.dummy', 'B', 1.6, 0)])
    let s = begin(s0, 'A:t')
    s = act(s, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:t' })
    s = act(s, { type: 'chooseCombatAction', modelId: 'A:t', choice: 'melee' })
    s = act(s, { type: 'chooseAttack', modelId: 'A:t', weaponId: 'sx.w.spear', targetId: 'B:d', additional: false })
    s = settle(s).s
    expect(adds(s)).toHaveLength(0)
  })
})
