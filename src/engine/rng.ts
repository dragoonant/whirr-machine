// FROZEN after M0: sfc32 seeded by cyrb128 (00 §9). Pure: state in, state out; never Math.random.
import type { DiceRolled } from './events'
import type { GameState, Id, RngState, RollPurpose } from './types'

export function cyrb128(str: string): RngState {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0]
}

export function seedRng(seed: string): RngState {
  let s = cyrb128(seed)
  for (let i = 0; i < 15; i++) s = nextU32(s)[1] // warm-up
  return s
}

export function nextU32(s: RngState): [number, RngState] {
  let [a, b, c, d] = s
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0
  const t = (((a + b) | 0) + d) | 0
  d = (d + 1) | 0
  a = b ^ (b >>> 9)
  b = (c + (c << 3)) | 0
  c = (c << 21) | (c >>> 11)
  c = (c + t) | 0
  return [t >>> 0, [a >>> 0, b >>> 0, c >>> 0, d >>> 0]]
}

export function nextFloat(s: RngState): [number, RngState] {
  const [u, n] = nextU32(s)
  return [u / 4294967296, n]
}

export function rollD6(s: RngState): [number, RngState] {
  const [f, n] = nextFloat(s)
  return [1 + Math.floor(f * 6), n]
}

export function rollDice(s: RngState, count: number): [number[], RngState] {
  const out: number[] = []
  let cur = s
  for (let i = 0; i < count; i++) { const [v, n] = rollD6(cur); out.push(v); cur = n }
  return [out, cur]
}

export const d3FromD6 = (d6: number): number => Math.ceil(d6 / 2) // R1.1

export interface RollSpec { count: number; sides: 6; purpose: RollPurpose; ownerId?: Id; target?: number; flat?: number; dropLowest?: number }

// The only way the engine rolls: advances state.rng and rollSeq, returns the DiceRolled event.
export function roll(state: GameState, spec: RollSpec): { state: GameState; event: DiceRolled } {
  const [dice, rng] = rollDice(state.rng, Math.max(1, spec.count))
  const kept = [...dice].sort((x, y) => y - x).slice(0, dice.length - (spec.dropLowest ?? 0))
  const rollId = `r:${state.rollSeq + 1}`
  const total = kept.reduce((a, b) => a + b, 0) + (spec.flat ?? 0)
  const event: DiceRolled = { type: 'DiceRolled', rollId, purpose: spec.purpose, ownerId: spec.ownerId, dice, kept, total, target: spec.target }
  return { state: { ...state, rng, rollSeq: state.rollSeq + 1 }, event }
}

// Seed for out-of-engine randomness (AI, random bot): never touches state.rng.
export function deriveSeed(...parts: (string | number)[]): RngState {
  return seedRng(parts.join('|'))
}
