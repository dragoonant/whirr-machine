// FROZEN after M0: every player input is an Action answering state.pending (00 §5). Additive changes only.
import type {
  BoxRef, CombatChoice, DecisionId, EdgeId, EffectId, GridState, Id, ModelId, MovementOption, PlayerId,
  PowerAttackKind, StoredConditionId, UnitId, Vec2,
} from './types'

interface Base<T extends string> { type: T; decisionId: DecisionId; player: PlayerId }
export interface Placement { modelId: ModelId; pos: Vec2 }

// ---------- generic ----------
export interface PassAction extends Base<'pass'> {} // legal iff pending.canPass
export interface AckAction extends Base<'ack'> {} // gameOver only
export interface AbilityChoiceAction extends Base<'abilityChoice'> { optionId: string; data?: Record<string, unknown> }
export interface TriggerWindowAction extends Base<'triggerWindow'> { triggerId: string } // resolve this trigger next

// ---------- setup / deploy ----------
export interface ChooseTurnOrderAction extends Base<'chooseTurnOrder'> { order: 'first' | 'second' }
export interface ChooseEdgeAction extends Base<'chooseEdge'> { edge: EdgeId }
export interface DeployAction extends Base<'deploy'> { placements: Placement[] }
export interface AdvanceDeployAction extends Base<'advanceDeploy'> { placements: Placement[] }

// ---------- maintenance / control ----------
export interface MaintenanceOrderAction extends Base<'maintenanceOrder'> { order: EffectId[] }
export interface AllocateFocusAction extends Base<'allocateFocus'> { allocation: Record<ModelId, number> }
export interface PayUpkeepAction extends Base<'payUpkeep'> { keep: EffectId[] } // unlisted upkeeps drop
export interface ShakeAction extends Base<'shake'> { shake: { modelId: ModelId; condition?: StoredConditionId; effectId?: EffectId }[] }

// ---------- activation ----------
export interface ChooseActivationAction extends Base<'chooseActivation'> { activate: ModelId | UnitId }
export interface EndTurnAction extends Base<'endTurn'> {} // only when nothing is left to activate
export interface ChooseMovementAction extends Base<'chooseMovement'> { option: MovementOption; modelId?: ModelId } // modelId: the trooper that moves
export interface MoveModelAction extends Base<'moveModel'> { modelId: ModelId; path: Vec2[] } // waypoints; last = end point
export interface ChargeTargetAction extends Base<'chargeTarget'> { targetId: ModelId }
export interface PlaceTroopersAction extends Base<'placeTroopers'> { placements: Placement[] }
export interface ChooseCombatActionAction extends Base<'chooseCombatAction'> {
  modelId: ModelId
  choice: CombatChoice
  abilityId?: Id // specialAttack / specialAction
  powerAttack?: PowerAttackKind
}
export interface ChooseAttackAction extends Base<'chooseAttack'> {
  modelId: ModelId
  weaponId: Id
  targetId: ModelId
  additional: boolean // true costs 1 focus (or a Reload use)
  attackType?: string // weapon "Attack Type" option chosen at declaration
}
export interface EndAttacksAction extends Base<'endAttacks'> { modelId: ModelId }
export interface PowerAttackAction extends Base<'powerAttack'> { modelId: ModelId; kind: PowerAttackKind; targetId: ModelId; weaponId?: Id }
export interface CombinedAttackAction extends Base<'combinedAttack'> { primaryId: ModelId; contributorIds: ModelId[]; targetId: ModelId; weaponId: Id }

// ---------- caster any-time actions ----------
export interface ChannelAction extends Base<'channel'> { via: ModelId | null } // null = cast from the caster
export interface CastSpellAction extends Base<'castSpell'> { casterId: ModelId; spellId: Id; targetId?: ModelId; point?: Vec2 }
export interface UseFeatAction extends Base<'useFeat'> { casterId: ModelId; featId: Id; choices?: Record<string, unknown> }
export interface HealAction extends Base<'heal'> { casterId: ModelId; points: number }

// ---------- attack / damage answers ----------
export interface BoostAttackAction extends Base<'boostAttack'> { boost: boolean }
export interface RollAnywayAction extends Base<'rollAnyway'> { roll: boolean } // false = accept the auto-hit
export interface RerollAction extends Base<'reroll'> { reroll: boolean; sourceId?: Id }
export interface BoostDamageAction extends Base<'boostDamage'> { boost: boolean; instanceId?: string }
export interface ChooseGridAction extends Base<'chooseGrid'> { grid: GridState['id'] }
export interface PowerFieldAction extends Base<'powerField'> { spend: 0 | 1; instanceId?: string }
export interface ChooseBoxesAction extends Base<'chooseBoxes'> { column?: number; boxes?: BoxRef[] }

export type Action =
  | PassAction | AckAction | AbilityChoiceAction | TriggerWindowAction
  | ChooseTurnOrderAction | ChooseEdgeAction | DeployAction | AdvanceDeployAction
  | MaintenanceOrderAction | AllocateFocusAction | PayUpkeepAction | ShakeAction
  | ChooseActivationAction | EndTurnAction | ChooseMovementAction | MoveModelAction | ChargeTargetAction
  | PlaceTroopersAction | ChooseCombatActionAction | ChooseAttackAction | EndAttacksAction | PowerAttackAction
  | CombinedAttackAction | ChannelAction | CastSpellAction | UseFeatAction | HealAction
  | BoostAttackAction | RollAnywayAction | RerollAction | BoostDamageAction | ChooseGridAction | PowerFieldAction
  | ChooseBoxesAction

export type ActionType = Action['type']
export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>
