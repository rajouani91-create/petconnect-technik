import { expect, test, type Page } from '@playwright/test';
import { goView, main, openAsOwner, switchRole, toast } from './helpers';

/** Szenarien aus PetConnect_Testprotokoll.xlsx, Blatt „Halter“ – Haustiere & Tierakte (Browser-Tests gegen index.html). */

async function openSub(page: Page, sub: string): Promise<void> {
  await goView(page, 'akte');
  await page.locator(`[data-act="subOpen"][data-v="${sub}"]`).click();
}

async function addOwnVaccination(page: Page, date: string): Promise<void> {
  await goView(page, 'akte');
  await page.locator('[data-act="impfAddOpen"]').click();
  await page.locator('#f-ownVacName').selectOption({ index: 0 }); // Tollwut
  await page.locator('#f-ownVacDate').fill(date);
  await page.locator('#f-ownVacYears').selectOption({ index: 0 }); // 1 Jahr
  await page.locator('[data-act="impfAddSave"]').click();
}

async function openPatient(page: Page, pid: string): Promise<void> {
  await switchRole(page, 'vet');
  await goView(page, 'vpatienten');
  await page.locator(`[data-act="openPat"][data-pid="${pid}"]`).click();
}

/** Abschnitt „Medikation“ in der Tierakte der Halter:in. */
const medCard = (page: Page) => main(page).locator('.card').filter({ has: page.getByRole('heading', { name: 'Medikation' }) });

test.describe('Haustiere – Stammdaten', () => {
  test.beforeEach(async ({ page }) => {
    await openAsOwner(page);
    await goView(page, 'profil');
    await page.locator('[data-act="newPet"]').click();
  });

  test('H-024 (Zeile 25): Tier ohne Pflichtfeld Name → Fehlermeldung am Feld', async ({ page }) => {
    await page.locator('[data-act="addPet"]').click();
    await expect(page.locator('#f-petName')).toBeVisible(); // Formular bleibt offen
    const field = main(page).locator('.field').filter({ has: page.locator('#f-petName') });
    await expect(field).toContainText(/Bitte|Pflicht|fehlt|angeben/i);
  });

  test('H-025 (Zeile 26): Geburtsdatum in der Zukunft → wird abgelehnt oder Warnung', async ({ page }) => {
    await page.locator('#f-petName').fill('Zukunftstier');
    await page.locator('#f-birth').fill('2030-01-01');
    await page.locator('[data-act="addPet"]').click();
    const rejected = page.locator('#f-petName');
    const warned = page.locator('#toast, #main').getByText(/Zukunft|ungültig|nicht möglich/i);
    await expect(rejected.or(warned).first()).toBeVisible();
    if (!(await rejected.isVisible())) await expect(warned.first()).toBeVisible();
  });
});

