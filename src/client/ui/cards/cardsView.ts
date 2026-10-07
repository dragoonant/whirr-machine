// The command-card hand as the tray shows it (91 A). Pure: the hand, what is playable and the plays left come from
// query.cards; the actions to dispatch are the `playCard` options the open decision lists. Nothing is decided here.
import { loadBundle } from '../../../data/index'
import type { Action, CardsView, GameState, Id, PendingDecision, PlayCardAction, PlayerId } from '../../../engine/index'
import { modelName } from '../../contract'
import { isLegal } from '../promptView'
import { elementLabel } from './scenarioView'

/** One way to play one option of a card right now: a `playCard` action the engine lists, with who it lands on. */
export interface PlayOffer {
  key: string
  cardId: Id
  optionId: string
  targetId: Id
  targetName: string
  /** The extra choice in words ("a focus", the element's name), or ''. */
  extra: string
  action: PlayCardAction
  enabled: boolean
}
export interface OptionTile { id: string; label: string; text: string; offers: PlayOffer[] }
export interface CardTile {
  cardId: Id
  name: string
  text: string
  cost: number
  played: boolean
  /** Some option can be played at the open decision. */
  playable: boolean
  /** When the card may be played, in words. */
  when: string
  /** Why nothing can be played right now ('' when something can). */
  reason: string
  options: OptionTile[]
}
export interface HandModel { player: PlayerId; tiles: CardTile[]; playsLeft: number; playable: number }

type CardRec = { name?: string; text?: string; timing?: string; options?: { id: string; label: string; text?: string }[] }
const cardRec = (id: Id): CardRec | undefined => loadBundle().byId[id] as unknown as CardRec | undefined

export const TIMING_WORDS: Record<string, string> = {
  activationAny: 'Play during one of your activations.',
  activationStart: 'Play as one of your models starts its activation.',
  maintenanceStart: 'Play at the start of your Maintenance Phase.',
}

const GAIN_WORDS: Record<string, string> = { focus: 'a focus', fury: 'a fury', soul: 'a soul token', corpse: 'a corpse token' }

/** The extra choice of a play in words: "a focus", or the element it is about. */
export function extraWords(state: GameState, a: PlayCardAction, human: PlayerId): string {
  if (a.data?.elementId) return elementLabel(state, a.data.elementId, human)
  if (a.data?.gain) return GAIN_WORDS[a.data.gain] ?? a.data.gain
  return ''
}

/** Every `playCard` action the open decision lists (the engine already limited them to legal plays). */
export const playOptionsOf = (pd: PendingDecision | null): PlayCardAction[] =>
  (pd?.options ?? []).flatMap((o) => (o.action.type === 'playCard' ? [o.action] : []))

/** Build one player's hand. `pd` is the decision the human can answer now (null: nothing is playable); `legal` backs the enabled flag. */
export function buildHand(state: GameState, view: CardsView | null, player: PlayerId, pd: PendingDecision | null, legal: readonly Action[], human: PlayerId): HandModel | null {
  if (!view || view.hand.length === 0) return null
  const mine = player === human
  const offered = mine && pd && pd.player === player ? playOptionsOf(pd) : []
  const tiles = view.hand.map((c): CardTile => {
    const rec = cardRec(c.cardId)
    const options = c.options.map((o): OptionTile => {
      const offers = offered.filter((a) => a.cardId === c.cardId && a.option === o.id).map((a): PlayOffer => ({
        key: `${a.cardId}:${a.option}:${a.targetId}:${a.data?.elementId ?? ''}${a.data?.gain ?? ''}`, cardId: a.cardId, optionId: a.option, targetId: a.targetId,
        targetName: modelName(state, a.targetId), extra: extraWords(state, a, human), action: a, enabled: isLegal(legal, a),
      }))
      return { id: o.id, label: o.label, text: rec?.options?.find((x) => x.id === o.id)?.text ?? '', offers }
    })
    const playable = options.some((o) => o.offers.some((p) => p.enabled))
    const when = TIMING_WORDS[rec?.timing ?? ''] ?? ''
    const reason = playable ? ''
      : c.played ? 'Already played this game.'
        : !mine ? ''
          : view.playsLeft === 0 ? 'No plays left this turn (two a turn).'
            : state.activePlayer !== player ? 'Cards are played in your own turn.'
              : when
    return { cardId: c.cardId, name: c.name, text: c.text, cost: c.cost, played: c.played, playable, when, reason, options }
  })
  return { player, tiles, playsLeft: view.playsLeft, playable: tiles.filter((t) => t.playable).length }
}

/** The button label for one offer: the option, plus what it lands on when that is not obvious. */
export function offerLabel(o: OptionTile, p: PlayOffer, several: boolean): string {
  if (!several) return o.label
  return p.extra ? `${o.label}: ${p.extra}` : `${o.label}: ${p.targetName}`
}
