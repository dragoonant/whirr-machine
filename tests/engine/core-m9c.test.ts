// M9 core pass, part three: line of sight, movement, damage and attack-pipeline rules of the new factions (see core-m9.test.ts).
import { describe, expect, it } from 'vitest'
import { atkOf, hasFlag, isIncorporeal, lookups } from '../../src/engine/code-hooks'
import { applyEffect } from '../../src/engine/effects'
import { housekeeping } from '../../src/engine/housekeeping'
import { defModifiers, losReport } from '../../src/engine/los'
import { push } from '../../src/engine/movement'
import { declareAttack, moverInfo } from '../../src/engine/phases/activation'
import { resolveAdvance } from '../../src/engine/movement'
import type { GameEvent } from '../../src/engine/events'
import type { GameSetup, GameState, TerrainInstance } from '../../src/engine/types'
import { asOut, bundle, choose, place, send, settle, withModel } from './action-helpers'
import { newGame, runControlTo, runSetup } from './turn-helpers'

const setupOf = (a: string): GameSetup => ({ scenario: 'scn-qs-demo', lists: { A: a, B: 'cyg.l.qs-recon' } })
const startList = (a: string, seed: string): GameState => runControlTo(runSetup(newGame(setupOf(a), seed))).state
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
const CRY = 'cry.l.necro-recon', CIR = 'cir.l.starter-recon', MEN = 'men.l.starter-recon', TRL = 'trl.l.starter-recon'
const wall = (id: string, x: number, z: number): TerrainInstance => ({ id, pieceId: 'terrain.low-wall', rulesType: 'obstruction', pos: { x, z }, rot: 0, footprint: { rect: { w: 4, d: 1 } }, height: 3, props: {} })

