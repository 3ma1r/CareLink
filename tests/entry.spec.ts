import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function firstUse(page: import('@playwright/test').Page) {
  await page.addInitScript(() => localStorage.setItem('carelink-test-auth', 'signed-out'))
}

async function expectIllustrationGap(page: import('@playwright/test').Page, headingName: string) {
  const illustration = page.locator('.entry-illustration img')
  const heading = page.getByRole('heading', { name: headingName })
  await expect(illustration).toBeVisible()
  await expect(heading).toBeVisible()
  const [illustrationBox, headingBox] = await Promise.all([
    illustration.boundingBox(),
    heading.boundingBox(),
  ])
  expect(illustrationBox).not.toBeNull()
  expect(headingBox).not.toBeNull()
  const gap = headingBox!.y - (illustrationBox!.y + illustrationBox!.height)
  expect(gap, `${headingName} must remain below its illustration`).toBeGreaterThanOrEqual(24)
}

async function expectReachableInViewport(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator,
) {
  await locator.scrollIntoViewIfNeeded()
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual((await page.viewportSize())!.height + 1)
}

test('first launch shows splash, both approved steps, then the existing sign-in', async ({
  page,
}) => {
  await firstUse(page)
  await page.goto('/')
  await expect(page.locator('.entry-splash')).toBeVisible()
  await expect(page.getByText('Connecting your care...')).toBeVisible()
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await expect(page).toHaveURL(/\/introduction$/)
  await expect(page.getByRole('heading', { name: 'Stay connected to their health' })).toBeVisible()
  await expect(
    page.getByText(
      'View heart rate, oxygen level and temperature readings from the CareLink wearable.',
    ),
  ).toBeVisible()
  await expect(page.getByRole('img', { name: 'Page 1 of 2, current' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(
    page.getByRole('heading', { name: 'Understand changes. Stay informed.' }),
  ).toBeVisible()
  await expect(page.getByRole('img', { name: 'Page 2 of 2, current' })).toBeVisible()
  await expect(
    page.getByText(
      'CareLink learns the patient’s usual pattern and notifies you when important health changes need attention.',
    ),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Go to sign in' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.getByRole('heading', { name: 'Sign in to CareLink' })).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('carelink-onboarding-completed-v1')))
    .toBe('complete')
  await page.reload()
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.locator('.entry-onboarding')).toHaveCount(0)
})

test('Skip from either step completes onboarding and does not return after logout', async ({
  page,
}) => {
  await firstUse(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Stay connected to their health' })).toBeVisible()
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await page.getByLabel('Email').fill('caregiver@example.test')
  await page.getByLabel('Password', { exact: true }).fill('secure-pass')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Good morning/ })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Profile' })
    .click()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.locator('.entry-onboarding')).toHaveCount(0)
})

test('Skip from step two goes directly to sign-in', async ({ page }) => {
  await firstUse(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('carelink-onboarding-completed-v1')))
    .toBe('complete')
})

test('restored session bypasses onboarding; direct auth and recovery links are not trapped', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.entry-splash')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Good morning/ })).toBeVisible()
  await expect(page.locator('.entry-onboarding')).toHaveCount(0)
  await page.goto('/auth/callback')
  await expect(page).toHaveURL('/')
  await firstUse(page)
  await page.goto('/auth/callback')
  await expect(page).toHaveURL(/\/sign-in$/)
  await page.goto('/reset-password')
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
  await page.goto('/alerts')
  await expect(page).toHaveURL(/\/sign-in$/)
})

