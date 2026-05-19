import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH = path.resolve(__dirname, '../auth/playground-auth.json');

const browser = await chromium.launch({ headless: true });
const page = await browser.newContext({ storageState: AUTH }).then((c) => c.newPage());
await page.goto('https://playground.shunyalabs.ai/', { waitUntil: 'load', timeout: 120000 });
await page.getByRole('button', { name: 'Speech to Text' }).click().catch(() => {});
await page.getByRole('button', { name: 'Features' }).click().catch(() => {});
const row = page.locator('[role="button"]', { has: page.locator('span.leading-tight', { hasText: 'Translation' }) }).first();
await row.click({ force: true });
await page.waitForTimeout(500);
const attrs = await row.evaluate((el) => ({
  class: el.className,
  dataset: { ...el.dataset },
  outer: el.outerHTML.slice(0, 400),
}));
console.log(attrs);
await browser.close();
