// Shared fixtures for the FURY tests: a tiny inline bundle (generic warlock, warbeasts, a solo and an enemy leader) so nothing
// depends on faction data. Models are placed by hand on top of a real game state.
import { loadBundle } from '../../src/data/index'
import { newGrid, spiralDamageState } from '../../src/engine/damage'
import { registerBundle } from '../../src/engine/index'
import type { DataBundle, DataRecord, GameState, ModelState, Vec2 } from '../../src/engine/types'
import { newGame, runSetup } from './turn-helpers'

const REAL = loadBundle()
const grid6x4 = ['----', '----', '----', '----', '----', '----']
const SPIRAL = ['MM--BB', 'S-S', 'BB-MM--', 'S-S-S', '------', 'M--'] // 6/3/7/5/6/3 boxes: 5 Mind, 4 Body, 5 Spirit

const P: Record<string, DataRecord> = {
  'f.w': { id: 'f.w', name: 'Test Warlock', faction: 'f', type: 'leader', resource: 'fury', base: 40, stats: { SPD: 6, MAT: 6, DEF: 14, ARM: 15, ARC: 6, CTRL: 10, AAT: 6 }, damage: { track: 'grid', columns: grid6x4 }, weapons: [{ weapon: 'f.sw' }], abilities: [] },
  'f.w7': { id: 'f.w7', name: 'Test Warlock 7', faction: 'f', type: 'leader', resource: 'fury', base: 40, stats: { SPD: 6, MAT: 6, DEF: 14, ARM: 15, ARC: 7, CTRL: 10, AAT: 6 }, damage: { track: 'grid', columns: grid6x4 }, weapons: [{ weapon: 'f.sw' }], abilities: [] },
  'f.wt': { id: 'f.wt', name: 'Tough Warlock', faction: 'f', type: 'leader', resource: 'fury', base: 40, stats: { SPD: 6, MAT: 6, DEF: 14, ARM: 15, ARC: 6, CTRL: 10, AAT: 6 }, damage: { track: 'grid', columns: grid6x4 }, weapons: [{ weapon: 'f.sw' }], abilities: ['core.a.tough'] },
  'f.wx': { id: 'f.wx', name: 'Other Faction Warlock', faction: 'x', type: 'leader', resource: 'fury', base: 40, stats: { SPD: 6, MAT: 6, DEF: 14, ARM: 15, ARC: 6, CTRL: 10, AAT: 6 }, damage: { track: 'grid', columns: grid6x4 }, weapons: [], abilities: [] },
  'f.b': { id: 'f.b', name: 'Test Beast', faction: 'f', type: 'beast', beastClass: 'heavy', base: 50, stats: { SPD: 5, MAT: 7, DEF: 12, ARM: 17, FURY: 3, THR: 8 }, damage: { track: 'spiral', branches: SPIRAL }, weapons: [{ weapon: 'f.claw' }, { weapon: 'f.bite' }], abilities: ['core.a.headbutt', 'core.a.slam'] },
  'f.k': { id: 'f.k', name: 'Construct Beast', faction: 'f', type: 'beast', beastClass: 'heavy', base: 50, keywords: ['construct'], stats: { SPD: 5, MAT: 7, DEF: 12, ARM: 17, FURY: 3, THR: 4 }, damage: { track: 'spiral', branches: SPIRAL }, weapons: [{ weapon: 'f.claw' }], abilities: ['core.a.construct'] },
  'f.s': { id: 'f.s', name: 'Test Solo', faction: 'f', type: 'solo', base: 30, stats: { SPD: 6, MAT: 5, DEF: 12, ARM: 12 }, damage: { track: 'single', boxes: 5 }, weapons: [], abilities: [] },
  'f.e': { id: 'f.e', name: 'Enemy Brute', faction: 'e', type: 'solo', base: 40, stats: { SPD: 6, MAT: 12, DEF: 10, ARM: 14 }, damage: { track: 'single', boxes: 8 }, weapons: [{ weapon: 'f.big' }], abilities: [] },
  'f.el': { id: 'f.el', name: 'Enemy Leader', faction: 'e', type: 'leader', base: 40, stats: { SPD: 6, MAT: 6, DEF: 14, ARM: 15, ARC: 5, CTRL: 8 }, damage: { track: 'grid', columns: grid6x4 }, weapons: [], abilities: [] },
  'f.sc': { id: 'f.sc', name: 'Test Scenario', table: { w: 36, d: 36 }, elements: [{ id: 'o1', kind: 'objective50', pos: { x: 0, z: 0 } }] },
  'f.sw': { id: 'f.sw', name: 'Test Sword', type: 'melee', rng: 1, pow: 10 },
  'f.claw': { id: 'f.claw', name: 'Test Claw', type: 'melee', rng: 1, pow: 12 },
  'f.bite': { id: 'f.bite', name: 'Test Bite', type: 'melee', rng: 1, pow: 14 },
  'f.big': { id: 'f.big', name: 'Test Cleaver', type: 'melee', rng: 1, pow: 19 },
}
export const BUNDLE: DataBundle = { version: 'fury-test', byId: { ...REAL.byId, ...P } }
registerBundle(BUNDLE)

