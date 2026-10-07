// 70-terrain-boards section D: the 48 inch scale-up of a 36 inch layout. Pure and dependency-free so that src/data
// (the bundle loader) can use it without importing the engine. battlefields.ts re-exports it.

interface LayoutPieceRec { id: string; terrain: string; pos: { x: number; z: number }; rot?: number }

/** Suffix of a derived 48 inch layout id: `layout.village-2` becomes `layout.village-2-48`. */
export const LAYOUT_48_SUFFIX = '-48'
export const layout48Id = (id: string): string => `${id}${LAYOUT_48_SUFFIX}`
export const isLayout48Id = (id: string): boolean => id.endsWith(LAYOUT_48_SUFFIX)
/** The 36 inch source id of a derived layout id (the id itself when it is not derived). */
export const layout48Source = (id: string): string => (isLayout48Id(id) ? id.slice(0, -LAYOUT_48_SUFFIX.length) : id)

/**
 * 48 inch scale-up (70 section D): every centre times 4/3, footprints and rotations unchanged, so symmetry holds and every
 * gap grows. Returns a layout record whose id is the layout id plus -48; the bundle loader stores it (E2 of 90-skirmish A.4).
 */
export function scaleLayout48(layout: { id: string; name: string; board?: string; pieces: LayoutPieceRec[] }): {
  id: string; name: string; board?: string; table: { w: 48; d: 48 }; pieces: LayoutPieceRec[]
} {
  return {
    id: layout48Id(layout.id), name: layout.name, ...(layout.board ? { board: layout.board } : {}), table: { w: 48, d: 48 },
    pieces: layout.pieces.map((p) => ({ ...p, pos: { x: (p.pos.x * 4) / 3, z: (p.pos.z * 4) / 3 } })),
  }
}
