// FROZEN after M0: every rule effect emits one of these (00 §2 rule 3). Additive changes only.
import type { Action } from './actions'
import type {
  AttackId, AttackKind, BoxRef, CloudId, CombatChoice, DamageInstance, DamageType, DecisionKind, EdgeId, EffectId,
  ElementControl, FocusPurpose, FocusReason, GameEndReason, GridState, Id, LifeState, LosVerdict, Mod, ModelId,
  MovementOption, Phase, PlayerId, PowerAttackKind, Rejection, RollId, RollPurpose, StoredConditionId, SystemLetter,
  UnitId, Vec2, WindowId,
} from './types'

interface Ev<T extends string> { type: T }

// ---------- flow ----------
export interface GameCreated extends Ev<'GameCreated'> { seed: string; dataVersion: string }
export interface ActionRejected extends Ev<'ActionRejected'> { action: Action; rejection: Rejection }
export interface DecisionAutoResolved extends Ev<'DecisionAutoResolved'> { kind: DecisionKind; optionId: string }
export interface RollOffWon extends Ev<'RollOffWon'> { winner: PlayerId; rollIds: RollId[]; rerolls: number }
export interface TurnOrderChosen extends Ev<'TurnOrderChosen'> { chooser: PlayerId; firstPlayer: PlayerId }
export interface EdgeChosen extends Ev<'EdgeChosen'> { player: PlayerId; edge: EdgeId }
export interface ModelDeployed extends Ev<'ModelDeployed'> { modelId: ModelId; pos: Vec2; advance: boolean }
export interface RoundStarted extends Ev<'RoundStarted'> { round: number }
export interface TurnStarted extends Ev<'TurnStarted'> { round: number; turn: number; player: PlayerId }
export interface TurnEnded extends Ev<'TurnEnded'> { round: number; turn: number; player: PlayerId }
export interface PhaseChanged extends Ev<'PhaseChanged'> { phase: Phase; window: WindowId }
export interface WindowOpened extends Ev<'WindowOpened'> { window: WindowId; subjectId?: Id }

// ---------- dice ----------
export interface DiceRolled extends Ev<'DiceRolled'> {
  rollId: RollId
  purpose: RollPurpose
  ownerId?: Id
  dice: number[] // every die rolled
  kept: number[] // after discard-lowest effects
  total: number // sum(kept) + flat mods
  target?: number // DEF / ARM / threshold the roll is against
  mods?: Mod[]
  boosted?: boolean
  addedDice?: { source: string; count: number }[]
  removedDice?: { source: string; count: number }[]
}
export interface DiceRerolled extends Ev<'DiceRerolled'> { rollId: RollId; sourceId: Id; before: number[]; after: number[]; total: number }

// ---------- focus ----------
export interface FocusChanged extends Ev<'FocusChanged'> { modelId: ModelId; delta: number; after: number; reason: FocusReason; purpose?: FocusPurpose; fromId?: ModelId }

// ---------- effects and conditions ----------
export interface EffectApplied extends Ev<'EffectApplied'> { effectId: EffectId; sourceId: Id; name: string; targetIds: Id[]; refreshed: boolean }
export interface EffectExpired extends Ev<'EffectExpired'> { effectId: EffectId; reason: 'duration' | 'upkeepDropped' | 'casterDestroyed' | 'replaced' | 'shaken' | 'continuousRoll' | 'other' }
export interface UpkeepPaid extends Ev<'UpkeepPaid'> { effectId: EffectId; casterId: ModelId }
export interface ConditionAdded extends Ev<'ConditionAdded'> { modelId: ModelId; condition: StoredConditionId; sourceId?: Id }
export interface ConditionRemoved extends Ev<'ConditionRemoved'> { modelId: ModelId; condition: StoredConditionId; reason: 'shake' | 'standUp' | 'expired' | 'effect' | 'continuousRoll' }
export interface ContinuousEffectRolled extends Ev<'ContinuousEffectRolled'> { modelId: ModelId; condition: StoredConditionId; rollId: RollId; expires: boolean }
export interface TriggerResolved extends Ev<'TriggerResolved'> { sourceId: Id; ownerId: ModelId; window: WindowId; skipped: boolean }

// ---------- activation and movement ----------
export interface ActivationStarted extends Ev<'ActivationStarted'> { activeId: ModelId | UnitId; modelIds: ModelId[] }
export interface ActivationEnded extends Ev<'ActivationEnded'> { activeId: ModelId | UnitId; reason: 'normal' | 'ran' | 'failedCharge' | 'failedSlam' | 'forfeit' }
export interface MovementChosen extends Ev<'MovementChosen'> { modelId: ModelId; option: MovementOption; maxDist: number }
export type MoveKind = 'advance' | 'run' | 'charge' | 'slam' | 'throw' | 'push' | 'place' | 'trample' | 'fall' | 'reposition' | 'deploy' | 'ambush' | 'leastDisturbance'
export interface ModelMoved extends Ev<'ModelMoved'> { modelId: ModelId; kind: MoveKind; from: Vec2; to: Vec2; path: Vec2[]; distance: number; elevAfter: number; stoppedBy?: Id | 'edge' }
export interface TroopersPlaced extends Ev<'TroopersPlaced'> { unitId: UnitId; anchorId: ModelId; placements: { modelId: ModelId; pos: Vec2 }[]; destroyed: ModelId[] }
export interface ChargeDeclared extends Ev<'ChargeDeclared'> { modelId: ModelId; targetId: ModelId }
export interface ChargeResolved extends Ev<'ChargeResolved'> { modelId: ModelId; targetId: ModelId; distance: number; success: boolean; chargeAttack: boolean }
export interface CombatActionChosen extends Ev<'CombatActionChosen'> { modelId: ModelId; choice: CombatChoice; abilityId?: Id; powerAttack?: PowerAttackKind }
export interface CombatActionForfeited extends Ev<'CombatActionForfeited'> { modelId: ModelId; reason: 'run' | 'disengaged' | 'standUp' | 'choice' | 'placedOutOfMelee' | 'ambush' }

