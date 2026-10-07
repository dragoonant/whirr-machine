// R11.6 Ambush (10-rules-core, 11-scenarios): a model with Ambush may stay off the table at deployment and enter at the end of any
// of its controller's Control Phases after round 1, completely within 3" of a table edge other than the back edge of the opponent's
// deployment zone (units within the unit spread of each other). That turn it forfeits its Normal Movement or its Combat Action.
// Pure helpers; setup.ts offers the choice at deployment and phases/control.ts raises the arrival decision.
import type { Action, PlaceTroopersAction, Placement } from './actions'
import { ownFlag } from './code-hooks'
import { applyEffect } from './effects'
import type { GameEvent } from './events'
import { baseRadius, edgeDistance, isLegalPlacement, surfaceElevation } from './geometry'
import { raise } from './pending'
import { scenarioDef } from './scenario'
import { circleInRect, zoneRect, type Rect } from './setup'
import type { DataBundle, DecisionOption, EdgeId, GameState, ModelId, PendingDecision, PlayerId, Rejection, Vec2 } from './types'

const STRIP = 3
const EPS = 1e-6

/** Can this model start the game off the table (the Ambush rule)? */
export const canAmbush = (state: GameState, b: DataBundle, id: ModelId): boolean => ownFlag(state, b, id, 'ambush')

/** The whole units and single models that may hold back: every trooper of a unit must have Ambush. */
export function ambushGroups(state: GameState, b: DataBundle, ids: ModelId[]): ModelId[][] {
  const groups: ModelId[][] = []
  const byUnit = new Map<string, ModelId[]>()
  for (const id of ids) {
    const u = state.models[id]?.unitId
    if (u) byUnit.set(u, [...(byUnit.get(u) ?? []), id])
    else groups.push([id])
  }
  return [...groups, ...byUnit.values()].filter((g) => g.every((id) => canAmbush(state, b, id)))
}

/** Edge strips an arriving model may use: every edge except the back edge of the opponent's deployment zone. */
export function ambushStrips(state: GameState, b: DataBundle, player: PlayerId): Rect[] {
  const def = scenarioDef(b, state.scenario.id)
  const opp = state.players[player === 'A' ? 'B' : 'A'].edge
  return (['north', 'south', 'east', 'west'] as EdgeId[]).filter((e) => e !== opp).map((e) => zoneRect(def, e, STRIP))
}

const inStrips = (p: Vec2, r: number, strips: Rect[]): boolean => strips.some((z) => circleInRect(p, r, z))

/** Grid step for arrival candidates: fine enough that five 40 mm bases can zig-zag inside a 3" strip. */
const STEP = 0.25
/** How many starting spots (nearest the enemy Leader first) a unit may try before it is given up as having no room. */
const ANCHORS = 80

