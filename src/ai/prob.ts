// Closed-form dice math (40-ai §3): exact enumeration over n d6 (n <= 5), memoised. Pure, no engine state.
// Attack rolls: hit iff sum >= need, except all 1s always miss and all 6s always hit when n >= 2 (R1.5).
// Damage: D = max(0, sum of k d6 + x) where x = POW - ARM (plus flat bonuses). Distributions are arrays of
// probabilities indexed by damage points; sequences convolve and truncate at the target's remaining boxes.

/** A probability distribution over damage points 0..len-1 (the last cell may hold "this many or more"). */
export type Dist = number[]

const sumCache = new Map<number, number[]>()
/** Count of outcomes of n d6 by sum (index = sum), 6^n outcomes in total. */
export function sumCounts(n: number): number[] {
  const hit = sumCache.get(n)
  if (hit) return hit
  let cur = [1]
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(cur.length + 6).fill(0)
    for (let s = 0; s < cur.length; s++) if (cur[s]) for (let f = 1; f <= 6; f++) next[s + f]! += cur[s]!
    cur = next
  }
  sumCache.set(n, cur)
  return cur
}

/** Number of outcomes (of 6^n) with sum >= t. */
export function countAtLeast(n: number, t: number): number {
  const c = sumCounts(n)
  let k = 0
  for (let s = Math.max(0, t); s < c.length; s++) k += c[s]!
  return k
}

const hitCache = new Map<string, number>()
/** P(hit) for n attack dice needing a sum of `need` (DEF - (stat + mods)). n = 0 is an automatic miss. */
export function pHit(n: number, need: number): number {
  if (n <= 0) return 0
  const key = `${n}|${need}`
  const hit = hitCache.get(key)
  if (hit !== undefined) return hit
  const total = 6 ** n
  let k = countAtLeast(n, need)
  if (n >= need) k -= 1 // all 1s (sum n) always miss
  if (n >= 2 && 6 * n < need) k += 1 // all 6s always hit
  const p = Math.min(1, Math.max(0, k / total))
  hitCache.set(key, p)
  return p
}

/** P(crit-shaped roll): a hit with any two dice matching. Exact for n <= 4. */
export function pDoubles(n: number, need: number): number {
  if (n < 2) return 0
  const key = `d${n}|${need}`
  const hit = hitCache.get(key)
  if (hit !== undefined) return hit
  let k = 0
  const dice = new Array<number>(n).fill(1)
  const total = 6 ** n
  for (let i = 0; i < total; i++) {
    let x = i
    for (let j = 0; j < n; j++) { dice[j] = (x % 6) + 1; x = Math.floor(x / 6) }
    const s = dice.reduce((a, b) => a + b, 0)
    const all1 = dice.every((d) => d === 1), all6 = dice.every((d) => d === 6)
    const hits = !all1 && (all6 || s >= need)
    if (!hits) continue
    const seen = new Set(dice)
    if (seen.size < n) k++
  }
  const p = k / total
  hitCache.set(key, p)
  return p
}

const dmgCache = new Map<string, Dist>()
/** Distribution of max(0, sum(k d6) + x); k is clamped to at least 1 die. */
export function damageDist(k: number, x: number): Dist {
  const n = Math.max(1, Math.min(5, Math.round(k)))
  const key = `${n}|${x}`
  const hit = dmgCache.get(key)
  if (hit) return hit
  const c = sumCounts(n)
  const total = 6 ** n
  const out: number[] = [0]
  for (let s = n; s < c.length; s++) {
    const v = Math.max(0, s + x)
    while (out.length <= v) out.push(0)
    out[v]! += c[s]! / total
  }
  dmgCache.set(key, out)
  return out
}

/** Expected value of a distribution. */
export function expected(d: Dist): number {
  let e = 0
  for (let i = 1; i < d.length; i++) e += i * d[i]!
  return e
}

/** P(value >= h). */
export function atLeast(d: Dist, h: number): number {
  let p = 0
  for (let i = Math.max(0, h); i < d.length; i++) p += d[i]!
  return Math.min(1, p)
}

