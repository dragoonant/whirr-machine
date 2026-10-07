// Display names and narration lines, in our own words. Names come from the data bundle; numbers come from events
// (never recomputed here).
import { loadBundle } from '../../data/index'
import type { DiceRolled, GameEvent, GameState, Id, PlayerId, RollPurpose } from '../../engine/index'

const recordName = (id: Id | undefined): string | undefined => {
  if (!id) return undefined
  const r = loadBundle().byId[id] as { name?: string } | undefined
  return r?.name
}

/** Display name of a model or unit (falls back to its id). */
export function modelName(state: GameState | null, id: Id | undefined | null): string {
  if (!id) return '?'
  if (!state) return id
  const m = state.models[id]
  if (m) return recordName(m.profileId) ?? id
  const u = state.units[id]
  if (u) return recordName(u.profileId) ?? id
  return recordName(id) ?? id
}

/** Display name of any data record (weapon, spell, feat, ability, scenario, list, faction). */
export function dataName(id: Id | undefined | null): string { return (id && recordName(id)) || (id ?? '?') }

/** "Khador" / the player's chosen name, falling back to "Player A". */
export function playerName(state: GameState | null, p: PlayerId | null | undefined): string {
  if (!p) return 'Nobody'
  const custom = state?.setup.names?.[p]
  if (custom) return custom
  const fac = state?.players?.[p]?.faction
  const fn = fac ? recordName(fac) : undefined
  return fn ? `${fn} (${p})` : `Player ${p}`
}

/** Every roll purpose has a label, so the dice tray never renders a roll silently (50 §8). */
export const ROLL_PURPOSE_LABELS: Record<RollPurpose, string> = {
  rollOff: 'Roll-off', attack: 'Attack roll', damage: 'Damage roll', column: 'Grid column', tough: 'Toughness check',
  continuous: 'Lingering effect', slamDist: 'Slam distance', throwDist: 'Throw distance', fall: 'Falling damage',
  rof: 'Rate of fire', d3: 'D3 roll', aoeTie: 'Blast tie-break', collateral: 'Collateral damage', spell: 'Spell roll',
  maintenance: 'Upkeep roll', scenario: 'Scenario roll', other: 'Roll',
  threshold: 'Threshold check', frenzyTie: 'Frenzy tie-break', // M9
}

export function rollLabel(state: GameState | null, ev: DiceRolled): string {
  const base = ROLL_PURPOSE_LABELS[ev.purpose] ?? 'Roll'
  return ev.ownerId ? `${modelName(state, ev.ownerId)}: ${base}` : base
}

/** Short result word for a roll against a target (from the event's own target; null when there is none). */
export function rollVerdict(ev: DiceRolled): string | null {
  if (ev.target === undefined) return null
  if (ev.purpose === 'damage') return ev.total > ev.target ? `${ev.total - ev.target} dmg` : 'no damage'
  return ev.total >= ev.target ? 'pass' : 'fail'
}

const moveVerb: Record<string, string> = {
  advance: 'advances', run: 'runs', charge: 'charges', slam: 'is slammed', throw: 'is thrown', push: 'is pushed',
  place: 'is placed', trample: 'tramples', fall: 'falls', reposition: 'repositions', deploy: 'deploys', ambush: 'arrives',
  leastDisturbance: 'is nudged clear',
}

/** One narration line for an event, or null for events not worth a line. `state` supplies names only. */
export function narrate(state: GameState | null, ev: GameEvent): string | null {
  const n = (id: Id | undefined) => modelName(state, id)
  switch (ev.type) {
    case 'RollOffWon': return `${playerName(state, ev.winner)} wins the roll-off`
    case 'TurnOrderChosen': return `${playerName(state, ev.firstPlayer)} will go first`
    case 'EdgeChosen': return `${playerName(state, ev.player)} takes the ${ev.edge} edge`
    case 'RoundStarted': return `Round ${ev.round} begins`
    case 'TurnStarted': return `${playerName(state, ev.player)} takes the field`
    case 'ActivationStarted': return `${n(ev.activeId)} activates`
    case 'ModelMoved': return ev.distance > 0.05 ? `${n(ev.modelId)} ${moveVerb[ev.kind] ?? 'moves'} ${ev.distance.toFixed(1)}"` : null
    case 'ChargeDeclared': return `${n(ev.modelId)} charges toward ${n(ev.targetId)}`
    case 'ChargeResolved': return ev.success ? `The charge connects` : `The charge falls short`
    case 'AttackDeclared': return `${n(ev.attackerId)} attacks ${n(ev.targetId)}${ev.weaponId ? ` with ${dataName(ev.weaponId)}` : ''}`
    case 'AttackResolved': return ev.auto === 'hit' ? 'Automatic hit' : ev.auto === 'miss' ? 'Automatic miss' : ev.crit ? 'Critical hit!' : ev.hit ? 'Hit' : 'Miss'
    case 'DamageApplied': return ev.points > 0 ? `${n(ev.targetId)} takes ${ev.points} damage` : `${n(ev.targetId)} shrugs it off`
    case 'PowerFieldUsed': return `${n(ev.modelId)}'s power field soaks ${ev.reduced}`
    case 'SystemCrippled': return `${n(ev.modelId)}: system ${ev.system} crippled`
    case 'Healed': return `${n(ev.modelId)} recovers ${ev.points}`
    case 'LifeStateChanged':
      if (ev.to === 'disabled') return `${n(ev.modelId)} is down`
      if (ev.to === 'boxed' || ev.to === 'destroyed') return `${n(ev.modelId)} is destroyed`
      if (ev.to === 'active' && ev.from === 'disabled') return `${n(ev.modelId)} gets back up`
      return null
    case 'SpellCast': return `${n(ev.casterId)} casts ${dataName(ev.spellId)}${ev.targetId ? ` on ${n(ev.targetId)}` : ''}`
    case 'FeatUsed': return `${n(ev.casterId)} unleashes ${dataName(ev.featId)}`
    case 'ConditionAdded': return `${n(ev.modelId)} is ${conditionWord(ev.condition)}`
    case 'ScenarioScored': return ev.delta ? `${playerName(state, ev.player)} scores ${ev.delta} VP (${ev.vp.A}–${ev.vp.B})` : null
    case 'KillBoxScored': return `${playerName(state, ev.beneficiary)} gains ${ev.vp} VP from the kill box`
    case 'WarEngineInert': return `${n(ev.modelId)} goes inert`
    case 'GameEnded': return ev.winner ? `${playerName(state, ev.winner)} wins by ${endWord(ev.reason)}` : `The game ends in a draw`
    default: return null
  }
}

function conditionWord(c: string): string {
  switch (c) {
    case 'knockedDown': return 'knocked down'
    case 'stationary': return 'held in place'
    case 'disrupted': return 'disrupted'
    case 'fire': return 'set alight'
    case 'corrosion': return 'corroding'
    case 'inert': return 'inert'
    default: return c
  }
}

export function endWord(reason: string): string {
  switch (reason) {
    case 'assassination': return 'assassination'
    case 'scenario': return 'scenario points'
    case 'roundLimit': return 'points at the round limit'
    case 'tiebreakPresence': return 'board presence'
    case 'concession': return 'concession'
    default: return reason
  }
}
