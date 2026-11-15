// HTTP + WebSocket transport around the RoomManager. Also serves the built client from /dist
// so a single process can host the whole game in production. When the client is hosted
// elsewhere (Netlify, Vercel, …) this same process runs as a WebSocket-only game server.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { WebSocketServer, type WebSocket } from 'ws';
import { RoomManager } from './rooms';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.map': 'application/json', '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.map', '.webmanifest']);

export interface ServerOptions {
  port?: number;
  persistPath?: string | null;
  staticDir?: string | null;
  /** Browser origins allowed to open a game socket. Empty = any origin (fine for same-origin hosting and local play). */
  allowedOrigins?: string[];
  maxRooms?: number;
  maxConnections?: number;
}

export interface ServerHandle {
  port: number;
  manager: RoomManager;
  close(): Promise<void>;
}

/** "https://my-game.netlify.app, https://*.vercel.app" → matcher. A leading "*." matches any sub-domain. */
export function originMatcher(list: string[]): (origin: string | undefined) => boolean {
  const rules = list.map((x) => x.trim().replace(/\/+$/, '').toLowerCase()).filter(Boolean);
  if (!rules.length || rules.includes('*')) return () => true;
  return (origin) => {
    if (!origin) return true; // non-browser clients (health checks, tests) send no Origin header
    const o = origin.replace(/\/+$/, '').toLowerCase();
    return rules.some((rule) => {
      if (rule === o) return true;
      const star = rule.indexOf('://*.');
      if (star < 0) return false;
      const scheme = rule.slice(0, star + 3);
      const suffix = rule.slice(star + 4); // ".vercel.app"
      return o.startsWith(scheme) && o.endsWith(suffix) && o.length > scheme.length + suffix.length;
    });
  };
}

export function startServer(opts: ServerOptions = {}): Promise<ServerHandle> {
  const manager = new RoomManager({ persistPath: opts.persistPath ?? null, maxRooms: opts.maxRooms });
  const staticDir = opts.staticDir ? path.resolve(opts.staticDir) : null;
  const hasClient = !!staticDir && fs.existsSync(path.join(staticDir, 'index.html'));
  const originOk = originMatcher(opts.allowedOrigins ?? []);
  const maxConnections = opts.maxConnections ?? 2000;
  const startedAt = Date.now();
  const gzCache = new Map<string, { mtime: number; body: Buffer }>();

  const sendFile = (req: http.IncomingMessage, res: http.ServerResponse, file: string) => {
    const ext = path.extname(file).toLowerCase();
    const stat = fs.statSync(file);
    const headers: Record<string, string> = {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': /-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    };
    const wantsGzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
    if (wantsGzip) {
      let hit = gzCache.get(file);
      if (!hit || hit.mtime !== stat.mtimeMs) {
        hit = { mtime: stat.mtimeMs, body: zlib.gzipSync(fs.readFileSync(file)) };
        gzCache.set(file, hit);
      }
      res.writeHead(200, { ...headers, 'content-encoding': 'gzip', vary: 'Accept-Encoding', 'content-length': String(hit.body.length) });
      return res.end(req.method === 'HEAD' ? undefined : hit.body);
    }
    res.writeHead(200, { ...headers, 'content-length': String(stat.size) });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  };

  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      if (url.pathname === '/health') {
        // CORS-open on purpose: a separately hosted client pings this to wake a sleeping free-tier server.
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
        return res.end(JSON.stringify({ ok: true, rooms: manager.rooms.size, connections: wss.clients.size, uptime: Math.round((Date.now() - startedAt) / 1000), now: Date.now() }));
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { allow: 'GET, HEAD' });
        return res.end();
      }
      if (!hasClient) {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Ultimate Auction Arena real-time server is running.\nWebSocket endpoint: /ws · Health: /health\n');
      }
      let rel: string;
      try {
        rel = decodeURIComponent(url.pathname);
      } catch {
        res.writeHead(400);
        return res.end('Bad request');
      }
      let file = path.normalize(path.join(staticDir!, rel));
      if (file !== staticDir && !file.startsWith(staticDir + path.sep)) { res.writeHead(403); return res.end(); }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        // Missing asset → real 404 (never serve HTML as a script); anything else → the single-page app.
        if (path.extname(rel) && !rel.endsWith('.html')) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
        file = path.join(staticDir!, 'index.html');
      }
      sendFile(req, res, file);
    } catch (e) {
      console.error('[http]', (e as Error).message);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });

  const wss = new WebSocketServer({
    server, path: '/ws', maxPayload: 512 * 1024,
    verifyClient: (info: { origin?: string }) => originOk(info.origin) && wss.clients.size < maxConnections,
  });
  const alive = new WeakMap<WebSocket, boolean>();

  wss.on('connection', (ws) => {
    const id = crypto.randomUUID();
    alive.set(ws, true);
    let budget = 40; // simple per-connection flood guard, refilled every second
    const refill = setInterval(() => { budget = 40; }, 1000);
    manager.connect({
      id,
      send: (msg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); },
    });
    ws.on('pong', () => alive.set(ws, true));
    ws.on('message', (data) => {
      alive.set(ws, true);
      if (--budget < 0) return;
      try {
        manager.handle(id, JSON.parse(data.toString()));
      } catch {
        /* malformed message — ignore, never crash the room */
      }
    });
    ws.on('close', () => { clearInterval(refill); manager.disconnect(id); });
    ws.on('error', () => ws.terminate());
  });

  const ticker = setInterval(() => {
    try { manager.tickAll(); } catch (e) { console.error('[tick]', (e as Error).message); }
  }, 100);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) { ws.terminate(); continue; }
      alive.set(ws, false);
      ws.ping();
    }
  }, 15000);

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 8787, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : opts.port ?? 8787;
      resolve({
        port, manager,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(ticker);
            clearInterval(heartbeat);
            manager.saveNow();
            manager.dispose();
            for (const ws of wss.clients) ws.terminate();
            wss.close(() => server.close(() => done()));
          }),
      });
    });
  });
}
