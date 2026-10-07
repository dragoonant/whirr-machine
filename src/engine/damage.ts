// R1.7, R3: damage rolls, single-row and grid damage, crippling, disabled -> boxed -> destroyed with Tough. Pure.
import { diceCount, rollMaybeZero, rollNd6, sum, sumDistribution, type DiceCount } from './dice'
import type { GameEvent } from './events'
import { effectsOn } from './effects'
import { battlegroupOf, capOf, inCtrlOf, isBeast, isWarlock, spendFury, unmarkedBoxes } from './fury'
import { ASPECT_LETTER, type Aspect, type BoxRef, type DamageInstance, type DamageState, type DamageType, type DataBundle, type GameState, type GridState, type Id, type LifeState, type ModelId, type ModelState, type SystemLetter } from './types'

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
export interface GridLayout { id: GridState['id']; columns: string[]; spiral?: boolean } // spiral (M9): branches 1-6, outermost box first, lowercase m/b/s aspect letters
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
  aspect?: Aspect // M9 F10.3: the damage names an aspect of a spiral
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
    let left = points
    // M9 F10.3: damage to an aspect marks that aspect's boxes first (lowest branch, outermost), then continues from that branch
    if (opts.aspect && opts.layouts?.[0]?.spiral) {
      const ar = fillAspect(damage.grids[0]!, opts.layouts[0], ASPECT_LETTER[opts.aspect], points)
      damage = { track: 'grid', grids: [ar.grid] }
      boxes = [...ar.boxes]; left = points - ar.boxes.length
      if (ar.boxes.length > 0) column = ar.lastBranch
    }
    if (left > 0) {
      if (column === undefined) column = opts.column
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
      const r = fillGrid(damage.grids, gridId, column, left)
      damage = { track: 'grid', grids: r.grids }
      boxes = [...boxes, ...r.boxes]; overflow = r.overflow
    } else gridId = damage.grids[0]!.id
  }
  const prevCrip = m.crippled
  const crip = damage.track === 'grid' && opts.layouts ? crippledSystems(opts.layouts, damage.grids) : prevCrip
  const newly = crip.filter(x => !prevCrip.includes(x))
  let nm: ModelState = { ...m, damage, crippled: crip }
  events.push({ type: 'DamageApplied', targetId: modelId, attackId: opts.attackId, instanceId: opts.instanceId, source: opts.source ?? 'direct', points, damageTypes: opts.damageTypes ?? [], grid: gridId, column, columnRollId, boxes, crippled: newly, overflow } as GameEvent)
  for (const x of newly) {
    events.push({ type: 'SystemCrippled', modelId, system: x } as GameEvent)
    const asp = ASPECT_OF_LETTER[x]
    if (asp) events.push({ type: 'AspectCrippled', modelId, aspect: asp } as GameEvent)
  }
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
export function healDamage(state: GameState, modelId: ModelId, points: number, layouts?: GridLayout[], pick?: BoxRef[]): { state: GameState; events: GameEvent[]; boxes: BoxRef[] } {
  const m = state.models[modelId]
  if (!m) return { state, events: [], boxes: [] }
  // Grievous Wounds and the like: no healing at all while an effect forbids it (circle.md)
  if (effectsOn(state, modelId).some(e => e.forbid?.includes('heal'))) return { state, events: [], boxes: [] }
  const boxes: BoxRef[] = []
  let damage = m.damage
  if (damage.track === 'single') {
    const take = Math.min(points, damage.filled)
    for (let i = 0; i < take; i++) boxes.push({ col: 0, row: damage.filled - 1 - i })
    damage = { ...damage, filled: damage.filled - take }
  } else if (layouts?.[0]?.spiral) {
    // M9 F10.7: the healer's picks first, then crippled aspects (Spirit, Mind, Body), then the innermost box of the highest branch
    const grid = { ...damage.grids[0]!, cols: damage.grids[0]!.cols.map(c => [...c]) }
    for (const bx of spiralHealBoxes(grid, layouts[0], m.crippled, points, pick)) { grid.cols[bx.col]![bx.row] = false; boxes.push(bx) }
    damage = { track: 'grid', grids: [grid] }
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
  for (const x of m.crippled.filter(x => !crip.includes(x))) {
    events.push({ type: 'SystemRestored', modelId, system: x } as GameEvent)
    const asp = ASPECT_OF_LETTER[x]
    if (asp) events.push({ type: 'AspectRestored', modelId, aspect: asp } as GameEvent)
  }
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
  if (r.dice[0]! < 5 || effectsOn(state, modelId).some(e => e.forbid?.includes('heal') || e.forbid?.includes('tough'))) return { state: r.state, events, survived: false }
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

// ---------- spirals and aspects (M9, 81 F10) ----------
const ASPECT_OF_LETTER: Record<string, Aspect | undefined> = { m: 'mind', b: 'body', s: 'spirit' }
export const aspectOfLetter = (l: string): Aspect | undefined => ASPECT_OF_LETTER[l]
/** Card data: six branches, outermost box first, letters M B S or '-'. Lowercased so the war-engine grid code runs unchanged. */
export const spiralLayout = (branches: readonly string[]): GridLayout => ({ id: 'main', columns: branches.map(b => b.toLowerCase()), spiral: true })
export const spiralDamageState = (branches: readonly string[]): DamageState => ({ track: 'grid', grids: [newGrid(spiralLayout(branches))] })
/** Layouts for any profile: grid, dualGrid or spiral (undefined for a single row). */
export function layoutsFor(profile: Record<string, any>): GridLayout[] | undefined { // eslint-disable-line @typescript-eslint/no-explicit-any
  const d = profile.damage as { track: string; columns?: string[]; branches?: string[]; grids?: { left: string[]; right: string[] } } | undefined
  if (!d) return undefined
  if (d.track === 'spiral' && d.branches) return [spiralLayout(d.branches)]
  if (d.track === 'grid' && d.columns) return [{ id: 'main', columns: d.columns }]
  if (d.track === 'dualGrid' && d.grids) return [{ id: 'left', columns: d.grids.left }, { id: 'right', columns: d.grids.right }]
  return undefined
}

/** F10.3: mark the aspect's boxes: lowest-numbered branch with an unmarked box of that letter, its outermost one; per point. */
export function fillAspect(grid: GridState, layout: GridLayout, letter: string, points: number): { grid: GridState; boxes: BoxRef[]; lastBranch: number } {
  const next: GridState = { ...grid, cols: grid.cols.map(c => [...c]) }
  const boxes: BoxRef[] = []
  let lastBranch = 1
  for (let k = 0; k < points; k++) {
    let hit = false
    for (let c = 0; c < next.cols.length && !hit; c++) {
      const i = [...(layout.columns[c] ?? '')].findIndex((ch, idx) => ch === letter && !next.cols[c]![idx])
      if (i >= 0) { next.cols[c]![i] = true; boxes.push({ grid: grid.id, col: c, row: i }); lastBranch = c + 1; hit = true }
    }
    if (!hit) break
  }
  return { grid: next, boxes, lastBranch }
}

/** F10.7: boxes to unmark. Picks first (must be marked), then one box of each crippled aspect (Spirit, Mind, Body), then innermost of the highest branch. */
export function spiralHealBoxes(grid: GridState, layout: GridLayout, crippled: readonly string[], points: number, pick?: BoxRef[]): BoxRef[] {
  const cols = grid.cols.map(c => [...c])
  const out: BoxRef[] = []
  const take = (c: number, i: number): void => { cols[c]![i] = false; out.push({ grid: grid.id, col: c, row: i }) }
  for (const bx of pick ?? []) {
    if (out.length >= points) break
    if (cols[bx.col]?.[bx.row]) take(bx.col, bx.row)
  }
  const wanted = ['s', 'm', 'b'].filter(l => crippled.includes(l))
  while (out.length < points) {
    const letter = wanted.shift()
    let found = false
    for (let c = cols.length - 1; c >= 0 && !found; c--) {
      for (let i = cols[c]!.length - 1; i >= 0 && !found; i--) {
        if (cols[c]![i] && (!letter || layout.columns[c]?.[i] === letter)) { take(c, i); found = true }
      }
    }
    if (!found && !letter) break
  }
  return out
}

/** F10.1 view for the UI and queries. */
export function spiralView(state: GameState, bundle: DataBundle, id: ModelId): {
  branches: { branch: number; boxes: { aspect: Aspect | null; filled: boolean }[] }[]
  unmarked: number
  aspects: Record<Aspect, { total: number; filled: number; crippled: boolean }>
} {
  const m = state.models[id]
  const layout = m ? layoutsFor((bundle.byId[m.profileId] ?? {}) as Record<string, unknown>)?.[0] : undefined
  const aspects: Record<Aspect, { total: number; filled: number; crippled: boolean }> = {
    mind: { total: 0, filled: 0, crippled: false }, body: { total: 0, filled: 0, crippled: false }, spirit: { total: 0, filled: 0, crippled: false },
  }
  if (!m || !layout || m.damage.track !== 'grid') return { branches: [], unmarked: 0, aspects }
  const grid = m.damage.grids[0]!
  const branches = layout.columns.map((col, c) => ({
    branch: c + 1,
    boxes: [...col].map((ch, i) => {
      const aspect = ASPECT_OF_LETTER[ch] ?? null
      const filled = !!grid.cols[c]?.[i]
      if (aspect) { aspects[aspect].total++; if (filled) aspects[aspect].filled++ }
      return { aspect, filled }
    }),
  }))
  for (const a of Object.keys(aspects) as Aspect[]) aspects[a].crippled = aspects[a].total > 0 && aspects[a].filled === aspects[a].total
  return { branches, unmarked: unmarkedBoxes(m.damage), aspects }
}

// ---------- damage transfer (M9, 81 F8) ----------
type TransferBad = { code: 'E_TARGET_INVALID' | 'E_OUT_OF_CTRL' | 'E_FURY_CAP' | 'E_INSUFFICIENT_FURY'; message: string }
/** T2: beasts of the warlock's battlegroup that could take a transfer right now. */
export function transferCandidates(state: GameState, b: DataBundle, warlockId: ModelId): ModelState[] {
  const w = state.models[warlockId]
  if (!w || !isWarlock(w) || w.life !== 'active' || w.offTable) return []
  return battlegroupOf(state, w).filter(m => !m.frenzied && inCtrlOf(state, b, w, m) && (m.fury ?? 0) < capOf(state, b, m) && !effectsOn(state, m.id).some(e => e.forbid?.includes('beTransferred')))
}
/** T1 + T2: should the transfer prompt be raised for this instance? */
export function transferAvailable(state: GameState, b: DataBundle, warlockId: ModelId, points: number): boolean {
  const w = state.models[warlockId]
  return !!w && isWarlock(w) && w.life === 'active' && (w.fury ?? 0) >= 1 && points >= 1 && transferCandidates(state, b, warlockId).length > 0
}
export function validateTransfer(state: GameState, b: DataBundle, warlockId: ModelId, beastId: ModelId): TransferBad | null {
  const w = state.models[warlockId]
  const m = state.models[beastId]
  if (!w || !isWarlock(w) || !m || !isBeast(m) || m.controllerId !== warlockId || m.wild || m.life !== 'active' || m.offTable || m.frenzied) return { code: 'E_TARGET_INVALID', message: `${beastId} is not in ${warlockId}'s battlegroup` }
  if (!inCtrlOf(state, b, w, m)) return { code: 'E_OUT_OF_CTRL', message: `${beastId} is outside CTRL` }
  if ((m.fury ?? 0) >= capOf(state, b, m)) return { code: 'E_FURY_CAP', message: `${beastId} holds all the fury it can` }
  if (effectsOn(state, beastId).some(e => e.forbid?.includes('beTransferred'))) return { code: 'E_TARGET_INVALID', message: 'an effect stops this beast taking transferred damage' }
  if ((w.fury ?? 0) < 1) return { code: 'E_INSUFFICIENT_FURY', message: 'a transfer costs 1 fury' }
  return null
}
/** T4-T5: pay 1 fury, mark the absorbed part on the beast (branch rolled). The overflow (T6) is returned for the caller to apply with noTransfer. */
export function applyTransfer(
  state: GameState, b: DataBundle, warlockId: ModelId, beastId: ModelId, points: number,
  opts: { attackId?: string; instanceId?: string; layouts?: GridLayout[] } = {},
): { state: GameState; events: GameEvent[]; absorbed: number; overflow: number } | { rejection: TransferBad } {
  const bad = validateTransfer(state, b, warlockId, beastId)
  if (bad) return { rejection: bad }
  const sp = spendFury(state, warlockId, 1, 'transfer')
  if ('rejection' in sp) return { rejection: { code: 'E_INSUFFICIENT_FURY', message: sp.rejection.message } }
  let s = sp.state
  const events: GameEvent[] = [...sp.events]
  const beast = s.models[beastId]!
  const absorbed = Math.min(points, unmarkedBoxes(beast.damage))
  const overflow = points - absorbed
  events.push({ type: 'DamageTransferred', warlockId, beastId, points, absorbed, overflow, attackId: opts.attackId, instanceId: opts.instanceId })
  if (absorbed > 0) {
    const a = applyDamage(s, beastId, absorbed, { layouts: opts.layouts, source: 'transfer', attackId: opts.attackId, instanceId: opts.instanceId })
    s = a.state; events.push(...a.events)
  }
  return { state: s, events, absorbed, overflow }
}

/** Exact preview per battlegroup beast (81 D.2): absorbed, overflow, chance the beast is disabled and that each aspect is crippled afterwards. */
export function transferPreview(state: GameState, b: DataBundle, warlockId: ModelId, points: number): {
  beastId: ModelId; eligible: boolean; reason?: string; unmarked: number; fury: number; cap: number; absorbed: number; overflow: number
  pDisabled: number; pCripple: Record<Aspect, number>
}[] {
  const w = state.models[warlockId]
  if (!w || !isWarlock(w)) return []
  return battlegroupOf(state, w).map(m => {
    const bad = validateTransfer(state, b, warlockId, m.id)
    const unmarked = unmarkedBoxes(m.damage)
    const absorbed = Math.min(points, unmarked)
    const pC: Record<Aspect, number> = { mind: 0, body: 0, spirit: 0 }
    const layouts = layoutsFor((b.byId[m.profileId] ?? {}) as Record<string, unknown>)
    if (layouts && m.damage.track === 'grid' && absorbed > 0) {
      for (let branch = 1; branch <= 6; branch++) {
        const r = fillGrid(m.damage.grids, 'main', branch, absorbed)
        const crip = crippledSystems(layouts, r.grids)
        for (const a of Object.keys(pC) as Aspect[]) if (crip.includes(ASPECT_LETTER[a])) pC[a] += 1 / 6
      }
    } else if (layouts) for (const a of Object.keys(pC) as Aspect[]) pC[a] = m.crippled.includes(ASPECT_LETTER[a]) ? 1 : 0
    return {
      beastId: m.id, eligible: !bad, reason: bad?.message, unmarked, fury: m.fury ?? 0, cap: capOf(state, b, m),
      absorbed, overflow: points - absorbed, pDisabled: absorbed >= unmarked && unmarked > 0 ? 1 : 0, pCripple: pC,
    }
  })
}