test.describe('Tierakte – Übersicht & Impfpass', () => {
  test.beforeEach(async ({ page }) => {
    await openAsOwner(page);
  });

  test('H-078 (Zeile 79): Akte öffnen → Stammdaten, Impfungen, Befunde, Dokumente, Medikation sichtbar', async ({ page }) => {
    await goView(page, 'akte');
    for (const text of ['Transponder', 'Impfungen', 'Befunde', 'Dokumente', 'Medikation']) {
      await expect(main(page), `Abschnitt „${text}“`).toContainText(text);
    }
  });

  test('H-079 (Zeile 80): Gesundheitsbereiche, Notfallkarte, Teilen, Versicherung, Mehr öffnen die Unterseite, „Zurück“ führt in die Akte', async ({ page }) => {
    const subs: ReadonlyArray<readonly [string, RegExp]> = [
      ['areas', /Gesundheitsbereiche/],
      ['card', /Notfallkarte/],
      ['share', /Teilen & Freigaben/],
      ['ins', /Versicherung/],
      ['more', /Weitere Optionen/],
    ];
    await goView(page, 'akte');
    for (const [v, title] of subs) {
      await page.locator(`[data-act="subOpen"][data-v="${v}"]`).click();
      await expect(main(page).locator('h1')).toContainText(title);
      await page.locator('[data-act="subBack"]').click();
      await expect(main(page).locator('h1')).toContainText('Tierakte');
    }
  });

  test('H-082 (Zeile 83): Impfung mit bekanntem Intervall → nächste Fälligkeit berechnet, Erinnerung entsteht', async ({ page }) => {
    await addOwnVaccination(page, '2026-10-01');
    await expect(main(page)).toContainText('geimpft 01.10.2026 · gültig bis 01.10.2027');
    await goView(page, 'erinnerung');
    await expect(main(page)).toContainText(/Tollwut/);
  });

  test('H-083 (Zeile 84): Praxis bestätigt Halter-Eintrag → Status „Bestätigt von Praxis“', async ({ page }) => {
    await addOwnVaccination(page, '2026-10-01');
    await expect(main(page)).toContainText('nicht bestätigt');
    await openPatient(page, 'luna');
    await page.locator('[data-act="impfConfirm"][data-pid="luna"]').click();
    await switchRole(page, 'owner');
    await goView(page, 'akte');
    const entry = main(page).locator('.row').filter({ hasText: 'geimpft 01.10.2026' });
    await expect(entry).not.toContainText('nicht bestätigt');
    await expect(entry).toContainText(/bestätigt|Von Tierarztpraxis am Ostpark/i);
  });

  test('H-084 (Zeile 85): Praxis trägt dieselbe Impfung ein → doppelter Halter-Eintrag ausgeblendet', async ({ page }) => {
    await addOwnVaccination(page, '2026-10-01');
    await openPatient(page, 'luna');
    await page.locator('#f-vacName').selectOption({ index: 0 });
    await page.locator('#f-vacDate').fill('2026-10-01');
    await page.locator('[data-act="saveVacc"][data-pid="luna"]').click();
    await switchRole(page, 'owner');
    await goView(page, 'akte');
    await expect(main(page).locator('.row').filter({ hasText: 'geimpft 01.10.2026' })).toHaveCount(1);
  });

  test('H-085 (Zeile 86): Impfpass drucken → Druckansicht mit allen Impfungen', async ({ page }) => {
    await goView(page, 'akte');
    await page.locator('[data-act="nwOpen"]').click();
    await page.locator('[data-act="nwDl"]').click();
    // Der Prototyp druckt über ein verstecktes iframe mit eigenem Druckdokument
    const printDoc = page.frameLocator('iframe').last().locator('body');
    for (const v of ['Digitaler Impfnachweis', 'Luna', 'Tollwut', 'SHPPi', 'Leptospirose L4']) await expect(printDoc).toContainText(v);
  });

  test('H-093 (Zeile 94): von der Praxis verordnetes Medikament → Halter sieht es mit Herkunft Praxis, nicht löschbar', async ({ page }) => {
    await openPatient(page, 'luna');
    await page.locator('#f-mdName').fill('Meloxicam');
    await page.locator('#f-mdDos').fill('0,5 ml täglich');
    await page.locator('[data-act="medAdd"][data-pid="luna"]').click();
    await switchRole(page, 'owner');
    await goView(page, 'akte');
    await expect(medCard(page)).toContainText('Meloxicam');
    await expect(medCard(page)).toContainText(/Praxis/);
    await expect(medCard(page).getByRole('button', { name: /Löschen/ })).toHaveCount(0);
  });

  test('H-094 (Zeile 95): Medikationsplan in der Gesundheitsakte (PDF) enthält alle aktiven Medikamente', async ({ page }) => {
    await goView(page, 'akte');
    const meds = ['Wurmkur (Milbemycinoxim/Praziquantel)', 'Zeckenschutz (Fluralaner)'];
    for (const m of meds) await expect(medCard(page)).toContainText(m);
    await page.locator('[data-act="subOpen"][data-v="vault"]').click();
    for (const m of meds) await expect(main(page), m).toContainText(m);
  });
});