test('Profile replay preserves the session and returns to Profile from both steps', async ({
  page,
}) => {
  await page.goto('/profile')
  await page.getByRole('link', { name: 'View introduction' }).click()
  await expect(page).toHaveURL(/\/introduction\?replay=1$/)
  await expect(page.getByRole('heading', { name: 'Stay connected to their health' })).toBeVisible()
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByRole('heading', { name: 'Profile & settings' })).toBeVisible()
  await page.getByRole('link', { name: 'View introduction' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('button', { name: 'Back to profile' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/profile$/)
  await page.getByRole('link', { name: 'View introduction' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Back to profile' }).click()
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
})

test('first-use onboarding follows the system theme instead of a saved app override', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('carelink-test-auth', 'signed-out')
    localStorage.setItem('carelink-theme', 'dark')
  })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  const onboarding = page.locator('.entry-onboarding')
  await expect(page.getByRole('heading', { name: 'Stay connected to their health' })).toBeVisible()
  await expect(onboarding).toHaveAttribute('data-carelink-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(onboarding).toHaveAttribute('data-carelink-theme', 'dark')
})

test('Profile replay follows the caregiver saved CareLink theme', async ({ page }) => {
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Use light theme' }).click()
  await page.getByRole('link', { name: 'View introduction' }).click()
  await expect(page.locator('.entry-onboarding')).toHaveAttribute('data-carelink-theme', 'light')
  await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('button', { name: 'Use dark theme' }).click()
  await page.getByRole('link', { name: 'View introduction' }).click()
  await expect(page.locator('.entry-onboarding')).toHaveAttribute('data-carelink-theme', 'dark')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.locator('.entry-onboarding')).toHaveAttribute('data-carelink-theme', 'dark')
})

test('restricted onboarding storage does not crash, and reduced motion is honored', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('carelink-test-auth', 'signed-out')
    const get = Storage.prototype.getItem
    const set = Storage.prototype.setItem
    Storage.prototype.getItem = function (key) {
      if (key.startsWith('carelink-onboarding-')) throw new Error('SecurityError')
      return get.call(this, key)
    }
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('carelink-onboarding-')) throw new Error('SecurityError')
      return set.call(this, key, value)
    }
  })
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.locator('.entry-splash')).toBeVisible()
  expect(
    await page
      .locator('.entry-orbit')
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none')
  await expect(page.getByRole('heading', { name: 'Stay connected to their health' })).toBeVisible()
  await expect(page.locator('.entry-onboarding')).toHaveAttribute('data-carelink-theme', 'dark')
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
})

test('both onboarding screens keep illustrations above copy across responsive and zoomed layouts', async ({
  page,
}) => {
  await firstUse(page)
  await page.goto('/')
  const viewports = [
    { name: 'small phone', width: 320, height: 568 },
    { name: 'phone', width: 375, height: 667 },
    { name: 'large phone', width: 390, height: 844 },
    { name: 'tall phone', width: 430, height: 932 },
    { name: 'mobile landscape', width: 844, height: 390 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ]
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.reload()
      const firstHeading = page.getByRole('heading', { name: 'Stay connected to their health' })
      await expect(firstHeading, `${colorScheme} ${viewport.name}: first heading`).toBeVisible()
      await expect(page.locator('.entry-onboarding')).toHaveAttribute(
        'data-carelink-theme',
        colorScheme,
      )
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await expectIllustrationGap(page, 'Stay connected to their health')
      await expectReachableInViewport(page, firstHeading)
      await expectReachableInViewport(page, page.locator('.entry-onboarding-copy p'))
      await expectReachableInViewport(page, page.getByRole('img', { name: 'Page 1 of 2, current' }))
      const continueButton = page.getByRole('button', { name: 'Continue' })
      await expectReachableInViewport(page, continueButton)
      await continueButton.click()
      const secondHeading = page.getByRole('heading', {
        name: 'Understand changes. Stay informed.',
      })
      await expect(secondHeading, `${colorScheme} ${viewport.name}: second heading`).toBeVisible()
      await expectIllustrationGap(page, 'Understand changes. Stay informed.')
      await expectReachableInViewport(page, secondHeading)
      await expectReachableInViewport(page, page.locator('.entry-onboarding-copy p'))
      await expectReachableInViewport(page, page.getByRole('img', { name: 'Page 2 of 2, current' }))
      await expectReachableInViewport(page, page.getByRole('button', { name: 'Go to sign in' }))
    }
  }

  await page.setViewportSize({ width: 1440, height: 1200 })
  await page.reload()
  await page.evaluate(() => {
    document.body.style.zoom = '2'
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectIllustrationGap(page, 'Stay connected to their health')
  await expectReachableInViewport(
    page,
    page.getByRole('heading', { name: 'Stay connected to their health' }),
  )
  await expectReachableInViewport(page, page.getByRole('button', { name: 'Continue' }))
  await page.getByRole('button', { name: 'Continue' }).click()
  await expectIllustrationGap(page, 'Understand changes. Stay informed.')
  await expectReachableInViewport(
    page,
    page.getByRole('heading', { name: 'Understand changes. Stay informed.' }),
  )
  await expectReachableInViewport(page, page.getByRole('button', { name: 'Go to sign in' }))
})

test('onboarding screens have no serious accessibility violations', async ({ page }) => {
  await firstUse(page)
  await page.goto('/')
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Stay connected to their health' }),
    ).toBeVisible()
    await expect(page.locator('.entry-onboarding')).toHaveAttribute(
      'data-carelink-theme',
      colorScheme,
    )
    let audit = await new AxeBuilder({ page }).include('.entry-onboarding').analyze()
    expect(
      audit.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([])
    await page.getByRole('button', { name: 'Continue' }).focus()
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('heading', { name: 'Understand changes. Stay informed.' }),
    ).toBeVisible()
    audit = await new AxeBuilder({ page }).include('.entry-onboarding').analyze()
    expect(
      audit.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([])
  }
})
