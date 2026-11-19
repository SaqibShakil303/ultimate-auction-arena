import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('uaa.muted', '1'));
});

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
async function register(page: Page, mode: 'football' | 'heroes') {
  await page.goto('/');
  await page.getByRole('button', { name: mode === 'football' ? 'Enter Football Auction' : 'Assemble Your Heroes', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('radio', { name: '2', exact: true }).click();
  await page.getByRole('textbox', { name: 'Participant 1 name', exact: true }).fill('Alice');
  await page.getByRole('textbox', { name: 'Participant 2 name', exact: true }).fill('Bob');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

test('home, five friends demo, comparisons, tactics and squad download', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ultimate Auction Arena' })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: `artifacts/home-${info.project.name}.png`, fullPage: true });
  for (const file of ['arena-football.jpg', 'arena-heroes.jpg']) expect((await page.request.get(`/assets/${file}`)).status()).toBe(200);
  await page.evaluate(() => localStorage.setItem('uaa.local.v1', 'preserve-demo-test'));
  await page.getByRole('button', { name: /Legends Auction — Friends Championship/ }).click();
  await expect(page.getByRole('tab', { name: 'Final lineups' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('uaa.local.v1'))).toBe('preserve-demo-test');
  await page.getByLabel('First comparison team').selectOption({ label: 'Saqib' });
  await page.getByLabel('Second comparison team').selectOption({ label: 'Faizan' });
  await expect(page.getByRole('heading', { name: 'Team Saqib vs Team Faizan' })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: `artifacts/results-${info.project.name}.png`, fullPage: true });
  await page.getByText('Tactics lab · try another arrangement', { exact: true }).click();
  await page.getByLabel('Team formation').selectOption('4-2-3-1');
  await expect(page.getByLabel('Team formation')).toHaveValue('4-2-3-1');
  await noOverflow(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Download .+'s squad$/ }).click();
  expect((await download).suggestedFilename()).toMatch(/-squad\.png$/);
  await page.getByRole('tab', { name: 'Scoring explained' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Scoring explained' })).toContainText('five parts');
  expect(errors).toEqual([]);
});

test('official mode stays empty without verified data and imports retain missing fields', async ({ page }) => {
  await register(page, 'football');
  await page.getByRole('radio', { name: '4-2-3-1', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('radio', { name: 'FC 26 Official (0)', exact: true }).click();
  await page.getByRole('button', { name: /Manage cards|Card pool administration|Edit.*import/i }).click();
  await page.getByText('Paste a JSON or CSV dataset', { exact: true }).click();
  await page.locator('textarea').fill(JSON.stringify([{ name: 'Missing Attributes', ratingMode: 'fc26', pos: 'ST', overall: 90, verificationStatus: 'verified' }]));
  await page.getByRole('button', { name: 'Import pasted cards' }).click();
  await expect(page.getByRole('dialog')).toContainText('Unverified cards cannot enter official auctions');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start the auction' })).toBeDisabled();
  await expect(page.getByText(/The official card pool is empty/)).toBeVisible();
  await noOverflow(page);
});

for (const mode of ['football', 'heroes'] as const) {
  test(`${mode} mystery clues, secret guess and reveal`, async ({ page }) => {
    await register(page, mode);
    await page.getByRole('radio', { name: /Mystery/, exact: false }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Start the auction' }).click();
    await expect(page.getByRole('heading', { name: 'Who is it?' })).toBeVisible();
    const console = page.getByRole('region', { name: 'Bidding', exact: true });
    await console.getByRole('button', { name: 'Alice', exact: true }).click();
    await page.getByPlaceholder('Search a name…').fill(mode === 'football' ? 'Messi' : 'Thor');
    await page.getByRole('dialog').getByRole('button', { name: mode === 'football' ? 'Lionel Messi' : 'Thor', exact: true }).click();
    await expect(console).toContainText('1/2 guesses locked');
    await console.getByRole('button', { name: 'Reveal now →' }).click();
    await expect(page.getByRole('heading', { name: 'Who is it?' })).toHaveCount(0);
    await expect(page.getByText('Revealed:', { exact: false })).toBeVisible();
    await noOverflow(page);
  });

  test(`${mode} registration, bidding, budgets, refresh and result`, async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
    await register(page, mode);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Start the auction' }).click();
    await expect(page.getByRole('region', { name: 'Bidding', exact: true })).toBeVisible();
    if ((page.viewportSize()?.width ?? 0) >= 640) await page.getByRole('button', { name: 'Toggle bidding layout', exact: true }).click();
    const bid = page.getByRole('button', { name: /^Place bid/ });
    await expect(bid).toBeEnabled();
    await bid.click();
    await expect(page.getByRole('button', { name: /^You hold the highest bid/ })).toBeVisible();
    const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('uaa.local.v1')!).state);
    expect(pending.config.squadSize).toBe(mode === 'football' ? 16 : 5); // football: 11 starters + 5 substitutes
    const amount = pending.lot.bid;
    await page.getByRole('button', { name: 'Hammer — sell now' }).click();
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('uaa.local.v1')!).state.participants[0].squad.length)).toBe(1);
    const sold = await page.evaluate(() => JSON.parse(localStorage.getItem('uaa.local.v1')!).state);
    expect(sold.participants[0].budget).toBe(1_000_000 - amount);
    expect(sold.participants[0].squad[0].price).toBe(amount);
    await page.reload();
    await expect(page.getByLabel('Resume', { exact: true })).toBeVisible();
    await page.getByLabel('Resume', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Nobody wants it — skip' })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: `artifacts/${mode}-auction-${info.project.name}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Match controls', exact: true }).click();
    await page.getByRole('button', { name: 'End auction early…' }).click();
    await page.getByRole('button', { name: 'Yes, end the auction now' }).click();
    await expect(page.getByRole('tab', { name: 'Final lineups' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