test.describe('Tierakte – Gewicht', () => {
  test.beforeEach(async ({ page }) => {
    await openAsOwner(page);
    await openSub(page, 'weight');
  });

  test('H-096 (Zeile 97): Zeitraum 3/12 Monate/Alles umschalten → Kurve und Beschriftung passen sich an', async ({ page }) => {
    await expect(main(page)).toContainText('13.03.26'); // 1 Jahr: älteste Messung sichtbar
    await page.locator('[data-act="wkRange"][data-v="3m"]').click();
    await expect(page.locator('[data-act="wkRange"][data-v="3m"]')).toHaveAttribute('aria-pressed', 'true');
    // Achsenbeschriftung im Format TT.MM.JJ; die Messliste darunter nutzt TT.MM.JJJJ
    await expect(main(page)).not.toContainText('13.03.26');
    await expect(main(page)).toContainText('09.10.26');
  });

  test('H-097 (Zeile 98): Gewicht „12,5“ mit Komma → wird als 12,5 kg übernommen', async ({ page }) => {
    await page.locator('#f-wkDate').fill('2026-10-13');
    await page.locator('#f-wkKg').click();
    await page.keyboard.type('12,5');
    await page.locator('[data-act="wkAdd"]').click();
    await expect(main(page)).toContainText(/13\.10\.2026\s*12,5 kg/);
  });

  test('H-099 (Zeile 100): Gewicht löschen → Kurve aktualisiert sich', async ({ page }) => {
    await expect(main(page)).toContainText(/Aktuell\s*28,4 kg/);
    const before = await page.locator('[data-act="wkDel"]').count();
    await page.locator('[data-act="wkDel"]').first().click(); // jüngste Messung 09.10.2026 (28,4 kg)
    await expect(page.locator('[data-act="wkDel"]')).toHaveCount(before - 1);
    await expect(main(page)).toContainText(/Aktuell\s*28,1 kg/);
  });

  test('H-100 (Zeile 101): Zielgewicht speichern und entfernen → Zielband erscheint und verschwindet', async ({ page }) => {
    await page.locator('#f-wkLo').fill('27');
    await page.locator('#f-wkHi').fill('29');
    await page.locator('[data-act="wkTSave"]').click();
    await expect(main(page)).toContainText('27,0–29,0 kg');
    await expect(main(page)).toContainText('im Wunschbereich');
    await page.locator('[data-act="wkTClear"]').click();
    await expect(main(page)).not.toContainText('27,0–29,0 kg');
    await expect(main(page)).not.toContainText('im Wunschbereich');
  });

  test('H-101 (Zeile 102): Gewichtsverlauf auf Arabisch → Zahlen und Datum bleiben von links nach rechts lesbar', async ({ page }) => {
    await page.locator('#lang-side').selectOption('ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    // Sichtprüfung über die Bildschirmposition: In jeder Zahl/jedem Datum der Messliste muss das erste Zeichen
    // links vom letzten stehen (Leserichtung innerhalb der Zahl bleibt links → rechts).
    const ltr = await main(page).locator('[data-act="wkDel"]').evaluateAll((btns) =>
      btns.flatMap((b) => {
        const row = b.parentElement?.parentElement ?? b.parentElement;
        if (!row) return [];
        const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
        const out: boolean[] = [];
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const m = /[\d٠-٩][\d٠-٩.,٫/]*[\d٠-٩]/.exec(n.textContent ?? '');
          if (!m) continue;
          const at = (i: number) => { const r = document.createRange(); r.setStart(n as Node, i); r.setEnd(n as Node, i + 1); return r.getBoundingClientRect().left; };
          out.push(at(m.index) < at(m.index + m[0].length - 1));
        }
        return out;
      }),
    );
    expect(ltr.length).toBeGreaterThan(0);
    expect(ltr.every(Boolean)).toBe(true);
  });
});

