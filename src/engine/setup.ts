// R11 and 11-scenarios: army building, roll-off, turn order, edge choice, deployment (zones, unit spread, Advance Deployment).
// Pure. createInitialState replaces the stub body of index.createGame; answerSetup serves chooseTurnOrder / chooseEdge /
// deploy / advanceDeploy. Prey and Ambush choices are not offered yet (see issues).
import type {
  Action, AdvanceDeployAction, ChooseEdgeAction, ChooseTurnOrderAction, DeployAction, Placement,
} from './actions'
import { newGrid } from './damage'
import { otherPlayer, profileOf, type Profile } from './effects'
import type { GameEvent } from './events'
import { baseRadius, edgeDistance, isLegalPlacement, surfaceElevation } from './geometry'
import { raise, reject, type FlowOut, type FlowResult } from './pending'
import { rollNd6 } from './dice'
import { seedRng } from './rng'
import { initialScenarioState, scenarioDef, type ScenarioDef } from './scenario'
import { startGameplay } from './turnflow'
import { handleActivationAction, raisePrey } from './phases/activation'
import type {
  DamageState, DataBundle, DecisionOption, EdgeId, GameSetup, GameState, ModelId, ModelState, ModelType, PlayerId, PlayerState,
  Rejection, TerrainInstance, UnitState, Vec2,
} from './types'

const EPS = 1e-6
export const FIXED_SETUP_SCENARIOS = ['scn-qs-demo'] // QS fixed setup: A (Khador) first on the north edge, no roll-off or edge choice

// ---------- geometry of zones ----------
export interface Rect { x0: number; x1: number; z0: number; z1: number }
export const OPPOSITE: Record<EdgeId, EdgeId> = { north: 'south', south: 'north', east: 'west', west: 'east' }

export function zoneRect(def: Pick<ScenarioDef, 'table'>, edge: EdgeId, depth: number): Rect {
  const hw = def.table.w / 2, hd = def.table.d / 2
  switch (edge) {
    case 'north': return { x0: -hw, x1: hw, z0: -hd, z1: -hd + depth }
    case 'south': return { x0: -hw, x1: hw, z0: hd - depth, z1: hd }
    case 'west': return { x0: -hw, x1: -hw + depth, z0: -hd, z1: hd }
    default: return { x0: hw - depth, x1: hw, z0: -hd, z1: hd }
  }
}
export const circleInRect = (p: Vec2, r: number, z: Rect): boolean =>
  p.x - r >= z.x0 - EPS && p.x + r <= z.x1 + EPS && p.z - r >= z.z0 - EPS && p.z + r <= z.z1 + EPS

/** The player's deployment zone (their back-edge strip), or the Advance Deployment extension of it. */
export function deploymentZone(state: GameState, bundle: DataBundle, player: PlayerId, advance = false): Rect {
  const def = scenarioDef(bundle, state.scenario.id)
  const edge = state.players[player].edge
  if (!edge) throw new Error('deploymentZone: edge not chosen yet')
  const depth = (state.firstPlayer === player ? def.deployment.first : def.deployment.second) + (advance ? def.deployment.advance : 0)
  return zoneRect(def, edge, depth)
}

// ---------- building the army ----------
const modelId = (p: PlayerId, tag: string): string => `${p}:${tag}`
/** Entry index encoded in a model or unit id ("A:e2", "A:u3", "A:u3.1"); -1 for the leader. */
export const entryIndexOf = (id: string): number => { const m = /^[AB]:[eu](\d+)/.exec(id); return m ? Number(m[1]) : -1 }

function damageFor(profile: Profile): DamageState {
  const d = profile.damage as { track: string; boxes?: number; columns?: string[]; grids?: { left: string[]; right: string[] } }
  if (d.track === 'grid') return { track: 'grid', grids: [newGrid({ id: 'main', columns: d.columns ?? [] })] }
  if (d.track === 'dualGrid') return { track: 'grid', grids: [newGrid({ id: 'left', columns: d.grids?.left ?? [] }), newGrid({ id: 'right', columns: d.grids?.right ?? [] })] }
  return { track: 'single', filled: 0, boxes: d.boxes ?? 1 }
}
function makeModel(id: string, owner: PlayerId, profileId: string, p: Profile, extra: Partial<ModelState> = {}): ModelState {
  const type = (p.type === 'trooper' || p.type === 'unit' ? 'trooper' : p.type) as ModelType
  return {
    id, profileId, owner, type, pos: { x: 0, z: 0 }, elev: 0, base: p.base ?? 30,
    focus: type === 'leader' ? (p.stats?.ARC ?? 0) : 0, // R11.7: casters start with focus = ARC
    damage: damageFor(p), life: 'active', conditions: [], crippled: [], hardpoints: {}, activated: false, offTable: true, ...extra,
  }
}

