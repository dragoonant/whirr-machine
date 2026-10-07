// Start-screen choices -> NewGameOptions. Pure (no React) so it can be tested headlessly.
import { loadBundle } from '../../../data/index'
import type { Id } from '../../../engine/index'
import type { NewGameOptions } from '../../contract'
import { BOARDS } from '../../board/boards'
import { DEFAULT_GAME_SIZE, parseGameSize, type GameSize } from '../../store/settingsStore'

export { DEFAULT_GAME_SIZE, parseGameSize, type GameSize }

/** Game sizes for the start screen's Game size select (90-skirmish A.1; points and table from RB p118 and p116). */
export const GAME_SIZES: readonly { id: GameSize; label: string; points: number; table: number; note: string }[] = [
  { id: 'recon', label: 'Recon', points: 30, table: 36, note: 'About 30 points on a 36 inch table: a short game with a small army.' },
  { id: 'skirmish', label: 'Skirmish', points: 50, table: 48, note: 'About 50 points on a 48 inch table: a bigger army and seven rounds.' },
]
/** The scenario each size starts on (the first one listed otherwise). */
export const DEFAULT_SCENARIO: Record<GameSize, Id> = { recon: 'scn-qs-demo', skirmish: 'scn-copperline-crossing' }

let warnedSize = ''
/**
 * `?size=recon|skirmish` from a URL query. Null when the URL does not name a size; an unknown value also gives null
 * (so the caller falls back to recon) with one console warning per bad value.
 */
export function sizeFromUrl(search = typeof location !== 'undefined' ? location.search : ''): GameSize | null {
  const raw = new URLSearchParams(search).get('size')
  if (raw === null) return null
  const size = parseGameSize(raw)
  if (!size && warnedSize !== raw) { warnedSize = raw; console.warn(`Whirr Machine: unknown ?size=${raw}; using recon (try recon or skirmish).`) }
  return size
}

export interface ArmyCard { profileId: Id; name: string; role: string; count: number }
export interface SideChoice { listId: Id; factionId: Id; factionName: string; listName: string; points: number; level: GameSize; models: ArmyCard[] }
export interface ScenarioChoice { id: Id; name: string; text: string; /** 'steamroller' = the Steamroller 2026 set (91 B); everything else is 'other'. */ group: 'steamroller' | 'other' }

type Rec = { armies?: string[]; army?: string; timing?: string; cost?: number; id: string; level?: string; recordType?: string; name?: string; faction?: string; resource?: string; points?: number; leader?: string; entries?: { profile: string; size?: number }[]; type?: string; text?: string; levels?: string[] }

const ROLE_WORDS: Record<string, string> = {
  leader: 'Warcaster', warEngine: 'War-engine', beast: 'Warbeast', solo: 'Solo', unit: 'Unit', trooper: 'Trooper', battleEngine: 'Battle engine',
}

const records = (): Rec[] => Object.values(loadBundle().byId as Record<string, Rec>)
const byId = (id: string): Rec | undefined => (loadBundle().byId as Record<string, Rec>)[id]

/** Every list of a game size (default recon: the starter lists), as a choosable side. A list with no level is recon. */
export function sideChoices(size: GameSize = DEFAULT_GAME_SIZE): SideChoice[] {
  const out: SideChoice[] = []
  for (const r of records()) {
    if (r.recordType !== 'list' || !r.leader || !r.faction) continue
    if ((r.level ?? 'recon') !== size) continue
    const models: ArmyCard[] = [r.leader, ...(r.entries ?? []).map((e) => e.profile)].map((pid, i) => {
      const p = byId(pid)
      const size = i === 0 ? 1 : (r.entries?.[i - 1]?.size ?? 1)
      const role = p?.type === 'leader' && p.resource === 'fury' ? 'Warlock' : (ROLE_WORDS[p?.type ?? ''] ?? 'Model')
      return { profileId: pid, name: (p?.name ?? pid).replace(/\s*\(.*\)$/, ''), role, count: size }
    })
    // a leader that is also listed as an entry would be doubled: drop repeats
    const seen = new Set<string>()
    const unique = models.filter((m) => (seen.has(m.profileId) ? false : (seen.add(m.profileId), true)))
    out.push({ listId: r.id, factionId: r.faction, factionName: byId(r.faction)?.name ?? r.faction, listName: r.name ?? r.id, points: r.points ?? 0, level: size, models: unique })
  }
  return out.sort((a, b) => a.factionName.localeCompare(b.factionName))
}

