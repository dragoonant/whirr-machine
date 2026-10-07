// A random-legal bot that leans toward sensible play (40-ai §8 "random" tier): it always answers from legalActions,
// but weights the choice so models move toward enemies or objectives, charge and attack when they can, and rarely
// forfeit. Randomness comes from hash(seed, decisionId), never state.rng, so games replay identically.
import { loadBundle } from '../data/index'
import type { Action, Decider, GameState, ModelId, PendingDecision, PlayerView, Vec2 } from '../engine/index'
import { deriveSeed, nextFloat, query } from '../engine/index'

export interface SensibleRandomOptions {
  /** 0 = always the best-scored action, 1 = close to uniform. Default 0.35. */
  temperature?: number
}

type Rng = () => number
function rngFor(seed: string, decisionId: string): Rng {
  let s = deriveSeed(seed, decisionId, 'sensible')
  return () => { const [f, n] = nextFloat(s); s = n; return f }
}

const objectiveCache = new Map<string, Vec2[]>()
/** Scenario element positions for the game's scenario (data, not rules arithmetic). */
function objectives(state: GameState): Vec2[] {
  const key = `${state.dataVersion}|${state.setup.scenario}`
  const hit = objectiveCache.get(key)
  if (hit) return hit
  let out: Vec2[] = []
  try {
    const rec = loadBundle().byId[state.setup.scenario] as { elements?: { pos?: Vec2 }[] } | undefined
    out = (rec?.elements ?? []).map((e) => e.pos ?? { x: 0, z: 0 })
  } catch { out = [] }
  objectiveCache.set(key, out)
  return out
}

const onTable = (state: GameState, id: ModelId): boolean => {
  const m = state.models[id]
  return !!m && !m.offTable && (m.life === 'active' || m.life === 'disabled')
}
const enemies = (state: GameState, me: ModelId): ModelId[] => {
  const owner = state.models[me]?.owner
  return Object.values(state.models).filter((m) => m.owner !== owner && onTable(state, m.id)).map((m) => m.id)
}
const nearestEnemyDist = (state: GameState, me: ModelId, pos: Vec2): number => {
  let best = Infinity
  for (const e of enemies(state, me)) best = Math.min(best, query.distance(state, e, pos))
  return best
}
const nearestObjectiveDist = (state: GameState, pos: Vec2): number => {
  let best = Infinity
  for (const o of objectives(state)) best = Math.min(best, Math.hypot(o.x - pos.x, o.z - pos.z))
  return best
}

/** Higher is better. Every action passed in is already legal. */
function score(state: GameState, pending: PendingDecision, a: Action, rnd: Rng): number {
  switch (a.type) {
    case 'chooseActivation': return 1 + rnd()
    case 'endTurn': return 1
    case 'chooseMovement': {
      const w: Record<string, number> = { charge: 6, advance: 4, aim: 2, run: 1.5, standUp: 3, forfeit: 0.5, slam: 3, trample: 2 }
      return w[a.option] ?? 1
    }
    case 'castSpell': return 3
    case 'useFeat': return state.round >= 2 ? 3 : 1
    case 'heal': return 0.5
    case 'channel': return a.via === null ? 2 : 1 // cast from the caster unless a node is the point
    case 'rollAnyway': return a.roll ? 1 : 2 // the automatic hit is the safe answer
    case 'reroll': {
      // reroll a miss, keep a hit (a bot has no stake in an enemy's roll worth the code)
      const d = (pending.context.data ?? {}) as { roll?: string; hit?: boolean; points?: number }
      const own = !!pending.context.modelId && state.models[pending.context.modelId]?.owner === pending.player
      const bad = d.roll === 'damage' ? (d.points ?? 0) < (pending.context.odds?.expectedDamage ?? 0) : !d.hit
      return a.reroll === (own ? bad : !bad) ? 3 : 1
    }
    case 'chooseGrid': return 1 + rnd()
    case 'moveModel': {
      const id = a.modelId
      const end = a.path[a.path.length - 1] ?? state.models[id]?.pos
      const m = state.models[id]
      if (!m || !end) return 1
      const isLeader = m.type === 'leader'
      const dE = nearestEnemyDist(state, id, end)
      const dO = nearestObjectiveDist(state, end)
      // leaders hang back near objectives; everyone else closes on the enemy and the objectives
      const raw = isLeader ? -dO - Math.max(0, 6 - dE) * 0.8 : -Math.min(dE, dO + 2)
      return 20 + raw
    }
    case 'chargeTarget': {
      const me = pending.context.modelId
      if (!me) return 1
      const t = state.models[a.targetId]
      return 10 - query.distance(state, me, a.targetId) + (t?.type === 'leader' ? 2 : 0)
    }
    case 'placeTroopers': return 1
    case 'chooseCombatAction': {
      const w: Record<string, number> = { melee: 5, ranged: 5, dual: 5, specialAttack: 4, powerAttack: 2, specialAction: 2, standUp: 3, forfeit: 0.2 }
      return w[a.choice] ?? 1
    }
    case 'chooseAttack': {
      const opt = (pending.options ?? []).find((o) => o.action === a)
      const p = opt?.odds?.pHit ?? 0.5
      const t = state.models[a.targetId]
      return 4 + 4 * p + (t?.type === 'leader' ? 1 : 0) - (a.additional ? 0.5 : 0)
    }
    case 'powerAttack': return 3
    case 'combinedAttack': return a.contributorIds.length ? 3 : 2
    case 'endAttacks': return 0.6
    case 'boostAttack': return a.boost ? 1 + rnd() : 1 + rnd()
    case 'boostDamage': return a.boost ? 1.2 + rnd() : 1 + rnd()
    case 'powerField': return a.spend === 1 ? 2 : 1
    case 'triggerWindow': return 2
    case 'pass': return 1
    default: return 1 + rnd()
  }
}

/** The sensible random decider. Falls back to uniform choice when every score ties. */
export function createSensibleRandomDecider(seed: string, opts: SensibleRandomOptions = {}): Decider {
  const temp = Math.max(0.01, opts.temperature ?? 0.35)
  return {
    async decide(view: PlayerView, pending: PendingDecision, legal: Action[]): Promise<Action> {
      return pickSensible(view.state, pending, legal, seed, temp)
    },
  }
}

/** Synchronous core (the sim calls this directly to stay fast). */
export function pickSensible(state: GameState, pending: PendingDecision, legal: Action[], seed: string, temperature = 0.35): Action {
  if (legal.length === 0) throw new Error(`sensible random: no legal actions for ${pending.id}`)
  if (legal.length === 1) return legal[0]!
  const rnd = rngFor(seed, pending.id)
  const scores = legal.map((a) => score(state, pending, a, rnd))
  const max = Math.max(...scores)
  // softmax over scores normalised by their spread
  const spread = Math.max(1, max - Math.min(...scores))
  const w = scores.map((s) => Math.exp((s - max) / (temperature * spread)))
  const total = w.reduce((x, y) => x + y, 0)
  let r = rnd() * total
  for (let i = 0; i < legal.length; i++) { r -= w[i]!; if (r <= 0) return legal[i]! }
  return legal[legal.length - 1]!
}