const listCost = (bundle: DataBundle, e: { profile: string; size?: number }): number => {
  const p = (bundle.byId[e.profile] ?? {}) as Profile
  const bySize = p.composition?.costBySize as Record<string, number> | undefined
  return (e.size !== undefined && bySize?.[String(e.size)]) || p.cost || 0
}

interface Army { models: ModelState[]; units: UnitState[]; leaderId: ModelId }
/** Validate a list (R11.1, R11.2) and instantiate its models. Throws an Error with a readable message on a bad list. */
export function buildArmy(player: PlayerId, listId: string, bundle: DataBundle): Army {
  const list = bundle.byId[listId] as Record<string, any> | undefined // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!list) throw new Error(`list '${listId}' not found`)
  const leaderP = bundle.byId[list.leader] as Profile | undefined
  if (!leaderP || leaderP.type !== 'leader') throw new Error(`list '${listId}': leader '${String(list.leader)}' is not a Leader`)
  const models: ModelState[] = []
  const units: UnitState[] = []
  const leaderId = modelId(player, 'L')
  models.push(makeModel(leaderId, player, list.leader, leaderP))
  let points = 0
  let cohort = false
  const characters = new Set<string>([list.leader])
  const entries = (list.entries ?? []) as { profile: string; size?: number }[]
  entries.forEach((e, i) => {
    const p = bundle.byId[e.profile] as Profile | undefined
    if (!p) throw new Error(`list '${listId}': profile '${e.profile}' not found`)
    if (p.fa === 'C') { if (characters.has(e.profile)) throw new Error(`list '${listId}': character '${e.profile}' appears twice`); characters.add(e.profile) }
    points += listCost(bundle, e)
    if (p.type === 'unit') {
      const comp = p.composition as { grunts: { profile: string; min: number; max: number }; extra?: { profile: string; min: number; max: number }[] }
      const extras = comp.extra ?? []
      const extraN = extras.reduce((a, x) => a + x.min, 0)
      const gruntN = (e.size ?? comp.grunts.min + extraN) - extraN
      if (gruntN < comp.grunts.min || gruntN > comp.grunts.max) throw new Error(`list '${listId}': ${e.profile} size ${String(e.size)} is out of range`)
      const uid = modelId(player, `u${i}`)
      const roster = [...Array.from({ length: gruntN }, () => comp.grunts.profile), ...extras.flatMap((x) => Array.from({ length: x.min }, () => x.profile))]
      const troopers = roster.map((pid, k) => makeModel(`${uid}.${k + 1}`, player, pid, (bundle.byId[pid] ?? {}) as Profile, { unitId: uid }))
      models.push(...troopers)
      units.push({ id: uid, profileId: e.profile, owner: player, troopers: troopers.map((t) => t.id), attachments: [], activated: false })
    } else {
      const m = makeModel(modelId(player, `e${i}`), player, e.profile, p, p.type === 'warEngine' ? { controllerId: leaderId } : {})
      models.push(m)
      if (p.type === 'warEngine' && !p.lesser) cohort = true
    }
  })
  const cap = list.points ?? 30
  if (points > cap) throw new Error(`list '${listId}' costs ${points}, over ${cap}`)
  if (!cohort) throw new Error(`list '${listId}' needs at least one non-lesser war-engine`)
  return { models, units, leaderId }
}

function buildTerrain(bundle: DataBundle, layoutId: string): TerrainInstance[] {
  const layout = bundle.byId[layoutId] as Record<string, any> | undefined // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!layout) throw new Error(`terrain layout '${layoutId}' not found`)
  return ((layout.pieces ?? []) as Record<string, any>[]).map((pc) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const t = (bundle.byId[pc.terrain] ?? {}) as Profile
    return { id: pc.id, pieceId: pc.terrain, rulesType: t.rulesType, pos: pc.pos, rot: pc.rot ?? 0, footprint: t.footprint, height: t.height ?? 0, props: t.props ?? {} }
  })
}

