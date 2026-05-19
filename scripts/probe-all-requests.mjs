import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH = path.resolve(__dirname, '../auth/playground-auth.json');
const AUDIO = path.resolve(__dirname, '../input/CodeSwitchvoices_data/audio/hinglish_arti.wav');

const browser = await chromium.launch({ headless: true });
const page = await browser.newContext({ storageState: AUTH }).then((c) => c.newPage());
const posts = [];

page.on('request', (req) => {
  if (req.method() === 'POST' && req.url().includes('shunyalabs')) {
    const buf = req.postDataBuffer();
    const fields = buf?.length
      ? [...new Set([...buf.toString('latin1').matchAll(/name="([^"]+)"/g)].map((m) => m[1]))]
      : [];
    posts.push({ url: req.url(), fields });
  }
});

await page.goto('https://playground.shunyalabs.ai/', { waitUntil: 'load', timeout: 120000 });
await page.getByRole('button', { name: 'Speech to Text' }).click().catch(() => {});
await page.getByRole('button', { name: 'Features' }).click().catch(() => {});
const row = page.locator('[role="button"]', { has: page.locator('span.leading-tight', { hasText: 'Translation' }) }).first();
if (!((await row.getAttribute('class')) || '').includes('border-blue-500')) await row.click({ force: true });
await page.waitForTimeout(800);
const confirm = page.getByRole('button', { name: 'Confirm' });
if (await confirm.isVisible({ timeout: 2500 }).catch(() => false)) {
  await page.getByText('Hindi', { exact: true }).first().click({ force: true });
  await confirm.click({ force: true });
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(600);
}
await page.locator('input[type="file"]').setInputFiles(AUDIO);
await page.waitForTimeout(2500);
await page.getByRole('button', { name: 'Run Analysis' }).click({ force: true });
await page.waitForTimeout(90000);

console.log('POST count:', posts.length);
posts.forEach((p, i) => console.log(i, p.url.split('/').slice(-2).join('/'), p.fields));

await browser.close();
