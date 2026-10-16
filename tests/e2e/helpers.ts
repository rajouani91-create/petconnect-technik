import { expect, type Locator, type Page } from '@playwright/test';

/** Prototyp als Datei – kein Server nötig. */
export const APP_URL = new URL('../../../index.html', import.meta.url).href;

/** Fester „Jetzt“-Zeitpunkt: Mittwoch, 14.10.2026, 10:00 Uhr in Berlin. Termine im Prototyp liegen relativ dazu. */
export const NOW = new Date('2026-10-14T10:00:00+02:00');

/** Öffnet den Prototyp mit fester Uhrzeit und meldet sich über „Demo“ als Halter:in an. */
export async function openAsOwner(page: Page, now: Date = NOW): Promise<void> {
  await page.clock.setFixedTime(now);
  await page.goto(APP_URL);
  await page.locator('[data-act="demo"]').click();
  await expect(page.locator('nav [data-view="home"]')).toBeVisible();
}

export const main = (page: Page): Locator => page.locator('#main');
export const toast = (page: Page): Locator => page.locator('#toast');

export async function goView(page: Page, view: string): Promise<void> {
  await page.locator(`nav [data-view="${view}"]`).click();
}

export async function switchRole(page: Page, role: 'owner' | 'vet'): Promise<void> {
  await page.locator(`[data-role="${role}"]`).first().click();
}

/** Klickt auf einen Button im Hauptbereich anhand seines sichtbaren Texts. */
export async function clickButton(page: Page, name: string | RegExp): Promise<void> {
  await main(page).getByRole('button', { name }).first().click();
}

/** Bucht im Formular „Termin buchen“ einen Slot (Absageregel bestätigt). */
export async function bookSlot(page: Page, day: number, slot: string): Promise<void> {
  await page.locator(`[data-day="${day}"]`).click();
  await page.locator(`[data-slot="${slot}"]`).click();
  await page.locator('#rulechk').check();
  await page.locator('#bookbtn').click();
}
