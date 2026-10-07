// M13 (91 B): Steamroller 2026 scenario rules on top of scenario.ts. The vocabulary types and the function names are the WP1 contract;
// the bodies are WP3's. The JSON shapes are in 20-data-schema section 7 and scenario.schema.json.
//   reads        scenarioRules, elementPos, nearScenarioElement, scenarioCover (Earthworks)
//   setup        applyAttackerFrame (SR5), flag terrain picks (SR10), initScenarioRuntime (fuse tokens)
//   turn start   scenarioTurnStart (the Kill Box grows, Wolves at Our Heels)
//   caches       scenarioSpecialActions, resolveScenarioSpecialAction (SR11)
//   scoring      scoreTurnEnd and answerScoringDecision: a resumable step machine (fuse, score, Kill Box, lead-by-N, heel tokens, Payload, race)
//   helpers      scoreOpponentAlone (the clock), moveElementToward (objective movement, SR p3)
import type { AbilityChoiceAction, Action, ChooseCombatActionAction, MoveModelAction } from './actions'
import { applyDamage, resolveDeath } from './damage'
import { rollD3, rollNd6 } from './dice'
import { otherPlayer, profileOf } from './effects'
import type { GameEvent } from './events'
import { baseRadius, dist, isLegalPlacement, isOnTable } from './geometry'
import { lookups, resistsDamageType } from './code-hooks'
import { relocate, movedEvent } from './movement'
import { raiseGameOver, raiseWith, reject, type FlowOut, type FlowResult } from './pending'
import {
  afterDeaths, computeControl, contesters, elementGeom, elementOwner, elementRadius, endGame, endOfTurnScoring, finalResult, gainsFor, inKillBox, isFirst, killBoxActive,
  reaches, readScenarioRules, scenarioDef, scoringActive, usesScenarioRules, type ElementDef, type ScenarioDef,
} from './scenario'
import { circleOverlapsShape, distToShape, terrainPieces, worldShape } from './terrain'
import type { DamageType, DataBundle, DecisionOption, GameState, Id, ModelId, ModelState, PendingDecision, PlayerId, TerrainInstance, Vec2 } from './types'

// ---------- vocabulary (91 B.3), as read from scenario data ----------
export type ElementKind = 'objective50' | 'objective40' | 'flag' | 'scenarioTerrain' | 'zone' | 'cache'
/** `kinds` uses `flag` for "the scenario terrain chosen by that flag". `owner`: any (default), own / opponent = the colour of the scoring player, neutral = no owner. */
export interface ElementSelect { kinds: ElementKind[]; owner?: 'any' | 'own' | 'opponent' | 'neutral' }
export type ScoringRule =
  | { kind: 'control'; select: ElementSelect; vp: number }
  | { kind: 'countBonus'; select: ElementSelect; atLeast: number; vp: number }
  | { kind: 'zeroTokenBonus'; select: ElementSelect; vp: number }
  | { kind: 'cache'; vp: number }
  | { kind: 'tokenRace'; vp: number; third?: number }
  | { kind: 'delivered'; vp: number }
export type SpecialRule =
  | { kind: 'earthworks'; within: number; bases: number[]; warriorOnly?: boolean; of: ElementKind[] }
  | { kind: 'killBoxGrowth'; fromRound: number; fromPlayer: 'first' | 'second'; step: number }
  | { kind: 'heelTokens'; on: ElementKind; toward: ElementKind; move: number }
  | { kind: 'fuse'; tokens: number; on: string[]; d3: string[]; blast: { pow: number; damageType?: string; within: number } }
  | { kind: 'payload'; move: number; perOther: number; toward: string; haul: number }
/** The scenario's SR extras with defaults filled: `rules` empty = the plain per-element `vp.control` scoring of S1. */
export interface ScenarioRulesDef {
  frame: 'attacker' | null
  rules: ScoringRule[]
  special: SpecialRule[]
  setup: { flagRadius: number; flagPickOrder: 'attackerFirst' }
}
/** The `abilityChoice` codes scoring and setup decisions use (91 D.1): flagTerrain, fuse, heelToken, heelMove, payload. */
export type ScenarioChoiceCode = 'flagTerrain' | 'fuse' | 'heelToken' | 'heelMove' | 'payload'
/** The cache claim is a `chooseCombatAction` special action with this ability id and the cache in `elementId` (SR11). */
export const CLAIM_CACHE_ABILITY = 'scn.claimCache'

const EPS = 1e-6
const nz = (v: number): number => (v === 0 ? 0 : v) // no negative zero in positions
const find = <K extends SpecialRule['kind']>(rd: ScenarioRulesDef, kind: K): Extract<SpecialRule, { kind: K }> | undefined =>
  rd.special.find((s) => s.kind === kind) as Extract<SpecialRule, { kind: K }> | undefined
const ruleOf = <K extends ScoringRule['kind']>(rd: ScenarioRulesDef, kind: K): Extract<ScoringRule, { kind: K }> | undefined =>
  rd.rules.find((s) => s.kind === kind) as Extract<ScoringRule, { kind: K }> | undefined
const unchanged = (state: GameState, events: GameEvent[] = []): FlowOut => ({ state, events, pending: state.pending })

// ---------- reads (pure; the client never computes these, it calls query.control) ----------
export function scenarioRules(b: DataBundle, scenarioId: Id): ScenarioRulesDef { return readScenarioRules(b, scenarioId) }

/** Where an element is now: `elementState[id].pos` (after the frame rotation, Wolves and Payload moves) else the scenario data position; null when removed. */
export function elementPos(state: GameState, b: DataBundle, elementId: Id): Vec2 | null {
  const el = scenarioDef(b, state.scenario.id).elements.find((e) => e.id === elementId)
  if (!el) return null
  const g = elementGeom(state, el)
  return g.present ? g.pos : null
}

/**
 * The near-element test of 91 A.2: the model's base is inside the area of an area scenario-terrain piece, or within 3 inches of any other
 * scenario element (an objective, a flag-obstruction, a cache, an impassable scenario piece). Cards read it live.
 */
