import { defineConfig } from '@playwright/test';

/**
 * Playwright drives the *built* studio through `vite preview`, so the tests
 * exercise exactly what ships.
 *
 * Locally, point CHROME_PATH at any Chromium to skip the browser download:
 *   CHROME_PATH=/usr/bin/chromium npx playwright test
 * In CI, `npx playwright install --with-deps chromium` provides the binary.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: {
      executablePath: process.env.CHROME_PATH || undefined,
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--autoplay-policy=no-user-gesture-required'
      ]
    }
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    cwd: './apps/studio',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
