// 90-skirmish C1-C3: the Skirmish game size end to end. The picker at Skirmish (e2e-out/skirmish-picker.png), a game
// started from the start screen on the 48" table (e2e-out/skirmish-table.png), and each faction's 50-point list against
// the Normal bot on Copperline Crossing to round 2 with no page errors (e2e-out/skirmish-<faction>.png).
import { expect, test, type Page } from '@playwright/test'
import { snap } from './policy'

const OUT = 'e2e-out'
const ALL = ['cyg', 'kha', 'trl', 'cir', 'cry', 'men'] as const
const S3 = 'scn-copperline-crossing'

function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
  return errors
}

test.describe.configure({ mode: 'serial' })

test('the picker at Skirmish: six 50-point lists, Copperline Crossing, Start above the fold', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 })
  const errors = watchErrors(page)
  await page.goto('./?test=1')
  await expect(page.getByTestId('title')).toBeVisible()
  // recon is the default
  await expect(page.getByTestId('start-size')).toHaveValue('recon')
  await expect(page.getByTestId('start-scenario')).not.toContainText('Copperline Crossing')
  await page.getByTestId('start-size').selectOption('skirmish')
  await expect(page.getByTestId('start-size')).toHaveValue('skirmish')
  for (const f of ALL) await expect(page.getByTestId(`setup-faction-${f}`), f).toBeVisible()
  await page.getByTestId('setup-faction-cyg').click()
  await expect(page.getByTestId('start-models')).toContainText(/Tempest Assailers/i)
  await expect(page.getByTestId('start-scenario')).toContainText('Copperline Crossing')
  await expect(page.getByTestId('start-scenario')).not.toContainText('Quick Start Demo')
  expect(await page.getByTestId('start-opponent-army').locator('option').count()).toBe(ALL.length + 1)
  // the size is remembered, and the side stays the same faction when the size flips back
  await page.reload()
  await expect(page.getByTestId('start-size')).toHaveValue('skirmish')
  await page.getByTestId('setup-faction-kha').click()
  await page.getByTestId('start-size').selectOption('recon')
  await expect(page.getByTestId('setup-faction-kha')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('start-models')).not.toContainText(/Arkanists/i)
  await page.getByTestId('start-size').selectOption('skirmish')
  await expect(page.getByTestId('start-models')).toContainText(/Arkanists/i)
  // Start stays on screen at 1280x760
  const box = await page.getByTestId('start-button').boundingBox()
  expect(box && box.y + box.height).toBeLessThanOrEqual(760)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/skirmish-picker.png` })
  expect(errors).toEqual([])
})

test('?size=skirmish preselects the size and an unknown size falls back to recon with one warning', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()) })
  await page.goto('./?size=skirmish')
  await expect(page.getByTestId('start-size')).toHaveValue('skirmish')
  await page.evaluate(() => localStorage.clear())
  await page.goto('./?size=gigantic')
  await expect(page.getByTestId('start-size')).toHaveValue('recon')
  expect(warnings.filter((w) => w.includes('gigantic'))).toHaveLength(1)
})

test('a Skirmish game from the start screen: 48 inch table, both skirmish lists, Kill Box line', async ({ page }) => {
  test.setTimeout(3 * 60_000)
  await page.setViewportSize({ width: 1280, height: 760 })
  const errors = watchErrors(page)
  await page.goto('./?test=1&seed=skirmish-ui')
  await page.getByTestId('start-size').selectOption('skirmish')
  await page.getByTestId('setup-faction-men').click()
  await page.getByTestId('start-opponent-army').selectOption('trl')
  await page.getByTestId('start-speed-instant').click()
  await page.getByTestId('start-button').click()
  await expect(page.getByTestId('battlefield')).toBeVisible({ timeout: 30_000 })
  const info = await page.evaluate(() => {
    const s = window.__game!.state()!
    return { table: s.scenario.table, scenario: s.scenario.id, factions: [s.players.A.faction, s.players.B.faction], models: Object.keys(s.models).length }
  })
  expect(info.table).toEqual({ w: 48, d: 48 })
  expect(info.scenario).toBe(S3)
  expect(info.factions).toEqual(['men', 'trl'])
  expect(info.models).toBeGreaterThan(24)
  // take the first legal answer until both edges are chosen: the zones and the Kill Box lines are drawn from then on
  for (let i = 0; i < 12; i++) {
    const done = await page.evaluate(() => { const st = window.__game!.state()!; return !!st.players.A.edge && !!st.players.B.edge })
    if (done) break
    await page.evaluate(() => { const g = window.__game!; const l = g.legal(); if (l[0]) g.dispatch(l[0]) })
    await page.waitForTimeout(150)
  }
  await page.evaluate(() => window.__game!.speed(1))
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/skirmish-table.png` })
  expect(errors).toEqual([])
})

for (const f of ALL) {
  test(`skirmish ${f}: its 50-point list against the Normal bot on Copperline Crossing to round 2`, async ({ page }) => {
    test.setTimeout(8 * 60_000)
    await page.setViewportSize({ width: 1280, height: 760 })
    const errors = watchErrors(page)
    const glb: Record<string, number> = {}
    page.on('response', (r) => { const u = r.url(); if (u.endsWith('.glb')) glb[u.split('/').pop()!] = r.status() })
    const others = ALL.filter((x) => x !== f)
    const other = others[(ALL.indexOf(f) + 2) % others.length]!
    await page.goto(`./?test=1&size=skirmish&scenario=${S3}&lists=${f},${other}&control=bot,bot&bot=normal&seed=sk-${f}`)
    await expect(page.getByTestId('battlefield')).toBeVisible({ timeout: 30_000 })
    await page.evaluate(() => window.__game!.speed(0))
    let s = await snap(page)
    for (let i = 0; i < 1600 && s.phase !== 'ended' && s.round < 2; i++) {
      await page.waitForTimeout(250)
      s = await snap(page)
    }
    await page.evaluate(() => window.__game!.speed(1))
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${OUT}/skirmish-${f}.png` })
    const info = await page.evaluate(() => { const st = window.__game!.state()!; return { factions: [st.players.A.faction, st.players.B.faction], table: st.scenario.table, models: Object.keys(st.models).length } })
    console.log('SKIRMISH', f, 'vs', other, JSON.stringify({ end: s, info }))
    expect(info.factions).toEqual([f, other])
    expect(info.table).toEqual({ w: 48, d: 48 })
    expect(Object.values(glb).every((st) => st === 200 || st === 304)).toBe(true)
    expect(s.phase === 'ended' || s.round >= 2).toBe(true)
    expect(errors).toEqual([])
  })
}