export function nearScenarioElement(state: GameState, b: DataBundle, modelId: ModelId): boolean {
  const m = state.models[modelId]
  if (!m || !isOnTable(m)) return false
  const def = scenarioDef(b, state.scenario.id)
  const r = baseRadius(m.base)
  for (const el of def.elements) {
    if (el.kind === 'zone') continue
    const g = elementGeom(state, el)
    if (!g.present) continue
    if (g.shape && g.area) { if (circleOverlapsShape(m.pos, r, g.shape)) return true; continue } // area scenario terrain: inside only
    const d = g.shape ? distToShape(m.pos, g.shape) - r : dist(m.pos, g.pos) - g.r - r
    if (d <= 3 + EPS) return true
  }
  return false
}

// same reading of warrior as the command cards (cards.ts, WP2): a trooper or a solo; Leaders and Cohort models are not
const isWarrior = (_b: DataBundle, m: ModelState): boolean => ['trooper', 'solo', 'unit'].includes(m.type)

/**
 * Earthworks (Trench Warfare): cover and Resistance: Blast for small and medium warrior models within 3 inches of their own player's 40 or 50 mm
 * objective. The cover hook (`hasGrantedCover`) and the blast resistance (`resistsDamageType`) each call this with one line.
 */
export function scenarioCover(state: GameState, b: DataBundle, modelId: ModelId): { cover: boolean; resistBlast: boolean } {
  const none = { cover: false, resistBlast: false }
  const rd = scenarioRules(b, state.scenario.id)
  const ew = find(rd, 'earthworks')
  const m = state.models[modelId]
  if (!ew || !m || !isOnTable(m) || !ew.bases.includes(m.base)) return none
  if (ew.warriorOnly !== false && !isWarrior(b, m)) return none
  for (const el of scenarioDef(b, state.scenario.id).elements) {
    if (!(ew.of as string[]).includes(el.kind) || elementOwner(state, el) !== m.owner) continue
    const g = elementGeom(state, el)
    if (g.present && dist(m.pos, g.pos) - g.r - baseRadius(m.base) <= ew.within + EPS) return { cover: true, resistBlast: true }
  }
  return none
}

// ---------- runtime set-up and turn start ----------
/** Game creation: the countdown tokens of a fuse scenario (High Stakes puts 5 on each flag's terrain and on the 50). Absent for every other scenario. */
export function initScenarioRuntime(state: GameState, b: DataBundle): GameState {
  const fuse = find(scenarioRules(b, state.scenario.id), 'fuse')
  if (!fuse) return state
  const es = { ...(state.scenario.elementState ?? {}) }
  for (const el of scenarioDef(b, state.scenario.id).elements) if (fuse.on.includes(el.kind)) es[el.id] = { ...es[el.id], tokens: fuse.tokens }
  return { ...state, scenario: { ...state.scenario, elementState: es } }
}

/** Start of a turn (called by turnflow.beginTurn): Wolves at Our Heels grows the Kill Box at the start of each Attacker turn from round 3. */
export function scenarioTurnStart(state: GameState, b: DataBundle): { state: GameState; events: GameEvent[] } {
  const grow = find(scenarioRules(b, state.scenario.id), 'killBoxGrowth')
  const kb = scenarioDef(b, state.scenario.id).killBox
  if (!grow || !kb || !state.firstPlayer) return { state, events: [] }
  const who = grow.fromPlayer === 'first' ? state.firstPlayer : otherPlayer(state.firstPlayer)
  if (state.activePlayer !== who || state.round < grow.fromRound) return { state, events: [] }
  const depth = kb.depth + grow.step * (state.round - grow.fromRound + 1)
  if (state.scenario.killBoxDepth === depth) return { state, events: [] }
  return { state: { ...state, scenario: { ...state.scenario, killBoxDepth: depth } }, events: [{ type: 'KillBoxExtended', depth }] }
}

// ---------- setup (91 B.1 SR5, SR10) ----------
/**
 * After `chooseEdge`: rotate every element about the origin so the attacker frame matches the real edges and write the result into
 * `elementState[id].pos`. The Attacker on the north edge (-z) keeps the data as authored; on the south edge the frame turns 180 degrees; on
 * the west or east edge it turns a quarter. Terrain does not rotate.
 */
export function applyAttackerFrame(state: GameState, b: DataBundle): GameState {
  const rd = scenarioRules(b, state.scenario.id)
  if (rd.frame !== 'attacker' || !state.firstPlayer) return state
  const edge = state.players[state.firstPlayer].edge
  if (!edge) return state
  const rot = (p: Vec2): Vec2 =>
    edge === 'north' ? { x: nz(p.x), z: nz(p.z) }
      : edge === 'south' ? { x: nz(-p.x), z: nz(-p.z) }
        : edge === 'west' ? { x: nz(p.z), z: nz(-p.x) }
          : { x: nz(-p.z), z: nz(p.x) }
  const es = { ...(state.scenario.elementState ?? {}) }
  for (const el of scenarioDef(b, state.scenario.id).elements) es[el.id] = { ...es[el.id], pos: rot(el.pos) }
  return { ...state, scenario: { ...state.scenario, elementState: es } }
}

const flagsOf = (def: ScenarioDef): ElementDef[] => def.elements.filter((e) => e.kind === 'flag')
const flagResolved = (state: GameState, el: ElementDef): boolean => state.scenario.elementState?.[el.id]?.terrainId !== undefined
/** Terrain pieces within the flag radius of the flag that no other flag has taken. */
function flagCandidates(state: GameState, el: ElementDef, rd: ScenarioRulesDef): TerrainInstance[] {
  const g = elementGeom(state, el)
  const taken = new Set(Object.values(state.scenario.elementState ?? {}).map((r) => r.terrainId).filter((x): x is string => !!x))
  return state.terrain
    .filter((t) => !taken.has(t.id) && distToShape(g.pos, worldShape(t)) - g.r <= rd.setup.flagRadius + EPS)
    .sort((x, y) => x.id.localeCompare(y.id))
}
const setTerrainId = (state: GameState, flagId: Id, terrainId: Id | null): GameState =>
  ({ ...state, scenario: { ...state.scenario, elementState: { ...(state.scenario.elementState ?? {}), [flagId]: { ...state.scenario.elementState?.[flagId], terrainId } } } })

/** True while a `flagTerrain` pick is open. */
export const isFlagPick = (state: GameState): boolean => state.pending.kind === 'abilityChoice' && state.pending.context.data?.code === 'flagTerrain'

/**
 * Flag terrain picks before deployment, Attacker first, alternating (a player with nothing to pick is skipped). A flag with no terrain piece
 * within 5" turns into the flag-obstruction and needs no pick (it is settled on the way, with its event). `pending` is null when every flag
 * has settled; `state` carries the auto-settled flags even then.
 */
