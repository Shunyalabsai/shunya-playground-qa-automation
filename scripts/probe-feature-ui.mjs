import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH = path.resolve(__dirname, '../auth/playground-auth.json');
const AUDIO = path.resolve(__dirname, '../input/CodeSwitchvoices_data/audio/hinglish_arti.wav');
const URL = 'https://playground.shunyalabs.ai/';

async function probeFeature(name) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ storageState: AUTH }).then((c) => c.newPage());
  let apiBody = null;
  let reqFields = [];

  await page.route('**/v1/audio/transcriptions**', async (route) => {
    const buf = route.request().postDataBuffer();
    if (buf?.length) {
      const raw = buf.toString('latin1');
      reqFields = [...raw.matchAll(/name="([^"]+)"/g)].map((m) => m[1]).filter((n) => n !== 'file');
    }
    await route.continue();
  });
  page.on('response', async (res) => {
    if (res.url().includes('/v1/audio/transcriptions') && res.request().method() === 'POST') {
      try { apiBody = await res.json(); } catch { apiBody = null; }
    }
  });

  await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await page.getByRole('button', { name: 'Speech to Text' }).click().catch(() => {});
  await page.getByRole('button', { name: 'Features' }).click().catch(() => {});
  await page.waitForTimeout(500);

  const row = page.locator('[role="button"]', {
    has: page.locator('span.leading-tight', { hasText: name }),
  }).first();
  const cls0 = await row.getAttribute('class');
  if (!cls0?.includes('border-blue-500')) await row.click({ force: true });
  await page.waitForTimeout(800);
  const confirm = page.getByRole('button', { name: 'Confirm' });
  if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) {
    if (name === 'Translation') {
      await page.getByText('Hindi', { exact: true }).first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);
    }
    if (name === 'Custom Keyword Hashing') {
      await page.locator('input:not([type="file"])').last().fill('test,keyword').catch(() => {});
    }
    await confirm.click({ force: true });
    await page.waitForTimeout(400);
  }
  const cls1 = await row.getAttribute('class');
  await page.locator('input[type="file"]').setInputFiles(AUDIO);
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Run Analysis' }).click({ force: true });
  await page.waitForResponse((r) => r.url().includes('transcriptions') && r.request().method() === 'POST', { timeout: 180000 });
  await page.waitForTimeout(3000);

  const tabs = await page.getByRole('button').allTextContents();
  const resultTabs = tabs.filter((t) =>
    /transcript|json|translation|transliterat|sentiment|intent|summary|emotion|speaker|word|profan|keyword|normal/i.test(t),
  );

  const bodySnippet = (await page.locator('main, [class*="result"], pre').first().textContent().catch(() => ''))?.slice(0, 500);

  console.log('\n===', name, '===');
  console.log('row active:', cls1?.includes('border-blue-500'));
  console.log('request fields:', [...new Set(reqFields)]);
  console.log('api keys:', apiBody ? Object.keys(apiBody) : null);
  console.log('nlp_analysis:', apiBody?.nlp_analysis ? Object.keys(apiBody.nlp_analysis) : false);
  console.log('result-ish tabs:', [...new Set(resultTabs)].slice(0, 20));
  console.log('body snippet:', bodySnippet?.replace(/\s+/g, ' ').slice(0, 300));

  await browser.close();
}

for (const f of ['Translation', 'Transliteration', 'Intent Detection', 'Speaker Diarization']) {
  await probeFeature(f);
}
