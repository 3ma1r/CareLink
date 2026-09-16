import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function setScenario(page: Page, label: string) {
  const controls = page.getByRole('button', { name: /Demo controls/ })
  if ((await controls.getAttribute('aria-expanded')) !== 'true') await controls.click()
  await page.getByLabel('Device & data scenario').selectOption({ label })
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
}

test('all routes render at phone, tablet, and desktop widths in both themes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  // Deterministically inspect the explicit map fallback as well as the other screens.
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort())
  await page.goto('/')
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 })
    for (const theme of ['light', 'dark']) {
      await page.getByRole('button', { name: `Use ${theme} theme` }).click()
      for (const route of ['/', '/history', '/alerts', '/location', '/profile']) {
        await page.goto(route)
        await expect(page.locator('h1')).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await noOverflow(page)
        if (width === 390 || width === 1440)
          await page.screenshot({
            path: `qa/${width}-${theme}-${route === '/' ? 'dashboard' : route.slice(1)}.png`,
            fullPage: true,
          })
      }
    }
  }
  expect(errors).toEqual([])
})

test('theme, patient editing, navigation, and all AI presentation states work', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Use dark theme' }).click()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('link', { name: 'Profile' })
    .click()
  await page.getByLabel('Patient full name').fill('Ahmed Ali')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Account and patient details saved' })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('link', { name: 'Dashboard' })
    .click()
  await expect(page.locator('.patient-name')).toContainText('Ahmed Ali')
  await expect(page.locator('.patient-name')).toContainText('Sample location')
  await setScenario(page, 'Typical valid readings')
  for (const state of ['learning', 'usual', 'unusual', 'insufficient', 'unavailable']) {
    await page.getByLabel('AI presentation preview').selectOption(state)
    await expect(page.locator('.ai-card')).toContainText('Demo only — no AI analysis performed')
  }
  await page.getByLabel('AI presentation preview').selectOption('awaiting')
  await expect(page.locator('.ai-card')).toContainText('Awaiting analysis — AI not connected')
})