export function flagPickStep(state: GameState, b: DataBundle): { state: GameState; events: GameEvent[]; pending: PendingDecision | null } {
  const def = scenarioDef(b, state.scenario.id)
  const rd = scenarioRules(b, state.scenario.id)
  let s = state
  const events: GameEvent[] = []
  const flags = flagsOf(def)
  for (let guard = 0; guard < 40 && flags.length > 0; guard++) {
    const open = flags.filter((el) => !flagResolved(s, el))
    if (open.length === 0) break
    const first = s.firstPlayer ?? 'A'
    const order = [first, otherPlayer(first)]
    const eligible = (p: PlayerId): ElementDef[] => open.filter((el) => { const o = elementOwner(s, el); return o === null || o === p })
    let picker = order[(flags.length - open.length) % 2]!
    if (eligible(picker).length === 0) picker = otherPlayer(picker)
    const mine = eligible(picker)
    const settle = (el: ElementDef): void => {
      s = setTerrainId(s, el.id, null)
      events.push({ type: 'FlagTerrainChosen', player: elementOwner(s, el) ?? picker, flagId: el.id, terrainId: null })
    }
    if (mine.length === 0) { settle(open[0]!); continue } // nobody can pick it: the flag stays an obstruction
    const bare = mine.find((el) => flagCandidates(s, el, rd).length === 0)
    if (bare) { settle(bare); continue }
    const choices = mine.map((el) => ({ el, pieces: flagCandidates(s, el, rd) }))
    const base: GameState = { ...s, phase: 'deploy', window: 'turn.start', activePlayer: picker }
    const r = raiseWith(base, {
      player: picker, kind: 'abilityChoice', window: 'turn.start', canPass: false,
      context: { data: { code: 'flagTerrain', flags: Object.fromEntries(choices.map((c) => [c.el.id, c.pieces.map((t) => t.id)])) } },
    }, (id) => choices.flatMap((c) => c.pieces.map((t): DecisionOption => ({
      id: `${c.el.id}|${t.id}`, label: `Flag ${c.el.id}: use the ${String(t.rulesType)} piece ${t.id}`,
      action: { type: 'abilityChoice', decisionId: id, player: picker, optionId: `${c.el.id}|${t.id}` } as Action,
    }))))
    return { state: r.state, events, pending: r.pending }
  }
  return { state: s, events, pending: null }
}
/** Flag terrain picks before deployment: the next pick to raise, or null when every flag has chosen (the flag-obstruction fallback needs no pick). */
export function nextFlagPick(state: GameState, b: DataBundle): FlowResult | null {
  const r = flagPickStep(state, b)
  return r.pending ? { state: r.state, events: r.events, pending: r.pending } : null
}
/** Answer a `flagTerrain` choice: emits `FlagTerrainChosen`, writes `elementState[flag].terrainId`. The pending is left as it was; the caller carries on to the next pick. */
export function answerFlagPick(state: GameState, b: DataBundle, a: AbilityChoiceAction): FlowResult {
  void b
  if (!isFlagPick(state)) return reject('E_WRONG_DECISION', 'no flag terrain pick is open')
  const opt = (state.pending.options ?? []).find((o) => o.id === a.optionId)
  if (!opt) return reject('E_NOT_AN_OPTION', `${a.optionId} is not one of the offered pieces`)
  const [flagId, pieceId] = a.optionId.split('|') as [string, string]
  return unchanged(setTerrainId(state, flagId, pieceId), [{ type: 'FlagTerrainChosen', player: a.player, flagId, terrainId: pieceId }])
}

// ---------- caches (91 B.1 SR11) ----------
/**
 * `chooseCombatAction` options for claiming caches: one per (cache, claimer) with a friendly model within 3 inches of an opponent's cache
 * nobody contests. Empty outside scoring turns. The action's `decisionId` is the open decision's: a caller that raises a new decision restamps it.
 */
export function scenarioSpecialActions(state: GameState, b: DataBundle, modelId: ModelId): DecisionOption[] {
  const m = state.models[modelId]
  if (!m || !isOnTable(m) || m.conditions.includes('knockedDown') || m.conditions.includes('stationary')) return []
  const def = scenarioDef(b, state.scenario.id)
  if (!def.elements.some((e) => e.kind === 'cache') || !scoringActive(state, def)) return []
  const out: DecisionOption[] = []
  for (const el of def.elements) {
    if (el.kind !== 'cache' || elementOwner(state, el) !== otherPlayer(m.owner)) continue
    const g = elementGeom(state, el)
    if (!g.present || dist(m.pos, g.pos) - g.r - baseRadius(m.base) > el.hold.within + EPS) continue
    if (contesters(state, el, otherPlayer(m.owner)).length > 0) continue
    out.push({
      id: `claim:${el.id}:${modelId}`, label: `Claim the cache (${el.id})`,
      action: { type: 'chooseCombatAction', decisionId: state.pending.id, player: m.owner, modelId, choice: 'specialAction', abilityId: CLAIM_CACHE_ABILITY, elementId: el.id },
    })
  }
  return out
}
/**
 * Apply a claim: remove the cache (`CacheClaimed`, `ElementRemoved`) and record it in `cachesClaimed` so this turn's scoring banks the VP.
 * The pending is left as it was: the caller (activation.ts) forfeits the model's Combat Action and raises what comes next.
 */
export function resolveScenarioSpecialAction(state: GameState, b: DataBundle, a: ChooseCombatActionAction): FlowResult {
  if (a.abilityId !== CLAIM_CACHE_ABILITY || !a.elementId) return reject('E_NOT_AN_OPTION', 'not a cache claim')
  const m = state.models[a.modelId]
  if (!m) return reject('E_TARGET_INVALID', `no model ${a.modelId}`)
  if (!scenarioSpecialActions(state, b, a.modelId).some((o) => o.id === `claim:${a.elementId}:${a.modelId}`)) return reject('E_NOT_AN_OPTION', 'that cache cannot be claimed now')
  const sc = state.scenario
  const next: GameState = {
    ...state,
    scenario: {
      ...sc,
      elementState: { ...(sc.elementState ?? {}), [a.elementId]: { ...sc.elementState?.[a.elementId], removed: true } },
      cachesClaimed: [...(sc.cachesClaimed ?? []), { player: m.owner, elementId: a.elementId, turn: state.turn }],
    },
  }
  return unchanged(next, [{ type: 'CacheClaimed', player: m.owner, elementId: a.elementId, modelId: a.modelId }, { type: 'ElementRemoved', elementId: a.elementId, reason: 'claimed' }])
}

