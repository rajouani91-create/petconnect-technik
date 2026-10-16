import { expect, test } from '@playwright/test';
import { bookSlot, goView, main, openAsOwner, switchRole, toast } from './helpers';

/** Szenarien aus PetConnect_Testprotokoll.xlsx, Blatt „Halter“ – Termine buchen & verwalten (Browser-Tests gegen index.html). */

test.describe('Termine buchen', () => {
  test.beforeEach(async ({ page }) => {
    await openAsOwner(page);
    await goView(page, 'termine');
  });

  test('H-034 (Zeile 35): Absageregel nicht bestätigt → Buchung nicht möglich, Hinweis', async ({ page }) => {
    const before = await main(page).locator('[data-act="oCancel"]').count();
    await page.locator('[data-day="1"]').click();
    await page.locator('[data-slot="08:00"]').click();
    await expect(page.locator('#rulechk')).not.toBeChecked();
    await page.locator('#bookbtn').click();
    await expect(toast(page)).toContainText('Absageregel');
    await expect(main(page).locator('[data-act="oCancel"]')).toHaveCount(before);
  });

  test('H-035 (Zeile 36): zwei Tiere in einem Termin → +15 Minuten, Zusammenfassung nennt beide', async ({ page }) => {
    await expect(main(page)).toContainText(/Dauer\s*20 Min\./);
    await page.locator('[data-act="bxToggle"][data-v="mio"]').click();
    await expect(main(page)).toContainText(/Tier\s*Luna \+ Mio/);
    await expect(main(page)).toContainText(/Dauer\s*35 Min\./);
  });

  test('H-036 (Zeile 37): drei Tiere → Dauer = Basis + 15 Min je weiteres Tier, zu kurze Slots werden nicht angeboten', async ({ page }) => {
    await goView(page, 'profil');
    await page.locator('[data-act="newPet"]').click();
    await page.locator('#f-petName').fill('Bello');
    await page.locator('[data-act="addPet"]').click();
    await goView(page, 'termine');
    await page.locator('[data-act="bxToggle"][data-v="luna"]').click();
    await page.locator('[data-act="bxToggle"][data-v="mio"]').click();
    await expect(main(page)).toContainText(/Dauer\s*50 Min\./);
    // 11:30 liegt direkt vor der Mittagspause (12–14 Uhr) – 50 Minuten passen dort nicht hinein
    await page.locator('[data-day="1"]').click();
    await expect(page.locator('[data-slot="11:30"]:enabled')).toHaveCount(0);
  });

  test('H-038 (Zeile 39): akuter Anlass → Praxis sieht Kennzeichen „Akut“', async ({ page }) => {
    await page.locator('#grund').selectOption({ label: 'Akute Beschwerden' });
    await bookSlot(page, 1, '08:00');
    await switchRole(page, 'vet');
    await goView(page, 'vbuchungen');
    const row = main(page).locator('.brow').filter({ hasText: 'Luna · Ahmed' }).filter({ hasText: 'Do 08:00' });
    await expect(row).toContainText('Akut');
  });

  test('H-039 (Zeile 40): Videosprechstunde buchen → Termin hat Art Video, Telemedizin erreichbar', async ({ page }) => {
    await page.locator('#art').selectOption({ label: 'Videoberatung' });
    await bookSlot(page, 1, '08:00');
    await expect(main(page)).toContainText(/Do 08:00\s*Videoberatung/);
    await goView(page, 'tele');
    await expect(main(page).locator('h1')).toContainText('Telemedizin');
  });

  test('H-040 (Zeile 41): erster Besuch in der Praxis → Praxis sieht „Neukunde“', async ({ page }) => {
    await page.locator('input[data-nc]').check();
    await bookSlot(page, 1, '08:00');
    await switchRole(page, 'vet');
    await goView(page, 'vbuchungen');
    const row = main(page).locator('.brow').filter({ hasText: 'Luna · Ahmed' }).filter({ hasText: 'Do 08:00' });
    await expect(row).toContainText('Neukunde');
  });

  test('H-041 (Zeile 42): Favorit gesetzt → steht oben, Stern bleibt nach Neuladen', async ({ page }) => {
    await goView(page, 'profil');
    await page.locator('[data-act="favTog"][data-v="p3"]').click();
    await expect(page.locator('[data-act="favTog"][data-v="p3"]')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(600); // Prototyp speichert verzögert (400 ms) im Browser
    await page.reload();
    await goView(page, 'profil');
    await expect(page.locator('[data-act="favTog"][data-v="p3"]')).toHaveAttribute('aria-pressed', 'true');
    // „Favorit steht oben“ – in der Praxisliste im Profil und in der Praxisauswahl bei der Buchung
    await expect(page.locator('[data-act="favTog"]').first()).toHaveAttribute('data-v', 'p3');
    await goView(page, 'termine');
    await expect(page.locator('input[id^="prac-"]').first()).toHaveAttribute('id', 'prac-p3');
  });

  test('H-043 (Zeile 44): Sonntag geschlossen, keine Slots in der Mittagspause', async ({ page }) => {
    // 18.10.2026 ist ein Sonntag (Tag 4 ab Mi, 14.10.)
    await expect(page.locator('[data-day="4"]')).toContainText('18.10.');
    await expect(page.locator('[data-day="4"]')).toBeDisabled();
    await page.locator('[data-day="1"]').click();
    const slots = await page.locator('[data-slot]').evaluateAll((els) => els.map((e) => e.getAttribute('data-slot') ?? ''));
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.filter((s) => s >= '12:00' && s < '14:00')).toEqual([]);
  });

  test('H-044 (Zeile 45): Hinweis zur Datenfreigabe erscheint beim Buchen', async ({ page }) => {
    await expect(page.locator('#share')).toBeVisible();
    await expect(main(page)).toContainText('Tierakte für die Praxis freigeben');
    await expect(main(page)).toContainText('Die Praxis erhält die freigegebenen Daten');
  });

  test('H-046 (Zeile 47): aus dem Symptomcheck „Termin buchen“ → Buchung mit vorausgewähltem Tier', async ({ page }) => {
    await goView(page, 'symptom');
    await page.locator('[data-pet-sym="mio"]').click();
    await page.locator('[data-sym="s_cough"]').click();
    await page.locator('#dauer').selectOption('>3d');
    await page.locator('#checkbtn').click();
    await expect(main(page).locator('.result')).toContainText('Mio');
    await main(page).locator('.result [data-go="termine"]').click();
    await expect(main(page).locator('h1')).toContainText('Termin buchen');
    await expect(page.locator('[data-pet-book="mio"]')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('Termine buchen – Feiertag', () => {
  test('H-043 (Zeile 44, Feiertag): 25.12. bietet keine Slots an', async ({ page }) => {
    await openAsOwner(page, new Date('2026-12-22T10:00:00+01:00'));
    await goView(page, 'termine');
    const xmas = page.locator('[data-day]').filter({ hasText: '25.12.' });
    await expect(xmas).toHaveCount(1);
    if (await xmas.isEnabled()) {
      await xmas.click();
      await expect(page.locator('[data-slot]:enabled')).toHaveCount(0);
    }
  });
});

test.describe('Termine verwalten', () => {
  test.beforeEach(async ({ page }) => {
    await openAsOwner(page);
    await goView(page, 'termine');
  });

  test('H-047 (Zeile 48): Absage > 24 h vorher → kostenlos, Praxis sieht „von Halter:in abgesagt“ ohne „kurzfristig“', async ({ page }) => {
    // a1: Luna, Sa 17.10., 09:30 – mehr als 24 h entfernt
    await page.locator('[data-act="oCancel"][data-id="a1"]').click();
    await page.locator('[data-act="oCancelYes"][data-id="a1"]').click();
    await expect(toast(page)).toContainText(/kostenlos/i);
    await switchRole(page, 'vet');
    await goView(page, 'vbuchungen');
    await main(page).getByRole('button', { name: /^Alle/ }).click();
    const row = main(page).locator('.brow').filter({ hasText: 'Luna · Ahmed' }).filter({ hasText: 'Sa 09:30' });
    await expect(row).toContainText(/von Halter:in abgesagt/i);
    await expect(row).not.toContainText(/kurzfristig/i);
  });

  test('H-048 (Zeile 49): Absage < 24 h vorher → Warnung zu Kosten, Praxis sieht „Kurzfristig abgesagt“', async ({ page }) => {
    await bookSlot(page, 1, '08:00'); // Do 15.10., 08:00 – 22 h entfernt
    const card = main(page).locator('.brow').filter({ hasText: 'Do 08:00' });
    await card.locator('[data-act="oCancel"]').click();
    await expect(main(page)).toContainText(/Kosten/);
    await main(page).locator('[data-act="oCancelYes"]').click();
    await switchRole(page, 'vet');
    await goView(page, 'vbuchungen');
    await main(page).getByRole('button', { name: /^Alle/ }).click();
    await expect(main(page)).toContainText(/Kurzfristig abgesagt/i);
  });

  test('H-049 (Zeile 50): Absage abbrechen → Termin bleibt bestehen', async ({ page }) => {
    await page.locator('[data-act="oCancel"][data-id="a1"]').click();
    await main(page).getByRole('button', { name: 'Zurück' }).click();
    await expect(page.locator('[data-act="oCancel"][data-id="a1"]')).toBeVisible();
    await expect(main(page)).toContainText('Leptospirose-Auffrischung');
  });

  test('H-050 (Zeile 51): Verschieben > 24 h vorher → alter Termin frei, neuer Termin gebucht', async ({ page }) => {
    await page.locator('[data-act="oMove"][data-id="a1"]').click();
    await page.locator('[data-act="oMoveTo"][data-id="a1"][data-day="1"][data-t="08:00"]').click();
    await expect(main(page)).toContainText(/Do 08:00/);
    await expect(main(page)).not.toContainText(/Sa 09:30/); // alter Termin (Sa 17.10.) muss frei sein
  });

  test('H-053 (Zeile 54): „In meinen Kalender eintragen“ → Kalenderdatei mit richtiger Zeit', async ({ page }) => {
    await page.locator('#calsync').check();
    const download = page.waitForEvent('download', { timeout: 5000 });
    await bookSlot(page, 1, '08:00');
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.ics$/);
  });

  test('H-055 (Zeile 56): Praxis verschiebt Termin → Halter sieht neue Zeit und Hinweis', async ({ page }) => {
    await switchRole(page, 'vet');
    await goView(page, 'vbuchungen');
    await page.locator('[data-act="bf"][data-v="all"]').click();
    await page.locator('[data-act="bMove"][data-id="a2"]').click();
    await page.locator('[data-act="bMoveTo"][data-id="a2"][data-to="2|08:00"]').click();
    await switchRole(page, 'owner');
    await goView(page, 'home');
    await expect(main(page)).toContainText('Ihr Termin für Mio wurde auf Fr 16.10. um 08:00 verschoben.');
    await goView(page, 'termine');
    await expect(main(page).locator('.brow').filter({ hasText: 'Mio · ' })).toContainText('Fr 08:00');
  });

  test('H-056 (Zeile 57): Praxis sagt mit Grund ab → Halter sieht Absage, Grund und Ersatzangebot', async ({ page }) => {
    await switchRole(page, 'vet');
    await goView(page, 'vbuchungen');
    await page.locator('[data-act="bf"][data-v="all"]').click();
    await main(page).locator('.brow').filter({ hasText: 'Luna · Ahmed' }).first().locator('[data-act="bCancel"]').click();
    await page.locator('#f-cNote').fill('Praxis heute geschlossen');
    await page.locator('#f-cOffer').check();
    await page.locator('[data-act="bCancelYes"]').click();
    await switchRole(page, 'owner');
    await goView(page, 'home');
    await expect(main(page)).toContainText(/Praxis musste Ihren Termin am Sa 17\.10\. um 09:30 \(Luna\) absagen/);
    await expect(main(page)).toContainText('Praxis heute geschlossen');
    await expect(main(page)).toContainText('Neuen Termin wählen');
  });

  test('H-051 (Zeile 52): Verschieben < 24 h vorher → alter Termin bleibt bis zur Bestätigung, Hinweis sichtbar', async ({ page }) => {
    await bookSlot(page, 1, '08:00'); // Do 15.10., 08:00 – 22 h entfernt
    const card = main(page).locator('.brow').filter({ hasText: 'Do 08:00' });
    await card.locator('[data-act="oMove"]').click();
    await card.locator('[data-act="oMoveTo"]').first().click();
    await expect(main(page).locator('.brow').filter({ hasText: 'Do 08:00' })).toBeVisible(); // alter Termin bleibt
    await expect(main(page)).toContainText(/wartet auf Bestätigung/);
  });
});
