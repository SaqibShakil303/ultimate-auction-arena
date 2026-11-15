import { expect, test } from '@playwright/test';

test('two browser clients create, join, bid, reconnect and receive the same result', async ({ browser, page, baseURL }) => {
  await page.addInitScript(() => localStorage.setItem('uaa.muted', '1'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter Football Auction', exact: true }).click();
  await page.getByRole('button', { name: /Online Multiplayer Friends/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByPlaceholder('e.g. Saqib', { exact: true }).fill('Test Host');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Create private room' }).click();
  await expect(page.getByRole('heading', { name: 'Football Auction lobby' })).toBeVisible();
  const code = (await page.getByTitle('Copy code', { exact: true }).innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{5}$/);
  const guestContext = await browser.newContext({ baseURL, reducedMotion: 'reduce' });
  const guest = await guestContext.newPage();
  try {
    await guest.addInitScript(() => localStorage.setItem('uaa.muted', '1'));
    await guest.goto(`/?room=${code}`);
    await guest.getByPlaceholder('e.g. Priya').fill('Test Guest');
    await guest.getByRole('button', { name: 'Join room', exact: true }).click();
    await guest.getByRole('button', { name: 'I’m ready', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start the auction' })).toBeEnabled();
    await page.getByRole('button', { name: 'Start the auction' }).click();
    await expect(guest.getByRole('button', { name: /^Place bid/ })).toBeEnabled();
    await guest.getByRole('button', { name: /^Place bid/ }).click();
    await expect(page.getByText('Test Guest leads', { exact: false })).toBeVisible();
    await guest.reload();
    await expect(guest.getByRole('button', { name: /^You hold the highest bid/ })).toBeVisible();
    await page.getByRole('button', { name: 'Match controls', exact: true }).click();
    await page.getByRole('button', { name: 'End auction early…' }).click();
    await page.getByRole('button', { name: 'Yes, end the auction now' }).click();
    await expect(page.getByRole('tab', { name: 'Final lineups' })).toBeVisible();
    await expect(guest.getByRole('tab', { name: 'Final lineups' })).toBeVisible();
    const hostRanks = await page.locator('h1').innerText();
    expect(await guest.locator('h1').innerText()).toBe(hostRanks);
    await page.screenshot({ path: 'artifacts/online-result.png', fullPage: true });
  } finally {
    await guestContext.close();
  }
});
