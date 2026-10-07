// Small pure formatters shared by the HUD. Numbers always come from the engine; this file only words them.
import type { DecisionOdds, GameState, Id, PlayerId, Stat, WindowId } from '../../engine/index'
import { dataName, engineDescribe, modelName, playerName } from '../contract'

export const pct = (p: number): string => engineDescribe.percent(p)
export const signed = (n: number): string => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

/** Stats in card order; only those present on the profile are shown. */
export const STAT_ORDER: Stat[] = ['SPD', 'MAT', 'RAT', 'AAT', 'DEF', 'ARM', 'ARC', 'CTRL']

/** "core.a.power-field" -> "Power Field" when the data has no record. */
export function prettyId(id: Id): string {
  const last = id.split('.').pop() ?? id
  return last.split(/[-_:]/).filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ')
}
/** Data name when the record exists, else a readable form of the id. */
export function niceName(id: Id | undefined | null): string {
  if (!id) return '?'
  const n = dataName(id)
  return n === id ? prettyId(id) : n
}
export const nameOfModel = (state: GameState | null, id: Id | undefined | null): string => modelName(state, id)

export const MOVE_LABEL: Record<string, string> = {
  advance: 'Advance', run: 'Run', charge: 'Charge', aim: 'Aim', slam: 'Slam', trample: 'Trample', standUp: 'Stand up', forfeit: 'Forfeit movement',
}

/** What each movement option does, in our words: the delayed hover tip on the activation panel. */
export const MOVE_TIP: Record<string, string> = {
  advance: "Move up to the model's SPD in inches, in any direction, then take your Combat Action as normal.",
  run: 'Move up to SPD + 5 inches, but give up the Combat Action: the activation ends after the move. Warjacks and warbeasts may have to pay for it (cost shown on the button).',
  charge: 'Pick an enemy and move up to SPD + 3 inches straight at it. End in melee range after moving at least 3" and your first attack on that target gets a boosted damage roll. Fall short and the activation ends.',
  aim: 'Stay put this activation and line up a shot: +2 to ranged attack rolls.',
  slam: 'A charge that ends in a body-slam: on a hit the target is hurled back and knocked down, and anything it crashes into can be hurt too.',
  trample: 'Stomp in a straight line through small-based enemies, making an attack against each one you pass over.',
  standUp: 'Spend the movement getting back on its feet. The model can still take its Combat Action.',
  forfeit: 'Do not move at all. The model keeps its Combat Action.',
}

/** What each Combat Action choice does, in our words (hover tip). */
export const COMBAT_TIP: Record<string, string> = {
  melee: 'Make melee attacks with each melee weapon against enemies in melee range.',
  ranged: 'Fire each ranged weapon at enemies in range and line of sight.',
  dual: 'Use both melee and ranged weapons this activation.',
  specialAttack: "Make the model's special attack instead of its normal attacks.",
  specialAction: "Use the model's special action instead of attacking.",
  powerAttack: 'Trade the normal attacks for a power attack such as a headbutt, shove or throw.',
  standUp: 'Spend the Combat Action getting back on its feet.',
  forfeit: 'Skip the Combat Action and end the activation.',
}

const WINDOW_WORDS: Partial<Record<WindowId, string>> = {
  'turn.start': 'Start of turn', 'maintenance.start': 'Upkeep', 'maintenance.effects': 'Effects resolve',
  'control.refill': 'Refilling focus', 'control.powerUp': 'Powering up', 'control.allocate': 'Allocating focus',
  'control.upkeep': 'Paying upkeep', 'control.shake': 'Shaking off effects', 'activation.start': 'Choose an activation',
  'activation.end': 'End of activation', 'turn.end': 'End of turn', 'round.end': 'End of round',
  'movement.choose': 'Normal Movement', 'movement.start': 'Moving', 'movement.move': 'Moving', 'movement.charge': 'Charging',
  'movement.place': 'Placing troopers', 'movement.end': 'Movement done', 'combat.choose': 'Combat Action', 'combat.chooseAttack': 'Choosing attacks',
  'combat.end': 'Combat done', 'attack.declared': 'Attack declared', 'attack.beforeRoll': 'Before the roll', 'attack.rolled': 'Attack rolled',
  'attack.hit': 'Hit', 'attack.crit': 'Critical', 'attack.miss': 'Miss', 'attack.resolved': 'Attack resolved',
  'damage.beforeRoll': 'Before damage', 'damage.rolled': 'Damage rolled', 'damage.beforeApply': 'Damage incoming', 'damage.applied': 'Damage applied',
  'damage.crippled': 'System crippled', 'death.disabled': 'Model down', 'death.boxed': 'Model destroyed', 'death.destroyed': 'Model destroyed',
  'spell.declare': 'Casting', 'spell.cast': 'Spell cast', 'feat.used': 'Feat', 'scenario.score': 'Scoring', 'game.end': 'Game over',
}
export const windowWord = (w: WindowId): string => WINDOW_WORDS[w] ?? w

export const PHASE_WORD: Record<GameState['phase'], string> = {
  setup: 'Setup', deploy: 'Deployment', maintenance: 'Maintenance', control: 'Control', activation: 'Activation', ended: 'Finished',
}

/** "72%" / "72% → 91%" / "avg 3.1, kill 8%" from engine odds; '' when none. */
export function oddsText(o: DecisionOdds | undefined, boosted?: DecisionOdds): string {
  if (!o) return ''
  const parts: string[] = []
  if (o.pHit !== undefined) parts.push(boosted?.pHit !== undefined ? `${pct(o.pHit)} → ${pct(boosted.pHit)}` : `hit ${pct(o.pHit)}`)
  if (o.expectedDamage !== undefined) parts.push(`avg ${o.expectedDamage.toFixed(1)}`)
  if (o.pKill !== undefined) parts.push(`kill ${pct(o.pKill)}`)
  return parts.join(', ')
}

export const sideName = (state: GameState | null, p: PlayerId | null | undefined): string => playerName(state, p)

/** Boxes still empty on a model (display only). */
export function boxesLeft(state: GameState, id: Id): number {
  const d = state.models[id]?.damage
  if (!d) return 0
  if (d.track === 'single') return Math.max(0, d.boxes - d.filled)
  return d.grids.reduce((a, g) => a + g.cols.reduce((c, col) => c + col.filter((x) => !x).length, 0), 0)
}

const TYPE_WORD: Record<string, string> = { leader: 'Warcaster', warEngine: 'War-engine', solo: 'Solo', trooper: 'Trooper', battleEngine: 'Battle engine', unit: 'Unit' }
/** Plain word for a model type ("warEngine" -> "War-engine"). */
export const typeWord = (t: string | undefined | null): string => (t ? TYPE_WORD[t] ?? niceName(t) : '?')
