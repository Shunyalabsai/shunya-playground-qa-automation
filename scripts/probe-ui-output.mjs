import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH = path.resolve(__dirname, '../auth/playground-auth.json');
const AUDIO = path.resolve(__dirname, '../input/CodeSwitchvoices_data/audio/hinglish_arti.wav');

const browser = await chromium.launch({ headless: true });
const page = await browser.newContext({ storageState: AUTH }).then((c) => c.newPage());
let apiBody = null;

page.on('response', async (res) => {
  if (res.url().includes('/v1/audio/transcriptions') && res.request().method() === 'POST') {
    try { apiBody = await res.json(); } catch {}
  }
});

await page.goto('https://playground.shunyalabs.ai/', { waitUntil: 'load', timeout: 120000 });
await page.getByRole('button', { name: 'Speech to Text' }).click().catch(() => {});
await page.getByRole('button', { name: 'Features' }).click().catch(() => {});
const row = page.locator('[role="button"]', { has: page.locator('span.leading-tight', { hasText: 'Translation' }) }).first();
if (!((await row.getAttribute('class')) || '').includes('border-blue-500')) await row.click({ force: true });
const confirm = page.getByRole('button', { name: 'Confirm' });
if (await confirm.isVisible({ timeout: 2500 }).catch(() => false)) {
  await page.getByText('Hindi', { exact: true }).first().click({ force: true });
  await confirm.click({ force: true });
}
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(500);
await page.locator('input[type="file"]').setInputFiles(AUDIO);
await page.waitForTimeout(2500);
await page.getByRole('button', { name: 'Run Analysis' }).click({ force: true });
await page.waitForResponse((r) => r.url().includes('transcriptions') && r.request().method() === 'POST', { timeout: 180000 });
await page.waitForTimeout(3000);

const buttons = await page.getByRole('button').allTextContents();
const resultTabs = buttons.filter((t) => /transcript|json|translation|transliterat|sentiment|intent|summary|speaker|analysis/i.test(t));
console.log('result tabs:', [...new Set(resultTabs)]);

for (const tab of ['Transcript', 'JSON', 'Translation']) {
  const btn = page.getByRole('button', { name: tab, exact: true });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => {});
    await page.waitForTimeout(800);
    const text = await page.locator('main').textContent();
    console.log(`--- ${tab} (${text?.length} chars) ---`);
    console.log(text?.replace(/\s+/g, ' ').slice(0, 400));
  }
}
console.log('api nlp keys:', apiBody?.nlp_analysis ? Object.keys(apiBody.nlp_analysis) : 'none');

await browser.close();