/** A valid arrival for every waiting group that has room, built greedily toward the enemy Leader. */
export function suggestAmbush(state: GameState, b: DataBundle, player: PlayerId): Placement[] {
  const ids = state.players[player].ambushIds.filter((id) => state.models[id]?.offTable)
  const strips = ambushStrips(state, b, player)
  const foe = state.models[state.players[player === 'A' ? 'B' : 'A'].leaderId]
  const want = foe ? foe.pos : { x: 0, z: 0 }
  const def = scenarioDef(b, state.scenario.id)
  const spread = def.deployment.unitSpread
  const out: Placement[] = []
  const extra: { pos: Vec2; r: number }[] = []
  const cands: Vec2[] = []
  const seen = new Set<string>()
  // hug both sides of each strip (a base touching its inner or outer limit) so two staggered rows fit the 3" depth
  const radii = [...new Set(ids.map((id) => baseRadius(state.models[id]!.base)))]
  const axis = (lo: number, hi: number): number[] => {
    const v: number[] = []
    for (let i = 0; lo + i * STEP <= hi + EPS; i++) v.push(lo + i * STEP)
    for (const r of radii) if (hi - lo >= 2 * r - EPS) v.push(lo + r, hi - r)
    return v
  }
  for (const z of strips) {
    for (const x of axis(z.x0, z.x1)) {
      for (const y of axis(z.z0, z.z1)) {
        const k = `${x.toFixed(3)},${y.toFixed(3)}`
        if (!seen.has(k)) { seen.add(k); cands.push({ x, z: y }) }
      }
    }
  }
  cands.sort((p, q) => Math.hypot(p.x - want.x, p.z - want.z) - Math.hypot(q.x - want.x, q.z - want.z))
  for (const g of ambushGroupsOf(state, ids)) {
    const tryFrom = (start: Vec2): Placement[] | null => {
      const done: Placement[] = []
      const mine: { pos: Vec2; r: number }[] = []
      for (const id of g) {
        const m = state.models[id]!
        const r = baseRadius(m.base)
        const legal = (p: Vec2): boolean => inStrips(p, r, strips) && isLegalPlacement(state, id, p, m.base, { extra: [...extra, ...mine] }).ok
          && done.every((o) => edgeDistance(p, m.base, o.pos, state.models[o.modelId]!.base) <= spread + EPS)
        let best: Vec2 | undefined
        if (!done.length) best = legal(start) ? start : undefined
        else {
          const anchor = done[0]!.pos
          best = cands.filter((p) => Math.hypot(p.x - anchor.x, p.z - anchor.z) <= spread + 2 * r + EPS)
            .sort((p, q) => Math.hypot(p.x - anchor.x, p.z - anchor.z) - Math.hypot(q.x - anchor.x, q.z - anchor.z))
            .find(legal)
        }
        if (!best) return null
        done.push({ modelId: id, pos: best })
        mine.push({ pos: best, r })
      }
      return done
    }
    let found: Placement[] | null = null
    if (g.length === 1) {
      const m = state.models[g[0]!]!
      const r = baseRadius(m.base)
      const best = cands.find((p) => inStrips(p, r, strips) && isLegalPlacement(state, g[0]!, p, m.base, { extra }).ok)
      if (best) found = [{ modelId: g[0]!, pos: best }]
    } else {
      // a unit: try several starting spots, nearest the enemy first (a clear stretch of edge may be the only room)
      const r0 = baseRadius(state.models[g[0]!]!.base)
      let tries = 0
      for (const start of cands) {
        if (!inStrips(start, r0, strips)) continue
        if (++tries > ANCHORS) break
        found = tryFrom(start)
        if (found) break
      }
    }
    if (found) {
      out.push(...found)
      for (const f of found) extra.push({ pos: f.pos, r: baseRadius(state.models[f.modelId]!.base) })
    }
  }
  return out
}
const ambushGroupsOf = (state: GameState, ids: ModelId[]): ModelId[][] => {
  const groups: ModelId[][] = []
  const byUnit = new Map<string, ModelId[]>()
  for (const id of ids) {
    const u = state.models[id]?.unitId
    if (u) byUnit.set(u, [...(byUnit.get(u) ?? []), id])
    else groups.push([id])
  }
  return [...groups, ...byUnit.values()]
}

/** Raise the arrival decision for this player when something waits and the round allows it, else null. */
export function raiseAmbush(state: GameState, b: DataBundle, player: PlayerId): { state: GameState; pending: PendingDecision } | null {
  if (state.round < 2) return null
  const waiting = state.players[player].ambushIds.filter((id) => state.models[id]?.offTable && state.models[id]!.life === 'active')
  if (!waiting.length) return null
  const sug = suggestAmbush(state, b, player)
  if (!sug.length) return null
  const r = raise({ ...state, window: 'control.shake' }, {
    player, kind: 'placeTroopers', window: 'control.shake', canPass: true,
    context: { data: { code: 'ambush', modelIds: waiting, strips: ambushStrips(state, b, player) } },
  })
  const id = r.pending.id
  const options: DecisionOption[] = [{ id: 'auto', label: 'Bring the ambushers in', action: { type: 'placeTroopers', decisionId: id, player, placements: sug } as Action }]
  const pending = { ...r.pending, options }
  return { state: { ...r.state, pending }, pending }
}