// ---------- creating the game ----------
const placeholderPending = (): GameState['pending'] => ({ id: 'd:0', player: 'A', kind: 'chooseTurnOrder', window: 'turn.start', context: {}, canPass: false })

/** createGame body: validates, builds the table and armies, rolls off, and raises the first decision. Never throws. */
export function createInitialState(setup: GameSetup, seed: string, bundle: DataBundle): FlowOut | { rejection: Rejection } {
  try {
    const sc = bundle.byId[setup.scenario] as Record<string, any> | undefined // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!sc) return reject('E_BAD_SETUP', `unknown scenario '${setup.scenario}'`)
    const def = scenarioDef(bundle, setup.scenario)
    const armies = { A: buildArmy('A', setup.lists.A, bundle), B: buildArmy('B', setup.lists.B, bundle) }
    const terrain = buildTerrain(bundle, setup.layout ?? (sc.terrainLayout as string))
    const players = Object.fromEntries((['A', 'B'] as PlayerId[]).map((p) => {
      const list = bundle.byId[setup.lists[p]] as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
      const ps: PlayerState = { id: p, faction: list.faction, listId: list.id, leaderId: armies[p].leaderId, edge: null, deployed: false, ambushIds: [] }
      return [p, ps]
    })) as Record<PlayerId, PlayerState>
    const models = Object.fromEntries([...armies.A.models, ...armies.B.models].map((m) => [m.id, m]))
    const units = Object.fromEntries([...armies.A.units, ...armies.B.units].map((u) => [u.id, u]))
    let s: GameState = {
      seed, rng: seedRng(seed), rollSeq: 0, attackSeq: 0, effectSeq: 0, dataVersion: bundle.version, setup, players,
      round: 0, turn: 0, activePlayer: 'A', firstPlayer: null, phase: 'setup', window: 'turn.start', models, units, terrain,
      clouds: [], effects: [], upkeeps: {}, attack: null, activation: null, scenario: initialScenarioState(def),
      pending: placeholderPending(), decisionSeq: 0, log: [],
    }
    const events: GameEvent[] = [{ type: 'GameCreated', seed, dataVersion: bundle.version }]

    if (FIXED_SETUP_SCENARIOS.includes(setup.scenario)) {
      s = { ...s, firstPlayer: 'A', activePlayer: 'A', players: { A: { ...s.players.A, edge: 'north' }, B: { ...s.players.B, edge: 'south' } } }
      events.push({ type: 'TurnOrderChosen', chooser: 'A', firstPlayer: 'A' }, { type: 'EdgeChosen', player: 'A', edge: 'north' }, { type: 'EdgeChosen', player: 'B', edge: 'south' })
      return enterDeployment(s, bundle, events)
    }

    // R11.4: both roll a d6, ties reroll; the high roller picks first or second
    const rollIds: string[] = []
    let rerolls = 0
    let winner: PlayerId | null = null
    while (!winner) {
      const a = rollNd6(s, 1, 'rollOff', { ownerId: 'A' }); s = a.state
      const b = rollNd6(s, 1, 'rollOff', { ownerId: 'B' }); s = b.state
      events.push(a.event, b.event)
      rollIds.push(a.event.rollId, b.event.rollId)
      if (a.dice[0] !== b.dice[0]) winner = a.dice[0]! > b.dice[0]! ? 'A' : 'B'
      else rerolls++
    }
    events.push({ type: 'RollOffWon', winner, rollIds, rerolls })
    const r = raise(s, { player: winner, kind: 'chooseTurnOrder', window: 'turn.start', context: {}, canPass: false })
    const id = r.pending.id
    const options: DecisionOption[] = (['first', 'second'] as const).map((order) => ({
      id: order, label: `Go ${order}`, action: { type: 'chooseTurnOrder', decisionId: id, player: winner!, order } as Action,
    }))
    const pending = { ...r.pending, options }
    return { state: { ...r.state, pending }, events, pending }
  } catch (e) {
    return reject('E_BAD_SETUP', e instanceof Error ? e.message : String(e))
  }
}