export function mk(id: string, profileId: string, owner: 'A' | 'B', x: number, z: number, patch: Partial<ModelState> = {}): ModelState {
  const p = BUNDLE.byId[profileId] as DataRecord & { type: ModelState['type']; base: ModelState['base']; stats: Record<string, number>; damage: { track: string; columns?: string[]; branches?: string[]; boxes?: number }; resource?: string }
  const damage = p.damage.track === 'spiral' ? spiralDamageState(p.damage.branches!)
    : p.damage.track === 'grid' ? { track: 'grid' as const, grids: [newGrid({ id: 'main', columns: p.damage.columns! })] }
      : { track: 'single' as const, filled: 0, boxes: p.damage.boxes! }
  const fury = p.type === 'leader' && p.resource === 'fury' ? p.stats.ARC : p.type === 'beast' ? 0 : undefined
  return {
    id, profileId, owner, type: p.type, pos: { x, z }, elev: 0, base: p.base, focus: p.type === 'leader' && fury === undefined ? p.stats.ARC! : 0, damage, life: 'active',
    conditions: [], crippled: [], hardpoints: {}, activated: false, ...(fury !== undefined ? { fury } : {}), ...(p.type === 'beast' ? { controllerId: 'A:L' } : {}), ...patch,
  }
}

/** A real game state with the given models swapped in. Player A is active; A:L and B:L must be among the models. */
export function world(models: ModelState[], over: Partial<GameState> = {}): GameState {
  const base = runSetup(newGame()).state
  return {
    ...base, dataVersion: 'fury-test', models: Object.fromEntries(models.map((m) => [m.id, m])), units: {}, effects: [], upkeeps: {}, activation: null, attack: null,
    clouds: [], terrain: [], phase: 'control', activePlayer: 'A', ...over,
  } as GameState
}
export const warlock = (patch: Partial<ModelState> = {}): ModelState => mk('A:L', 'f.w', 'A', 0, 0, patch)
export const enemyLeader = (patch: Partial<ModelState> = {}): ModelState => mk('B:L', 'f.el', 'B', 20, 20, patch)
export const beast = (id: string, x: number, z: number, patch: Partial<ModelState> = {}): ModelState => mk(id, 'f.b', 'A', x, z, patch)
export const at = (x: number, z: number): Vec2 => ({ x, z })
/** Fill `n` boxes of a spiral or grid damage track from the first branch (state surgery for set-ups). */
export function fillBoxes(m: ModelState, n: number): ModelState {
  if (m.damage.track !== 'grid') return m
  const cols = m.damage.grids[0]!.cols.map((c) => [...c])
  let left = n
  for (const col of cols) for (let i = 0; i < col.length && left > 0; i++) { col[i] = true; left-- }
  return { ...m, damage: { track: 'grid', grids: [{ ...m.damage.grids[0]!, cols }] } }
}
export const ARC_ROW = P