test('history date, metric and range controls update real samples and PDF stays a preview', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('group', { name: 'Dashboard day' })
    .getByRole('button', { name: 'Yesterday' })
    .click()
  await expect(page.locator('.measurement-note')).toContainText('13 Sep')
  await page.locator('.vital-card.spo2').click()
  await expect(
    page.getByRole('group', { name: 'Health metric' }).getByRole('button', { name: 'SpO₂' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('History start date')).toHaveValue('2026-09-13')
  await page
    .getByRole('group', { name: 'History period' })
    .getByRole('button', { name: 'Today', exact: true })
    .click()
  const todayCount = await page.locator('.readings-card .subtle-count').textContent()
  await page.getByRole('button', { name: 'Last 7 days', exact: true }).click()
  const weekCount = await page.locator('.readings-card .subtle-count').textContent()
  expect(Number(weekCount)).toBeGreaterThan(Number(todayCount))
  await page.getByRole('button', { name: 'Last 30 days', exact: true }).click()
  expect(Number(await page.locator('.readings-card .subtle-count').textContent())).toBeGreaterThan(
    Number(weekCount),
  )
  await page.getByRole('button', { name: 'Custom', exact: true }).click()
  await page.getByLabel('History start date').fill('2026-09-10')
  await page.getByLabel('History end date').fill('2026-09-11')
  await expect(page.locator('.period-label')).toContainText('10 September 2026')
  await page.getByRole('button', { name: 'Download PDF Report' }).click()
  await expect(page.getByRole('dialog')).toContainText('10 September 2026')
  await expect(page.getByRole('dialog')).toContainText(
    'PDF export will be added in the reporting stage',
  )
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.getByLabel('History start date').fill('2026-09-12')
  await expect(page.getByRole('alert')).toContainText('Choose an end date')
  await expect(page.getByRole('button', { name: 'Download PDF Report' })).toBeDisabled()
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await page
    .getByRole('group', { name: 'History chart range' })
    .getByRole('button', { name: '1H', exact: true })
    .click()
  await expect(page.locator('.chart-footnote')).toContainText('1H chart window')
  const chart = page.locator('.health-chart')
  await chart.hover({ position: { x: 160, y: 90 } })
  await expect(page.locator('.chart-tooltip')).toContainText('Measured')
  await expect(page.locator('.chart-tooltip')).toContainText('Quality: Good')
})

test('alerts can be viewed and resolved without sending anything', async ({ page }) => {
  await page.goto('/alerts')
  await setScenario(page, 'New suspected fall')
  await page
    .locator('.alert-card')
    .filter({ hasText: 'Suspected fall · escalated' })
    .filter({ hasText: 'New' })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Not independently verified')
  await expect(dialog).toContainText('Fix was 2 minutes old at the event')
  await dialog.getByRole('button', { name: 'Mark as viewed' }).click()
  await expect(dialog.getByRole('button', { name: 'Mark as viewed' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Resolve', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Resolved', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^Resolved \(/ }).click()
  await expect(
    page.locator('.alert-card').filter({ hasText: 'Suspected fall · escalated' }),
  ).toHaveCount(2)
  await page.locator('.alert-card').filter({ hasText: 'Suspected fall · cancelled' }).click()
  await expect(dialog).toContainText('Cancelled on wearable · Not escalated')
})

test('missing, empty, offline, and GPS scenarios show honest states', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort())
  await page.goto('/')
  await setScenario(page, 'Missing / unstable vitals')
  await expect(page.locator('.vital-card.heartRate .vital-value')).toContainText('—')
  await page.locator('.vital-card.heartRate').click()
  await page
    .getByRole('group', { name: 'History chart range' })
    .getByRole('button', { name: '1H', exact: true })
    .click()
  await expect(page.locator('.history-chart-card')).toContainText('No valid readings in this range')
  await setScenario(page, 'Empty history')
  await expect(page.locator('.history-chart-card .stats-grid .stat strong')).toHaveText([
    '— bpm',
    '— bpm',
    '— bpm',
  ])
  await expect(page.locator('.history-chart-card')).toContainText('No readings for this period')
  await setScenario(page, 'Device offline')
  await page.getByRole('link', { name: 'Back to dashboard' }).click()
  await expect(page.locator('.device-card')).toContainText('Wearable online')
  await expect(page.locator('.device-card')).toContainText('Real pairing status')
  await expect(page.locator('.measurement-note')).toContainText('readings are stale')
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Location' })
    .click()
  await setScenario(page, 'GPS unavailable')
  await expect(page.locator('.map-card')).toContainText('GPS location unavailable')
  await expect(page.getByRole('link', { name: 'Open in Maps' })).toHaveCount(0)
  await expect(page.locator('.patient-map-marker')).toHaveCount(0)
  await setScenario(page, 'Stale GPS')
  await expect(page.locator('.page-heading')).toContainText('Stale GPS fix')
  await expect(page.getByRole('link', { name: 'Open in Maps' })).toHaveAttribute(
    'href',
    'https://www.google.com/maps/search/?api=1&query=23.588,58.4059',
  )
  await expect(page.locator('.map-fallback')).toContainText('Not accurate geography')
  await setScenario(page, 'New SOS alert')
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Dashboard' })
    .click()
  await expect(page.locator('.fall-card')).toContainText('New SOS alert')
})

test('production PWA caches the shell and clearly labels a browser-offline reload', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  const manifest = await page.request.get('/manifest.webmanifest')
  expect((await manifest.json()).display).toBe('standalone')
  await context.setOffline(true)
  await page.goto('/history')
  await expect(page.locator('h1')).toHaveText('Health trends')
  await expect(page.locator('.offline-banner')).toContainText(
    'displayed readings are cached samples',
  )
  await page.goto('/location')
  await expect(page.locator('.map-fallback')).toContainText('Map unavailable offline')
  await expect(page.getByRole('link', { name: 'Open in Maps' })).toBeVisible()
  await context.setOffline(false)
})

test('core screens have no serious accessibility violations in either theme', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort())
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  for (const theme of ['light', 'dark']) {
    await page.getByRole('button', { name: `Use ${theme} theme` }).click()
    for (const route of ['/', '/history', '/alerts', '/location', '/profile']) {
      await page.goto(route)
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
      expect(
        result.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => ({ target: n.target, issue: n.failureSummary })),
          })),
        `${theme} ${route}`,
      ).toEqual([])
    }
  }
})

test('map tiles, attribution, and marker controls work or show the honest fallback', async ({
  page,
}) => {
  await page.goto('/location')
  await expect
    .poll(
      async () =>
        (await page.locator('.map-fallback').count()) === 0 ||
        (await page.locator('.map-fallback').textContent())?.includes('Live map tiles unavailable'),
      { timeout: 15000 },
    )
    .toBe(true)
  const live = (await page.locator('.map-fallback').count()) === 0
  if (live) {
    await expect(page.locator('.patient-map-marker')).toHaveCount(1)
    await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap')
    await page.getByRole('button', { name: 'Center map on sample patient' }).click()
    await page.locator('.patient-map-marker').click()
    await expect(page.locator('.leaflet-popup-content')).toContainText('Fictional sample location')
  } else {
    await expect(page.locator('.map-fallback')).toContainText('Not accurate geography')
  }
  for (const theme of ['light', 'dark']) {
    await page.getByRole('button', { name: `Use ${theme} theme` }).click()
    await page.screenshot({
      path: `qa/map-${live ? 'live' : 'fallback'}-${theme}.png`,
      fullPage: true,
    })
  }
  await setScenario(page, 'GPS unavailable')
  await expect(page.locator('.patient-map-marker')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Open in Maps' })).toHaveCount(0)
})