// ---------- objective movement (91 B.3, SR p3) ----------
/**
 * Move an element up to `maxDist` straight toward a point (never past it). It ignores models, obstacles, obstructions and terrain it can move
 * completely past; if the full move would end on one it stops short of it. It never leaves the table. Emits `ElementMoved`.
 */
export function moveElementToward(state: GameState, b: DataBundle, elementId: Id, target: Vec2, maxDist: number, by: PlayerId): { state: GameState; events: GameEvent[] } {
  const el = scenarioDef(b, state.scenario.id).elements.find((e) => e.id === elementId)
  const g = el ? elementGeom(state, el) : null
  if (!el || !g || !g.present) return { state, events: [] }
  const total = dist(g.pos, target)
  const d = Math.min(maxDist, total)
  if (d < 0.01) return { state, events: [] }
  const u = { x: (target.x - g.pos.x) / total, z: (target.z - g.pos.z) / total }
  const r = elementRadius(el.kind)
  const at = (k: number): Vec2 => ({ x: g.pos.x + u.x * k, z: g.pos.z + u.z * k })
  const hw = state.scenario.table.w / 2, hd = state.scenario.table.d / 2
  const solids = Object.values(state.models).filter((m) => isOnTable(m)).map((m) => ({ pos: m.pos, r: baseRadius(m.base) }))
  const pieces = terrainPieces(state).filter((p) => p.traits.move !== 'none')
  const overlapsAt = (k: number): Set<string> => {
    const p = at(k)
    const out = new Set<string>()
    if (Math.abs(p.x) + r > hw + EPS || Math.abs(p.z) + r > hd + EPS) out.add('edge')
    solids.forEach((s, i) => { if (dist(p, s.pos) < r + s.r - EPS) out.add(`m${i}`) })
    pieces.forEach((pc) => { if (circleOverlapsShape(p, r, pc.shape)) out.add(pc.t.id) })
    return out
  }
  const start = overlapsAt(0) // whatever already touches it at the start does not stop it (a base standing against the objective)
  const blocked = (k: number): boolean => { for (const x of overlapsAt(k)) if (!start.has(x)) return true; return false }
  let k = d
  if (blocked(k)) { while (k > 0 && blocked(k)) k -= 0.05; k = Math.max(0, k) }
  if (k < 0.01) return { state, events: [] }
  const to = at(k)
  const next: GameState = { ...state, scenario: { ...state.scenario, elementState: { ...(state.scenario.elementState ?? {}), [elementId]: { ...state.scenario.elementState?.[elementId], pos: to } } } }
  return { state: next, events: [{ type: 'ElementMoved', elementId, from: g.pos, to, by }] }
}

// ---------- scoring: pieces ----------
/** One unboostable damage roll that is not an attack, typed (the fuse blast). */
function typedBlast(state: GameState, b: DataBundle, id: ModelId, pow: number, types: DamageType[]): { state: GameState; events: GameEvent[] } {
  if (resistsDamageType(state, b, id, types)) return { state, events: [] }
  const look = lookups(state, b)
  const r = rollNd6(state, 2, 'damage', { ownerId: id, target: look.arm(id), flat: pow })
  const pts = Math.max(0, r.total - look.arm(id))
  const ap = applyDamage(r.state, id, pts, { source: 'other', layouts: look.layouts?.(id), damageTypes: types })
  let s = ap.state
  const events: GameEvent[] = [r.event, ...ap.events]
  if (s.models[id]!.life === 'disabled') {
    const d = resolveDeath(s, id, { tough: look.tough?.(id), layouts: look.layouts?.(id), cause: 'scenario' })
    s = d.state; events.push(...d.events)
  }
  return { state: s, events }
}

const tokensOf = (s: GameState, id: Id): number | undefined => s.scenario.elementState?.[id]?.tokens
const setTokens = (s: GameState, id: Id, tokens: number): GameState =>
  ({ ...s, scenario: { ...s.scenario, elementState: { ...(s.scenario.elementState ?? {}), [id]: { ...s.scenario.elementState?.[id], tokens } } } })
const detonated = (s: GameState, id: Id): boolean => (s.scenario.onceDone ?? []).includes(`detonated:${id}`)

/** Take `n` tokens off an element (floor 0). One that reaches 0 detonates once: a POW blast on every model in or near it. Returns `ended` when the blast ended the game. */
function removeTokens(state: GameState, b: DataBundle, def: ScenarioDef, rd: ScenarioRulesDef, el: ElementDef, n: number, by: PlayerId | null): { state: GameState; events: GameEvent[]; ended: boolean } {
  const have = tokensOf(state, el.id) ?? 0
  const take = Math.min(have, n)
  if (take <= 0) return { state, events: [], ended: false }
  let s = setTokens(state, el.id, have - take)
  const events: GameEvent[] = [{ type: 'ElementTokensChanged', elementId: el.id, tokens: have - take, delta: -take, by }]
  const fuse = find(rd, 'fuse')
  if (have - take === 0 && fuse && !detonated(s, el.id)) {
    s = { ...s, scenario: { ...s.scenario, onceDone: [...(s.scenario.onceDone ?? []), `detonated:${el.id}`] } }
    events.push({ type: 'ElementDetonated', elementId: el.id })
    const g = elementGeom(s, el)
    const types: DamageType[] = ['blast', (fuse.blast.damageType ?? 'magical') as DamageType]
    const ids = Object.values(s.models).filter((m) => isOnTable(m)).filter((m) => {
      if (g.shape && g.area) return circleOverlapsShape(m.pos, baseRadius(m.base), g.shape)
      const d = g.shape ? distToShape(m.pos, g.shape) - baseRadius(m.base) : dist(m.pos, g.pos) - g.r - baseRadius(m.base)
      return d <= fuse.blast.within + EPS
    }).map((m) => m.id).sort()
    for (const id of ids) {
      if (!s.models[id] || s.models[id]!.life !== 'active') continue
      const r = typedBlast(s, b, id, fuse.blast.pow, types); s = r.state; events.push(...r.events)
    }
    const d = afterDeaths(s, b); s = d.state; events.push(...d.events)
    if (d.ended || s.phase === 'ended') return { state: s, events, ended: true }
  }
  void def
  return { state: s, events, ended: false }
}

