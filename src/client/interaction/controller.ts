// Per-decision pointer/keyboard controllers (50 section 5). Pure functions over the stores: the R3F layer
// (BoardInteraction.tsx) only forwards left-button clicks here, so right/middle clicks can never move or answer.
import type { Action, DecisionOption, ModelId, ModelState, PendingDecision, Vec2 } from '../../engine/index'
import { baseRadius } from '../../engine/geometry'
import { game, queryMoveCheck, uiActions, type ClientRejection } from '../contract'
import { useUiStore } from '../store/uiStore'
import { currentPrompt, truthState } from './adapter'
import { interactionActions, useInteractionStore } from './store'

export const PLACEMENT_KINDS = new Set(['deploy', 'advanceDeploy', 'placeTroopers'])
export const TARGET_KINDS = new Set(['chargeTarget', 'chooseAttack', 'castSpell'])

type AnyAction = Action & { targetId?: ModelId; weaponId?: string; spellId?: string; activate?: string; path?: Vec2[] }
const act = (o: DecisionOption): AnyAction => o.action as AnyAction

// ---------- option helpers (also useful to the UI agent for weapon chips) ----------
/** Options of the open decision that target `targetId`. */
export const optionsTargeting = (p: PendingDecision | null, targetId: ModelId): DecisionOption[] =>
  (p?.options ?? []).filter((o) => act(o).targetId === targetId)

/** Distinct weapon/spell ids offered by the open decision (for chips). */
export function weaponChoices(p: PendingDecision | null): string[] {
  const out: string[] = []
  for (const o of p?.options ?? []) {
    const w = act(o).weaponId ?? act(o).spellId
    if (w && !out.includes(w)) out.push(w)
  }
  return out
}

/** The option a target click answers: the chosen weapon if it has one for this target, else the first. */
export function pickTargetOption(p: PendingDecision | null, targetId: ModelId, weaponId: string | null): DecisionOption | null {
  const opts = optionsTargeting(p, targetId)
  if (!opts.length) return null
  return (weaponId ? opts.find((o) => (act(o).weaponId ?? act(o).spellId) === weaponId) : null) ?? opts[0]!
}

/** The chooseActivation option for a model (or its unit). */
export function activationOption(p: PendingDecision | null, m: Pick<ModelState, 'id' | 'unitId'>): DecisionOption | null {
  if (p?.kind !== 'chooseActivation') return null
  return (p.options ?? []).find((o) => act(o).type === 'chooseActivation' && (act(o).activate === m.id || (m.unitId && act(o).activate === m.unitId))) ?? null
}

/** Model ids the open placement decision still needs placed. */
export function placementIds(p: PendingDecision | null): ModelId[] {
  if (!p || !PLACEMENT_KINDS.has(p.kind)) return []
  const ids = p.context.data?.modelIds
  return Array.isArray(ids) ? (ids as ModelId[]) : []
}

/** The model a placement click places: the selected one if it is still to be placed, else the first unplaced one. */
export function nextPlacementId(p: PendingDecision | null): ModelId | null {
  const ids = placementIds(p)
  const { selectedId } = useUiStore.getState()
  const { placements } = useInteractionStore.getState()
  return (selectedId && ids.includes(selectedId) ? selectedId : ids.find((x) => !placements[x])) ?? null
}

/**
 * Pulls a pointer point for a deployment back inside the decision's zone (`context.data.zone`, the engine's own
 * rect), inset by the model's base radius so the whole base lands inside. Decisions without a zone pass through.
 */
export function clampPlacementPoint(p: PendingDecision | null, at: Vec2, id: ModelId | null = nextPlacementId(p)): Vec2 {
  const zone = p && PLACEMENT_KINDS.has(p.kind) ? (p.context.data?.zone as { x0: number; x1: number; z0: number; z1: number } | undefined) : undefined
  if (!zone) return at
  const m = id ? truthState()?.models[id] : undefined
  const r = m ? baseRadius(m.base) + 1e-3 : 0
  const fit = (v: number, lo: number, hi: number): number => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)))
  return { x: fit(at.x, zone.x0 + r, zone.x1 - r), z: fit(at.z, zone.z0 + r, zone.z1 - r) }
}

