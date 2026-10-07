// What the activation panel offers the selected model: Normal Movement, Combat Actions, attacks with engine odds,
// spells with costs and the feat. Built only from pending.options (engine-legal answers) and engine queries.
import type { Action, GameState, Id, ModelId, PendingDecision } from '../../engine/index'
import { modelName, queryAttackPreview, queryDistance, queryThreat } from '../contract'
import { dataText, profileOf, spellRec, weaponRec } from './data'
import { COMBAT_TIP, MOVE_LABEL, MOVE_TIP, niceName, pct } from './format'
import { costWords, furyBadge, isForcedCost } from './fury/furyView'
import { humanize, isLegal, type Tone } from './promptView'

export interface Button { id: string; label: string; cost?: string; /** The cost makes a warbeast gain fury. */ forced?: boolean; note?: string; /** Hover explanation, shown after a short delay. */ tip?: string; tone: Tone; action: Action; enabled: boolean; hoverId?: ModelId; testid: string }
export interface AttackRow extends Button { weaponId: Id; targetId: ModelId; additional: boolean; detail: string[] }
export interface SpellRow {
  spellId: Id; name: string; cost: number; /** What the caster pays: warlocks pay fury, everything else focus. */ unit: 'focus' | 'fury'; reach: string; text: string; offensive: boolean
  /** One button per legal way to cast it now (per target); empty when it cannot be cast at this point. */
  casts: Button[]
}
export interface ActionGroups {
  movement: Button[]
  combat: Button[]
  attacks: AttackRow[]
  endAttacks: Button | null
  spells: SpellRow[]
  /** Fury-only any-time options: rile, shed, heal, take control, animi. */
  fury: Button[]
  /** Why a warbeast cannot be forced right now (from query.fury), or null. */
  forceNote: string | null
  feat: Button | null
  featSpent: boolean
  endTurn: Button | null
  /** The decision belongs to this model (its buttons are shown). */
  active: boolean
}

const EMPTY: ActionGroups = { movement: [], combat: [], attacks: [], endAttacks: null, spells: [], fury: [], forceNote: null, feat: null, featSpent: false, endTurn: null, active: false }