export function validateAmbush(state: GameState, b: DataBundle, a: PlaceTroopersAction): Rejection | null {
  const waiting = new Set(state.players[a.player].ambushIds.filter((id) => state.models[id]?.offTable))
  const strips = ambushStrips(state, b, a.player)
  const def = scenarioDef(b, state.scenario.id)
  const got = (a.placements ?? []).map((p) => p.modelId)
  if (new Set(got).size !== got.length) return { code: 'E_BAD_PAYLOAD', message: 'a model is placed twice' }
  for (const id of got) if (!waiting.has(id)) return { code: 'E_TARGET_INVALID', message: `${id} is not waiting in ambush` }
  // whole units arrive together
  for (const g of ambushGroupsOf(state, [...waiting])) {
    const n = g.filter((id) => got.includes(id)).length
    if (n !== 0 && n !== g.length) return { code: 'E_BAD_PAYLOAD', message: 'a unit arrives all at once' }
  }
  const extra: { pos: Vec2; r: number }[] = []
  for (const p of a.placements ?? []) {
    const m = state.models[p.modelId]!
    const r = baseRadius(m.base)
    if (!p.pos || !Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.z)) return { code: 'E_BAD_PAYLOAD', message: 'bad position' }
    if (!inStrips(p.pos, r, strips)) return { code: 'E_OUT_OF_ZONE', message: `${p.modelId} must be completely within ${STRIP}" of an allowed table edge` }
    const chk = isLegalPlacement(state, p.modelId, p.pos, m.base, { extra })
    if (!chk.ok) return { code: chk.code ?? 'E_PLACEMENT', message: chk.message ?? 'illegal placement' }
    extra.push({ pos: p.pos, r })
  }
  for (const g of ambushGroupsOf(state, got).filter((x) => x.length > 1)) {
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      const pa = a.placements.find((p) => p.modelId === g[i])!, pb = a.placements.find((p) => p.modelId === g[j])!
      if (edgeDistance(pa.pos, state.models[pa.modelId]!.base, pb.pos, state.models[pb.modelId]!.base) > def.deployment.unitSpread + EPS) {
        return { code: 'E_PLACEMENT', message: `${g[i]} and ${g[j]} must be within ${def.deployment.unitSpread}" of each other` }
      }
    }
  }
  return null
}

/** Put the arrivals on the table; each forfeits its Normal Movement or its Combat Action this turn. */
export function applyAmbush(state: GameState, a: PlaceTroopersAction): { state: GameState; events: GameEvent[] } {
  let s = state
  const events: GameEvent[] = []
  const ids: ModelId[] = []
  for (const p of a.placements ?? []) {
    const m = s.models[p.modelId]!
    s = { ...s, models: { ...s.models, [m.id]: { ...m, pos: p.pos, elev: surfaceElevation(s, p.pos, m.base), offTable: false } } }
    events.push({ type: 'ModelMoved', modelId: m.id, kind: 'ambush', from: m.pos, to: p.pos, path: [p.pos], distance: 0, elevAfter: s.models[m.id]!.elev } as GameEvent)
    ids.push(m.id)
  }
  if (ids.length) {
    const ps = s.players[a.player]
    s = { ...s, players: { ...s.players, [a.player]: { ...ps, ambushIds: ps.ambushIds.filter((id) => !ids.includes(id)) } } }
    const e = applyEffect(s, { sourceId: 'core.a.ambush', name: 'Ambush entry', owner: a.player, targetIds: ids, mods: [], forbid: ['moveOrAct'], duration: 'turn' })
    s = e.state; events.push(...e.events)
  }
  return { state: s, events }
}

