// What the HUD says about scenario elements (91 B): names, owners, tokens and removal, from the scenario data and the
// presented state. Pure: the engine decides control (query.control), this only words it.
import type { GameState, Id, PlayerId, Vec2 } from '../../../engine/index'
import { elementOwner } from '../../../engine/scenario'
import { useGameStore } from '../../store/gameStore'
import { zoneRect } from '../../../engine/setup'
import { elementDefs, killBoxViews, type ElementDef, type KillBoxView } from '../../board/layout'

const KIND_WORD: Record<ElementDef['kind'], string> = {
  objective50: '50 mm objective', objective40: '40 mm objective', flag: 'Flag terrain', cache: 'Cache', scenarioTerrain: 'Terrain', zone: 'Zone',
}
const SHORT_WORD: Record<ElementDef['kind'], string> = { objective50: '50 mm', objective40: '40 mm', flag: 'Flag', cache: 'Cache', scenarioTerrain: 'Terrain', zone: 'Zone' }

export interface ElementInfo {
  id: Id
  kind: ElementDef['kind']
  /** "Your 50 mm objective", "Their cache", "Flag terrain 2" */
  label: string
  /** The same, short enough for a chip: "Your 50 mm", "Their cache" */
  short: string
  owner: PlayerId | null
  /** Countdown or race tokens on it (High Stakes, Wolves), else null. */
  tokens: number | null
  /** Claimed, delivered or otherwise gone from the table. */
  removed: boolean
}

/** Every element of the scenario, named from `human`'s side. Elements of the same kind and owner are numbered. */
export function elementInfos(state: GameState | null, human: PlayerId = 'A'): ElementInfo[] {
  if (!state) return []
  const defs = elementDefs(state).filter((d) => d.kind !== 'zone')
  const key = (d: ElementDef): string => `${d.kind}:${elementOwner(state, d) ?? '-'}`
  const total = new Map<string, number>()
  for (const d of defs) total.set(key(d), (total.get(key(d)) ?? 0) + 1)
  const seen = new Map<string, number>()
  return defs.map((d) => {
    const owner = elementOwner(state, d)
    const n = (seen.get(key(d)) ?? 0) + 1
    seen.set(key(d), n)
    const num = (total.get(key(d)) ?? 1) > 1 ? ` ${n}` : ''
    const who = owner === null ? '' : owner === human ? 'Your ' : 'Their '
    const rt = state.scenario.elementState?.[d.id]
    const word = (w: string): string => (who ? who + w.charAt(0).toLowerCase() + w.slice(1) : w)
    return {
      id: d.id, kind: d.kind, owner,
      label: word(KIND_WORD[d.kind]) + num,
      short: word(SHORT_WORD[d.kind]) + num,
      tokens: typeof rt?.tokens === 'number' ? rt.tokens : null,
      removed: !!rt?.removed,
    }
  })
}

/** One element's label (falls back to the id). */
export function elementLabel(state: GameState | null, id: Id, human: PlayerId = 'A'): string {
  return elementInfos(state, human).find((e) => e.id === id)?.label ?? id
}

/** The Kill Box depth now: the engine's running value when the scenario grows it (Wolves at Our Heels), else null (the data depth applies). */
export const killBoxDepthNow = (state: GameState | null): number | null => state?.scenario.killBoxDepth ?? null

/**
 * The Kill Box strips as the board draws them: `killBoxViews` at the scenario's own depth, redrawn at the running depth when the scenario
 * grows it round by round (Wolves at Our Heels, 91 B.3). The engine's `killBoxDepth` is the number; this only moves the line.
 */
export function killBoxViewsNow(state: GameState | null): KillBoxView[] {
  const base = killBoxViews(state)
  const depth = killBoxDepthNow(state)
  if (!state || depth === null) return base
  return base.map((v) => {
    const edge = state.players[v.player].edge
    if (!edge) return v
    const rect = zoneRect({ table: state.scenario.table }, edge, depth)
    const line: [Vec2, Vec2] = edge === 'north' ? [{ x: rect.x0, z: rect.z1 }, { x: rect.x1, z: rect.z1 }]
      : edge === 'south' ? [{ x: rect.x0, z: rect.z0 }, { x: rect.x1, z: rect.z0 }]
      : edge === 'west' ? [{ x: rect.x1, z: rect.z0 }, { x: rect.x1, z: rect.z1 }]
      : [{ x: rect.x0, z: rect.z0 }, { x: rect.x0, z: rect.z1 }]
    return { ...v, rect, line }
  })
}

/** The side the person at the screen plays (A unless only B is human). */
export function humanSide(): PlayerId {
  const c = useGameStore.getState().controllers
  return c.A === 'bot' && c.B === 'human' ? 'B' : 'A'
}
