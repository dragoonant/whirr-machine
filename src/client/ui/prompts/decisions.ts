// Prompt wording for the newer engine decisions: reroll, rollAnyway, chooseGrid, channel, combinedAttack and the
// out-of-activation attacks. Pure; every number comes from pd.context / pd.options (the engine's own odds).
import type { Action, DecisionOdds, GameState, ModelId, PendingDecision } from '../../../engine/index'
import { modelName, queryDistance } from '../../contract'
import { niceName, pct, sideName } from '../format'
import type { OptionView, Tone } from '../promptView'

/** Title, extra lines and per-option notes/tones for one decision; promptView merges it into the view. */
export interface Piece {
  title: string
  lines?: string[]
  /** Option id -> replacement note. */
  notes?: Record<string, string>
  tones?: Record<string, Tone>
  labels?: Record<string, string>
  /** Option id Enter answers; null = nothing. Omitted = promptView's default. */
  defaultId?: string | null
  passLabel?: string
}

const nums = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [])
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Out-of-activation attack codes raised as chooseAttack for the attack's owner. */
export const OUT_OF_ACTIVATION_ATTACK = ['triggerAttack', 'maintenanceAttack']
export const isOutOfActivationAttack = (pd: PendingDecision): boolean =>
  pd.kind === 'chooseAttack' && OUT_OF_ACTIVATION_ATTACK.includes(String(pd.context.data?.code ?? ''))

const optOf = (pd: PendingDecision, id: string) => pd.options?.find((o) => o.id === id)

/** The player the decision is shown to, worded for the dock. */
function holderWords(state: GameState, pd: PendingDecision): string {
  const h = pd.context.data?.holder
  return typeof h === 'string' && (h === 'A' || h === 'B') ? sideName(state, h) : sideName(state, pd.player)
}

export function rerollPiece(state: GameState, pd: PendingDecision): Piece {
  const d = pd.context.data ?? {}
  const damage = d.points !== undefined
  const before = nums(d.before)
  const total = num(d.total)
  const code = typeof d.code === 'string' && d.code ? niceName(d.code) : ''
  const who = modelName(state, pd.context.modelId)
  const tgt = modelName(state, pd.context.targetId)
  const rolled = before.length
    ? `${before.join(' + ')}${total !== undefined && total !== sum(before) ? ` (${total} with bonuses)` : ` = ${sum(before)}`}`
    : total !== undefined ? String(total) : '?'
  const lines: string[] = []
  const notes: Record<string, string> = {}
  const rr = optOf(pd, 'reroll')?.odds
  const keep = optOf(pd, 'keep')?.odds
  let better = false
  if (damage) {
    const arm = num(d.armor)
    lines.push(`${holderWords(state, pd)} may re-roll the damage dice${code ? ` (${code})` : ''}. Rolled ${rolled}${arm !== undefined ? ` against ARM ${arm}` : ''}: ${num(d.points) ?? 0} damage now.`)
    if (rr?.expectedDamage !== undefined) notes.reroll = `avg ${rr.expectedDamage.toFixed(1)} damage`
    if (keep?.expectedDamage !== undefined) notes.keep = `${keep.expectedDamage} damage`
    better = (rr?.expectedDamage ?? 0) > (keep?.expectedDamage ?? 0)
  } else {
    const tn = num(d.targetNumber)
    lines.push(`${holderWords(state, pd)} may re-roll the attack dice${code ? ` (${code})` : ''}. Rolled ${rolled}${tn !== undefined ? ` against ${tn}` : ''}: ${d.hit ? (d.crit ? 'a critical hit' : 'a hit') : 'a miss'} now.`)
    if (rr?.pHit !== undefined) notes.reroll = `hit ${pct(rr.pHit)}${rr.pCrit !== undefined ? `, crit ${pct(rr.pCrit)}` : ''}`
    if (keep?.pHit !== undefined) notes.keep = d.hit ? 'keep the hit' : 'stay a miss'
    better = (rr?.pHit ?? 0) > (keep?.pHit ?? 0)
  }
  lines.push('The old dice are thrown away: the new roll stands, good or bad.')
  // re-roll by default only when the engine's own numbers say it helps; keep otherwise
  return {
    title: `Re-roll the ${damage ? 'damage' : 'attack'} roll? ${who} → ${tgt}`,
    lines, notes, tones: { reroll: 'primary', keep: 'decline' }, defaultId: better ? 'reroll' : 'keep',
  }
}

export function rollAnywayPiece(state: GameState, pd: PendingDecision): Piece {
  const o: DecisionOdds | undefined = pd.context.odds
  const tgt = modelName(state, pd.context.targetId)
  const notes: Record<string, string> = { accept: 'hit 100%' }
  if (o?.pHit !== undefined) {
    notes.roll = `hit ${pct(o.pHit)}${o.pCrit !== undefined ? `, crit ${pct(o.pCrit)}` : ''}${o.pHitBoosted !== undefined ? `, ${pct(o.pHitBoosted)} if boosted` : ''}`
  }
  return {
    title: `Automatic hit on ${tgt}: roll anyway?`,
    lines: ['This attack hits on its own. Rolling anyway could trigger a critical effect, but a poor roll can then lose the hit.'],
    notes, tones: { roll: 'primary', accept: 'decline' }, defaultId: 'accept',
  }
}

