// FROZEN after M0: named hook points and the mapping from data descriptors (20 §5) onto them.
import type { GameEvent } from './events'
import type {
  AttackId, DamageType, EffectDuration, GameState, Id, ModelId, PlayerId, Stat, StoredConditionId, TriggerWindow,
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
export type ForbidWhat = 'run' | 'charge' | 'slam' | 'trample' | 'powerAttack' | 'cast' | 'advance' | 'attack' | 'beCharged' | 'beTargeted' | 'gainFocus'
export type EffectNode =
  | { code: string; params?: Record<string, unknown> }
  | {
      op: EffectOp; stat?: Stat; mode?: 'add' | 'set' | 'double' | 'half'; value?: number; roll?: 'attack' | 'damage' | 'any'
      condition?: StoredConditionId; pow?: number; damageType?: DamageType; dist?: number | string
      direction?: 'away' | 'toward' | 'any'; ability?: Id; what?: ForbidWhat; aoe?: number; limit?: number
    }
export interface ScopeNode {
  who: 'self' | 'target' | 'attacker' | 'unit' | 'controller' | 'warEngines' | 'friendly' | 'enemy' | 'any' | 'point'
  range?: number | 'CTRL' | 'melee'
  filter?: ConditionNode
  count?: number
}
export type AbilityKind = 'passive' | 'triggered' | 'specialAttack' | 'specialAction' | 'weaponQuality' | 'aura'
export type DescriptorSource = 'ability' | 'quality' | 'spell' | 'feat' | 'system' | 'faction'

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
  cost?: { focus: number }
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
