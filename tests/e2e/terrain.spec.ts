// M8 terrain: Battlefield selector, ?board= override, board name in the top bar, terrain tooltip, zones toggle.
// Runs without the terrain GLBs: missing models fall back to the procedural pieces, which must still draw and hover.
import { expect, test } from '@playwright/test'

test('start screen offers Random plus the five boards', async ({ page }) => {
  await page.goto('./')
  const sel = page.getByTestId('start-battlefield')
  await expect(sel).toBeVisible()
  const options = await sel.locator('option').allTextContents()
  expect(options).toEqual(['Random', 'Hollowmere Bog', 'Veilstone Ruins', 'Ironpine Hamlet', 'Cinder Blight', 'Frostline Outpost'])
  await sel.selectOption('board.village')
  await page.locator('[data-testid^="setup-faction-"]', { hasText: /^Khador$/ }).click()
  await page.getByTestId('start-button').click()
  await expect(page.getByTestId('hud-board')).toHaveText('Ironpine Hamlet')
})

test('?board= beats the selector and the board shows in the top bar', async ({ page }) => {
  await page.goto('./?test=1&scenario=scn-ashwall-divide&lists=kha,cyg&seed=t8&board=outpost')
  await expect(page.getByTestId('hud-board')).toHaveText('Frostline Outpost')
  expect(await page.evaluate(() => window.__game?.state()?.seed)).toBe('t8')
})

test('hovering terrain shows its name and rules; the zones toggle is in settings', async ({ page }) => {
  await page.goto('./?test=1&scenario=scn-ashwall-divide&lists=kha,cyg&seed=t8&board=bog')
  await expect(page.getByTestId('battlefield')).toBeVisible()
  await page.getByTestId('settings-button').click()
  await expect(page.getByTestId('set-zones')).toBeVisible()
  await page.getByTestId('set-zones').check()
  await page.keyboard.press('Escape')
  // sweep the pointer across the table until a terrain piece answers
  const box = (await page.getByTestId('battlefield').boundingBox())!
  let seen = false
  for (let gy = 0.25; gy <= 0.8 && !seen; gy += 0.05) {
    for (let gx = 0.3; gx <= 0.7 && !seen; gx += 0.03) {
      await page.mouse.move(box.x + box.width * gx, box.y + box.height * gy)
      seen = await page.getByTestId('terrain-tooltip').isVisible()
    }
  }
  expect(seen).toBe(true)
  await expect(page.getByTestId('terrain-tooltip-name')).not.toHaveText('')
  await expect(page.getByTestId('terrain-tooltip-kind')).not.toHaveText('')
  await page.screenshot({ path: 'e2e-out/terrain-tooltip.png' })
})
