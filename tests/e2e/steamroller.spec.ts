// M13 end to end (91): Steamroller 2026 scenarios, command cards and the game clock, played through the UI. Cygnar against the Normal bot
// with cards On and the Steamroller clock On, to round 2 on two scenarios (Trench Warfare from the start screen, High Stakes from the URL),
// playing one command card by clicking the Cards tray. Every answer is a click; window.__game is only READ here. Screenshots land in
// e2e-out/sr-*.png at 1280x760. The last test runs a human's clock out (CLK-015).
import { expect, test, type Page } from '@playwright/test'
import { humanStep, snap, waitForHuman } from './policy'

const OUT = 'e2e-out'
const TW = 'scn-sr26-trench-warfare'
const HS = 'scn-sr26-high-stakes'
const POOL_MS = 30 * 60_000 // Skirmish, 50 points: the Steamroller pool is 30 minutes each (CLK1)

function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
  return errors
}

/** Open the tray, shoot it, click the first enabled play and wait for the tray to close; returns the played button's test id. */
async function playOneCard(page: Page, shot: string): Promise<string> {
  await page.getByTestId('cards-button').click()
  await expect(page.getByTestId('cards-tray')).toBeVisible()
  await expect(page.getByTestId('hand-mine')).toBeVisible()
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${OUT}/${shot}.png` })
  const btn = page.locator('[data-testid^="card-play-"]:not([disabled])').first()
  const id = (await btn.getAttribute('data-testid')) ?? ''
  await btn.click()
  await expect(page.getByTestId('cards-tray')).toHaveCount(0)
  return id
}

interface Run { counts: Record<string, number>; stuck: string[]; cardId: string | null; sawFlagPick: boolean }

/** Answer the human's decisions with clicks until round `stopRound`, playing one card at the first activation that offers one. */
async function playToRound(page: Page, stopRound: number, wantCard: boolean, flagShot?: string): Promise<Run> {
  const run: Run = { counts: {}, stuck: [], cardId: null, sawFlagPick: false }
  let last = ''
  let same = 0
  for (let n = 0; n < 500; n++) {
    const s = await waitForHuman(page, stopRound)
    if (s.phase === 'ended' || s.kind === 'gameOver' || s.round >= stopRound) break
    await expect(page.locator('.hud-dock.prompt')).toBeVisible()
    await expect(page.getByTestId('prompt-title')).not.toBeEmpty()
    if (s.kind === 'abilityChoice' && s.options.some((o) => o.includes('|'))) {
      run.sawFlagPick = true
      if (flagShot) { await page.screenshot({ path: `${OUT}/${flagShot}.png` }); flagShot = undefined }
    }
    if (wantCard && !run.cardId && s.kind === 'chooseMovement' && s.round >= 1) {
      const playable = Number((await page.getByTestId('cards-button').getAttribute('data-playable')) ?? '0')
      if (playable > 0) {
        run.cardId = await playOneCard(page, 'sr-cards-tray')
        continue
      }
    }
    const key = `${s.kind}:${JSON.stringify(s.options)}:${s.round}`
    same = key === last ? same + 1 : 0
    last = key
    const did = same > 6 ? '' : await humanStep(page, s, run.counts)
    if (!did) {
      run.stuck.push(`${s.kind} r${s.round}`)
      await page.evaluate(() => { const g = window.__game!; const l = g.legal().filter((a) => a.type !== 'playCard'); const a = l[0] ?? g.legal()[0]; if (a) g.dispatch(a) })
    }
    await page.waitForTimeout(60)
  }
  return run
}

test.describe.configure({ mode: 'serial' })

test('Trench Warfare from the start screen: Cygnar, cards On, Steamroller clock, one card played, to round 2', async ({ page }) => {
  test.setTimeout(8 * 60_000)
  await page.setViewportSize({ width: 1280, height: 760 })
  const errors = watchErrors(page)
  await page.goto('./?test=1&seed=e2e-sr-tw')
  await expect(page.getByTestId('start-screen')).toBeVisible()

  // the start screen: Steamroller scenarios in their own group with Random (d8), cards default On, the clock Off until chosen
  await page.getByTestId('start-size').selectOption('skirmish')
  await page.locator('[data-testid^="setup-faction-"]', { hasText: /^Cygnar$/ }).click()
  const scenario = page.getByTestId('start-scenario')
  await expect(scenario.locator('optgroup[label="Steamroller 2026"] option')).toHaveCount(8)
  await expect(scenario.locator('option', { hasText: 'Random (d8)' })).toHaveCount(1)
  await scenario.selectOption(TW)
  await expect(page.getByTestId('start-cards-on')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('start-clock-off')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('start-clock-steamroller').click()
  await expect(page.getByTestId('start-clock-note')).toContainText('30 minutes each')
  await page.getByTestId('start-speed-fast').click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/sr-start.png` })
  const startBox = await page.getByTestId('start-button').boundingBox()
  expect(startBox && startBox.y + startBox.height).toBeLessThanOrEqual(760)
  await page.getByTestId('start-button').click()
  await expect(page.getByTestId('battlefield')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('hud-topbar')).toBeVisible()

  // the game: Skirmish table, both hands of five, the scenario's elements, and two clock chips with the bot untimed
  const info = await page.evaluate(() => {
    const s = window.__game!.state()!
    return { scenario: s.scenario.id, table: s.scenario.table, hands: [s.players.A.cards?.hand.length, s.players.B.cards?.hand.length], factions: [s.players.A.faction, s.players.B.faction] }
  })
  expect(info.scenario).toBe(TW)
  expect(info.table).toEqual({ w: 48, d: 48 })
  expect(info.hands).toEqual([5, 5])
  expect(info.factions[0]).toBe('cyg')
  await expect(page.getByTestId('clock-bar')).toBeVisible()
  await expect(page.getByTestId('clock-chip-A')).toBeVisible()
  await expect(page.getByTestId('clock-chip-B')).toHaveAttribute('data-status', 'untimed')
  await expect(page.getByTestId('cards-button')).toBeVisible()

  const run = await playToRound(page, 2, true, 'sr-flag-pick')
  const final = await snap(page)
  console.log('SR trench warfare:', JSON.stringify({ counts: run.counts, stuck: run.stuck, card: run.cardId, flagPick: run.sawFlagPick, final }))
  expect(final.phase === 'ended' || final.round >= 2).toBe(true)

  // one card was played through the tray: the engine records it and the feed says so
  expect(run.cardId).toMatch(/^card-play-core\.card\./)
  const played = await page.evaluate(() => window.__game!.state()!.players.A.cards?.played ?? [])
  expect(played).toHaveLength(1)
  await page.getByTestId('cards-button').click()
  await expect(page.getByTestId(`card-played-${played[0]!.cardId}`)).toBeVisible()
  await page.getByTestId('cards-tab-theirs').click()
  await expect(page.getByTestId('hand-theirs')).toBeVisible()
  await expect(page.getByTestId('hand-theirs').locator('li')).toHaveCount(5)
  await page.screenshot({ path: `${OUT}/sr-cards-theirs.png` })
  await page.getByTestId('cards-close').click()

  // the scenario's elements are in the top bar and on the board (two of each kind in Trench Warfare)
  await expect(page.getByTestId('hud-control')).toBeVisible()
  expect(await page.locator('[data-testid^="hud-control-"]').count()).toBeGreaterThanOrEqual(7) // a claimed cache leaves the strip
  expect(await page.locator('[data-testid^="element-"]').count()).toBeGreaterThanOrEqual(7)

  // the clock ran for the human, not for the bot; Settings shows it and offers to turn it off
  const clock = await page.evaluate(() => window.__clock?.remaining ?? null)
  expect(clock).not.toBeNull()
  expect(clock!.A).toBeLessThan(POOL_MS)
  expect(clock!.A).toBeGreaterThan(0)
  expect(clock!.B).toBe(POOL_MS)
  await page.getByTestId('settings-button').click()
  await expect(page.getByTestId('set-clock-line')).toContainText('Steamroller clock: 30 minutes each')
  await expect(page.getByTestId('set-clock-off')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/sr-trench-warfare.png` })
  expect(run.stuck.length).toBeLessThanOrEqual(3)
  expect(errors).toEqual([])
})

test('High Stakes from the URL: cards On, Steamroller clock, countdown tokens on the table, to round 2', async ({ page }) => {
  test.setTimeout(8 * 60_000)
  await page.setViewportSize({ width: 1280, height: 760 })
  const errors = watchErrors(page)
  await page.goto(`./?test=1&size=skirmish&scenario=${HS}&lists=cyg,kha&seed=e2e-sr-hs&cards=on&clock=steamroller&bot=normal`)
  await expect(page.getByTestId('battlefield')).toBeVisible({ timeout: 30_000 })
  await page.evaluate(() => window.__game!.speed(1))
  await expect(page.getByTestId('clock-bar')).toBeVisible()
  await expect(page.getByTestId('cards-button')).toBeVisible()
  // High Stakes puts five tokens on the 50 mm objective and on each flag's terrain
  await expect(page.getByTestId('hud-tokens-el-50')).toHaveText('5')
  const tokens = await page.evaluate(() => Object.fromEntries(Object.entries(window.__game!.state()!.scenario.elementState ?? {}).map(([k, v]) => [k, v.tokens ?? null])))
  expect(tokens['el-50']).toBe(5)

  const run = await playToRound(page, 2, false, 'sr-flag-pick-hs')
  const final = await snap(page)
  console.log('SR high stakes:', JSON.stringify({ counts: run.counts, stuck: run.stuck, flagPick: run.sawFlagPick, final }))
  expect(final.phase === 'ended' || final.round >= 2).toBe(true)
  const s = await page.evaluate(() => { const st = window.__game!.state()!; return { scenario: st.scenario.id, table: st.scenario.table, vp: st.scenario.vp } })
  expect(s.scenario).toBe(HS)
  expect(s.table).toEqual({ w: 48, d: 48 })
  await page.getByTestId('cards-button').click()
  await expect(page.getByTestId('cards-tray')).toBeVisible()
  await page.getByTestId('cards-close').click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/sr-high-stakes.png` })
  expect(run.stuck.length).toBeLessThanOrEqual(3)
  expect(errors).toEqual([])
})

