// M5+M7 art pass: Khador vs the Normal bot through UI clicks for two rounds, with the figure GLBs on the table.
// Checks every GLB loads, no page errors, no stuck prompt; measures ms/frame while the camera pans; screenshots
// (art-*.png, gallery.png) land in e2e-out/. window.__game is read to know the open decision; answers are clicks,
// except the fast-forward to the end screen after round 2 (engine's first legal answer, like the stuck fallback).
import { expect, test, type Page } from '@playwright/test'
import { clickFirst, humanStep, snap, visible, waitForHuman } from './policy'

const OUT = 'e2e-out'

/** Mean and p95 ms per frame while the camera pans with a held key (the demand frameloop renders every frame then). */
async function frameTimes(page: Page, key = 'w', ms = 1500): Promise<{ mean: number; p95: number; frames: number }> {
  await page.mouse.move(640, 360)
  await page.keyboard.down(key)
  const r = await page.evaluate((dur) => new Promise<number[]>((done) => {
    const ts: number[] = []
    const t0 = performance.now()
    const tick = (t: number) => { ts.push(t); if (t - t0 < dur) requestAnimationFrame(tick); else done(ts) }
    requestAnimationFrame(tick)
  }), ms)
  await page.keyboard.up(key)
  const d = r.slice(1).map((t, i) => t - r[i]!).sort((a, b) => a - b)
  const mean = d.reduce((a, b) => a + b, 0) / Math.max(1, d.length)
  return { mean: +mean.toFixed(1), p95: +(d[Math.floor(d.length * 0.95)] ?? 0).toFixed(1), frames: d.length }
}

test('art: Khador vs the Normal bot for two rounds, GLB figures, screenshots', async ({ page }) => {
  test.setTimeout(10 * 60_000)
  await page.setViewportSize({ width: 1280, height: 760 })
  const errors: string[] = []
  const glb: Record<string, number> = {}
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
  page.on('response', (r) => { const u = r.url(); if (u.endsWith('.glb')) glb[u.split('/').pop()!] = r.status() })

  await page.goto(`./?test=1&seed=${process.env.ART_SEED ?? 'art-c'}`)
  await expect(page.getByTestId('title')).toBeVisible()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/art-start.png` })

  await page.locator('[data-testid^="setup-faction-"]', { hasText: /^Khador$/ }).click()
  await page.getByTestId('start-opponent').selectOption('normal')
  await page.getByTestId('start-speed-fast').click()
  await page.getByTestId('start-button').click()
  await expect(page.getByTestId('battlefield')).toBeVisible()

  const counts: Record<string, number> = {}
  const shots = new Set<string>()
  const shoot = async (name: string) => { if (!shots.has(name)) { shots.add(name); await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}/${name}.png` }) } }
  const stuck: string[] = []
  let perf: { mean: number; p95: number; frames: number } | null = null
  let closeup: string | null = null
  let last = ''
  let same = 0
  for (let n = 0; n < 500; n++) {
    const s = await waitForHuman(page, 3)
    if (s.phase === 'ended' || s.kind === 'gameOver' || s.round >= 3) break
    await expect(page.locator('.hud-dock.prompt')).toBeVisible()
    await expect(page.getByTestId('prompt-title')).not.toBeEmpty()
    if (s.kind === 'deploy') await shoot('art-deploy')
    if (s.kind === 'boostAttack' || s.kind === 'boostDamage' || (s.kind === 'chooseAttack' && (await visible(page, '[data-testid^="act-attack-"]')))) await shoot('art-attack')
    // round 2: activate our war-engine by clicking its figure, then frame it close up
    if (s.round === 2 && s.kind === 'chooseActivation' && !closeup && !shots.has('art-midgame')) {
      const we = await page.evaluate(() => {
        const g = window.__game!
        const ids = new Set((g.pending()?.options ?? []).map((o) => (o.action as { activate?: string }).activate))
        return Object.values(g.state()!.models).find((m) => /razor/.test(m.profileId) && ids.has(m.id))?.id ?? null
      })
      if (we) {
        closeup = we
        const before = await page.evaluate(() => window.__game!.pending()?.id)
        await page.getByTestId(`model-${we}`).dispatchEvent('click')
        await expect.poll(() => page.evaluate(() => window.__game!.pending()?.id)).not.toBe(before)
        continue
      }
    }
    // the warcaster hangs back (aim / stay) so the game runs two full rounds
    if (s.kind === 'chooseMovement') {
      const caster = await page.evaluate(() => { const g = window.__game!; const id = g.pending()?.context.modelId; return !!id && /vilkul/.test(g.state()!.models[id]?.profileId ?? '') })
      if (caster && (await clickFirst(page, ['[data-testid=act-move-aim]', '[data-testid=act-move-forfeit]']))) { counts.casterStays = (counts.casterStays ?? 0) + 1; continue }
    }
    if (closeup && !shots.has('art-midgame')) {
      // close-up on the war-engines: our war-engine is selected; camera "follow" preset (V x4), then wheel in
      const we = closeup
      {
        for (let i = 0; i < 4; i++) await page.keyboard.press('v')
        await page.waitForTimeout(700)
        await page.mouse.move(640, 380)
        for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(60) }
        await page.waitForTimeout(700)
        await shoot('art-midgame')
        perf = await frameTimes(page)
        // back to the player's own edge view (cycle: top, edgeA)
        await page.keyboard.press('v'); await page.keyboard.press('v')
        await page.waitForTimeout(700)
      }
    }
    const key = `${s.kind}:${JSON.stringify(s.options)}:${s.round}`
    same = key === last ? same + 1 : 0
    last = key
    const did = same > 6 ? '' : await humanStep(page, s, counts)
    if (!did) {
      stuck.push(`${s.kind} r${s.round}`)
      await page.evaluate(() => { const g = window.__game!; const l = g.legal(); if (l[0]) g.dispatch(l[0]) })
    }
    await page.waitForTimeout(60)
  }
  const r2 = await snap(page)
  if (!shots.has('art-midgame')) await shoot('art-midgame')
  if (!shots.has('art-attack')) await shoot('art-attack')

  // fast-forward to the end screen: the human side answers with the engine's first legal action, instant speed
  await page.evaluate(() => window.__game!.speed(0))
  for (let i = 0; i < 4000; i++) {
    const s = await snap(page)
    if (s.phase === 'ended' || s.kind === 'gameOver') break
    if (s.human) await page.evaluate(() => { const g = window.__game!; const l = g.legal(); if (l[0]) g.dispatch(l[0]) })
    else await page.waitForTimeout(100)
  }
  await expect(page.getByTestId('gameover')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/art-gameover.png` })

  console.log('ART', JSON.stringify({ counts, stuck, round2: r2, glb, perf }))
  expect(r2.phase === 'ended' || r2.round >= 3).toBe(true)
  expect(Object.values(glb).every((st) => st === 200 || st === 304)).toBe(true)
  expect(Object.keys(glb).length).toBeGreaterThanOrEqual(4)
  expect(stuck.length).toBeLessThanOrEqual(2)
  expect(errors).toEqual([])
})

test('gallery: every figure GLB on a turntable', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewportSize({ width: 1280, height: 760 })
  await page.goto('./?gallery')
  await expect(page.getByTestId('gallery')).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/gallery.png` })
  expect(errors).toEqual([])
})