export function chooseGridPiece(state: GameState, pd: PendingDecision): Piece {
  const d = pd.context.data ?? {}
  const grids = (Array.isArray(d.grids) ? d.grids : []) as { id: string; filled: number; boxes: number; open: boolean }[]
  const notes: Record<string, string> = {}
  for (const g of grids) notes[g.id] = `${g.filled} of ${g.boxes} boxes filled${g.open ? '' : ' (full)'}`
  return {
    title: `${num(d.points) ?? '?'} damage to ${modelName(state, pd.context.targetId)}: which grid takes it?`,
    lines: ['Pick the damage grid that absorbs this hit. Only grids with room are offered.'],
    notes,
  }
}

export function channelPiece(state: GameState, pd: PendingDecision): Piece {
  const d = pd.context.data ?? {}
  const who = modelName(state, pd.context.modelId)
  const spell = typeof d.spellId === 'string' ? niceName(d.spellId) : 'the spell'
  const notes: Record<string, string> = {}
  const target = pd.context.targetId
  if (target) {
    for (const o of pd.options ?? []) {
      if (!o.id.startsWith('via:')) continue
      const dist = queryDistance(o.id.slice(4), target)
      if (Number.isFinite(dist)) notes[o.id] = `${dist.toFixed(1)}" from the target`
    }
    const cast = pd.context.modelId ? queryDistance(pd.context.modelId, target) : NaN
    if (Number.isFinite(cast)) notes.caster = `${cast.toFixed(1)}" from the target`
  }
  return {
    title: `${who}: cast ${spell} from yourself or through an arc node?`,
    lines: ['Channeling measures range and line of sight from the node instead of the caster. Pass cancels the cast and spends nothing.'],
    notes, defaultId: 'caster', passLabel: 'Cancel the cast',
  }
}

export function combinedPickerPiece(state: GameState, pd: PendingDecision): Piece {
  const d = pd.context.data ?? {}
  const who = modelName(state, pd.context.modelId)
  const tgt = modelName(state, pd.context.targetId)
  const weapon = typeof d.weaponId === 'string' ? niceName(d.weaponId) : 'the weapon'
  const eligible = (Array.isArray(d.eligible) ? d.eligible : []).filter((x): x is string => typeof x === 'string')
  const labels: Record<string, string> = {}
  const notes: Record<string, string> = {}
  for (const o of pd.options ?? []) {
    const a = o.action
    if (a.type !== 'combinedAttack') continue
    labels[o.id] = a.contributorIds.map((i) => modelName(state, i)).join(', ') || 'Nobody joins'
    notes[o.id] = `${a.contributorIds.length} join`
  }
  return {
    title: `${who}: who joins the combined ${weapon} attack on ${tgt}?`,
    lines: [`${eligible.length} model${eligible.length === 1 ? ' is' : 's are'} able to join: ${eligible.map((i) => modelName(state, i)).join(', ') || 'none'}. Each one that joins adds to the attack and damage rolls (the engine states the bonus), and they use up their own activation.`],
    labels, notes, passLabel: 'Back to the attack list',
  }
}

/** Dock buttons for chooseAttack options whose action is combinedAttack (the activation panel does not draw them). */
export function combinedButtons(state: GameState, options: OptionView[]): OptionView[] {
  return options.flatMap((o) => {
    const a = o.action
    if (a.type !== 'combinedAttack') return []
    const weapon = niceName(a.weaponId)
    const label = a.contributorIds.length
      ? `Combined ${weapon} attack on ${modelName(state, a.targetId)} with ${a.contributorIds.map((i) => modelName(state, i)).join(', ')}`
      : `Combined ${weapon} attack on ${modelName(state, a.targetId)}: choose who joins`
    return [{ ...o, label, tone: 'primary' as Tone, hoverId: a.targetId as ModelId }]
  })
}

/** Out-of-activation attack (a trigger or a maintenance-phase strike): weapon buttons with the engine's hit chance. */
export function outOfActivationPiece(state: GameState, pd: PendingDecision, options: OptionView[]): Piece {
  const code = String(pd.context.data?.code ?? '')
  const who = modelName(state, pd.context.modelId)
  const abilityId = typeof pd.context.data?.abilityId === 'string' ? pd.context.data.abilityId : ''
  const why = code === 'maintenanceAttack' ? 'Maintenance attack' : abilityId ? niceName(abilityId) : 'Free attack'
  const labels: Record<string, string> = {}
  for (const o of options) {
    const a: Action = o.action
    if (a.type === 'chooseAttack') labels[o.id] = `${niceName(a.weaponId)} → ${modelName(state, a.targetId)}`
  }
  return {
    title: `${why}: ${sideName(state, pd.player)}, ${who} may attack${pd.canPass ? ' (or pass)' : ''}`,
    lines: ['This attack happens outside anyone’s activation and costs nothing. Each button shows the chance to hit.'],
    labels,
    defaultId: options.length === 1 ? options[0]!.id : null,
    passLabel: 'No attack',
  }
}

/** Extra attacks offered while initial attacks remain: say what taking one gives up. */
export function additionalAttackLine(options: OptionView[]): string | null {
  const acts = options.map((o) => o.action).filter((a): a is Extract<Action, { type: 'chooseAttack' }> => a.type === 'chooseAttack')
  if (!acts.some((a) => a.additional) || !acts.some((a) => !a.additional)) return null
  return 'Attacks marked additional cost 1 focus. Taking one gives up the initial attacks you have not made yet.'
}