// ---------- attacks ----------
export interface AttackDeclared extends Ev<'AttackDeclared'> { attackId: AttackId; attackerId: ModelId; originId: ModelId; weaponId?: Id; spellId?: Id; targetId: ModelId; kind: AttackKind; powerKind?: PowerAttackKind; additional: boolean }
export interface AttackMeasured extends Ev<'AttackMeasured'> { attackId: AttackId; los: LosVerdict; hitTarget: number; mods: Mod[]; dice: number; autoHit: boolean; autoMiss: boolean; pHit: number; pHitBoosted: number }
export interface RollBoosted extends Ev<'RollBoosted'> { attackId?: AttackId; instanceId?: string; roll: 'attack' | 'damage'; modelId: ModelId; source: 'focus' | 'charge' | 'forced' | 'effect' }
export interface AttackResolved extends Ev<'AttackResolved'> { attackId: AttackId; rollId?: RollId; hit: boolean; crit: boolean; auto: 'hit' | 'miss' | null }
export interface BlastTargetsFixed extends Ev<'BlastTargetsFixed'> { attackId: AttackId; centreId: ModelId; targetIds: ModelId[]; tieRollId?: RollId }
export interface AttackFinished extends Ev<'AttackFinished'> { attackId: AttackId }

// ---------- damage and death ----------
export interface DamageRolled extends Ev<'DamageRolled'> { instance: DamageInstance; rollId: RollId; arm: number; points: number }
export interface PowerFieldUsed extends Ev<'PowerFieldUsed'> { modelId: ModelId; instanceId: string; reduced: number; after: number }
export interface DamageApplied extends Ev<'DamageApplied'> {
  targetId: ModelId
  attackId?: AttackId
  instanceId?: string
  source: DamageInstance['kind']
  points: number
  damageTypes: DamageType[]
  grid?: GridState['id']
  column?: number // 1..6, from the column roll or a choice
  columnRollId?: RollId
  boxes: BoxRef[] // boxes filled, in fill order
  crippled: SystemLetter[] // systems newly crippled by this instance
  overflow: number // points left over after the last box
}
export interface SystemCrippled extends Ev<'SystemCrippled'> { modelId: ModelId; system: SystemLetter }
export interface SystemRestored extends Ev<'SystemRestored'> { modelId: ModelId; system: SystemLetter }
export interface Healed extends Ev<'Healed'> { modelId: ModelId; points: number; boxes: BoxRef[]; sourceId?: Id }
export interface LifeStateChanged extends Ev<'LifeStateChanged'> { modelId: ModelId; from: LifeState; to: LifeState; cause?: AttackId | string }
export interface ModelRemoved extends Ev<'ModelRemoved'> { modelId: ModelId; reason: 'destroyed' | 'removedFromPlay' | 'unplaceable' }
export interface WarEngineInert extends Ev<'WarEngineInert'> { modelId: ModelId; casterId: ModelId }

// ---------- spells, feats, clouds ----------
export interface SpellCast extends Ev<'SpellCast'> { casterId: ModelId; spellId: Id; originId: ModelId; targetId?: ModelId; point?: Vec2; cost: number; attackId?: AttackId }
export interface FeatUsed extends Ev<'FeatUsed'> { casterId: ModelId; featId: Id }
export interface CloudCreated extends Ev<'CloudCreated'> { cloudId: CloudId; pos: Vec2; diameter: number; owner: PlayerId }
export interface CloudRemoved extends Ev<'CloudRemoved'> { cloudId: CloudId }

// ---------- scenario and end ----------
export interface ControlChecked extends Ev<'ControlChecked'> { elements: Record<Id, ElementControl> }
export interface ScenarioScored extends Ev<'ScenarioScored'> { player: PlayerId; delta: number; vp: Record<PlayerId, number>; sources: { elementId?: Id; reason: string; vp: number }[] }
export interface KillBoxScored extends Ev<'KillBoxScored'> { offender: PlayerId; beneficiary: PlayerId; vp: number }
export interface GameEnded extends Ev<'GameEnded'> { winner: PlayerId | null; reason: GameEndReason; vp: Record<PlayerId, number> }

export type GameEvent =
  | GameCreated | ActionRejected | DecisionAutoResolved | RollOffWon | TurnOrderChosen | EdgeChosen | ModelDeployed | RoundStarted
  | TurnStarted | TurnEnded | PhaseChanged | WindowOpened
  | DiceRolled | DiceRerolled | FocusChanged
  | EffectApplied | EffectExpired | UpkeepPaid | ConditionAdded | ConditionRemoved | ContinuousEffectRolled | TriggerResolved
  | ActivationStarted | ActivationEnded | MovementChosen | ModelMoved | TroopersPlaced | ChargeDeclared | ChargeResolved
  | CombatActionChosen | CombatActionForfeited
  | AttackDeclared | AttackMeasured | RollBoosted | AttackResolved | BlastTargetsFixed | AttackFinished
  | DamageRolled | PowerFieldUsed | DamageApplied | SystemCrippled | SystemRestored | Healed | LifeStateChanged
  | ModelRemoved | WarEngineInert
  | SpellCast | FeatUsed | CloudCreated | CloudRemoved
  | ControlChecked | ScenarioScored | KillBoxScored | GameEnded

export type GameEventType = GameEvent['type']
export type EventOf<T extends GameEventType> = Extract<GameEvent, { type: T }>
