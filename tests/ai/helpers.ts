// Shared helpers for the AI tests: play a game forward with the sensible random bot, and stage positions.
import { loadBundle } from '../../src/data/index'
import { pickSensible } from '../../src/ai/random'
import { createGame, legalActions, step, type GameSetup, type GameState, type ModelState, type PlayerId, type Vec2 } from '../../src/engine/index'

export const bundle = loadBundle()
export const ASH = (swap = false): GameSetup => ({ scenario: 'scn-ashwall-divide', lists: swap ? { A: 'kha.l.qs-recon', B: 'cyg.l.qs-recon' } : { A: 'cyg.l.qs-recon', B: 'kha.l.qs-recon' } })

/** Play with the sensible random bot until `pred` holds (or the game ends). */
export function playUntil(setup: GameSetup, seed: string, pred: (s: GameState) => boolean, cap = 3000): GameState {
  let s = createGame(setup, seed, bundle).state
  for (let i = 0; i < cap && s.pending.kind !== 'gameOver' && !pred(s); i++) {
    const legal = legalActions(s)
    s = step(s, pickSensible(s, s.pending, legal, `${seed}:${s.pending.player}`)).state
  }
  return s
}

/** Forward direction (from `p`'s edge toward the enemy). */
export function fwd(s: GameState, p: PlayerId): Vec2 {
  switch (s.players[p].edge) {
    case 'north': return { x: 0, z: 1 }
    case 'south': return { x: 0, z: -1 }
    case 'west': return { x: 1, z: 0 }
    default: return { x: -1, z: 0 }
  }
}

/** A copy of the state with models moved and patched (planning scenes; positions must not overlap). */
export function stage(s: GameState, moves: Record<string, Partial<ModelState> & { pos?: Vec2 }>): GameState {
  const models = { ...s.models }
  for (const [id, patch] of Object.entries(moves)) models[id] = { ...models[id]!, ...patch }
  return { ...s, models }
}

/** Park every model not named in `keep` along its own back edge, 3" apart (out of the way of a staged scene). */
export function parkOthers(s: GameState, keep: string[]): Record<string, { pos: Vec2 }> {
  const out: Record<string, { pos: Vec2 }> = {}
  const idx: Record<PlayerId, number> = { A: 0, B: 0 }
  for (const m of Object.values(s.models)) {
    if (keep.includes(m.id) || m.offTable || m.life !== 'active') continue
    const f = fwd(s, m.owner)
    const i = idx[m.owner]++
    const lat = -15 + i * 3
    out[m.id] = { pos: f.z !== 0 ? { x: lat, z: -f.z * 16.5 } : { x: -f.x * 16.5, z: lat } }
  }
  return out
}

/** Point `d` inches from `p` along `dir`. */
export const along = (p: Vec2, dir: Vec2, d: number): Vec2 => ({ x: p.x + dir.x * d, z: p.z + dir.z * d })
