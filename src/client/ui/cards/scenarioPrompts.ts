// Prompt wording for the M13 scenario and card decisions (91 A.5, B.3, B.4): the Maintenance card prompt, flag terrain picks, the
// High Stakes fuse, Wolves tokens, Payload moves and Made To Haul. All of them are `abilityChoice` (or `moveModel` for the haul) with a
// `context.data.code`. Pure: numbers come from pd.context and the options the engine listed.
import type { GameState, PendingDecision } from '../../../engine/index'
import { modelName } from '../../contract'
import type { Piece } from '../prompts/decisions'
import { elementLabel } from './scenarioView'

/** Codes of the `abilityChoice` decisions this file words. */
export const SCENARIO_CODES = ['card', 'flagTerrain', 'fuse', 'heelToken', 'heelMove', 'payload'] as const
export type ScenarioCode = (typeof SCENARIO_CODES)[number]
export const isScenarioCode = (code: string): code is ScenarioCode => (SCENARIO_CODES as readonly string[]).includes(code)

const TERRAIN_WORD: Record<string, string> = {
  obstacle: 'obstacle', obstruction: 'obstruction', building: 'building', forest: 'forest', shallowWater: 'shallow water', rough: 'rough ground', rubble: 'rubble',
  hill: 'hill', trench: 'trench', hazard: 'hazard', deepWater: 'deep water', scenarioTerrain: 'scenario terrain',
}

/** "Flag terrain: forest" for a flag pick option id `<flagId>|<pieceId>`. */
export function flagPickLabel(state: GameState, optionId: string, picker: PendingDecision['player']): string {
  const [flagId, pieceId] = optionId.split('|') as [string, string]
  const t = state.terrain.find((x) => x.id === pieceId)
  return `${elementLabel(state, flagId, picker)}: use the ${TERRAIN_WORD[t?.rulesType ?? ''] ?? 'piece'}`
}

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)

export function scenarioPiece(state: GameState, pd: PendingDecision): Piece | null {
  const d = pd.context.data ?? {}
  const code = String(d.code ?? '')
  const el = (id: unknown): string => (typeof id === 'string' ? elementLabel(state, id, pd.player) : 'the objective')
  switch (code) {
    case 'card':
      return {
        title: 'Start of Maintenance: play a command card?',
        lines: ['You may play a card now, before effects roll. Pick a play below, or pass and keep the card for later.'],
        passLabel: 'No card',
        defaultId: null,
      }
    case 'flagTerrain': {
      const labels: Record<string, string> = {}
      for (const o of pd.options ?? []) labels[o.id] = flagPickLabel(state, o.id, pd.player)
      return {
        title: 'Pick the scenario terrain for a flag',
        lines: [
          'Before deployment each side picks one terrain piece within 5 inches of its flag. That piece becomes scenario terrain: holding it scores for the scenario.',
          'Rest the pointer on a choice to see the piece lit on the table.',
        ],
        labels,
        defaultId: null,
      }
    }
    case 'fuse': {
      const labels: Record<string, string> = {}
      for (const o of pd.options ?? []) {
        const left = /\((\d+) left\)/.exec(o.label)?.[1]
        labels[o.id] = `Burn down ${el(o.id)}${left ? ` (${left} left)` : ''}`
      }
      return {
        title: 'Fuse: you secure the big objective, so you pick what burns down',
        lines: ['Roll a d3 against one element that still has countdown tokens. An element that reaches 0 blows up, hurting every model in or around it, friend and foe.'],
        labels,
        defaultId: null,
      }
    }
    case 'heelToken':
      return {
        title: `Wolves at Our Heels: add a token to ${el(d.elementId)}?`,
        lines: [
          `It holds ${num(d.tokens)} token${num(d.tokens) === 1 ? '' : 's'} now. If you add one, your opponent may pull that objective 3 inches toward the big objective of its colour.`,
          'The first side to get a third token on its objective while the other has not scores 3 VP, once.',
        ],
        labels: { yes: `Add a token (${num(d.tokens)} now)`, no: 'Leave it' },
        tones: { yes: 'primary', no: 'decline' },
        defaultId: 'no',
        passLabel: 'Leave it',
      }
    case 'heelMove':
      return {
        title: `Your opponent added a token to ${el(d.elementId)}: pull it ${num(d.move, 3)}"?`,
        lines: [`You may drag that objective ${num(d.move, 3)} inches straight toward the big objective of its colour. It stops short of anything it cannot pass.`],
        labels: { move: `Pull it ${num(d.move, 3)}"`, stay: 'Leave it' },
        tones: { move: 'primary', stay: 'decline' },
        defaultId: 'stay',
        passLabel: 'Leave it',
      }
    case 'payload': {
      const max = num(d.max)
      return {
        title: `Payload: move ${el(d.elementId)} up to ${max}"`,
        lines: [
          `Your big objective may roll up to ${max} inches toward the enemy flag terrain: 3 inches, and 1 more for every other objective you secure.`,
          'End it inside that terrain (or within 3 inches when you cannot stand inside it) and you score 3 VP at once and the objective is removed.',
        ],
        defaultId: null,
        passLabel: 'Leave it where it is',
      }
    }
    default:
      return null
  }
}

/** Made To Haul: the moveModel decision raised after a Payload move at the end of your own turn. */
export function isHaul(pd: PendingDecision): boolean {
  return pd.kind === 'moveModel' && pd.context.data?.code === 'haul'
}
export function haulPiece(state: GameState, pd: PendingDecision): Piece {
  const max = num(pd.context.data?.max, 5)
  const labels: Record<string, string> = {}
  for (const o of pd.options ?? []) {
    const a = o.action
    if (a.type === 'moveModel') {
      const dist = /([\d.]+)"/.exec(o.label)?.[1]
      labels[o.id] = `Haul ${modelName(state, a.modelId)}${dist ? ` ${dist}"` : ''} toward the objective`
    }
  }
  return {
    title: `Made To Haul: move one of your Cohort models up to ${max}" toward your objective`,
    lines: ['It moves in a straight line and stops short of anything in the way. You may also leave everyone where they are.'],
    labels,
    defaultId: null,
    passLabel: 'Skip the haul',
  }
}