// ---------- deployment ----------
function entryAdvance(state: GameState, bundle: DataBundle, player: PlayerId): Set<number> {
  const list = bundle.byId[state.setup.lists[player]] as { entries?: { advanceDeploy?: boolean }[] } | undefined
  return new Set((list?.entries ?? []).flatMap((e, i) => (e.advanceDeploy ? [i] : [])))
}
export type DeployKind = 'deploy' | 'advanceDeploy'
/** Models this player still has to put on the table in this kind of deployment step. */
export function modelsToDeploy(state: GameState, bundle: DataBundle, player: PlayerId, kind: DeployKind): ModelId[] {
  const adv = entryAdvance(state, bundle, player)
  return Object.values(state.models)
    .filter((m) => m.owner === player && m.offTable && !state.players[player].ambushIds.includes(m.id) && adv.has(entryIndexOf(m.id)) === (kind === 'advanceDeploy'))
    .map((m) => m.id).sort()
}
/** R11.5: P1 normal, P2 normal, P1 Advance Deployment, P2 Advance Deployment. */
export function nextDeployStep(state: GameState, bundle: DataBundle): { player: PlayerId; kind: DeployKind } | null {
  const first = state.firstPlayer ?? 'A'
  for (const kind of ['deploy', 'advanceDeploy'] as DeployKind[]) {
    for (const player of [first, otherPlayer(first)]) if (modelsToDeploy(state, bundle, player, kind).length > 0) return { player, kind }
  }
  return null
}

const unitGroups = (state: GameState, ids: ModelId[]): ModelId[][] => {
  const groups: ModelId[][] = []
  const byUnit = new Map<string, ModelId[]>()
  for (const id of ids) {
    const u = state.models[id]!.unitId
    if (u) byUnit.set(u, [...(byUnit.get(u) ?? []), id])
    else groups.push([id])
  }
  return [...groups, ...byUnit.values()]
}

/** A valid placement for every id, built greedily (used for options, the AI and the sim). null if it cannot fit. */
export function suggestDeployment(state: GameState, bundle: DataBundle, player: PlayerId, kind: DeployKind): Placement[] | null {
  const ids = modelsToDeploy(state, bundle, player, kind)
  const def = scenarioDef(bundle, state.scenario.id)
  const zone = deploymentZone(state, bundle, player, kind === 'advanceDeploy')
  const edge = state.players[player].edge!
  const alongX = edge === 'north' || edge === 'south'
  const groups = unitGroups(state, ids)
  const placed: Placement[] = []
  const extra: { pos: Vec2; r: number }[] = []
  const cands: Vec2[] = []
  for (let x = zone.x0; x <= zone.x1 + EPS; x += 0.5) for (let z = zone.z0; z <= zone.z1 + EPS; z += 0.5) cands.push({ x, z })
  groups.forEach((g, gi) => {
    const centre = { x: (zone.x0 + zone.x1) / 2, z: (zone.z0 + zone.z1) / 2 }
    const off = (gi - (groups.length - 1) / 2) * 5
    const want: Vec2 = alongX
      ? { x: centre.x + off, z: edge === 'north' ? zone.z1 - 1.5 : zone.z0 + 1.5 }
      : { x: edge === 'west' ? zone.x1 - 1.5 : zone.x0 + 1.5, z: centre.z + off }
    const done: Placement[] = []
    for (const id of g) {
      const m = state.models[id]!
      const r = baseRadius(m.base)
      const target = done[0]?.pos ?? want
      const ok = (p: Vec2): boolean =>
        circleInRect(p, r, zone) && isLegalPlacement(state, id, p, m.base, { extra }).ok
        && done.every((o) => edgeDistance(p, m.base, o.pos, state.models[o.modelId]!.base) <= def.deployment.unitSpread + EPS)
      let best: Vec2 | null = null
      let bd = Infinity
      for (const c of cands) {
        const d = Math.hypot(c.x - target.x, c.z - target.z)
        if (d < bd && ok(c)) { best = c; bd = d }
      }
      if (!best) return
      done.push({ modelId: id, pos: best })
      extra.push({ pos: best, r })
    }
    placed.push(...done)
  })
  return placed.length === ids.length ? placed : null
}