test.describe('Tierakte – Dokumente & Medikation (Halter)', () => {
  test.beforeEach(async ({ page }) => {
    await openAsOwner(page);
    await goView(page, 'akte');
  });

  test('H-089 (Zeile 90): Dokument löschen → verschwindet nur nach Bestätigung', async ({ page }) => {
    // Einstieg in die Dokumentenansicht aus der Tierakte
    await page.locator('[data-act="docOpenView"]').click({ timeout: 5000 });
    await page.locator('#f-docNameIn').fill('Röntgenbild Pfote');
    await page.locator('[data-act="docSave"]').click();
    const row = main(page).locator('.row').filter({ hasText: 'Röntgenbild Pfote' });
    await row.locator('[data-act="docDel"]').click();
    await expect(row).toHaveCount(1); // erst Rückfrage, noch nicht gelöscht
    await main(page).getByRole('button', { name: /Ja|Löschen bestätigen/ }).click();
    await expect(row).toHaveCount(0);
  });

  test('H-092 (Zeile 93): eigenes Medikament löschen → Eintrag weg, Praxis-Einträge nicht löschbar', async ({ page }) => {
    await page.locator('[data-act="subOpen"][data-v="areas"]').click();
    await page.locator('#f-areaCatSel').selectOption({ label: 'Medikamente' });
    await page.locator('#f-areaDate').fill('2026-10-10');
    await page.locator('#f-areaText').fill('Kamillentee-Umschlag');
    await page.locator('[data-act="areaSave"]').click();
    await expect(main(page)).toContainText('Kamillentee-Umschlag');
    const own = main(page).locator('.row').filter({ hasText: 'Kamillentee-Umschlag' });
    const prac = main(page).locator('.row').filter({ hasText: 'Milbemax' });
    await expect(prac.locator('[data-act="areaDel"]')).toHaveCount(0);
    await own.locator('[data-act="areaDel"]').click();
    await expect(main(page)).not.toContainText('Kamillentee-Umschlag');
  });
});

