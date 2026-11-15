import { expect, test } from '@playwright/test';
import { createMatch, defaultConfig } from '../../shared/engine';
import { getCatalog } from '../../shared/catalog';

test('broken portraits fall back cleanly and the next public portrait is preloaded', async ({ page, baseURL }) => {
  const roster = getCatalog('football').slice(0, 30);
  roster[0] = { ...roster[0], image: `${baseURL}/qa-broken-portrait.png` };
  roster[1] = { ...roster[1], image: `${baseURL}/qa-next-portrait.png` };
  const requests: string[] = [];
  page.on('request', (req) => { if (req.url().includes('/qa-')) requests.push(req.url()); });
  await page.route('**/qa-broken-portrait.png', (route) => route.abort());
  await page.route('**/qa-next-portrait.png', (route) => route.fulfill({
    contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+lm8sAAAAASUVORK5CYII=', 'base64'),
  }));
  const state = createMatch({ ...defaultConfig('football'), rules: 'casual', shuffle: false, timerSec: 120 }, [
    { id: 'a', name: 'Alice', team: 'A' }, { id: 'b', name: 'Bob', team: 'B' },
  ], roster, Date.now() - 3000);
  await page.addInitScript((s) => {
    localStorage.setItem('uaa.local.v1', JSON.stringify({ state: s, savedAt: Date.now() }));
    sessionStorage.setItem('uaa.active', 'local'); localStorage.setItem('uaa.muted', '1');
  }, state);
  await page.goto('/');
  await page.getByLabel('Resume', { exact: true }).click();
  const stage = page.getByRole('region', { name: 'Card on auction' });
  await expect(stage.getByRole('button', { name: /Lionel Messi/ })).toBeVisible();
  await expect.poll(() => requests.some((url) => url.includes('qa-broken-portrait'))).toBe(true);
  await expect(stage.locator('img')).toHaveCount(0);
  await expect(stage.locator('.uc-art svg')).toBeVisible();
  await expect.poll(() => requests.some((url) => url.includes('qa-next-portrait'))).toBe(true);
});
