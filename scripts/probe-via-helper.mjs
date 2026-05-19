// Quick check using same flow as tests (requires building - use ts-node or inline)
import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH = path.resolve(__dirname, '../auth/playground-auth.json');
const AUDIO = path.resolve(__dirname, '../input/CodeSwitchvoices_data/audio/hinglish_arti.wav');
const URL = 'https://playground.shunyalabs.ai/';

async function run(featureLabel) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ storageState: AUTH }).then((c) => c.newPage());
  let requestBuffer = null;
  let body = null;

  await page.route('**/v1/audio/transcriptions**', async (route) => {
    const buf = route.request().postDataBuffer();
    if (buf?.length) requestBuffer = buf;
    await route.continue();
  });
  page.on('response', async (res) => {
    if (res.url().includes('/v1/audio/transcriptions') && res.request().method() === 'POST') {
      try { body = await res.json(); } catch {}
    }
  });

  await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await page.getByRole('button', { name: 'Speech to Text' }).click().catch(() => {});
  await page.getByRole('button', { name: 'Features' }).click().catch(() => {});
  await page.waitForTimeout(500);

  const row = page.locator('[role="button"]', { has: page.locator('span.leading-tight', { hasText: featureLabel }) }).first();
  const cls = await row.getAttribute('class');
  if (!cls?.includes('border-blue-500')) await row.click({ force: true });
  await page.waitForTimeout(800);
  const confirm = page.getByRole('button', { name: 'Confirm' });
  if (await confirm.isVisible({ timeout: 2500 }).catch(() => false)) {
    if (featureLabel === 'Translation') {
      await page.getByText('Hindi', { exact: true }).first().click({ force: true });
    }
    if (featureLabel === 'Custom Keyword Hashing') {
      await page.locator('input:not([type="file"])').last().fill('test,keyword');
    }
    await confirm.click({ force: true });
    await page.waitForTimeout(400);
  }
  await page.keyboard.press('Escape').catch(() => {});

  const active = (await row.getAttribute('class'))?.includes('border-blue-500');
  await page.locator('input[type="file"]').setInputFiles(AUDIO);
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Run Analysis' }).click({ force: true });
  await page.waitForResponse((r) => r.url().includes('transcriptions') && r.request().method() === 'POST', { timeout: 180000 });

  const raw = requestBuffer?.toString('latin1') || '';
  const fields = {};
  const re = /name="([^"]+)"\r?\n\r?\n([^\r\n]*)/g;
  let m;
  while ((m = re.exec(raw)) !== null) fields[m[1]] = m[2];

  console.log('\n', featureLabel, { active, fieldKeys: Object.keys(fields), nlp: body?.nlp_analysis ? Object.keys(body.nlp_analysis) : null });
  await browser.close();
}

for (const f of ['Transliteration', 'Translation', 'Sentiment Analysis']) {
  await run(f);
}
