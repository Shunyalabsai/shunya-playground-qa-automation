import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH = path.resolve(__dirname, '../auth/playground-auth.json');
const AUDIO = path.resolve(__dirname, '../input/CodeSwitchvoices_data/audio/hinglish_arti.wav');
const URL = 'https://playground.shunyalabs.ai/';

const browser = await chromium.launch({ headless: true });
const page = await browser.newContext({ storageState: AUTH }).then((c) => c.newPage());
const captured = { buf: null };

await page.route('**/v1/audio/transcriptions**', async (route) => {
  captured.buf = route.request().postDataBuffer();
  await route.continue();
});

await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
await page.getByRole('button', { name: 'Features' }).click().catch(() => {});

const row = page.locator('[role="button"]', { has: page.locator('span.leading-tight', { hasText: 'Speaker Diarization' }) }).first();
if (!((await row.getAttribute('class')) || '').includes('border-blue-500')) await row.click({ force: true });
const c = page.getByRole('button', { name: 'Confirm' });
if (await c.isVisible({ timeout: 1500 }).catch(() => false)) await c.click({ force: true });

await page.locator('input[type="file"]').setInputFiles(AUDIO);
await page.waitForTimeout(2000);
await page.getByRole('button', { name: 'Run Analysis' }).click({ force: true });
await page.waitForResponse((r) => r.url().includes('transcriptions') && r.request().method() === 'POST', { timeout: 180000 });

const raw = captured.buf ? captured.buf.toString('latin1') : '';
console.log('fields:', [...raw.matchAll(/name="([^"]+)"/g)].map((m) => m[1]));
console.log('has enable_diarization:', /enable_diarization/i.test(raw));
const body = await page.evaluate(() => {
  const pre = document.querySelector('pre');
  return pre?.textContent?.slice(0, 800);
});
console.log('json snippet:', body);

await browser.close();
