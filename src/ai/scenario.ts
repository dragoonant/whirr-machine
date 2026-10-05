// Scenario value of a position (40-ai §2 wS term). Control itself is the engine's (query.control on a hypothetical
// state); the shaped part rewards being one of the two models a hold needs and contesting the enemy's holds.
import type { GameState, ModelState, PlayerId, Vec2 } from '../engine/index'
import { query } from '../engine/index'
import { distToElement, elementsOf, live, other, withPos } from './world'

/** Score of the whole board for `p` from element counts (shaped), in VP-like units. */
export function shapedScenario(s: GameState, p: PlayerId): number {
  let score = 0
  for (const el of elementsOf(s)) {
    let mine = 0, theirs = 0
    for (const m of Object.values(s.models)) {
      if (!live(m) || m.inert) continue
      const d = distToElement(el, m.pos, m.base)
      if (m.owner === p && d <= el.within - 0.05) mine++
      else if (m.owner !== p && d <= el.contestWithin + 0.05) theirs++
    }
    if (theirs === 0) score += el.vp * (mine >= el.models ? 1 : mine > 0 ? 0.35 : 0)
    else {
      if (mine > 0) score += 0.45 * el.vp // contesting denies their point
      if (mine >= el.models) score += 0.1
      if (theirs >= el.models && mine === 0) score -= el.vp * 0.9
      else if (mine === 0) score -= el.vp * 0.3
    }
  }
  return score
}

/** VP swing of the engine's control check if `m` stood at `pos` (our VP minus theirs, this scoring point). */
export function controlSwing(s: GameState, m: ModelState, pos: Vec2): number {
  const hs = withPos(s, m.id, pos)
  const rep = query.control(hs)
  const me = m.owner
  let v = 0
  for (const e of Object.values(rep.elements)) { if (e.controller === me) v += 1; else if (e.controller === other(me)) v -= 1 }
  if (rep.killBox[me] && m.type === 'leader') v -= 3
  return v
}

/** Scenario value of `m` at `pos`: engine control swing plus the shaped term. */
export function scenarioValue(s: GameState, m: ModelState, pos: Vec2): number {
  const hs = withPos(s, m.id, pos)
  return controlSwing(s, m, pos) * 0.6 + shapedScenario(hs, m.owner)
}

/** Distance from a point to the nearest element we do not yet hold (for progress when nothing else scores). */
export function nearestOpenElement(s: GameState, p: PlayerId, pos: Vec2, mm: number): number {
  const rep = query.control(s)
  let best = Infinity
  for (const el of elementsOf(s)) {
    if (rep.elements[el.id]?.controller === p) continue
    best = Math.min(best, distToElement(el, pos, mm))
  }
  return Number.isFinite(best) ? best : 0
}