// ---------- scoring: the step machine ----------
/** The stage a scoring decision resumes at; stored in the decision's `context.data.cur` so the machine needs no extra state. */
type Cur =
  | { s: 'begin' } | { s: 'fuse' } | { s: 'score' } | { s: 'killbox' } | { s: 'win' } | { s: 'post' }
  | { s: 'heel'; i: number } | { s: 'heelMove'; i: number; el: Id; by: PlayerId }
  | { s: 'payload'; i: number } | { s: 'haul'; i: number; el: Id }
  | { s: 'race' } | { s: 'win2' } | { s: 'round' }
export interface ScoringOut { state: GameState; events: GameEvent[]; pending: PendingDecision | null; ended: boolean }
type ScoringIn = ScoringOut | { rejection: ReturnType<typeof reject>['rejection'] }

const HAUL_MAX_SAMPLES = 40
const playerOrder = (s: GameState): PlayerId[] => [s.activePlayer, otherPlayer(s.activePlayer)]
const elementsOfKind = (def: ScenarioDef, kind: string): ElementDef[] => def.elements.filter((e) => e.kind === kind)
const flagTerrainCentre = (state: GameState, el: ElementDef): Vec2 => {
  const g = elementGeom(state, el)
  if (!g.shape) return g.pos
  if (g.shape.kind === 'circle') return g.shape.c
  const n = g.shape.pts.length
  return { x: g.shape.pts.reduce((a, p) => a + p.x, 0) / n, z: g.shape.pts.reduce((a, p) => a + p.z, 0) / n }
}

/** Flags whose terrain piece has gone (destroyed, expired, removed) become the flag-obstruction where they stood (SR p3). */
function housekeepElements(state: GameState, def: ScenarioDef): { state: GameState; events: GameEvent[] } {
  let s = state
  const events: GameEvent[] = []
  for (const el of def.elements) {
    const rt = s.scenario.elementState?.[el.id]
    if (el.kind !== 'flag' || !rt?.terrainId || rt.removed) continue
    if (s.terrain.some((t) => t.id === rt.terrainId)) continue
    s = setTerrainId(s, el.id, null)
    events.push({ type: 'ElementRemoved', elementId: el.id, reason: 'terrainGone' })
  }
  return { state: s, events }
}

function raiseChoice(
  state: GameState, spec: { player: PlayerId; code: ScenarioChoiceCode; cur: Cur; options: { id: string; label: string }[]; data?: Record<string, unknown>; canPass: boolean },
): ScoringOut {
  const base: GameState = { ...state, window: 'scenario.score' }
  const r = raiseWith(base, {
    player: spec.player, kind: 'abilityChoice', window: 'scenario.score', canPass: spec.canPass,
    context: { data: { code: spec.code, scoring: true, cur: spec.cur, ...(spec.data ?? {}) } },
  }, (id) => spec.options.map((o): DecisionOption => ({ id: o.id, label: o.label, action: { type: 'abilityChoice', decisionId: id, player: spec.player, optionId: o.id } })))
  return { state: r.state, events: [], pending: r.pending, ended: false }
}

/** Cohort models of `player` that could haul toward the objective now, with how far each can go (SR p11, Made To Haul). */
function haulCandidates(state: GameState, el: ElementDef, player: PlayerId, max: number): { modelId: ModelId; to: Vec2; dist: number }[] {
  const g = elementGeom(state, el)
  if (!g.present) return []
  const out: { modelId: ModelId; to: Vec2; dist: number }[] = []
  for (const m of Object.values(state.models).sort((x, y) => x.id.localeCompare(y.id))) {
    if (m.owner !== player || !isOnTable(m) || m.inert || (m.type !== 'warEngine' && m.type !== 'beast')) continue
    const total = dist(m.pos, g.pos)
    if (total < 0.05) continue
    const u = { x: (g.pos.x - m.pos.x) / total, z: (g.pos.z - m.pos.z) / total }
    const reach = Math.min(max, Math.max(0, total - g.r - baseRadius(m.base))) // it may not end on the objective itself
    let best = 0
    for (let i = 1; i <= HAUL_MAX_SAMPLES; i++) {
      const k = (reach * i) / HAUL_MAX_SAMPLES
      if (!isLegalPlacement(state, m.id, { x: m.pos.x + u.x * k, z: m.pos.z + u.z * k }, m.base).ok) break
      best = k
    }
    if (best >= 0.25) out.push({ modelId: m.id, to: { x: nz(Math.round((m.pos.x + u.x * best) * 1000) / 1000), z: nz(Math.round((m.pos.z + u.z * best) * 1000) / 1000) }, dist: best })
  }
  return out
}

function raiseHaul(state: GameState, el: ElementDef, i: number, player: PlayerId, special: { haul: number }): ScoringOut | null {
  const cands = haulCandidates(state, el, player, special.haul)
  if (cands.length === 0) return null
  const toward = elementGeom(state, el).pos
  const r = raiseWith({ ...state, window: 'scenario.score' }, {
    player, kind: 'moveModel', window: 'scenario.score', canPass: true,
    context: { modelId: cands[0]!.modelId, data: { code: 'haul', scoring: true, cur: { s: 'haul', i, el: el.id } satisfies Cur, toward, max: special.haul, candidates: cands.map((c) => ({ modelId: c.modelId, dist: c.dist })) } },
    constraints: { modelId: cands[0]!.modelId, from: state.models[cands[0]!.modelId]!.pos, maxDist: special.haul, straightLine: true },
  }, (id) => cands.map((c): DecisionOption => ({
    id: `haul:${c.modelId}`, label: `Haul ${c.modelId} ${c.dist.toFixed(1)}" toward the objective`,
    action: { type: 'moveModel', decisionId: id, player, modelId: c.modelId, path: [c.to] },
  })))
  return { state: r.state, events: [], pending: r.pending, ended: false }
}

const award = (s: GameState, player: PlayerId, vp: number, source: string): { state: GameState; event: GameEvent } => {
  const total = { ...s.scenario.vp, [player]: s.scenario.vp[player] + vp }
  return {
    state: { ...s, scenario: { ...s.scenario, vp: total, log: [...s.scenario.log, { round: s.round, turn: s.turn, player, vp, source }] } },
    event: { type: 'ScenarioScored', player, delta: vp, vp: { ...total }, sources: [{ reason: source, vp }] },
  }
}

