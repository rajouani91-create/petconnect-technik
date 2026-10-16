import { expect, test } from '@playwright/test';
import { APP_URL } from './helpers';

/** Startsprache nach Land: jedes Land, dessen Sprache PetConnect anbietet, startet in dieser Sprache (Maghreb Französisch), sonst Englisch.
 *  Eine selbst gewählte Sprache hat Vorrang und bleibt gespeichert. Land aus Zeitzone, ersatzweise aus der Browser-Region. */

const lang = (page: import('@playwright/test').Page) => page.evaluate(() => document.documentElement.lang);

const cases: ReadonlyArray<readonly [string, string, string, string]> = [
  ['Deutschland', 'de-DE', 'Europe/Berlin', 'de'],
  ['Österreich', 'de-AT', 'Europe/Vienna', 'de'],
  ['Schweiz (Browser Englisch)', 'en-US', 'Europe/Zurich', 'de'],
  ['Schweiz, Genf (Browser Französisch)', 'fr-CH', 'Europe/Zurich', 'fr'],
  ['Frankreich', 'fr-FR', 'Europe/Paris', 'fr'],
  ['Niederlande', 'nl-NL', 'Europe/Amsterdam', 'nl'],
  ['Spanien', 'es-ES', 'Europe/Madrid', 'es'],
  ['Norwegen', 'nb-NO', 'Europe/Oslo', 'no'],
  ['Schweden', 'sv-SE', 'Europe/Stockholm', 'sv'],
  ['Dänemark', 'da-DK', 'Europe/Copenhagen', 'da'],
  ['Italien (Sprache nicht angeboten)', 'it-IT', 'Europe/Rome', 'en'],
  ['Polen (Sprache nicht angeboten)', 'pl-PL', 'Europe/Warsaw', 'en'],
  ['Marokko (Browser Arabisch)', 'ar-MA', 'Africa/Casablanca', 'fr'],
  ['Algerien (Browser Arabisch)', 'ar-DZ', 'Africa/Algiers', 'fr'],
  ['Tunesien (Browser Arabisch)', 'ar-TN', 'Africa/Tunis', 'fr'],
  ['Japan', 'ja-JP', 'Asia/Tokyo', 'en'],
  ['Kenia', 'sw-KE', 'Africa/Nairobi', 'en'],
  ['USA (Browser Deutsch)', 'de-DE', 'America/New_York', 'en'],
  ['Argentinien', 'es-AR', 'America/Argentina/Buenos_Aires', 'es'],
  ['Mexiko (Browser Englisch)', 'en-US', 'America/Mexico_City', 'es'],
  ['Kolumbien', 'es-CO', 'America/Bogota', 'es'],
  ['Russland, Moskau', 'ru-RU', 'Europe/Moscow', 'ru'],
  ['Russland, Nowosibirsk (Browser Englisch)', 'en-US', 'Asia/Novosibirsk', 'ru'],
  ['Belarus', 'ru-BY', 'Europe/Minsk', 'ru'],
  ['Ägypten', 'ar-EG', 'Africa/Cairo', 'ar'],
  ['Saudi-Arabien', 'ar-SA', 'Asia/Riyadh', 'ar'],
  ['Senegal', 'fr-SN', 'Africa/Dakar', 'fr'],
  ['Kanada, Montreal (Browser Französisch)', 'fr-CA', 'America/Toronto', 'fr'],
  ['Kanada, Toronto (Browser Englisch)', 'en-CA', 'America/Toronto', 'en'],
  ['Suriname', 'nl-SR', 'America/Paramaribo', 'nl'],
  ['Türkei', 'tr-TR', 'Europe/Istanbul', 'tr'],
  ['Großbritannien', 'en-GB', 'Europe/London', 'en'],
  ['ohne Zeitzone (UTC), Browser es-AR', 'es-AR', 'UTC', 'es'],
];

for (const [name, locale, tz, want] of cases) {
  test.describe(`Sprache – ${name}`, () => {
    test.use({ locale, timezoneId: tz });
    test(`öffnet auf ${want}`, async ({ page }) => {
      await page.goto(APP_URL);
      expect(await lang(page)).toBe(want);
    });
  });
}

test.describe('Sprache – eigene Wahl', () => {
  test.use({ locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  test('selbst gewählte Sprache gewinnt und bleibt nach Neuladen', async ({ page }) => {
    await page.goto(APP_URL);
    await expect(page.locator('select[data-lang-select]:visible').first()).toHaveValue('fr');
    await page.locator('select[data-lang-select]:visible').first().selectOption('de');
    await page.reload();
    expect(await lang(page)).toBe('de');
  });
});