test.describe('Tierakte – Laborwerte', () => {
  test.beforeEach(async ({ page }) => {
    await openAsOwner(page);
    await openSub(page, 'labs');
    await page.locator('[data-act="lbToggle"]').click();
  });

  test('H-102 (Zeile 103): Panel wählen → passende Parameter erscheinen', async ({ page }) => {
    await page.locator('[data-act="lbPanel"][data-v="lpBlood"]').click();
    await expect(page.locator('#f-lv_WBC')).toBeVisible();
    await expect(page.locator('#f-lv_CREA')).toHaveCount(0);
    await page.locator('[data-act="lbPanel"][data-v="lpOrgan"]').click();
    await expect(page.locator('#f-lv_CREA')).toBeVisible();
    await expect(page.locator('#f-lv_WBC')).toHaveCount(0);
    await page.locator('[data-act="lbPanel"][data-v="lpThy"]').click();
    await expect(page.locator('[id^="f-lv_"]').first()).toBeVisible();
    await expect(page.locator('#f-lv_CREA')).toHaveCount(0);
  });

  test('H-103 (Zeile 104): Wert eintragen → Punkt in Verlaufskurve, Referenzband sichtbar', async ({ page }) => {
    await page.locator('[data-act="lbPanel"][data-v="lpOrgan"]').click();
    await page.locator('#f-lv_CREA').fill('1,2');
    await page.locator('[data-act="lbSave"]').click();
    await expect(toast(page)).toContainText('Laborbefund gespeichert');
    await expect(main(page)).toContainText('14.10.26'); // neuer Punkt auf der Zeitachse
    await expect(main(page)).toContainText('Referenz 0,50–1,50 mg/dl');
  });

  test('H-104 (Zeile 105): Wert außerhalb der Referenz → Markierung „über Referenz“', async ({ page }) => {
    await page.locator('[data-act="lbPanel"][data-v="lpOrgan"]').click();
    await page.locator('#f-lv_CREA').fill('3');
    await page.locator('[data-act="lbSave"]').click();
    await expect(main(page)).toContainText('erhöht ↑');
    await expect(main(page)).toContainText('außerhalb des Referenzbereichs');
  });

  test('H-105 (Zeile 106): Referenzwerte Hund/Katze unterscheiden sich, Hinweis „Richtwerte“', async ({ page }) => {
    await page.locator('[data-act="lbPanel"][data-v="lpOrgan"]').click();
    const dog = await page.locator('#f-lr_CREA').inputValue();
    await page.locator('[data-act="subBack"]').click();
    await page.locator('[data-pet-akte="mio"]').click();
    await page.locator('[data-act="subOpen"][data-v="labs"]').click();
    // Das Eingabeformular kann vom vorherigen Tier noch offen sein
    if ((await page.locator('[data-act="lbPanel"]').count()) === 0) await page.locator('[data-act="lbToggle"]').click();
    await expect(main(page).locator('h1')).toContainText('Laborwerte: Mio');
    await page.locator('[data-act="lbPanel"][data-v="lpOrgan"]').click();
    const cat = await page.locator('#f-lr_CREA').inputValue();
    expect(cat).not.toBe(dog);
    await expect(main(page)).toContainText(/Richtwert/);
  });

  test('H-106 (Zeile 107): Referenzbereich anpassen → neuer Bereich wird verwendet', async ({ page }) => {
    await page.locator('[data-act="lbPanel"][data-v="lpOrgan"]').click();
    await page.locator('#f-lr_CREA').fill('0,50–2,00');
    await page.locator('#f-lv_CREA').fill('1,8');
    await page.locator('[data-act="lbSave"]').click();
    await expect(main(page)).toContainText(/Referenz 0,50–2(,00)? mg\/dl/);
    await expect(main(page)).toContainText('Alle Werte des letzten Befunds liegen im Referenzbereich.');
  });

  test('H-107 (Zeile 108): Laborwert löschen → Kurve aktualisiert sich', async ({ page }) => {
    await page.locator('[data-act="lbPanel"][data-v="lpOrgan"]').click();
    await page.locator('#f-lv_CREA').fill('1,2');
    await page.locator('[data-act="lbSave"]').click();
    await expect(main(page)).toContainText('14.10.26');
    await page.locator('[data-act="lbDel"]').first().click();
    await expect(main(page)).not.toContainText('14.10.26');
    await expect(main(page)).not.toContainText('14.10.2026');
  });

  test('H-108 (Zeile 109): Dezimalkomma „1,80“ → wird korrekt gelesen', async ({ page }) => {
    await page.locator('[data-act="lbPanel"][data-v="lpOrgan"]').click();
    await page.locator('#f-lv_CREA').fill('1,80');
    await page.locator('[data-act="lbSave"]').click();
    await expect(main(page)).toContainText('1,80 mg/dl');
    await expect(main(page)).toContainText('erhöht ↑'); // 1,80 > 1,50 – also als 1,8 gelesen, nicht als 180 oder 1
  });
});

test.describe('Tierakte – Vorgeschichte', () => {
  test.beforeEach(async ({ page }) => {
    await openAsOwner(page);
  });

  test('H-109 (Zeile 110): Anamnese ausfüllen und speichern → Praxis sieht „Ausgefüllt am …“', async ({ page }) => {
    await openSub(page, 'history');
    await page.locator('#f-hOrigin').selectOption({ index: 2 });
    await page.locator('#f-hIll').fill('Ohrentzündung 2024');
    await page.locator('[data-act="hsSave"]').click();
    await openPatient(page, 'luna');
    await expect(main(page)).toContainText(/Ausgefüllt am 14\.10\.2026/);
    await expect(main(page)).toContainText('Ohrentzündung 2024');
  });

  test('H-110 (Zeile 111): Anamnese leer lassen → kein Zwang, Buchung funktioniert trotzdem', async ({ page }) => {
    await goView(page, 'termine');
    await page.locator('[data-day="1"]').click();
    await page.locator('[data-slot="08:00"]').click();
    await page.locator('#rulechk').check();
    await page.locator('#bookbtn').click();
    await expect(main(page).locator('.brow').filter({ hasText: 'Do 08:00' })).toBeVisible();
    await openPatient(page, 'luna');
    await expect(main(page)).toContainText('Noch keine Vorgeschichte angegeben.');
  });

  test('H-111 (Zeile 112): Praxis ergänzt Anamnese → Ergänzung getrennt gekennzeichnet, „Ausgefüllt am“ nur nach Halter-Speichern', async ({ page }) => {
    await openPatient(page, 'luna');
    await page.locator('#f-hPrac').fill('Herzgeräusch Grad 1 bekannt');
    await page.locator('[data-act="hsPrac"]').click();
    await expect(main(page)).not.toContainText(/Ausgefüllt am/);
    await switchRole(page, 'owner');
    await openSub(page, 'history');
    await expect(main(page)).toContainText('Herzgeräusch Grad 1 bekannt');
    await expect(main(page)).toContainText(/Ergänzung der Praxis|von der Praxis/i);
  });
});

