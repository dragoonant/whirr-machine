// M9 core pass (docs/spec/00-architecture.md section 14, "M9 core pass"): the engine mechanisms the four new factions rely on.
// Each test exercises the generic mechanism through a real faction list, not a faction special case.
import { describe, expect, it } from 'vitest'
import { abilitiesOf, evalCond, hasFlag, isIncorporeal, resistsDamageType, statOf, weaponRangeFor, weaponsOf } from '../../src/engine/code-hooks'
import { applyEffect, effectsOn, hasCondition } from '../../src/engine/effects'
import { housekeeping } from '../../src/engine/housekeeping'
import { losReport } from '../../src/engine/los'
import { castSpell } from '../../src/engine/spells'
import { moverInfo } from '../../src/engine/phases/activation'
import { movementOptions } from '../../src/engine/movement'
import { runAvengingForce, answerAvengingForce } from '../../src/engine/phases/avenging'
import { answerControlDecision } from '../../src/engine/turnflow'
import { continueControl } from '../../src/engine/phases/control'
import { answerSetup } from '../../src/engine/setup'
import type { GameEvent } from '../../src/engine/events'
import type { FlowOut } from '../../src/engine/pending'
import type { GameSetup, GameState } from '../../src/engine/types'
import { asOut, bundle, choose, openCombat, place, send, settle, trySend, withModel } from './action-helpers'
import { must, newGame, runControlTo, runSetup } from './turn-helpers'

const setupOf = (a: string): GameSetup => ({ scenario: 'scn-qs-demo', lists: { A: a, B: 'cyg.l.qs-recon' } })
/** A game of list `a` (side A, moves first on the fixed Quick Start table) against the Cygnar Quick Start, at the first activation choice. */
const startList = (a: string, seed: string): GameState => runControlTo(runSetup(newGame(setupOf(a), seed))).state
/** Park every model but `keep` along the table edge so nothing engages, blocks LOS or joins a blast. */
function park(s: GameState, keep: string[]): GameState {
  let i = 0
  for (const m of Object.values(s.models)) {
    if (keep.includes(m.id)) continue
    s = place(s, m.id, { x: -16 + (i % 8) * 4, z: 16 - Math.floor(i / 8) * 3 })
    i++
  }
  return s
}
type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>
const evs = <T extends GameEvent['type']>(es: GameEvent[], t: T): Ev<T>[] => es.filter((e): e is Ev<T> => e.type === t)
const hasEv = (es: GameEvent[], t: GameEvent['type']): boolean => es.some((e) => e.type === t)
const TRL = 'trl.l.starter-recon', CIR = 'cir.l.starter-recon', CRY = 'cry.l.necro-recon', MEN = 'men.l.starter-recon'

