import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// PWA-Prüfung (Auftrag 10) gegen den Produktions-Build: Service Worker gibt es nur dort.
// Aufruf: npx playwright test -c tests/app/pwa.config.ts
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../App');
const env = { VITE_SUPABASE_URL: 'https://cpnbkegojxagbzkomzap.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_Z9Hqy3mDvGOpcdXjmJeTOg_wv4V7RE9' };

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.pwa.ts',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  // channel „chromium“ = vollwertiger Headless-Modus; die „headless shell“ kann keine Benachrichtigungen anzeigen
  use: { baseURL: 'http://localhost:4301', locale: 'de-DE', timezoneId: 'Europe/Berlin', ...devices['Pixel 7'], browserName: 'chromium', channel: 'chromium' },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4301 --strictPort',
    cwd: APP,
    url: 'http://localhost:4301',
    reuseExistingServer: false,
    timeout: 180_000,
    env,
  },
});
