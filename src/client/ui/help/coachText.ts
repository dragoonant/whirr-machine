// First-time contextual tips (the "coach line"). Pure: decision kind in, one sentence out, in our own words.
import type { DecisionKind } from '../../../engine/index'

const TIPS: Partial<Record<DecisionKind, string>> = {
  chooseTurnOrder: 'Pick who goes first. Going second lets you react to where they set up.',
  chooseEdge: 'Choose which table edge to deploy from.',
  deploy: 'Click inside your shaded deployment zone to place each model, or use the auto-place button. Then confirm.',
  advanceDeploy: 'Some models may start a few inches further forward. Place them or skip.',
  maintenanceOrder: 'Several start-of-turn effects are waiting. Pick which to resolve first.',
  allocateFocus: 'Give focus to war-engines near your caster (up to 3 each). Whatever you keep, you can spend on boosts and spells.',
  payUpkeep: 'Pay 1 focus to keep a spell running, or let it end.',
  shake: 'Spend 1 of a model\'s own focus to stand it up or shake off an effect, or skip.',
  chooseActivation: 'Click a model or unit that has not activated yet. Each one goes once per turn.',
  chooseMovement: 'Choose how to move: advance, run, charge, aim, or another option. Hover to preview ranges.',
  moveModel: 'Click the table where the model should stop. The path turns red if it is not allowed. Then confirm.',
  chargeTarget: 'Pick an enemy to charge. You will rush it in a straight line.',
  placeTroopers: 'Place each trooper near the rest of the unit, or use auto-place.',
  chooseCombatAction: 'Pick your Combat Action: attack, cast, or something else.',
  chooseAttack: 'Pick a weapon and click an enemy. The badge shows your chance to hit.',
  combinedAttack: 'Choose whether to combine attacks.',
  channel: 'Choose whether to channel a spell through this model.',
  castSpell: 'Choose a spell and a target. Focus is spent when you cast.',
  useFeat: 'Your caster\'s feat works once per game. Use it when it will swing the fight.',
  boostAttack: 'Spend 1 focus to add a die to the attack roll? The prompt shows how your chance changes.',
  boostDamage: 'Spend 1 focus to add a die to the damage roll? Good when a kill is close.',
  rollAnyway: 'The hit is automatic. You may roll anyway for a chance at a critical.',
  reroll: 'You may re-roll this. Compare your chances before you decide.',
  chooseGrid: 'Choose which damage grid to use.',
  powerField: 'Spend 1 focus to shield against this damage? You keep the focus if you decline.',
  chooseBoxes: 'Choose which damage boxes take the hit.',
  triggerWindow: 'An ability can trigger here. Use it, or pass.',
  abilityChoice: 'An ability needs a choice from you.',
}

/** Tip for a decision kind, or null when there is nothing helpful to say. */
export function coachTip(kind: DecisionKind | null | undefined): string | null {
  return (kind && TIPS[kind]) || null
}

export const COACH_KEY = 'wm.coach'
export interface CoachMemory { off: boolean; seen: string[] }

/** Parse stored coach memory defensively. */
export function parseCoach(raw: string | null): CoachMemory {
  if (!raw) return { off: false, seen: [] }
  try {
    const v = JSON.parse(raw) as Partial<CoachMemory>
    return { off: v.off === true, seen: Array.isArray(v.seen) ? v.seen.filter((s): s is string => typeof s === 'string') : [] }
  } catch { return { off: false, seen: [] } }
}

/** Should this kind's tip be shown? */
export function shouldCoach(mem: CoachMemory, kind: DecisionKind | null | undefined): boolean {
  return !!kind && !mem.off && coachTip(kind) !== null && !mem.seen.includes(kind)
}

/** Memory after dismissing one kind's tip. */
export function dismissKind(mem: CoachMemory, kind: string): CoachMemory {
  return mem.seen.includes(kind) ? mem : { ...mem, seen: [...mem.seen, kind] }
}
