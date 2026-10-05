// Event feed lines with attack breakdowns (50 section 3 and the HUD brief). Pure: names come from the state passed in,
// numbers from the event payloads (never recomputed).
import type { GameEvent, GameState, Id } from '../../engine/index'
import { dataName, narrate, modelName } from '../contract'
import { pct, signed } from './format'

export type FeedTone = 'info' | 'attack' | 'hit' | 'miss' | 'damage' | 'death' | 'score' | 'flow' | 'spell'
export interface FeedLine { seq: number; tone: FeedTone; text: string; detail: string[] }
interface Entry { seq: number; event: GameEvent }

/** Events that never get a row (bookkeeping the player does not need to read). */
const SKIP = new Set<GameEvent['type']>([
  'GameCreated', 'DecisionAutoResolved', 'WindowOpened', 'PhaseChanged', 'FocusChanged', 'DiceRolled', 'DiceRerolled', 'MovementChosen',
  'CombatActionChosen', 'TriggerResolved', 'ControlChecked', 'ModelDeployed', 'RollBoosted', 'AttackFinished', 'ActionRejected', 'EffectExpired',
])

export function buildFeed(state: GameState | null, feed: readonly Entry[]): FeedLine[] {
  const out: FeedLine[] = []
  const name = (id: Id | undefined) => modelName(state, id)
  for (const { seq, event: ev } of feed) {
    switch (ev.type) {
      case 'AttackDeclared':
        out.push({ seq, tone: 'attack', text: `${name(ev.attackerId)} → ${name(ev.targetId)}: ${ev.spellId ? dataName(ev.spellId) : ev.weaponId ? dataName(ev.weaponId) : ev.kind}${ev.additional ? ' (additional)' : ''}`, detail: [] })
        break
      case 'AttackMeasured': {
        const detail = [`${ev.dice}d6 + attack stat vs DEF ${ev.hitTarget}: ${ev.autoMiss ? 'automatic miss' : ev.autoHit ? 'automatic hit' : `${pct(ev.pHit)} (${pct(ev.pHitBoosted)} boosted)`}`]
        for (const m of ev.mods) detail.push(`${m.label} ${m.mode === 'set' ? `=${m.value}` : signed(m.value)}`)
        if (!ev.los.visible) detail.push(`No line of sight (${ev.los.reasons.join(', ')})`)
        out.push({ seq, tone: 'info', text: 'Attack numbers', detail })
        break
      }
      case 'AttackResolved':
        out.push({ seq, tone: ev.hit ? 'hit' : 'miss', text: ev.auto === 'hit' ? 'Automatic hit' : ev.auto === 'miss' ? 'Automatic miss' : ev.crit ? 'Critical hit!' : ev.hit ? 'Hit' : 'Miss', detail: [] })
        break
      case 'DamageRolled': {
        const i = ev.instance
        const detail = [`POW ${i.pow} + ${i.dice}d6${i.boosted ? ' (boosted)' : ''} = ${i.total ?? '?'} vs ARM ${ev.arm}`]
        for (const m of i.mods) detail.push(`${m.label} ${signed(m.value)}`)
        out.push({ seq, tone: 'damage', text: `${ev.points > 0 ? `${ev.points} damage` : 'No damage'} to ${name(i.targetId)}`, detail })
        break
      }
      case 'DamageApplied':
        out.push({ seq, tone: 'damage', text: ev.points > 0 ? `${name(ev.targetId)} loses ${ev.boxes.length} box${ev.boxes.length === 1 ? '' : 'es'}${ev.column ? ` (column ${ev.column})` : ''}` : `${name(ev.targetId)} is unharmed`, detail: ev.crippled.length ? [`Crippled: ${ev.crippled.join(', ')}`] : [] })
        break
      case 'LifeStateChanged': {
        const t = narrate(state, ev)
        if (t) out.push({ seq, tone: 'death', text: t, detail: [] })
        break
      }
      case 'ScenarioScored': case 'KillBoxScored': case 'GameEnded': {
        const t = narrate(state, ev)
        if (t) out.push({ seq, tone: 'score', text: t, detail: ev.type === 'ScenarioScored' ? ev.sources.map((s) => `${s.reason.replace(/^controls\s+\S+/, 'held an objective')}: ${s.vp} VP`) : [] })
        break
      }
      case 'RoundStarted': case 'TurnStarted': case 'ActivationStarted': {
        const t = narrate(state, ev)
        if (t) out.push({ seq, tone: 'flow', text: t, detail: [] })
        break
      }
      case 'SpellCast': case 'FeatUsed': {
        const t = narrate(state, ev)
        if (t) out.push({ seq, tone: 'spell', text: t, detail: ev.type === 'SpellCast' ? [`Cost ${ev.cost} focus`] : [] })
        break
      }
      case 'EffectApplied': out.push({ seq, tone: 'spell', text: `${ev.name} on ${ev.targetIds.map(name).join(', ')}`, detail: [] }); break
      case 'UpkeepPaid': out.push({ seq, tone: 'spell', text: `Upkeep kept for ${name(ev.casterId)}`, detail: [] }); break
      default: {
        if (SKIP.has(ev.type)) break
        const t = narrate(state, ev)
        if (t) out.push({ seq, tone: 'info', text: t, detail: [] })
      }
    }
  }
  return out
}
