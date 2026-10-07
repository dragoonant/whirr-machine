// 70-terrain-boards section E: pick a board and a layout from the game seed. Pure and deterministic: the same
// (seed, scenario, boardPref) always gives the same answer, and nothing here touches an engine rng stream.
import { baseRadius } from '../engine/geometry'
import { deriveSeed, nextU32 } from '../engine/rng'
import { scenarioAnchorProblems } from '../engine/scenario'
import { distToShape, terrainTraits, worldShape } from '../engine/terrain'
import type { DataBundle, Id, TerrainInstance, Vec2 } from '../engine/types'
import { loadBundle } from './index'
import { layout48Id } from './layout48'

/** Board order is part of the contract: the seed indexes into it. */
export const BOARDS: readonly Id[] = ['board.bog', 'board.ruins', 'board.village', 'board.wasteland', 'board.outpost']
/** Scenarios whose tests depend on their own terrain (GOLD-001 uses the Quick Start ponds): the board only reskins them. */
export const FIXED_LAYOUT_SCENARIOS: readonly Id[] = ['scn-qs-demo']

export interface Battlefield { board: Id; layoutId: Id }

// ---------- M13 SR layout fit (91 B.5 item 12, B.6) ----------
/** Element base sizes in mm. Scenario terrain, zones and the pieces a flag picks have no base of their own here. */
export const ELEMENT_BASE_MM: Readonly<Record<string, number>> = { objective50: 50, objective40: 40, flag: 30, cache: 30 }
/** SR10: a flag picks one terrain piece within this many inches (base edge to piece edge). */
export const FLAG_PICK_RANGE = 5
/** RULING (91 B.6): an impassable piece within this many inches of an element base is dropped at setup. */
export const ELEMENT_CLEARANCE = 1
/** Quarter turns of the attacker frame (SR5): 0 = as authored, 2 = the Attacker on the other edge, 1 and 3 = east or west. */
export const ALL_QUARTER_TURNS: readonly number[] = [0, 1, 2, 3]

/** Turn a point about the table centre by `q` quarter turns, (x, z) to (-z, x) each turn. Terrain never rotates, only elements. */
export function rotateQuarterTurns(p: Vec2, q: number): Vec2 {
  const n = ((q % 4) + 4) % 4
  return n === 0 ? { x: p.x, z: p.z } : n === 1 ? { x: -p.z, z: p.x } : n === 2 ? { x: -p.x, z: -p.z } : { x: p.z, z: -p.x }
}

export interface LayoutFit {
  /** Piece ids (of the layout) removed at setup so that no impassable piece sits within 1" of an objective or cache base. */
  drop: Id[]
  /** Flags that have no terrain piece within 5" (after the drop) at one or more of the quarter turns checked. */
  flagsWithoutTerrain: Id[]
  /** How many (flag, quarter turn) pairs have no terrain piece within 5": 0 = every flag can pick a piece whichever edge is chosen. */
  flagMisses: number
}

interface PieceRec { id: Id; t: TerrainInstance }
function layoutPieces(bundle: DataBundle, layoutId: Id): PieceRec[] {
  const lay = bundle.byId[layoutId] as { pieces?: { id: string; terrain: string; pos: Vec2; rot?: number }[] } | undefined
  return (lay?.pieces ?? []).map((pc) => {
    const tp = (bundle.byId[pc.terrain] ?? {}) as unknown as { rulesType?: TerrainInstance['rulesType']; footprint: TerrainInstance['footprint']; height?: number; props?: TerrainInstance['props'] }
    return { id: pc.id, t: { id: pc.id, pieceId: pc.terrain, rulesType: tp.rulesType, pos: pc.pos, rot: pc.rot ?? 0, footprint: tp.footprint, height: tp.height ?? 0, props: tp.props ?? {} } as TerrainInstance }
  })
}

/**
 * SR layout fit for a scenario with elements in the attacker frame (SR5). Elements rotate with the edge choice but terrain does not, and
 * the edge is chosen after the layout, so the check runs over every quarter turn in `quarterTurns` and the drops are the union.
 * Dropped: an impassable piece within 1" of an objective or cache base, and an obstacle (low wall) that overlaps one; area terrain
 * never conflicts (SR p15). Flags are left out of the drop: a flag moves onto the piece it picks, and any piece within 1" of it is within
 * 5", so the flag-obstruction fallback never lands on one. Pieces that anchor a scenario element (`terrain`) are never dropped.
 * Pure and deterministic; the engine and the tools call this one function.
 */