/** Clamp a pointer point to whatever the open decision allows (free move or deployment zone). */
export const clampPointer = (p: PendingDecision | null, at: Vec2): Vec2 =>
  p?.kind === 'moveModel' ? clampMovePoint(p, at) : clampPlacementPoint(p, at)

/** Default staged path: a straight-line move (charge) takes the engine's own full-length option. */
export function defaultStraightPath(p: PendingDecision | null): Vec2[] | null {
  if (p?.kind !== 'moveModel' || !p.constraints?.straightLine) return null
  const first = (p.options ?? []).map(act).find((a) => a.type === 'moveModel' && a.path?.length)
  return first?.path ?? null
}

// ---------- move clamping ----------
const sub = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z)
const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })

/**
 * Pulls a pointer point for a free move back to the farthest legal end point on the line from the leg's start,
 * so the ghost and a click can never land outside the move. `prefix` is the already-staged waypoints when
 * appending a leg (shift-click), else empty. Geometry first (cheap), then the engine's own moveCheck refines it
 * (rough terrain, obstructions, models, table edge) by bisection along the leg.
 */
export function clampMovePoint(p: PendingDecision | null, at: Vec2, prefix: Vec2[] = []): Vec2 {
  const c = p?.kind === 'moveModel' ? p.constraints : undefined
  if (!c || c.straightLine) return at
  const from = prefix.length ? prefix[prefix.length - 1]! : c.from
  let used = 0
  let prev = c.from
  for (const w of prefix) { used += sub(prev, w); prev = w }
  let end = at
  const left = c.maxDist - used
  if (Number.isFinite(left)) {
    if (left <= 0) return from
    const d = sub(from, at)
    if (d > left) end = lerp(from, at, (left - 1e-3) / d)
  }
  const ok = (q: Vec2): boolean => !!queryMoveCheck(c.modelId, [...prefix, q])?.ok
  if (ok(end)) return end
  let lo = 0, hi = 1
  for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (ok(lerp(from, end, mid))) lo = mid; else hi = mid }
  return lo > 0 ? lerp(from, end, lo) : from
}

// ---------- multi-waypoint paths and drag (M11) ----------
/** A click this close to the last waypoint is a double-click on it: the path is done. */
export const COMMIT_RADIUS = 0.6
/** Pixels a press must travel before it counts as a drag (below that it is a click). */
export const DRAG_PX = 5

/**
 * What a table click does to the staged path. A plain click adds a waypoint (clamped by the engine's own move check
 * for the leg and the distance still left); a click ON the last waypoint (a double-click) confirms; shift-click starts
 * the path over. A click that can reach nowhere new (blocked, or no distance left) changes nothing, so it never confirms
 * a move by accident.
 */
export function nextPath(p: PendingDecision | null, staged: Vec2[], at: Vec2, shift = false): { path: Vec2[]; commit: boolean } {
  const append = !shift && staged.length > 0
  const end = staged[staged.length - 1]
  if (append && end && sub(end, at) < COMMIT_RADIUS) return { path: staged, commit: true }
  const q = clampMovePoint(p, at, append ? staged : [])
  if (append && end && sub(end, q) < 0.05) return { path: staged, commit: false }
  return { path: append ? [...staged, q] : [q], commit: false }
}

/** Can a press on this model start a drag? Only the model the open free move belongs to, in move mode, when it is not a straight-line move. */
export function canDrag(id: ModelId): boolean {
  const p = currentPrompt()
  return p?.kind === 'moveModel' && !p.constraints?.straightLine && p.constraints?.modelId === id && useUiStore.getState().mode === 'move'
}

export function startDrag(id: ModelId, sx: number, sy: number): boolean {
  const p = currentPrompt()
  if (!p || !canDrag(id)) return false
  interactionActions.startDrag(id, p.id, sx, sy)
  return true
}

/**
 * Release of a drag: the clamped drop point becomes the whole staged path (one waypoint), ready to Confirm.
 * A drop on the spot the model started from stages nothing.
 */
export function dropDrag(at: Vec2): boolean {
  const p = currentPrompt()
  const c = p?.kind === 'moveModel' ? p.constraints : undefined
  if (!p || !c || c.straightLine) return false
  const q = clampMovePoint(p, at)
  if (sub(c.from, q) < 0.05) { interactionActions.setStaged([]); return false }
  interactionActions.setStaged([q])
  return true
}

