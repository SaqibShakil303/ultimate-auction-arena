// In-depth online multiplayer tests: several real browser clients against the production server.

import { expect, test, type Browser, type BrowserContext, type Page, type WebSocketRoute } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Mode = 'football' | 'heroes';
const mute = (page: Page) => page.addInitScript(() => localStorage.setItem('uaa.muted', '1'));
const placeBid = (page: Page) => page.getByRole('button', { name: /^Place bid/ });
const lineupsTab = (page: Page) => page.getByRole('tab', { name: 'Final lineups' });
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

/** Host walks the wizard and lands in a fresh lobby. `rules` runs on the Match rules step. */
async function createRoom(page: Page, mode: Mode, name: string, rules?: (p: Page) => Promise<void>, origin = ''): Promise<string> {
  await mute(page);
  await page.goto(`${origin}/`);
  await page.getByRole('button', { name: mode === 'football' ? 'Enter Football Auction' : 'Assemble Your Heroes', exact: true }).click();
  await page.getByRole('button', { name: /Online Multiplayer Friends/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByPlaceholder('e.g. Saqib', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Match rules' })).toBeVisible();
  if (rules) await rules(page);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Create private room' }).click();
  await expect(page.getByRole('heading', { name: /lobby$/i })).toBeVisible();
  const code = (await page.getByTitle('Copy code', { exact: true }).innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{5}$/);
  return code;
}

async function joinRoom(page: Page, code: string, name: string, origin = '') {
  await mute(page);
  await page.goto(`${origin}/?room=${code}`);
  await expect(page.getByLabel('Invite code')).toHaveValue(code);
  await page.getByPlaceholder('e.g. Priya').fill(name);
  await page.getByRole('button', { name: 'Join room', exact: true }).click();
}

async function guest(browser: Browser, baseURL: string | undefined, code: string, name: string, opts: Parameters<Browser['newContext']>[0] = {}) {
  const ctx = await browser.newContext({ baseURL, reducedMotion: 'reduce', ...opts });
  const page = await ctx.newPage();
  await joinRoom(page, code, name);
  await expect(page.getByRole('heading', { name: /lobby$/i })).toBeVisible();
  return { ctx, page };
}

const ready = (page: Page) => page.getByRole('button', { name: 'I’m ready', exact: true }).click();
const start = async (host: Page) => {
  await expect(host.getByRole('button', { name: 'Start the auction' })).toBeEnabled();
  await host.getByRole('button', { name: 'Start the auction' }).click();
};
const timerSecs = async (page: Page) => Number(((await page.getByRole('timer').first().getAttribute('aria-label')) || '').split(' ')[0]);
const quick = async (p: Page) => { await p.getByRole('radio', { name: '10s', exact: true }).click(); };

test.describe('online multiplayer in depth', () => {
  test('three players play a whole Heroes match to a natural finish, then rematch', async ({ browser, page: host, baseURL }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    host.on('pageerror', (e) => errors.push(`host: ${e.message}`));
    const code = await createRoom(host, 'heroes', 'Asha', async (p) => {
      await quick(p);
      await p.getByRole('button', { name: 'Decrease Heroes per team' }).click();
      await p.getByRole('button', { name: 'Decrease Heroes per team' }).click();
    });
    const a = await guest(browser, baseURL, code, 'Bilal');
    const b = await guest(browser, baseURL, code, 'Chen');
    const pages = [host, a.page, b.page];
    a.page.on('pageerror', (e) => errors.push(`guest: ${e.message}`));
    try {
      await expect(host.getByRole('button', { name: 'Start the auction' })).toBeDisabled(); // nobody is ready yet
      await expect(a.page.getByRole('button', { name: 'Start the auction' })).toHaveCount(0); // guests cannot start
      await ready(a.page);
      await ready(b.page);
      await start(host);
      for (const p of pages) await expect(placeBid(p)).toBeEnabled({ timeout: 15_000 });

      // The same countdown everywhere (authoritative deadline, latency-corrected clock).
      const secs = await Promise.all(pages.map(timerSecs));
      expect(Math.max(...secs) - Math.min(...secs)).toBeLessThanOrEqual(1);

      // Everyone sees an outbid instantly, and the leader cannot raise their own bid.
      await placeBid(a.page).click();
      for (const p of pages) await expect(p.getByText('Bilal leads')).toBeVisible();
      await expect(a.page.getByRole('button', { name: /^You hold the highest bid/ })).toBeDisabled();
      await placeBid(b.page).click();
      for (const p of pages) await expect(p.getByText('Chen leads')).toBeVisible();
      await expect(placeBid(a.page)).toBeEnabled(); // Bilal may bid again now

      let turn = 0;
      let sales = 0;
      while (!(await lineupsTab(host).isVisible())) {
        let bidder: Page | null = null;
        for (let i = 0; i < pages.length; i++) {
          const p = pages[(turn + i) % pages.length];
          if (await placeBid(p).isEnabled().catch(() => false)) { bidder = p; break; }
        }
        if (!bidder) { await host.waitForTimeout(200); continue; }
        await placeBid(bidder).click().catch(() => undefined);
        for (const p of pages) {
          if (p === bidder) continue;
          const pass = p.getByRole('button', { name: 'Pass (P)' });
          if (await pass.isEnabled().catch(() => false)) await pass.click().catch(() => undefined);
        }
        turn++;
        // Wait for the hammer, then for the next lot (or the results screen).
        await expect(host.getByText(/^(Sold!|Unsold)$/).first().or(lineupsTab(host))).toBeVisible({ timeout: 20_000 });
        sales++;
        await expect(placeBid(host).or(lineupsTab(host)).or(host.getByRole('button', { name: /^You hold/ }))).toBeVisible({ timeout: 20_000 });
        expect(sales).toBeLessThan(40);
      }

      for (const p of pages) await expect(lineupsTab(p)).toBeVisible({ timeout: 15_000 });
      for (const p of pages) await expect(p.getByText('Every squad is complete')).toBeVisible();
      for (const p of pages) await expect(p.getByText(/Incomplete squad/)).toHaveCount(0);
      // Identical champion and awards on every device.
      const champion = await host.locator('h1').innerText();
      const awards = await host.locator('section', { has: host.getByRole('heading', { name: 'Auction awards' }) }).innerText();
      for (const p of [a.page, b.page]) {
        expect(await p.locator('h1').innerText()).toBe(champion);
        expect(await p.locator('section', { has: p.getByRole('heading', { name: 'Auction awards' }) }).innerText()).toBe(awards);
      }
      await expect(a.page.getByRole('button', { name: 'Rematch with same players' })).toBeDisabled(); // host only
      await noOverflow(host);

      // Rematch: everyone returns to the lobby; guests must ready up again.
      await host.getByRole('button', { name: 'Rematch with same players' }).click();
      for (const p of pages) await expect(p.getByRole('heading', { name: /lobby$/i })).toBeVisible();
      await expect(host.getByRole('button', { name: 'Start the auction' })).toBeDisabled();

      // The host removes a player before play begins.
      await host.getByRole('button', { name: 'Remove Chen' }).click();
      await expect(b.page.getByText('The host removed you from the room.')).toBeVisible();
      await expect(host.getByText('2/8')).toBeVisible();
      await ready(a.page);
      await start(host);
      await expect(placeBid(a.page)).toBeEnabled({ timeout: 15_000 });
      expect(errors).toEqual([]);
    } finally {
      await a.ctx.close();
      await b.ctx.close();
    }
  });

  test('lobby rules: bad codes, duplicate names, a second tab as a second player, late joiners', async ({ browser, page: host, context, baseURL }) => {
    const code = await createRoom(host, 'football', 'Divya', quick);

    // Unknown room code.
    const stray = await browser.newContext({ baseURL });
    const lost = await stray.newPage();
    await joinRoom(lost, code === 'ZZZZZ' ? 'YYYYY' : 'ZZZZZ', 'Nobody');
    await expect(lost.getByText('Room not found. Check the invite code.')).toBeVisible();
    await lost.getByRole('button', { name: 'Back to home' }).click();
    await expect(lost.getByRole('heading', { name: 'Ultimate Auction Arena' })).toBeVisible();

    // Duplicate name (case-insensitive).
    await joinRoom(lost, code, 'divya');
    await expect(lost.getByText('That name is already taken in this room.')).toBeVisible();
    await stray.close();

    // A second tab in the SAME browser profile is a separate player, not a hijack of the host seat.
    const tab = await context.newPage();
    await joinRoom(tab, code, 'Esha');
    await expect(tab.getByRole('heading', { name: /lobby$/i })).toBeVisible();
    await expect(host.getByText('2/8')).toBeVisible();
    await expect(host.getByRole('button', { name: 'Start the auction' })).toBeDisabled();
    await expect(host.getByText('Waiting for: Esha')).toBeVisible();
    await ready(tab);
    // Refreshing a tab keeps that tab's own seat.
    await tab.reload();
    await expect(tab.getByRole('heading', { name: /lobby$/i })).toBeVisible();
    await expect(host.getByText('2/8')).toBeVisible();
    await host.reload();
    await expect(host.getByRole('button', { name: 'Start the auction' })).toBeEnabled();
    await start(host);
    await expect(placeBid(tab)).toBeEnabled({ timeout: 15_000 });

    // Too late to join once the auction is running.
    const lateCtx = await browser.newContext({ baseURL });
    const late = await lateCtx.newPage();
    await joinRoom(late, code, 'Farid');
    await expect(late.getByText(/This match has already started/)).toBeVisible();
    await lateCtx.close();
    await tab.close();
  });

  test('a dropped connection shows as offline, auto-reconnects and keeps the squad and budget', async ({ browser, page: host, baseURL }) => {
    test.setTimeout(90_000);
    const code = await createRoom(host, 'football', 'Gita', async (p) => { await p.getByRole('radio', { name: '30s', exact: true }).click(); });
    const ctx = await browser.newContext({ baseURL, reducedMotion: 'reduce' });
    const g = await ctx.newPage();
    // Route the guest's game socket through the test so the "network" can be cut on demand.
    let blocked = false;
    const live: { page: WebSocketRoute; server: WebSocketRoute }[] = [];
    await g.routeWebSocket(/\/ws$/, (ws) => {
      if (blocked) { void ws.close(); return; }
      const server = ws.connectToServer();
      live.push({ page: ws, server });
    });
    try {
      await joinRoom(g, code, 'Hari');
      await ready(g);
      await start(host);
      await placeBid(g).click();
      await expect(host.getByText('Hari leads')).toBeVisible();
      await host.getByRole('button', { name: 'Match controls', exact: true }).click();
      await host.getByRole('button', { name: 'Hammer current card' }).count(); // online has no hammer
      await host.keyboard.press('Escape');

      // Cut the guest's connection and keep it down.
      blocked = true;
      for (const s of live.splice(0)) { void s.server.close(); void s.page.close(); }
      await expect(g.getByText('Reconnecting…')).toBeVisible({ timeout: 10_000 });
      await expect(host.getByLabel('Disconnected')).toBeVisible({ timeout: 10_000 });
      // Actions are refused locally while offline rather than silently lost.
      // The auction carries on for everyone else.
      await expect(host.getByText('Hari leads')).toBeVisible();

      // Network returns: the client reconnects by itself and is the same player.
      blocked = false;
      await expect(g.getByText('Reconnecting…')).toHaveCount(0, { timeout: 15_000 });
      await expect(host.getByLabel('Disconnected')).toHaveCount(0, { timeout: 15_000 });
      await expect(g.getByRole('button', { name: /^You hold the highest bid/ })).toBeVisible();
      await expect(g.getByText('You', { exact: true })).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('pause and resume are host-only and mirrored on every client', async ({ browser, page: host, baseURL }) => {
    const code = await createRoom(host, 'heroes', 'Indu', quick);
    const g = await guest(browser, baseURL, code, 'Jay');
    try {
      await ready(g.page);
      await start(host);
      await expect(placeBid(g.page)).toBeEnabled({ timeout: 15_000 });
      await expect(g.page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
      await host.getByRole('button', { name: 'Pause', exact: true }).click();
      await expect(g.page.getByText('Auction paused')).toBeVisible();
      await expect(g.page.getByText('The host has paused the auction.')).toBeVisible();
      const frozen = await timerSecs(host);
      await host.waitForTimeout(2500);
      expect(await timerSecs(host)).toBe(frozen); // the clock really is frozen
      await host.getByRole('button', { name: /Resume/ }).last().click();
      await expect(g.page.getByText('Auction paused')).toHaveCount(0);
      await expect(placeBid(g.page)).toBeEnabled();
      await g.page.getByRole('button', { name: 'Match controls', exact: true }).click();
      await expect(g.page.getByText('Only the host can pause or end the auction.')).toBeVisible();
      await expect(g.page.getByRole('button', { name: 'End auction early…' })).toHaveCount(0);
    } finally {
      await g.ctx.close();
    }
  });

  test('Mystery Auction never sends the hidden card to a client before the reveal', async ({ browser, page: host, baseURL }) => {
    const code = await createRoom(host, 'football', 'Kiran', async (p) => {
      await quick(p);
      await p.getByRole('radio', { name: /Mystery/ }).click();
    });
    const ctx = await browser.newContext({ baseURL, reducedMotion: 'reduce' });
    const g = await ctx.newPage();
    const frames: string[] = [];
    g.on('websocket', (ws) => ws.on('framereceived', (f) => { if (typeof f.payload === 'string') frames.push(f.payload); }));
    try {
      await joinRoom(g, code, 'Lata');
      await ready(g);
      await start(host);
      await expect(g.getByRole('heading', { name: 'Who is it?' })).toBeVisible({ timeout: 15_000 });
      await expect(g.getByRole('button', { name: /^Place bid/ })).toHaveCount(0); // no bidding during clues
      await g.getByRole('button', { name: 'Make my secret guess' }).click();
      await g.getByPlaceholder('Search a name…').fill('Pel');
      await g.getByRole('dialog').getByRole('button', { name: 'Pelé', exact: true }).click();
      await expect(g.getByText(/Guess locked in/)).toBeVisible();
      await expect(host.getByText('1/2 guesses locked')).toBeVisible();
      await expect(host.getByText(/Guess locked in/)).toHaveCount(0); // the host cannot see the guest's guess
      await expect(host.getByText('Pelé')).toHaveCount(0);
      await host.getByRole('button', { name: 'Reveal now →' }).click();
      await expect(g.getByText('Revealed:', { exact: false })).toBeVisible();

      const states = frames.map((f) => JSON.parse(f)).filter((m) => m.t === 'state' && m.match);
      const clue = states.filter((m) => m.match.phase === 'clue');
      const revealed = states.find((m) => m.match.phase === 'bidding');
      expect(clue.length).toBeGreaterThan(0);
      expect(revealed.match.lot.cardId).toBeTruthy();
      for (const m of clue) {
        expect(m.match.lot.cardId).toBeNull();
        expect(m.match.nextCardId).toBeNull();
        expect(m.match.queue).toBeUndefined();
        const scrubbed = JSON.stringify({ ...m, match: { ...m.match, sales: [], lot: { ...m.match.lot, myGuess: null } } });
        expect(scrubbed).not.toContain(`"${revealed.match.lot.cardId}"`);
      }
    } finally {
      await ctx.close();
    }
  });

  test('a phone-sized guest can join, bid and read everything without sideways scrolling', async ({ browser, page: host, baseURL }) => {
    const code = await createRoom(host, 'football', 'Mona', quick);
    const g = await guest(browser, baseURL, code, 'Nikhil', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      await noOverflow(g.page);
      await g.page.getByRole('button', { name: 'I’m ready', exact: true }).tap();
      await start(host);
      await expect(placeBid(g.page)).toBeEnabled({ timeout: 15_000 });
      await noOverflow(g.page);
      await placeBid(g.page).tap();
      await expect(host.getByText('Nikhil leads')).toBeVisible();
      await expect(g.page.getByRole('button', { name: /^You hold the highest bid/ })).toBeVisible();
      await noOverflow(g.page);
      await g.page.screenshot({ path: 'artifacts/online-guest-mobile.png', fullPage: true });
    } finally {
      await g.ctx.close();
    }
  });

  test('a player who closes the tab can come back from the home screen, or forget the room', async ({ browser, page: host, baseURL }) => {
    const code = await createRoom(host, 'heroes', 'Omar', quick);
    const g = await guest(browser, baseURL, code, 'Pia');
    try {
      await ready(g.page);
      await start(host);
      await placeBid(g.page).click();
      await expect(host.getByText('Pia leads')).toBeVisible();
      await g.page.close(); // tab closed: the per-tab session is gone, the saved one remains
      const back = await g.ctx.newPage();
      await mute(back);
      await back.goto('/');
      await expect(back.getByText(`Online room ${code}`)).toBeVisible();
      await back.getByRole('button', { name: 'Rejoin', exact: true }).click();
      await expect(back.getByText('You', { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(host.getByLabel('Disconnected')).toHaveCount(0);
      // Forgetting the room removes the shortcut immediately.
      await back.close();
      const again = await g.ctx.newPage();
      await mute(again);
      await again.goto('/');
      await again.getByRole('button', { name: 'Forget', exact: true }).click();
      await expect(again.getByText(`Online room ${code}`)).toHaveCount(0);
    } finally {
      await g.ctx.close();
    }
  });

  test('hosting passes to another player when the host disappears', async ({ browser, page: host, baseURL }) => {
    test.setTimeout(90_000);
    const code = await createRoom(host, 'heroes', 'Qasim', async (p) => { await p.getByRole('radio', { name: '30s', exact: true }).click(); });
    const g = await guest(browser, baseURL, code, 'Rhea');
    try {
      await ready(g.page);
      await start(host);
      await expect(placeBid(g.page)).toBeEnabled({ timeout: 15_000 });
      await expect(g.page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
      await host.context().close();
      await expect(g.page.getByLabel('Disconnected')).toBeVisible({ timeout: 20_000 });
      await expect(g.page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible({ timeout: 45_000 }); // 30 s grace
    } finally {
      await g.ctx.close();
    }
  });
});

// ───────────────────────── production bundle: restart recovery ─────────────────────────

function waitForHealth(url: string, ms = 15_000) {
  const until = Date.now() + ms;
  return new Promise<void>((resolve, reject) => {
    const tryOnce = () => {
      fetch(`${url}/health`).then((r) => (r.ok ? resolve() : Promise.reject(new Error(String(r.status))))).catch(() => {
        if (Date.now() > until) reject(new Error(`server at ${url} did not become healthy`));
        else setTimeout(tryOnce, 150);
      });
    };
    tryOnce();
  });
}

test('the bundled server restores a running match after a restart, paused and intact', async ({ browser }) => {
  test.setTimeout(120_000);
  const port = 8793;
  const origin = `http://localhost:${port}`;
  const dataFile = path.join(os.tmpdir(), `uaa-restart-${Date.now()}.json`);
  const boot = (): ChildProcess => spawn(process.execPath, ['dist-server/index.mjs', '--prod'], {
    env: { ...process.env, SERVER_PORT: String(port), DATA_FILE: dataFile, PORT: '' }, stdio: 'ignore',
  });
  let server = boot();
  const contexts: BrowserContext[] = [];
  try {
    await waitForHealth(origin);
    const hostCtx = await browser.newContext({ reducedMotion: 'reduce' });
    const guestCtx = await browser.newContext({ reducedMotion: 'reduce' });
    contexts.push(hostCtx, guestCtx);
    const host = await hostCtx.newPage();
    const g = await guestCtx.newPage();
    const code = await createRoom(host, 'football', 'Sana', async (p) => { await p.getByRole('radio', { name: '30s', exact: true }).click(); }, origin);
    await joinRoom(g, code, 'Tariq', origin);
    await ready(g);
    await start(host);
    await placeBid(g).click();
    await expect(host.getByText('Tariq leads')).toBeVisible();
    await host.waitForTimeout(700); // let the debounced save reach the disk

    server.kill();
    await expect(host.getByText('Reconnecting…')).toBeVisible({ timeout: 15_000 });
    await expect(g.getByText('Reconnecting…')).toBeVisible({ timeout: 15_000 });

    server = boot();
    await waitForHealth(origin);
    for (const p of [host, g]) {
      await expect(p.getByText('Reconnecting…')).toHaveCount(0, { timeout: 20_000 });
      await expect(p.getByText('Auction paused')).toBeVisible({ timeout: 20_000 }); // timers never ran while the server was down
    }
    await host.getByRole('button', { name: /Resume/ }).last().click();
    await expect(g.getByRole('button', { name: /^You hold the highest bid/ })).toBeVisible();
    await expect(host.getByText('Tariq leads')).toBeVisible();
    await placeBid(host).click();
    await expect(g.getByText('Sana leads')).toBeVisible();
  } finally {
    for (const c of contexts) await c.close();
    server.kill();
    fs.rmSync(dataFile, { force: true });
  }
});