export function groupActions(state: GameState, pd: PendingDecision | null, legal: readonly Action[], subject: ModelId | undefined): ActionGroups {
  if (!pd || !subject) return EMPTY
  const m = state.models[subject]
  const decidingModel = pd.context.modelId
  const forSubject = decidingModel === subject
  const g: ActionGroups = { ...EMPTY, movement: [], combat: [], attacks: [], spells: [], fury: [] }
  const unit: 'focus' | 'fury' = m?.fury !== undefined ? 'fury' : 'focus'
  const isBeast = m?.type === 'beast'
  if (forSubject && m?.fury !== undefined && isBeast) {
    const fb = furyBadge(state, subject)
    if (fb && !fb.forceable && !fb.wild && fb.blockText) g.forceNote = `Cannot be forced right now: ${fb.blockText.toLowerCase()}.`
  }
  const mk = (o: NonNullable<PendingDecision['options']>[number], extra: Partial<Button> = {}): Button => ({
    id: o.id, label: humanize(state, o.label), ...(costWords(o.cost, modelName(state, subject)) ? { cost: costWords(o.cost, modelName(state, subject)) } : {}), ...(isForcedCost(o.cost) ? { forced: true } : {}), tone: 'neutral', action: o.action,
    enabled: isLegal(legal, o.action), testid: `act-${o.id}`, ...extra,
  })
  for (const o of pd.options ?? []) {
    const a = o.action
    if (a.type === 'endTurn') { g.endTurn = mk(o, { label: 'End turn', testid: 'act-end-turn', tone: 'primary' }); continue }
    if (!forSubject) continue
    g.active = true
    switch (a.type) {
      case 'chooseMovement': {
        const th = m ? queryThreat(subject) : null
        const reach = th ? (a.option === 'advance' ? th.advance : a.option === 'run' ? th.run : a.option === 'charge' ? th.charge : null) : null
        g.movement.push(mk(o, {
          label: MOVE_LABEL[a.option] && o.label === a.option ? MOVE_LABEL[a.option]! : o.label, testid: `act-move-${a.option}`,
          ...(reach !== null && reach > 0 ? { note: `up to ${reach}"` } : {}),
          ...(a.option === 'forfeit' ? { tone: 'decline' as Tone } : {}),
          ...(MOVE_TIP[a.option] ? { tip: MOVE_TIP[a.option] } : {}),
        }))
        break
      }
      case 'chooseCombatAction': {
        const tip = (a.abilityId && dataText(a.abilityId)) || COMBAT_TIP[a.choice]
        g.combat.push(mk(o, { testid: `act-combat-${o.id}`, ...(a.choice === 'forfeit' ? { tone: 'decline' as Tone } : {}), ...(tip ? { tip } : {}) }))
        break
      }
      case 'chooseAttack': g.attacks.push(attackRow(state, o, a, legal)); break
      case 'powerAttack': {
        const t = a.targetId
        g.attacks.push({ ...mk(o, { testid: `act-power-${a.kind}-${t}`, label: `${niceName(a.kind)} ${modelName(state, t)}`, hoverId: t }), weaponId: a.weaponId ?? '', targetId: t, additional: false, detail: [] })
        break
      }
      case 'endAttacks': g.endAttacks = mk(o, { label: 'End attacks', testid: 'act-end-attacks', tone: 'decline' }); break
      case 'castSpell': {
        if (a.animusOf || isBeast) {
          const sp0 = spellRec(a.spellId)
          g.fury.push(mk(o, { label: a.animusOf ? `Cast ${sp0?.name ?? niceName(a.spellId)} from ${modelName(state, a.animusOf)}` : `Animus: ${sp0?.name ?? niceName(a.spellId)}`, testid: `act-animus-${a.spellId}${a.animusOf ? '-' + a.animusOf : ''}`, tone: 'primary', ...(sp0?.text ? { note: sp0.text } : {}) }))
          break
        }
        const row = spellRowFor(g, a.spellId, unit)
        const sp = spellRec(a.spellId)
        let note = ''
        if (a.targetId && sp?.offensive) {
          const pv = queryAttackPreview(subject, '', a.targetId, { spellId: a.spellId })
          if (pv && !pv.legal) note = `${pct(pv.pHit)} to hit vs DEF ${pv.hitTarget}; POW vs ARM ${pv.damageTarget}, avg ${pv.expectedDamage.toFixed(1)}`
        }
        row.casts.push(mk(o, { label: a.targetId ? `Cast on ${modelName(state, a.targetId)}` : 'Cast', testid: `act-cast-${a.spellId}${a.targetId ? '-' + a.targetId : ''}`, tone: 'primary', hoverId: a.targetId, ...(note ? { note } : {}) }))
        break
      }
      case 'adjustFury':
        g.fury.push(mk(o, { testid: `act-${a.delta > 0 ? 'rile' : 'shed'}-${Math.abs(a.delta)}`, label: a.delta > 0 ? `Rile: +${a.delta} fury` : `Shed ${Math.abs(a.delta)} fury`, tone: 'neutral' }))
        break
      case 'heal':
        g.fury.push(mk(o, { testid: `act-heal-${a.targetId ?? 'self'}-${a.points}`, label: `Heal ${a.points} on ${a.targetId ? modelName(state, a.targetId) : 'yourself'}`, tone: 'primary', ...(a.targetId ? { hoverId: a.targetId } : {}) }))
        break
      case 'takeControl':
        g.fury.push(mk(o, { testid: `act-take-control-${a.targetId}`, label: `Take control of ${modelName(state, a.targetId)}`, tone: 'primary', hoverId: a.targetId, note: 'It stays out of the fight this turn.' }))
        break
      case 'useFeat': {
        const tip = dataText(a.featId)
        g.feat = mk(o, { label: `Use feat: ${niceName(a.featId)}`, testid: 'act-feat', tone: 'primary', ...(tip ? { tip } : {}) })
        break
      }
      default: break
    }
  }
  // list every spell the model has so the player sees what it could do, castable or not
  const p = m ? profileOf(m) : undefined
  if (p?.spells) for (const id of p.spells) spellRowFor(g, id, unit)
  g.spells.sort((x, y) => x.name.localeCompare(y.name))
  if (m?.featUsed) g.featSpent = true
  return g
}

