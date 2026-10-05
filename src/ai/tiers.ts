// Tier parameters (40-ai §8). random is the sensible random bot (random.ts); easy and normal use the utility decider.
export type AiTierId = 'easy' | 'normal'

export interface TierParams {
  id: AiTierId
  /** relative score noise (sigma as a fraction of the score spread) */
  noise: number
  /** hard Leader safety: candidates with leaderRisk above this are removed before scoring */
  tauSafe: number
  /** commit to an assassination line at or above this pKill (null = no search) */
  tauGo: number | null
  /** abort a committed line below this */
  tauAbort: number
  /** focus knapsack (false = boost when pHit < 60%, no additional attacks) */
  knapsack: boolean
  /** weight of threat exposure in move scoring (0 = no lookahead at enemy replies) */
  wThreat: number
  /** weight of scenario control */
  wScenario: number
  /** focus the Leader always keeps for Power Field */
  minReserve: number
  /** terrain cover scales projected ranged threat (LOS from each shooter to the candidate point) */
  cover: boolean
  /** pull toward the model's scenario role (per inch) */
  wRole: number
  /** move candidates per decision */
  moveSamples: number
}

export const TIERS: Record<AiTierId, TierParams> = {
  easy: { id: 'easy', noise: 0.15, tauSafe: 0.4, tauGo: null, tauAbort: 1, knapsack: false, wThreat: 0, wScenario: 3, minReserve: 1, moveSamples: 24, wRole: 0.2, cover: false },
  normal: { id: 'normal', noise: 0, tauSafe: 0.15, tauGo: 0.5, tauAbort: 0.3, knapsack: true, wThreat: 0.5, wScenario: 6, minReserve: 0, moveSamples: 48, wRole: 0.3, cover: true },
}

/** Tuning hook for the bench (node only): AI_TUNE="normal.wThreat=0.5,easy.noise=0.2". */
export function applyTuning(spec: string | undefined): void {
  if (!spec) return
  for (const part of spec.split(',')) {
    const m = /^(easy|normal)\.(\w+)=(.+)$/.exec(part.trim())
    if (!m) continue
    const t = TIERS[m[1] as AiTierId] as unknown as Record<string, unknown>
    const v = m[3]!
    t[m[2]!] = v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : Number(v)
  }
}
