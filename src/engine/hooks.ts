// FROZEN after M0: named hook points and the mapping from data descriptors (20 §5) onto them.
import type { GameEvent } from './events'
import type {
  AttackId, DamageType, EffectDuration, GameState, Id, ModelId, PlayerId, Stat, StoredConditionId, TokenKind, TriggerWindow,
  Vec2, WindowId,
} from './types'
import { WINDOW_IDS } from './types'

// ---------- hook points ----------
export const HOOK_POINTS: readonly TriggerWindow[] = ['passive', ...WINDOW_IDS]
export type HookPoint = TriggerWindow

// ---------- declarative descriptors (mirror common.schema.json; replaced by src/data/types.ts imports later) ----------
export type ConditionTest =
  | 'modelType' | 'keyword' | 'baseAtLeast' | 'baseAtMost' | 'attackKind' | 'charged' | 'crit' | 'hit' | 'withinInches'
  | 'inCtrl' | 'engaged' | 'hasCondition' | 'hasEffect' | 'focusAtLeast' | 'weaponLocation' | 'weaponQuality'
  | 'damageType' | 'isFriendly' | 'isEnemy' | 'isCharacter' | 'systemCrippled' | 'lifeState' | 'inLos' | 'elevatedOver'
  | 'concealed' | 'isPrey' | 'b2b' // added after the M0 review (00 §14)
  | 'furyAtLeast' | 'aspectCrippled' | 'frenzied' | 'inBattlegroup' // M9 (81 §E)
  | 'living' | 'undead' | 'hasAbility' | 'tokensAtLeast' // M9 faction specs (cryx, circle, menoth)
export type Subject = 'self' | 'target' | 'attacker' | 'unit' | 'controller'
export type ConditionNode =
  | { all: ConditionNode[] }
  | { any: ConditionNode[] }
  | { not: ConditionNode }
  | { code: string; params?: Record<string, unknown> }
  | { test: ConditionTest; subject?: Subject; value?: unknown; of?: Subject | 'point'; dist?: number }

export type EffectOp =
  | 'modStat' | 'addDie' | 'boost' | 'reroll' | 'autoHit' | 'autoMiss' | 'applyCondition' | 'removeCondition' | 'damage'
  | 'heal' | 'push' | 'place' | 'knockDown' | 'gainFocus' | 'loseFocus' | 'grantAbility' | 'grantResistance'
  | 'grantImmunity' | 'preventDamage' | 'forbid' | 'cloud' | 'addAttack'
  // added after the M0 review (00 §14): movement, removal, roll and attack-generation ops
  | 'advance' | 'slam' | 'throw' | 'endActivation' | 'removeFromPlay' | 'removeAbility' | 'modRoll' | 'discardLowest'
  | 'makeAttack' | 'ignore'
  | 'gainFury' | 'loseFury' // M9 (81 §E)
  | 'gainToken' | 'spendToken' // M9 faction specs: soul / corpse tokens (`token`, `value`)
export type ForbidWhat =
  | 'run' | 'charge' | 'slam' | 'trample' | 'powerAttack' | 'cast' | 'advance' | 'attack' | 'beCharged' | 'beTargeted' | 'gainFocus'
  | 'tough' | 'knockDown' | 'weaponAttacks' // added after the M0 review
  | 'gainFury' | 'force' | 'beTransferred' | 'combatAction' // M9 (81 §E)
  | 'heal' // M9 faction specs: Grievous Wounds
// What an `ignore` op lets the subject disregard (LOS and DEF modifiers).
export type IgnoreWhat = 'clouds' | 'stealth' | 'concealment' | 'cover' | 'interveningModels' | 'targetInMelee' | 'gas'
  | 'forest' | 'friendlyModels' | 'shieldBonuses' // M9 faction specs (Treewalker, Precision Strike, Chain Weapon)
// How a `place` op positions the subject (M9 faction specs: Shifter places base to base with the target).
export type PlaceMode = 'b2bWithTarget'
// Kinds of area a `cloud` op places (Cloud.kind in types.ts). Data never uses the word "template" (MK3 lint).
export type AreaKind = 'cloud' | 'hazard' | 'flare'
export interface HazardSpec { pow: number; damageType?: DamageType; on: ('enter' | 'endActivation')[] }
export type EffectNode =
  | { code: string; params?: Record<string, unknown> }
  | {
      op: EffectOp; stat?: Stat; mode?: 'add' | 'set' | 'double' | 'half'; value?: number; roll?: 'attack' | 'damage' | 'any'
      condition?: StoredConditionId; pow?: number; damageType?: DamageType; dist?: number | string
      direction?: 'away' | 'toward' | 'any'; ability?: Id; what?: ForbidWhat; aoe?: number; limit?: number
      // added after the M0 review
      ignore?: IgnoreWhat // op 'ignore'
      count?: number | string // op 'cloud': DiceExpr number of areas (Pall of Ashes d3+3)
      placement?: 'ctrl' | 'centredOnTarget' | 'point' // op 'cloud'
      area?: AreaKind // op 'cloud' (default 'cloud')
      blocksLos?: boolean // op 'cloud'
      hazard?: HazardSpec // op 'cloud' with area 'hazard'
      collateralPow?: number // op 'slam' / 'throw' (Momentum uses the weapon's POW)
      target?: Subject // op 'makeAttack'
      weaponFilter?: 'same' | 'any' | 'melee' | 'ranged' | Id // op 'makeAttack'
      basic?: boolean // op 'makeAttack': must be a basic attack
      token?: TokenKind // M9: ops 'gainToken' / 'spendToken' (count in `value`)
      placeMode?: PlaceMode // M9: op 'place'
    }
