// FROZEN after M0: public engine API (00 §2, §8, §10). Bodies are stubs until M1/M2.
import type { Action } from './actions'
import type {
  AttackContext, BaseMm, DataBundle, ElementControl, GameSetup, GameState, Id, LosReason, ModelId, Mod, PendingDecision,
  PlayerId, PlayerView, Rejection, SaveFile, Stat, StepResult, Vec2,
} from './types'
import type { DiceRolled, GameEvent } from './events'

export * from './types'
export * from './actions'
export * from './events'
export * from './hooks'
export * from './rng'
export * from './decider'

export const ENGINE_VERSION = '0.0.0'

const todo = (name: string): never => { throw new Error(`engine.${name}: not implemented`) }

// ---------- reducer ----------
export function createGame(_setup: GameSetup, _seed: string, _bundle: DataBundle): StepResult { return todo('createGame') }
export function step(_state: GameState, _action: Action): StepResult { return todo('step') }
export function legalActions(_state: GameState): Action[] { return todo('legalActions') }
export function validate(_state: GameState, _action: Action): Rejection | null { return todo('validate') }
export function replay(_setup: GameSetup, _seed: string, _bundle: DataBundle, _actions: readonly Action[]): StepResult { return todo('replay') }
export function save(_state: GameState, _label?: string): SaveFile { return todo('save') }
export function load(_file: SaveFile, _bundle: DataBundle): StepResult { return todo('load') }
export function view(_state: GameState, _player: PlayerId): PlayerView { return todo('view') }

// ---------- query.* result shapes (00 §8) ----------
export interface LosResult {
  visible: boolean
  reasons: LosReason[]
  blockers: Id[]
  mods: { concealment: boolean; cover: boolean; elevation: boolean; inMelee: boolean; stealth: boolean }
}
export interface AttackPreviewOpts { additional?: boolean; boostAttack?: boolean; boostDamage?: boolean; chargeAttack?: boolean; fromPos?: Vec2; spellId?: Id }
export interface AttackPreview {
  legal: Rejection | null
  hitTarget: number
  dice: number
  mods: Mod[]
  pHit: number
  pHitBoosted: number
  pCrit: number
  damageTarget: number
  damageDice: number
  expectedDamage: number
  pKill: number
  autoHit: boolean
  autoMiss: boolean
}
export interface ThreatRanges { advance: number; run: number; charge: number; slam: number | null; ranged: number | null; meleeRange: number }
export interface ControlReport {
  elements: Record<Id, ElementControl>
  vpNow: Record<PlayerId, number>
  killBox: Record<PlayerId, boolean>
}
export interface StatTrace { stat: Stat; value: number; base: number; steps: { source: string; mode: 'set' | 'double' | 'half' | 'add'; value: number; after: number }[] }
export interface MoveCheck { ok: boolean; stopAt: Vec2 | null; reason: 'ok' | 'collision' | 'rough' | 'obstacle' | 'obstruction' | 'tooFar' | 'edge' | 'notStraight' | null; distance: number; cost: number }

export const query = {
  distance(_state: GameState, _a: ModelId | Vec2, _b: ModelId | Vec2): number { return todo('query.distance') },
  los(_state: GameState, _viewerId: ModelId, _targetId: ModelId): LosResult { return todo('query.los') },
  attackPreview(_state: GameState, _attackerId: ModelId, _weaponId: Id, _targetId: ModelId, _opts?: AttackPreviewOpts): AttackPreview { return todo('query.attackPreview') },
  threat(_state: GameState, _modelId: ModelId): ThreatRanges { return todo('query.threat') },
  control(_state: GameState): ControlReport { return todo('query.control') },
  stat(_state: GameState, _modelId: ModelId, _stat: Stat): StatTrace { return todo('query.stat') },
  moveCheck(_state: GameState, _modelId: ModelId, _path: Vec2[]): MoveCheck { return todo('query.moveCheck') },
  powerAttackPow(_attackerBase: BaseMm, _targetBase: BaseMm): number { return todo('query.powerAttackPow') }, // 12 if attacker ≤ target, else 14
}

// ---------- describe-numbers helpers (format engine numbers for prompts; no rules arithmetic) ----------
export interface DescribedLine { label: string; value: string; detail?: string }
export const describe = {
  percent(_p: number): string { return todo('describe.percent') },
  mods(_mods: readonly Mod[]): DescribedLine[] { return todo('describe.mods') },
  attack(_ctx: AttackContext): DescribedLine[] { return todo('describe.attack') },
  roll(_ev: DiceRolled): DescribedLine { return todo('describe.roll') },
  decision(_state: GameState, _pending: PendingDecision): { title: string; lines: DescribedLine[] } { return todo('describe.decision') },
  event(_state: GameState, _ev: GameEvent): string { return todo('describe.event') },
}
