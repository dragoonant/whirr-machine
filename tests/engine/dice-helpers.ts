import { seedRng } from '../../src/engine/rng'
import type { GameState } from '../../src/engine/types'

export const mkState = (seed = 's', models: Record<string, unknown> = {}): GameState =>
  ({ seed, rng: seedRng(seed), rollSeq: 0, models } as unknown as GameState)
