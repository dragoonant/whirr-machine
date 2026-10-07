// M11 client pass: Khador vs the Normal bot at 1280x760. Opens the in-game army painter, folds both side rails away,
// then on the human's first free move drags the model to a spot and builds a two-waypoint path (click, click, Backspace,
// click, Confirm). Screenshots land in e2e-out/m11-*.png. Pointer positions come from the ?test=1 window.__screen hook.
import { expect, test, type Page } from '@playwright/test'
import { humanStep, snap, waitForHuman } from './policy'

const OUT = 'e2e-out'

type Pt = { x: number; y: number }
const screen = (page: Page, x: number, z: number, y = 0): Promise<Pt> =>
  page.evaluate(([px, pz, py]) => (window as unknown as { __screen: (x: number, z: number, y?: number) => Pt }).__screen(px!, pz!, py), [x, z, y])

/** The open free move, if the human has one: the model, where it stands and how far it may go. */
const freeMove = (page: Page) => page.evaluate(() => {
  const g = window.__game!
  const pd = g.pending()
  const c = pd?.kind === 'moveModel' ? pd.constraints : undefined
  if (!pd || !c || c.straightLine || g.controllers()[pd.player] !== 'human') return null
  const m = g.state()!.models[c.modelId]!
  return { id: pd.id, modelId: c.modelId, from: c.from, maxDist: c.maxDist, pos: m.pos, base: m.base }
})
const modelPos = (page: Page, id: string) => page.evaluate((i) => window.__game!.state()!.models[i]!.pos, id)
const waypoints = async (page: Page): Promise<number> => Number(await page.getByTestId('move-bar').getAttribute('data-waypoints'))

type P2 = { x: number; z: number }
/** Open ground for the demo: a legal first point and two different legal second points, by the engine's own move check. */
const planFor = (page: Page, mv: { modelId: string; pos: P2; maxDist: number }) => page.evaluate(({ id, pos, maxDist }) => {
  const g = window.__game!
  const ok = (path: P2[]) => !!g.moveCheck(id, path)?.ok
  const toCentre = Math.atan2(-pos.z, -pos.x)
  const angles = Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2 - Math.PI).sort((a, b) => Math.cos(b - toCentre) - Math.cos(a - toCentre))
  const L1 = Math.min(2.6, maxDist * 0.4), L2 = Math.min(2.2, maxDist * 0.3)
  if (L1 + L2 > maxDist || L2 < 1.4) return null
  const pt = (from: P2, a: number, l: number): P2 => ({ x: from.x + Math.cos(a) * l, z: from.z + Math.sin(a) * l })
  for (const a1 of angles) {
    const p1 = pt(pos, a1, L1)
    if (!ok([p1])) continue
    const seconds = angles.map((a2) => ({ a2, p2: pt(p1, a2, L2) })).filter((c) => Math.abs(Math.atan2(Math.sin(c.a2 - a1), Math.cos(c.a2 - a1))) < 1.9 && ok([p1, c.p2]))
    const first = seconds[0]
    const other = seconds.find((c) => first && Math.abs(Math.atan2(Math.sin(c.a2 - first.a2), Math.cos(c.a2 - first.a2))) > 0.7)
    if (first && other) return { p1, p2: first.p2, p3: other.p2 }
  }
  return null
}, { id: mv.modelId, pos: mv.pos, maxDist: mv.maxDist })

