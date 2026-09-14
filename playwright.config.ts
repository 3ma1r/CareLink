import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  outputDir: './qa/test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  reporter: [['list'], ['html', { outputFolder: 'qa/playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'chrome',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 30000,
  },
})