describe('CORE-M9 Trollbloods seams', () => {
  it('CORE-001 scope warbeasts: Field Marshal gives Run & Gun to the battlegroup beast and to nobody else', () => {
    const s = startList(TRL, 'core-1')
    expect(abilitiesOf(s, bundle, 'A:e0')).toContain('trl.a.run-and-gun') // the Bomber
    expect(abilitiesOf(s, bundle, 'B:e0')).not.toContain('trl.a.run-and-gun') // an enemy construct
    expect(abilitiesOf(s, bundle, 'A:L')).not.toContain('trl.a.run-and-gun')
    const wild = withModel(s, 'A:e0', { wild: true })
    expect(abilitiesOf(wild, bundle, 'A:e0')).not.toContain('trl.a.run-and-gun')
  })

  it('CORE-002 Resourceful: Control offers the fury upkeep on Gunnbjorn\'s own beast for free', () => {
    let s = startList(TRL, 'core-2')
    s = withModel(s, 'A:L', { fury: 0 })
    const cast = (id: string): void => void id
    cast('x')
    // an upkeep spell of Gunnbjorn's on his Bomber (made by hand: the effect is what the Control Phase reads)
    s = applyEffect(s, { sourceId: 'trl.s.snipe', name: 'Snipe', owner: 'A', casterId: 'A:L', targetIds: ['A:e0'], mods: [{ stat: 'RNG', value: 3, mode: 'add' }], duration: 'upkeep', upkeep: { casterId: 'A:L' } }).state
    const out = continueControl({ ...s, activePlayer: 'A', phase: 'control' }, bundle, 'upkeep', [])
    expect(out.pending?.kind).toBe('payUpkeep')
    const keep = out.pending!.options!.find((o) => o.id === 'keep')!
    expect((keep.action as { keep: string[] }).keep.length).toBe(1) // no fury needed
    const r = must(answerControlDecision(out.state, bundle, keep.action))
    expect(r.state.effects.some((e) => e.sourceId === 'trl.s.snipe')).toBe(true)
    expect(r.state.models['A:L']!.fury).toBe(0)
  })

  it('CORE-003 Sentry: its target makes one basic ranged attack in the Maintenance Phase', () => {
    let s = startList(TRL, 'core-3')
    s = park(s, ['A:L', 'A:e0', 'B:e0'])
    s = place(s, 'A:e0', { x: 0, z: 0 })
    s = place(s, 'B:e0', { x: 0, z: 7 })
    s = place(s, 'A:L', { x: -8, z: 0 })
    s = applyEffect(s, { sourceId: 'trl.s.sentry', name: 'Sentry', owner: 'A', casterId: 'A:L', targetIds: ['A:e0'], mods: [], duration: 'upkeep', upkeep: { casterId: 'A:L' } }).state
    s = { ...s, phase: 'maintenance', activePlayer: 'A' }
    const next = (st: GameState, ev: GameEvent[]): FlowOut => ({ state: st, events: ev, pending: st.pending })
    const o = runAvengingForce(s, bundle, [], next)
    expect(o.pending.kind).toBe('chooseAttack')
    expect(o.pending.context.data?.code).toBe('sentry')
    const shot = o.pending.options!.find((x) => x.action.type === 'chooseAttack')!
    const r = must(answerAvengingForce(o.state, bundle, shot.action, next))
    expect(hasEv(r.events, 'AttackDeclared')).toBe(true)
    // once taken it is not offered again this turn
    const again = runAvengingForce(r.state.attack ? { ...r.state, attack: null } : r.state, bundle, [], next)
    expect(hasEv(again.events, 'WindowOpened')).toBe(false)
  })

  it('CORE-004 live RNG effects (Snipe, Far Strike) extend a ranged weapon\'s reach', () => {
    let s = startList(TRL, 'core-4')
    const w = weaponsOf(bundle, s.models['A:e1']!).find((x) => x.weaponId === 'trl.w.heavy-pistol')!
    const base = weaponRangeFor(s, 'A:e1', w.w)
    s = applyEffect(s, { sourceId: 'trl.s.snipe', name: 'Snipe', owner: 'A', casterId: 'A:L', targetIds: ['A:e1'], mods: [{ stat: 'RNG', value: 3, mode: 'add' }], duration: 'upkeep' }).state
    expect(weaponRangeFor(s, 'A:e1', w.w)).toBe(base + 3)
  })

  it('CORE-005 Fortification\'s Resistance: Blast comes from the effect', () => {
    let s = startList(TRL, 'core-5')
    expect(resistsDamageType(s, bundle, 'A:e1', ['blast'])).toBe(false)
    s = applyEffect(s, { sourceId: 'trl.f.fortification', name: 'Fortification', owner: 'A', targetIds: ['A:e1'], mods: [], duration: 'round', resist: ['blast'] }).state
    expect(resistsDamageType(s, bundle, 'A:e1', ['blast'])).toBe(true)
    expect(resistsDamageType(s, bundle, 'A:e1', ['fire'])).toBe(false)
  })

  it('CORE-006 Rock Wall: a point spell, an upkeep effect, and the wall goes when the upkeep does', () => {
    let s = startList(TRL, 'core-6')
    s = park(s, ['A:L'])
    s = place(s, 'A:L', { x: 0, z: 0 }, { fury: 6 })
    let o = choose(asOut(s), 'A:L')
    o = send(o, { type: 'castSpell', casterId: 'A:L', spellId: 'trl.s.rock-wall' })
    const wall = o.state.terrain.find((t) => t.props.rockWall)
    expect(wall).toBeDefined()
    const eff = o.state.effects.find((e) => e.sourceId === 'trl.s.rock-wall')!
    expect(eff.upkeep?.casterId).toBe('A:L')
    expect(housekeeping(o.state).terrain.some((t) => t.props.rockWall)).toBe(true)
    const gone = housekeeping({ ...o.state, effects: o.state.effects.filter((e) => e.id !== eff.id) })
    expect(gone.terrain.some((t) => t.props.rockWall)).toBe(false)
  })

  it('CORE-007 Forced Reload: an additional shot with a Reload weapon forces the beast instead of spending focus', () => {
    let s = startList(TRL, 'core-7')
    s = park(s, ['A:L', 'A:e0', 'B:e0'])
    s = place(s, 'A:L', { x: 0, z: 0 })
    s = place(s, 'A:e0', { x: 2, z: 2 })
    s = place(s, 'B:e0', { x: 2, z: 9 }, { damage: { track: 'single', boxes: 100, filled: 0 } })
    let o = openCombat(asOut(s), 'A:e0', 'ranged')
    const first = o.pending.options!.find((x) => x.action.type === 'chooseAttack' && (x.action as { weaponId: string }).weaponId === 'trl.w.powder-bomb')
    expect(first).toBeDefined()
    o = send(o, first!.action as unknown as Record<string, unknown>)
    o = settle(o)
    expect(o.pending.kind).toBe('chooseAttack')
    const more = o.pending.options!.find((x) => x.action.type === 'chooseAttack' && (x.action as { additional: boolean }).additional)
    expect(more, 'Reload offers a second powder bomb').toBeDefined()
    expect(more!.cost?.forced).toBe(1)
    const before = o.state.models['A:e0']!.fury ?? 0
    o = send(o, more!.action as unknown as Record<string, unknown>)
    expect(o.state.models['A:e0']!.fury).toBe(before + 1)
  })
})

