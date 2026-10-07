// Decision prompts that explain themselves (50 section 3). Pure: turns (state, pending) into text and buttons.
// Every number comes from pending.context / pending.options / state.attack / engine queries; nothing is derived here.
import type { Action, DecisionKind, DecisionOption, GameState, Id, ModelId, PendingDecision } from '../../engine/index'
import { engineDescribe, modelName, queryDistance, queryThreat } from '../contract'
import { dataText } from './data'
import { MOVE_LABEL, boxesLeft, niceName, oddsText, pct } from './format'
import { costWords, isForcedCost, payWords } from './fury/furyView'

export type Tone = 'primary' | 'neutral' | 'decline'
export interface OptionView {
  id: string
  label: string
  /** "1 focus" */
  cost?: string
  /** Engine odds, worded ("72% -> 91%", "avg 3.1, kill 8%") or a short note. */
  note?: string
  /** The cost makes a warbeast gain fury (drawn red). */
  forced?: boolean
  tone: Tone
  action: Action
  /** Model to highlight on the board while the button is hovered. */
  hoverId?: ModelId
}
/** Which widget renders the prompt body. */
export type PromptForm = 'buttons' | 'panel' | 'board' | 'upkeep' | 'shake' | 'allocate' | 'leech' | 'transfer' | 'vent'
export interface PromptView {
  kind: DecisionKind
  testid: string
  title: string
  lines: string[]
  options: OptionView[]
  /** Option Enter answers; null when Enter should do nothing (a mis-click must not skip a choice). */
  defaultId: string | null
  canPass: boolean
  passLabel: string
  form: PromptForm
}

const YES_NO_KINDS: DecisionKind[] = ['boostAttack', 'boostDamage', 'powerField', 'rollAnyway', 'reroll']
/** Kinds whose buttons live in the activation panel (the dock shows a one-line instruction). */
const PANEL_KINDS: DecisionKind[] = ['chooseMovement', 'chooseCombatAction', 'chooseAttack']
const BOARD_KINDS: DecisionKind[] = ['deploy', 'advanceDeploy', 'moveModel', 'placeTroopers']

/** "avengingForce" -> "Avenging Force". */
export const codeWords = (code: string): string => code.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())

/** Plain label for an action when the engine supplied no option list (setup decisions answered from legalActions). */
export function actionLabel(a: Action, state: GameState | null): string {
  switch (a.type) {
    case 'chooseTurnOrder': return a.order === 'first' ? 'Go first' : 'Go second'
    case 'chooseEdge': return `Take the ${a.edge} edge`
    case 'chooseActivation': return `Activate ${modelName(state, a.activate)}`
    case 'endTurn': return 'End turn'
    case 'pass': return 'Pass'
    case 'ack': return 'Continue'
    case 'chargeTarget': return `Charge ${modelName(state, a.targetId)}`
    case 'chooseMovement': return MOVE_LABEL[a.option] ?? a.option
    case 'boostAttack': case 'boostDamage': return a.boost ? 'Boost (1 focus)' : 'No boost'
    case 'powerField': return a.spend ? 'Spend 1 focus' : 'Take the damage'
    case 'reroll': return a.reroll ? 'Re-roll' : 'Keep the roll'
    case 'rollAnyway': return a.roll ? 'Roll anyway' : 'Keep the auto-hit'
    default: return a.type
  }
}

/** Swap raw model and unit ids inside engine-written labels for display names. */
export const humanize = (state: GameState, text: string): string =>
  text.replace(/\b[AB]:[\w.]*\w/g, (id) => (state.models[id] || state.units[id] ? modelName(state, id) : id))

