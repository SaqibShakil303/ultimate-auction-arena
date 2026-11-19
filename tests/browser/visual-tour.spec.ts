// A visual tour of every redesigned screen. Saves screenshots to artifacts/tour-* for review and
// checks the things a redesign most easily breaks: real photos load, nothing overflows sideways,
// and no runtime errors appear.

import { expect, test, type Page } from '@playwright/test';

const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `artifacts/tour-${project}-${name}.png`, fullPage: true });

async function toAuction(page: Page, mode: 'football' | 'heroes') {
  await page.goto('/');
  await page.getByRole('button', { name: mode === 'football' ? 'Enter Football Auction' : 'Assemble Your Heroes', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('radio', { name: '4', exact: true }).click();
  for (const [i, n] of ['Saqib', 'Rahul', 'Aman', 'Priya'].entries()) await page.getByRole('textbox', { name: `Participant ${i + 1} name`, exact: true }).fill(n);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('radio', { name: '30s', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Start the auction' }).click();
  await expect(page.getByRole('region', { name: 'Bidding', exact: true }).getByRole('timer')).toBeVisible({ timeout: 15_000 });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('uaa.muted', '1'));
});

test('home: featured cards show real, credited photos', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const featured = page.getByRole('region', { name: 'Featured cards' });
  await expect(featured).toContainText('Official EA SPORTS FC 27 ratings');
  const photos = featured.locator('img:visible');
  await expect(photos.first()).toBeVisible();
  await expect.poll(() => photos.evaluateAll((imgs) => imgs.filter((i) => (i as HTMLImageElement).naturalWidth > 0).length)).toBeGreaterThanOrEqual(4);
  await page.waitForTimeout(1200); // let the fan-in animation settle
  await noOverflow(page);
  await shot(page, 'home', info.project.name);
  expect(errors).toEqual([]);
});

test('football auction: official FC 27 card with photo, stadium theme', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter Football Auction', exact: true }).click();
  await shot(page, 'setup-mode', info.project.name);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('radio', { name: '4', exact: true }).click();
  for (const [i, n] of ['Saqib', 'Rahul', 'Aman', 'Priya'].entries()) await page.getByRole('textbox', { name: `Participant ${i + 1} name`, exact: true }).fill(n);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('radio', { name: '30s', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('radio', { name: /^FC 27 Official \(\d+\)$/ })).toHaveAttribute('aria-checked', 'true'); // FC 27 is the default
  await shot(page, 'setup-cards', info.project.name);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Start the auction' }).click();
  const region = page.getByRole('region', { name: 'Bidding', exact: true });
  await expect(region.getByRole('timer')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1200); // 30 s timer: plenty of time, and the console stays visible
  await noOverflow(page);
  await shot(page, 'football-auction', info.project.name);
  expect(errors).toEqual([]);
});

test('card detail credits the photographer and links the official EA rating', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Photo credits/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('player photos come from Wikimedia Commons');
  await dialog.getByLabel('Search credits').fill('Mbapp');
  await expect(dialog.getByText('Kylian Mbappé')).toBeVisible();
  await expect(dialog.getByRole('link', { name: /CC/ }).first()).toHaveAttribute('href', /commons\.wikimedia\.org/);
  await page.keyboard.press('Escape');

  // A featured official card opens its detail view with both credits.
  await page.getByRole('region', { name: 'Featured cards' }).locator('.uc:visible').first().scrollIntoViewIfNeeded();
  await toAuction(page, 'football');
  await page.getByRole('region', { name: 'Card on auction' }).getByRole('button', { name: /overall/ }).click();
  const detail = page.getByRole('dialog');
  await expect(detail).toContainText(/Photo by .+ via Wikimedia Commons|generated placeholder/);
  // The shuffled first lot is a Gold player (EA ratings page) or an Icon (FUT.GG item page); each links to its own source.
  const source = detail.getByRole('link', { name: /Open (EA|FUT\.GG) source/ });
  await expect(source).toBeVisible();
  if (/FUT\.GG/.test(await source.innerText())) {
    await expect(detail).toContainText('In-game FC 27 Base Icon values as listed by FUT.GG');
    await expect(source).toHaveAttribute('href', /^https:\/\/www\.fut\.gg\/players\/\d+-[a-z0-9-]+\/27-\d+\/$/);
  } else {
    await expect(source).toHaveAttribute('href', /^https:\/\/www\.ea\.com\/games\/ea-sports-fc\/ratings\/player-ratings\//);
  }
});

test('heroes auction: original emblem art, cinematic theme', async ({ page }, info) => {
  await toAuction(page, 'heroes');
  await page.waitForTimeout(1200); // 30 s timer: plenty of time, and the console stays visible
  const stage = page.getByRole('region', { name: 'Card on auction' });
  await expect(stage.locator('.uc-emblem svg')).toBeVisible();
  await expect(stage.locator('img')).toHaveCount(0); // heroes never use photos
  await noOverflow(page);
  await shot(page, 'heroes-auction', info.project.name);
});

test('results: podium, awards and lineups', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Legends Auction — Friends Championship/ }).click();
  await expect(page.getByRole('tab', { name: 'Final lineups' })).toBeVisible();
  await page.waitForTimeout(6500); // confetti fades
  await noOverflow(page);
  await shot(page, 'results', info.project.name);
});
