// M8 boards: for each of the five battlefields, Khador vs the Normal bot through UI clicks: deploy, then one full
// round. Checks every terrain GLB answers 200, no page errors, no stuck prompt; measures ms/frame while the camera
// pans; writes e2e-out/board-<id>.png (overview after deployment) and board-<id>-close.png (low angle) for two boards.
import { expect, test, type Page } from '@playwright/test'
import { humanStep, snap, waitForHuman } from './policy'

const OUT = 'e2e-out'
const BOARDS = ['bog', 'ruins', 'village', 'wasteland', 'outpost'] as const
const CLOSE = new Set(['outpost', 'wasteland'])

type V3 = [number, number, number]
declare global { interface Window { __camera?: (p: V3, t: V3) => void } }

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

/** Hide the HUD panels for a clean board shot, then restore them. */
async function cleanShot(page: Page, path: string): Promise<void> {
  await page.addStyleTag({ content: 'body.hud-hide-for-shot * { visibility: hidden !important; } body.hud-hide-for-shot [data-testid=battlefield], body.hud-hide-for-shot [data-testid=battlefield] canvas { visibility: visible !important; }' })
  await page.evaluate(() => document.body.classList.add('hud-hide-for-shot'))
  await page.waitForTimeout(500)
  await page.screenshot({ path })
  await page.evaluate(() => document.body.classList.remove('hud-hide-for-shot'))
}

test.describe.configure({ mode: 'serial' })

for (const id of BOARDS) {
  test(`board ${id}: Khador vs the Normal bot, deploy and one round`, async ({ page }) => {
    test.setTimeout(6 * 60_000)
    await page.setViewportSize({ width: 1280, height: 760 })
    const errors: string[] = []
    const glb: Record<string, number> = {}
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
    page.on('response', (r) => { const u = r.url(); if (u.includes('/assets/terrain/') && u.endsWith('.glb')) glb[u.split('/').pop()!] = r.status() })

    await page.goto(`./?test=1&seed=board-${id}&board=${id}`)
    await expect(page.getByTestId('title')).toBeVisible()
    await page.locator('[data-testid^="setup-faction-"]', { hasText: /^Khador$/ }).click()
    await page.getByTestId('start-opponent').selectOption('normal')
    await page.getByTestId('start-speed-fast').click()
    await page.getByTestId('start-button').click()
    await expect(page.getByTestId('battlefield')).toBeVisible()
    await expect(page.getByTestId('hud-board')).not.toBeEmpty()

    const counts: Record<string, number> = {}
    const stuck: string[] = []
    let overview = false
    let perf: { mean: number; p95: number; frames: number } | null = null
    let last = ''
    let same = 0
    for (let n = 0; n < 400; n++) {
      const s = await waitForHuman(page, 2)
      if (s.phase === 'ended' || s.kind === 'gameOver' || s.round >= 2) break
      await expect(page.locator('.hud-dock.prompt')).toBeVisible()
      await expect(page.getByTestId('prompt-title')).not.toBeEmpty()
      if (!overview && s.round >= 1 && !['deploy', 'advanceDeploy', 'placeTroopers'].includes(s.kind ?? '')) {
        overview = true
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(800)
        await cleanShot(page, `${OUT}/board-${id}.png`)
        // frame time with the human's prompt open and nothing animating (the camera pans with W)
        perf = await frameTimes(page)
        await page.waitForTimeout(700)
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
    const end = await snap(page)
    if (CLOSE.has(id)) {
      // low angle from player A's side across the terrain toward the figures
      const pose = await page.evaluate(() => {
        const s = window.__game!.state()!
        const ms = Object.values(s.models).filter((m) => m.pos)
        const mine = ms.filter((m) => m.owner === 'A'), theirs = ms.filter((m) => m.owner === 'B')
        const avg = (l: typeof ms) => l.reduce((a, m) => ({ x: a.x + m.pos!.x / l.length, z: a.z + m.pos!.z / l.length }), { x: 0, z: 0 })
        return { a: avg(mine), b: avg(theirs) }
      })
      const dx = pose.b.x - pose.a.x, dz = pose.b.z - pose.a.z
      const len = Math.hypot(dx, dz) || 1
      const eye: V3 = [pose.a.x - (dx / len) * 6, 3.2, pose.a.z - (dz / len) * 6]
      const tgt: V3 = [pose.a.x + dx * 0.55, 0.8, pose.a.z + dz * 0.55]
      await page.evaluate(([p, t]) => window.__camera?.(p, t), [eye, tgt] as [V3, V3])
      await page.waitForTimeout(600)
      await cleanShot(page, `${OUT}/board-${id}-close.png`)
    }
    console.log('BOARD', id, JSON.stringify({ counts, stuck, end, glb, perf, overview }))
    expect(overview).toBe(true)
    expect(end.phase === 'ended' || end.round >= 2).toBe(true)
    expect(Object.values(glb).every((st) => st === 200 || st === 304)).toBe(true)
    expect(stuck.length).toBeLessThanOrEqual(2)
    expect(errors).toEqual([])
  })
}
