// M12 follow-ups, part five (SKF-nnn): Righteous Intervention, Penance of the Corrupted, Enliven by the target's SPD.
import { describe, expect, it } from 'vitest'
import { righteousAvailable, RIGHTEOUS_ID } from '../../src/engine/factions/menoth'
import { answerControl, continueControl } from '../../src/engine/phases/control'
import type { FlowOut } from '../../src/engine/pending'
import type { GameState } from '../../src/engine/types'
import { asBTurn, asOut, bundle, choose, evs, firstSeed, offers, parkExcept, place, raw, send, settleAtk, start, toCombat, withModel } from './skirmish-followups'

/** Defenders have 1 box: any damage kills. A Sniper (B:u5.1) shoots A:u4.1, 10" away, with the Sanctifiers close by. */
function riScene(seed: string, victim = 'A:u4.1'): FlowOut {
  let s = parkExcept(start('men.l.skirmish', 'kha.l.skirmish', seed), ['A:u5.1', 'A:u5.2', 'A:u5.3', 'A:u4.1', 'A:u4.2', 'B:u5.1', 'B:u3.1'])
  s = place(s, 'A:u5.1', { x: 0, z: 0 })
  s = place(s, 'A:u5.2', { x: 1.6, z: 0 })
  s = place(s, 'A:u5.3', { x: -1.6, z: 0 })
  s = place(s, 'A:u4.1', victim === 'A:u4.1' ? { x: 0, z: 4.5 } : { x: -14, z: 12 }) // 4.5" from the first Sanctifier (far away when a Sanctifier is the victim: a Defender within 3" would take the hit for it with Shield Guard)
  s = place(s, 'A:u4.2', victim === 'A:u4.1' ? { x: 3, z: 6.5 } : { x: -12, z: 14 })
  s = place(s, 'B:u5.1', { x: 0, z: 15 })
  s = place(s, 'B:u3.1', victim === 'A:u4.1' ? { x: 1.5, z: 3.4 } : { x: 9, z: 9 }) // a Hound the Sanctifier can reach after a 2" step (out of the way when a Sanctifier is the victim)
  if (victim !== 'A:u4.1') s = withModel(place(s, victim, { x: 1.5, z: 4.5 }), victim, { damage: { track: 'single', boxes: 8, filled: 7 } }) // a Sanctifier with one box left
  // arm Righteous Intervention in A's own activation, then end A's turn and hand the table to B
  let o = toCombat(s, 'A:u5', 'A:u5.1')
  o = send(o, raw(offers(o, RIGHTEOUS_ID)[0]))
  for (let i = 0; i < 6 && o.pending.kind === 'chooseCombatAction'; i++) o = send(o, { type: 'chooseCombatAction', modelId: o.pending.context.modelId, choice: 'forfeit' })
  expect(o.pending.kind).toBe('chooseActivation')
  return asBTurn(o.state)
}
/** B's Sniper shoots `target` (1 box left if `weak`); null unless the dice gave the hit and the kill. */
function shoot(out: FlowOut, target: string): FlowOut | null {
  let o = choose(out, 'B:u5')
  o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'B:u5.1' })
  o = send(o, { type: 'chooseCombatAction', modelId: 'B:u5.1', choice: 'ranged' })
  o = send(o, { type: 'chooseAttack', modelId: 'B:u5.1', weaponId: 'kha.w.hunting-rifle', targetId: target, additional: false })
  o = settleAtk(o, (x) => x.pending.kind === 'moveModel' || x.pending.kind === 'chooseAttack' || x.pending.kind === 'chooseCombatAction' || x.pending.kind === 'chooseActivation')
  const killed = evs(o.events, 'LifeStateChanged').some((e) => e.modelId === target && e.to === 'destroyed') || evs(o.events, 'ModelRemoved').some((e) => e.modelId === target)
  return killed ? o : null
}

