// In-depth local pass-and-play tests, run on a desktop and a phone-sized viewport.

import { expect, test, type Page } from '@playwright/test';

type Mode = 'football' | 'heroes';
interface Saved {
  phase: string; round: number; finishReason: string;
  config: { budget: number; squadSize: number; rules: string; mode: string; slots: Record<string, number>; maxPerClass: number };
  lot: { leader: string | null; bid: number; opening: number; cardId: string } | null;
  participants: { id: string; name: string; budget: number; squad: { cardId: string; price: number }[] }[];
  cards: Record<string, { line?: string; cls?: string; name: string }>;
  sales: { type: string; cardId: string; pid: string | null; price: number }[];
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('uaa.muted', '1'));
});

const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('uaa.local.v1')!).state) as Promise<Saved>;
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 640;
const next = (page: Page) => page.getByRole('button', { name: 'Continue', exact: true }).click();

async function toPlayers(page: Page, mode: Mode, names: string[]) {
  await page.goto('/');
  await page.getByRole('button', { name: mode === 'football' ? 'Enter Football Auction' : 'Assemble Your Heroes', exact: true }).click();
  await next(page);
  await page.getByRole('radio', { name: String(names.length), exact: true }).click();
  for (let i = 0; i < names.length; i++) await page.getByRole('textbox', { name: `Participant ${i + 1} name`, exact: true }).fill(names[i]);
}

async function startLocal(page: Page, mode: Mode, names: string[], rules?: (p: Page) => Promise<void>) {
  await toPlayers(page, mode, names);
  await next(page);
  await expect(page.getByRole('heading', { name: 'Match rules' })).toBeVisible();
  await page.getByRole('radio', { name: '10s', exact: true }).click();
  if (rules) await rules(page);
  await next(page);
  await next(page);
  await page.getByRole('button', { name: 'Start the auction' }).click();
  await expect(page.getByRole('region', { name: 'Bidding', exact: true })).toBeVisible();
  await expect.poll(async () => (await saved(page)).phase, { timeout: 15_000 }).toBe('bidding'); // the short "Get ready" intro is over
}

/** One player bids for the card on the block through the real controls. Returns false if nobody could. */
async function bidAs(page: Page, index: number, name: string) {
  if (isPhone(page)) {
    await page.getByRole('radiogroup', { name: 'Who is bidding' }).getByRole('radio', { name, exact: true }).click();
    const b = page.getByRole('button', { name: /^Place bid/ });
    if (await b.isEnabled().catch(() => false)) await b.click();
  } else {
    await page.keyboard.press(String(index + 1)); // desktop shortcut: keys 1–8 bid instantly for that player
  }
}

/** Plays the whole auction through the UI until the engine ends it by itself. */
async function playToTheEnd(page: Page, names: string[]) {
  let turn = 0;
  let guard = 0;
  for (;;) {
    expect(guard++).toBeLessThan(900);
    const s = await saved(page);
    if (s.phase === 'finished') return s;
    if (s.phase !== 'bidding' || !s.lot) { await page.waitForTimeout(150); continue; }
    if (s.lot.leader) {
      await page.getByRole('button', { name: 'Hammer — sell now' }).click().catch(() => undefined);
      await page.waitForTimeout(120);
      continue;
    }
    const round = s.round;
    for (let i = 0; i < names.length; i++) {
      const who = (turn + i) % names.length;
      await bidAs(page, who, names[who]);
      await page.waitForTimeout(80);
      const after = await saved(page);
      if (after.round !== round || after.phase !== 'bidding' || after.lot?.leader) break;
    }
    turn++;
    const after = await saved(page);
    if (after.round === round && after.phase === 'bidding' && !after.lot?.leader) {
      await page.getByRole('button', { name: 'Nobody wants it — skip' }).click().catch(() => undefined);
    }
  }
}

function assertSound(s: Saved) {
  const owned = new Set<string>();
  for (const p of s.participants) {
    expect(p.budget).toBeGreaterThanOrEqual(0);
    expect(p.budget + p.squad.reduce((a, o) => a + o.price, 0)).toBe(s.config.budget);
    for (const o of p.squad) { expect(owned.has(o.cardId)).toBe(false); owned.add(o.cardId); }
  }
  expect(s.sales.filter((x) => x.type === 'sold').length).toBe(owned.size);
}

