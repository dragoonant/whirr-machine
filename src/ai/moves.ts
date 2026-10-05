// Move-candidate sampler (40-ai §2): stay; rings at 50% and 100% of the allowed distance x 16 angles; points toward
// each scenario element, toward each enemy (melee contact and edge of ranged range) and away from the threat.
// Candidates are filtered by the engine (validate on the open moveModel decision, or query.moveCheck for an advance).
import type { Action, GameState, ModelState, Vec2 } from '../engine/index'
import { query, validate } from '../engine/index'
import { baseRadius, dist, elementsOf, enemiesOf, halfTable, rangedWeapons } from './world'

export interface MoveCand { pos: Vec2; tag: string }

const clampTable = (s: GameState, p: Vec2, r: number): Vec2 => {
  const { hw, hd } = halfTable(s)
  return { x: Math.max(-hw + r + 0.01, Math.min(hw - r - 0.01, p.x)), z: Math.max(-hd + r + 0.01, Math.min(hd - r - 0.01, p.z)) }
}
const toward = (from: Vec2, to: Vec2, d: number): Vec2 => {
  const l = dist(from, to)
  if (l < 1e-6) return { ...from }
  const t = Math.min(d, l) / l
  return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t }
}

/** Raw candidate end points for `m` moving up to `maxDist` (not yet validated). */
export function rawCandidates(s: GameState, m: ModelState, maxDist: number, samples = 48): MoveCand[] {
  const r = baseRadius(m.base)
  const out: MoveCand[] = [{ pos: { ...m.pos }, tag: 'stay' }]
  const angles = samples >= 40 ? 16 : 8
  for (const f of [0.5, 1]) for (let i = 0; i < angles; i++) {
    const a = (i / angles) * Math.PI * 2 + (f === 0.5 ? Math.PI / angles : 0)
    out.push({ pos: { x: m.pos.x + Math.cos(a) * maxDist * f * 0.995, z: m.pos.z + Math.sin(a) * maxDist * f * 0.995 }, tag: `ring${f}` })
  }
  for (const el of elementsOf(s)) {
    // stand just next to the element (within its hold distance), on our side and on the near side
    const d = dist(m.pos, el.pos)
    out.push({ pos: toward(m.pos, el.pos, Math.max(0, d - (el.within + r) * 0.7)), tag: `el:${el.id}` })
    for (const side of [-1, 1]) out.push({ pos: { x: el.pos.x + side * 1.6, z: el.pos.z + (m.pos.z > el.pos.z ? 1 : -1) * (0.9 + r) }, tag: `el:${el.id}:${side}` })
  }
  const rng = Math.max(0, ...rangedWeapons(m).map((w) => w.rng))
  for (const e of enemiesOf(s, m.owner)) {
    const d = dist(m.pos, e.pos)
    const contact = r + baseRadius(e.base) + 0.3
    out.push({ pos: toward(m.pos, e.pos, Math.max(0, d - contact)), tag: `melee:${e.id}` })
    if (rng > 0) out.push({ pos: toward(m.pos, e.pos, Math.max(0, d - (rng + r + baseRadius(e.base) - 0.4))), tag: `range:${e.id}` })
  }
  // back off from the nearest enemy
  const near = enemiesOf(s, m.owner).sort((a, b) => dist(a.pos, m.pos) - dist(b.pos, m.pos))[0]
  if (near) {
    const d = dist(m.pos, near.pos) || 1
    out.push({ pos: { x: m.pos.x - ((near.pos.x - m.pos.x) / d) * maxDist * 0.99, z: m.pos.z - ((near.pos.z - m.pos.z) / d) * maxDist * 0.99 }, tag: 'back' })
  }
  // keep within the allowed distance and on the table, drop near-duplicates
  const kept: MoveCand[] = []
  for (const c of out) {
    let p = c.pos
    const l = dist(m.pos, p)
    if (l > maxDist * 0.995) p = toward(m.pos, p, maxDist * 0.995)
    p = clampTable(s, p, r)
    if (kept.some((k) => dist(k.pos, p) < 0.3)) continue
    kept.push({ pos: p, tag: c.tag })
  }
  return kept
}

/** Candidates accepted by the open moveModel decision (exact: validate). */
export function legalMoveCandidates(s: GameState, m: ModelState, maxDist: number, samples = 48): MoveCand[] {
  const pd = s.pending
  const out: MoveCand[] = []
  for (const c of rawCandidates(s, m, maxDist, samples)) {
    const a = { type: 'moveModel', decisionId: pd.id, player: pd.player, modelId: m.id, path: [c.pos] } as Action
    if (validate(s, a) === null) out.push(c)
  }
  return out
}

/** Candidates for an advance, checked with query.moveCheck (planning, before the move decision is open). */
export function advanceCandidates(s: GameState, m: ModelState, maxDist: number, samples = 48): MoveCand[] {
  const out: MoveCand[] = []
  for (const c of rawCandidates(s, m, maxDist, samples)) {
    if (dist(c.pos, m.pos) < 1e-6) { out.push(c); continue }
    const chk = query.moveCheck(s, m.id, [c.pos])
    if (chk.ok) out.push(c)
  }
  return out
}
