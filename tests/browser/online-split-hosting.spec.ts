// Rehearsal of the real deployment shape: the web client on a static host (Netlify / Vercel)
// and the game server somewhere else, connected only through VITE_WS_URL.
//
//   static site  http://localhost:4179   ← built with VITE_WS_URL=http://localhost:8795
//   game server  http://localhost:8795   ← WebSocket-only, ALLOWED_ORIGINS=http://localhost:4179

import { expect, test, type Page } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const SITE_PORT = 4179;
const GAME_PORT = 8795;
const SITE = `http://localhost:${SITE_PORT}`;
const GAME = `http://localhost:${GAME_PORT}`;
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };

let outDir = '';
let site: http.Server;
let bare: http.Server; // the same kind of static host, serving a build that was never given VITE_WS_URL
const BARE_PORT = 4181;
let game: ChildProcess;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uaa-split-'));
  const build = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], {
    env: { ...process.env, VITE_WS_URL: GAME }, encoding: 'utf8',
  });
  expect(build.status, build.stderr).toBe(0);

  // A plain static host with a single-page-app fallback — what Netlify and Vercel do.
  const staticHost = (root: string) => http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url || '/', SITE).pathname);
    let file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  site = staticHost(outDir);
  await new Promise<void>((r) => site.listen(SITE_PORT, r));
  bare = staticHost(path.resolve('dist'));
  await new Promise<void>((r) => bare.listen(BARE_PORT, r));

  game = spawn(process.execPath, ['dist-server/index.mjs', '--prod'], {
    env: { ...process.env, SERVER_PORT: String(GAME_PORT), PORT: '', SERVE_CLIENT: 'off', PERSIST: 'off', ALLOWED_ORIGINS: SITE }, stdio: 'ignore',
  });
  const until = Date.now() + 15_000;
  for (;;) {
    try { if ((await fetch(`${GAME}/health`)).ok) break; } catch { /* not up yet */ }
    if (Date.now() > until) throw new Error('game server did not start');
    await new Promise((r) => setTimeout(r, 150));
  }
});

test.afterAll(async () => {
  game?.kill();
  await new Promise<void>((r) => (site ? site.close(() => r()) : r()));
  await new Promise<void>((r) => (bare ? bare.close(() => r()) : r()));
  if (outDir) fs.rmSync(outDir, { recursive: true, force: true });
});

async function hostRoom(page: Page, origin: string, name: string) {
  await page.addInitScript(() => localStorage.setItem('uaa.muted', '1'));
  await page.goto(`${origin}/`);
  await page.getByRole('button', { name: 'Enter Football Auction', exact: true }).click();
  await page.getByRole('button', { name: /Online Multiplayer Friends/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByPlaceholder('e.g. Saqib', { exact: true }).fill(name);
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Create private room' }).click();
}

test('static site + separate game server: create, invite link, join and bid', async ({ browser }) => {
  test.setTimeout(90_000);
  const hostCtx = await browser.newContext({ reducedMotion: 'reduce' });
  const guestCtx = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    const host = await hostCtx.newPage();
    const sockets: string[] = [];
    host.on('websocket', (ws) => sockets.push(ws.url()));
    await hostRoom(host, SITE, 'Uma');
    await expect(host.getByRole('heading', { name: /lobby$/i })).toBeVisible();
    expect(sockets).toEqual([`ws://localhost:${GAME_PORT}/ws`]); // the client found the remote game server

    // The invite link points at the static site and survives the SPA fallback.
    const link = (await host.getByText(new RegExp(`${SITE}/\\?room=[A-Z0-9]{5}`)).innerText()).trim();
    const guest = await guestCtx.newPage();
    await guest.addInitScript(() => localStorage.setItem('uaa.muted', '1'));
    await guest.goto(link);
    await guest.getByPlaceholder('e.g. Priya').fill('Vik');
    await guest.getByRole('button', { name: 'Join room', exact: true }).click();
    await guest.getByRole('button', { name: 'I’m ready', exact: true }).click();
    await host.getByRole('button', { name: 'Start the auction' }).click();
    await guest.getByRole('button', { name: /^Place bid/ }).click();
    await expect(host.getByText('Vik leads')).toBeVisible();
    await host.getByRole('button', { name: /^Place bid/ }).click();
    await expect(guest.getByText('Uma leads')).toBeVisible();

    // A refresh on the static host restores the seat.
    await guest.reload();
    await expect(guest.getByText('Uma leads')).toBeVisible();

    // The health endpoint is reachable cross-origin (used to wake a sleeping free-tier server).
    const health = await host.evaluate((url) => fetch(`${url}/health`).then((r) => r.json()), GAME);
    expect(health).toMatchObject({ ok: true, rooms: 1 });
    // The game server itself serves no web page in this mode.
    expect(await (await fetch(GAME)).text()).toContain('real-time server is running');
  } finally {
    await hostCtx.close();
    await guestCtx.close();
  }
});

test('a site that is not on the allow-list cannot use the game server', async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    const page = await ctx.newPage();
    await hostRoom(page, `http://127.0.0.1:${SITE_PORT}`, 'Intruder'); // same files, different origin
    await expect(page.getByRole('heading', { name: 'Connection problem' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/refused the connection from this site/)).toBeVisible();
    await page.getByRole('button', { name: 'Back to home' }).click();
    await expect(page.getByRole('heading', { name: 'Ultimate Auction Arena' })).toBeVisible(); // local play still available
  } finally {
    await ctx.close();
  }
});

test('a static site with no game server says so at once and still offers local play', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    const page = await ctx.newPage();
    const origin = `http://localhost:${BARE_PORT}`;
    const t0 = Date.now();
    await hostRoom(page, origin, 'Solo');
    await expect(page.getByText(/Online rooms are not available on this site yet/)).toBeVisible({ timeout: 10_000 });
    expect(Date.now() - t0).toBeLessThan(15_000); // no minute-long wait for a server that does not exist
    await page.getByRole('button', { name: 'Back to home' }).click();

    // Local pass-and-play needs no server at all.
    await page.getByRole('button', { name: 'Assemble Your Heroes', exact: true }).click();
    await page.getByRole('button', { name: /Local Pass-and-Play/ }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('radio', { name: '2', exact: true }).click();
    await page.getByRole('textbox', { name: 'Participant 1 name', exact: true }).fill('Ann');
    await page.getByRole('textbox', { name: 'Participant 2 name', exact: true }).fill('Bo');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Start the auction' }).click();
    await expect(page.getByRole('region', { name: 'Bidding', exact: true })).toBeVisible();
  } finally {
    await ctx.close();
  }
});