/** Mixture: miss with 1 - p (0 damage), else the on-hit distribution. */
export function attackDist(p: number, onHit: Dist): Dist {
  const out = onHit.map((v) => v * p)
  out[0] = (out[0] ?? 0) + (1 - p)
  return out
}

/** Sum of two independent damage values, truncated at `cap` (cell cap = "cap or more"). */
export function convolve(a: Dist, b: Dist, cap = 60): Dist {
  const len = Math.min(cap + 1, a.length + b.length - 1)
  const out = new Array<number>(len).fill(0)
  for (let i = 0; i < a.length; i++) {
    const pa = a[i]!
    if (!pa) continue
    for (let j = 0; j < b.length; j++) {
      const pb = b[j]!
      if (!pb) continue
      out[Math.min(len - 1, i + j)]! += pa * pb
    }
  }
  return out
}

/** One attack in a sequence: hit chance and on-hit damage distribution (points before Power Field). */
export interface SeqAttack { p: number; onHit: Dist; melee?: boolean; knockdown?: number }

/**
 * P(the sequence removes `boxes` remaining boxes) with the defender's Power Field reserve `pf` (each positive damage
 * instance while pf > 0 is cut by 5, greedy, worst case for the attacker) and Tough (on reaching 0 boxes, 1/3 chance
 * to stay at 1 box; a Tough save leaves the model knocked down, so later melee attacks auto-hit).
 * Exact DP over (damage taken, pf left, knocked down).
 */
export function pKillSequence(attacks: readonly SeqAttack[], boxes: number, pf = 0, tough = false): number {
  const H = Math.max(1, boxes)
  // state key: dmg * (pf+1) * 2 + pfLeft * 2 + kd; dmg in [0, H] where H = dead
  const W = (pf + 1) * 2
  let cur = new Float64Array((H + 1) * W)
  cur[0 * W + pf * 2 + 0] = 1
  for (const a of attacks) {
    const next = new Float64Array((H + 1) * W)
    for (let d = 0; d <= H; d++) {
      for (let f = 0; f <= pf; f++) {
        for (let kd = 0; kd < 2; kd++) {
          const pr = cur[d * W + f * 2 + kd]!
          if (!pr) continue
          if (d >= H) { next[d * W + f * 2 + kd]! += pr; continue }
          const ph = kd && a.melee ? 1 : a.p
          // miss
          next[d * W + f * 2 + kd]! += pr * (1 - ph)
          if (ph <= 0) continue
          for (let v = 0; v < a.onHit.length; v++) {
            const pv = a.onHit[v]!
            if (!pv) continue
            let pts = v, f2 = f
            if (pts > 0 && f2 > 0) { pts = Math.max(0, pts - 5); f2-- }
            const d2 = Math.min(H, d + pts)
            const q = pr * ph * pv
            if (d2 >= H && tough) {
              next[H * W + f2 * 2 + kd]! += q * (2 / 3)
              next[(H - 1) * W + f2 * 2 + 1]! += q * (1 / 3)
              continue
            }
            next[d2 * W + f2 * 2 + kd]! += q
          }
        }
      }
    }
    cur = next
  }
  let p = 0
  for (let f = 0; f <= pf; f++) for (let kd = 0; kd < 2; kd++) p += cur[H * W + f * 2 + kd]!
  return Math.min(1, Math.max(0, p))
}

/** Expected damage of a sequence without truncation (Power Field ignored). */
export function expectedSequence(attacks: readonly SeqAttack[]): number {
  return attacks.reduce((a, x) => a + x.p * expected(x.onHit), 0)
}

/** Find x such that E[max(0, sum(k d6) + x)] * p matches `target` best (used to read POW - ARM back from a preview). */
export function invertDamageOffset(k: number, p: number, target: number, guess: number): number {
  if (p <= 0) return guess
  let best = guess, err = Infinity
  for (let x = guess - 12; x <= guess + 12; x++) {
    const e = Math.abs(expected(damageDist(k, x)) * p - target)
    if (e < err - 1e-9) { err = e; best = x }
  }
  return best
}
