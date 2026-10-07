// 70-terrain-boards section E: pick a board and a layout from the game seed. Pure and deterministic: the same
// (seed, scenario, boardPref) always gives the same answer, and nothing here touches an engine rng stream.
import { deriveSeed, nextU32 } from '../engine/rng'
import { scenarioAnchorProblems } from '../engine/scenario'
import type { DataBundle, Id } from '../engine/types'
import { loadBundle } from './index'
import { layout48Id } from './layout48'

/** Board order is part of the contract: the seed indexes into it. */
export const BOARDS: readonly Id[] = ['board.bog', 'board.ruins', 'board.village', 'board.wasteland', 'board.outpost']
/** Scenarios whose tests depend on their own terrain (GOLD-001 uses the Quick Start ponds): the board only reskins them. */
export const FIXED_LAYOUT_SCENARIOS: readonly Id[] = ['scn-qs-demo']

export interface Battlefield { board: Id; layoutId: Id }

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
  const ok = eligibleLayouts(bundle, board, scenarioId)
  if (!ok.length) return { board, layoutId: own }
  return { board, layoutId: ok[nextU32(deriveSeed(seed, 'battlefield', 'layout'))[0] % ok.length]! }
}

export { scaleLayout48, layout48Id, isLayout48Id, layout48Source } from './layout48'