function toView(o: DecisionOption, state: GameState, kind: DecisionKind, ctxModel?: ModelId, slam = false): OptionView {
  const a = o.action
  let label = humanize(state, o.label)
  let note = oddsText(o.odds)
  let hoverId: ModelId | undefined
  let tone: Tone = 'neutral'
  if (a.type === 'chooseActivation') {
    label = `Activate ${modelName(state, a.activate)}`
    const u = state.units[a.activate]
    hoverId = u ? u.troopers[0] : a.activate
    tone = 'primary'
    const m = state.models[a.activate]
    if (m) note = `${niceName(m.profileId)}${m.focus ? `, ${m.focus} focus` : ''}`
    else if (u) note = `${u.troopers.length} models`
  } else if (a.type === 'endTurn') { label = 'End turn' }
  else if (a.type === 'chargeTarget') {
    const t = state.models[a.targetId]
    label = `${slam ? 'Slam' : 'Charge'} ${modelName(state, a.targetId)}`
    hoverId = a.targetId
    const lead = ctxModel
    if (t && lead) {
      const d = queryDistance(lead, a.targetId)
      const th = queryThreat(lead)
      if (Number.isFinite(d) && th) note = `${d.toFixed(1)}" away, reach ${slam ? (th.slam ?? th.charge) : th.charge}"`
    }
  } else if (a.type === 'chooseTurnOrder' || a.type === 'chooseEdge') { label = actionLabel(a, state); tone = 'primary' }
  else if ((kind === 'boostAttack' || kind === 'boostDamage') && (a.type === 'boostAttack' || a.type === 'boostDamage')) {
    tone = a.boost ? 'primary' : 'decline'
  } else if (kind === 'powerField' && a.type === 'powerField') tone = a.spend ? 'primary' : 'decline'
  else if (kind === 'abilityChoice' && /^(no|skip|decline)$/i.test(o.id)) tone = 'decline'
  const cost = costWords(o.cost, ctxModel ? modelName(state, ctxModel) : undefined)
  return { id: o.id, label, ...(cost ? { cost } : {}), ...(isForcedCost(o.cost) ? { forced: true } : {}), ...(note ? { note } : {}), tone, action: a, ...(hoverId ? { hoverId } : {}) }
}

const eq = (a: Action, b: Action): boolean => JSON.stringify(a) === JSON.stringify(b)
/** True when the engine lists this exact action among its legal answers. */
export const isLegal = (legal: readonly Action[], a: Action): boolean => legal.some((l) => eq(l, a))

