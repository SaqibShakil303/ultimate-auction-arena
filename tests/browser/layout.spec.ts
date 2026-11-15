// Layout at the awkward in-between widths (tablets, small laptops) as well as phones and desktops.

import { expect, test, type Locator, type Page } from '@playwright/test';

const WIDTHS = [360, 390, 768, 820, 1024, 1100, 1279, 1280, 1440, 1920];

async function box(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error('element has no box');
  return b;
}
/** Lists the elements that stick out past the right edge — makes an overflow failure self-explanatory. */
const offenders = (page: Page) => page.evaluate(() => {
  if (document.documentElement.scrollWidth <= window.innerWidth + 1) return [] as string[];
  return [...document.querySelectorAll<HTMLElement>('body *')]
    .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && el.offsetParent !== null && getComputedStyle(el).position !== 'fixed')
    .slice(0, 6)
    .map((el) => `<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 60)}"> "${(el.innerText || '').slice(0, 30)}" right=${Math.round(el.getBoundingClientRect().right)}`);
});
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('the bid amount, countdown and Place Bid button never overlap or overflow at any width', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'this test sets its own viewports');
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem('uaa.muted', '1'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter Football Auction', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('radio', { name: '2', exact: true }).click();
  await page.getByRole('textbox', { name: 'Participant 1 name', exact: true }).fill('Alexandria');
  await page.getByRole('textbox', { name: 'Participant 2 name', exact: true }).fill('Bartholomew');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('radio', { name: /50 lakh/ }).click(); // the longest price strings
  await page.getByRole('radio', { name: '30s', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Start the auction' }).click();
  const region = page.getByRole('region', { name: 'Bidding', exact: true });
  await expect(region.getByRole('timer')).toBeVisible({ timeout: 15_000 });
  await expect(region.getByRole('button', { name: /Bartholomew/ }).first()).toBeEnabled({ timeout: 15_000 });
  await page.keyboard.press('2'); // a leader with a long name, and a six-digit bid, are the widest states
  await expect(page.getByText('Bartholomew leads')).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click(); // freeze the lot while resizing
  await page.getByRole('button', { name: /Resume/ }).last().waitFor();

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    expect(await offenders(page), `sideways scroll at ${width}px`).toEqual([]);
    const price = await box(region.locator('.bump').first());
    const timer = await box(region.getByRole('timer'));
    expect(overlaps(price, timer), `price overlaps countdown at ${width}px`).toBe(false);
    const panel = await box(region);
    expect(price.x + price.width, `price spills out of its panel at ${width}px`).toBeLessThanOrEqual(panel.x + panel.width + 1);
    expect(timer.x + timer.width, `countdown spills out of its panel at ${width}px`).toBeLessThanOrEqual(panel.x + panel.width + 1);
  }
});

test('setup, lobby-style forms and results fit every width without sideways scrolling', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'this test sets its own viewports');
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem('uaa.muted', '1'));
  const fits = async (what: string) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(80);
      expect(await offenders(page), `${what}: sideways scroll at ${width}px`).toEqual([]);
    }
  };
  await page.goto('/');
  await fits('home');
  await page.getByRole('button', { name: 'Assemble Your Heroes', exact: true }).click();
  await fits('setup: mode');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('radio', { name: '8', exact: true }).click();
  await fits('setup: eight players');
  await page.goto('/?room=ABCDE');
  await fits('join form');
  await page.goto('/');
  await page.getByRole('button', { name: /Legends Auction — Friends Championship/ }).click();
  await expect(page.getByRole('tab', { name: 'Final lineups' })).toBeVisible();
  await fits('results');
});
