// M10 Cryx behaviour after the card research: Marionette (reroll decision), Soul Phase any time in the activation, the rack RULING,
// and a behaviour pass over the spells and weapon abilities that had only data checks (docs/spec/factions/cryx.md).
import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../src/engine/events'
import { isIncorporeal } from '../../src/engine/code-hooks'
import { applyEffect, hasCondition } from '../../src/engine/effects'
import type { GameSetup } from '../../src/engine/index'
import type { GameState } from '../../src/engine/types'
import { asOut, choose, place, send, settle } from './action-helpers'
import { endTurn } from '../../src/engine/turnflow'
import { bundle, finishActivations, must, newGame, runControlTo, runSetup, withModel } from './turn-helpers'

const SETUP: GameSetup = { scenario: 'scn-qs-demo', lists: { A: 'cry.l.necro-recon', B: 'cyg.l.qs-recon' } }
const start = (seed: string): GameState => runControlTo(runSetup(newGame(SETUP, seed))).state
const NEKANE = 'A:L', HADES = 'A:e0', F1 = 'A:u2.1', F2 = 'A:u2.2', F3 = 'A:u2.3', CHATTER = 'A:e1', CAINE = 'B:L', DEUCE = 'B:e0', FALK = 'B:e1'

function clearAround(s: GameState, keep: string[]): GameState {
  let i = 0
  for (const m of Object.values(s.models)) {
    if (keep.includes(m.id)) continue
    s = place(s, m.id, { x: -16 + (i % 8) * 4, z: 16 - Math.floor(i / 8) * 3 })
    i++
  }
  return s
}
const furyField = (seed: string): GameState => {
  let s = clearAround(start(seed), [F1, F2, F3, CAINE])
  s = place(s, F1, { x: 0, z: 0 }); s = place(s, F2, { x: 2, z: 0 }); s = place(s, F3, { x: -2, z: 0 }); s = place(s, CAINE, { x: 0, z: 6 })
  return s
}
type Out = ReturnType<typeof asOut>
const acts = (o: Out) => (o.pending.options ?? []).map((x) => x.action as unknown as { type: string; modelId?: string; choice?: string; abilityId?: string })
const offers = (o: Out, modelId: string, abilityId: string) => acts(o).some((a) => a.modelId === modelId && a.abilityId === abilityId)
const offer = (o: Out, abilityId: string) => (o.pending.options ?? []).find((x) => (x.action as unknown as { abilityId?: string }).abilityId === abilityId)

/** Hades alone in the open with `souls` soul tokens and full focus (so Soul Generator is not offered at the start). */
const hadesField = (seed: string, souls: number): GameState => {
  let s = clearAround(start(seed), [HADES, DEUCE])
  s = place(s, HADES, { x: 0, z: 0 }); s = place(s, DEUCE, { x: 0, z: 9 })
  return withModel(s, HADES, { tokens: { soul: souls }, focus: 3 })
}

describe('Soul Phase: any time in the activation (not only at its start)', () => {
  it('FAC-CRY-009b not offered at activation start; offered before the move, and spending the soul makes Hades Incorporeal for the turn', () => {
    const s = hadesField('cry-sp1', 1)
    let o = choose(asOut(s), HADES)
    expect(o.pending.kind).toBe('chooseMovement') // no start-of-activation prompt for it any more
    expect(isIncorporeal(o.state, bundle, HADES)).toBe(false)
    const sp = offer(o, 'cry.a.soul-phase')
    expect(sp).toBeDefined()
    o = send(o, sp!.action as unknown as Record<string, unknown>)
    expect(o.pending.kind).toBe('chooseMovement') // the move is still to choose
    expect(isIncorporeal(o.state, bundle, HADES)).toBe(true)
    expect(o.state.models[HADES]!.tokens?.soul ?? 0).toBe(0)
    expect(offer(o, 'cry.a.soul-phase')).toBeUndefined() // already Incorporeal, and no soul left
  })

  it('FAC-CRY-009c offered at the Combat Action choice and between attacks too, and it does not use the Combat Action up', () => {
    const s = hadesField('cry-sp2', 2)
    let o = choose(asOut(s), HADES)
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: HADES })
    expect(o.pending.kind).toBe('chooseCombatAction')
    o = send(o, offer(o, 'cry.a.soul-phase')!.action as unknown as Record<string, unknown>)
    expect(o.pending.kind).toBe('chooseCombatAction') // the Combat Action is still to take
    expect(isIncorporeal(o.state, bundle, HADES)).toBe(true)
    expect(o.state.models[HADES]!.tokens?.soul).toBe(1)
    expect(offer(o, 'cry.a.soul-phase')).toBeUndefined()
    expect(offer(o, 'cry.a.soul-phase')).toBeUndefined()
  })

  it('FAC-CRY-009d between attacks: a model that kept its soul may use it at the attack choice', () => {
    let s = hadesField('cry-sp3', 1)
    s = place(s, DEUCE, { x: 0, z: 1.7 }) // in melee reach of Hades
    let o = choose(asOut(s), HADES)
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: HADES })
    o = send(o, { type: 'chooseCombatAction', modelId: HADES, choice: 'melee' })
    expect(o.pending.kind).toBe('chooseAttack')
    const sp = offer(o, 'cry.a.soul-phase')
    expect(sp).toBeDefined()
    o = send(o, sp!.action as unknown as Record<string, unknown>)
    expect(o.pending.kind).toBe('chooseAttack')
    expect(isIncorporeal(o.state, bundle, HADES)).toBe(true)
    expect(o.state.models[HADES]!.tokens?.soul ?? 0).toBe(0)
  })

  it('FAC-CRY-009e with no soul token it is not offered anywhere', () => {
    const s = hadesField('cry-sp4', 0)
    let o = choose(asOut(s), HADES)
    expect(offer(o, 'cry.a.soul-phase')).toBeUndefined()
    o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: HADES })
    expect(offer(o, 'cry.a.soul-phase')).toBeUndefined()
  })
})