/** Build the prompt for a pending decision. `legal` backs decisions that have no option list (setup). */
export function buildPromptView(state: GameState, pd: PendingDecision, legal: readonly Action[] = []): PromptView {
  const ctx = pd.context
  const n = (id: Id | undefined) => modelName(state, id)
  const who = n(ctx.modelId)
  const tgt = n(ctx.targetId)
  const atk = state.attack
  // decisions raised by an effect outside an activation (e.g. a spell that lets a model move and strike)
  const effectCode = typeof ctx.data?.code === 'string' && ctx.data.code !== 'prey' && ctx.data.code !== 'powerfulAttack' ? ctx.data.code : ''
  const lines: string[] = []
  let title = ''
  let form: PromptForm = 'buttons'
  let options: OptionView[] = (pd.options ?? []).map((o) => toView(o, state, pd.kind, ctx.modelId, ctx.data?.mode === 'slam'))
  if (!options.length && !PANEL_KINDS.includes(pd.kind)) {
    options = legal.filter((a) => a.type !== 'pass').map((a, i) => ({ id: `legal${i}`, label: actionLabel(a, state), tone: 'neutral' as Tone, action: a }))
  }
  const byBoost = (b: boolean) => options.find((o) => (o.action.type === 'boostAttack' || o.action.type === 'boostDamage') && o.action.boost === b)
  const rawOf = (o: OptionView | undefined) => pd.options?.find((x) => x.id === o?.id)

  switch (pd.kind) {
    case 'boostAttack': {
      const price = payWords(state, ctx.modelId, rawOf(byBoost(true))?.cost)
      const o = ctx.odds
      const odds = o?.pHit !== undefined && o.pHitBoosted !== undefined ? ` — ${pct(o.pHit)} → ${pct(o.pHitBoosted)}` : ''
      const roll = atk ? `${atk.dice}d6 vs DEF ${atk.hitTarget}` : ''
      title = `Boost attack? ${who} → ${tgt}${roll ? `: ${roll}` : ''}${odds} (${price})`
      if (atk) {
        lines.push(...engineDescribe.mods(atk.mods).map((l) => `${l.label} ${l.value}`))
        if (atk.autoHit) lines.push('Automatic hit; the roll only matters for a critical.')
      }
      break
    }
    case 'boostDamage': {
      const no = rawOf(byBoost(false))?.odds, yes = rawOf(byBoost(true))?.odds
      const pow = atk ? `POW ${atk.powDirect}${atk.damageTarget !== undefined ? ` vs ARM ${atk.damageTarget}` : ''}` : ''
      const bits: string[] = []
      if (no?.expectedDamage !== undefined && yes?.expectedDamage !== undefined) bits.push(`avg ${no.expectedDamage.toFixed(1)} → ${yes.expectedDamage.toFixed(1)}`)
      if (no?.pKill !== undefined && yes?.pKill !== undefined) bits.push(`kill ${pct(no.pKill)} → ${pct(yes.pKill)}`)
      title = `Boost damage? ${who} → ${tgt}${pow ? `: ${pow}` : ''}${bits.length ? ` — ${bits.join('; ')}` : ''}`
      break
    }
    case 'rollAnyway': {
      const crit = ctx.odds?.pCrit
      title = `Automatic hit on ${tgt}. Roll anyway for a critical?${crit !== undefined ? ` Crit chance ${pct(crit)}` : ''}`
      break
    }
    case 'reroll': {
      const dice = atk?.dieValues?.length ? `Rolled ${atk.dieValues.join(' + ')}` : 'Rolled'
      const need = atk ? ` vs ${atk.hitTarget}` : ''
      title = `Re-roll${ctx.data?.code ? ` (${niceName(String(ctx.data.code))})` : ''}? ${dice}${need}${ctx.odds?.pHit !== undefined ? ` — re-roll hits ${pct(ctx.odds.pHit)}` : ''}`
      break
    }
    case 'powerField': {
      const pts = Number(ctx.data?.points ?? 0)
      title = `Power Field: ${pts} damage incoming to ${who} (${ctx.modelId ? boxesLeft(state, ctx.modelId) : 0} boxes left)`
      lines.push('Spending 1 focus shrinks the damage; the buttons show the result.')
      break
    }
    case 'chargeTarget':
      if (ctx.data?.mode === 'slam') { title = `${who}: choose a slam target`; lines.push('Each button shows the engine’s distance against the slam reach.') }
      else { title = `${who}: choose a charge target`; lines.push('Each button shows the engine’s distance against the charge reach.') }
      break
    case 'castSpell': title = `${who}: cast a spell`; break
    case 'useFeat': title = `${who}: use the feat?`; break
    case 'triggerWindow': {
      const id = String(ctx.data?.triggerId ?? '')
      title = `${niceName(id)}: ${who}`
      const t = dataText(id)
      if (t) lines.push(t)
      break
    }
    case 'abilityChoice': {
      const code = String(ctx.data?.code ?? '')
      if (code === 'powerfulAttack') {
        const o = ctx.odds
        title = `Powerful Attack: ${who} → ${tgt}${o?.pHit !== undefined && o.pHitBoosted !== undefined ? ` — ${pct(o.pHit)} → ${pct(o.pHitBoosted)}` : ''}`
        lines.push('One focus boosts both the attack roll and the damage roll.')
      } else if (code === 'prey') {
        const hunter = ctx.unitId ?? (typeof ctx.data?.unitId === 'string' ? ctx.data.unitId : undefined) ?? ctx.modelId
        title = `Choose a Prey for ${hunter ? n(hunter) : 'this unit'}`
        lines.push('Prey is the one enemy model this unit is hunting. Its attack and damage rolls against that model get +2. When the prey is destroyed, you pick a new one.')
      }
      else title = `${code ? niceName(code) : 'Choose'}: ${who}`
      break
    }
    case 'chooseActivation':
      title = options.some((o) => o.action.type === 'endTurn') ? 'Everything has activated. End your turn.' : 'Pick a model or unit to activate'
      break
    case 'chooseTurnOrder': title = 'You won the roll-off: who goes first?'; break
    case 'chooseEdge': title = 'Choose your table edge'; break
    case 'chooseBoxes': title = `${tgt || who}: choose where the damage lands`; break
    case 'chooseGrid': title = `${who}: choose a damage grid`; break
    case 'channel': title = `${who}: channel through an arc node?`; break
    case 'combinedAttack': title = `${who}: combined attack`; break
    case 'leech':
      title = `Leech fury: ${who}`
      lines.push('Take fury off warbeasts in your control range so they are less likely to frenzy. You can hold up to your ARC.')
      form = 'leech'
      break
    case 'transferDamage':
      title = `Transfer the damage? ${Number(ctx.data?.points ?? 0)} incoming to ${who}`
      lines.push('Pay 1 fury to move this hit onto a warbeast in your control range. Whatever it cannot hold comes back to you.')
      form = 'transfer'
      break
    case 'adjustFury':
      title = `${who} is done with its frenzy: vent any fury?`
      form = 'vent'
      break
    case 'reave':
      title = `${who} has fallen holding fury: who takes it?`
      lines.push('Pick the model that reaves the fury, or let it go.')
      break
    case 'payUpkeep': title = 'Upkeep: pick the spells to keep'; form = 'upkeep'; break
    case 'shake': title = 'Shake off effects (1 focus or fury each)'; form = 'shake'; break
    case 'allocateFocus': title = 'Allocate focus to your war engines'; form = 'allocate'; break
    case 'maintenanceOrder': title = 'Choose the order effects resolve'; break
    case 'chooseMovement': title = `${who}: choose Normal Movement`; form = 'panel'; break
    case 'chooseCombatAction': title = `${who}: choose a Combat Action`; form = 'panel'; break
    case 'chooseAttack':
      title = effectCode ? `${codeWords(effectCode)}: ${who} may make one attack${pd.canPass ? ' (or pass)' : ''}` : `${who}: choose attacks, or end the activation`
      form = 'panel'
      break
    case 'deploy': title = 'Deployment: place your models in your zone'; form = 'board'; break
    case 'advanceDeploy': title = 'Advance Deployment: these models may start further forward'; form = 'board'; break
    case 'moveModel': {
      const trig = ctx.data?.trigger as { abilityId?: string; dist?: number; mode?: string } | undefined
      if (ctx.data?.mode === 'trample') {
        title = `Trample: ${who} moves in a straight line through the enemy`
      } else if (trig?.abilityId) {
        title = `${niceName(trig.abilityId)}: ${who} may ${trig.mode === 'place' ? 'be placed' : 'move'} up to ${trig.dist ?? '?'}"${pd.canPass ? ' (optional)' : ''}`
        const t = dataText(trig.abilityId)
        if (t) lines.push(t)
      } else if (effectCode) {
        title = `${codeWords(effectCode)}: ${who} may advance up to ${pd.constraints?.maxDist ?? '?'}"`
        lines.push('A spell or ability lets this model move outside its activation. Stay put is allowed.')
      } else title = pd.constraints?.straightLine ? `${who}: charge in a straight line` : `${who}: choose where to move`
      form = 'board'
      break
    }
    case 'placeTroopers': title = `${who}: place the troopers around the unit`; form = 'board'; break
    default: title = `${who}: ${niceName(pd.kind)}`
  }
  if (BOARD_KINDS.includes(pd.kind)) form = 'board'
  if (PANEL_KINDS.includes(pd.kind)) options = []
  const defaultId = YES_NO_KINDS.includes(pd.kind) ? (options.find((o) => o.tone === 'decline')?.id ?? options[0]?.id ?? null)
    : form === 'buttons' && options.length === 1 ? options[0]!.id : null
  return {
    kind: pd.kind, testid: `prompt-${pd.kind}`, title, lines, options, defaultId, canPass: pd.canPass,
    passLabel: pd.kind === 'moveModel' ? 'Skip this move' : pd.kind === 'allocateFocus' ? 'Keep all focus' : pd.kind === 'payUpkeep' ? 'Drop all' : pd.kind === 'triggerWindow' ? 'Skip' : pd.kind === 'advanceDeploy' ? 'Skip' : 'Pass',
    form,
  }
}

/** Test id for a prompt button: the boost buttons keep the documented names. */
export function optionTestId(kind: DecisionKind, o: OptionView): string {
  if (kind === 'boostAttack' || kind === 'boostDamage') {
    const a = o.action
    if (a.type === 'boostAttack' || a.type === 'boostDamage') return a.boost ? 'prompt-boost-yes' : 'prompt-boost-no'
  }
  return `prompt-option-${o.id}`
}
