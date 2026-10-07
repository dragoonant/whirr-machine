// Start-screen choices -> NewGameOptions. Pure (no React) so it can be tested headlessly.
import { loadBundle } from '../../../data/index'
import type { Id } from '../../../engine/index'
import type { NewGameOptions } from '../../contract'
import { BOARDS } from '../../board/boards'

export interface ArmyCard { profileId: Id; name: string; role: string; count: number }
export interface SideChoice { listId: Id; factionId: Id; factionName: string; listName: string; points: number; models: ArmyCard[] }
export interface ScenarioChoice { id: Id; name: string; text: string }

type Rec = { id: string; recordType?: string; name?: string; faction?: string; resource?: string; points?: number; leader?: string; entries?: { profile: string; size?: number }[]; type?: string; text?: string; levels?: string[] }

const ROLE_WORDS: Record<string, string> = {
  leader: 'Warcaster', warEngine: 'War-engine', beast: 'Warbeast', solo: 'Solo', unit: 'Unit', trooper: 'Trooper', battleEngine: 'Battle engine',
}

const records = (): Rec[] => Object.values(loadBundle().byId as Record<string, Rec>)
const byId = (id: string): Rec | undefined => (loadBundle().byId as Record<string, Rec>)[id]

/** Every list at recon level, as a choosable side (the starter lists). */
export function sideChoices(): SideChoice[] {
  const out: SideChoice[] = []
  for (const r of records()) {
    if (r.recordType !== 'list' || !r.leader || !r.faction) continue
    const models: ArmyCard[] = [r.leader, ...(r.entries ?? []).map((e) => e.profile)].map((pid, i) => {
      const p = byId(pid)
      const size = i === 0 ? 1 : (r.entries?.[i - 1]?.size ?? 1)
      const role = p?.type === 'leader' && p.resource === 'fury' ? 'Warlock' : (ROLE_WORDS[p?.type ?? ''] ?? 'Model')
      return { profileId: pid, name: (p?.name ?? pid).replace(/\s*\(.*\)$/, ''), role, count: size }
    })
    // a leader that is also listed as an entry would be doubled: drop repeats
    const seen = new Set<string>()
    const unique = models.filter((m) => (seen.has(m.profileId) ? false : (seen.add(m.profileId), true)))
    out.push({ listId: r.id, factionId: r.faction, factionName: byId(r.faction)?.name ?? r.faction, listName: r.name ?? r.id, points: r.points ?? 0, models: unique })
  }
  return out.sort((a, b) => a.factionName.localeCompare(b.factionName))
}

/** Scenarios that suit a recon-level game. */
export function scenarioChoices(): ScenarioChoice[] {
  return records()
    .filter((r) => r.recordType === 'scenario' && (!r.levels || r.levels.includes('recon')))
    .map((r) => ({ id: r.id, name: r.name ?? r.id, text: r.text ?? '' }))
}

/** Opponent strengths (40-ai §8). The first entry is the start screen's default. */
export const BOT_TIERS = [
  { id: 'normal', label: 'Normal bot', note: 'Plans every activation: scores moves and targets, plays the scenario, guards its warcaster and looks for assassinations.' },
  { id: 'easy', label: 'Easy bot', note: 'The same planner with looser choices, simple boosts and no assassination search.' },
  { id: 'random', label: 'Random bot', note: 'Picks legal moves with a bias toward fighting. Good for learning.' },
] as const
export type BotTierChoice = (typeof BOT_TIERS)[number]['id']
export const DEFAULT_BOT_TIER: BotTierChoice = 'normal'

export interface StartChoices { listId: Id; /** Opponent's army: a list id, or 'random' / omitted for a random pick (any faction, mirrors allowed). */ opponentListId?: Id | 'random'; scenario: Id; speed?: number; seed?: string; tier?: BotTierChoice; board?: Id | 'random' }

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
  return {
    scenario: choices.scenario,
    lists: { A: mine.listId, B: theirs.listId },
    controllers: { A: 'human', B: 'bot' },
    bot: { tier: choices.tier ?? DEFAULT_BOT_TIER },
    seed,
    board: choices.board ?? 'random',
  }
}

export const SPEED_CHOICES = [
  { id: 'slow', label: 'Slow', value: 0.5 },
  { id: 'normal', label: 'Normal', value: 1 },
  { id: 'fast', label: 'Fast', value: 2 },
  { id: 'instant', label: 'Instant', value: 0 },
] as const
