// Pure board layout helpers (no React, no three). Everything here is DISPLAY geometry: zones, terrain outlines and
// colours come straight from engine/data; no rules number is computed.
import { loadBundle } from '../../data/index'
import type { ElementControl, GameState, ModelState, PlayerId, TerrainInstance, TerrainRulesType, Vec2 } from '../../engine/index'
import { baseRadius } from '../../engine/geometry'
import { scenarioDef, type ElementDef } from '../../engine/scenario'
import { deploymentZone, type Rect } from '../../engine/setup'
import { worldShape, type WorldShape } from '../../engine/terrain'

export type { ElementDef, Rect, WorldShape }

/** Shape of query.threat (engine ThreatRanges), declared locally so this file stays free of contract imports. */
export interface ThreatLike { advance: number; run: number; charge: number; slam: number | null; ranged: number | null; meleeRange: number }

// ---------- theme ----------
export const THEME = {
  bg: '#14161a', fg: '#e8e6e1', card: '#1e2127', accent: '#c9a227', brass: '#b87333',
  felt: '#3a3e33', feltLight: '#454a3d', grid: '#4a4a3f', gridSection: '#6d6540',
} as const

export interface SideColours { primary: string; secondary: string; ring: string; zone: string }
/** Blue and gold for the republic side (A), red and iron for the empire side (B). Archetypes only, no real insignia. */
export const SIDE_COLOURS: Record<PlayerId, SideColours> = {
  A: { primary: '#2f5d9e', secondary: '#d4aa3a', ring: '#5b8fd6', zone: '#3a6fb8' },
  B: { primary: '#9b2d2a', secondary: '#6b6e75', ring: '#d6574f', zone: '#b8403a' },
}
export const NEUTRAL_COLOUR = '#c9a227'
export const CONTESTED_COLOUR = '#d9d9d9'

export function controllerColour(c: ElementControl | undefined): string {
  if (!c) return NEUTRAL_COLOUR
  if (c.contested) return CONTESTED_COLOUR
  return c.controller ? SIDE_COLOURS[c.controller].ring : NEUTRAL_COLOUR
}

// ---------- table ----------
export const DEFAULT_TABLE = { w: 36, d: 36 }
export const tableOf = (s: GameState | null): { w: number; d: number } => s?.scenario.table ?? DEFAULT_TABLE

// ---------- terrain styling (semi-transparent: pieces never hide a model) ----------
export interface TerrainStyle { color: string; opacity: number; maxHeight: number; kind: 'wall' | 'water' | 'forest' | 'rubble' | 'block' | 'flat' }
const STYLES: Record<TerrainRulesType, TerrainStyle> = {
  obstacle: { color: '#8b8678', opacity: 0.72, maxHeight: 1.1, kind: 'wall' },
  obstruction: { color: '#6d6a62', opacity: 0.5, maxHeight: 3, kind: 'block' },
  building: { color: '#7a6f5f', opacity: 0.48, maxHeight: 4, kind: 'block' },
  forest: { color: '#3f6b3a', opacity: 0.45, maxHeight: 2.5, kind: 'forest' },
  shallowWater: { color: '#3d7fa8', opacity: 0.5, maxHeight: 0.12, kind: 'water' },
  deepWater: { color: '#1f4e7a', opacity: 0.62, maxHeight: 0.14, kind: 'water' },
  rough: { color: '#7d6a49', opacity: 0.5, maxHeight: 0.2, kind: 'flat' },
  rubble: { color: '#8a7f6b', opacity: 0.6, maxHeight: 0.5, kind: 'rubble' },
  hill: { color: '#5d6b47', opacity: 0.55, maxHeight: 2, kind: 'block' },
  trench: { color: '#4c4033', opacity: 0.6, maxHeight: 0.1, kind: 'flat' },
  hazard: { color: '#b3432e', opacity: 0.5, maxHeight: 0.15, kind: 'flat' },
  scenarioTerrain: { color: '#9a8f5a', opacity: 0.72, maxHeight: 1.1, kind: 'wall' },
}
export const terrainStyle = (t: Pick<TerrainInstance, 'rulesType'>): TerrainStyle => STYLES[t.rulesType] ?? STYLES.obstruction
/** Rendered height: the data height, kept low enough that a piece never hides a figure behind it. */
export const terrainDrawHeight = (t: TerrainInstance): number => Math.max(0.06, Math.min(t.height || 0, terrainStyle(t).maxHeight))

export interface TerrainOutline { id: string; shape: WorldShape; style: TerrainStyle; height: number; rulesType: TerrainRulesType }
export function terrainOutlines(terrain: readonly TerrainInstance[]): TerrainOutline[] {
  return terrain.map((t) => ({ id: t.id, shape: worldShape(t), style: terrainStyle(t), height: terrainDrawHeight(t), rulesType: t.rulesType }))
}

