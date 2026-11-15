import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = process.env.PLAYWRIGHT_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const external = process.env.ARENA_URL; // set to test an already running or deployed site instead of the local build
const port = 8788;

export default defineConfig({
  testDir: './tests/browser', testMatch: '**/*.spec.ts', timeout: 45000, workers: 1,
  reporter: [['list']], outputDir: 'artifacts/browser-tests',
  use: {
    baseURL: external || `http://localhost:${port}`, reducedMotion: 'reduce',
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {},
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
  // Runs the production bundle (run "npm run build" first). Rooms go to a throwaway file so real saves are never touched.
  webServer: external ? undefined : {
    command: 'node dist-server/index.mjs --prod',
    url: `http://localhost:${port}/health`,
    reuseExistingServer: true,
    timeout: 30_000,
    env: { SERVER_PORT: String(port), PORT: '', DATA_FILE: 'server/data/rooms-test.json' },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    // Online specs open their own phone-sized guests; split-hosting and restart tests need no second pass.
    { name: 'mobile', testIgnore: '**/online*.spec.ts', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
