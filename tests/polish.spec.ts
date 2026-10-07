import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('Profile and combined insights stay readable in both themes, with zoom and reduced motion', async ({
  page,
}) => {
  test.setTimeout(180000)
  const sizes = [
    [320, 568],
    [375, 667],
    [390, 844],
    [430, 932],
    [844, 390],
    [768, 1024],
    [1440, 900],
  ]
  for (const theme of ['light', 'dark']) {
    await page.addInitScript((value) => localStorage.setItem('carelink-theme', value), theme)
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height })
      for (const route of ['/profile', '/']) {
        await page.goto(route)
        await expect(page.locator('h1')).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        const body = await page.locator('body').innerText()
        expect(body).not.toMatch(
          /prototype|Stage 5B|v0\.5\.0|Supabase account|No external AI service|No notifications sent/i,
        )
        if (route === '/profile') {
          await expect(
            page.getByRole('heading', { name: 'Personal & patient information' }),
          ).toBeVisible()
          await expect(page.getByLabel('Email Read only')).toHaveAttribute('readonly', '')
          const info = await page.locator('.patient-settings').boundingBox()
          const settings = await page.locator('.profile-settings').boundingBox()
          if (width >= 1200) expect(Math.abs(info!.y - settings!.y)).toBeLessThan(2)
          await page.getByRole('button', { name: 'Save changes' }).scrollIntoViewIfNeeded()
        } else {
          await expect(page.getByRole('button', { name: 'View health summary' })).toHaveAttribute(
            'aria-expanded',
            'false',
          )
          await page.getByRole('button', { name: 'View health summary' }).click()
          await expect(
            page.getByRole('region', { name: 'Personalized Health Summary' }),
          ).toBeVisible()
        }
        await page.screenshot({
          path: `qa/polish-${theme}-${width}-${height}-${route === '/' ? 'insights' : 'profile'}.png`,
          fullPage: true,
        })
      }
    }
    for (const route of ['/profile', '/']) {
      await page.goto(route)
      if (route === '/') await page.getByRole('button', { name: 'View health summary' }).click()
      const audit = await new AxeBuilder({ page }).analyze()
      expect(
        audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
      ).toEqual([])
      // Browser 200% zoom halves the layout viewport and reevaluates media queries.
      // CSS body zoom does not, and incorrectly leaves the desktop navigation active.
      await page.setViewportSize({ width: 720, height: 450 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.setViewportSize({ width: 1440, height: 900 })
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'View health summary' }).click()
  expect(
    await page
      .locator('#personalized-health-summary')
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe('none')
})

test('report generation errors restore the control without a configuration modal', async ({
  page,
}) => {
  await page.route('**/assets/report-font.ttf', (route) => route.abort())
  await page.goto('/history')
  await page.getByRole('button', { name: 'Download PDF Report' }).click()
  await expect(page.getByRole('alert')).toContainText('Your report could not be prepared')
  await expect(page.getByRole('button', { name: 'Download PDF Report' })).toBeEnabled()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
