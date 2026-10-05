// Event feed lines with attack breakdowns (50 section 3 and the HUD brief). Pure: names come from the state passed in,
// numbers from the event payloads (never recomputed).
import { query, type DiceRolled, type GameEvent, type GameState, type Id } from '../../engine/index'
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

const diceText = (r: DiceRolled | undefined): string | null => {
  if (!r) return null
  const dropped = r.dice.length > r.kept.length
  return `Dice [${r.dice.join(', ')}]${dropped ? `, kept [${r.kept.join(', ')}]` : ''} = ${r.total}${r.boosted ? ' (boosted)' : ''}`
}

/** The engine's expected damage for a declared attack (unboosted), or null when it cannot be previewed. Call once per attack. */
export function expectedDamageFor(state: GameState | null, ev: Extract<GameEvent, { type: 'AttackDeclared' }>): number | null {
  if (!state || !state.models[ev.attackerId] || !state.models[ev.targetId]) return null
  try {
    const p = query.attackPreview(state, ev.attackerId, ev.weaponId ?? '', ev.targetId, { ...(ev.spellId ? { spellId: ev.spellId } : {}), additional: ev.additional })
    return p.legal ? null : p.expectedDamage
  } catch { return null }
}

const oneDp = (n: number): string => (Math.round(n * 10) / 10).toFixed(1)

/**
 * `expected` maps the seq of an AttackDeclared event to the engine's expected damage (see expectedDamageFor); rows for
 * attacks without an entry simply omit the comparison.
 */
export function buildFeed(state: GameState | null, feed: readonly Entry[], expected?: ReadonlyMap<number, number>): FeedLine[] {
  const out: FeedLine[] = []
  const name = (id: Id | undefined) => modelName(state, id)
  const rolls = new Map<string, DiceRolled>()
  for (const { event: ev } of feed) if (ev.type === 'DiceRolled') rolls.set(ev.rollId, ev)
  let curDeclared = -1
  const boosts: Record<'attack' | 'damage', number> = { attack: 0, damage: 0 }
  let turnDamage = new Map<string, number>()
  const dead = new Set<string>()
  for (const { seq, event: ev } of feed) {
    switch (ev.type) {
      case 'AttackDeclared':
        curDeclared = seq
        boosts.attack = 0; boosts.damage = 0
        out.push({ seq, tone: 'attack', text: `${name(ev.attackerId)} → ${name(ev.targetId)}: ${ev.spellId ? dataName(ev.spellId) : ev.weaponId ? dataName(ev.weaponId) : ev.kind}${ev.additional ? ' (additional)' : ''}`, detail: [] })
        break
      case 'AttackMeasured': {
        const detail = [`${ev.dice}d6 + attack stat vs DEF ${ev.hitTarget}: ${ev.autoMiss ? 'automatic miss' : ev.autoHit ? 'automatic hit' : `${pct(ev.pHit)} (${pct(ev.pHitBoosted)} boosted)`}`]
        for (const m of ev.mods) detail.push(`${m.label} ${m.mode === 'set' ? `=${m.value}` : signed(m.value)}`)
        if (!ev.los.visible) detail.push(`No line of sight (${ev.los.reasons.join(', ')})`)
        out.push({ seq, tone: 'info', text: 'Attack numbers', detail })
        break
      }
      case 'RollBoosted':
        boosts[ev.roll]++
        break
      case 'AttackResolved': {
        const detail: string[] = []
        const r = ev.rollId ? rolls.get(ev.rollId) : undefined
        const dt = diceText(r)
        if (dt) detail.push(r?.target !== undefined ? `${dt} against ${r.target}` : dt)
        if (boosts.attack > 0 && !r?.boosted) detail.push('Attack roll boosted')
        if (ev.crit) detail.push('Critical hit: the roll showed a matching pair')
        out.push({ seq, tone: ev.hit ? 'hit' : 'miss', text: ev.auto === 'hit' ? 'Automatic hit' : ev.auto === 'miss' ? 'Automatic miss' : ev.crit ? 'Critical hit!' : ev.hit ? 'Hit' : 'Miss', detail })
        break
      }
      case 'DamageRolled': {
        const i = ev.instance
        const detail = [`POW ${i.pow} + ${i.dice}d6${i.boosted ? ' (boosted)' : ''} = ${i.total ?? '?'} vs ARM ${ev.arm}`]
        const dt = diceText(rolls.get(ev.rollId))
        if (dt) detail.push(dt)
        for (const m of i.mods) detail.push(`${m.label} ${signed(m.value)}`)
        if (boosts.damage > 0 && !i.boosted) detail.push('Damage roll boosted')
        const exp = expected?.get(curDeclared)
        if (exp !== undefined && i.kind === 'direct') detail.push(`Expected about ${oneDp(exp)}, actual ${ev.points}`)
        out.push({ seq, tone: 'damage', text: `${ev.points > 0 ? `${ev.points} damage` : 'No damage'} to ${name(i.targetId)}`, detail })
        break
      }
      case 'DamageApplied':
        if (ev.points > 0) turnDamage.set(ev.targetId, (turnDamage.get(ev.targetId) ?? 0) + ev.points)
        out.push({ seq, tone: 'damage', text: ev.points > 0 ? `${name(ev.targetId)} loses ${ev.boxes.length} box${ev.boxes.length === 1 ? '' : 'es'}${ev.column ? ` (column ${ev.column})` : ''}` : `${name(ev.targetId)} is unharmed`, detail: ev.crippled.length ? [`Crippled: ${ev.crippled.join(', ')}`] : [] })
        break
      case 'LifeStateChanged': {
        if (ev.to === 'boxed' || ev.to === 'destroyed') { if (dead.has(ev.modelId)) break; dead.add(ev.modelId) }
        const t = narrate(state, ev)
        if (t) out.push({ seq, tone: 'death', text: t, detail: [] })
        break
      }
      case 'ScenarioScored': case 'KillBoxScored': case 'GameEnded': {
        const t = narrate(state, ev)
        if (t) out.push({ seq, tone: 'score', text: t, detail: ev.type === 'ScenarioScored' ? ev.sources.map((s) => `${s.reason.replace(/^controls\s+\S+/, 'held an objective')}: ${s.vp} VP`) : [] })
        break
      }
      case 'TurnEnded': {
        if (turnDamage.size > 0) {
          const rows = [...turnDamage].map(([id, n]) => `${name(id)} took ${n}`)
          const total = [...turnDamage.values()].reduce((a, b) => a + b, 0)
          out.push({ seq, tone: 'info', text: `Turn ${ev.turn} damage: ${total} in all`, detail: rows })
        }
        turnDamage = new Map()
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
