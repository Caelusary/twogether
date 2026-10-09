import { defineConfig, devices } from '@playwright/test'

// Phone-first journeys against the static site, served with vercel.json's headers.
// Supabase is always mocked (e2e/fixtures.js); tests never reach the live project.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4317',
    // Animations off so axe never measures colors mid-fade.
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    // The layout widens on desktop, so the journey and every screen run there too.
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run serve',
    url: 'http://localhost:4317/login.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
