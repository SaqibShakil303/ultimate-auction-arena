// Host controls in the online lobby: editing settings, switching mode between matches,
// and per-team tactical changes during an online auction.

import { expect, test, type Browser, type Page } from '@playwright/test';

const mute = (page: Page) => page.addInitScript(() => localStorage.setItem('uaa.muted', '1'));
const next = (page: Page) => page.getByRole('button', { name: 'Continue', exact: true }).click();
const placeBid = (page: Page) => page.getByRole('button', { name: /^Place bid/ });

async function createRoom(page: Page, name: string): Promise<string> {
  await mute(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter Football Auction', exact: true }).click();
  await page.getByRole('button', { name: /Online Multiplayer Friends/ }).click();
  await next(page);
  await page.getByPlaceholder('e.g. Saqib', { exact: true }).fill(name);
  await next(page);
  await page.getByRole('radio', { name: '10s', exact: true }).click();
  await next(page);
  await next(page);
  await page.getByRole('button', { name: 'Create private room' }).click();
  await expect(page.getByRole('heading', { name: 'Football Auction lobby' })).toBeVisible();
  return (await page.getByTitle('Copy code', { exact: true }).innerText()).trim();
}

async function join(browser: Browser, baseURL: string | undefined, code: string, name: string) {
  const ctx = await browser.newContext({ baseURL, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await mute(page);
  await page.goto(`/?room=${code}`);
  await page.getByPlaceholder('e.g. Priya').fill(name);
  await page.getByRole('button', { name: 'Join room', exact: true }).click();
  await expect(page.getByRole('heading', { name: /lobby$/i })).toBeVisible();
  return { ctx, page };
}

test('the host edits settings in the lobby and every player sees them; guests cannot', async ({ browser, page: host, baseURL }) => {
  const code = await createRoom(host, 'Hema');
  const g = await join(browser, baseURL, code, 'Irfan');
  try {
    await expect(g.page.getByText('₹10,00,000 each')).toBeVisible();
    await expect(g.page.getByRole('button', { name: 'Edit' })).toHaveCount(0); // host only

    // Change budget and timer.
    await host.getByRole('button', { name: 'Edit' }).click();
    await expect(host.getByRole('heading', { name: 'Choose your arena' })).toBeVisible();
    await next(host);
    await host.getByRole('radio', { name: /20 lakh/ }).click();
    await host.getByRole('radio', { name: '20s', exact: true }).click();
    await next(host);
    await next(host);
    await host.getByRole('button', { name: 'Save settings' }).click();
    await expect(host.getByRole('heading', { name: 'Football Auction lobby' })).toBeVisible();
    for (const p of [host, g.page]) {
      await expect(p.getByText('₹20,00,000 each')).toBeVisible();
      await expect(p.getByText(/^20s ·/)).toBeVisible();
    }

    // Switch the whole room to Heroes before starting.
    await host.getByRole('button', { name: 'Edit' }).click();
    await host.getByRole('button', { name: /Heroes/ }).first().click();
    await next(host); await next(host); await next(host);
    await host.getByRole('button', { name: 'Save settings' }).click();
    for (const p of [host, g.page]) await expect(p.getByRole('heading', { name: 'Heroes Auction lobby' })).toBeVisible();
    await expect(g.page.getByText('5 heroes')).toBeVisible();

    await g.page.getByRole('button', { name: 'I’m ready', exact: true }).click();
    await host.getByRole('button', { name: 'Start the auction' }).click();
    await expect(placeBid(g.page)).toBeEnabled({ timeout: 15_000 });
    // The budget the host chose is the budget everyone actually got.
    await expect(g.page.getByRole('button', { name: /^Place bid/ })).toContainText(/left after this bid/);
    await expect(g.page.getByText(/balance ₹20,00,000/)).toBeVisible();
  } finally {
    await g.ctx.close();
  }
});

test('after a match the host switches game mode and the same room plays again', async ({ browser, page: host, baseURL }) => {
  const code = await createRoom(host, 'Jaya');
  const g = await join(browser, baseURL, code, 'Kunal');
  try {
    await g.page.getByRole('button', { name: 'I’m ready', exact: true }).click();
    await host.getByRole('button', { name: 'Start the auction' }).click();
    await expect(placeBid(g.page)).toBeEnabled({ timeout: 15_000 });
    await host.getByRole('button', { name: 'Match controls', exact: true }).click();
    await host.getByRole('button', { name: 'End auction early…' }).click();
    await host.getByRole('button', { name: 'Yes, end the auction now' }).click();
    for (const p of [host, g.page]) await expect(p.getByRole('tab', { name: 'Final lineups' })).toBeVisible();
    await expect(g.page.getByRole('button', { name: 'Switch game mode' })).toBeDisabled();

    await host.getByRole('button', { name: 'Switch game mode' }).click();
    await expect(g.page.getByRole('heading', { name: /lobby$/i })).toBeVisible(); // guests wait in the lobby
    await expect(host.getByRole('heading', { name: 'Choose your arena' })).toBeVisible();
    await next(host); await next(host); await next(host);
    await host.getByRole('button', { name: 'Save settings' }).click();
    for (const p of [host, g.page]) await expect(p.getByRole('heading', { name: 'Heroes Auction lobby' })).toBeVisible();
    await expect(host.getByRole('button', { name: 'Start the auction' })).toBeDisabled(); // ready-up resets
    await g.page.getByRole('button', { name: 'I’m ready', exact: true }).click();
    await host.getByRole('button', { name: 'Start the auction' }).click();
    await expect(placeBid(g.page)).toBeEnabled({ timeout: 15_000 });
    await expect(host.getByText(/Heroes|Avengers/).first()).toBeVisible();
  } finally {
    await g.ctx.close();
  }
});

test('a player changes their own formation online; they cannot rearrange a rival', async ({ browser, page: host, baseURL }) => {
  const code = await createRoom(host, 'Lalit');
  const g = await join(browser, baseURL, code, 'Mira');
  try {
    await g.page.getByRole('button', { name: 'I’m ready', exact: true }).click();
    await host.getByRole('button', { name: 'Start the auction' }).click();
    await expect(placeBid(g.page)).toBeEnabled({ timeout: 15_000 });
    const teams = g.page.getByRole('complementary', { name: 'Participants' });

    await teams.getByRole('button', { name: /Mira/ }).first().click();
    await g.page.getByLabel('Team formation').selectOption('4-4-2');
    await expect(g.page.getByLabel('Team formation')).toHaveValue('4-4-2');
    await g.page.keyboard.press('Escape');

    // The rival's board is read-only for Mira.
    await teams.getByRole('button', { name: /Lalit/ }).first().click();
    await expect(g.page.getByRole('dialog')).toBeVisible();
    await expect(g.page.getByLabel('Team formation')).toHaveCount(0);
    await g.page.keyboard.press('Escape');

    // The host sees Mira's choice (server-validated and broadcast).
    await host.getByRole('complementary', { name: 'Participants' }).getByRole('button', { name: /Mira/ }).first().click();
    await expect(host.getByRole('dialog')).toContainText('4-4-2');
  } finally {
    await g.ctx.close();
  }
});
