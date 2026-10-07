// Feed and narration lines for the fury events (81 G), in our own words. Pure: names from the state, numbers from the
// event payloads (never recomputed). The director uses the text for the narration log; feedView adds the tone and detail.
import type { ForcePurpose, GameEvent, GameState } from '../../../engine/index'
import { modelName } from '../../presentation/labels'
import type { FeedTone } from '../feedView'

export interface FuryFeedLine { tone: FeedTone; text: string; detail: string[] }

const FORCE_WORD: Record<ForcePurpose, string> = {
  run: 'run', charge: 'charge', additionalAttack: 'make an extra attack', boostAttack: 'boost an attack roll', boostDamage: 'boost a damage roll',
  powerAttack: 'make a power attack', animus: 'cast its animus', shake: 'shake something off', rile: 'rile up', reload: 'reload', ability: 'use an ability',
}
const ASPECT_WORD = { mind: 'Mind', body: 'Body', spirit: 'Spirit' } as const
const FRENZY_WHY = { noTarget: 'nothing in sight to hit', cannotCharge: 'it cannot charge', cannotActivate: 'it cannot act right now' } as const
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`

/** One feed line for a fury event, or null when the event is bookkeeping (FuryChanged) or not a fury event. */
export function furyFeedLine(state: GameState | null, ev: GameEvent): FuryFeedLine | null {
  const n = (id: string | undefined | null) => modelName(state, id ?? undefined)
  switch (ev.type) {
    case 'FuryLeeched': {
      const fromBeasts = ev.sources.reduce((a, s) => a + s.points, 0)
      if (fromBeasts + ev.selfPoints + ev.spiritBond <= 0) return null
      const detail = ev.sources.filter((s) => s.points > 0).map((s) => `${n(s.modelId)} gives ${s.points}`)
      if (ev.selfPoints > 0) detail.push(`${plural(ev.selfPoints, 'point')} drawn from its own life (that damage cannot be moved)`)
      if (ev.spiritBond > 0) detail.push(`${ev.spiritBond} from fallen warbeasts (spirit bond)`)
      return { tone: 'spell', text: `${n(ev.warlockId)} leeches fury and now holds ${ev.after}`, detail }
    }
    case 'FuryReaved':
      return { tone: 'spell', text: `${n(ev.reaverId)} reaves ${ev.points} fury from ${n(ev.beastId)}`, detail: ev.lost > 0 ? [`${ev.lost} could not be held and is lost`] : [] }
    case 'BeastForced':
      return { tone: 'spell', text: `${n(ev.beastId)} is forced to ${FORCE_WORD[ev.purpose] ?? ev.purpose}: +${ev.gained} fury, now ${ev.after}`, detail: [] }
    case 'ThresholdChecked':
      return {
        tone: ev.frenzied ? 'death' : 'info',
        text: ev.frenzied ? `${n(ev.beastId)} fails its threshold check and frenzies` : `${n(ev.beastId)} holds its temper`,
        detail: [`Rolled ${ev.total} with ${ev.fury} fury against threshold ${ev.thr}; a frenzy needs a total above it`],
      }
    case 'Frenzied': {
      if (!ev.targetId) return { tone: 'death', text: `${n(ev.beastId)} frenzies, but ${FRENZY_WHY[ev.reason ?? 'noTarget']}`, detail: [] }
      const detail = ev.tiedIds.length > 1 ? [`Tied for closest: ${ev.tiedIds.map(n).join(', ')}; chosen at random`] : []
      const mine = !!state && state.models[ev.targetId]?.owner === state.models[ev.beastId]?.owner
      return { tone: 'death', text: `${n(ev.beastId)} frenzies and charges the closest model, ${n(ev.targetId)}${mine ? ' (a friend!)' : ''}`, detail }
    }
    case 'FrenzyEnded':
      return { tone: 'flow', text: ev.vented > 0 ? `${n(ev.beastId)} calms down and vents ${ev.vented} fury` : `${n(ev.beastId)} stays wound up`, detail: [] }
    case 'DamageTransferred':
      return {
        tone: 'spell', text: `${n(ev.warlockId)} moves ${ev.absorbed} damage onto ${n(ev.beastId)}${ev.overflow > 0 ? `; ${ev.overflow} still hits it` : ''}`, detail: [],
      }
    case 'AspectCrippled': return { tone: 'damage', text: `${n(ev.modelId)}: ${ASPECT_WORD[ev.aspect]} crippled`, detail: [] }
    case 'AspectRestored': return { tone: 'info', text: `${n(ev.modelId)}: ${ASPECT_WORD[ev.aspect]} restored`, detail: [] }
    case 'BeastWild': return { tone: 'death', text: `${n(ev.modelId)} goes wild without ${n(ev.warlockId)}`, detail: [] }
    case 'BeastControlTaken': return { tone: 'spell', text: `${n(ev.warlockId)} takes control of ${n(ev.modelId)}`, detail: [] }
    default: return null
  }
}
