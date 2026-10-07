// Event feed lines for the M13 events (91 D.1): cards, caches, flag terrain, moved and detonated elements, the Kill Box and the clock.
// Names come from the state and the data; numbers from the event payloads. Our own words.
import { loadBundle } from '../../../data/index'
import type { GameEvent, GameState, Id, PlayerId } from '../../../engine/index'
import { modelName, playerName } from '../../contract'
import { elementLabel, humanSide } from './scenarioView'

export type ScenarioFeedTone = 'info' | 'spell' | 'score' | 'death' | 'flow'
export interface ScenarioFeedLine { tone: ScenarioFeedTone; text: string }

type CardRec = { name?: string; options?: { id: string; label: string }[] }
const cardRec = (id: Id): CardRec | undefined => loadBundle().byId[id] as unknown as CardRec | undefined

const REMOVED: Record<string, string> = { claimed: 'was claimed', delivered: 'was delivered', terrainGone: 'lost its terrain and became an obstruction' }

/** One feed row for a scenario, card or clock event; null for any other event. */
export function scenarioEventLine(state: GameState | null, ev: GameEvent): ScenarioFeedLine | null {
  const who = (p: PlayerId): string => playerName(state, p)
  const el = (id: Id): string => elementLabel(state, id, humanSide())
  switch (ev.type) {
    case 'CardPlayed': {
      const c = cardRec(ev.cardId)
      const opt = c?.options?.find((o) => o.id === ev.option)?.label
      return { tone: 'spell', text: `${who(ev.player)} plays ${c?.name ?? ev.cardId}${opt ? ` (${opt})` : ''}${ev.targetIds.length ? ` on ${ev.targetIds.map((t) => modelName(state, t)).join(', ')}` : ''}` }
    }
    case 'CacheClaimed': return { tone: 'score', text: `${who(ev.player)} claims ${el(ev.elementId)} with ${modelName(state, ev.modelId)}` }
    case 'FlagTerrainChosen': return { tone: 'info', text: ev.terrainId ? `${who(ev.player)} picks the terrain for ${el(ev.flagId).toLowerCase()}` : `${el(ev.flagId)} becomes a small obstruction` }
    case 'ElementMoved': return { tone: 'info', text: `${el(ev.elementId)} moves ${Math.hypot(ev.to.x - ev.from.x, ev.to.z - ev.from.z).toFixed(1)}"` }
    case 'ElementTokensChanged': return { tone: 'info', text: `${el(ev.elementId)} now has ${ev.tokens} token${ev.tokens === 1 ? '' : 's'} (${ev.delta >= 0 ? '+' : ''}${ev.delta})` }
    case 'ElementDetonated': return { tone: 'death', text: `${el(ev.elementId)} detonates` }
    case 'ElementRemoved': return { tone: ev.reason === 'delivered' ? 'score' : 'info', text: `${el(ev.elementId)} ${REMOVED[ev.reason] ?? 'is removed'}` }
    case 'KillBoxExtended': return { tone: 'flow', text: `The Kill Box is now ${ev.depth}" deep for both sides` }
    case 'ClockExpired': return { tone: 'death', text: `${who(ev.player)}'s clock ran out` }
    default: return null
  }
}

/** A scoring source written by the engine ("controls el-50-blue", "claimed el-cache-red", "tokenRace"...) in words. */
export function scoreSourceWords(state: GameState | null, reason: string): string {
  const el = (id: string): string => elementLabel(state, id, humanSide())
  let m = /^controls (\S+)$/.exec(reason)
  if (m) return `held ${el(m[1]!)}`
  m = /^claimed (\S+)$/.exec(reason)
  if (m) return `claimed ${el(m[1]!)}`
  m = /^(\S+) is burnt down$/.exec(reason)
  if (m) return `held ${el(m[1]!)}, burnt down`
  if (/^secures \d+ of /.test(reason)) return reason.replace(/^secures (\d+) of .*$/, 'bonus for securing $1')
  if (reason === 'tokenRace') return 'won the token race'
  if (reason === 'delivered') return 'delivered the payload'
  return reason
}