describe('SKF-024 Righteous Intervention: arming it, and the reaction to a friendly death', () => {
  it('the unit arms it once per game (a special action that keeps the Combat Action); the used marker stays for the game', () => {
    const s = parkExcept(start('men.l.skirmish', 'kha.l.skirmish', 'skf24a'), ['A:u5.1', 'A:u5.2', 'A:u5.3'])
    let o = toCombat(s, 'A:u5', 'A:u5.1')
    expect(offers(o, RIGHTEOUS_ID).length).toBe(1)
    expect(righteousAvailable(o.state, bundle, 'A:u5.1')).toBe(true)
    o = send(o, raw(offers(o, RIGHTEOUS_ID)[0]))
    expect(o.pending.kind).toBe('chooseCombatAction') // the Combat Action is still to take
    expect(o.state.effects.filter((e) => e.sourceId === RIGHTEOUS_ID).map((e) => e.name).sort()).toEqual(['Righteous Intervention', 'Righteous Intervention (used)'])
    expect(offers(o, RIGHTEOUS_ID)).toEqual([])
    expect(righteousAvailable(o.state, bundle, 'A:u5.2')).toBe(false)
    // the round effect ends, the game-long marker does not
    const later = { ...o.state, effects: o.state.effects.filter((e) => e.name !== 'Righteous Intervention') }
    expect(righteousAvailable(later, bundle, 'A:u5.1')).toBe(false)
  })
  it('a Defender destroyed by an enemy shot within 6" of the Sanctifiers: a Sanctifier advances up to 2" and makes a basic melee attack, once', () => {
    const r = firstSeed('skf24b', (seed) => {
      const o = shoot(riScene(seed), 'A:u4.1')
      return o && o.pending.kind === 'moveModel' ? o : null
    })
    expect(r.pending.player).toBe('A')
    expect((r.pending.context.data as { trigger: { abilityId: string; dist: number } }).trigger).toMatchObject({ abilityId: RIGHTEOUS_ID, dist: 2 })
    expect(r.pending.canPass).toBe(true)
    const model = r.pending.context.modelId!
    expect(r.state.effects.some((e) => e.name === 'Righteous Intervention')).toBe(false) // fired: the reaction is spent, the used marker stays
    expect(r.state.effects.some((e) => e.name === 'Righteous Intervention (used)')).toBe(true)
    // answer with the step toward the Hound; the model then attacks in melee (an out-of-activation attack: one weapon, so it runs at once)
    const go = r.pending.options!.map((x) => x.action as { path: { x: number; z: number }[] }).find((a) => a.path[0]!.z > r.state.models[model]!.pos.z + 0.4) ?? (r.pending.options![0]!.action as never)
    let o = send(r, raw(go))
    const decl = evs(o.events, 'AttackDeclared')
    expect(decl.length).toBe(1)
    expect(decl[0]).toMatchObject({ attackerId: model, kind: 'melee' })
    expect(decl[0]!.weaponId).toBe('men.w.flame-halberd')
    o = settleAtk(o)
    expect(evs(o.events, 'ActivationEnded').length + 1).toBeGreaterThan(0)
  })
  it('a Cleanser Sanctifier that falls is not answered for, and an unarmed unit does not answer', () => {
    // the Sanctifier mate A:u5.2 dies: no reaction (the carrier rule excludes Cleanser Sanctifiers)
    const none = firstSeed('skf24c', (seed) => {
      const o = shoot(riScene(seed, 'A:u5.2'), 'A:u5.2')
      return o
    })
    expect(none.pending.kind === 'moveModel' && (none.pending.context.data as { trigger?: { abilityId?: string } }).trigger?.abilityId === RIGHTEOUS_ID).toBe(false)
    // never armed: the Defender's death changes nothing
    const unarmed = firstSeed('skf24d', (seed) => {
      let s = parkExcept(start('men.l.skirmish', 'kha.l.skirmish', seed), ['A:u5.1', 'A:u4.1', 'B:u5.1'])
      s = place(s, 'A:u5.1', { x: 0, z: 0 })
      s = place(s, 'A:u4.1', { x: 0, z: 4.5 })
      s = place(s, 'B:u5.1', { x: 0, z: 15 })
      return shoot(asBTurn(s), 'A:u4.1')
    })
    expect(unarmed.pending.kind === 'moveModel' && (unarmed.pending.context.data as { trigger?: { abilityId?: string } }).trigger?.abilityId === RIGHTEOUS_ID).toBe(false)
  })
})

