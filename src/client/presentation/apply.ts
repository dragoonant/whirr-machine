// Advance a DISPLAY snapshot by one event, using only the results the event carries (positions, boxes, focus
// after, VP after). No rules arithmetic: anything an event does not spell out waits for the batch-end snap to the
// true engine state (director.ts), so the presented state can lag but never disagree.
import type { BoxRef, DamageState, GameEvent, GameState, ModelState } from '../../engine/index'

function withModel(s: GameState, id: string, f: (m: ModelState) => ModelState): GameState {
  const m = s.models[id]
  if (!m) return s
  return { ...s, models: { ...s.models, [id]: f(m) } }
}

function fillBoxes(d: DamageState, boxes: readonly BoxRef[], value: boolean): DamageState {
  if (!boxes.length) return d
  if (d.track === 'single') {
    const filled = Math.max(0, Math.min(d.boxes, d.filled + (value ? boxes.length : -boxes.length)))
    return { ...d, filled }
  }
  const grids = d.grids.map((g) => ({ ...g, cols: g.cols.map((c) => [...c]) }))
  for (const b of boxes) {
    const g = grids.find((x) => x.id === (b.grid ?? 'main')) ?? grids[0]
    const col = g?.cols[b.col]
    if (col && b.row >= 0 && b.row < col.length) col[b.row] = value
  }
  return { ...d, grids }
}

export function applyEvent(s: GameState, ev: GameEvent): GameState {
  switch (ev.type) {
    case 'ModelMoved':
      return withModel(s, ev.modelId, (m) => ({ ...m, pos: ev.to, elev: ev.elevAfter, offTable: ev.kind === 'ambush' ? false : m.offTable }))
    case 'ModelDeployed':
      return withModel(s, ev.modelId, (m) => ({ ...m, pos: ev.pos }))
    case 'TroopersPlaced': {
      let out = s
      for (const p of ev.placements) out = withModel(out, p.modelId, (m) => ({ ...m, pos: p.pos }))
      return out
    }
    case 'FocusChanged':
      return withModel(s, ev.modelId, (m) => ({ ...m, focus: ev.after }))
    case 'DamageApplied':
      return withModel(s, ev.targetId, (m) => ({ ...m, damage: fillBoxes(m.damage, ev.boxes, true) }))
    case 'Healed':
      return withModel(s, ev.modelId, (m) => ({ ...m, damage: fillBoxes(m.damage, ev.boxes, false) }))
    case 'LifeStateChanged':
      return withModel(s, ev.modelId, (m) => ({ ...m, life: ev.to }))
    case 'ConditionAdded':
      return withModel(s, ev.modelId, (m) => (m.conditions.includes(ev.condition) ? m : { ...m, conditions: [...m.conditions, ev.condition] }))
    case 'ConditionRemoved':
      return withModel(s, ev.modelId, (m) => ({ ...m, conditions: m.conditions.filter((c) => c !== ev.condition) }))
    case 'SystemCrippled':
      return withModel(s, ev.modelId, (m) => (m.crippled.includes(ev.system) ? m : { ...m, crippled: [...m.crippled, ev.system] }))
    case 'SystemRestored':
      return withModel(s, ev.modelId, (m) => ({ ...m, crippled: m.crippled.filter((x) => x !== ev.system) }))
    case 'ScenarioScored':
      return { ...s, scenario: { ...s.scenario, vp: { ...ev.vp } } }
    case 'ControlChecked':
      return { ...s, scenario: { ...s.scenario, elements: ev.elements } }
    case 'RoundStarted':
      return { ...s, round: ev.round }
    case 'TurnStarted':
      return { ...s, round: ev.round, turn: ev.turn, activePlayer: ev.player }
    case 'PhaseChanged':
      return { ...s, phase: ev.phase, window: ev.window }
    default:
      return s
  }
}