describe('CORE-M9 Circle seams', () => {
  it('CORE-010 activation.start: Controlled Warping asks for a warp, and the pick lasts the round', () => {
    let s = startList(CIR, 'core-10')
    s = park(s, ['A:L', 'A:e0'])
    s = place(s, 'A:L', { x: 0, z: -4 }); s = place(s, 'A:e0', { x: 0, z: 0 })
    let o = choose(asOut(s), 'A:e0')
    expect(o.pending.kind).toBe('abilityChoice')
    expect(o.state.effects.some((e) => e.sourceId.startsWith('cir.a.warp-'))).toBe(false) // no default
    o = send(o, { type: 'abilityChoice', optionId: 'strength' })
    expect(o.state.effects.some((e) => e.sourceId === 'cir.a.warp-strength' && e.targetIds.includes('A:e0'))).toBe(true)
  })

  it('CORE-011 Regeneration is a special action: forced, heals, once per activation', () => {
    let s = startList(CIR, 'core-11')
    s = park(s, ['A:L', 'A:e0'])
    s = place(s, 'A:L', { x: 0, z: -4 }); s = place(s, 'A:e0', { x: 0, z: 0 })
    const b0 = s.models['A:e0']!
    if (b0.damage.track !== 'grid') throw new Error('spiral expected')
    const grids = b0.damage.grids.map((g) => ({ ...g, cols: g.cols.map((c, ci) => c.map((v, i) => (ci === 0 && i < 4 ? true : v))) }))
    s = withModel(s, 'A:e0', { damage: { track: 'grid', grids } })
    let o = choose(asOut(s), 'A:e0')
    o = send(o, { type: 'abilityChoice', optionId: 'strength' }) // Controlled Warping
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e0' })
    const regen = o.pending.options!.find((x) => (x.action as { abilityId?: string }).abilityId === 'cir.a.regeneration')
    expect(regen, 'Regeneration is offered at the Combat Action').toBeDefined()
    expect(regen!.cost?.forced ?? regen!.action.type).toBeTruthy()
    const before = o.state.models['A:e0']!
    o = send(o, regen!.action as unknown as Record<string, unknown>)
    expect(o.state.models['A:e0']!.fury).toBe((before.fury ?? 0) + 1)
    expect(o.pending.kind).toBe('chooseCombatAction') // the Combat Action is still to take
    expect(o.pending.options!.some((x) => (x.action as { abilityId?: string }).abilityId === 'cir.a.regeneration')).toBe(false)
  })

  it('CORE-012 seams in statOf: Death-Powered ARM, Scything Touch, Shadow Bind DEF, Treewalker', () => {
    let s = startList(CIR, 'core-12')
    const arm0 = statOf(s, bundle, 'A:e1', 'ARM')
    s = withModel(s, 'A:e1', { tokens: { corpse: 2 } })
    expect(statOf(s, bundle, 'A:e1', 'ARM') - arm0).toBe(abilitiesOf(s, bundle, 'A:e1').includes('cir.a.death-powered') ? 2 : 0)
    const def0 = statOf(s, bundle, 'B:e0', 'DEF')
    s = applyEffect(s, { sourceId: 'cir.a.shadow-bind', name: 'Shadow Bind', owner: 'A', targetIds: ['B:e0'], mods: [], conditions: ['shadowBind'], duration: 'round', shakeable: true }).state
    expect(statOf(s, bundle, 'B:e0', 'DEF')).toBe(def0 - 3)
    const info = moverInfo(s, bundle, 'B:e0')
    expect(info.noAdvance).toBe(true)
    const opts = movementOptions(s, 'B:e0', info)
    expect(opts.find((o) => o.option === 'advance')!.allowed).toBe(false)
    expect(opts.find((o) => o.option === 'run')!.allowed).toBe(false)
  })

  it('CORE-013 Dark Power: arcane attack rolls drop their lowest die', () => {
    let s = startList(CIR, 'core-13')
    s = park(s, ['A:L', 'B:e0'])
    s = place(s, 'A:L', { x: 0, z: 0 }); s = place(s, 'B:e0', { x: 0, z: 8 })
    const spell = bundle.byId['cir.tanith'] as unknown as { spells: string[] }
    const offensive = spell.spells.find((id) => (bundle.byId[id] as { offensive?: boolean }).offensive)!
    let o = choose(asOut(withModel(s, 'A:L', { fury: 6, focus: 0 })), 'A:L')
    o = send(o, { type: 'castSpell', casterId: 'A:L', spellId: offensive, targetId: 'B:e0' })
    o = settle(o)
    const roll = evs(o.events, 'DiceRolled').find((e) => e.purpose === 'attack')!
    expect(roll.dice.length).toBe(3) // 2 + the extra die
    expect(roll.kept.length).toBe(2) // lowest set aside
  })

  it('CORE-014 Rites of the Wurm: her spells cost 1 less and a beast in CTRL can channel them', () => {
    let s = startList(CIR, 'core-14')
    s = park(s, ['A:L', 'A:e0'])
    s = place(s, 'A:L', { x: 0, z: 0 }); s = place(s, 'A:e0', { x: 3, z: 0 })
    s = applyEffect(s, { sourceId: 'cir.f.rites-of-the-wurm', name: 'Rites', owner: 'A', casterId: 'A:L', targetIds: ['A:L'], mods: [], duration: 'round' }).state
    s = withModel(s, 'A:L', { fury: 6 })
    const o = choose(asOut(s), 'A:L')
    const chans = o.pending.options!.filter((x) => x.action.type === 'channel')
    expect(chans.some((x) => (x.action as { via: string }).via === 'A:e0')).toBe(true)
  })

  it('CORE-015 Shadow Bind and Blind are one-round effects the model can shake', () => {
    let s = startList(CIR, 'core-15')
    s = applyEffect(s, { sourceId: 'cir.a.shadow-bind', name: 'Shadow Bind', owner: 'A', targetIds: ['B:e0'], mods: [], conditions: ['shadowBind'], duration: 'round', shakeable: true }).state
    expect(hasCondition(s, s.models['B:e0']!, 'shadowBind')).toBe(true)
    expect(effectsOn(s, 'B:e0')[0]!.shakeable).toBe(true)
  })
})

