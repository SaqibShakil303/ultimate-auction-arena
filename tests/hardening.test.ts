// Deployment hardening: the public-facing HTTP/WebSocket surface must survive hostile or broken input.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import WebSocket from 'ws';
import type { ClientMsg, ServerMsg } from '../shared/types';
import { defaultConfig } from '../shared/engine';
import { originMatcher, startServer, type ServerHandle } from '../server/app';
import { RoomManager } from '../server/rooms';

const settings = () => ({ config: { ...defaultConfig('avengers'), shuffle: false }, custom: { edits: {}, imported: [] } });

function get(port: number, rawPath: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

function socket(port: number, opts: { origin?: string } = {}) {
  return new Promise<{ ws: WebSocket; msgs: ServerMsg[]; send: (m: unknown) => void; wait: (pred: (m: ServerMsg) => boolean, ms?: number) => Promise<ServerMsg> }>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, opts.origin ? { origin: opts.origin } : {});
    const msgs: ServerMsg[] = [];
    const waiters: { pred: (m: ServerMsg) => boolean; done: (m: ServerMsg) => void }[] = [];
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      msgs.push(m);
      for (const w of waiters.slice()) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.done(m); }
    });
    const wait = (pred: (m: ServerMsg) => boolean, ms = 4000) =>
      new Promise<ServerMsg>((done, fail) => {
        const hit = msgs.find(pred);
        if (hit) return done(hit);
        const t = setTimeout(() => fail(new Error('timed out waiting for message')), ms);
        waiters.push({ pred, done: (m) => { clearTimeout(t); done(m); } });
      });
    ws.on('open', () => resolve({ ws, msgs, wait, send: (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m)) }));
    ws.on('error', reject);
  });
}

describe('http surface', () => {
  let server: ServerHandle;
  let dir: string;
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uaa-static-'));
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>arena</title>' + 'x'.repeat(2000));
    fs.writeFileSync(path.join(dir, 'assets', 'app-AbCdEf123.js'), 'console.log("hi");'.repeat(200));
    fs.writeFileSync(path.join(os.tmpdir(), 'uaa-secret.txt'), 'top-secret');
    server = await startServer({ port: 0, staticDir: dir });
  });
  afterAll(async () => { await server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  it('answers health checks with CORS so a separately hosted client can wake it', async () => {
    const r = await get(server.port, '/health');
    expect(r.status).toBe(200);
    expect(r.headers['access-control-allow-origin']).toBe('*');
    expect(JSON.parse(r.body.toString())).toMatchObject({ ok: true, rooms: 0 });
  });

  it('survives malformed URLs instead of crashing the process', async () => {
    for (const bad of ['/%E0%A4%A', '/%', '/%zz/asset.js', '/a%00b']) {
      const r = await get(server.port, bad);
      expect([200, 400, 403, 404]).toContain(r.status);
    }
    expect((await get(server.port, '/health')).status).toBe(200);
  });

  it('never serves files outside the web root', async () => {
    for (const attack of ['/../uaa-secret.txt', '/..%2fuaa-secret.txt', '/assets/..%2f..%2fuaa-secret.txt', '/%2e%2e/%2e%2e/uaa-secret.txt', '/..\\uaa-secret.txt']) {
      const r = await get(server.port, attack);
      expect(r.body.toString()).not.toContain('top-secret');
    }
  });

  it('serves the app shell for unknown routes but a real 404 for missing assets', async () => {
    const page = await get(server.port, '/some/deep/link?room=ABCDE');
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.headers['cache-control']).toBe('no-cache');
    const missing = await get(server.port, '/assets/old-chunk-ZZZZZZZZ.js');
    expect(missing.status).toBe(404);
    expect(missing.headers['content-type']).not.toMatch(/html/);
  });

  it('compresses text assets and caches hashed files forever', async () => {
    const plain = await get(server.port, '/assets/app-AbCdEf123.js');
    const gz = await get(server.port, '/assets/app-AbCdEf123.js', { 'accept-encoding': 'gzip, br' });
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(gz.body.length).toBeLessThan(plain.body.length / 4);
    expect(gz.headers['cache-control']).toMatch(/immutable/);
    expect(plain.headers['x-content-type-options']).toBe('nosniff');
    expect((await get(server.port, '/', {}, 'HEAD')).body.length).toBe(0);
    expect((await get(server.port, '/', {}, 'POST')).status).toBe(405);
  });
});

