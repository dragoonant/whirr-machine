// FROZEN after M0 (00-architecture §2-§9): additive changes only, each logged in 00-architecture.
import type { Action } from './actions'
import type { GameEvent } from './events'

// ---------- primitives ----------
export type PlayerId = 'A' | 'B'
export type Id = string
export type ModelId = string
export type UnitId = string
export type EffectId = string
export type CloudId = string
export type DecisionId = string // "d:<n>"
export type RollId = string // "r:<n>"
export type AttackId = string // "a:<n>"
export type EdgeId = 'north' | 'south' | 'east' | 'west'

export interface Vec2 { x: number; z: number } // inches; origin = table centre, +z toward player B
export type BaseMm = 30 | 40 | 50 | 80 | 120
export type Location = 'L' | 'R' | 'H' | 'S' | '-'
export type SystemLetter = string // one uppercase letter (L R M C H A or per-model)
export type DamageType = 'blast' | 'cold' | 'corrosion' | 'electricity' | 'fire' | 'magical'
export type Stat = 'SPD' | 'AAT' | 'MAT' | 'RAT' | 'DEF' | 'ARM' | 'ARC' | 'CTRL' | 'FURY' | 'THR' | 'POW' | 'RNG' | 'ROF' | 'AOE'
export type Shape = { circle: { r: number } } | { rect: { w: number; d: number } } | { polygon: Vec2[] }
export type ModelType = 'leader' | 'warEngine' | 'solo' | 'trooper' | 'unit' | 'battleEngine' | 'structure'
export type ConditionId = 'knockedDown' | 'stationary' | 'disrupted' | 'fire' | 'corrosion' | 'inert' | 'engaged'
export type StoredConditionId = Exclude<ConditionId, 'engaged'> // engaged is derived, never stored
export type LifeState = 'active' | 'disabled' | 'boxed' | 'destroyed'
export type Phase = 'setup' | 'deploy' | 'maintenance' | 'control' | 'activation' | 'ended'

// ---------- windows (00 §7; data triggers use the same ids plus 'passive') ----------
export const WINDOW_IDS = [
  'turn.start', 'maintenance.start', 'maintenance.effects', 'control.refill', 'control.powerUp', 'control.allocate',
  'control.upkeep', 'control.shake', 'activation.start', 'activation.end', 'turn.end', 'round.end',
  'movement.choose', 'movement.start', 'movement.move', 'movement.charge', 'movement.place', 'movement.end',
  'combat.choose', 'combat.chooseAttack', 'combat.end',
  'attack.declared', 'attack.beforeRoll', 'attack.rolled', 'attack.hit', 'attack.crit', 'attack.miss', 'attack.resolved',
  'damage.beforeRoll', 'damage.rolled', 'damage.beforeApply', 'damage.applied', 'damage.crippled',
  'death.disabled', 'death.boxed', 'death.destroyed',
  'spell.declare', 'spell.cast', 'feat.used', 'scenario.score', 'game.end',
] as const
export type WindowId = (typeof WINDOW_IDS)[number]
export type TriggerWindow = WindowId | 'passive'

// ---------- data bundle (placeholder until src/data/types.ts lands; shape-compatible) ----------
export interface DataRecord { id: Id; [key: string]: unknown }
export interface DataBundle { version: string; byId: Record<Id, DataRecord> }

// ---------- setup / players ----------
export interface GameSetup {
  scenario: Id // scn.*
  layout?: Id // layout.*; defaults to the scenario's terrainLayout
  lists: Record<PlayerId, Id> // list ids
  names?: Partial<Record<PlayerId, string>>
}
export interface PlayerState {
  id: PlayerId
  faction: Id
  listId: Id
  leaderId: ModelId
  edge: EdgeId | null // set by chooseEdge
  deployed: boolean
  ambushIds: ModelId[] // off-table until they enter (R11.6)
}

