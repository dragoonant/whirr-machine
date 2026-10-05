// Start-screen choices -> NewGameOptions. Pure (no React) so it can be tested headlessly.
import { loadBundle } from '../../../data/index'
import type { Id } from '../../../engine/index'
import type { NewGameOptions } from '../../contract'

export interface ArmyCard { profileId: Id; name: string; role: string; count: number }
export interface SideChoice { listId: Id; factionId: Id; factionName: string; listName: string; points: number; models: ArmyCard[] }
export interface ScenarioChoice { id: Id; name: string; text: string }

type Rec = { id: string; recordType?: string; name?: string; faction?: string; points?: number; leader?: string; entries?: { profile: string; size?: number }[]; type?: string; text?: string; levels?: string[] }

const ROLE_WORDS: Record<string, string> = {
  leader: 'Warcaster', warEngine: 'War-engine', solo: 'Solo', unit: 'Unit', trooper: 'Trooper', battleEngine: 'Battle engine',
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
      return { profileId: pid, name: (p?.name ?? pid).replace(/\s*\(.*\)$/, ''), role: ROLE_WORDS[p?.type ?? ''] ?? 'Model', count: size }
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

export interface StartChoices { listId: Id; scenario: Id; speed?: number; seed?: string; tier?: BotTierChoice }

/** The side the player picked is A (human); the first other faction's list is B (bot). */
export function buildNewGame(choices: StartChoices, sides = sideChoices()): NewGameOptions | null {
  const mine = sides.find((s) => s.listId === choices.listId)
  if (!mine) return null
  const theirs = sides.find((s) => s.factionId !== mine.factionId) ?? sides.find((s) => s.listId !== mine.listId) ?? mine
  return {
    scenario: choices.scenario,
    lists: { A: mine.listId, B: theirs.listId },
    controllers: { A: 'human', B: 'bot' },
    bot: { tier: choices.tier ?? DEFAULT_BOT_TIER },
    ...(choices.seed ? { seed: choices.seed } : {}),
  }
}

export const SPEED_CHOICES = [
  { id: 'slow', label: 'Slow', value: 0.5 },
  { id: 'normal', label: 'Normal', value: 1 },
  { id: 'fast', label: 'Fast', value: 2 },
  { id: 'instant', label: 'Instant', value: 0 },
] as const