describe('Marionette: the Furies make an enemy reroll one of its own rolls', () => {
  it('FAC-CRY-015b the star attack is offered, deals no damage, and a hit leaves a round-long reroll right on the model hit (loop seeds)', () => {
    let hit = false, miss = false
    for (let i = 0; i < 120 && !(hit && miss); i++) {
      const s = furyField('cry-mar' + i)
      let o = choose(asOut(s), 'A:u2')
      o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: F1 })
      expect(offers(o, F1, 'cry.a.marionette')).toBe(true)
      o = send(o, { type: 'chooseCombatAction', modelId: F1, choice: 'specialAttack', abilityId: 'cry.a.marionette' })
      o = send(o, { type: 'chooseAttack', modelId: F1, weaponId: 'cry.w.marionette', targetId: CAINE, additional: false })
      o = settle(o)
      const res = o.events.find((e) => e.type === 'AttackResolved') as Extract<GameEvent, { type: 'AttackResolved' }> | undefined
      expect(res).toBeDefined()
      expect(o.events.some((e) => e.type === 'DamageRolled')).toBe(false) // no POW, no damage roll
      const eff = o.state.effects.find((e) => e.sourceId === 'cry.a.marionette')
      if (res!.hit) {
        hit = true
        expect(eff).toBeDefined()
        expect(eff!.targetIds).toEqual([CAINE])
        expect(eff!.owner).toBe('A')
        expect((eff as unknown as { rerollRight: { roll: string } }).rerollRight.roll).toBe('any')
        // only one Fury may use it per unit activation
        o = o.pending.kind === 'chooseMovement' ? send(o, { type: 'chooseMovement', option: 'forfeit', modelId: F2 }) : o
        expect(offers(o, F2, 'cry.a.marionette')).toBe(false)
      } else {
        miss = true
        expect(eff).toBeUndefined()
      }
    }
    expect(hit).toBe(true)
    expect(miss).toBe(true)
  })

  it('FAC-CRY-015c an affected enemy that attacks is asked to reroll by the player of the Furies (the holder); using it ends the effect (loop seeds)', () => {
    let asked = false
    for (let i = 0; i < 200 && !asked; i++) {
      const s = furyField('cry-mar-rr' + i)
      let o = choose(asOut(s), 'A:u2')
      o = send(o, { type: 'chooseMovement', option: 'forfeit', modelId: F1 })
      o = send(o, { type: 'chooseCombatAction', modelId: F1, choice: 'specialAttack', abilityId: 'cry.a.marionette' })
      o = send(o, { type: 'chooseAttack', modelId: F1, weaponId: 'cry.w.marionette', targetId: CAINE, additional: false })
      o = settle(o)
      if (!o.state.effects.some((e) => e.sourceId === 'cry.a.marionette')) continue
      // Cygnar's turn: A is done, B runs Control, then Caine shoots a Fury
      const done = finishActivations(o.state)
      let b = runControlTo(must(endTurn(done.state, bundle, { type: 'endTurn', decisionId: done.pending.id, player: 'A' })))
      expect(b.state.activePlayer).toBe('B')
      expect(b.state.effects.some((e) => e.sourceId === 'cry.a.marionette')).toBe(true) // lasts the round
      b = send(choose(b, CAINE), { type: 'chooseMovement', option: 'forfeit', modelId: CAINE })
      const shoot = (b.pending.options ?? []).map((x) => x.action as unknown as { type: string; choice?: string }).find((a) => a.choice === 'ranged')
      expect(shoot).toBeDefined()
      b = send(b, { type: 'chooseCombatAction', modelId: CAINE, choice: 'ranged' })
      const atk = (b.pending.options ?? []).map((x) => x.action as unknown as { type: string; targetId?: string; weaponId?: string }).find((a) => a.type === 'chooseAttack' && a.targetId === F1)
      expect(atk).toBeDefined()
      b = send(b, atk as unknown as Record<string, unknown>)
      for (let k = 0; k < 20 && b.pending.kind !== 'reroll' && !['chooseAttack', 'chooseCombatAction', 'chooseActivation'].includes(b.pending.kind); k++) {
        const kind = b.pending.kind
        b = send(b, kind === 'boostAttack' ? { type: 'boostAttack', boost: false } : kind === 'boostDamage' ? { type: 'boostDamage', boost: false } : kind === 'powerField' ? { type: 'powerField', spend: 0 } : { type: 'pass' })
      }
      expect(b.pending.kind).toBe('reroll')
      expect(b.pending.player).toBe('A') // the Furies' player holds the right, not the roller
      asked = true
      b = send(b, { type: 'reroll', reroll: true })
      expect(b.events.some((e) => e.type === 'DiceRerolled')).toBe(true)
      expect(b.state.effects.some((e) => e.sourceId === 'cry.a.marionette')).toBe(false)
    }
    expect(asked).toBe(true)
  })
})