// ---------- models and units (00 §3.1) ----------
export interface GridState { id: 'main' | 'left' | 'right'; cols: boolean[][] } // cols[c][i], i=0 top box; true = filled
export type DamageState = { track: 'single'; filled: number; boxes: number } | { track: 'grid'; grids: GridState[] }
export interface BoxRef { grid?: GridState['id']; col: number; row: number } // single track: col 0, row = box index

export interface ModelState {
  id: ModelId
  profileId: Id
  owner: PlayerId
  type: ModelType
  unitId?: UnitId
  pos: Vec2
  elev: number // surface elevation in inches
  base: BaseMm
  focus: number
  damage: DamageState
  life: LifeState
  conditions: StoredConditionId[]
  crippled: SystemLetter[]
  hardpoints: Record<string, Id>
  featUsed?: boolean
  activated: boolean
  controllerId?: ModelId // war-engine → its caster
  inert?: boolean
  offTable?: boolean // ambush, not yet arrived
}
export interface UnitState {
  id: UnitId
  profileId: Id
  owner: PlayerId
  troopers: ModelId[] // remaining, in data order
  attachments: ModelId[]
  activated: boolean
}

// ---------- effects (00 §6.1) ----------
export type EffectDuration = 'instant' | 'attack' | 'activation' | 'turn' | 'round' | 'upkeep' | 'continuous' | 'game' | 'while'
export interface StatMod { stat: Stat; value: number; mode: 'add' | 'set' | 'double' | 'half' }
export interface EffectInstance {
  id: EffectId
  sourceId: Id // ability/spell/feat/quality id
  name: string // same name never stacks on a target
  owner: PlayerId
  casterId?: ModelId
  targetIds: Id[]
  mods: StatMod[]
  conditions?: StoredConditionId[]
  forbid?: string[]
  duration: EffectDuration
  expires: { round: number; turn: number; player: PlayerId } | null
  upkeep?: { casterId: ModelId }
  shakeable?: boolean
}

// ---------- table ----------
export type TerrainRulesType = 'obstacle' | 'obstruction' | 'building' | 'forest' | 'shallowWater' | 'rough' | 'rubble' | 'hill' | 'trench' | 'hazard' | 'deepWater' | 'scenarioTerrain'
export interface TerrainInstance {
  id: Id
  pieceId: Id
  rulesType: TerrainRulesType
  pos: Vec2
  rot: number // radians about +y
  footprint: Shape
  height: number
  props: Record<string, unknown>
}
export interface Cloud { id: CloudId; pos: Vec2; diameter: number; owner: PlayerId; effectId?: EffectId }

// ---------- scenario ----------
export interface ElementControl { controller: PlayerId | null; contested: boolean; holders: ModelId[]; contesters: ModelId[]; reason: string }
export interface ScoreEntry { round: number; turn: number; player: PlayerId; vp: number; source: string }
export interface ScenarioState {
  id: Id
  table: { w: number; d: number }
  vp: Record<PlayerId, number>
  elements: Record<Id, ElementControl>
  killBox: Record<PlayerId, boolean> // leader currently in own kill box
  log: ScoreEntry[]
  result?: { winner: PlayerId | null; reason: GameEndReason }
}
export type GameEndReason = 'assassination' | 'scenario' | 'roundLimit' | 'tiebreakPresence' | 'draw' | 'concession'