/** Scenarios played at a game size (default recon). A scenario with no `levels` counts as recon only. */
export function scenarioChoices(size: GameSize = DEFAULT_GAME_SIZE): ScenarioChoice[] {
  const rows = records()
    .filter((r) => r.recordType === 'scenario' && (r.levels ? r.levels.includes(size) : size === 'recon'))
    .map((r): ScenarioChoice => ({ id: r.id, name: r.name ?? r.id, text: r.text ?? '', group: isSteamrollerScenario(r.id) ? 'steamroller' : 'other' }))
  // the Steamroller set keeps the order of the SR d8 table (SR p14); everything else keeps the data order, ahead of it
  const rank = (c: ScenarioChoice): number => (c.group === 'steamroller' ? 100 + SR_D8_ORDER.indexOf(c.id) : 0)
  return rows.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c)
}

/** The scenario a game size starts on: recon keeps the first one listed, skirmish prefers Copperline Crossing. */
export function defaultScenarioId(size: GameSize, choices: ScenarioChoice[] = scenarioChoices(size)): Id {
  const pick = size === 'recon' ? choices[0] : (choices.find((c) => c.id === DEFAULT_SCENARIO[size]) ?? choices[0])
  return pick?.id ?? ''
}

// ---------- Steamroller 2026 scenarios (91 B) ----------
/** The seven SR scenarios in the order of the SR d8 table: 1 Trench Warfare .. 7 Payload, and an 8 rolls again (SR p14). */
export const SR_D8_ORDER: readonly Id[] = [
  'scn-sr26-trench-warfare', 'scn-sr26-two-fronts', 'scn-sr26-wolves', 'scn-sr26-pressure-point', 'scn-sr26-high-stakes', 'scn-sr26-fault-line', 'scn-sr26-payload',
]
export const isSteamrollerScenario = (id: Id): boolean => id.startsWith('scn-sr26-')
/** The start screen's pseudo scenario: roll a d8 when the game starts. It is never a scenario id the engine sees. */
export const RANDOM_SR_ID = 'random-sr'
export const RANDOM_SR_TEXT = 'Rolls a d8 when the game starts: 1 to 7 pick a Steamroller scenario in order, an 8 rolls again.'

/** The scenario list the select shows: the real scenarios, then Random (d8) at the end of the Steamroller group. Random is offered only when every SR scenario is playable at the size. */
export function scenarioOptions(size: GameSize = DEFAULT_GAME_SIZE): ScenarioChoice[] {
  const real = scenarioChoices(size)
  const sr = real.filter((c) => c.group === 'steamroller')
  return sr.length === SR_D8_ORDER.length ? [...real, { id: RANDOM_SR_ID, name: 'Random (d8)', text: RANDOM_SR_TEXT, group: 'steamroller' }] : real
}

/** A real scenario id for a pick: Random (d8) rolls the SR table from the seed (an 8 rolls again), so a seeded game is repeatable. */
export function resolveScenario(pick: Id, seed: string): Id {
  if (pick !== RANDOM_SR_ID) return pick
  for (let k = 0; k < 64; k++) {
    const roll = (hashSeed(`${seed}:d8:${k}`) % 8) + 1
    if (roll <= SR_D8_ORDER.length) return SR_D8_ORDER[roll - 1]!
  }
  return SR_D8_ORDER[0]!
}

// ---------- command cards (91 A) ----------
export interface CardInfo { id: Id; name: string; text: string; cost: number; /** Armies the card is open to; empty = every army. */ armies: Id[] }
/** Most cards a hand holds (CC1). */
export const HAND_LIMIT = 5

const cardRecords = (): CardInfo[] =>
  records().filter((r) => r.recordType === 'card').map((r) => ({ id: r.id, name: r.name ?? r.id, text: r.text ?? '', cost: r.cost ?? 0, armies: r.armies ?? [] }))
/** The army a list belongs to (list.army), or undefined: such a list takes the universal cards only. */
export const armyOf = (listId: Id): Id | undefined => byId(listId)?.army

