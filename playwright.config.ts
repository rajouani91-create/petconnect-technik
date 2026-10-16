import { defineConfig, devices } from '@playwright/test';

/** Browser-Tests (E2E) gegen den Prototyp index.html. Vitest-Unit-Tests laufen getrennt über `npm test`. */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e-results.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    viewport: { width: 1280, height: 900 },
  },
  projects: [{ name: 'chromium' }],
});
