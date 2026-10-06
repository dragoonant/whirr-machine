// Data piece -> GLB slug map (70 section B/F; mirrors tools/terrain-catalog.json) and the board reskin of the generic pieces.
import type { Id } from '../../engine/index'
import type { BoardDef } from './boards'

/** pieceId -> [slug, visualHeight in inches]. */
export const PIECE_MODELS: Readonly<Record<Id, readonly [string, number]>> = {
  'terrain.bog-deadwood': ['wt-bog-deadwood', 5],
  'terrain.bog-stilt-hut': ['wt-bog-stilt-hut', 5.5],
  'terrain.bog-hummock': ['wt-bog-hummock', 1],
  'terrain.bog-log-barrier': ['wt-bog-log-barrier', 0.9],
  'terrain.bog-murk-pool': ['wt-bog-murk-pool', 0.2],
  'terrain.bog-bone-mire': ['wt-bog-bone-mire', 0.3],
  'terrain.bog-stumps': ['wt-bog-stumps', 0.8],
  'terrain.ruins-monolith': ['wt-ruins-monolith', 6],
  'terrain.ruins-arch': ['wt-ruins-arch', 4.5],
  'terrain.ruins-colonnade': ['wt-ruins-colonnade', 0.9],
  'terrain.ruins-crystal': ['wt-ruins-crystal', 3],
  'terrain.ruins-grove': ['wt-ruins-grove', 5],
  'terrain.ruins-dais': ['wt-ruins-dais', 1],
  'terrain.ruins-masonry': ['wt-ruins-masonry', 0.7],
  'terrain.village-chapel': ['wt-village-chapel', 6],
  'terrain.village-watchtower': ['wt-village-watchtower', 7],
  'terrain.village-pines': ['wt-village-pines', 6],
  'terrain.village-rail-fence': ['wt-village-rail-fence', 1],
  'terrain.village-stone-wall': ['wt-village-stone-wall', 0.85],
  'terrain.village-pond': ['wt-village-pond', 0.2],
  'terrain.village-knoll': ['wt-village-knoll', 1],
  'terrain.village-boulders': ['wt-village-boulders', 0.8],
  'terrain.wasteland-thorn-palisade': ['wt-wasteland-thorn-palisade', 3.5],
  'terrain.wasteland-chain-barricade': ['wt-wasteland-chain-barricade', 1],
  'terrain.wasteland-thornwood': ['wt-wasteland-thornwood', 5],
  'terrain.wasteland-ritual-dais': ['wt-wasteland-ritual-dais', 1],
  'terrain.wasteland-ash-flats': ['wt-wasteland-ash-flats', 0.3],
  'terrain.wasteland-blight-pool': ['wt-wasteland-blight-pool', 0.3],
  'terrain.wasteland-bone-spikes': ['wt-wasteland-bone-spikes', 1],
  'terrain.outpost-blockhouse': ['wt-outpost-blockhouse', 5],
  'terrain.outpost-snow-pines': ['wt-outpost-snow-pines', 6],
  'terrain.outpost-trench': ['wt-outpost-trench', 0.4],
  'terrain.outpost-sandbags': ['wt-outpost-sandbags', 0.85],
  'terrain.outpost-stakes': ['wt-outpost-stakes', 1],
  'terrain.outpost-wagon': ['wt-outpost-wagon', 2.2],
  'terrain.outpost-frozen-pond': ['wt-outpost-frozen-pond', 0.2],
  'terrain.outpost-snow-rocks': ['wt-outpost-snow-rocks', 0.8],
}

export interface ModelRef { slug: string; visualHeight: number }

/** Visual heights of the reskin slugs (looks only; the rules stay those of the generic piece). */
const slugHeight = (slug: string): number => Object.values(PIECE_MODELS).find(([s]) => s === slug)?.[1] ?? 1

/** The GLB for a data piece on a board, or null (procedural stand-in). Generic wall and pond use the board's reskin. */
export function modelFor(pieceId: Id, board: BoardDef): ModelRef | null {
  const own = PIECE_MODELS[pieceId]
  if (own) return { slug: own[0], visualHeight: own[1] }
  const reskin = pieceId === 'terrain.low-wall' ? board.reskin.wall : pieceId === 'terrain.pond' ? board.reskin.pond : null
  return reskin ? { slug: reskin, visualHeight: slugHeight(reskin) } : null
}