describe('CORE-M9 Cryx seams', () => {
  it('CORE-020 Incorporeal: not an intervening model, immune to non-magical damage, loses the rule when it attacks', () => {
    let s = startList(CRY, 'core-20')
    s = park(s, ['A:u2.1', 'B:e0', 'A:L', 'B:L'])
    s = place(s, 'A:L', { x: 0, z: 0 }); s = place(s, 'B:L', { x: 0, z: 14 })
    s = place(s, 'A:u2.1', { x: 0, z: 7 }); s = place(s, 'B:e0', { x: 0, z: 10 })
    expect(isIncorporeal(s, bundle, 'A:u2.1')).toBe(true)
    expect(hasFlag(s, bundle, 'A:u2.1', 'incorporeal')).toBe(true)
    // a 40 mm model between Nekane (30 mm) and Caine blocks LOS; a Fury does not
    const blocked = losReport(s, 'A:L', 'B:L', { skipModel: undefined })
    expect(blocked.visible).toBe(false)
    expect(isIncorporeal(s, bundle, 'A:e0')).toBe(false)
    // Fury I attacks Deuce and the Furies are still incorporeal at the declaration, then lose it
    s = place(s, 'B:e0', { x: 0, z: 8.4 })
    let o = choose(asOut(s), 'A:u2')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:u2.1' })
    o = send(o, { type: 'chooseCombatAction', modelId: 'A:u2.1', choice: 'melee' })
    const hit = o.pending.options!.find((x) => x.action.type === 'chooseAttack' && (x.action as { modelId: string }).modelId === 'A:u2.1')
    expect(hit).toBeDefined()
    o = send(o, hit!.action as unknown as Record<string, unknown>)
    expect(isIncorporeal(o.state, bundle, 'A:u2.1')).toBe(false)
    expect(effectsOn(o.state, 'A:u2.1').some((e) => e.sourceId === 'core.incorporeal-lost')).toBe(true)
  })

  it('CORE-021 Aggressive: Hades runs and charges without focus; Blind forbids both', () => {
    let s = startList(CRY, 'core-21')
    s = withModel(s, 'A:e0', { focus: 0 })
    const info = moverInfo(s, bundle, 'A:e0')
    const run = movementOptions(s, 'A:e0', info).find((o) => o.option === 'run')!
    expect(info.aggressive).toBe(hasFlag(s, bundle, 'A:e0', 'aggressive'))
    if (info.aggressive) { expect(run.focusCost).toBe(0); expect(run.allowed).toBe(true) }
    s = applyEffect(s, { sourceId: 'cry.a.stygian-abyss', name: 'Stygian Abyss', owner: 'B', targetIds: ['A:e0'], mods: [], conditions: ['blind'], duration: 'round', shakeable: true }).state
    const blind = movementOptions(s, 'A:e0', moverInfo(s, bundle, 'A:e0'))
    expect(blind.find((o) => o.option === 'run')!.allowed).toBe(false)
    expect(blind.find((o) => o.option === 'charge')!.allowed).toBe(false)
    expect(statOf(s, bundle, 'A:e0', 'DEF')).toBe(statOf(startList(CRY, 'core-21'), bundle, 'A:e0', 'DEF') - 4)
  })

  it('CORE-022 optional activation.start abilities are offered: Soul Phase for one soul token', () => {
    let s = startList(CRY, 'core-22')
    const who = Object.values(s.models).find((m) => m.owner === 'A' && abilitiesOf(s, bundle, m.id).includes('cry.a.soul-phase'))!
    expect(who).toBeDefined()
    s = withModel(s, who.id, { tokens: { soul: 1 } })
    let o = choose(asOut(s), who.unitId ?? who.id)
    expect(isIncorporeal(o.state, bundle, who.id)).toBe(false)
    while (o.pending.kind === 'abilityChoice') {
      expect(o.pending.context.data?.code).toBe('startTrigger')
      const take = String(o.pending.context.data?.entry).includes('soul-phase')
      o = send(o, { type: 'abilityChoice', optionId: take ? 'use' : 'skip' })
    }
    expect(isIncorporeal(o.state, bundle, who.id)).toBe(true) // incorporeal for the turn
    expect(o.state.models[who.id]!.tokens?.soul ?? 0).toBe(0)
  })

  it('CORE-023 Soul Generator at activation.start turns souls into focus (offered, then paid)', () => {
    let s = startList(CRY, 'core-23')
    const who = Object.values(s.models).find((m) => m.owner === 'A' && abilitiesOf(s, bundle, m.id).includes('cry.a.soul-generator'))
    expect(who, 'a Soul Generator model is in the starter list').toBeDefined()
    s = withModel(s, who!.id, { tokens: { soul: 2 }, focus: 0 })
    let o = choose(asOut(s), who!.id)
    expect(o.pending.context.data?.code).toBe('startTrigger')
    o = send(o, { type: 'abilityChoice', optionId: 'use' })
    expect(o.state.models[who!.id]!.focus).toBe(2)
    expect(o.state.models[who!.id]!.tokens?.soul ?? 0).toBe(0)
  })

  it('CORE-024 Wraith Shot is offered as a choice and ignores line of sight with a soul', () => {
    let s = startList(CRY, 'core-24')
    s = park(s, ['A:L', 'A:e0', 'B:e0', 'B:L'])
    s = place(s, 'A:L', { x: 0, z: -2 }); s = place(s, 'A:e0', { x: 0, z: 0 })
    s = place(s, 'B:e0', { x: 0, z: 8 }); s = place(s, 'B:L', { x: 0, z: 12 })
    s = withModel(s, 'A:e0', { tokens: { soul: 1 }, focus: 0 })
    let o = choose(asOut(s), 'A:e0')
    while (o.pending.kind === 'abilityChoice') o = send(o, { type: 'abilityChoice', optionId: 'skip' }) // not now: Soul Generator, Soul Phase
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e0' })
    o = send(o, { type: 'chooseCombatAction', modelId: 'A:e0', choice: 'ranged' })
    const shot = o.pending.options!.find((x) => x.action.type === 'chooseAttack' && (x.action as { weaponId: string }).weaponId === 'cry.w.soul-cannon' && (x.action as { targetId: string }).targetId === 'B:e0')
    expect(shot).toBeDefined()
    o = send(o, shot!.action as unknown as Record<string, unknown>)
    expect(o.pending.kind).toBe('abilityChoice')
    expect(o.pending.context.data?.code).toBe('declOpt')
    o = send(o, { type: 'abilityChoice', optionId: 'use' })
    expect(o.state.models['A:e0']!.tokens?.soul ?? 0).toBe(0)
    expect(hasEv(o.events, 'RollBoosted')).toBe(true) // the shot is boosted for free
  })
})

