// The five battlefields (70 section C): display name, ground mat paths, light, fog and fallback colours.
// Built-in defaults so the client works before boards.json ships; boards.json (when present) overrides field by field.
import type { Id } from '../../engine/index'

export interface BoardLight { key: string; ambient: string; fog: string; keyIntensity: number; fogNear: number; fogFar: number }
export interface BoardFallback { ground: string; accent: string; piece: string }
export interface BoardDef {
  id: Id
  /** Short name used in URLs, folders and slugs: bog, ruins, village, wasteland, outpost. */
  short: string
  name: string
  /** Mat texture files relative to public/assets/terrain/. */
  ground: { albedo: string; normal: string; rough: string }
  light: BoardLight
  fallback: BoardFallback
  /** GLB slugs that stand in for the generic pieces; pond null = keep the procedural water shape. */
  reskin: { wall: string; pond: string | null }
}

const mk = (short: string, name: string, key: string, ambient: string, fog: string, ground: string, accent: string, piece: string, wall: string, pond: string | null, keyIntensity = 2.4): BoardDef => ({
  id: `board.${short}`, short, name,
  ground: { albedo: `boards/${short}/albedo.jpg`, normal: `boards/${short}/normal.jpg`, rough: `boards/${short}/rough.jpg` },
  light: { key, ambient, fog, keyIntensity, fogNear: 55, fogFar: 150 },
  fallback: { ground, accent, piece },
  reskin: { wall, pond },
})

export const BOARDS: readonly BoardDef[] = [
  mk('bog', 'Hollowmere Bog', '#c9d6b0', '#4b5a47', '#26302a', '#3a3b2b', '#5c6e3c', '#6b6450', 'wt-bog-log-barrier', 'wt-bog-murk-pool'),
  mk('ruins', 'Veilstone Ruins', '#ddd3f2', '#3f3b58', '#28263a', '#4a5a3e', '#9a94b8', '#b8b2a4', 'wt-ruins-colonnade', null),
  mk('village', 'Ironpine Hamlet', '#f3e7cf', '#56606a', '#2e343a', '#5a6440', '#8a7a5a', '#9c958a', 'wt-village-stone-wall', 'wt-village-pond'),
  mk('wasteland', 'Cinder Blight', '#ffb27a', '#3c2622', '#2b1a16', '#3a302b', '#c4521f', '#5a524e', 'wt-wasteland-chain-barricade', 'wt-wasteland-ash-flats'),
  mk('outpost', 'Frostline Outpost', '#e0e9ff', '#6a7488', '#3a4250', '#d9dde2', '#6c5a46', '#7d7a74', 'wt-outpost-sandbags', 'wt-outpost-frozen-pond'),
]
export const BOARD_IDS: readonly Id[] = BOARDS.map((b) => b.id)
export const DEFAULT_BOARD: BoardDef = BOARDS[0]!

/** Accepts a full id ("board.bog") or a short name ("bog"); undefined for anything else. */
export function boardFor(idOrShort: string | null | undefined): BoardDef | undefined {
  if (!idOrShort) return undefined
  return BOARDS.find((b) => b.id === idOrShort || b.short === idOrShort)
}

/** URL / settings value: 'random' or a board; unknown values are Random (the caller may warn). */
export function parseBoardChoice(v: string | null | undefined): { choice: Id | 'random'; known: boolean } {
  if (!v || v === 'random') return { choice: 'random', known: true }
  const b = boardFor(v)
  return b ? { choice: b.id, known: true } : { choice: 'random', known: false }
}

let warned = false
/** `?board=random|bog|ruins|village|wasteland|outpost` (or a full id). Undefined when absent; an unknown value is Random plus one console warning. */
export function boardFromUrl(search = typeof location !== 'undefined' ? location.search : ''): Id | 'random' | undefined {
  const v = new URLSearchParams(search).get('board')
  if (v === null) return undefined
  const p = parseBoardChoice(v)
  if (!p.known && !warned) { warned = true; console.warn(`unknown ?board=${v}: using a random battlefield`) }
  return p.choice
}

// ---------- boards.json overrides (public/assets/terrain/boards/boards.json, optional) ----------
type Loose = Record<string, unknown>
const isObj = (x: unknown): x is Loose => !!x && typeof x === 'object' && !Array.isArray(x)
const str = (x: unknown): string | undefined => (typeof x === 'string' && x ? x : undefined)
const num = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined)

/** Merge one loose boards.json entry over a board's defaults. Unknown or malformed fields are ignored. */
export function mergeBoard(base: BoardDef, raw: unknown): BoardDef {
  if (!isObj(raw)) return base
  const out: BoardDef = { ...base, ground: { ...base.ground }, light: { ...base.light }, fallback: { ...base.fallback }, reskin: { ...base.reskin } }
  out.name = str(raw.name) ?? out.name
  if (isObj(raw.ground)) for (const k of ['albedo', 'normal', 'rough'] as const) out.ground[k] = str(raw.ground[k]) ?? out.ground[k]
  const l = isObj(raw.light) ? raw.light : {}
  for (const k of ['key', 'ambient', 'fog'] as const) out.light[k] = str(l[k]) ?? out.light[k]
  for (const k of ['keyIntensity', 'fogNear', 'fogFar'] as const) out.light[k] = num(l[k]) ?? out.light[k]
  const f = isObj(raw.fallback) ? raw.fallback : {}
  for (const k of ['ground', 'accent', 'piece'] as const) out.fallback[k] = str(f[k]) ?? out.fallback[k]
  out.fallback.ground = str(raw.fallbackColor) ?? out.fallback.ground
  if (isObj(raw.reskin)) {
    out.reskin.wall = str(raw.reskin['terrain.low-wall']) ?? out.reskin.wall
    const p = raw.reskin['terrain.pond']
    if (p === null) out.reskin.pond = null
    else out.reskin.pond = str(p) ?? out.reskin.pond
  }
  return out
}

/** Accepts `[{id,...}]`, `{boards: [...]}` or `{ "board.bog": {...} }`. */
export function mergeBoardsJson(raw: unknown, base: readonly BoardDef[] = BOARDS): BoardDef[] {
  let entries: Loose[] = []
  if (Array.isArray(raw)) entries = raw.filter(isObj)
  else if (isObj(raw) && Array.isArray(raw.boards)) entries = raw.boards.filter(isObj)
  else if (isObj(raw)) entries = Object.entries(raw).filter(([, v]) => isObj(v)).map(([k, v]) => ({ id: k, ...(v as Loose) }))
  return base.map((b) => {
    const hit = entries.find((e) => e.id === b.id || e.id === b.short)
    return hit ? mergeBoard(b, hit) : b
  })
}