function raiseDeploy(state: GameState, bundle: DataBundle, step: { player: PlayerId; kind: DeployKind }): FlowOut {
  const ids = modelsToDeploy(state, bundle, step.player, step.kind)
  const zone = deploymentZone(state, bundle, step.player, step.kind === 'advanceDeploy')
  const def = scenarioDef(bundle, state.scenario.id)
  const s0: GameState = { ...state, phase: 'deploy', window: 'turn.start', activePlayer: step.player }
  const r = raise(s0, {
    player: step.player, kind: step.kind, window: 'turn.start',
    context: { modelId: ids[0], data: { modelIds: ids, zone, unitSpread: def.deployment.unitSpread } },
    constraints: { modelId: ids[0]!, from: { x: 0, z: 0 }, maxDist: Infinity, zone: { pos: { x: (zone.x0 + zone.x1) / 2, z: (zone.z0 + zone.z1) / 2 }, shape: { rect: { w: zone.x1 - zone.x0, d: zone.z1 - zone.z0 } } } },
    canPass: false,
  })
  const sug = suggestDeployment(state, bundle, step.player, step.kind)
  const id = r.pending.id
  const mk = (placements: Placement[]): Action => (step.kind === 'deploy' ? { type: 'deploy', decisionId: id, player: step.player, placements } : { type: 'advanceDeploy', decisionId: id, player: step.player, placements })
  const options: DecisionOption[] = sug ? [{ id: 'auto', label: 'Deploy in a tidy line', action: mk(sug) }] : []
  const pending = { ...r.pending, options }
  return { state: { ...r.state, pending }, events: [{ type: 'PhaseChanged', phase: 'deploy', window: 'turn.start' }], pending }
}

/** Move to the next deployment step, or to round 1 when every model is down. */
function enterDeployment(state: GameState, bundle: DataBundle, lead: GameEvent[]): FlowOut {
  const step = nextDeployStep(state, bundle)
  if (step) { const o = raiseDeploy(state, bundle, step); return { ...o, events: [...lead, ...o.events] } }
  // Granted: Prey (Black 13th): each such unit picks an enemy model after deployment, before round 1
  for (const u of Object.values(state.units).sort((x, y) => x.id.localeCompare(y.id))) {
    if (u.preyId) continue
    const o = raisePrey({ ...state, phase: 'deploy', activePlayer: u.owner }, bundle, u.id)
    if (o) return { state: o.state, events: [...lead, ...o.events], pending: o.state.pending }
  }
  const players = { A: { ...state.players.A, deployed: true }, B: { ...state.players.B, deployed: true } }
  return startGameplay({ ...state, players }, bundle, lead)
}

export function validateDeployment(state: GameState, bundle: DataBundle, a: DeployAction | AdvanceDeployAction): Rejection | null {
  const kind: DeployKind = a.type === 'deploy' ? 'deploy' : 'advanceDeploy'
  if (state.pending.kind !== kind) return { code: 'E_WRONG_DECISION', message: `not a ${kind} decision` }
  const need = modelsToDeploy(state, bundle, a.player, kind)
  const got = a.placements.map((p) => p.modelId)
  if (new Set(got).size !== got.length || got.length !== need.length || !need.every((id) => got.includes(id))) {
    return { code: 'E_BAD_PAYLOAD', message: 'place every model of this step exactly once', detail: { need } }
  }
  const def = scenarioDef(bundle, state.scenario.id)
  const zone = deploymentZone(state, bundle, a.player, kind === 'advanceDeploy')
  const extra: { pos: Vec2; r: number }[] = []
  for (const p of a.placements) {
    const m = state.models[p.modelId]!
    const r = baseRadius(m.base)
    if (!circleInRect(p.pos, r, zone)) return { code: 'E_OUT_OF_ZONE', message: `${p.modelId} must be completely inside the deployment zone`, detail: { zone } }
    const chk = isLegalPlacement(state, p.modelId, p.pos, m.base, { extra })
    if (!chk.ok) return { code: chk.code ?? 'E_PLACEMENT', message: chk.message ?? 'illegal placement' }
    extra.push({ pos: p.pos, r })
  }
  // unit rule (p116): every model within 3" of every other model in its unit
  for (const g of unitGroups(state, got).filter((x) => x.length > 1)) {
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      const pa = a.placements.find((p) => p.modelId === g[i])!, pb = a.placements.find((p) => p.modelId === g[j])!
      if (edgeDistance(pa.pos, state.models[pa.modelId]!.base, pb.pos, state.models[pb.modelId]!.base) > def.deployment.unitSpread + EPS) {
        return { code: 'E_PLACEMENT', message: `${g[i]} and ${g[j]} must be within ${def.deployment.unitSpread}" of each other` }
      }
    }
  }
  return null
}

