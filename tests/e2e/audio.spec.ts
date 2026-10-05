// M6 audio: every file on the audition page exists, and a game against the bot really decodes and plays sounds
// (moves, shots, dice, focus, narrator) and music (title theme on the start screen, battle loops in game).
// Reads window.__audio.stats (installed with ?test=1); the page itself is played through clicks as in play.spec.
import { expect, test } from '@playwright/test'
import { humanStep, snap, waitForHuman } from './policy'

interface Stats { decoded: string[]; failed: string[]; played: Record<string, number>; music: string[] }
const stats = (page: import('@playwright/test').Page): Promise<Stats | null> =>
  page.evaluate(() => (window as unknown as { __audio?: { stats: Stats } }).__audio?.stats ?? null)

test('sounds.html lists only files that exist', async ({ page, request }) => {
  await page.goto('./sounds.html')
  const paths = await page.evaluate(() => (window as unknown as { ITEMS: { id: string; kind: string }[] }).ITEMS.map((i) => (i.kind === 'music' ? `audio/music/${i.id}.mp3` : `audio/${i.id}.mp3`)))
  expect(paths.length).toBeGreaterThan(60)
  for (const p of paths) {
    const res = await request.get(`./${p}`)
    expect(res.status(), p).toBe(200)
    expect(res.headers()['content-type'] ?? '', p).not.toContain('text/html')
  }
})

test('a game plays sound effects, narrator lines and music', async ({ page }) => {
  test.setTimeout(8 * 60_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  await page.goto('./?test=1&seed=audio-m6')
  await expect(page.getByTestId('sound-settings')).toBeVisible()
  await page.getByTestId('title').click() // first gesture unlocks audio; the title theme starts
  await expect.poll(async () => (await stats(page))?.music.some((id) => id.startsWith('music-title')) ?? false, { timeout: 20_000 }).toBe(true)

  await page.locator('[data-testid^="setup-faction-"]', { hasText: /^Cygnar$/ }).click()
  await page.getByTestId('start-speed-fast').click()
  await page.getByTestId('start-button').click()
  await expect(page.getByTestId('battlefield')).toBeVisible()

  const counts: Record<string, number> = {}
  for (let n = 0; n < 500; n++) {
    const s = await waitForHuman(page, 3)
    if (s.phase === 'ended' || s.kind === 'gameOver' || s.round >= 3) break
    const did = await humanStep(page, s, counts)
    if (!did) await page.evaluate(() => { const g = window.__game!; const l = g.legal(); if (l[0]) g.dispatch(l[0]) })
    await page.waitForTimeout(60)
  }
  await page.waitForTimeout(1500)
  const st = (await stats(page))!
  const final = await snap(page)
  const played = Object.keys(st.played)
  console.log('audio:', JSON.stringify({ decoded: st.decoded.length, failed: st.failed, played: st.played, music: st.music, round: final.round }))

  expect(st.decoded.length).toBeGreaterThan(40)
  expect(st.failed).toEqual([])
  expect(st.music.some((id) => id.startsWith('music-battle'))).toBe(true)
  const has = (re: RegExp) => played.some((id) => re.test(id))
  expect(has(/^(we-step|move-troops)$/), 'move').toBe(true)
  expect(has(/^(gun-|melee-|pa-|spell-)/), 'attack').toBe(true)
  expect(has(/^dice-/), 'dice').toBe(true)
  expect(has(/^vo-/), 'narrator').toBe(true)
  expect(errors).toEqual([])
})