/** The lead-by-N check after scoring (V1.3): the non-active player wins when their VP reach the active player's plus the margin; 0 = off. */
function leadWin(s: GameState, def: ScenarioDef): { state: GameState; events: GameEvent[] } | null {
  const active = s.activePlayer, other = otherPlayer(active)
  if (def.scoring.winMargin > 0 && s.scenario.vp[other] >= s.scenario.vp[active] + def.scoring.winMargin) return endGame(s, other, 'scenario')
  return null
}

/**
 * Run the scoring machine from `from` until it needs a decision or finishes. The order at a scoring point: the fuse (High Stakes), the rules,
 * Kill Box, lead-by-N, then the post-score specials (heel tokens or Payload moves), the token race, lead-by-N again, the round limit.
 */
function run(state: GameState, b: DataBundle, from: Cur, lead: GameEvent[]): ScoringOut {
  const def = scenarioDef(b, state.scenario.id)
  const rd = scenarioRules(b, state.scenario.id)
  let s = state
  const ev: GameEvent[] = [...lead]
  const active = s.activePlayer
  const scoring = scoringActive(s, def)
  const fin = (r: { state: GameState; events: GameEvent[] }): ScoringOut => ({ state: r.state, events: [...ev, ...r.events], pending: null, ended: true })
  const ask = (o: ScoringOut): ScoringOut => ({ ...o, events: [...ev, ...o.events] })
  let cur: Cur = from
  for (let guard = 0; guard < 80; guard++) {
    switch (cur.s) {
      case 'begin': {
        const hk = housekeepElements(s, def); s = hk.state; ev.push(...hk.events)
        cur = scoring ? { s: 'fuse' } : { s: 'killbox' }
        break
      }
      case 'fuse': {
        const fuse = find(rd, 'fuse')
        cur = { s: 'score' }
        if (!fuse) break
        const control = computeControl(s, def)
        const fifty = def.elements.find((e) => e.kind === 'objective50' && fuse.on.includes('objective50'))
        const burning = def.elements.filter((e) => fuse.on.includes(e.kind) && (tokensOf(s, e.id) ?? 0) > 0)
        if (burning.length === 0) break
        const securer = fifty ? control[fifty.id]?.controller ?? null : null
        if (securer) {
          return ask(raiseChoice(s, {
            player: securer, code: 'fuse', cur: { s: 'score' }, canPass: false,
            options: burning.map((e) => ({ id: e.id, label: `Burn down ${e.id} (${tokensOf(s, e.id)} left)` })),
            data: { elementIds: burning.map((e) => e.id) },
          }))
        }
        const roll = rollD3(s, 'scenario'); s = roll.state; ev.push(roll.event)
        const pick = fuse.d3[roll.value - 1] ?? 'objective50'
        const target = pick === 'objective50' ? fifty : def.elements.find((e) => e.kind === 'flag' && elementOwner(s, e) === (pick === 'flag:first' ? s.firstPlayer : s.firstPlayer ? otherPlayer(s.firstPlayer) : null))
        if (target) {
          const r = removeTokens(s, b, def, rd, target, 1, null); s = r.state; ev.push(...r.events)
          if (r.ended) return fin({ state: s, events: [] })
        }
        break
      }
      case 'score': {
        const control = computeControl(s, def)
        ev.push({ type: 'ControlChecked', elements: control })
        let vp = { ...s.scenario.vp }
        const log = [...s.scenario.log]
        for (const p of playerOrder(s)) {
          const gained = gainsFor(s, def, rd, control, p)
          const delta = gained.reduce((a, g) => a + g.vp, 0)
          if (delta === 0) continue
          vp = { ...vp, [p]: vp[p] + delta }
          for (const g of gained) log.push({ round: s.round, turn: s.turn, player: p, vp: g.vp, source: g.reason })
          ev.push({ type: 'ScenarioScored', player: p, delta, vp: { ...vp }, sources: gained })
        }
        s = { ...s, scenario: { ...s.scenario, elements: control, vp, log } }
        cur = { s: 'killbox' }
        break
      }
      case 'killbox': {
        if (killBoxActive(s, def)) {
          const inBox = inKillBox(s, def, active)
          s = { ...s, scenario: { ...s.scenario, killBox: { ...s.scenario.killBox, [active]: inBox } } }
          if (inBox) {
            const ben = otherPlayer(active)
            const vp = { ...s.scenario.vp, [ben]: s.scenario.vp[ben] + def.killBox!.vp }
            s = { ...s, scenario: { ...s.scenario, vp, log: [...s.scenario.log, { round: s.round, turn: s.turn, player: ben, vp: def.killBox!.vp, source: 'killBox' }] } }
            ev.push({ type: 'KillBoxScored', offender: active, beneficiary: ben, vp: def.killBox!.vp })
          }
        }
        cur = { s: 'win' }
        break
      }
      case 'win': {
        const w = leadWin(s, def)
        if (w) return fin(w)
        cur = scoring ? { s: 'post' } : { s: 'round' }
        break
      }
      case 'post': {
        cur = find(rd, 'heelTokens') ? { s: 'heel', i: 0 } : find(rd, 'payload') ? { s: 'payload', i: 0 } : { s: 'race' }
        break
      }
      case 'heel': {
        const heel = find(rd, 'heelTokens')!
        const p = playerOrder(s)[cur.i]
        if (p === undefined) { cur = find(rd, 'payload') ? { s: 'payload', i: 0 } : { s: 'race' }; break }
        const el = def.elements.find((e) => e.kind === heel.on && elementOwner(s, e) === p && elementGeom(s, e).present)
        const next: Cur = { s: 'heel', i: cur.i + 1 }
        if (!el || computeControl(s, def)[el.id]?.controller !== p) { cur = next; break }
        return ask(raiseChoice(s, {
          player: p, code: 'heelToken', cur: { s: 'heelMove', i: cur.i, el: el.id, by: p }, canPass: true,
          options: [{ id: 'yes', label: `Add a token to ${el.id} (${tokensOf(s, el.id) ?? 0} now)` }, { id: 'no', label: 'Leave it' }],
          data: { elementId: el.id, tokens: tokensOf(s, el.id) ?? 0 },
        }))
      }
      case 'heelMove': {
        // reached only through an answer (see answerStep): the token was added, the opponent now chooses whether the objective moves
        cur = { s: 'heel', i: cur.i + 1 }
        break
      }
      case 'payload': {
        const pay = find(rd, 'payload')!
        const p = playerOrder(s)[cur.i]
        if (p === undefined) { cur = { s: 'race' }; break }
        const own = def.elements.find((e) => e.kind === 'objective50' && elementOwner(s, e) === p && elementGeom(s, e).present)
        const next: Cur = { s: 'payload', i: cur.i + 1 }
        const control = own ? computeControl(s, def) : null
        if (!own || control![own.id]?.controller !== p) { cur = next; break }
        const others = def.elements.filter((e) => (e.kind === 'objective40' || e.kind === 'objective50') && e.id !== own.id && control![e.id]?.controller === p).length
        const max = pay.move + pay.perOther * others
        const opts = Array.from({ length: Math.floor(max) + 1 }, (_, k) => ({ id: `d${k}`, label: k === 0 ? 'Leave the objective where it is' : `Move it ${k}"` }))
        return ask(raiseChoice(s, { player: p, code: 'payload', cur: next, options: opts, canPass: true, data: { elementId: own.id, max: Math.floor(max) } }))
      }
      case 'haul': {
        cur = { s: 'payload', i: cur.i + 1 }
        break
      }
      case 'race': {
        const race = ruleOf(rd, 'tokenRace')
        cur = { s: 'win2' }
        if (!race || (s.scenario.onceDone ?? []).includes('tokenRace')) break
        const heel = find(rd, 'heelTokens')
        const third = race.third ?? 3
        const reached = (['A', 'B'] as PlayerId[]).filter((p) => def.elements.some((e) => e.kind === (heel?.on ?? 'objective40') && elementOwner(s, e) === p && (tokensOf(s, e.id) ?? 0) >= third))
        if (reached.length === 0) break
        s = { ...s, scenario: { ...s.scenario, onceDone: [...(s.scenario.onceDone ?? []), 'tokenRace'] } }
        if (reached.length === 1 && race.vp > 0) { const a = award(s, reached[0]!, race.vp, 'tokenRace'); s = a.state; ev.push(a.event) }
        break
      }
      case 'win2': {
        const w = leadWin(s, def)
        if (w) return fin(w)
        cur = { s: 'round' }
        break
      }
      case 'round': {
        if (s.round >= def.rounds && !isFirst(s, active)) return fin(finalResult(s, b))
        return { state: s, events: ev, pending: null, ended: false }
      }
    }
  }
  throw new Error('scoring machine did not settle')
}

