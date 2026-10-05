// Shared e2e helpers: read which decision is open (window.__game is read-only here) and answer it with a click.
import type { Page } from '@playwright/test'

export interface Snap { kind: string | null; player: string | null; human: boolean; idle: boolean; round: number; phase: string; options: string[] }

export const snap = (page: Page): Promise<Snap> => page.evaluate(() => {
  const g = window.__game!
  const s = g.state()
  const pd = g.pending()
  return {
    kind: pd?.kind ?? null, player: pd?.player ?? null, human: !!pd && g.controllers()[pd.player] === 'human',
    idle: g.presentedIdle(), round: s?.round ?? 0, phase: s?.phase ?? 'none', options: (pd?.options ?? []).map((o) => o.id),
  }
})

/** Wait until the human has a prompt on screen, or the game is over / at round 3. */
export async function waitForHuman(page: Page, stopRound: number): Promise<Snap> {
  for (let i = 0; i < 240; i++) {
    const s = await snap(page)
    if (s.phase === 'ended' || s.kind === 'gameOver' || s.round >= stopRound) return s
    if (s.human && s.idle) return s
    await page.waitForTimeout(250)
  }
  throw new Error(`no human prompt in 60 s: ${JSON.stringify(await snap(page))}`)
}

export const visible = async (page: Page, sel: string): Promise<boolean> => {
  const l = page.locator(sel).first()
  return (await l.count()) > 0 && (await l.isVisible()) && (await l.isEnabled())
}
export async function clickFirst(page: Page, sels: string[]): Promise<string | null> {
  for (const sel of sels) {
    if (await visible(page, sel)) { await page.locator(sel).first().click(); return sel }
  }
  return null
}

/** One human answer, chosen like a new player would: through the dock, the activation panel or the board. */
export async function humanStep(page: Page, s: Snap, counts: Record<string, number>): Promise<string> {
  const k = s.kind ?? ''
  counts[k] = (counts[k] ?? 0) + 1
  const dock = '[data-testid^="prompt-"].hud-dock'
  switch (k) {
    case 'deploy': case 'advanceDeploy': case 'placeTroopers':
      return (await clickFirst(page, ['[data-testid=board-auto]', '[data-testid=board-confirm]', '[data-testid=prompt-pass]'])) ?? ''
    case 'moveModel': {
      if (await clickFirst(page, ['[data-testid=board-full]'])) return 'full'
      if (await visible(page, '[data-testid=board-spot-0]')) {
        await page.getByTestId('board-spot-0').click()
        await page.getByTestId('board-confirm').click()
        return 'spot'
      }
      return (await clickFirst(page, ['[data-testid=board-stay]', '[data-testid=prompt-pass]'])) ?? ''
    }
    case 'allocateFocus':
      return (await clickFirst(page, ['[data-testid=focus-fill]', '[data-testid=focus-confirm]'])) ?? ''
    case 'payUpkeep':
      return (await clickFirst(page, ['[data-testid=upkeep-confirm]'])) ?? ''
    case 'shake':
      return (await clickFirst(page, ['[data-testid=prompt-pass]', '[data-testid=shake-pick-0]'])) ?? ''
    case 'chooseMovement': {
      // cast a spell before moving when one is offered (once per activation is plenty), else charge, else advance
      const n = counts[k]
      if (n % 3 === 1 && (await clickFirst(page, ['[data-testid^="act-cast-"]']))) return 'cast'
      return (await clickFirst(page, ['[data-testid=act-move-charge]', '[data-testid=act-move-advance]', '[data-testid=act-move-aim]', '[data-testid=act-move-forfeit]'])) ?? ''
    }
    case 'chooseCombatAction':
      return (await clickFirst(page, ['[data-testid=act-combat] button:has-text("Ranged attacks")', '[data-testid=act-combat] button:has-text("Melee attacks")', '[data-testid=act-combat] button:not([disabled])'])) ?? ''
    case 'chooseAttack': {
      // at most three attack clicks per decision chain, then end the activation
      if ((counts.attackClicks = (counts.attackClicks ?? 0) + 1) % 4 !== 0 && (await clickFirst(page, ['[data-testid^="act-attack-"]:not([disabled])']))) return 'attack'
      return (await clickFirst(page, ['[data-testid=act-end-attacks]', '[data-testid=hud-end-activation]'])) ?? ''
    }
    case 'chooseActivation':
      return (await clickFirst(page, [`${dock} [data-testid^="prompt-option-"]:not([disabled])`, '[data-testid=hud-end-turn]'])) ?? ''
    case 'boostAttack': case 'boostDamage':
      return (await clickFirst(page, ['[data-testid=prompt-boost-yes]:not([disabled])', '[data-testid=prompt-boost-no]'])) ?? ''
    default:
      return (await clickFirst(page, [`${dock} [data-testid^="prompt-option-"]:not([disabled])`, '[data-testid=prompt-pass]', '[data-testid=upkeep-confirm]'])) ?? ''
  }
}