test('a full strict Football match ends by itself with two complete, legal squads (XI + 5 subs)', async ({ page }, info) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const names = ['Alice', 'Bob'];
  await startLocal(page, 'football', names);

  // Squad board works mid-auction.
  await bidAs(page, 0, 'Alice');
  await page.getByRole('button', { name: 'Hammer — sell now' }).click();
  await expect.poll(async () => (await saved(page)).participants[0].squad.length).toBe(1);
  if (isPhone(page)) await page.getByText('Teams', { exact: false }).first().click();
  await page.getByRole('complementary', { name: 'Participants' }).getByRole('button', { name: /Alice/ }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Team score');
  await noOverflow(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const s = await playToTheEnd(page, names);
  expect(s.finishReason).toBe('Every squad is complete');
  assertSound(s);
  for (const p of s.participants) {
    expect(p.squad).toHaveLength(16);
    // Strict rules: every formation place is filled, the five extras are the bench, at most one substitute keeper.
    let extra = 0;
    for (const line of ['GK', 'DEF', 'MID', 'ATT']) {
      const have = p.squad.filter((o) => s.cards[o.cardId].line === line).length;
      expect(have).toBeGreaterThanOrEqual(s.config.slots[line]);
      extra += have - s.config.slots[line];
    }
    expect(extra).toBe(5);
    expect(p.squad.filter((o) => s.cards[o.cardId].line === 'GK').length).toBeLessThanOrEqual(s.config.slots.GK + 1);
  }
  await expect(page.getByRole('tab', { name: 'Final lineups' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('tab', { name: 'Final lineups' }).click();
  const bench = page.getByRole('region', { name: 'Substitutes bench' }).first();
  await expect(bench).toBeVisible();
  await expect(bench.locator('[data-slot="bench"]')).toHaveCount(5);
  await expect(bench).toContainText('5/5');
  await expect(page.getByText(/Incomplete squad/)).toHaveCount(0);
  await expect(page.getByText('Every squad is complete')).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: `artifacts/full-football-result-${info.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('a full casual Heroes match with three players ends by itself', async ({ page }) => {
  test.setTimeout(240_000);
  const names = ['Ava', 'Ben', 'Cy'];
  await startLocal(page, 'heroes', names, async (p) => { await p.getByRole('radio', { name: 'Casual', exact: true }).click(); });
  const s = await playToTheEnd(page, names);
  expect(s.finishReason).toBe('Every squad is complete');
  assertSound(s);
  for (const p of s.participants) expect(p.squad).toHaveLength(5);
  await expect(page.getByRole('tab', { name: 'Final lineups' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('tab', { name: 'Exhibition battle' })).toBeVisible();
  await noOverflow(page);
});

test('the auction ends on its own when nobody can afford another card', async ({ page }) => {
  test.setTimeout(120_000);
  const names = ['Rich', 'Poor'];
  await startLocal(page, 'heroes', names, async (p) => {
    await p.getByRole('radio', { name: 'Casual', exact: true }).click();
    await p.getByLabel('Re-auction unsold cards').click(); // off: one pass only
  });
  // Each player blows the entire budget on one card via a custom bid.
  for (let i = 0; i < 2; i++) {
    await expect.poll(async () => (await saved(page)).phase).toBe('bidding');
    if (isPhone(page)) await page.getByRole('radiogroup', { name: 'Who is bidding' }).getByRole('radio', { name: names[i], exact: true }).click();
    await page.getByLabel('Custom bid amount').fill('1000000');
    if (isPhone(page)) await page.getByRole('button', { name: /^Place bid/ }).click();
    else { await page.getByLabel('Custom bid amount').blur(); await page.keyboard.press(String(i + 1)); }
    await expect.poll(async () => (await saved(page)).lot?.bid).toBe(1_000_000);
    await page.getByRole('button', { name: 'Hammer — sell now' }).click();
    await expect.poll(async () => (await saved(page)).participants[i].budget).toBe(0);
  }
  await expect(page.getByRole('tab', { name: 'Final lineups' })).toBeVisible({ timeout: 30_000 });
  const s = await saved(page);
  expect(s.finishReason).toMatch(/afford/);
  expect(s.participants.map((p) => p.squad.length)).toEqual([1, 1]);
  await expect(page.getByText(/Incomplete squad/).first()).toBeVisible();
});

test('setup validates names and budgets before a match can start', async ({ page }) => {
  await toPlayers(page, 'football', ['Sam', 'sam ']);
  await expect(page.getByText('Participant names must be unique.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Participant 2 name', exact: true }).fill('');
  await expect(page.getByText('Every participant needs a name.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Participant 2 name', exact: true }).fill('Tina');
  await page.getByRole('textbox', { name: 'Participant 1 team name', exact: true }).fill('Royal Strikers');
  await next(page);

  // A custom budget rescales opening prices.
  await page.getByLabel('Custom budget').fill('750000');
  // 5% of ₹7,50,000 spread over a 16-player squad (×10/16), rounded to the nearest ₹100.
  await expect(page.getByText(/Opening prices scale with the budget/)).toContainText('₹23,400');
  // The bench is part of the squad size: 11 starters + 5 substitutes by default, adjustable.
  await expect(page.getByText(/11 starters \+ 5 subs/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Decrease Substitutes' }).click();
  await expect(page.getByText(/11 starters \+ 4 subs/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Increase Substitutes' }).click();
  await expect(page.getByText(/11 starters \+ 5 subs/).first()).toBeVisible();
  await next(page);
  await next(page);
  await expect(page.getByText('₹7,50,000 each')).toBeVisible();
  await expect(page.getByText('Sam (Royal Strikers), Tina')).toBeVisible();
  await noOverflow(page);
  await page.getByRole('button', { name: 'Start the auction' }).click();
  await expect.poll(async () => (await saved(page)).participants.map((p) => p.budget)).toEqual([750_000, 750_000]);
});

test('eight players start with identical budgets and all get bid controls', async ({ page }) => {
  const names = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
  await startLocal(page, 'football', names);
  const s = await saved(page);
  expect(s.participants.map((p) => p.budget)).toEqual(Array(8).fill(1_000_000));
  await noOverflow(page);
  if (!isPhone(page)) {
    await page.keyboard.press('8');
    await expect(page.getByText('P8 leads')).toBeVisible();
    await page.keyboard.press('8'); // the leader cannot raise against themselves
    expect((await saved(page)).lot?.leader).toBe('p8');
    await page.keyboard.press('3');
    await expect(page.getByText('P3 leads')).toBeVisible();
  } else {
    await page.getByRole('radiogroup', { name: 'Who is bidding' }).getByRole('radio', { name: 'P8', exact: true }).click();
    await page.getByRole('button', { name: /^Place bid/ }).click();
    await expect(page.getByText('P8 leads')).toBeVisible();
  }
});

test('bid controls explain every refusal and never accept an illegal bid', async ({ page }) => {
  await startLocal(page, 'football', ['Uma', 'Vik']);
  if (!isPhone(page)) await page.getByRole('button', { name: 'Toggle bidding layout', exact: true }).click(); // one-bidder view
  const bid = page.getByRole('button', { name: /^Place bid/ });
  const opening = (await saved(page)).lot!.opening;

  await page.getByLabel('Custom bid amount').fill(String(opening - 1));
  await expect(page.getByRole('button', { name: /Minimum bid is/ })).toBeDisabled();
  await page.getByLabel('Custom bid amount').fill('5000000');
  await expect(page.getByRole('button', { name: /Insufficient funds/ })).toBeDisabled();
  await page.getByLabel('Custom bid amount').fill('990000');
  await expect(page.getByRole('button', { name: /Strict reserve/ })).toBeDisabled(); // must keep money for 10 more slots
  await page.getByLabel('Custom bid amount').fill('');

  await page.getByRole('button', { name: /^\+₹10K/ }).click();
  await expect(bid).toContainText((opening + 10_000).toLocaleString('en-IN'));
  await bid.click();
  expect((await saved(page)).lot).toMatchObject({ leader: 'p1', bid: opening + 10_000 });
  await expect(page.getByRole('button', { name: /^You hold the highest bid/ })).toBeDisabled();

  await page.getByRole('radiogroup', { name: 'Who is bidding' }).getByRole('radio', { name: 'Vik', exact: true }).click();
  await page.getByRole('button', { name: /^Min bid/ }).click();
  await expect(bid).toContainText((opening + 10_000 + 5_000).toLocaleString('en-IN')); // current bid + minimum increment
  await expect(bid).toContainText('left after this bid');

  // Pausing blocks bidding and freezes the clock.
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByText('Auction paused')).toBeVisible();
  const frozen = (await saved(page)).lot;
  await page.waitForTimeout(1500);
  expect((await saved(page)).lot).toEqual(frozen);
  await page.getByRole('button', { name: /Resume/ }).last().click();
  await expect(bid).toBeEnabled();
});

test('rematch, switch mode and play again all lead somewhere sensible', async ({ page }) => {
  await startLocal(page, 'heroes', ['Wren', 'Xan']);
  const end = async () => {
    await page.getByRole('button', { name: 'Match controls', exact: true }).click();
    await page.getByRole('button', { name: 'End auction early…' }).click();
    await page.getByRole('button', { name: 'Yes, end the auction now' }).click();
    await expect(page.getByRole('tab', { name: 'Final lineups' })).toBeVisible();
  };
  await end();
  await page.getByRole('button', { name: 'Rematch with same players' }).click();
  await expect(page.getByRole('region', { name: 'Bidding', exact: true })).toBeVisible();
  const again = await saved(page);
  expect(again.participants.map((p) => p.name)).toEqual(['Wren', 'Xan']);
  expect(again.participants.every((p) => p.budget === 1_000_000 && p.squad.length === 0)).toBe(true);

  await end();
  await page.getByRole('button', { name: 'Switch game mode' }).click();
  await expect(page.getByRole('heading', { name: 'Choose your arena' })).toBeVisible();
  await next(page);
  await expect(page.getByRole('textbox', { name: 'Participant 1 name', exact: true })).toHaveValue('Wren'); // players carried over
  await next(page); await next(page); await next(page);
  await expect(page.getByText('Football Auction', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Start the auction' }).click();
  await expect.poll(async () => (await saved(page)).config.mode).toBe('football');

  await end();
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByRole('heading', { name: 'Choose your arena' })).toBeVisible();
});
