// Pure UI state: selection, hover, the active tool mode and the ruler/LOS endpoints. Never holds rules numbers.
import { create } from 'zustand'
import type { DecisionKind, Id, ModelId, Vec2 } from '../../engine/index'

/**
 * What a board click means right now.
 * - select:  click a model to select it (and to activate it during chooseActivation)
 * - move:    drag the selected model along a path (moveModel, deploy, placeTroopers)
 * - target:  click an enemy to target it (chargeTarget, chooseAttack, castSpell)
 * - measure: ruler tool (M); never answers a decision
 * - los:     LOS view (L) from the selected model to the hovered one; never answers a decision
 */
export type UiMode = 'select' | 'move' | 'target' | 'measure' | 'los'

/** A ruler endpoint: a model (edge-to-edge) or a table point. */
export type MeasureEnd = { modelId: ModelId } | { point: Vec2 }

export interface UiState {
  selectedId: ModelId | Id | null // a model id or a unit id
  hoverId: ModelId | null
  mode: UiMode
  /** True when the player picked measure/los themselves; decision changes then leave the mode alone. */
  modeLocked: boolean
  measureFrom: MeasureEnd | null
  measureTo: MeasureEnd | null
  showThreat: boolean // T
  panel: string | null // which side panel is open (free-form id owned by the UI agent)
}

export const INITIAL_UI: UiState = {
  selectedId: null, hoverId: null, mode: 'select', modeLocked: false, measureFrom: null, measureTo: null, showThreat: false, panel: null,
}

export const useUiStore = create<UiState>(() => ({ ...INITIAL_UI }))

/** The mode a decision naturally puts the board in. */
export function modeForDecision(kind: DecisionKind | null | undefined): UiMode {
  switch (kind) {
    case 'moveModel': case 'deploy': case 'advanceDeploy': case 'placeTroopers': return 'move'
    case 'chargeTarget': case 'chooseAttack': case 'castSpell': return 'target'
    default: return 'select'
  }
}

export const ui = {
  select(id: ModelId | Id | null): void { useUiStore.setState({ selectedId: id }) },
  hover(id: ModelId | null): void { if (useUiStore.getState().hoverId !== id) useUiStore.setState({ hoverId: id }) },
  /** Player-chosen mode. measure/los lock the mode until the player leaves it; select/move/target unlock. */
  setMode(mode: UiMode): void {
    const locked = mode === 'measure' || mode === 'los'
    useUiStore.setState({ mode, modeLocked: locked, ...(mode !== 'measure' ? { measureFrom: null, measureTo: null } : {}) })
  },
  /** Toggle a tool: pressing M twice returns to the decision's own mode. */
  toggleTool(mode: 'measure' | 'los', fallback: UiMode = 'select'): void {
    const s = useUiStore.getState()
    if (s.mode === mode) useUiStore.setState({ mode: fallback, modeLocked: false, measureFrom: null, measureTo: null })
    else ui.setMode(mode)
  },
  /** Called when a new human prompt opens: follow the decision unless a tool is locked. */
  followDecision(kind: DecisionKind | null, modelId?: ModelId): void {
    const s = useUiStore.getState()
    const patch: Partial<UiState> = {}
    if (!s.modeLocked) patch.mode = modeForDecision(kind)
    if (modelId && s.selectedId !== modelId) patch.selectedId = modelId
    if (Object.keys(patch).length) useUiStore.setState(patch)
  },
  setMeasure(from: MeasureEnd | null, to: MeasureEnd | null = null): void { useUiStore.setState({ measureFrom: from, measureTo: to }) },
  toggleThreat(): void { useUiStore.setState((s) => ({ showThreat: !s.showThreat })) },
  openPanel(panel: string | null): void { useUiStore.setState({ panel }) },
  reset(): void { useUiStore.setState({ ...INITIAL_UI }) },
}
