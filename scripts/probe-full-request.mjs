import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH = path.resolve(__dirname, '../auth/playground-auth.json');
const AUDIO = path.resolve(__dirname, '../input/CodeSwitchvoices_data/audio/hinglish_arti.wav');

const browser = await chromium.launch({ headless: true });
const page = await browser.newContext({ storageState: AUTH }).then((c) => c.newPage());

page.on('request', (req) => {
  if (req.url().includes('transcriptions') && req.method() === 'POST') {
    console.log('URL:', req.url());
    console.log('headers:', JSON.stringify(req.headers(), null, 2));
    const buf = req.postDataBuffer();
    if (buf?.length) {
      const raw = buf.toString('latin1');
      const names = [...raw.matchAll(/name="([^"]+)"/g)].map((m) => m[1]);
      console.log('multipart names:', [...new Set(names)]);
    } else console.log('postDataBuffer empty');
  }
});

await page.goto('https://playground.shunyalabs.ai/', { waitUntil: 'load', timeout: 120000 });
await page.getByRole('button', { name: 'Features' }).click().catch(() => {});
const row = page.locator('[role="button"]', { has: page.locator('span.leading-tight', { hasText: 'Translation' }) }).first();
await row.click({ force: true });
await page.waitForTimeout(1000);
const confirm = page.getByRole('button', { name: 'Confirm' });
if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) {
  await page.getByText('Hindi', { exact: true }).first().click({ force: true });
  await confirm.click({ force: true });
  await page.waitForTimeout(500);
}
await page.locator('input[type="file"]').setInputFiles(AUDIO);
await page.waitForTimeout(2000);
await page.getByRole('button', { name: 'Run Analysis' }).click({ force: true });
await page.waitForResponse((r) => r.url().includes('transcriptions') && r.request().method() === 'POST', { timeout: 180000 });
await page.waitForTimeout(2000);

await browser.close();
