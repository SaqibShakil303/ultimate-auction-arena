import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './app';

// Works both from source (server/index.ts via tsx) and from the bundle (dist-server/index.mjs):
// in either case the project root is one level up.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Optional .env file next to package.json (see .env.example). Real environment variables win.
try {
  (process as unknown as { loadEnvFile?: (file: string) => void }).loadEnvFile?.(path.join(root, '.env'));
} catch {
  /* no .env file — fine */
}

// Dev tools often export PORT for the web client, so the server only honours PORT in production (--prod).
const prod = process.argv.includes('--prod');
const port = Number(process.env.SERVER_PORT || (prod && process.env.PORT) || 8787);
const persistPath = process.env.PERSIST === 'off' ? null : path.resolve(root, process.env.DATA_FILE || 'server/data/rooms.json');
// SERVE_CLIENT=off runs a WebSocket-only game server (client hosted on Netlify / Vercel / elsewhere).
const staticDir = process.env.SERVE_CLIENT === 'off' ? null : path.join(root, 'dist');
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean);

process.on('uncaughtException', (e) => console.error('[fatal] uncaught exception:', e));
process.on('unhandledRejection', (e) => console.error('[fatal] unhandled rejection:', e));

startServer({
  port, persistPath, staticDir, allowedOrigins,
  maxRooms: Number(process.env.MAX_ROOMS) || undefined,
  maxConnections: Number(process.env.MAX_CONNECTIONS) || undefined,
}).then((h) => {
  const client = staticDir && fs.existsSync(path.join(staticDir, 'index.html'));
  console.log(`\n  Ultimate Auction Arena — real-time server`);
  console.log(`  ➜ Local:   http://localhost:${h.port}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) console.log(`  ➜ Network: http://${ni.address}:${h.port}`);
    }
  }
  console.log(`  ➜ WebSocket path: /ws · health: /health`);
  console.log(`  ➜ Web client: ${client ? 'served from dist/' : 'not served (WebSocket-only mode)'}`);
  console.log(`  ➜ Allowed origins: ${allowedOrigins.length ? allowedOrigins.join(', ') : 'any'}`);
  console.log(`  ➜ Persistence: ${persistPath ?? 'off'}\n`);
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void h.close().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}).catch((e) => {
  console.error(`Could not start the server on port ${port}: ${(e as Error).message}`);
  process.exit(1);
});