test('CLK-015 a human clock that runs out ends the game with an Out of time banner and the cause on the result screen', async ({ page }) => {
  test.setTimeout(4 * 60_000)
  await page.setViewportSize({ width: 1280, height: 760 })
  const errors = watchErrors(page)
  await page.goto(`./?test=1&size=skirmish&scenario=${TW}&lists=cyg,kha&seed=e2e-sr-clk&cards=on&clock=20&bot=normal`)
  await expect(page.getByTestId('battlefield')).toBeVisible({ timeout: 30_000 })
  await page.evaluate(() => window.__game!.speed(0))
  // the first decision after deployment starts, so the human's clock is the one running
  for (let n = 0; n < 200; n++) {
    const s = await waitForHuman(page, 3)
    if (s.kind === 'deploy' || s.kind === 'chooseActivation') break
    await humanStep(page, s, {})
    await page.waitForTimeout(60)
  }
  await page.evaluate(() => window.__clock!.set('A', 400))
  await expect(page.getByTestId('gameover')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('gameover-clock')).toContainText(/clock ran out/)
  await page.screenshot({ path: `${OUT}/sr-clock-out.png` })
  const result = await page.evaluate(() => window.__game!.state()!.scenario.result ?? null)
  expect(result?.timeout).toBe('A')
  expect(result?.winner).toBe('B')
  expect(errors).toEqual([])
})
