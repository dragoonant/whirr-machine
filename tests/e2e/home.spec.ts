import { expect, test } from '@playwright/test'

test('home renders title', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByTestId('title')).toContainText('Whirr Machine')
  await page.screenshot({ path: 'e2e-out/home.png' })
})