export interface ScopeNode {
  who: 'self' | 'target' | 'attacker' | 'unit' | 'controller' | 'warEngines' | 'friendly' | 'enemy' | 'any' | 'point'
    | 'warbeasts' // M9: beasts of the subject's battlegroup
  range?: number | 'CTRL' | 'melee'
  filter?: ConditionNode
  count?: number
}
export type AbilityKind = 'passive' | 'triggered' | 'specialAttack' | 'specialAction' | 'weaponQuality' | 'aura'
export type DescriptorSource = 'ability' | 'quality' | 'spell' | 'feat' | 'system' | 'faction' | 'animus' // animus: M9

// One normalised trigger, built from an ability/quality/spell/feat record and bound to a model.
export interface TriggerDescriptor {
  sourceId: Id
  source: DescriptorSource
  ownerId: ModelId // the model carrying the rule
  point: HookPoint
  when?: ConditionNode
  effect: EffectNode[]
  scope: ScopeNode
  duration: EffectDuration
  optional: boolean // true → triggerWindow decision
  limit?: string // e.g. oncePerActivation
  // M9: fury / forced (81 §E); soul, corpse and damage payments (faction specs). focus stays required: builders default 0.
  cost?: { focus: number; fury?: number; forced?: number; soul?: number; corpse?: number; damage?: number }
  // added after the M0 review: orders "after the attack is resolved" triggers (A1 steps 11-13, R12.4)
  makesAttack?: boolean
}

// ability.kind → hook points it may bind to; 'triggered' binds to its own `trigger` field.
export const KIND_HOOK_POINTS: Record<AbilityKind, readonly HookPoint[] | 'fromTrigger'> = {
  passive: ['passive'],
  aura: ['passive'],
  weaponQuality: 'fromTrigger',
  triggered: 'fromTrigger',
  specialAttack: ['combat.choose'],
  specialAction: ['combat.choose'],
}

// effect op → hook points where it is meaningful (validate-data warns on others).
export const OP_HOOK_POINTS: Partial<Record<EffectOp, readonly HookPoint[]>> = {
  modStat: ['passive', 'activation.start', 'attack.declared', 'damage.beforeRoll', 'spell.cast', 'feat.used'],
  addDie: ['passive', 'attack.beforeRoll', 'damage.beforeRoll'],
  boost: ['passive', 'attack.beforeRoll', 'damage.beforeRoll'],
  reroll: ['attack.rolled', 'damage.rolled'],
  autoHit: ['passive', 'attack.declared'],
  autoMiss: ['passive', 'attack.declared'],
  preventDamage: ['damage.beforeApply'],
  addAttack: ['passive', 'combat.choose', 'attack.resolved'],
  modRoll: ['passive', 'attack.beforeRoll', 'damage.beforeRoll'],
  discardLowest: ['passive', 'attack.rolled', 'damage.rolled'],
  ignore: ['passive', 'attack.declared'],
  makeAttack: ['attack.crit', 'attack.resolved', 'maintenance.effects'],
  advance: ['attack.resolved', 'activation.end', 'maintenance.effects', 'death.destroyed'],
  endActivation: ['attack.resolved', 'activation.end', 'death.destroyed'],
  removeFromPlay: ['death.disabled', 'death.boxed'],
  gainFury: ['passive', 'activation.start', 'attack.resolved', 'spell.cast', 'feat.used', 'death.destroyed'], // M9
  loseFury: ['passive', 'activation.start', 'attack.resolved', 'spell.cast', 'feat.used', 'death.destroyed'], // M9
  gainToken: ['death.destroyed', 'death.boxed', 'attack.resolved', 'activation.start'], // M9
  spendToken: ['passive', 'activation.start', 'attack.beforeRoll', 'damage.beforeRoll', 'combat.choose', 'spell.declare'], // M9
}

// A1 steps 11-13 (R12.4): tier of an "after the attack is resolved" trigger.
// 1 = active player, no attack; 2 = inactive player (any); 3 = active player, makes an attack.
export function afterResolveTier(t: Pick<TriggerDescriptor, 'makesAttack'>, ownerIsActive: boolean): 1 | 2 | 3 {
  if (!ownerIsActive) return 2
  return t.makesAttack ? 3 : 1
}

// ---------- runtime hook context ----------
export interface HookContext {
  state: GameState
  point: HookPoint
  selfId: ModelId
  activePlayer: PlayerId
  attackId?: AttackId
  attackerId?: ModelId
  targetId?: ModelId
  weaponId?: Id
  pointTarget?: Vec2 // a spell/feat point target
  params?: Record<string, unknown>
}
export interface HookResult { state: GameState; events: GameEvent[] }

// Code escape hatch ({code, params}); implementations live in code-hooks.ts / factions/<id>.ts.
export type CodeConditionHook = (ctx: HookContext, params: Record<string, unknown>) => boolean
export type CodeEffectHook = (ctx: HookContext, params: Record<string, unknown>) => HookResult
export interface CodeHookRegistry {
  conditions: Record<string, CodeConditionHook>
  effects: Record<string, CodeEffectHook>
}

// ---------- signatures (bodies land in M2) ----------
export function collectTriggers(_state: GameState, _point: HookPoint, _subjectId?: ModelId): TriggerDescriptor[] {
  throw new Error('hooks.collectTriggers: not implemented (M2)')
}
export function evaluateCondition(_ctx: HookContext, _node: ConditionNode | undefined): boolean {
  throw new Error('hooks.evaluateCondition: not implemented (M2)')
}
export function applyEffects(_ctx: HookContext, _trigger: TriggerDescriptor): HookResult {
  throw new Error('hooks.applyEffects: not implemented (M2)')
}