describe('Cryx rack', () => {
  it('FAC-CRY-026 no rack data: Nekane casts exactly her five card spells (RULING: rack slot count has no source)', () => {
    const s = start('cry-rack')
    const n = s.models[NEKANE]!
    const prof = bundle.byId[n.profileId] as unknown as { spells: string[]; rack?: unknown }
    expect(prof.spells).toHaveLength(5)
    expect(prof.rack).toBeUndefined()
    expect(hasCondition(s, n, 'blind')).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
/** Answer an attack's plain decisions until the model picks again; `abilityChoice` answers by `ability`. */
function play(o0: Out, ability: 'use' | 'skip' = 'use'): Out {
  let o = o0
  const all = [...o0.events]
  for (let i = 0; i < 40 && !['chooseAttack', 'chooseCombatAction', 'chooseMovement', 'chooseActivation', 'moveModel', 'gameOver'].includes(o.pending.kind); i++) {
    const k = o.pending.kind
    if (k === 'boostAttack') o = send(o, { type: 'boostAttack', boost: false })
    else if (k === 'boostDamage') o = send(o, { type: 'boostDamage', boost: false })
    else if (k === 'powerField') o = send(o, o.pending.options!.map((x) => x.action as unknown as Record<string, unknown>).find((a) => a.spend === 0)!)
    else if (k === 'reroll') o = send(o, { type: 'reroll', reroll: false })
    else if (k === 'rollAnyway') o = send(o, { type: 'rollAnyway', roll: false })
    else if (k === 'chooseBoxes') o = send(o, { type: 'chooseBoxes', column: Number(o.pending.options![0]!.id.replace('col', '')) })
    else if (k === 'abilityChoice') o = send(o, { type: 'abilityChoice', optionId: o.pending.options!.some((x) => x.id === ability) ? ability : o.pending.options![0]!.id })
    else if (k === 'triggerWindow') o = send(o, { type: 'pass' })
    else throw new Error(`play: unexpected ${k}`)
    all.push(...o.events)
  }
  return { ...o, events: all }
}
const cast = (o: Out, spell: string, target: string): Out => {
  const opt = (o.pending.options ?? []).find((x) => x.id === `cast:${spell}:${target}`)
  expect(opt, `${spell} on ${target} is offered`).toBeDefined()
  return send(o, opt!.action as unknown as Record<string, unknown>)
}
const duel = (seed: string, keep: string[], at: Record<string, [number, number]>): GameState => {
  let s = clearAround(start(seed), keep)
  for (const [id, [x, z]] of Object.entries(at)) s = place(s, id, { x, z })
  return s
}

describe('Cryx spells and weapon abilities (behaviour)', () => {
  it('FAC-CRY-027 Venom: a spray from Nekane; a model it hits suffers Corrosion (loop seeds)', () => {
    let hit = false
    for (let i = 0; i < 60 && !hit; i++) {
      const s = duel('cry-venom' + i, [NEKANE, DEUCE], { [NEKANE]: [0, 0], [DEUCE]: [0, 6] })
      let o = send(choose(asOut(s), NEKANE), { type: 'chooseMovement', option: 'forfeit', modelId: NEKANE })
      const before = o.state.models[NEKANE]!.focus
      o = play(cast(o, 'cry.s.venom', DEUCE))
      expect(o.state.models[NEKANE]!.focus).toBe(before - 2) // COST 2
      expect((o.events.find((e) => e.type === 'AttackDeclared') as unknown as { kind: string }).kind).toBe('spray')
      const res = o.events.find((e) => e.type === 'AttackResolved') as unknown as { hit: boolean } | undefined
      if (!res?.hit) { expect(hasCondition(o.state, o.state.models[DEUCE]!, 'corrosion')).toBe(false); continue }
      hit = true
      expect(hasCondition(o.state, o.state.models[DEUCE]!, 'corrosion')).toBe(true)
    }
    expect(hit).toBe(true)
  })

  it('FAC-CRY-028 Banishing Ward: enemy upkeep spells on the warded model end, and enemy spells cannot target it afterwards', () => {
    let s = duel('cry-ward', [NEKANE, HADES, CAINE], { [NEKANE]: [0, 0], [HADES]: [3, 0], [CAINE]: [0, 12] })
    s = applyEffect(s, { sourceId: 'cyg.s.test-upkeep', name: 'Enemy Upkeep', owner: 'B', casterId: CAINE, targetIds: [HADES], mods: [{ stat: 'DEF', value: -2, mode: 'add' }], duration: 'upkeep', upkeep: { casterId: CAINE } }).state
    expect(s.effects.some((e) => e.name === 'Enemy Upkeep')).toBe(true)
    let o = send(choose(asOut(s), NEKANE), { type: 'chooseMovement', option: 'forfeit', modelId: NEKANE })
    o = cast(o, 'cry.s.banishing-ward', HADES)
    expect(o.state.effects.some((e) => e.name === 'Enemy Upkeep')).toBe(false)
    const ward = o.state.effects.find((e) => e.sourceId === 'cry.s.banishing-ward')!
    expect(ward.targetIds).toEqual([HADES])
    expect(ward.forbid).toContain('beTargeted')
  })

  it('FAC-CRY-029 Crimson Veil: the model carries Blood Shadow for as long as the upkeep lasts', () => {
    const s = duel('cry-veil', [NEKANE, F1], { [NEKANE]: [0, 0], [F1]: [3, 0] })
    let o = send(choose(asOut(s), NEKANE), { type: 'chooseMovement', option: 'forfeit', modelId: NEKANE })
    o = cast(o, 'cry.s.crimson-veil', F1)
    const e = o.state.effects.find((x) => x.sourceId === 'cry.s.crimson-veil')!
    expect(e.targetIds).toEqual([F1])
    expect((e as unknown as { grants: string[] }).grants).toContain('cry.a.blood-shadow')
    expect(e.duration).toBe('upkeep')
  })

  it('FAC-CRY-030 Blood Shadow: Hellspike boxing a living model makes Nekane Incorporeal (loop seeds)', () => {
    let done = false
    for (let i = 0; i < 80 && !done; i++) {
      const s = duel('cry-bs' + i, [NEKANE, FALK], { [NEKANE]: [0, 0], [FALK]: [0, 1.8] })
      const dm = s.models[FALK]!.damage
      expect(dm.track).toBe('single')
      const s2 = withModel(s, FALK, { damage: { ...dm, filled: (dm as { boxes: number }).boxes - 1 } as never })
      let o = send(choose(asOut(s2), NEKANE), { type: 'chooseMovement', option: 'forfeit', modelId: NEKANE })
      o = send(o, { type: 'chooseCombatAction', modelId: NEKANE, choice: 'melee' })
      o = send(o, { type: 'chooseAttack', modelId: NEKANE, weaponId: 'cry.w.hellspike', targetId: FALK, additional: false })
      o = play(o)
      if (o.state.models[FALK]!.life === 'active') continue
      done = true
      expect(isIncorporeal(o.state, bundle, NEKANE)).toBe(true)
    }
    expect(done).toBe(true)
  })

  it('FAC-CRY-029b Crimson Veil at work: a veiled Fury that boxes a living model with Wraith Strike is Incorporeal again afterwards (loop seeds)', () => {
    let done = false
    for (let i = 0; i < 80 && !done; i++) {
      let s = duel('cry-veil2-' + i, [NEKANE, F1, FALK], { [NEKANE]: [0, -4], [F1]: [0, 0], [FALK]: [0, 1.8] })
      s = applyEffect(s, { sourceId: 'cry.s.crimson-veil', name: 'Crimson Veil', owner: 'A', casterId: NEKANE, targetIds: [F1], mods: [], grants: ['cry.a.blood-shadow'], duration: 'upkeep', upkeep: { casterId: NEKANE } } as never).state
      const dm = s.models[FALK]!.damage
      s = withModel(s, FALK, { damage: { ...dm, filled: (dm as { boxes: number }).boxes - 1 } as never })
      let o: Out = send(choose(asOut(s), 'A:u2'), { type: 'chooseMovement', option: 'forfeit', modelId: F1 })
      o = send(o, { type: 'chooseCombatAction', modelId: F1, choice: 'melee' })
      o = send(o, { type: 'chooseAttack', modelId: F1, weaponId: 'cry.w.wraith-strike', targetId: FALK, additional: false })
      o = play(o)
      if (o.state.models[FALK]!.life === 'active') continue
      done = true
      expect(isIncorporeal(o.state, bundle, F1)).toBe(true)
    }
    expect(done).toBe(true)
  })

  it('FAC-CRY-032 Critical Shred: a crit with the Eviscerator in the Combat Action gives one more Eviscerator attack at the model hit (loop seeds)', () => {
    let more = false
    for (let i = 0; i < 160 && !more; i++) {
      const s = withModel(duel('cry-shred' + i, [CHATTER, FALK], { [CHATTER]: [0, 0], [FALK]: [0, 2.8] }), FALK, { damage: { track: 'single', boxes: 200, filled: 0 } })
      let o = send(choose(asOut(s), CHATTER), { type: 'chooseMovement', option: 'forfeit', modelId: CHATTER })
      o = send(o, { type: 'chooseCombatAction', modelId: CHATTER, choice: 'melee' })
      o = send(o, { type: 'chooseAttack', modelId: CHATTER, weaponId: 'cry.w.eviscerator', targetId: FALK, additional: false })
      o = play(o)
      const crit = o.events.some((e) => e.type === 'AttackResolved' && (e as unknown as { crit: boolean }).crit)
      if (!crit) continue
      const declared = o.events.filter((e) => e.type === 'AttackDeclared')
      if (crit) { more = true; expect(declared.length).toBeGreaterThanOrEqual(2); expect((declared[0] as unknown as { targetId: string }).targetId).toBe(FALK); expect(declared.every((d) => (d as unknown as { weaponId: string }).weaponId === 'cry.w.eviscerator')).toBe(true) }
    }
    expect(more).toBe(true)
  })

  it('FAC-CRY-031 Banish: after the Rune Thrower damages a non-Leader enemy it is moved within 1"; a Leader is not', () => {
    let moved = false, leaderSkipped = false
    for (let i = 0; i < 80 && !(moved && leaderSkipped); i++) {
      for (const [target, pos] of [[DEUCE, [0, 6]], [CAINE, [0, 6]]] as const) {
        const s = duel('cry-banish' + i + target, [NEKANE, target], { [NEKANE]: [0, 0], [target]: [pos[0], pos[1]] })
        let o = send(choose(asOut(s), NEKANE), { type: 'chooseMovement', option: 'forfeit', modelId: NEKANE })
        o = send(o, { type: 'chooseCombatAction', modelId: NEKANE, choice: 'ranged' })
        o = send(o, { type: 'chooseAttack', modelId: NEKANE, weaponId: 'cry.w.rune-thrower', targetId: target, additional: false })
        o = play(o)
        if (o.pending.kind === 'moveModel') {
          expect(target).toBe(DEUCE)
          expect(o.pending.constraints?.maxDist).toBe(1)
          expect(o.pending.constraints?.modelId).toBe(DEUCE)
          moved = true
        } else if (target === CAINE && o.events.some((e) => e.type === 'DamageApplied' || e.type === 'DamageRolled')) leaderSkipped = true
      }
    }
    expect(moved).toBe(true)
    expect(leaderSkipped).toBe(true)
  })
})