export function layoutFit(bundle: DataBundle, scenarioId: Id, layoutId: Id, quarterTurns: readonly number[] = ALL_QUARTER_TURNS): LayoutFit {
  const sc = bundle.byId[scenarioId] as { elements?: { id: Id; kind: string; pos: Vec2; terrain?: Id }[] } | undefined
  const pieces = layoutPieces(bundle, layoutId)
  const anchors = new Set((sc?.elements ?? []).map((e) => e.terrain).filter((t): t is Id => typeof t === 'string'))
  const drop = new Set<Id>()
  for (const q of quarterTurns) {
    for (const el of sc?.elements ?? []) {
      const mm = ELEMENT_BASE_MM[el.kind]
      if (mm === undefined || el.kind === 'flag') continue
      const pos = rotateQuarterTurns(el.pos, q)
      for (const pc of pieces) {
        if (anchors.has(pc.id)) continue
        const gap = Math.max(0, distToShape(pos, worldShape(pc.t)) - baseRadius(mm))
        if (terrainTraits(pc.t).move === 'impassable' ? gap < ELEMENT_CLEARANCE - 1e-9 : pc.t.rulesType === 'obstacle' && gap <= 0) drop.add(pc.id)
      }
    }
  }
  const lacking = new Set<Id>()
  let misses = 0
  for (const q of quarterTurns) {
    for (const el of sc?.elements ?? []) {
      if (el.kind !== 'flag') continue
      const pos = rotateQuarterTurns(el.pos, q)
      const near = pieces.some((pc) => !drop.has(pc.id) && distToShape(pos, worldShape(pc.t)) - baseRadius(ELEMENT_BASE_MM.flag!) <= FLAG_PICK_RANGE + 1e-9)
      if (!near) { lacking.add(el.id); misses++ }
    }
  }
  return { drop: [...drop].sort(), flagsWithoutTerrain: [...lacking].sort(), flagMisses: misses }
}

/** The pieces of `layoutId` that setup removes for `scenarioId` (empty for a scenario with no objective or cache elements). */
export function droppedPieces(bundle: DataBundle, scenarioId: Id, layoutId: Id, quarterTurns?: readonly number[]): Id[] {
  return layoutFit(bundle, scenarioId, layoutId, quarterTurns).drop
}

/**
 * From the eligible layouts keep those that leave the fewest flags without a terrain piece within 5" (counted over the four edge choices),
 * which is every layout that offers all of them a piece when one does ("prefer", 91 B.5). A flag with no piece in reach is legal (it becomes
 * the flag-obstruction), so this only ranks. A scenario with no flags returns the list unchanged, so the seeded picks of earlier scenarios do not move.
 */
export function preferFlagTerrain(bundle: DataBundle, scenarioId: Id, layouts: readonly Id[]): Id[] {
  const sc = bundle.byId[scenarioId] as { elements?: { kind: string }[] } | undefined
  if (!(sc?.elements ?? []).some((e) => e.kind === 'flag')) return [...layouts]
  const misses = layouts.map((l) => layoutFit(bundle, scenarioId, l).flagMisses)
  const least = Math.min(...misses)
  return layouts.filter((_, i) => misses[i] === least)
}

/** 'bog', 'board.bog', 'random' or undefined to a board id, or null for Random (an unknown value is Random too). */
export function resolveBoardPref(pref: string | null | undefined): Id | null {
  if (!pref || pref === 'random') return null
  const id = pref.startsWith('board.') ? pref : `board.${pref}`
  return BOARDS.includes(id) ? id : null
}

/**
 * Layouts of `board` that fit the scenario: same table, and every scenario terrain anchor carried unchanged (G6). For a 48 inch
 * scenario the board's layouts come back as their derived `-48` ids (90-skirmish E3); the 36 inch ones are returned unchanged.
 */
export function eligibleLayouts(bundle: DataBundle, board: Id, scenarioId: Id): Id[] {
  const b = bundle.byId[board] as { layouts?: Id[] } | undefined
  const table = (bundle.byId[scenarioId] as { table?: { w: number; d: number } } | undefined)?.table
  const big = table !== undefined && table.w === 48 && table.d === 48
  return (b?.layouts ?? []).map((l) => (big ? layout48Id(l) : l)).filter((l) => bundle.byId[l] !== undefined && scenarioAnchorProblems(bundle, scenarioId, l).length === 0)
}

/** The board whose layout list contains `layoutId` (for loading a save), or null. */
export function boardOfLayout(layoutId: Id, bundle: DataBundle = loadBundle()): Id | null {
  const own = (bundle.byId[layoutId] as { board?: Id } | undefined)?.board // a derived -48 layout names its board too
  if (own && BOARDS.includes(own)) return own
  return BOARDS.find((id) => ((bundle.byId[id] as { layouts?: Id[] } | undefined)?.layouts ?? []).includes(layoutId)) ?? null
}

/**
 * Board: the player's pick when there is one, else seeded. Layout: the scenario's own for a fixed-layout scenario or when no
 * board layout is eligible; otherwise a seeded pick among the eligible ones.
 */
export function pickBattlefield(seed: string, scenarioId: Id, boardPref?: string | null, bundle: DataBundle = loadBundle()): Battlefield {
  const board = resolveBoardPref(boardPref) ?? BOARDS[nextU32(deriveSeed(seed, 'battlefield', 'board'))[0] % BOARDS.length]!
  const own = (bundle.byId[scenarioId] as { terrainLayout?: Id } | undefined)?.terrainLayout
  if (!own) throw new Error(`battlefields: unknown scenario '${scenarioId}'`)
  if (FIXED_LAYOUT_SCENARIOS.includes(scenarioId)) return { board, layoutId: own }
  const ok = preferFlagTerrain(bundle, scenarioId, eligibleLayouts(bundle, board, scenarioId))
  if (!ok.length) return { board, layoutId: own }
  return { board, layoutId: ok[nextU32(deriveSeed(seed, 'battlefield', 'layout'))[0] % ok.length]! }
}

export { scaleLayout48, layout48Id, isLayout48Id, layout48Source } from './layout48'