// ---------- attack (00 §7) ----------
export type AttackKind = 'melee' | 'ranged' | 'arcane' | 'power' | 'spray' | 'aoe' | 'trample'
export type PowerAttackKind = 'headbutt' | 'slam' | 'throw' | 'trample'
export interface Mod { source: string; label: string; value: number; mode?: 'add' | 'set' }
export type LosReason = 'clear' | 'terrain' | 'model' | 'cloud' | 'forestDepth' | 'outOfTable' | 'self'
export interface LosVerdict { visible: boolean; reasons: LosReason[]; blockers: Id[]; inRange: boolean; distance: number }
export interface DamageInstance {
  id: string
  targetId: ModelId
  kind: 'direct' | 'blast' | 'collateral' | 'continuous' | 'fall' | 'spell' | 'other'
  pow: number
  dice: number // after additions/removals, ≥1
  boosted: boolean
  damageTypes: DamageType[]
  mods: Mod[]
  arm?: number
  rollId?: RollId
  total?: number
  powerField?: number
  grid?: GridState['id']
}
export interface AttackContext {
  attackId: AttackId
  attackerId: ModelId
  weaponId?: Id
  spellId?: Id
  originId: ModelId // attacker or channelling arc node
  targetId: ModelId
  kind: AttackKind
  powerKind?: PowerAttackKind
  additional: boolean
  chargeAttack: boolean
  dice: number
  mods: Mod[]
  hitTarget: number // DEF after mods
  pHit: number
  pHitBoosted: number
  boosted: boolean
  damageTarget?: number // ARM after mods
  powDirect: number
  powBlast?: number
  autoHit?: boolean
  autoMiss?: boolean
  losVerdict: LosVerdict
  rollId?: RollId
  dieValues?: number[]
  hit?: boolean
  crit?: boolean
  blastTargets?: ModelId[]
  damageQueue: DamageInstance[]
  step: WindowId
}

// ---------- activation ----------
export type MovementOption = 'forfeit' | 'aim' | 'advance' | 'run' | 'charge' | 'slam' | 'trample' | 'standUp'
export type CombatChoice = 'melee' | 'ranged' | 'dual' | 'specialAttack' | 'specialAction' | 'powerAttack' | 'standUp' | 'forfeit'
export interface ModelActivation {
  combat: CombatChoice | null
  combatForfeited: boolean
  initialAttacksLeft: Record<Id, number> // weaponId → remaining
  attacksMade: number
  additionalAttacks: number
  powerAttackMade: boolean
  rangedMade: boolean
  meleeMade: boolean
  chargeAttackUsed: boolean
}
export interface ActivationContext {
  activeId: ModelId | UnitId
  modelIds: ModelId[]
  movedModelId: ModelId | null // the trooper that moved (units)
  movement: MovementOption | null
  moved: number // inches travelled
  aimed: boolean
  ran: boolean
  charge: { targetId: ModelId; distance: number; success: boolean | null } | null
  perModel: Record<ModelId, ModelActivation>
  spellsCast: Id[]
  featUsed: boolean
  healed: number
  limitsUsed: string[] // "<abilityId>:<limit>"
  reposition?: number // inches allowed at activation end
}

// ---------- decisions (00 §5) ----------
export type DecisionKind =
  | 'rollOff' | 'chooseTurnOrder' | 'chooseEdge' | 'deploy' | 'advanceDeploy' | 'maintenanceOrder'
  | 'allocateFocus' | 'payUpkeep' | 'shake' | 'chooseActivation' | 'chooseMovement' | 'moveModel' | 'chargeTarget'
  | 'placeTroopers' | 'chooseCombatAction' | 'chooseAttack' | 'combinedAttack' | 'channel' | 'castSpell' | 'useFeat'
  | 'boostAttack' | 'rollAnyway' | 'reroll' | 'boostDamage' | 'chooseGrid' | 'powerField' | 'chooseBoxes'
  | 'triggerWindow' | 'abilityChoice' | 'gameOver'
export interface DecisionOdds { pHit?: number; pHitBoosted?: number; pCrit?: number; expectedDamage?: number; pKill?: number }
export interface DecisionContext {
  modelId?: ModelId
  unitId?: UnitId
  targetId?: ModelId
  attackId?: AttackId
  rollId?: RollId
  effectIds?: EffectId[]
  odds?: DecisionOdds
  data?: Record<string, unknown> & { code?: string } // abilityChoice: code names the hook
}
export interface DecisionOption { id: string; label: string; action: Action; cost?: { focus: number }; odds?: DecisionOdds }
export interface MoveConstraints {
  modelId: ModelId
  from: Vec2
  maxDist: number
  minDist?: number
  straightLine?: boolean
  toward?: ModelId // charge/slam direction
  mustEndInRange?: { targetId: ModelId; range: number }
  zone?: { pos: Vec2; shape: Shape }
  placeWithin?: { anchorId: ModelId; dist: number; completely: boolean; los: boolean }
}
export interface PendingDecision {
  id: DecisionId
  player: PlayerId
  kind: DecisionKind
  window: WindowId
  context: DecisionContext
  options?: DecisionOption[]
  constraints?: MoveConstraints
  canPass: boolean
}

