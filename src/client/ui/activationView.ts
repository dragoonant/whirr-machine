// What the activation panel offers the selected model: Normal Movement, Combat Actions, attacks with engine odds,
// spells with costs and the feat. Built only from pending.options (engine-legal answers) and engine queries.
import type { Action, GameState, Id, ModelId, PendingDecision } from '../../engine/index'
import { modelName, queryAttackPreview, queryDistance, queryThreat } from '../contract'
import { dataText, profileOf, spellRec, weaponRec } from './data'
import { MOVE_LABEL, niceName, pct } from './format'
import { isLegal, type Tone } from './promptView'

export interface Button { id: string; label: string; cost?: string; note?: string; tone: Tone; action: Action; enabled: boolean; hoverId?: ModelId; testid: string }
export interface AttackRow extends Button { weaponId: Id; targetId: ModelId; additional: boolean; detail: string[] }
export interface SpellRow {
  spellId: Id; name: string; cost: number; reach: string; text: string; offensive: boolean
  /** One button per legal way to cast it now (per target); empty when it cannot be cast at this point. */
  casts: Button[]
}
export interface ActionGroups {
  movement: Button[]
  combat: Button[]
  attacks: AttackRow[]
  endAttacks: Button | null
  spells: SpellRow[]
  feat: Button | null
  featSpent: boolean
  endTurn: Button | null
  /** The decision belongs to this model (its buttons are shown). */
  active: boolean
}

const EMPTY: ActionGroups = { movement: [], combat: [], attacks: [], endAttacks: null, spells: [], feat: null, featSpent: false, endTurn: null, active: false }

export function groupActions(state: GameState, pd: PendingDecision | null, legal: readonly Action[], subject: ModelId | undefined): ActionGroups {
  if (!pd || !subject) return EMPTY
  const m = state.models[subject]
  const decidingModel = pd.context.modelId
  const forSubject = decidingModel === subject
  const g: ActionGroups = { ...EMPTY, movement: [], combat: [], attacks: [], spells: [] }
  const mk = (o: NonNullable<PendingDecision['options']>[number], extra: Partial<Button> = {}): Button => ({
    id: o.id, label: o.label, ...(o.cost?.focus ? { cost: `${o.cost.focus} focus` } : {}), tone: 'neutral', action: o.action,
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
        }))
        break
      }
      case 'chooseCombatAction': g.combat.push(mk(o, { testid: `act-combat-${o.id}`, ...(a.choice === 'forfeit' ? { tone: 'decline' as Tone } : {}) })); break
      case 'chooseAttack': g.attacks.push(attackRow(state, o, a, legal)); break
      case 'powerAttack': {
        const t = a.targetId
        g.attacks.push({ ...mk(o, { testid: `act-power-${a.kind}-${t}`, label: `${niceName(a.kind)} ${modelName(state, t)}`, hoverId: t }), weaponId: a.weaponId ?? '', targetId: t, additional: false, detail: [] })
        break
      }
      case 'endAttacks': g.endAttacks = mk(o, { label: 'End attacks', testid: 'act-end-attacks', tone: 'decline' }); break
      case 'castSpell': {
        const row = spellRowFor(g, a.spellId)
        const sp = spellRec(a.spellId)
        let note = ''
        if (a.targetId && sp?.offensive) {
          const pv = queryAttackPreview(subject, '', a.targetId, { spellId: a.spellId })
          if (pv && !pv.legal) note = `${pct(pv.pHit)} to hit vs DEF ${pv.hitTarget}; POW vs ARM ${pv.damageTarget}, avg ${pv.expectedDamage.toFixed(1)}`
        }
        row.casts.push(mk(o, { label: a.targetId ? `Cast on ${modelName(state, a.targetId)}` : 'Cast', testid: `act-cast-${a.spellId}${a.targetId ? '-' + a.targetId : ''}`, tone: 'primary', hoverId: a.targetId, ...(note ? { note } : {}) }))
        break
      }
      case 'useFeat': g.feat = mk(o, { label: `Use feat: ${niceName(a.featId)}`, testid: 'act-feat', tone: 'primary' }); break
      default: break
    }
  }
  // list every spell the model has so the player sees what it could do, castable or not
  const p = m ? profileOf(m) : undefined
  if (p?.spells) for (const id of p.spells) spellRowFor(g, id)
  g.spells.sort((x, y) => x.name.localeCompare(y.name))
  if (m?.featUsed) g.featSpent = true
  return g
}

function spellRowFor(g: ActionGroups, spellId: Id): SpellRow {
  let row = g.spells.find((s) => s.spellId === spellId)
  if (!row) {
    const sp = spellRec(spellId)
    const rng = sp?.rng
    row = {
      spellId, name: sp?.name ?? niceName(spellId), cost: sp?.cost ?? 0, text: sp?.text ?? '', offensive: !!sp?.offensive,
      reach: rng === undefined ? '' : typeof rng === 'number' ? `${rng}"` : String(rng), casts: [],
    }
    g.spells.push(row)
  }
  return row
}

function attackRow(state: GameState, o: NonNullable<PendingDecision['options']>[number], a: Extract<Action, { type: 'chooseAttack' }>, legal: readonly Action[]): AttackRow {
  const pv = queryAttackPreview(a.modelId, a.weaponId, a.targetId, { additional: a.additional })
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
  // A weapon with shot modes (e.g. a blast shot): the engine preview covers the standard shot only, so say so.
  const modeId = a.attackType ? weaponRec(a.weaponId)?.abilities?.find((x) => x === a.attackType || x.endsWith('.' + a.attackType)) ?? a.attackType : ''
  const mode = modeId ? niceName(modeId) : ''
  if (mode) { const t = dataText(modeId); detail.unshift(`${mode}${t ? ': ' + t : ''}`); if (pv && !pv.legal) detail.push('odds are for a standard shot') }
  return {
    id: o.id, label: `${niceName(a.weaponId)}${mode ? ` (${mode})` : ''} → ${modelName(state, a.targetId)}${a.additional ? ' (additional)' : ''}`,
    ...(o.cost?.focus ? { cost: `${o.cost.focus} focus` } : {}), ...(note ? { note } : {}), tone: 'primary', action: a,
    enabled: isLegal(legal, a), hoverId: a.targetId, testid: `act-attack-${a.weaponId}-${a.targetId}${a.additional ? '-extra' : ''}${a.attackType ? '-' + a.attackType : ''}`,
    weaponId: a.weaponId, targetId: a.targetId, additional: a.additional, detail,
  }
}
