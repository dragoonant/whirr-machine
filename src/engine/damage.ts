// R1.7, R3: damage rolls, single-row and grid damage, crippling, disabled -> boxed -> destroyed with Tough. Pure.
import { diceCount, rollMaybeZero, rollNd6, sum, sumDistribution, type DiceCount } from './dice'
import type { GameEvent } from './events'
import type { BoxRef, DamageInstance, DamageState, DamageType, GameState, GridState, Id, LifeState, ModelId, ModelState, SystemLetter } from './types'

// ---------- damage roll ----------
export interface DamageRollInput {
  pow: number
  armor: number
  dice?: DiceCount
  resist?: boolean // R1.10: one die removed, once
  flat?: number // extra damage mods
  ownerId?: Id
}
export function rollDamage(state: GameState, inp: DamageRollInput): { state: GameState; events: GameEvent[]; points: number; rollId: string; dice: number[] } {
  const n = diceCount({ ...inp.dice, removed: (inp.dice?.removed ?? 0) + (inp.resist ? 1 : 0) })
  const r = rollMaybeZero(state, n, 'damage', { ownerId: inp.ownerId, target: inp.armor, flat: inp.pow + (inp.flat ?? 0), boosted: inp.dice?.boost })
  return { state: r.state, events: [r.event], points: Math.max(0, r.total - inp.armor), rollId: r.event.rollId, dice: r.dice }
}

/** P(sum of the n d6 kept after dropping the lowest one), indexed by sum (R1.11). n <= 6. */
const dropCache = new Map<number, number[]>()
function sumDistributionDropLowest(n: number): number[] {
  if (n <= 1) return [1]
  const hit = dropCache.get(n)
  if (hit) return hit
  const out = new Array<number>(6 * (n - 1) + 1).fill(0)
  const total = 6 ** n
  for (let i = 0; i < total; i++) {
    let x = i, sum = 0, low = 7
    for (let k = 0; k < n; k++) { const d = (x % 6) + 1; x = Math.floor(x / 6); sum += d; if (d < low) low = d }
    out[sum - low]! += 1 / total
  }
  dropCache.set(n, out)
  return out
}

/** Exact distribution of damage points: result[k] = P(points = k). `dropLowest` discards the lowest die (Heart Seeker). */
export function damageDistribution(inp: { pow: number; armor: number; dice?: DiceCount; resist?: boolean; flat?: number; dropLowest?: boolean }): number[] {
  const n = diceCount({ ...inp.dice, removed: (inp.dice?.removed ?? 0) + (inp.resist ? 1 : 0) })
  const out: number[] = []
  ;(inp.dropLowest && n >= 2 ? sumDistributionDropLowest(n) : sumDistribution(n)).forEach((p, s) => {
    if (!p) return
    const k = Math.max(0, s + inp.pow + (inp.flat ?? 0) - inp.armor)
    out[k] = (out[k] ?? 0) + p
  })
  for (let i = 0; i < out.length; i++) out[i] ??= 0
  return out
}
export const expectedDamage = (d: number[]): number => d.reduce((a, p, k) => a + p * k, 0)
/** P(damage >= boxes). */
export const pKill = (d: number[], boxes: number): number => d.reduce((a, p, k) => a + (k >= boxes ? p : 0), 0)

// ---------- grid layouts ----------
/** Static layout from card data: columns[c] is a top-first string, '-' blank, letter = system box (20 §3). */
export interface GridLayout { id: GridState['id']; columns: string[] }
export const newGrid = (l: GridLayout): GridState => ({ id: l.id, cols: l.columns.map(c => new Array<boolean>(c.length).fill(false)) })
export const gridBoxCount = (g: GridState): number => sum(g.cols.map(c => c.length))
export const gridFilled = (g: GridState): number => sum(g.cols.map(c => c.filter(Boolean).length))

/** A system is crippled while every box carrying its letter (over all grids) is filled. */
export function crippledSystems(layouts: GridLayout[], grids: GridState[]): SystemLetter[] {
  const total = new Map<string, number>(), filled = new Map<string, number>()
  for (const l of layouts) {
    const g = grids.find(x => x.id === l.id)
    l.columns.forEach((col, c) => [...col].forEach((ch, i) => {
      if (ch === '-') return
      total.set(ch, (total.get(ch) ?? 0) + 1)
      if (g?.cols[c]?.[i]) filled.set(ch, (filled.get(ch) ?? 0) + 1)
    }))
  }
  return [...total].filter(([k, t]) => filled.get(k) === t).map(([k]) => k).sort()
}

export interface GridFillResult { grids: GridState[]; boxes: BoxRef[]; overflow: number }
/**
 * R3.4/R3.7: fill `points` boxes starting at 1-based `column` of grid `gridId`: top-down, then the next column
 * to the right with an unmarked box (wrap 6 -> 1); when the grid is full spill to the other grid (colossal).
 */