// ---------- rejection ----------
export type RejectionCode =
  | 'E_WRONG_DECISION' | 'E_NOT_YOUR_DECISION' | 'E_NOT_AN_OPTION' | 'E_BAD_PAYLOAD' | 'E_BAD_SETUP' | 'E_DATA_VERSION'
  | 'E_GAME_OVER' | 'E_INSUFFICIENT_FOCUS' | 'E_FOCUS_CAP' | 'E_CRIPPLED' | 'E_OUT_OF_RANGE' | 'E_NO_LOS' | 'E_OUT_OF_CTRL'
  | 'E_ENGAGED' | 'E_KNOCKED_DOWN' | 'E_STATIONARY' | 'E_ALREADY_ACTIVATED' | 'E_ALREADY_USED' | 'E_TARGET_INVALID'
  | 'E_BASE_OVERLAP' | 'E_PATH_BLOCKED' | 'E_TOO_FAR' | 'E_NOT_STRAIGHT' | 'E_OUT_OF_ZONE' | 'E_PLACEMENT'
  | 'E_UPKEEP_LIMIT' | 'E_POWER_ATTACK' | 'E_NO_DUAL_ATTACK'
export interface Rejection { code: RejectionCode; message: string; detail?: Record<string, unknown> }
export class EngineInvariantError extends Error { override name = 'EngineInvariantError' }

// ---------- focus (00 §4) ----------
export type FocusReason = 'refill' | 'powerUp' | 'allocate' | 'trim' | 'maintenanceClear' | 'spend' | 'lose' | 'gain'
export type FocusPurpose = 'boostAttack' | 'boostDamage' | 'additionalAttack' | 'spell' | 'upkeep' | 'shake' | 'heal' | 'powerField' | 'run' | 'charge' | 'powerAttack' | 'reload'

// ---------- rng (00 §9) ----------
export type RngState = [number, number, number, number] // sfc32 state, u32 each
export type RollPurpose =
  | 'rollOff' | 'attack' | 'damage' | 'column' | 'tough' | 'continuous' | 'slamDist' | 'throwDist' | 'fall' | 'rof'
  | 'd3' | 'aoeTie' | 'collateral' | 'spell' | 'maintenance' | 'scenario' | 'other'

// ---------- game state (00 §3) ----------
export interface GameState {
  seed: string
  rng: RngState
  rollSeq: number
  attackSeq: number
  effectSeq: number
  dataVersion: string
  setup: GameSetup
  players: Record<PlayerId, PlayerState>
  round: number // 1..7; 0 during setup/deploy
  turn: number // player turns elapsed this game, 1-based
  activePlayer: PlayerId
  firstPlayer: PlayerId | null
  phase: Phase
  window: WindowId // current step within the phase
  models: Record<ModelId, ModelState>
  units: Record<UnitId, UnitState>
  terrain: TerrainInstance[]
  clouds: Cloud[]
  effects: EffectInstance[]
  upkeeps: Record<Id, { friendly?: EffectId; enemy?: EffectId }>
  attack: AttackContext | null
  activation: ActivationContext | null
  scenario: ScenarioState
  pending: PendingDecision
  decisionSeq: number
  log: Action[]
}

// ---------- engine API results (00 §2, §10) ----------
export interface StepResult {
  state: GameState // SAME reference when rejected
  events: GameEvent[]
  pending: PendingDecision // exactly one; kind 'gameOver' at the end
  rejection?: Rejection
}
export interface PlayerView { player: PlayerId; state: GameState } // no hidden info in the first release
export interface SaveFile {
  format: 1
  engine: string // semver
  dataVersion: string
  setup: GameSetup
  seed: string
  actions: Action[]
  meta: { savedAt: string; label: string }
}