test.describe('Tierakte – Gesundheitsbereiche & Notfallkarte', () => {
  test.beforeEach(async ({ page }) => {
    await openAsOwner(page);
  });

  test('H-112 (Zeile 113): Gesundheitsbereich-Eintrag anlegen → erscheint unter Kategorie, Filter funktioniert', async ({ page }) => {
    await openSub(page, 'areas');
    await page.locator('#f-areaCatSel').selectOption({ label: 'Operationen' });
    await page.locator('#f-areaDate').fill('2025-05-20');
    await page.locator('#f-areaText').fill('Kastration');
    await page.locator('[data-act="areaSave"]').click();
    await expect(main(page)).toContainText(/Operationen\s*Kastration/);
    await page.locator('[data-act="areaFilter"][data-v="prac"]').click();
    await expect(main(page)).not.toContainText('Kastration');
    await page.locator('[data-act="areaFilter"][data-v="me"]').click();
    await expect(main(page)).toContainText('Kastration');
    await expect(main(page)).not.toContainText('Milbemax'); // Praxis-Eintrag
  });

  test('H-113 (Zeile 114): Bereichseintrag löschen → Eintrag weg', async ({ page }) => {
    await openSub(page, 'areas');
    await expect(main(page)).toContainText('Frisst nur nasses Futter');
    await main(page).locator('.row').filter({ hasText: 'Frisst nur nasses Futter' }).locator('[data-act="areaDel"]').click();
    await expect(main(page)).not.toContainText('Frisst nur nasses Futter');
  });

  test('H-114 (Zeile 115): Notfallkarte zeigt Halter, Telefon, Chip, Allergien, Medikation, Stammpraxis', async ({ page }) => {
    await goView(page, 'profil');
    await page.locator('[data-act="stammSet"][data-v="p1"]').click();
    await openSub(page, 'card');
    for (const text of ['Ahmed', '276 098 106 452 731', 'Futtermittelallergie', 'Milbemax']) {
      await expect(main(page), text).toContainText(text);
    }
    await expect(main(page), 'Stammpraxis mit Telefonnummer').toContainText(/Stammpraxis\s*Tierarztpraxis am Ostpark · [\d ]{6,}/);
    await expect(main(page), 'Telefon der Halter:in').not.toContainText(/Telefon\s*—/);
  });

  test('H-115 (Zeile 116): Notfallkarte drucken → Druckansicht wird geöffnet', async ({ page }) => {
    await page.evaluate('window.__printed = 0; window.print = () => { window.__printed++; };');
    await openSub(page, 'card');
    const popup = page.waitForEvent('popup', { timeout: 3000 }).catch(() => null);
    await page.locator('[data-act="cardPrint"]').click();
    const opened = (await popup) !== null || (await page.locator('iframe').count()) > 0 || Number(await page.evaluate('window.__printed')) > 0;
    expect(opened, 'Es wurde weder ein Druckdialog noch eine Druckansicht geöffnet').toBe(true);
  });

  test('H-116 (Zeile 117): Stammpraxis setzen → SOS-Anruf nutzt diese Praxis', async ({ page }) => {
    await goView(page, 'profil');
    await page.locator('[data-act="stammSet"][data-v="p2"]').click();
    await expect(page.locator('[data-act="stammSet"][data-v="p2"]')).toHaveAttribute('aria-pressed', 'true');
    await goView(page, 'notfall');
    await expect(main(page).locator('[data-act="sosCall"]')).toContainText('Stammpraxis anrufen · Kleintierzentrum Mainspitze');
  });
});
