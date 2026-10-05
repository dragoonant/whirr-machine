// Per-decision pointer/keyboard controllers (50 section 5). Pure functions over the stores: the R3F layer
// (BoardInteraction.tsx) only forwards left-button clicks here, so right/middle clicks can never move or answer.
import type { Action, DecisionOption, ModelId, ModelState, PendingDecision, Vec2 } from '../../engine/index'
import { game, uiActions, type ClientRejection } from '../contract'
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

/** Default staged path: a straight-line move (charge) takes the engine's own full-length option. */
export function defaultStraightPath(p: PendingDecision | null): Vec2[] | null {
  if (p?.kind !== 'moveModel' || !p.constraints?.straightLine) return null
  const first = (p.options ?? []).map(act).find((a) => a.type === 'moveModel' && a.path?.length)
  return first?.path ?? null
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

export function handleModelClick(id: ModelId): void {
  const s = truthState()
  const m = s?.models[id]
  if (!m) return
  const { mode } = useUiStore.getState()
  if (mode === 'measure') { ruler({ modelId: id }); return }
  const p = currentPrompt()
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
    // clicking on the staged end point commits it
    const end = st.staged[st.staged.length - 1]
    if (end && Math.hypot(end.x - at.x, end.z - at.z) < 0.6) { commitStaged(); return }
    interactionActions.setStaged(shift && st.staged.length ? [...st.staged, at] : [at])
    return
  }
  if (PLACEMENT_KINDS.has(p.kind)) {
    const ids = placementIds(p)
    const id = (selectedId && ids.includes(selectedId) ? selectedId : ids.find((x) => !st.placements[x]))
    if (!id) return
    interactionActions.setPlacement(id, at)
    const next = ids.find((x) => x !== id && !useInteractionStore.getState().placements[x])
    uiActions.select(next ?? id)
    return
  }
  if (mode === 'select') uiActions.select(null)
}
