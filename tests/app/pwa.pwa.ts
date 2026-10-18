import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeSupabase } from './fake-supabase';

/** PWA im Produktions-Build: Manifest, Icons, Service Worker, offline, Push- und Klick-Handler. */

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../App/dist');
const PW = 'Testpasswort-123';

async function swReady(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  // Erst nach clients.claim steuert der Service Worker die Seite
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

async function loggedIn(ctx: BrowserContext) {
  const fake = new FakeSupabase('2026-10-16');
  const u = fake.seedUser('ahmed@test.invalid', PW, 'Ahmed');
  fake.seedPet(u, { name: 'Luna', species: 'dog' });
  await fake.installContext(ctx);
  const page = await ctx.newPage();
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill('ahmed@test.invalid');
  await page.getByLabel('Passwort').fill(PW);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.locator('#main')).toBeVisible();
  await page.waitForLoadState('networkidle');
  return page;
}

test('Manifest gültig: id, start_url, standalone, PNG-Icons 192/512 (any + maskable), Shortcuts, Screenshots', async ({ page }) => {
  await page.goto('/login');
  const head = await page.evaluate(() => ({
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href'),
    apple: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'),
    theme: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute('content'),
  }));
  expect(head).toEqual({ manifest: '/manifest.webmanifest', apple: '/icons/apple-touch-icon.png', theme: '#1f5c4d', capable: 'yes' });
  const res = await page.request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const m = (await res.json()) as {
    id: string; start_url: string; scope: string; display: string; orientation: string; categories: string[]; description: string; name: string; short_name: string;
    icons: { src: string; sizes: string; type: string; purpose: string }[]; shortcuts: { name: string; url: string }[]; screenshots: { src: string; sizes: string; form_factor: string }[];
  };
  expect(m).toMatchObject({ id: '/', start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait', categories: ['health', 'lifestyle'], name: 'PetConnect', short_name: 'PetConnect' });
  expect(m.description).toMatch(/Ihres Tieres/);
  for (const [size, purpose] of [[192, 'any'], [512, 'any'], [192, 'maskable'], [512, 'maskable']] as const) {
    expect(m.icons.some((i) => i.sizes === `${size}x${size}` && i.type === 'image/png' && i.purpose === purpose), `${size} ${purpose}`).toBe(true);
  }
  expect(m.shortcuts.map((s) => s.url)).toEqual(['/', '/erinnerungen', '/notfall']);
  expect(m.screenshots.length).toBeGreaterThanOrEqual(2);
  expect(m.screenshots.length).toBeLessThanOrEqual(4);
  // Alle Bilder vorhanden und in der angegebenen Größe
  const images = [...m.icons.filter((i) => i.type === 'image/png'), ...m.screenshots, { src: '/icons/apple-touch-icon.png', sizes: '180x180' }, { src: '/icons/badge-96.png', sizes: '96x96' }];
  for (const img of images) {
    const size = await page.evaluate(async (src) => {
      const r = await fetch(src);
      if (!r.ok || r.headers.get('content-type') !== 'image/png') return `HTTP ${r.status} ${r.headers.get('content-type')}`;
      const b = await createImageBitmap(await r.blob());
      return `${b.width}x${b.height}`;
    }, img.src);
    expect(size, img.src).toBe(img.sizes);
  }
  expect(m.screenshots.every((s) => s.form_factor === 'narrow')).toBe(true);
});

test('Netlify-Dateien im Build: _headers (sw.js ohne Cache), assetlinks.json als JSON-Vorlage', async ({ page }) => {
  const headers = readFileSync(path.join(DIST, '_headers'), 'utf8');
  expect(headers).toMatch(/\/sw\.js\s+Cache-Control: no-cache/);
  expect(headers).toMatch(/\/\.well-known\/assetlinks\.json\s+Content-Type: application\/json/);
  expect(existsSync(path.join(DIST, '.well-known', 'assetlinks.json'))).toBe(true);
  const res = await page.request.get('/.well-known/assetlinks.json');
  expect(res.ok()).toBe(true);
  const links = (await res.json()) as { target: { package_name: string; sha256_cert_fingerprints: string[] } }[];
  expect(links[0]!.target.package_name).toBe('com.petconnect24.app');
  expect(links[0]!.target.sha256_cert_fingerprints).toEqual(['BITTE_SHA256_AUS_PLAY_CONSOLE_EINTRAGEN']);
});

test('Service Worker registriert, App-Shell offline erreichbar, Supabase wird nicht gespeichert', async ({ context }) => {
  const page = await loggedIn(context);
  await swReady(page);
  await page.reload();
  await page.waitForLoadState('networkidle');
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const urls: string[] = [];
    for (const k of keys) for (const r of await (await caches.open(k)).keys()) urls.push(r.url);
    return urls;
  });
  expect(cached.some((u) => /\/index\.html$/.test(u))).toBe(true);
  expect(cached.some((u) => /\/assets\/.+\.js$/.test(u))).toBe(true);
  expect(cached.some((u) => u.includes('supabase.co'))).toBe(false);
  await context.setOffline(true);
  await page.goto('/');
  await expect(page.locator('.brand').first()).toContainText('PetConnect');
  await page.goto('/login');
  await expect(page.locator('body')).toContainText('PetConnect');
  await context.setOffline(false);
});