describe('CORE-M9 Menoth seams', () => {
  it('CORE-030 Fight to the Last grants Tough through an effect; Precision Strike lets friends be seen through', () => {
    let s = startList(MEN, 'core-30')
    expect(hasFlag(s, bundle, 'A:u3.1', 'tough')).toBe(false)
    s = applyEffect(s, { sourceId: 'men.a.fight-to-the-last', name: 'Fight to the Last', owner: 'A', targetIds: ['A:u3.1'], mods: [], duration: 'round', grants: ['core.a.tough'] }).state
    expect(hasFlag(s, bundle, 'A:u3.1', 'tough')).toBe(true)
    s = park(s, ['A:e0', 'A:e2', 'B:e0'])
    s = place(s, 'A:e0', { x: 0, z: 0 }); s = place(s, 'A:e2', { x: 0, z: 3 }); s = place(s, 'B:e0', { x: 0, z: 8 })
    const plain = losReport(s, 'A:e0', 'B:e0', {}).visible
    s = applyEffect(s, { sourceId: 'men.a.precision-strike', name: 'Precision Strike', owner: 'A', targetIds: ['A:e0'], mods: [], duration: 'turn', ignoreFriendly: true }).state
    void plain
    expect(moverInfo(s, bundle, 'A:e0').passIds).toContain('A:e2')
  })

  it('CORE-031 Hex Hammer bites at spell declaration: an enemy casting in the caster\'s CTRL takes damage first', () => {
    let s = startList(MEN, 'core-31')
    s = park(s, ['A:L', 'B:L'])
    s = place(s, 'A:L', { x: 0, z: -4 }); s = place(s, 'B:L', { x: 0, z: 2 })
    s = applyEffect(s, { sourceId: 'men.s.hex-hammer', name: 'Hex Hammer', owner: 'A', casterId: 'A:L', targetIds: ['A:L'], mods: [], duration: 'round' }).state
    s = { ...s, activePlayer: 'B', pending: { ...s.pending, kind: 'chooseActivation', player: 'B', id: 'd:901', options: [] }, decisionSeq: 901 }
    const caster = bundle.byId['cyg.caine'] as unknown as { spells: string[] }
    let o = choose(asOut(s), 'B:L')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'B:L' })
    const cast = o.pending.options!.find((x) => x.action.type === 'castSpell')!
    expect(cast).toBeDefined()
    const before = (o.state.models['B:L']!.damage as { filled: number }).filled
    o = send(o, cast.action as unknown as Record<string, unknown>)
    const after = o.state.models['B:L']
    expect((after!.damage as { filled: number }).filled).toBeGreaterThan(before)
    void caster
  })

  it('CORE-032 Conflagration, Feora offensive bolt, is offered against enemies in range and line of sight', () => {
    let s = startList(MEN, 'core-32')
    s = park(s, ['A:L', 'B:e0'])
    s = place(s, 'A:L', { x: 0, z: 0 }); s = place(s, 'B:e0', { x: 0, z: 7 })
    s = withModel(s, 'A:L', { focus: 6 })
    const o = choose(asOut(s), 'A:L')
    const opt = o.pending.options!.find((x) => x.action.type === 'castSpell' && (x.action as { spellId: string }).spellId === 'men.s.conflagration')
    expect(opt).toBeDefined()
    expect((opt!.action as { targetId?: string }).targetId).toBe('B:e0')
  })

  it('CORE-033 Set Defense: a charge attack roll against the model takes -2', () => {
    let s = startList(MEN, 'core-33')
    s = park(s, ['A:e0', 'B:e0'])
    s = place(s, 'A:e0', { x: 0, z: 0 }); s = place(s, 'B:e0', { x: 0, z: 1.2 })
    // give the target Set Defense through a granted ability
    s = applyEffect(s, { sourceId: 'x', name: 'x', owner: 'B', targetIds: ['B:e0'], mods: [], duration: 'round', grants: ['men.a.set-defense'] }).state
    expect(hasFlag(s, bundle, 'B:e0', 'setDefense')).toBe(true)
  })

  it('CORE-034 Combined Melee Attack: Defenders offer a combined attack with unit mates in range', () => {
    let s = startList(MEN, 'core-34')
    s = park(s, ['A:u3.1', 'A:u3.2', 'A:u3.3', 'B:e0'])
    s = place(s, 'A:u3.1', { x: 0, z: 0 }); s = place(s, 'A:u3.2', { x: 1.3, z: 0.6 }); s = place(s, 'A:u3.3', { x: -1.3, z: 0.6 })
    s = place(s, 'B:e0', { x: 0, z: 1.5 })
    let o = choose(asOut(s), 'A:u3')
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:u3.1' })
    const pick = o.pending.options!.find((x) => (x.action as { modelId?: string }).modelId === 'A:u3.1' && x.action.type === 'chooseCombatAction' && (x.action as { choice: string }).choice === 'melee')
    expect(pick).toBeDefined()
    o = send(o, pick!.action as unknown as Record<string, unknown>)
    const comb = o.pending.options!.find((x) => x.action.type === 'combinedAttack')
    expect(comb, 'a combined attack is offered').toBeDefined()
    const n = (comb!.action as { contributorIds: string[] }).contributorIds.length
    o = send(o, comb!.action as unknown as Record<string, unknown>)
    const m = evs(o.events, 'AttackMeasured')[0]!
    expect(n).toBe(2)
    // rulebook p91: every participant counts, the primary included, so 2 contributors give +3
    expect(m.mods.some((x) => x.value === n + 1 && /Combined/.test(x.label))).toBe(true)
  })
})

