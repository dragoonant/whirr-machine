// R4.0-R4.3: start of turn and the Maintenance Phase. Pure; no decisions are raised here (order choices are resolved in model-id order).
import { resolveDeath, rollDamage, applyDamage } from '../damage'
import { rollNd6 } from '../dice'
import { expireEffects, gridLayoutsOf, hasAbility, immuneToContinuous, modelStat, profileOf, removeCondition } from '../effects'
import type { GameEvent } from '../events'
import { maintenanceFocus } from '../focus'
import { afterDeaths } from '../scenario'
import { isIncorporeal } from '../code-hooks'
import type { DataBundle, GameState } from '../types'

export interface PhaseOut { state: GameState; events: GameEvent[]; ended: boolean }

const CONTINUOUS: ('fire' | 'corrosion')[] = ['fire', 'corrosion']

/** R4.0: start-of-turn effects. 'Round' effects the active player created end now (p72). Models become fresh. */
export function startOfTurn(state: GameState): { state: GameState; events: GameEvent[] } {
  const e = expireEffects(state, 'turnStart')
  const models = { ...e.state.models }
  for (const m of Object.values(models)) if (m.owner === state.activePlayer && m.activated) models[m.id] = { ...m, activated: false }
  const units = { ...e.state.units }
  for (const u of Object.values(units)) if (u.owner === state.activePlayer && u.activated) units[u.id] = { ...u, activated: false }
  // clouds end with the effect that made them, or when their own duration runs out (start of the creator's next turn)
  const events = [...e.events]
  const live = new Set(e.state.effects.map((x) => x.id))
  const clouds = e.state.clouds.filter((c) => {
    const gone = (c.effectId !== undefined && !live.has(c.effectId)) || (!!c.expires && state.turn >= c.expires.turn)
    if (gone) events.push({ type: 'CloudRemoved', cloudId: c.id })
    return !gone
  })
  return { state: { ...e.state, models, units, clouds }, events }
}

/** R4.1-R4.3: clear war-engine focus, trim casters, roll each continuous effect on the active player's models. */
export function runMaintenance(state: GameState, bundle: DataBundle): PhaseOut {
  let s: GameState = { ...state, phase: 'maintenance', window: 'maintenance.start' }
  const events: GameEvent[] = [{ type: 'PhaseChanged', phase: 'maintenance', window: 'maintenance.start' }]
  const player = s.activePlayer

  const f = maintenanceFocus(s, bundle, player); s = f.state; events.push(...f.events)

  s = { ...s, window: 'maintenance.effects' }
  events.push({ type: 'WindowOpened', window: 'maintenance.effects' })
  const ids = Object.values(s.models).filter((m) => m.owner === player && m.life === 'active' && !m.offTable).map((m) => m.id).sort()
  let anyDeath = false
  for (const id of ids) {
    for (const cond of CONTINUOUS) {
      const m = s.models[id]!
      if (m.life !== 'active' || !m.conditions.includes(cond)) continue
      if (immuneToContinuous(bundle, m, cond) || isIncorporeal(s, bundle, id)) { const r = removeCondition(s, id, cond, 'effect'); s = r.state; events.push(...r.events); continue }
      const roll = rollNd6(s, 1, 'continuous', { ownerId: id })
      s = roll.state
      const expires = roll.dice[0]! <= 2 // 1-2 expires, 3-6 resolves (R4.2)
      events.push(roll.event, { type: 'ContinuousEffectRolled', modelId: id, condition: cond, rollId: roll.event.rollId, expires })
      if (expires) { const r = removeCondition(s, id, cond, 'continuousRoll'); s = r.state; events.push(...r.events); continue }
      const layouts = gridLayoutsOf(profileOf(bundle, m))
      let points = 1 // corrosion: 1 damage point
      let rollId: string | undefined
      if (cond === 'fire') {
        const d = rollDamage(s, { pow: 12, armor: modelStat(s, bundle, id, 'ARM'), ownerId: id })
        s = d.state; events.push(...d.events); points = d.points; rollId = d.rollId
      }
      const a = applyDamage(s, id, points, { layouts, source: 'continuous', damageTypes: [cond === 'fire' ? 'fire' : 'corrosion'], instanceId: rollId })
      s = a.state; events.push(...a.events)
      if (s.models[id]!.life === 'disabled') {
        const d = resolveDeath(s, id, { tough: hasAbility(bundle, s.models[id]!, 'core.a.tough'), layouts, cause: cond })
        s = d.state; events.push(...d.events); anyDeath = true
      }
    }
  }
  if (anyDeath) {
    const r = afterDeaths(s, bundle); s = r.state; events.push(...r.events)
    return { state: s, events, ended: r.ended }
  }
  return { state: s, events, ended: false }
}