function spellRowFor(g: ActionGroups, spellId: Id, unit: 'focus' | 'fury' = 'focus'): SpellRow {
  let row = g.spells.find((s) => s.spellId === spellId)
  if (!row) {
    const sp = spellRec(spellId)
    const rng = sp?.rng
    row = {
      spellId, name: sp?.name ?? niceName(spellId), cost: sp?.cost ?? 0, unit, text: sp?.text ?? '', offensive: !!sp?.offensive,
      reach: rng === undefined ? '' : typeof rng === 'number' ? `${rng}"` : String(rng), casts: [],
    }
    g.spells.push(row)
  }
  return row
}

function attackRow(state: GameState, o: NonNullable<PendingDecision['options']>[number], a: Extract<Action, { type: 'chooseAttack' }>, legal: readonly Action[]): AttackRow {
  // the engine previews the chosen shot mode and spots a charge attack itself, so these odds are the attack's own
  const pv = queryAttackPreview(a.modelId, a.weaponId, a.targetId, { additional: a.additional, ...(a.attackType ? { attackType: a.attackType } : {}) })
  const detail: string[] = []
  let note = ''
  if (pv && !pv.legal) {
    note = pv.autoMiss ? 'automatic miss' : pv.autoHit ? 'automatic hit' : `${pct(pv.pHit)} to hit (${pct(pv.pHitBoosted)} boosted)`
    detail.push(`${pv.dice}d6 vs DEF ${pv.hitTarget}`, `POW vs ARM ${pv.damageTarget}: avg ${pv.expectedDamage.toFixed(1)}, kill ${pct(pv.pKill)}`)
    if (pv.pCrit > 0) detail.push(`crit ${pct(pv.pCrit)}`)
    for (const mod of pv.mods) detail.push(`${mod.label} ${mod.value >= 0 ? '+' : '−'}${Math.abs(mod.value)}`)
  }
  const d = queryDistance(a.modelId, a.targetId)
  if (Number.isFinite(d)) detail.push(`${d.toFixed(1)}" away`)
  // A weapon with shot modes (e.g. a blast shot): name the mode; the odds above are already for that mode.
  const modeId = a.attackType ? weaponRec(a.weaponId)?.abilities?.find((x) => x === a.attackType || x.endsWith('.' + a.attackType)) ?? a.attackType : ''
  const mode = modeId ? niceName(modeId) : ''
  if (mode) { const t = dataText(modeId); detail.unshift(`${mode}${t ? ': ' + t : ''}`) }
  return {
    id: o.id, label: `${niceName(a.weaponId)}${mode ? ` (${mode})` : ''} → ${modelName(state, a.targetId)}${a.additional ? ' (additional)' : ''}`,
    ...(costWords(o.cost, modelName(state, a.modelId)) ? { cost: costWords(o.cost, modelName(state, a.modelId)) } : {}), ...(isForcedCost(o.cost) ? { forced: true } : {}), ...(note ? { note } : {}), tone: 'primary', action: a,
    enabled: isLegal(legal, a), hoverId: a.targetId, testid: `act-attack-${a.weaponId}-${a.targetId}${a.additional ? '-extra' : ''}${a.attackType ? '-' + a.attackType : ''}`,
    weaponId: a.weaponId, targetId: a.targetId, additional: a.additional, detail,
  }
}
