import { expect, test } from '@playwright/test'

async function setAuthState(page: import('@playwright/test').Page, state: 'signed-out' | 'no-patient') {
  await page.goto('/')
  await page.evaluate((value) => localStorage.setItem('carelink-test-auth', value), state)
}

test('protected routes redirect to sign in and validation is accessible', async ({ page }) => {
  await setAuthState(page, 'signed-out')
  await page.goto('/alerts')
  await expect(page).toHaveURL(/\/sign-in$/)
  await page.getByRole('button',{name:'Sign in',exact:true}).click()
  await expect(page.getByText('Enter a valid email address.')).toBeVisible()
  await expect(page.getByText('Enter your password.')).toBeVisible()
  await page.getByLabel('Email').fill('caregiver@example.test')
  await page.getByLabel('Password',{exact:true}).fill('wrong-password')
  await page.getByRole('button',{name:'Sign in',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('incorrect')
})

test('registration validates and shows the email confirmation state', async ({ page }) => {
  await setAuthState(page, 'signed-out')
  await page.goto('/register')
  await page.getByRole('button',{name:'Create account'}).click()
  await expect(page.getByText('Enter your full name.')).toBeVisible()
  await page.getByLabel('Full name').fill('Omair Al Falahi')
  await page.getByLabel('Email').fill('omair@example.test')
  await page.getByLabel('Password',{exact:true}).fill('secure-pass')
  await page.getByLabel('Confirm password',{exact:true}).fill('secure-pass')
  await page.getByRole('button',{name:'Create account'}).click()
  await expect(page.getByRole('heading',{name:'Check your email'})).toBeVisible()
  await expect(page.getByRole('status')).toContainText('valid session')
})

test('first-time caregiver completes patient setup, edits both records, and logs out', async ({ page }) => {
  await setAuthState(page, 'no-patient')
  await page.goto('/alerts')
  await expect(page).toHaveURL(/\/patient-setup$/)
  await page.getByLabel('Patient full name').fill('Fatima Ali')
  await page.getByLabel('Date of birth').fill('1950-09-15')
  await expect(page.getByText(/Age: \d+ years/)).toBeVisible()
  await page.getByLabel('Emergency contact phone').fill('not a phone')
  await page.getByRole('button',{name:'Save patient and continue'}).click()
  await expect(page.getByText('Enter a valid phone number.')).toBeVisible()
  await page.getByLabel('Emergency contact phone').fill('+968 9000 0000')
  await page.getByRole('button',{name:'Save patient and continue'}).click()
  await expect(page).toHaveURL('/')
  await expect(page.locator('.patient-name')).toContainText('Fatima Ali')
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Profile'}).click()
  await page.locator('#caregiver-name').fill('Omair Updated')
  await page.getByLabel('Patient full name').fill('Fatima Updated')
  await page.getByRole('button',{name:'Save changes'}).click()
  await expect(page.getByRole('status')).toContainText('saved')
  await page.getByRole('button',{name:'Log out'}).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await page.goto('/history')
  await expect(page).toHaveURL(/\/sign-in$/)
})

test('password reset request and update screens complete in the frontend test adapter', async ({ page }) => {
  await setAuthState(page, 'signed-out')
  await page.goto('/forgot-password')
  await page.getByLabel('Email').fill('caregiver@example.test')
  await page.getByRole('button',{name:'Send reset link'}).click()
  await expect(page.getByRole('status')).toContainText('reset link')
  await page.evaluate(() => localStorage.removeItem('carelink-test-auth'))
  await page.goto('/reset-password')
  await page.getByLabel('New password',{exact:true}).fill('new-secure-pass')
  await page.getByLabel('Confirm new password',{exact:true}).fill('new-secure-pass')
  await page.getByRole('button',{name:'Update password'}).click()
  await expect(page.getByRole('status')).toContainText('Password updated')
})

test('public auth screens are responsive and accessible in both themes', async ({ page }) => {
  await setAuthState(page, 'signed-out')
  for (const width of [320, 1440]) {
    await page.setViewportSize({width,height:width===320?844:900})
    for (const theme of ['light','dark']) {
      for (const route of ['/welcome','/sign-in','/register','/forgot-password']) {
        await page.goto(route)
        await page.getByRole('button',{name:`Use ${theme} theme`}).click()
        await expect(page.locator('h1')).toBeVisible()
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
      }
      await page.screenshot({path:`qa/auth-${width}-${theme}.png`,fullPage:true})
    }
  }
})
