// Test-only content that triggers the decisions the real factions never raise: reroll, rollAnyway, chooseGrid, combinedAttack, channel,
// attacks a trigger makes outside the activation, and additional attacks bought while initial attacks remain. Nothing here is faction
// data (ids start with "sx."); it is merged over the real bundle for the test process only and registered under its own version.
import { loadBundle } from '../../src/data/index'
import { newGrid, spiralDamageState } from '../../src/engine/damage'
import { registerBundle, step, type Action } from '../../src/engine/index'
import { handleActivationAction } from '../../src/engine/phases/activation'
import { raiseChooseActivation } from '../../src/engine/turnflow'
import type { DataBundle, DataRecord, GameState, ModelState, PlayerId, UnitState, Vec2 } from '../../src/engine/types'
import { newGame, runSetup } from '../engine/turn-helpers'

const REAL = loadBundle()
const COLS = ['----', '----', '----', '----', '----', '----'] // six columns of four boxes: 24
const HALF = ['---', '---', '---', '---', '---', '---'] // a colossal's grid: 18 boxes each side

const P: Record<string, DataRecord> = {
  // ----- weapons -----
  'sx.w.blade': { id: 'sx.w.blade', name: 'Test Blade', type: 'melee', rng: 1, pow: 14, recordType: 'weapon' },
  'sx.w.gun': { id: 'sx.w.gun', name: 'Test Gun', type: 'ranged', rng: 12, rof: 1, pow: 12, recordType: 'weapon' },
  'sx.w.hammer': { id: 'sx.w.hammer', name: 'Test Hammer', type: 'melee', rng: 1, pow: 22, recordType: 'weapon' },
  'sx.w.crit-blade': { id: 'sx.w.crit-blade', name: 'Test Crit Blade', type: 'melee', rng: 1, pow: 14, abilities: ['core.a.critical-knockdown'], recordType: 'weapon' },
  'sx.w.echo-blade': { id: 'sx.w.echo-blade', name: 'Test Echo Blade', type: 'melee', rng: 1, pow: 14, abilities: ['sx.a.crit-echo'], recordType: 'weapon' },
  'sx.w.spear': { id: 'sx.w.spear', name: 'Test Spear', type: 'melee', rng: 1, pow: 12, recordType: 'weapon' },
  // ----- abilities -----
  // a reroll of the holder's own missed attack roll (attack.rolled), and one of a weak damage roll (damage.rolled)
  'sx.a.lucky': { id: 'sx.a.lucky', name: 'Lucky', kind: 'triggered', trigger: 'attack.rolled', when: { not: { test: 'hit' } }, effect: [{ op: 'reroll', roll: 'attack' }], scope: { who: 'self' }, duration: 'instant', recordType: 'ability' },
  'sx.a.steady': { id: 'sx.a.steady', name: 'Steady', kind: 'triggered', trigger: 'damage.rolled', effect: [{ op: 'reroll', roll: 'damage' }], scope: { who: 'self' }, duration: 'instant', recordType: 'ability' },
  // the defender's controller may make the attacker reroll a roll that hit
  'sx.a.jinx': { id: 'sx.a.jinx', name: 'Jinx', kind: 'triggered', trigger: 'attack.rolled', when: { test: 'hit' }, effect: [{ op: 'reroll', roll: 'attack' }], scope: { who: 'attacker' }, duration: 'instant', recordType: 'ability' },
  // a reroll that costs 1 focus
  'sx.a.pricey': { id: 'sx.a.pricey', name: 'Pricey', kind: 'triggered', trigger: 'attack.rolled', when: { not: { test: 'hit' } }, cost: { focus: 1 }, effect: [{ op: 'reroll', roll: 'attack' }], scope: { who: 'self' }, duration: 'instant', recordType: 'ability' },
  // after a ranged attack at this model, it makes a basic attack back at the attacker with any weapon (Reciprocate style, but a choice of weapons)
  'sx.a.counter': { id: 'sx.a.counter', name: 'Counter', kind: 'triggered', trigger: 'attack.resolved', when: { test: 'attackKind', value: 'ranged' }, effect: [{ op: 'makeAttack', target: 'attacker', weaponFilter: 'any', basic: true }], scope: { who: 'self' }, duration: 'instant', recordType: 'ability' },
  // on a crit, one more attack with the same weapon, made once the first is resolved (the trigger fires in the crit window)
  'sx.a.crit-echo': { id: 'sx.a.crit-echo', name: 'Crit Echo', kind: 'specialAttack', trigger: 'attack.crit', effect: [{ op: 'makeAttack', target: 'target', weaponFilter: 'same' }], scope: { who: 'target' }, duration: 'instant', recordType: 'ability' },
  // at the start of its Maintenance Phase this model may make a basic attack outside any activation (generic path, not Avenging Force or Sentry)
  'sx.a.dawn-shot': { id: 'sx.a.dawn-shot', name: 'Dawn Shot', kind: 'triggered', trigger: 'maintenance.effects', effect: [{ op: 'makeAttack', target: 'target', weaponFilter: 'any', basic: true }], scope: { who: 'self' }, duration: 'instant', recordType: 'ability' },
  // ----- spells -----
  'sx.s.bolt': { id: 'sx.s.bolt', name: 'Test Bolt', cost: 2, rng: 12, pow: 12, dur: 'RND', offensive: true, effect: [], scope: { who: 'enemy' }, recordType: 'spell' },
  'sx.s.ward': { id: 'sx.s.ward', name: 'Test Ward', cost: 1, rng: 'SELF', dur: 'RND', offensive: false, effect: [{ op: 'modStat', stat: 'DEF', value: 1 }], scope: { who: 'self' }, recordType: 'spell' },
  'sx.s.bless': { id: 'sx.s.bless', name: 'Test Blessing', cost: 1, rng: 10, dur: 'RND', offensive: false, effect: [{ op: 'modStat', stat: 'DEF', value: 1 }], scope: { who: 'friendly' }, recordType: 'spell' },
  // ----- models -----
  'sx.p.cast': { id: 'sx.p.cast', name: 'Test Caster', faction: 'sx', type: 'leader', base: 40, stats: { SPD: 6, MAT: 6, RAT: 6, DEF: 12, ARM: 14, ARC: 5, CTRL: 10, AAT: 6 }, damage: { track: 'grid', columns: COLS }, weapons: [{ weapon: 'sx.w.blade' }], abilities: [], spells: ['sx.s.bolt', 'sx.s.ward', 'sx.s.bless'], recordType: 'model' },
  'sx.p.crit': { id: 'sx.p.crit', name: 'Test Crit Knight', faction: 'sx', type: 'leader', base: 40, stats: { SPD: 6, MAT: 6, RAT: 6, DEF: 12, ARM: 14, ARC: 5, CTRL: 10, AAT: 6 }, damage: { track: 'grid', columns: COLS }, weapons: [{ weapon: 'sx.w.crit-blade' }], abilities: [], recordType: 'model' },
  'sx.p.lucky': { id: 'sx.p.lucky', name: 'Test Lucky Knight', faction: 'sx', type: 'leader', base: 40, stats: { SPD: 6, MAT: 6, RAT: 6, DEF: 12, ARM: 14, ARC: 5, CTRL: 10, AAT: 6 }, damage: { track: 'grid', columns: COLS }, weapons: [{ weapon: 'sx.w.crit-blade' }], abilities: ['sx.a.lucky', 'sx.a.steady'], recordType: 'model' },
  'sx.p.pricey': { id: 'sx.p.pricey', name: 'Test Pricey Knight', faction: 'sx', type: 'leader', base: 40, stats: { SPD: 6, MAT: 6, RAT: 6, DEF: 12, ARM: 14, ARC: 5, CTRL: 10, AAT: 6 }, damage: { track: 'grid', columns: COLS }, weapons: [{ weapon: 'sx.w.blade' }], abilities: ['sx.a.pricey'], recordType: 'model' },
  'sx.p.twin': { id: 'sx.p.twin', name: 'Test Twin Blade', faction: 'sx', type: 'leader', base: 40, stats: { SPD: 6, MAT: 6, RAT: 6, DEF: 12, ARM: 14, ARC: 5, CTRL: 10, AAT: 6 }, damage: { track: 'grid', columns: COLS }, weapons: [{ weapon: 'sx.w.blade', count: 2 }], abilities: [], recordType: 'model' },
  'sx.p.echo': { id: 'sx.p.echo', name: 'Test Echo Knight', faction: 'sx', type: 'leader', base: 40, stats: { SPD: 6, MAT: 6, RAT: 6, DEF: 12, ARM: 14, ARC: 5, CTRL: 10, AAT: 6 }, damage: { track: 'grid', columns: COLS }, weapons: [{ weapon: 'sx.w.echo-blade' }], abilities: [], recordType: 'model' },
  'sx.p.counter': { id: 'sx.p.counter', name: 'Test Counter Knight', faction: 'sx', type: 'leader', base: 40, stats: { SPD: 6, MAT: 6, RAT: 6, DEF: 12, ARM: 14, ARC: 5, CTRL: 10, AAT: 6 }, damage: { track: 'grid', columns: COLS }, weapons: [{ weapon: 'sx.w.blade' }, { weapon: 'sx.w.gun' }], abilities: ['sx.a.counter'], recordType: 'model' },
  'sx.p.shooter': { id: 'sx.p.shooter', name: 'Test Shooter', faction: 'sx', type: 'leader', base: 40, stats: { SPD: 6, MAT: 6, RAT: 6, DEF: 12, ARM: 14, ARC: 5, CTRL: 10, AAT: 6 }, damage: { track: 'grid', columns: COLS }, weapons: [{ weapon: 'sx.w.gun' }], abilities: [], recordType: 'model' },
  'sx.p.dawn': { id: 'sx.p.dawn', name: 'Test Dawn Knight', faction: 'sx', type: 'leader', base: 40, stats: { SPD: 6, MAT: 6, RAT: 6, DEF: 12, ARM: 14, ARC: 5, CTRL: 10, AAT: 6 }, damage: { track: 'grid', columns: COLS }, weapons: [{ weapon: 'sx.w.blade' }, { weapon: 'sx.w.gun' }], abilities: ['sx.a.dawn-shot'], recordType: 'model' },
  'sx.p.dummy': { id: 'sx.p.dummy', name: 'Test Dummy', faction: 'sx', type: 'solo', base: 30, stats: { SPD: 6, MAT: 5, DEF: 12, ARM: 12 }, damage: { track: 'single', boxes: 12 }, weapons: [], abilities: [], recordType: 'model' },
  'sx.p.jinx': { id: 'sx.p.jinx', name: 'Test Jinx Dummy', faction: 'sx', type: 'solo', base: 30, stats: { SPD: 6, MAT: 5, DEF: 12, ARM: 12 }, damage: { track: 'single', boxes: 12 }, weapons: [], abilities: ['sx.a.jinx'], recordType: 'model' },
  'sx.p.node': { id: 'sx.p.node', name: 'Test Arc Node', faction: 'sx', type: 'solo', base: 30, stats: { SPD: 6, MAT: 5, DEF: 12, ARM: 12 }, damage: { track: 'single', boxes: 8 }, weapons: [], abilities: ['core.a.arc-node'], recordType: 'model' },
  'sx.p.colossal': { id: 'sx.p.colossal', name: 'Test Colossal', faction: 'sx', type: 'warEngine', engineClass: 'colossal', base: 120, stats: { SPD: 5, MAT: 7, DEF: 10, ARM: 10 }, damage: { track: 'dualGrid', grids: { left: HALF, right: HALF } }, weapons: [], abilities: [], recordType: 'model' },
  'sx.p.trooper': { id: 'sx.p.trooper', name: 'Test Trooper', faction: 'sx', type: 'trooper', base: 30, stats: { SPD: 5, MAT: 6, DEF: 12, ARM: 12 }, damage: { track: 'single', boxes: 1 }, weapons: [{ weapon: 'sx.w.spear' }], abilities: ['men.a.combined-melee-attack'], recordType: 'model' },
  'sx.p.foe': { id: 'sx.p.foe', name: 'Test Foe', faction: 'sx', type: 'leader', base: 40, stats: { SPD: 6, MAT: 6, RAT: 6, DEF: 12, ARM: 14, ARC: 5, CTRL: 10, AAT: 6 }, damage: { track: 'grid', columns: COLS }, weapons: [{ weapon: 'sx.w.blade' }], abilities: [], recordType: 'model' },
}
/** The synthetic records alone (the AI tests merge them into the process's real bundle, which the AI reads). */
export const SYNTHETIC_RECORDS = P
export const SYN: DataBundle = { version: 'synthetic-decisions', byId: { ...REAL.byId, ...P } }
registerBundle(SYN)
/** The AI reads data through its own handle on the real bundle: give that handle the synthetic records too (this test process only). */
export function installForAi(): void { Object.assign(REAL.byId, P) }