/**
 * End-of-turn scoring as a resumable step machine. Plain scenarios (no `scoring.rules`, no specials) run the V1 scoring of scenario.ts unchanged.
 * Returns the next decision (`pending`), or the finished state (`pending` null; `ended` when the game is over).
 */
export function scoreTurnEndStep(state: GameState, b: DataBundle): ScoringOut {
  if (!usesScenarioRules(b, state.scenario.id)) {
    const r = endOfTurnScoring(state, b)
    return { state: r.state, events: r.events, pending: null, ended: r.ended }
  }
  return run(state, b, { s: 'begin' }, [])
}

/** The fuse / token / Payload / haul decisions of the scoring machine are open. */
export function isScoringDecision(state: GameState): boolean {
  const pd = state.pending
  return (pd.kind === 'abilityChoice' || pd.kind === 'moveModel') && pd.context.data?.scoring === true
}

const optionIds = (pd: PendingDecision): string[] => (pd.options ?? []).map((o) => o.id)

/** Answer a scoring decision and resume the machine. */
export function answerScoringStep(state: GameState, b: DataBundle, a: Action): ScoringIn {
  const pd = state.pending
  const data = pd.context.data as { code?: string; cur?: Cur; elementId?: Id; max?: number; toward?: Vec2; candidates?: { modelId: ModelId }[] } & Record<string, unknown>
  const def = scenarioDef(b, state.scenario.id)
  const rd = scenarioRules(b, state.scenario.id)
  const cur = data.cur as Cur
  const events: GameEvent[] = []
  let s = state
  const isPass = a.type === 'pass'
  if (isPass && !pd.canPass) return reject('E_NOT_AN_OPTION', 'this choice cannot be passed')
  const ask = (o: ScoringOut): ScoringOut => ({ ...o, events: [...events, ...o.events] })

  if (data.code === 'haul') {
    const next: Cur = { s: 'haul', i: (cur as { i: number }).i, el: (cur as { el: Id }).el }
    if (!isPass) {
      if (a.type !== 'moveModel') return reject('E_WRONG_DECISION', `${a.type} does not answer a haul`)
      const el = def.elements.find((e) => e.id === (next as { el: Id }).el)!
      const cands = haulCandidates(s, el, pd.player, (data.max as number) ?? 5)
      const c = cands.find((x) => x.modelId === a.modelId)
      if (!c) return reject('E_NOT_AN_OPTION', `${a.modelId} cannot be hauled now`)
      const to = a.path[a.path.length - 1]
      const m = s.models[a.modelId]!
      const along = to ? (to.x - m.pos.x) * ((c.to.x - m.pos.x) / c.dist) + (to.z - m.pos.z) * ((c.to.z - m.pos.z) / c.dist) : 0
      const off = to ? Math.hypot(to.x - m.pos.x - ((c.to.x - m.pos.x) / c.dist) * along, to.z - m.pos.z - ((c.to.z - m.pos.z) / c.dist) * along) : Infinity
      if (!to || a.path.length !== 1 || off > 0.05 || along < 0.05 || along > c.dist + 0.05) return reject('E_NOT_STRAIGHT', 'a haul is a straight move toward the objective, no further than it can go')
      const from = m.pos
      s = relocate(s, m.id, to)
      events.push(movedEvent(m.id, 'reposition', from, to, [to], s.models[m.id]!.elev))
    }
    return run(s, b, { s: 'haul', i: next.i, el: next.el }, events)
  }

  const chosen = a.type === 'abilityChoice' ? a.optionId : null
  if (!isPass && (chosen === null || !optionIds(pd).includes(chosen))) return reject('E_NOT_AN_OPTION', `${String(chosen ?? a.type)} is not one of the offered answers`)

  switch (data.code) {
    case 'fuse': {
      const el = def.elements.find((e) => e.id === (chosen ?? optionIds(pd)[0]))!
      const fuse = find(rd, 'fuse')!
      void fuse
      const roll = rollD3(s, 'scenario'); s = roll.state; events.push(roll.event)
      const r = removeTokens(s, b, def, rd, el, roll.value, pd.player); s = r.state; events.push(...r.events)
      if (r.ended) return { state: s, events, pending: null, ended: true }
      return run(s, b, { s: 'score' }, events)
    }
    case 'heelToken': {
      const heelCur = cur as { s: 'heelMove'; i: number; el: Id; by: PlayerId }
      if (chosen !== 'yes') return run(s, b, { s: 'heel', i: heelCur.i + 1 }, events)
      const heel = find(rd, 'heelTokens')!
      const have = tokensOf(s, heelCur.el) ?? 0
      s = setTokens(s, heelCur.el, have + 1)
      events.push({ type: 'ElementTokensChanged', elementId: heelCur.el, tokens: have + 1, delta: 1, by: heelCur.by })
      const opp = otherPlayer(heelCur.by)
      const out = raiseChoice(s, {
        player: opp, code: 'heelMove', cur: { s: 'heelMove', i: heelCur.i, el: heelCur.el, by: heelCur.by }, canPass: true,
        options: [{ id: 'move', label: `Move it ${heel.move}" toward its 50 mm objective` }, { id: 'stay', label: 'Leave it' }],
        data: { elementId: heelCur.el, move: heel.move },
      })
      return ask(out)
    }
    case 'heelMove': {
      const heelCur = cur as { s: 'heelMove'; i: number; el: Id; by: PlayerId }
      if (chosen === 'move') {
        const heel = find(rd, 'heelTokens')!
        const el = def.elements.find((e) => e.id === heelCur.el)!
        const fifty = def.elements.find((e) => e.kind === heel.toward && elementOwner(s, e) === elementOwner(s, el) && elementGeom(s, e).present)
        if (fifty) { const r = moveElementToward(s, b, el.id, elementGeom(s, fifty).pos, heel.move, pd.player); s = r.state; events.push(...r.events) }
      }
      return run(s, b, { s: 'heel', i: heelCur.i + 1 }, events)
    }
    case 'payload': {
      const next = cur as { s: 'payload'; i: number }
      const k = isPass || chosen === 'd0' ? 0 : Number((chosen ?? 'd0').slice(1))
      if (k <= 0) return run(s, b, next, events)
      const pay = find(rd, 'payload')!
      const el = def.elements.find((e) => e.id === data.elementId)!
      const theirFlag = def.elements.find((e) => e.kind === 'flag' && elementOwner(s, e) === otherPlayer(pd.player))
      const target = theirFlag ? flagTerrainCentre(s, theirFlag) : null
      if (!target) return run(s, b, next, events)
      const before = elementGeom(s, el).pos
      const r = moveElementToward(s, b, el.id, target, k, pd.player); s = r.state; events.push(...r.events)
      const moved = r.events.length > 0
      let delivered = false
      const dr = ruleOf(rd, 'delivered')
      if (moved && theirFlag) {
        const g = elementGeom(s, el)
        const tf = elementGeom(s, theirFlag)
        const inside = tf.shape
          ? (tf.area ? circleOverlapsShape(g.pos, g.r, tf.shape) : distToShape(g.pos, tf.shape) - g.r <= 3 + EPS)
          : dist(g.pos, tf.pos) - tf.r - g.r <= 3 + EPS
        if (inside) {
          delivered = true
          s = { ...s, scenario: { ...s.scenario, elementState: { ...(s.scenario.elementState ?? {}), [el.id]: { ...s.scenario.elementState?.[el.id], removed: true } } } }
          events.push({ type: 'ElementRemoved', elementId: el.id, reason: 'delivered' })
          if (dr && dr.vp > 0) { const a2 = award(s, pd.player, dr.vp, 'delivered'); s = a2.state; events.push(a2.event) }
        }
      }
      void before
      // Made To Haul: only after moving one's own 50 at the end of one's own turn (RULING)
      if (moved && !delivered && pd.player === s.activePlayer) {
        const h = raiseHaul(s, el, next.i - 1, pd.player, pay)
        if (h) return ask(h)
      }
      return run(s, b, next, events)
    }
    default:
      return reject('E_WRONG_DECISION', 'not a scoring decision')
  }
}