// ---------- answers ----------
export function validateSetupAction(state: GameState, bundle: DataBundle, a: Action): Rejection | null {
  switch (a.type) {
    case 'chooseTurnOrder': return state.pending.kind === 'chooseTurnOrder' ? null : { code: 'E_WRONG_DECISION', message: 'not choosing turn order' }
    case 'chooseEdge':
      if (state.pending.kind !== 'chooseEdge') return { code: 'E_WRONG_DECISION', message: 'not choosing an edge' }
      return ['north', 'south', 'east', 'west'].includes(a.edge) ? null : { code: 'E_BAD_PAYLOAD', message: 'unknown edge' }
    case 'deploy': case 'advanceDeploy': return validateDeployment(state, bundle, a)
    case 'abilityChoice': {
      if (!isPreyChoice(state)) return { code: 'E_WRONG_DECISION', message: 'no setup choice is open' }
      const r = handleActivationAction(state, bundle, a)
      return r && 'rejection' in r ? r.rejection : null
    }
    default: return { code: 'E_WRONG_DECISION', message: `${a.type} does not answer a setup decision` }
  }
}

const isPreyChoice = (state: GameState): boolean => state.phase === 'deploy' && state.pending.kind === 'abilityChoice' && state.pending.context.data?.code === 'prey'
export const isSetupDecision = (state: GameState): boolean => ['chooseTurnOrder', 'chooseEdge', 'deploy', 'advanceDeploy'].includes(state.pending.kind) || isPreyChoice(state)

export function answerSetup(state: GameState, bundle: DataBundle, a: Action): FlowResult {
  const bad = validateSetupAction(state, bundle, a)
  if (bad) return { rejection: bad }
  if (a.type === 'chooseTurnOrder') return applyTurnOrder(state, a)
  if (a.type === 'chooseEdge') return applyEdge(state, bundle, a)
  if (a.type === 'abilityChoice') {
    const r = handleActivationAction(state, bundle, a)
    if (!r) return reject('E_WRONG_DECISION', 'no setup choice is open')
    if ('rejection' in r) return r
    return enterDeployment(r.state, bundle, r.events)
  }
  if (a.type === 'deploy' || a.type === 'advanceDeploy') {
    let s = state
    const events: GameEvent[] = []
    for (const p of a.placements) {
      const m = s.models[p.modelId]!
      s = { ...s, models: { ...s.models, [m.id]: { ...m, pos: p.pos, elev: surfaceElevation(s, p.pos, m.base), offTable: false } } }
      events.push({ type: 'ModelDeployed', modelId: m.id, pos: p.pos, advance: a.type === 'advanceDeploy' })
    }
    return enterDeployment(s, bundle, events)
  }
  return reject('E_WRONG_DECISION', 'not a setup action')
}

function applyTurnOrder(state: GameState, a: ChooseTurnOrderAction): FlowOut {
  const chooser = a.player
  const first = a.order === 'first' ? chooser : otherPlayer(chooser)
  const second = otherPlayer(first)
  const s0: GameState = { ...state, firstPlayer: first, activePlayer: first }
  const r = raise(s0, { player: second, kind: 'chooseEdge', window: 'turn.start', context: {}, canPass: false })
  const id = r.pending.id
  const options: DecisionOption[] = (['north', 'south'] as EdgeId[]).map((edge) => ({
    id: edge, label: `Deploy from the ${edge} edge`, action: { type: 'chooseEdge', decisionId: id, player: second, edge } as Action,
  }))
  const pending = { ...r.pending, options }
  return { state: { ...r.state, pending }, events: [{ type: 'TurnOrderChosen', chooser, firstPlayer: first }], pending }
}

function applyEdge(state: GameState, bundle: DataBundle, a: ChooseEdgeAction): FlowOut {
  const second = a.player
  const first = otherPlayer(second)
  const players = { ...state.players, [second]: { ...state.players[second], edge: a.edge }, [first]: { ...state.players[first], edge: OPPOSITE[a.edge] } } as Record<PlayerId, PlayerState>
  const events: GameEvent[] = [{ type: 'EdgeChosen', player: second, edge: a.edge }, { type: 'EdgeChosen', player: first, edge: OPPOSITE[a.edge] }]
  return enterDeployment({ ...state, players }, bundle, events)
}

export function setupLegalActions(state: GameState): Action[] {
  const out = (state.pending.options ?? []).map((o) => o.action)
  return out
}

export { profileOf }