describe('SKF-025 Penance of the Corrupted: damage paid for focus in the allocation', () => {
  const scene = (patch: Record<string, Partial<GameState['models'][string]>> = {}): GameState => {
    let s = parkExcept(start('men.l.skirmish', 'cyg.l.skirmish', 'skf25'), ['A:L', 'A:e0', 'A:e1', 'A:u6.1', 'A:u6.2', 'A:u6.3'])
    s = place(s, 'A:L', { x: 0, z: -8 }, { focus: 0 })
    s = place(s, 'A:e0', { x: 0, z: -4 }, { focus: 0 }) // Crusader
    s = place(s, 'A:e1', { x: 3, z: -4 }, { focus: 1 }) // Revenger
    s = place(s, 'A:u6.1', { x: -3, z: -7 })
    s = place(s, 'A:u6.2', { x: -3, z: -9 })
    s = place(s, 'A:u6.3', { x: 30, z: -9 }) // out of CTRL
    for (const [id, p] of Object.entries(patch)) s = withModel(s, id, p)
    return s
  }
  const open = (s: GameState) => continueControl({ ...s, activePlayer: 'A' }, bundle, 'start', [])
  it('the allocation is raised even though the Leader has no focus; the sample option fills the cohort with the Vassals\' damage', () => {
    const c = open(scene())
    expect(c.pending?.kind).toBe('allocateFocus')
    const opt = c.pending!.options!.find((x) => x.id === 'penance')!
    expect(opt).toBeDefined()
    const pen = (opt.action as { penance: { giverId: string; toId: string; points: number }[] }).penance
    expect(pen.every((e) => ['A:u6.1', 'A:u6.2'].includes(e.giverId))).toBe(true) // never the Vassal out of CTRL
    const r = answerControl(c.state, bundle, { ...opt.action, decisionId: c.pending!.id } as never)
    expect('rejection' in r).toBe(false)
    const after = (r as { state: GameState }).state
    expect(after.models['A:e0']!.focus).toBe(3)
    expect(after.models['A:e1']!.focus).toBe(3)
    const filled = (id: string): number => { const d = after.models[id]!.damage; return d.track === 'single' ? d.filled : 0 }
    expect(filled('A:u6.1') + filled('A:u6.2')).toBe(5) // 3 + 2 points of focus bought
    expect(filled('A:u6.1')).toBeLessThanOrEqual(4) // each Vassal keeps a box
  })
  it('validation: a giver out of CTRL, too many points, a full warjack and a stranger are all refused', () => {
    const c = open(scene())
    const ask = (penance: unknown, alloc: Record<string, number> = {}) => answerControl(c.state, bundle, { type: 'allocateFocus', decisionId: c.pending!.id, player: 'A', allocation: alloc, penance } as never)
    expect('rejection' in ask([{ giverId: 'A:u6.1', toId: 'A:e0', points: 2 }])).toBe(false)
    expect('rejection' in ask([{ giverId: 'A:u6.3', toId: 'A:e0', points: 1 }])).toBe(true) // outside the Leader's CTRL
    expect('rejection' in ask([{ giverId: 'A:u6.1', toId: 'A:e0', points: 6 }])).toBe(true) // more than the unmarked boxes
    expect('rejection' in ask([{ giverId: 'A:u6.1', toId: 'A:e0', points: 4 }, { giverId: 'A:u6.2', toId: 'A:e0', points: 2 }])).toBe(true) // over 3 focus
    expect('rejection' in ask([{ giverId: 'A:u6.1', toId: 'A:e0', points: 0 }])).toBe(true)
    expect('rejection' in ask([{ giverId: 'A:L', toId: 'A:e0', points: 1 }])).toBe(true) // the Leader has no Penance
    expect('rejection' in ask([{ giverId: 'A:u6.1', toId: 'A:u6.2', points: 1 }])).toBe(true) // not a warjack
  })
  it('a Vassal may pay with its last box and die (up to its unmarked boxes), and the warjack still gets the focus', () => {
    const c = open(scene())
    const r = answerControl(c.state, bundle, { type: 'allocateFocus', decisionId: c.pending!.id, player: 'A', allocation: {}, penance: [{ giverId: 'A:u6.1', toId: 'A:e0', points: 3 }, { giverId: 'A:u6.1', toId: 'A:e1', points: 2 }] } as never) as { state: GameState }
    expect(r.state.models['A:e0']!.focus).toBe(3)
    expect(r.state.models['A:e1']!.focus).toBe(3)
    expect(r.state.models['A:u6.1']!.life).not.toBe('active')
  })
})

describe('SKF-026 Enliven lets the model advance its own SPD, not a flat 5"', () => {
  it('Enliven on the Crusader (SPD 4) offers a 4" step after an enemy hit damages it; on the Revenger (SPD 5), 5"', () => {
    const scene = (seed: string, target: string): FlowOut => {
      let s = parkExcept(start('men.l.skirmish', 'kha.l.skirmish', seed), ['A:u6.1', 'A:e0', 'A:e1', 'B:e1'])
      s = place(s, 'A:u6.1', { x: 2, z: 1.5 })
      s = place(s, 'A:e0', { x: 0, z: 0 }, { focus: 0 })
      s = place(s, 'A:e1', { x: 4, z: 3 }, { focus: 0 })
      s = place(s, 'B:e1', { x: 0, z: 12 }) // the Dire Wolf with its cannon
      let o = toCombat(s, 'A:u6', 'A:u6.1')
      o = send(o, raw(offers(o, 'men.a.enliven').find((a) => a.targetId === target)))
      for (let i = 0; i < 6 && o.pending.kind === 'chooseCombatAction'; i++) o = send(o, { type: 'chooseCombatAction', modelId: o.pending.context.modelId, choice: 'forfeit' })
      return asBTurn(o.state)
    }
    const hit = (target: string) => firstSeed(`skf26${target}`, (seed) => {
      let o = choose(scene(seed, target), 'B:e1')
      o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: 'B:e1' })
      o = send(o, { type: 'chooseCombatAction', modelId: 'B:e1', choice: 'ranged' })
      o = send(o, { type: 'chooseAttack', modelId: 'B:e1', weaponId: 'kha.w.cannon', targetId: target, additional: false })
      o = settleAtk(o, (x) => x.pending.kind === 'moveModel')
      return o.pending.kind === 'moveModel' ? o : null
    })
    const crusader = hit('A:e0')
    expect((crusader.pending.context.data as { trigger: { abilityId: string } }).trigger.abilityId).toBe('men.a.enliven')
    expect(crusader.pending.constraints?.maxDist).toBe(4)
    const revenger = hit('A:e1')
    expect(revenger.pending.constraints?.maxDist).toBe(5)
  })
})

void asOut