export function fillGrid(grids: GridState[], gridId: GridState['id'], column: number, points: number): GridFillResult {
  const next = grids.map(g => ({ ...g, cols: g.cols.map(c => [...c]) }))
  const boxes: BoxRef[] = []
  let left = points
  const first = next.find(g => g.id === gridId) ?? next[0]!
  const order = [first, ...next.filter(g => g !== first)]
  let start = (column - 1 + 6) % 6
  for (const g of order) {
    const nc = g.cols.length
    while (left > 0) {
      let c = -1
      for (let k = 0; k < nc; k++) {
        const cc = (start + k) % nc
        if (g.cols[cc]!.includes(false)) { c = cc; break }
      }
      if (c < 0) break
      const col = g.cols[c]!
      for (let i = 0; i < col.length && left > 0; i++) {
        if (!col[i]) { col[i] = true; left--; boxes.push({ grid: g.id, col: c, row: i }) }
      }
      start = c
    }
    start = 0
  }
  return { grids: next, boxes, overflow: left }
}

export interface SingleFillResult { filled: number; boxes: BoxRef[]; overflow: number }
export function fillSingle(filled: number, total: number, points: number): SingleFillResult {
  const take = Math.min(points, Math.max(0, total - filled))
  return { filled: filled + take, boxes: Array.from({ length: take }, (_, i) => ({ col: 0, row: filled + i })), overflow: points - take }
}

export const isFull = (d: DamageState): boolean =>
  d.track === 'single' ? d.filled >= Math.max(d.boxes, 1) : d.grids.every(g => gridFilled(g) >= gridBoxCount(g))
export const filledCount = (d: DamageState): number => d.track === 'single' ? d.filled : sum(d.grids.map(gridFilled))

// ---------- apply damage ----------
export interface ApplyDamageOpts {
  layouts?: GridLayout[] // for grids (crippling)
  column?: number // Marksman or forced; else rolled (R3.4)
  gridId?: GridState['id'] // colossal: attacker's pick; else d6 1-3 left, 4-6 right (R3.7)
  attackId?: string
  instanceId?: string
  source?: DamageInstance['kind']
  damageTypes?: DamageType[]
}
const setModel = (s: GameState, m: ModelState): GameState => ({ ...s, models: { ...s.models, [m.id]: m } })

/** Damage a model: column roll, fill, cripple, and flip life to 'disabled' when the last box fills (D1). */
export function applyDamage(state: GameState, modelId: ModelId, points: number, opts: ApplyDamageOpts = {}): { state: GameState; events: GameEvent[] } {
  let s = state
  const events: GameEvent[] = []
  const m = s.models[modelId]
  if (!m) return { state, events }
  let damage = m.damage
  let boxes: BoxRef[] = []
  let overflow = 0
  let column: number | undefined, columnRollId: string | undefined, gridId: GridState['id'] | undefined
  if (damage.track === 'single') {
    // R3.1: a model with no boxes is disabled by 1 point
    const total = Math.max(damage.boxes, 1)
    const r = fillSingle(damage.filled, total, points)
    damage = { ...damage, filled: r.filled }
    boxes = r.boxes; overflow = r.overflow
  } else if (points > 0) {
    column = opts.column
    if (column === undefined) {
      const c = rollNd6(s, 1, 'column', { ownerId: modelId })
      s = c.state; events.push(c.event)
      column = c.dice[0]!; columnRollId = c.event.rollId
    }
    gridId = opts.gridId
    if (!gridId) {
      if (damage.grids.length > 1) {
        const g = rollNd6(s, 1, 'column', { ownerId: modelId })
        s = g.state; events.push(g.event)
        gridId = g.dice[0]! <= 3 ? 'left' : 'right'
      } else gridId = damage.grids[0]!.id
    }
    const r = fillGrid(damage.grids, gridId, column, points)
    damage = { track: 'grid', grids: r.grids }
    boxes = r.boxes; overflow = r.overflow
  }
  const prevCrip = m.crippled
  const crip = damage.track === 'grid' && opts.layouts ? crippledSystems(opts.layouts, damage.grids) : prevCrip
  const newly = crip.filter(x => !prevCrip.includes(x))
  let nm: ModelState = { ...m, damage, crippled: crip }
  events.push({ type: 'DamageApplied', targetId: modelId, attackId: opts.attackId, instanceId: opts.instanceId, source: opts.source ?? 'direct', points, damageTypes: opts.damageTypes ?? [], grid: gridId, column, columnRollId, boxes, crippled: newly, overflow } as GameEvent)
  for (const x of newly) events.push({ type: 'SystemCrippled', modelId, system: x } as GameEvent)
  // R8 crippled Cortex: the war-engine loses all its focus at once
  if (newly.includes('C') && m.type === 'warEngine' && nm.focus > 0) {
    events.push({ type: 'FocusChanged', modelId, delta: -nm.focus, after: 0, reason: 'lose' } as GameEvent)
    nm = { ...nm, focus: 0 }
  }
  if (points > 0 && isFull(damage) && m.life === 'active') {
    nm = { ...nm, life: 'disabled' }
    events.push({ type: 'LifeStateChanged', modelId, from: 'active', to: 'disabled', cause: opts.attackId } as GameEvent)
  }
  return { state: setModel(s, nm), events }
}