// ---------- zones and scenario elements ----------
export interface ZoneView { player: PlayerId; rect: Rect; advance: Rect | null }
export function zoneViews(s: GameState | null): ZoneView[] {
  if (!s) return []
  const out: ZoneView[] = []
  try {
    const bundle = loadBundle()
    for (const p of ['A', 'B'] as PlayerId[]) {
      if (!s.players[p].edge || !s.firstPlayer) continue
      out.push({ player: p, rect: deploymentZone(s, bundle, p, false), advance: deploymentZone(s, bundle, p, true) })
    }
  } catch { /* zones are decoration: never break the board */ }
  return out
}

export interface ElementView { def: ElementDef; control: ElementControl | undefined; colour: string; radius: number }
const elementCache = new Map<string, ElementDef[]>()
export function elementDefs(s: GameState | null): ElementDef[] {
  if (!s) return []
  const hit = elementCache.get(s.scenario.id)
  if (hit) return hit
  let defs: ElementDef[] = []
  try { defs = scenarioDef(loadBundle(), s.scenario.id).elements } catch { defs = [] }
  elementCache.set(s.scenario.id, defs)
  return defs
}
export function elementViews(s: GameState | null): ElementView[] {
  return elementDefs(s).map((def) => {
    const control = s?.scenario.elements[def.id]
    return { def, control, colour: controllerColour(control), radius: def.hold.within }
  })
}

// ---------- ghost / ring helpers ----------
export interface RingSpec { key: 'advance' | 'run' | 'charge' | 'ranged'; radius: number; colour: string; dash: boolean }
/** Rings are drawn from the model centre: engine threat inches are edge distances, so add the base radius. */
export function threatRings(m: Pick<ModelState, 'base'>, t: ThreatLike | null): RingSpec[] {
  if (!t) return []
  const r = baseRadius(m.base)
  const rings: RingSpec[] = [
    { key: 'advance', radius: r + t.advance, colour: '#7fd18b', dash: false },
    { key: 'run', radius: r + t.run, colour: '#e0c35a', dash: true },
    { key: 'charge', radius: r + t.charge, colour: '#e0794a', dash: false },
  ]
  if (t.ranged != null) rings.push({ key: 'ranged', radius: r + t.ranged, colour: '#7aa8e0', dash: true })
  return rings
}

/** Our words for the engine's MoveCheck reason. */
export function moveReasonText(reason: string | null): string {
  switch (reason) {
    case 'ok': return 'Legal move'
    case 'collision': return 'Blocked by another base'
    case 'rough': return 'Rough ground costs extra'
    case 'obstacle': return 'An obstacle is in the way'
    case 'obstruction': return 'Blocked by an obstruction'
    case 'tooFar': return 'Out of reach'
    case 'edge': return 'Leaves the allowed area'
    case 'notStraight': return 'Must be a straight line'
    default: return 'Not a legal move'
  }
}

/** Our words for the engine's LOS reasons. */
export function losReasonText(reason: string, blockers: string[]): string {
  const b = blockers.length ? ` (${blockers.join(', ')})` : ''
  switch (reason) {
    case 'clear': return 'Clear line'
    case 'terrain': return `Blocked by terrain${b}`
    case 'model': return `Blocked by a model${b}`
    case 'cloud': return `Blocked by a cloud${b}`
    case 'forestDepth': return `Too much forest in the way${b}`
    case 'outOfTable': return 'Off the table'
    case 'self': return 'Same model'
    default: return reason
  }
}

// ---------- DOM proxy data ----------
export interface ProxyAttrs { id: string; x: string; z: string; life: string; focus: string; owner: string }
export const round2 = (n: number): number => Math.round(n * 100) / 100
export function proxyAttrs(m: ModelState, at: Vec2 = m.pos): ProxyAttrs {
  return { id: m.id, x: String(round2(at.x)), z: String(round2(at.z)), life: m.life, focus: String(m.focus), owner: m.owner }
}

// ---------- camera presets ----------
export type CameraPresetId = 'top' | 'edgeA' | 'edgeB' | 'follow'
export interface CameraPose { position: [number, number, number]; target: [number, number, number] }
/**
 * `sideA` is +1 when player A's deployment zone lies at +z (the usual south edge), -1 when at -z: the edge presets
 * look from behind that side's own zone, so player A sees its army in the foreground.
 */
export function cameraPose(preset: CameraPresetId, table: { w: number; d: number }, focus?: Vec2, sideA = 1): CameraPose {
  const span = Math.max(table.w, table.d)
  switch (preset) {
    case 'top': return { position: [0, span * 1.45, span * 0.12 * sideA], target: [0, 0, 0] }
    case 'edgeA': return { position: [0, span * 1.4, span * 0.88 * sideA], target: [0, 0, span * 0.16 * sideA] }
    case 'edgeB': return { position: [0, span * 1.4, -span * 0.88 * sideA], target: [0, 0, -span * 0.16 * sideA] }
    default: {
      const f = focus ?? { x: 0, z: 0 }
      return { position: [f.x, span * 0.5, f.z + span * 0.45], target: [f.x, 0, f.z] }
    }
  }
}
export const CAMERA_TRANSITION_MS = 450