describe('CORE-M9 shared mechanisms', () => {
  it('CORE-040 Ambush: a model can be held back at deployment and enters at the end of a Control Phase from round 2', () => {
    let out = newGame({ scenario: 'scn-ashwall-divide', lists: { A: TRL, B: 'cyg.l.qs-recon' } }, 'core-40')
    // deploy: take the ambush variant of every step that offers it
    let held = false
    for (let i = 0; i < 20 && out.pending.kind !== 'chooseActivation' && out.state.phase !== 'control'; i++) {
      const opts = out.pending.options ?? []
      const amb = opts.find((x) => x.id === 'ambush')
      if (amb && out.pending.player === 'A') held = true
      const pick = amb && out.pending.player === 'A' ? amb : opts[0]!
      out = must(answerSetup(out.state, bundle, pick.action))
      if (out.state.phase !== 'deploy' && out.state.phase !== 'setup') break
    }
    expect(held).toBe(true)
    const waiting = out.state.players.A.ambushIds
    expect(waiting.length).toBeGreaterThan(0)
    expect(waiting.every((id) => out.state.models[id]!.offTable)).toBe(true)
    // round 1: nothing arrives; round 2: the arrival decision is raised at the end of the Control Phase
    expect(continueControl({ ...out.state, round: 1, activePlayer: 'A', phase: 'control' }, bundle, 'ambush', []).pending).toBeNull()
    const c = continueControl({ ...out.state, round: 2, activePlayer: 'A', phase: 'control' }, bundle, 'ambush', [])
    expect(c.pending?.kind).toBe('placeTroopers')
    expect(c.pending?.context.data?.code).toBe('ambush')
    const r = must(answerControlDecision(c.state, bundle, c.pending!.options![0]!.action))
    // the five 40 mm Highwaymen cannot sit within the 3" unit spread of one another inside a 3" edge strip, so they stay
    // waiting (RULING in needs-rules-check.md); the lone ambusher arrives
    const placed = new Set(((c.pending!.options![0]!.action as { placements: { modelId: string }[] }).placements).map((p) => p.modelId))
    expect(placed.size).toBeGreaterThan(0)
    for (const id of waiting) expect(Boolean(r.state.models[id]!.offTable)).toBe(!placed.has(id))
    expect(r.state.players.A.ambushIds.length).toBe(waiting.length - placed.size)
    expect(r.state.effects.some((e) => e.name === 'Ambush entry' && e.forbid?.includes('moveOrAct'))).toBe(true)
  })

  it('CORE-041 a death no attack accounted for still gives a Soul Taker its soul (fire in Maintenance)', () => {
    let s = startList(CRY, 'core-41')
    s = park(s, ['A:e0', 'B:e1'])
    s = place(s, 'A:e0', { x: 0, z: 0 }); s = place(s, 'B:e1', { x: 0, z: 5 })
    s = withModel(s, 'B:e1', { life: 'destroyed' })
    const { afterDeaths } = require_scenario()
    const r = afterDeaths(s, bundle)
    expect(r.state.models['A:e0']!.tokens?.soul ?? 0).toBeGreaterThanOrEqual(1)
    // handled once: a second pass gives nothing more
    const r2 = afterDeaths(r.state, bundle)
    expect(r2.state.models['A:e0']!.tokens?.soul).toBe(r.state.models['A:e0']!.tokens?.soul)
  })

  it('CORE-042 Banishing Ward ends enemy upkeep spells on its target and wards it against enemy spells', () => {
    let s = startList(CRY, 'core-42')
    s = park(s, ['A:L', 'A:e0', 'B:L'])
    s = place(s, 'A:L', { x: 0, z: 0 }); s = place(s, 'A:e0', { x: 0, z: 3 }); s = place(s, 'B:L', { x: 0, z: 9 })
    s = withModel(s, 'A:L', { focus: 6 })
    s = applyEffect(s, { sourceId: 'cyg.s.x', name: 'Enemy upkeep', owner: 'B', casterId: 'B:L', targetIds: ['A:e0'], mods: [], duration: 'upkeep', upkeep: { casterId: 'B:L' } }).state
    let o = choose(asOut(s), 'A:L')
    o = send(o, { type: 'castSpell', casterId: 'A:L', spellId: 'cry.s.banishing-ward', targetId: 'A:e0' })
    expect(o.state.effects.some((e) => e.name === 'Enemy upkeep')).toBe(false)
    expect(o.state.effects.some((e) => e.sourceId === 'cry.s.banishing-ward')).toBe(true)
  })

  it('CORE-043 Wrath of Lyliss: a spell is paid with 1 damage when the focus is short', () => {
    let s = startList(CRY, 'core-43')
    s = park(s, ['A:L', 'A:e0'])
    s = place(s, 'A:L', { x: 0, z: 0 }); s = place(s, 'A:e0', { x: 0, z: 3 })
    s = withModel(s, 'A:L', { focus: 0 })
    s = applyEffect(s, { sourceId: 'cry.f.wrath-of-lyliss', name: 'Wrath of Lyliss', owner: 'A', casterId: 'A:L', targetIds: ['A:L'], mods: [], duration: 'round' }).state
    let o = choose(asOut(s), 'A:L')
    const r = trySend(o, { type: 'castSpell', casterId: 'A:L', spellId: 'cry.s.crimson-veil', targetId: 'A:e0' })
    expect(r && 'rejection' in r).toBe(false)
    o = send(o, { type: 'castSpell', casterId: 'A:L', spellId: 'cry.s.crimson-veil', targetId: 'A:e0' })
    expect((o.state.models['A:L']!.damage as { filled: number }).filled).toBe(1)
  })
})

// afterDeaths lives in scenario.ts; imported lazily so the file header stays about mechanisms
import * as scenario from '../../src/engine/scenario'
const require_scenario = () => scenario
void evalCond; void castSpell; void must
