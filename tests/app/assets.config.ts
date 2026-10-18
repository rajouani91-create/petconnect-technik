import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// App-Ordner relativ zu dieser Datei (Technik/tests/app → App), damit die Tests auf jedem Rechner laufen.
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../App');

export default defineConfig({
  testDir: '.',
  // Nur der einmalige Generator für Icons und Screenshots (Auftrag 10)
  testMatch: '**/*.gen.ts',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4300', locale: 'de-DE', timezoneId: 'Europe/Berlin', ...devices['Pixel 7'], browserName: 'chromium' },
  webServer: {
    command: 'npx vite --port 4300 --strictPort',
    cwd: APP,
    url: 'http://localhost:4300',
    reuseExistingServer: true,
    // Alle Anfragen an diese Adresse fängt fake-supabase.ts ab; es geht nichts ins Internet.
    env: { VITE_SUPABASE_URL: 'https://cpnbkegojxagbzkomzap.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_Z9Hqy3mDvGOpcdXjmJeTOg_wv4V7RE9' },
  },
});