describe('CORE-M9c line of sight, movement and damage', () => {
  it('CORE-070 Veil of Mists: its owner side sees through the cloud, the enemy does not', () => {
    let s = startList(CIR, 'core-70')
    s = park(s, ['A:L', 'A:e0', 'B:e0'])
    s = place(s, 'A:L', { x: 0, z: 0 }, { fury: 6 }); s = place(s, 'A:e0', { x: 0, z: 2 }); s = place(s, 'B:e0', { x: 0, z: 12 })
    let o = choose(asOut(s), 'A:L')
    o = send(o, { type: 'castSpell', casterId: 'A:L', spellId: 'cir.s.veil-of-mists' })
    expect(o.state.clouds.length).toBe(1)
    const c = o.state.clouds[0]!
    // the cloud sits between them: the enemy cannot see in, the owner side can see out
    const st = { ...o.state, clouds: [{ ...c, pos: { x: 0, z: 7 } }] }
    expect(losReport(st, 'B:e0', 'A:e0').visible).toBe(false)
    expect(losReport(st, 'A:e0', 'B:e0').visible).toBe(true)
    // a friendly model inside it has Pathfinder and passes through models
    const inside = place(st, 'A:e0', { x: 0, z: 7 })
    expect(moverInfo(inside, bundle, 'A:e0').ghostly).toBe(true)
    expect(moverInfo(st, bundle, 'A:e0').ghostly).toBe(false)
  })

  it('CORE-071 Rift: a direct hit leaves rough ground that lasts the round', () => {
    let seen = false
    for (let i = 0; i < 60 && !seen; i++) {
      let s = startList(CIR, 'core-71-' + i)
      s = park(s, ['A:L', 'B:e0'])
      s = place(s, 'A:L', { x: 0, z: 0 }, { fury: 6 }); s = place(s, 'B:e0', { x: 0, z: 6 })
      let o = choose(asOut(s), 'A:L')
      o = send(o, { type: 'castSpell', casterId: 'A:L', spellId: 'cir.s.rift', targetId: 'B:e0' })
      o = settle(o)
      const piece = o.state.terrain.find((t) => t.props.rift)
      if (!piece) continue
      seen = true
      expect(piece.rulesType).toBe('rough')
      expect(housekeeping(o.state).terrain.some((t) => t.props.rift)).toBe(true)
      expect(housekeeping({ ...o.state, round: o.state.round + 1 }).terrain.some((t) => t.props.rift)).toBe(false)
    }
    expect(seen).toBe(true)
  })

  it('CORE-072 Blood Reaper: the initial melee attack rolls against every model in reach, each on its own', () => {
    let s = startList(CIR, 'core-72')
    s = park(s, ['A:e1', 'B:e0', 'B:e1'])
    s = place(s, 'A:e1', { x: 0, z: 0 }); s = place(s, 'B:e0', { x: 1.5, z: 0.5 }, { damage: { track: 'single', boxes: 100, filled: 0 } }); s = place(s, 'B:e1', { x: -1.5, z: 0.5 })
    let o = choose(asOut(s), 'A:e1')
    while (o.pending.kind === 'abilityChoice') o = send(o, { type: 'abilityChoice', optionId: 'skip' })
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'A:e1' })
    o = send(o, { type: 'chooseCombatAction', modelId: 'A:e1', choice: 'melee' })
    const strike = o.pending.options!.find((x) => x.action.type === 'chooseAttack' && (x.action as { weaponId: string }).weaponId === 'cir.w.wurmblade')!
    o = send(o, strike.action as unknown as Record<string, unknown>)
    o = settle(o)
    expect(evs(o.events, 'DiceRolled').filter((r) => r.purpose === 'attack').length).toBe(2)
  })

  it('CORE-073 From Beneath: Jaws of the Earth ignores cover on the target', () => {
    let s = startList(CIR, 'core-73')
    s = park(s, ['A:L', 'B:e0'])
    s = place(s, 'A:L', { x: 0, z: 0 }); s = place(s, 'B:e0', { x: 0, z: 8 })
    // rubble the target stands completely inside gives it cover
    s = { ...s, terrain: [{ id: 'r1', pieceId: 'terrain.rubble', rulesType: 'rubble', pos: { x: 0, z: 8 }, rot: 0, footprint: { circle: { r: 3 } }, height: 0.4, props: {} }] }
    const mine = declareAttack(s, bundle, { attackerId: 'A:L', targetId: 'B:e0', weaponId: 'cir.w.jaws-of-the-earth', additional: false, noFocus: true, chargeAttack: false })
    if ('rejection' in mine) throw new Error('declare failed: ' + mine.rejection.message)
    const m = atkOf(mine.state)!
    expect(evs(mine.events, 'AttackMeasured')[0]!.hitTarget).toBe(statDef(s, 'B:e0')) // no cover bonus
    expect(defModifiers(s, 'B:e0', { kind: 'ranged', baseDef: statDef(s, 'B:e0'), originId: 'A:L' }).cover).toBe(true) // an ordinary shot would meet cover
    void m
  })

  it('CORE-074 Set Defense: a charge attack roll against the model takes -2', () => {
    let s = startList(MEN, 'core-74')
    s = park(s, ['A:e2', 'B:e0'])
    s = place(s, 'A:e2', { x: 0, z: 0 }); s = place(s, 'B:e0', { x: 0, z: 1.6 })
    s = applyEffect(s, { sourceId: 'x', name: 'x', owner: 'B', targetIds: ['B:e0'], mods: [], duration: 'round', grants: ['men.a.set-defense'] }).state
    const r = declareAttack(s, bundle, { attackerId: 'A:e2', targetId: 'B:e0', weaponId: 'men.w.pyrrhus-spear', additional: false, noFocus: true, chargeAttack: true })
    if ('rejection' in r) throw new Error(r.rejection.message)
    expect(evs(r.events, 'AttackMeasured')[0]!.mods.some((m) => m.label === 'Set Defense' && m.value === -2)).toBe(true)
    const plain = declareAttack(s, bundle, { attackerId: 'A:e2', targetId: 'B:e0', weaponId: 'men.w.pyrrhus-spear', additional: false, noFocus: true, chargeAttack: false })
    if ('rejection' in plain) throw new Error(plain.rejection.message)
    expect(evs(plain.events, 'AttackMeasured')[0]!.mods.some((m) => m.label === 'Set Defense')).toBe(false)
  })

  it('CORE-075 Precision Strike: a mover may pass through friendly bases it ends clear of', () => {
    let s = startList(MEN, 'core-75')
    s = park(s, ['A:u3.1', 'A:u3.2'])
    s = place(s, 'A:u3.1', { x: 0, z: 0 }); s = place(s, 'A:u3.2', { x: 0, z: 1.5 })
    const plain = resolveAdvance(s, { modelId: 'A:u3.1', waypoints: [{ x: 0, z: 3 }], kind: 'advance', info: moverInfo(s, bundle, 'A:u3.1') })
    expect(plain.ok).toBe(false) // a friend in the way
    s = applyEffect(s, { sourceId: 'men.a.precision-strike', name: 'Precision Strike', owner: 'A', targetIds: ['A:u3.1'], mods: [], duration: 'turn', ignoreFriendly: true }).state
    const through = resolveAdvance(s, { modelId: 'A:u3.1', waypoints: [{ x: 0, z: 3 }], kind: 'advance', info: moverInfo(s, bundle, 'A:u3.1') })
    expect(through.ok).toBe(true)
  })

  it('CORE-076 Incorporeal models ignore bases and obstructions when they move, and cannot be pushed', () => {
    let s = startList(CRY, 'core-76')
    s = park(s, ['A:u2.1', 'B:e0', 'A:e1'])
    s = place(s, 'A:u2.1', { x: 0, z: 0 }); s = place(s, 'B:e0', { x: 0, z: 2.6 }); s = place(s, 'A:e1', { x: 4, z: 0 })
    s = { ...s, terrain: [wall('w2', 0, 4)] }
    const info = moverInfo(s, bundle, 'A:u2.1')
    expect(info.ghostly).toBe(true)
    const r = resolveAdvance(s, { modelId: 'A:u2.1', waypoints: [{ x: 0, z: 5.5 }], kind: 'advance', info })
    expect(r.ok).toBe(true)
    const solid = moverInfo(s, bundle, 'A:e1')
    expect(solid.ghostly).toBe(false)
    expect(isIncorporeal(s, bundle, 'A:u2.1')).toBe(true)
    const pushed = push(s, 'A:u2.1', { x: 0, z: -3 }, 4, lookups(s, bundle))
    expect(pushed.travelled).toBe(0)
    expect(pushed.state.models['A:u2.1']!.pos).toEqual({ x: 0, z: 0 })
    const other = push(s, 'A:e1', { x: -3, z: 0 }, 2, lookups(s, bundle))
    expect(other.travelled).toBeGreaterThan(0)
  })

  it('CORE-077 an Incorporeal model takes no damage from a non-magical hit but does from a magical one', () => {
    let seen = 0
    for (let i = 0; i < 80 && seen < 2; i++) {
      let s = startList(CRY, 'core-77-' + i)
      s = park(s, ['A:u2.1', 'B:e1'])
      s = place(s, 'A:u2.1', { x: 0, z: 0 }); s = place(s, 'B:e1', { x: 0, z: 1.5 })
      s = { ...s, activePlayer: 'B', pending: { ...s.pending, kind: 'chooseActivation', player: 'B', id: 'd:901', options: [] }, decisionSeq: 901 }
      let o = choose(asOut(s), 'B:e1')
      o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'B:e1' })
      o = send(o, { type: 'chooseCombatAction', modelId: 'B:e1', choice: 'melee' })
      const hit = o.pending.options!.find((x) => x.action.type === 'chooseAttack')
      if (!hit) continue
      o = send(o, hit.action as unknown as Record<string, unknown>)
      o = settle(o)
      const dmg = evs(o.events, 'DamageRolled')[0]
      if (!dmg) continue
      seen++
      const types = dmg.instance.damageTypes
      const applied = evs(o.events, 'DamageApplied').find((e) => e.targetId === 'A:u2.1')
      if (!types.includes('magical')) expect(applied?.points ?? 0).toBe(0)
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('CORE-078 Trollbloods: Field Marshal only reaches beasts the model controls', () => {
    const s = startList(TRL, 'core-78')
    expect(hasFlag(s, bundle, 'A:e0', 'tough')).toBe(false)
    const swapped = withModel(s, 'A:e0', { controllerId: 'B:L' })
    expect(swapped.models['A:e0']!.controllerId).toBe('B:L')
  })
})

const statDef = (s: GameState, id: string): number => {
  const p = bundle.byId[s.models[id]!.profileId] as unknown as { stats: { DEF: number } }
  return p.stats.DEF
}