// ---------- commit / cancel ----------
export function commitStaged(): ClientRejection | null {
  const p = currentPrompt()
  if (!p) return null
  const st = useInteractionStore.getState()
  let r: ClientRejection | null = null
  if (p.kind === 'moveModel') {
    const path = st.staged.length ? st.staged : defaultStraightPath(p)
    if (!path || !p.constraints) return null
    r = game.answer({ type: 'moveModel', modelId: p.constraints.modelId, path })
  } else if (PLACEMENT_KINDS.has(p.kind)) {
    const ids = placementIds(p)
    if (!ids.length || !ids.every((id) => st.placements[id])) return null
    const placements = ids.map((modelId) => ({ modelId, pos: st.placements[modelId]! }))
    r = p.kind === 'placeTroopers' ? game.answer({ type: 'placeTroopers', placements }) : game.answer({ type: p.kind as 'deploy' | 'advanceDeploy', placements })
  } else return null
  if (!r) interactionActions.clearStaged()
  return r
}

/** Answer a deploy / placeTroopers decision with the engine's own suggested layout (option id 'auto'). */
export function autoPlace(): ClientRejection | null {
  const p = currentPrompt()
  const opt = p?.options?.find((o) => o.id === 'auto')
  if (!p || !opt) return null
  const r = game.answerOption('auto')
  if (!r) interactionActions.clearStaged()
  return r
}

export const cancelStaged = (): void => interactionActions.clearStaged()

// ---------- pointer handlers ----------
const ruler = (end: { modelId: ModelId } | { point: Vec2 }): void => {
  const { measureFrom, measureTo } = useUiStore.getState()
  if (!measureFrom || measureTo) uiActions.setMeasure(end, null)
  else uiActions.setMeasure(measureFrom, end)
}

/**
 * A click on a figure. `through` is the table point under the pointer (the camera ray's hit on y = 0): during a free
 * move, a click on any model but the mover is a click on the table behind it, so waypoints can go next to other figures.
 */
export function handleModelClick(id: ModelId, through?: { at: Vec2 | null; shift?: boolean }): void {
  const s = truthState()
  const m = s?.models[id]
  if (!m) return
  const { mode } = useUiStore.getState()
  if (mode === 'measure') { ruler({ modelId: id }); return }
  const p = currentPrompt()
  if (through?.at && mode === 'move' && p?.kind === 'moveModel' && !p.constraints?.straightLine && p.constraints?.modelId !== id) {
    handleGroundClick(through.at, through.shift ?? false)
    return
  }
  if (mode === 'los') { uiActions.select(id); return }
  if (p && TARGET_KINDS.has(p.kind)) {
    const opt = pickTargetOption(p, id, useInteractionStore.getState().weaponId)
    if (opt) { game.answerOption(opt.id); interactionActions.clearStaged(); return }
  }
  if (p?.kind === 'chooseActivation') {
    const opt = activationOption(p, m)
    if (opt) { uiActions.select(id); game.answerOption(opt.id); return }
  }
  uiActions.select(id)
}

export function handleGroundClick(at: Vec2, shift = false): void {
  const { mode, selectedId } = useUiStore.getState()
  if (mode === 'measure') { ruler({ point: at }); return }
  if (mode === 'los') return
  const p = currentPrompt()
  if (!p) { if (mode === 'select') uiActions.select(null); return }
  const st = useInteractionStore.getState()
  if (p.kind === 'moveModel') {
    if (p.constraints?.straightLine) return // the engine's own straight-line option is staged by the overlay
    const r = nextPath(p, st.staged, at, shift)
    if (r.commit) { commitStaged(); return }
    interactionActions.setStaged(r.path)
    return
  }
  if (PLACEMENT_KINDS.has(p.kind)) {
    const ids = placementIds(p)
    const id = nextPlacementId(p)
    if (!id) return
    interactionActions.setPlacement(id, clampPlacementPoint(p, at, id))
    const next = ids.find((x) => x !== id && !useInteractionStore.getState().placements[x])
    uiActions.select(next ?? id)
    return
  }
  if (mode === 'select') uiActions.select(null)
}
