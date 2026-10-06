// Battlefield choice (70 section E). Board: the player's pick, else BOARDS[nextU32(deriveSeed(seed,'battlefield','board')) % 5].
// Board and layout come from the engine agent's pure picker in src/data/battlefields.ts; the board-only rule is the fallback.
import type { Id } from '../../engine/index'
import { deriveSeed, nextU32 } from '../../engine/rng'
import { pickBattlefield as pickFromData } from '../../data/battlefields'
import { BOARDS, boardFor } from './boards'

/** Section E rule 1 without a player choice. Never touches game RNG. */
export function boardFromSeed(seed: string): Id {
  return BOARDS[nextU32(deriveSeed(seed, 'battlefield', 'board'))[0] % BOARDS.length]!.id
}

export interface BattlefieldPick { board: Id; layout?: Id }
export interface PickInput { seed: string; scenario: Id; board?: Id | 'random' }

/** True: the picker lives in src/data/battlefields.ts. */
export const hasExternalPicker = (): boolean => true

/** Board and layout for a seed and the player's choice. Never throws. */
export function pickBattlefield(input: PickInput): BattlefieldPick {
  const chosen = input.board && input.board !== 'random' ? boardFor(input.board)?.id : undefined
  try {
    const r = pickFromData(input.seed, input.scenario, input.board ?? null)
    return { board: boardFor(r.board)?.id ?? chosen ?? boardFromSeed(input.seed), layout: r.layoutId }
  } catch { return { board: chosen ?? boardFromSeed(input.seed) } }
}

/** Section E rule 5: a loaded save's board = save.board, else the board whose layouts contain the layout, else rule 1 from the seed. */
export function boardForLoad(saved: Id | undefined, layout: Id | undefined, seed: string): Id {
  const s = boardFor(saved)?.id
  if (s) return s
  const m = layout ? /^layout\.(bog|ruins|village|wasteland|outpost)-/.exec(layout) : null
  const fromLayout = m ? boardFor(m[1])?.id : undefined
  return fromLayout ?? boardFromSeed(seed)
}