test('Push-Nachricht: Titel, Text, Tag, Icon, Ziel; kaputte Nachricht → neutrale Meldung; Klick öffnet /erinnerungen', async ({ context }) => {
  await context.grantPermissions(['notifications'], { origin: 'http://localhost:4301' });
  const page = await loggedIn(context);
  await swReady(page);
  const origin = new URL(page.url()).origin;
  const cdp = await context.newCDPSession(page);
  const regId = new Promise<string>((resolve) => {
    cdp.on('ServiceWorker.workerRegistrationUpdated', (e: { registrations: { registrationId: string; scopeURL: string; isDeleted: boolean }[] }) => {
      const r = e.registrations.find((x) => x.scopeURL === `${origin}/` && !x.isDeleted);
      if (r) resolve(r.registrationId);
    });
  });
  await cdp.send('ServiceWorker.enable');
  const registrationId = await regId;
  const notes = () =>
    page.evaluate(async () =>
      (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag, icon: n.icon, badge: (n as Notification & { badge?: string }).badge, data: n.data as unknown })),
    );

  const msg = { title: 'Luna: Meloxicam', body: 'Medikament: 08:00 Uhr · 0,5 ml · mit Futter. Gegeben? In PetConnect abhaken.', url: '/erinnerungen', tag: 'medication-test-1' };
  await cdp.send('ServiceWorker.deliverPushMessage', { origin, registrationId, data: JSON.stringify(msg) });
  await expect.poll(notes).toEqual([{ title: msg.title, body: msg.body, tag: msg.tag, icon: `${origin}/icons/icon-192.png`, badge: `${origin}/icons/badge-96.png`, data: { url: '/erinnerungen' } }]);

  // kaputte Nachricht und fremde Adresse
  await cdp.send('ServiceWorker.deliverPushMessage', { origin, registrationId, data: 'kein json' });
  await expect.poll(async () => (await notes()).map((n) => n.title)).toContain('PetConnect – Neue Benachrichtigung');
  await cdp.send('ServiceWorker.deliverPushMessage', { origin, registrationId, data: JSON.stringify({ title: 'X', url: 'https://boese.example/phish', tag: 'fremd' }) });
  await expect.poll(async () => (await notes()).find((n) => n.tag === 'fremd')?.data).toEqual({ url: '/' }); // fremde Adresse → Startseite

  // Klick auf die Medikamenten-Nachricht: vorhandenes Fenster geht zu /erinnerungen
  expect(new URL(page.url()).pathname).toBe('/');
  const [sw] = context.serviceWorkers();
  expect(sw).toBeTruthy();
  await sw!.evaluate(async () => {
    // Im Service Worker: Klick auf die Benachrichtigung nachstellen (NotificationEvent gibt es nur dort)
    const g = self as unknown as { registration: ServiceWorkerRegistration; dispatchEvent: (e: Event) => boolean; NotificationEvent: new (type: string, init: { notification: Notification }) => Event };
    const [n] = await g.registration.getNotifications({ tag: 'medication-test-1' });
    g.dispatchEvent(new g.NotificationEvent('notificationclick', { notification: n! }));
  });
  await expect(page).toHaveURL(/\/erinnerungen$/);
  await expect(page.getByRole('heading', { name: 'Erinnerungen', level: 1 })).toBeVisible();
});