type Prof = DataRecord & { type: ModelState['type']; base: ModelState['base']; stats: Record<string, number>; damage: { track: string; columns?: string[]; boxes?: number; grids?: { left: string[]; right: string[] }; branches?: string[] } }

export function mk(id: string, profileId: string, owner: PlayerId, x: number, z: number, patch: Partial<ModelState> = {}): ModelState {
  const p = SYN.byId[profileId] as Prof
  const d = p.damage
  const damage: ModelState['damage'] = d.track === 'spiral' ? spiralDamageState(d.branches!)
    : d.track === 'grid' ? { track: 'grid', grids: [newGrid({ id: 'main', columns: d.columns! })] }
      : d.track === 'dualGrid' ? { track: 'grid', grids: [newGrid({ id: 'left', columns: d.grids!.left }), newGrid({ id: 'right', columns: d.grids!.right })] }
        : { track: 'single', filled: 0, boxes: d.boxes! }
  return {
    id, profileId, owner, type: p.type, pos: { x, z }, elev: 0, base: p.base, focus: p.type === 'leader' ? p.stats.ARC! : 0, damage, life: 'active',
    conditions: [], crippled: [], hardpoints: {}, activated: false, ...(p.type === 'warEngine' ? { controllerId: owner + ':L' } : {}), ...patch,
  }
}

