// M9 factions: the army picker lists all six factions (e2e-out/m9-picker.png); each new faction (Trollbloods, Circle,
// Cryx, Menoth) plays a bot-vs-bot game against a random other faction to round 2 with no page errors
// (e2e-out/m9-<faction>.png); and a human Trollbloods game shows the warlock's fury UI (e2e-out/m9-fury.png).
import { expect, test, type Page } from '@playwright/test'
import { humanStep, snap, waitForHuman } from './policy'

const OUT = 'e2e-out'
const ALL = ['cyg', 'kha', 'trl', 'cir', 'cry', 'men'] as const
const NEW = ['trl', 'cir', 'cry', 'men'] as const

function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
  return errors
}

test.describe.configure({ mode: 'serial' })

test('army picker lists all six factions', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 })
  const errors = watchErrors(page)
  await page.goto('./?test=1')
  await expect(page.getByTestId('title')).toBeVisible()
  for (const f of ALL) await expect(page.getByTestId(`setup-faction-${f}`), f).toBeVisible()
  await page.getByTestId('setup-faction-trl').click()
  await expect(page.getByTestId('start-models')).toContainText(/Gunnbjorn/i)
  // the opponent army list offers every faction's starter too
  expect(await page.getByTestId('start-opponent-army').locator('option').count()).toBe(ALL.length + 1)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/m9-picker.png` })
  expect(errors).toEqual([])
})

for (const f of NEW) {
  test(`faction ${f}: bot vs bot against a random other faction to round 2`, async ({ page }) => {
    test.setTimeout(6 * 60_000)
    await page.setViewportSize({ width: 1280, height: 760 })
    const errors = watchErrors(page)
    const glb: Record<string, number> = {}
    page.on('response', (r) => { const u = r.url(); if (u.endsWith('.glb')) glb[u.split('/').pop()!] = r.status() })
    const others = ALL.filter((x) => x !== f)
    const other = others[Math.floor(Math.random() * others.length)]!
    await page.goto(`./?test=1&scenario=scn-ashwall-divide&lists=${f},${other}&control=bot,bot&bot=normal&seed=m9-${f}`)
    await expect(page.getByTestId('battlefield')).toBeVisible({ timeout: 30_000 })
    await page.evaluate(() => window.__game!.speed(0))
    let s = await snap(page)
    for (let i = 0; i < 1200 && s.phase !== 'ended' && s.round < 2; i++) {
      await page.waitForTimeout(250)
      s = await snap(page)
    }
    // let the round-2 opening settle at a watchable speed, then shoot
    await page.evaluate(() => window.__game!.speed(1))
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${OUT}/m9-${f}.png` })
    const factions = await page.evaluate(() => { const st = window.__game!.state()!; return [st.players.A.faction, st.players.B.faction] })
    console.log('M9', f, 'vs', other, JSON.stringify({ end: s, factions }))
    console.log('M9 glbs', f, JSON.stringify(glb))
    expect(Object.values(glb).every((st) => st === 200 || st === 304)).toBe(true)
    expect(factions).toEqual([f, other])
    expect(s.phase === 'ended' || s.round >= 2).toBe(true)
    expect(errors).toEqual([])
  })
}

test('gallery: the 21 M9 figure GLBs', async ({ page }) => {
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 760 })
  await page.goto('./?gallery')
  await expect(page.getByTestId('gallery')).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/m9-gallery.png` })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/m9-gallery-2.png` })
  expect(errors).toEqual([])
})

test('warlock fury UI: Trollbloods vs the Normal bot', async ({ page }) => {
  test.setTimeout(8 * 60_000)
  await page.setViewportSize({ width: 1280, height: 760 })
  const errors = watchErrors(page)
  await page.goto('./?test=1&seed=m9-fury')
  await expect(page.getByTestId('title')).toBeVisible()
  await page.getByTestId('setup-faction-trl').click()
  await page.getByTestId('start-opponent').selectOption('normal')
  await page.getByTestId('start-speed-fast').click()
  await page.getByTestId('start-button').click()
  await expect(page.getByTestId('battlefield')).toBeVisible()

  const counts: Record<string, number> = {}
  let shot = null as 'leech' | 'card' | null
  let last = ''
  let same = 0
  for (let n = 0; n < 500; n++) {
    const s = await waitForHuman(page, 3)
    if (s.phase === 'ended' || s.kind === 'gameOver' || s.round >= 3) break
    // the leech form (start of a warlock turn) is the richest fury view; a card with fury pips is the fallback
    if (s.kind === 'leech' && (await page.getByTestId('leech-form').isVisible())) {
      await page.waitForTimeout(500)
      await page.screenshot({ path: `${OUT}/m9-fury.png` })
      shot = 'leech'
      break
    }
    if (!shot && s.round >= 1 && (await page.locator('[data-testid^="card-fury-"]').first().isVisible().catch(() => false))) {
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${OUT}/m9-fury.png` })
      shot = 'card'
    }
    const key = `${s.kind}:${JSON.stringify(s.options)}:${s.round}`
    same = key === last ? same + 1 : 0
    last = key
    const did = same > 6 ? '' : await humanStep(page, s, counts)
    if (!did) await page.evaluate(() => { const g = window.__game!; const l = g.legal(); if (l[0]) g.dispatch(l[0]) })
    await page.waitForTimeout(60)
  }
  console.log('M9 fury', JSON.stringify({ shot, counts }))
  expect(shot).not.toBeNull()
  expect(errors).toEqual([])
})

