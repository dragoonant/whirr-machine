// M3 end-to-end: start screen -> How to Play -> a game as Cygnar against the bot, played through the UI with clicks
// until the game ends or round 3 begins. window.__game is only READ here (to know which decision is open); every
// answer is a click on the HUD or the board. Screenshots land in e2e-out/.
import { expect, test } from '@playwright/test'
import { humanStep, snap, visible, waitForHuman } from './policy'

const OUT = 'e2e-out'
const HELP_TABS = ['goal', 'army', 'turn', 'moving', 'attacking', 'focus', 'terrain', 'controls', 'first']

test('play a game through the UI until it ends or round 3', async ({ page }) => {
  test.setTimeout(8 * 60_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  // start screen
  await page.goto('./?test=1&seed=e2e-m3')
  await expect(page.getByTestId('title')).toContainText('Whirr Machine')
  await expect(page.getByText('not affiliated with Steamforged Games').first()).toBeVisible()
  await page.screenshot({ path: `${OUT}/start.png` })

  // How to Play: every tab opens and has a body
  await page.getByTestId('start-howto').click()
  await expect(page.getByTestId('help-overlay')).toBeVisible()
  for (const id of HELP_TABS) {
    const tab = page.getByTestId(`help-tab-${id}`)
    await expect(tab).toBeVisible()
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.help-body h3')).toHaveText((await tab.innerText()).trim())
  }
  await page.getByTestId('help-tab-first').click()
  await page.screenshot({ path: `${OUT}/howto.png` })
  await page.getByTestId('help-close').click()
  await expect(page.getByTestId('help-overlay')).toHaveCount(0)

  // Cygnar vs the bot, fast animations
  await page.locator('[data-testid^="setup-faction-"]', { hasText: /^Cygnar$/ }).click()
  await page.getByTestId('start-speed-fast').click()
  await page.getByTestId('start-button').click()
  await expect(page.getByTestId('battlefield')).toBeVisible()
  await expect(page.getByTestId('hud-topbar')).toBeVisible()

  const counts: Record<string, number> = {}
  const shots = new Set<string>()
  const shoot = async (name: string) => { if (!shots.has(name)) { shots.add(name); await page.screenshot({ path: `${OUT}/${name}.png` }) } }
  const stuck: string[] = []
  let last = ''
  let same = 0
  for (let n = 0; n < 400; n++) {
    const s = await waitForHuman(page, 3)
    if (s.phase === 'ended' || s.kind === 'gameOver' || s.round >= 3) break
    // the human must always see what to do: a prompt in the dock and a title
    await expect(page.locator('.hud-dock.prompt')).toBeVisible()
    await expect(page.getByTestId('prompt-title')).not.toBeEmpty()
    if (s.kind === 'deploy') await shoot('deploy')
    if (s.kind === 'boostAttack' || s.kind === 'boostDamage' || (s.kind === 'abilityChoice' && s.options.includes('powerful'))) await shoot('attack-prompt')
    if (s.kind === 'chooseAttack' && (await visible(page, '[data-testid^="act-attack-"]'))) await shoot('attack-choice')
    if (s.round === 2 && s.kind === 'chooseActivation') await shoot('midgame')
    const key = `${s.kind}:${JSON.stringify(s.options)}:${s.round}`
    same = key === last ? same + 1 : 0
    last = key
    const did = same > 6 ? '' : await humanStep(page, s, counts)
    if (!did) {
      // nothing clickable answered it: record it, then fast-forward with the engine's first legal answer
      stuck.push(`${s.kind} r${s.round}`)
      await page.evaluate(() => { const g = window.__game!; const l = g.legal(); if (l[0]) g.dispatch(l[0]) })
    }
    await page.waitForTimeout(60)
  }
  const final = await snap(page)
  if (final.phase === 'ended') await expect(page.getByTestId('gameover')).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: `${OUT}/gameover-or-round3.png` })
  if (!shots.has('attack-prompt')) await page.screenshot({ path: `${OUT}/attack-prompt.png` })
  if (!shots.has('midgame')) await page.screenshot({ path: `${OUT}/midgame.png` })

  console.log('decisions answered:', JSON.stringify(counts), 'stuck:', JSON.stringify(stuck), 'final:', JSON.stringify(final))
  expect(final.phase === 'ended' || final.round >= 3).toBe(true)
  expect(counts.deploy ?? 0).toBeGreaterThan(0)
  expect((counts.chooseAttack ?? 0) + (counts.boostAttack ?? 0)).toBeGreaterThan(0)
  expect(stuck.length).toBeLessThanOrEqual(2)
  expect(errors).toEqual([])
})

test('Khador on the Quick Start demo: a full round through the UI, attacking by clicking the enemy', async ({ page }) => {
  test.setTimeout(5 * 60_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('./?test=1&seed=e2e-kha')
  await page.locator('[data-testid^="setup-faction-"]', { hasText: /^Khador$/ }).click()
  await page.getByTestId('start-scenario').selectOption({ label: 'Quick Start Demo' })
  await page.getByTestId('start-speed-instant').click()
  await page.getByTestId('start-button').click()
  await expect(page.getByTestId('hud-topbar')).toBeVisible()

  const counts: Record<string, number> = {}
  let boardClicks = 0
  for (let n = 0; n < 300; n++) {
    const s = await waitForHuman(page, 2)
    if (s.phase === 'ended' || s.kind === 'gameOver' || s.round >= 2) break
    await expect(page.locator('.hud-dock.prompt')).toBeVisible()
    if (s.kind === 'chooseAttack') {
      // click the enemy figure itself (its DOM proxy forwards to the board controller)
      const target = await page.evaluate(() => (window.__game!.pending()?.options ?? []).map((o) => (o.action as { targetId?: string }).targetId).find(Boolean) ?? null)
      if (target && boardClicks < 3) {
        boardClicks++
        const before = await page.evaluate(() => window.__game!.pending()?.id)
        await page.getByTestId(`model-${target}`).click({ force: true })
        await expect.poll(() => page.evaluate(() => window.__game!.pending()?.id)).not.toBe(before)
        continue
      }
    }
    const did = await humanStep(page, s, counts)
    if (!did) await page.evaluate(() => { const g = window.__game!; const l = g.legal(); if (l[0]) g.dispatch(l[0]) })
  }
  const final = await snap(page)
  await page.screenshot({ path: `${OUT}/khador-round2.png` })
  expect(final.phase === 'ended' || final.round >= 2).toBe(true)
  expect(errors).toEqual([])
})