/** A real game state with the given models swapped in: player A active, in the Activation Phase, nothing else on the table. */
export function world(models: ModelState[], over: Partial<GameState> = {}, units: UnitState[] = []): GameState {
  const base = runSetup(newGame()).state
  return {
    ...base, dataVersion: SYN.version, models: Object.fromEntries(models.map((m) => [m.id, m])), units: Object.fromEntries(units.map((u) => [u.id, u])),
    effects: [], upkeeps: {}, activation: null, attack: null, clouds: [], terrain: [], phase: 'activation', activePlayer: 'A', ...over,
  } as GameState
}

/** Raise the activation choice and activate `id` (a model or a unit); returns the state at the first movement decision. */
export function begin(s0: GameState, id: string): GameState {
  const out = raiseChooseActivation(s0, [])
  return act(out.state, { type: 'chooseActivation', activate: id })
}

/** step() with the decision id and player filled in; throws when the engine rejects the action. */
export function act(s: GameState, a: Record<string, unknown>): GameState {
  const r = step(s, { ...a, decisionId: s.pending.id, player: s.pending.player } as unknown as Action)
  if (r.rejection) throw new Error(`${String(a.type)} rejected: ${r.rejection.code} ${r.rejection.message}`)
  lastEvents = r.events
  return r.state
}
let lastEvents: import('../../src/engine/events').GameEvent[] = []
/** The events of the most recent act(). */
export const events = (): import('../../src/engine/events').GameEvent[] => lastEvents
/** step() that returns the rejection instead of throwing. */
export function tryAct(s: GameState, a: Record<string, unknown>): ReturnType<typeof step> {
  return step(s, { ...a, decisionId: s.pending.id, player: s.pending.player } as unknown as Action)
}
/** The same through the activation module directly (for answers that step() would route elsewhere). */
export function handle(s: GameState, a: Record<string, unknown>): ReturnType<typeof handleActivationAction> {
  return handleActivationAction(s, SYN, { ...a, decisionId: s.pending.id, player: s.pending.player } as unknown as Action)
}

/** Move the active model into the combat choice (movement forfeited) and pick a Combat Action. */
export function toCombat(s0: GameState, id: string, choice = 'melee'): GameState {
  let s = begin(s0, id)
  s = act(s, { type: 'chooseMovement', option: 'forfeit', modelId: id })
  return act(s, { type: 'chooseCombatAction', modelId: id, choice })
}
export const at = (x: number, z: number): Vec2 => ({ x, z })