describe('websocket surface', () => {
  let server: ServerHandle;
  beforeAll(async () => { server = await startServer({ port: 0, allowedOrigins: ['https://arena.netlify.app', 'https://*.vercel.app'], maxRooms: 3 }); });
  afterAll(async () => { await server.close(); });

  it('matches allowed origins, including wildcard sub-domains', () => {
    const ok = originMatcher(['https://arena.netlify.app/', 'https://*.vercel.app']);
    expect(ok('https://arena.netlify.app')).toBe(true);
    expect(ok('https://ARENA.netlify.app/')).toBe(true);
    expect(ok('https://my-game-git-main.vercel.app')).toBe(true);
    expect(ok('https://vercel.app')).toBe(false);
    expect(ok('http://my-game.vercel.app')).toBe(false);
    expect(ok('https://evil.example')).toBe(false);
    expect(ok('https://arena.netlify.app.evil.example')).toBe(false);
    expect(ok(undefined)).toBe(true);
    expect(originMatcher([])('https://anything.example')).toBe(true);
    expect(originMatcher(['*'])('https://anything.example')).toBe(true);
  });

  it('refuses sockets from origins that are not on the allow-list', async () => {
    await expect(socket(server.port, { origin: 'https://evil.example' })).rejects.toThrow();
    const good = await socket(server.port, { origin: 'https://preview-123.vercel.app' });
    good.send({ t: 'ping', id: 7 });
    expect(await good.wait((m) => m.t === 'pong')).toMatchObject({ t: 'pong', id: 7 });
    good.ws.close();
  });

  it('ignores garbage frames and unknown messages without dropping the connection', async () => {
    const c = await socket(server.port);
    for (const junk of ['not json', '[]', 'null', '42', '{"t":"nope"}', '{"t":"action","action":{"type":"bid"}}', '{"t":"start"}', JSON.stringify({ t: 'create' })]) c.send(junk);
    c.send({ t: 'ping', id: 1 });
    await c.wait((m) => m.t === 'pong');
    expect(c.ws.readyState).toBe(WebSocket.OPEN);
    expect(c.msgs.filter((m) => m.t === 'error').length).toBeGreaterThan(0);
    c.ws.close();
  });

  it('drops oversized payloads but keeps serving everyone else', async () => {
    const big = await socket(server.port);
    const closed = new Promise<void>((done) => big.ws.on('close', () => done()));
    big.ws.on('error', () => undefined);
    big.send(JSON.stringify({ t: 'create', name: 'x'.repeat(600 * 1024), team: '', settings: settings() }));
    await closed;
    const other = await socket(server.port);
    other.send({ t: 'ping', id: 2 });
    expect(await other.wait((m) => m.t === 'pong')).toBeTruthy();
    other.ws.close();
  });

  it('rate-limits a flooding client without affecting the room', async () => {
    const host = await socket(server.port);
    host.send({ t: 'create', name: 'Host', team: '', settings: settings() });
    const joined = (await host.wait((m) => m.t === 'joined')) as Extract<ServerMsg, { t: 'joined' }>;
    const flooder = await socket(server.port);
    flooder.send({ t: 'join', code: joined.code, name: 'Flood', team: '' });
    await flooder.wait((m) => m.t === 'joined');
    const before = host.msgs.length;
    for (let i = 0; i < 400; i++) flooder.send({ t: 'ready', ready: i % 2 === 0 });
    await new Promise((r) => setTimeout(r, 400));
    expect(host.msgs.length - before).toBeLessThanOrEqual(45); // at most the per-second budget got through
    host.send({ t: 'ping', id: 3 });
    expect(await host.wait((m) => m.t === 'pong' && m.id === 3)).toBeTruthy();
    host.ws.close();
    flooder.ws.close();
  });

  it('caps the number of rooms and says so politely', async () => {
    const socks = [];
    let busy: ServerMsg | undefined;
    for (let i = 0; i < 5; i++) {
      const c = await socket(server.port);
      socks.push(c);
      c.send({ t: 'create', name: `Host${i}`, team: '', settings: settings() } satisfies ClientMsg);
      const m = await c.wait((x) => x.t === 'joined' || x.t === 'error');
      if (m.t === 'error') { busy = m; break; }
    }
    expect(busy).toMatchObject({ t: 'error', code: 'busy' });
    socks.forEach((c) => c.ws.close());
  });
});

describe('room manager resilience', () => {
  it('keeps ticking other rooms when one room throws', () => {
    const clock = { t: 1_000_000 };
    const mgr = new RoomManager({ now: () => clock.t });
    const mk = (id: string, name: string) => {
      const msgs: ServerMsg[] = [];
      mgr.connect({ id, send: (m) => msgs.push(m) });
      return { msgs, send: (m: ClientMsg) => mgr.handle(id, m), last: () => [...msgs].reverse().find((m) => m.t === 'state') as Extract<ServerMsg, { t: 'state' }>, name };
    };
    const rooms = [0, 1].map((i) => {
      const host = mk(`h${i}`, 'Host');
      host.send({ t: 'create', name: 'Host', team: '', settings: settings() });
      const code = (host.msgs.find((m) => m.t === 'joined') as Extract<ServerMsg, { t: 'joined' }>).code;
      const guest = mk(`g${i}`, 'Guest');
      guest.send({ t: 'join', code, name: 'Guest', team: '' });
      guest.send({ t: 'ready', ready: true });
      host.send({ t: 'start' });
      return { host, code };
    });
    // Corrupt the first room so its tick throws.
    (mgr.rooms.get(rooms[0].code)!.match as unknown as { participants: null }).participants = null;
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (...a) => errors.push(a);
    try {
      clock.t += 5000;
      expect(() => mgr.tickAll()).not.toThrow();
    } finally {
      console.error = orig;
    }
    expect(errors.length).toBeGreaterThan(0);
    expect(rooms[1].host.last().match!.phase).toBe('bidding'); // the healthy room still advanced
  });

  it('refuses stale tokens after a restart without persistence', () => {
    const a = new RoomManager();
    const msgs: ServerMsg[] = [];
    a.connect({ id: 'c1', send: (m) => msgs.push(m) });
    a.handle('c1', { t: 'create', name: 'Host', team: '', settings: settings() });
    const joined = msgs.find((m) => m.t === 'joined') as Extract<ServerMsg, { t: 'joined' }>;
    const b = new RoomManager();
    const after: ServerMsg[] = [];
    b.connect({ id: 'c2', send: (m) => after.push(m) });
    b.handle('c2', { t: 'rejoin', code: joined.code, token: joined.token });
    expect(after).toEqual([{ t: 'error', code: 'no-session', message: expect.any(String) }]);
  });
});