test('m11: painter, folded rails, drag to move and a two-waypoint path', async ({ page }) => {
  test.setTimeout(8 * 60_000)
  await page.setViewportSize({ width: 1280, height: 760 })
  page.setDefaultTimeout(20_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })

  await page.goto('./?test=1&seed=m11-a')
  await expect(page.getByTestId('title')).toBeVisible()
  await page.locator('[data-testid^="setup-faction-"]', { hasText: /^Khador$/ }).click()
  await page.getByTestId('start-opponent').selectOption('normal')
  await page.getByTestId('start-speed-fast').click()
  await page.getByTestId('start-button').click()
  await expect(page.getByTestId('battlefield')).toBeVisible()
  await waitForHuman(page, 3)
  await page.waitForTimeout(1200)

  // the rails are slim: together they take well under half the width, and the middle of the board is open
  const rails = await page.evaluate(() => {
    const w = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().width ?? 0
    const mid = document.elementFromPoint(640, 300)
    return { left: w('[data-testid=rail-left] .rail-body > *'), right: w('[data-testid=rail-right] .rail-body > *'), midOnHud: !!mid?.closest('.hud-card') }
  })
  expect(rails.left).toBeGreaterThan(100)
  expect(rails.left + rails.right).toBeLessThan(1280 * 0.42)
  expect(rails.midOnHud).toBe(false)
  await page.screenshot({ path: `${OUT}/m11-open.png` })

  // 1. the army painter: presets and pickers for both armies, applied live and remembered
  await page.getByTestId('paint-button').click()
  await expect(page.getByTestId('paint-popover')).toBeVisible()
  await expect(page.getByTestId('paint-row-you')).toBeVisible()
  await expect(page.getByTestId('paint-row-opponent')).toBeVisible()
  const youFaction = await page.getByTestId('paint-row-you').getAttribute('data-faction')
  const oppFaction = await page.getByTestId('paint-row-opponent').getAttribute('data-faction')
  expect(youFaction).toBe('kha')
  expect(oppFaction).not.toBe('kha')
  await page.getByTestId('paint-you-preset-verdigris').click()
  await expect(page.getByTestId('paint-you-preset-verdigris')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('paint-opponent-main').fill('#8a2be2')
  await page.getByTestId('paint-opponent-trim').fill('#e0b84a')
  const saved = await page.evaluate((f) => ({ you: localStorage.getItem('wm.paint.kha'), opp: localStorage.getItem(`wm.paint.${f}`) }), oppFaction)
  expect(JSON.parse(saved.you!)).toEqual({ primary: '#1f7a6e', secondary: '#c98a3c' })
  expect(JSON.parse(saved.opp!)).toEqual({ primary: '#8a2be2', secondary: '#e0b84a' })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/m11-paint.png` })
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('paint-popover')).toHaveCount(0)

  // 2. fold both rails away: the board shows across the whole width; the choice is remembered
  await page.getByTestId('rail-left-toggle').click()
  await page.getByTestId('rail-right-toggle').click()
  await expect(page.getByTestId('rail-left')).toHaveAttribute('data-collapsed', 'true')
  await expect(page.getByTestId('rail-right')).toHaveAttribute('data-collapsed', 'true')
  await expect(page.getByTestId('act-panel')).toBeHidden()
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('wm.panels')))!)).toEqual({ left: true, right: true })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/m11-collapsed.png` })

  // 3. play to the human's first free move; the folded activation panel is opened from the prompt
  const counts: Record<string, number> = {}
  let move: Awaited<ReturnType<typeof freeMove>> = null
  let opened = false
  let plan: Awaited<ReturnType<typeof planFor>> = null
  for (let n = 0; n < 400 && !move; n++) {
    const s = await waitForHuman(page, 4)
    if (s.phase === 'ended' || s.kind === 'gameOver' || s.round >= 4) break
    if (s.kind === 'moveModel') {
      const m = await freeMove(page)
      if (m && (plan = await planFor(page, m))) { move = m; break }
      if (m) { await page.getByTestId('board-stay').click(); continue } // cramped here: stay put and wait for a freer move
    }
    if (s.kind === 'chooseMovement') {
      if (!opened && (await page.getByTestId('prompt-open-panel').count())) {
        await page.getByTestId('prompt-open-panel').click()
        await expect(page.getByTestId('act-panel')).toBeVisible()
        opened = true
        await page.screenshot({ path: `${OUT}/m11-reopened.png` })
      }
      const adv = page.getByTestId('act-move-advance')
      if (await adv.isEnabled().catch(() => false)) { await adv.click(); await page.waitForTimeout(150); continue }
    }
    await humanStep(page, s, counts)
    await page.waitForTimeout(80)
  }
  expect(opened).toBe(true)
  expect(move, 'a free move for the human').not.toBeNull()
  const mv = move!
  await page.keyboard.press('[') // the left rail was opened to click Advance: fold it again
  await expect(page.getByTestId('rail-left')).toHaveAttribute('data-collapsed', 'true')
  await expect(page.getByTestId('move-bar')).toBeVisible()
  expect(await waypoints(page)).toBe(0)
  await page.waitForTimeout(600)

  const { p1, p2, p3 } = plan!
  const clickTable = async (p: P2) => { const q = await screen(page, p.x, p.z, 0); await page.mouse.click(q.x, q.y); await page.waitForTimeout(220) }

  // 4. drag: press on the model, drag, release; the ghost, path and distance show while held, the end stays staged
  const start = await screen(page, mv.pos.x, mv.pos.z, 0.5)
  const end = await screen(page, p1.x, p1.z, 0)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 6 })
  await page.mouse.move(end.x, end.y, { steps: 6 })
  await page.waitForTimeout(250)
  await expect(page.getByText('Release to place').first()).toBeVisible()
  await page.screenshot({ path: `${OUT}/m11-drag.png` })
  await page.mouse.up()
  await page.waitForTimeout(250)
  expect(await waypoints(page)).toBe(1)
  await expect(page.getByTestId('move-bar-text')).toContainText('left')
  await page.screenshot({ path: `${OUT}/m11-dragged.png` })
  // nothing moved yet: the drop only stages the end point
  expect(await modelPos(page, mv.modelId)).toEqual(mv.pos)

  // 5. two waypoints by clicking: Backspace drops the staged drag point, then click, click, Backspace, click
  await page.keyboard.press('Backspace')
  expect(await waypoints(page)).toBe(0)
  await clickTable(p1)
  expect(await waypoints(page)).toBe(1)
  await clickTable(p2)
  expect(await waypoints(page)).toBe(2)
  await expect(page.getByTestId('move-bar-text')).toContainText('2 waypoints')
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${OUT}/m11-waypoints.png` })
  await page.keyboard.press('Backspace')
  expect(await waypoints(page)).toBe(1)
  await clickTable(p3)
  expect(await waypoints(page)).toBe(2)
  await expect(page.getByTestId('move-bar-text')).not.toContainText('not a legal move')
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${OUT}/m11-two-waypoints.png` })

  // 6. Confirm: the engine moves the model along the two-leg path
  const pid = mv.id
  await page.getByTestId('board-confirm').click()
  await expect.poll(() => page.evaluate(() => window.__game!.pending()?.id)).not.toBe(pid)
  const after = await modelPos(page, mv.modelId)
  expect(Math.hypot(after.x - mv.pos.x, after.z - mv.pos.z)).toBeGreaterThan(0.5)
  await waitForHuman(page, 4)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/m11-final.png` })
  expect((await snap(page)).phase).not.toBe('none')
  expect(errors).toEqual([])
})