/** Answer a scoring decision and resume the machine; the finished state comes back with the pending left as it was (check `isScoringDecision`). */
export function answerScoringDecision(state: GameState, b: DataBundle, a: AbilityChoiceAction | Action): FlowResult {
  const r = answerScoringStep(state, b, a)
  if ('rejection' in r) return r
  if (r.ended) return { state: r.state, events: r.events, pending: raiseGameOver(r.state).pending }
  return { state: r.state, events: r.events, pending: r.pending ?? r.state.pending }
}
/** End-of-turn scoring (see `scoreTurnEndStep`); a finished machine comes back with the pending left as it was (check `isScoringDecision`). */
export function scoreTurnEnd(state: GameState, b: DataBundle): FlowResult {
  const r = scoreTurnEndStep(state, b)
  if (r.ended) return { state: r.state, events: r.events, pending: raiseGameOver(r.state).pending }
  return { state: r.state, events: r.events, pending: r.pending ?? r.state.pending }
}

/** Score `scorer` alone with the scenario's normal rules (no Kill Box, no lead-by-3, no specials), for the clock-out resolution (91 C.2). */
export function scoreOpponentAlone(state: GameState, b: DataBundle, scorer: PlayerId): { state: GameState; events: GameEvent[] } {
  const def = scenarioDef(b, state.scenario.id)
  const rd = scenarioRules(b, state.scenario.id)
  const control = computeControl(state, def)
  const events: GameEvent[] = [{ type: 'ControlChecked', elements: control }]
  const gained = gainsFor(state, def, rd, control, scorer)
  const delta = gained.reduce((a, g) => a + g.vp, 0)
  let scenario = { ...state.scenario, elements: control }
  if (delta > 0) {
    const vp = { ...scenario.vp, [scorer]: scenario.vp[scorer] + delta }
    scenario = { ...scenario, vp, log: [...scenario.log, ...gained.map((g) => ({ round: state.round, turn: state.turn, player: scorer, vp: g.vp, source: g.reason }))] }
    events.push({ type: 'ScenarioScored', player: scorer, delta, vp: { ...vp }, sources: gained })
  }
  return { state: { ...state, scenario }, events }
}