/** Every card a list may take: the universal ones, then the cards open to its army. */
export function cardPool(listId: Id): CardInfo[] {
  const army = armyOf(listId)
  return cardRecords().filter((c) => c.armies.length === 0 || (!!army && c.armies.includes(army)))
}
/** The hand taken when the player does not pick: the universal cards (there are five). */
export function defaultHand(listId: Id): Id[] {
  return cardPool(listId).filter((c) => c.armies.length === 0).slice(0, HAND_LIMIT).map((c) => c.id)
}
/** A hand for a list: the picked cards when they are all open to the list (at most five, no repeats), else the default hand. */
export function handFor(listId: Id, pick?: readonly Id[] | null): Id[] {
  if (!pick || pick.length === 0) return defaultHand(listId)
  const pool = new Set(cardPool(listId).map((c) => c.id))
  const hand = [...new Set(pick)].filter((id) => pool.has(id)).slice(0, HAND_LIMIT)
  return hand.length > 0 ? hand : defaultHand(listId)
}
/** Whether command cards start On: always Off on the Quick Start demo, On for Skirmish and for the Steamroller scenarios, Off for other recon games. */
export function cardsDefault(size: GameSize, scenario: Id): boolean {
  if (scenario === 'scn-qs-demo') return false
  return size === 'skirmish' || scenario === RANDOM_SR_ID || isSteamrollerScenario(scenario)
}

/** Opponent strengths (40-ai §8). The first entry is the start screen's default. */
export const BOT_TIERS = [
  { id: 'normal', label: 'Normal bot', note: 'Plans every activation: scores moves and targets, plays the scenario, guards its warcaster and looks for assassinations.' },
  { id: 'easy', label: 'Easy bot', note: 'The same planner with looser choices, simple boosts and no assassination search.' },
  { id: 'random', label: 'Random bot', note: 'Picks legal moves with a bias toward fighting. Good for learning.' },
] as const
export type BotTierChoice = (typeof BOT_TIERS)[number]['id']
export const DEFAULT_BOT_TIER: BotTierChoice = 'normal'

export interface StartChoices { listId: Id; /** Opponent's army: a list id, or 'random' / omitted for a random pick (any faction, mirrors allowed). */ opponentListId?: Id | 'random'; scenario: Id; speed?: number; seed?: string; tier?: BotTierChoice; board?: Id | 'random'; /** Command cards On: both sides take a hand. */ cards?: boolean; /** The human's own hand when the list's army has more than the universal cards. */ hand?: Id[] }

/** Battlefield choices for the start screen: Random first, then each board's display name. */
export const battlefieldChoices = (): { id: Id | 'random'; name: string }[] => [{ id: 'random', name: 'Random' }, ...BOARDS.map((b) => ({ id: b.id, name: b.name }))]

const makeSeed = (): string => Math.random().toString(36).slice(2, 10)

/** Small string hash (cyrb-style) so a seeded game picks the same random opponent every time. */
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
  return (Math.imul(h ^ (h >>> 16), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0
}

/** The opponent's list: the one named, else a random one from every side (same faction as the player's allowed). */
export function pickOpponent(sides: SideChoice[], opponentListId: Id | 'random' | undefined, seed: string): SideChoice | undefined {
  const named = opponentListId && opponentListId !== 'random' ? sides.find((s) => s.listId === opponentListId) : undefined
  return named ?? sides[hashSeed(seed + ':opponent') % Math.max(1, sides.length)]
}

/** The side the player picked is A (human); B (bot) is the chosen army, or a random one by default. */
export function buildNewGame(choices: StartChoices, sides = sideChoices()): NewGameOptions | null {
  const mine = sides.find((s) => s.listId === choices.listId)
  if (!mine) return null
  // the seed is made here (not in the engine call) so the battlefield pick and the game share it: ?seed=X gives the same table
  const seed = choices.seed ?? makeSeed()
  const theirs = pickOpponent(sides, choices.opponentListId, seed) ?? mine
  const hands = choices.cards ? { cards: { A: handFor(mine.listId, choices.hand), B: handFor(theirs.listId) } } : {}
  return {
    scenario: resolveScenario(choices.scenario, seed),
    lists: { A: mine.listId, B: theirs.listId },
    controllers: { A: 'human', B: 'bot' },
    bot: { tier: choices.tier ?? DEFAULT_BOT_TIER },
    seed,
    board: choices.board ?? 'random',
    ...hands,
  }
}

export const SPEED_CHOICES = [
  { id: 'slow', label: 'Slow', value: 0.5 },
  { id: 'normal', label: 'Normal', value: 1 },
  { id: 'fast', label: 'Fast', value: 2 },
  { id: 'instant', label: 'Instant', value: 0 },
] as const