/** Remove `points` damage from the end of the fill (single: last boxes; grid: bottom-most boxes of the rightmost columns). */
export function healDamage(state: GameState, modelId: ModelId, points: number, layouts?: GridLayout[]): { state: GameState; events: GameEvent[]; boxes: BoxRef[] } {
  const m = state.models[modelId]
  if (!m) return { state, events: [], boxes: [] }
  const boxes: BoxRef[] = []
  let damage = m.damage
  if (damage.track === 'single') {
    const take = Math.min(points, damage.filled)
    for (let i = 0; i < take; i++) boxes.push({ col: 0, row: damage.filled - 1 - i })
    damage = { ...damage, filled: damage.filled - take }
  } else {
    const grids = damage.grids.map(g => ({ ...g, cols: g.cols.map(c => [...c]) }))
    let left = points
    for (const g of [...grids].reverse()) {
      for (let c = g.cols.length - 1; c >= 0 && left > 0; c--) {
        const col = g.cols[c]!
        for (let i = col.length - 1; i >= 0 && left > 0; i--) {
          if (col[i]) { col[i] = false; left--; boxes.push({ grid: g.id, col: c, row: i }) }
        }
      }
    }
    damage = { track: 'grid', grids }
  }
  const crip = damage.track === 'grid' && layouts ? crippledSystems(layouts, damage.grids) : m.crippled
  const events: GameEvent[] = [{ type: 'Healed', modelId, points: boxes.length, boxes } as GameEvent]
  for (const x of m.crippled.filter(x => !crip.includes(x))) events.push({ type: 'SystemRestored', modelId, system: x } as GameEvent)
  let nm: ModelState = { ...m, damage, crippled: crip }
  if (m.life === 'disabled' && !isFull(damage)) {
    nm = { ...nm, life: 'active' }
    events.push({ type: 'LifeStateChanged', modelId, from: 'disabled', to: 'active' } as GameEvent)
  }
  return { state: setModel(state, nm), events, boxes }
}

// ---------- death state machine (R3.9): disabled -> [Tough] -> boxed -> destroyed ----------
export interface DeathOpts {
  tough?: boolean // model has Tough
  denyTough?: boolean // Head Shot, Take Down, Pall of Ashes...
  removeFromPlay?: boolean // RFP instead of destroyed (R3.10)
  layouts?: GridLayout[]
  cause?: string
}
const changeLife = (s: GameState, id: ModelId, to: LifeState, cause?: string): { state: GameState; ev: GameEvent } => {
  const m = s.models[id]!
  return { state: setModel(s, { ...m, life: to }), ev: { type: 'LifeStateChanged', modelId: id, from: m.life, to, cause } as GameEvent }
}
export const isKnockedDown = (m: ModelState): boolean => m.conditions.includes('knockedDown')

/** Tough roll (D2): 5-6 heals 1, ends disabled, knocks the model down. */
export function rollTough(state: GameState, modelId: ModelId, layouts?: GridLayout[]): { state: GameState; events: GameEvent[]; survived: boolean } {
  const r = rollNd6(state, 1, 'tough', { ownerId: modelId })
  const events: GameEvent[] = [r.event]
  if (r.dice[0]! < 5) return { state: r.state, events, survived: false }
  const h = healDamage(r.state, modelId, 1, layouts)
  events.push(...h.events)
  const m = h.state.models[modelId]!
  const s = setModel(h.state, { ...m, conditions: isKnockedDown(m) ? m.conditions : [...m.conditions, 'knockedDown'] })
  events.push({ type: 'ConditionAdded', modelId, condition: 'knockedDown', sourceId: 'tough' } as GameEvent)
  return { state: s, events, survived: true }
}

/**
 * Run D2-D4 for one disabled model. A destroyed model stays in state with life 'destroyed';
 * the caller removes it after destroyed triggers. RFP leaves life 'boxed' and emits ModelRemoved.
 */
export function resolveDeath(state: GameState, modelId: ModelId, opts: DeathOpts = {}): { state: GameState; events: GameEvent[]; outcome: 'alive' | 'destroyed' | 'removed' } {
  let s = state
  const events: GameEvent[] = []
  const m = s.models[modelId]
  if (!m || m.life !== 'disabled') return { state, events, outcome: 'alive' }
  if (opts.tough && !opts.denyTough && !isKnockedDown(m)) {
    const t = rollTough(s, modelId, opts.layouts)
    s = t.state; events.push(...t.events)
    if (t.survived) return { state: s, events, outcome: 'alive' }
  }
  let c = changeLife(s, modelId, 'boxed', opts.cause)
  s = c.state; events.push(c.ev)
  if (opts.removeFromPlay) {
    events.push({ type: 'ModelRemoved', modelId, reason: 'removedFromPlay' } as GameEvent)
    return { state: s, events, outcome: 'removed' }
  }
  c = changeLife(s, modelId, 'destroyed', opts.cause)
  s = c.state; events.push(c.ev)
  events.push({ type: 'ModelRemoved', modelId, reason: 'destroyed' } as GameEvent)
  return { state: s, events, outcome: 'destroyed' }
}
