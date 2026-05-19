/**
 * One-off probe: capture transcription POST body when Profanity toggle is ON.
 * Run: npx ts-node scripts/probe-feature-request.ts
 */
import { chromium } from '@playwright/test';
import * as path from 'path';
import { extractMultipartTextFields, multipartContainsAny } from '../src/tests/playgroundStt.helpers';

const PLAYGROUND_URL = 'https://playground.shunyalabs.ai/';
const AUTH = path.resolve(__dirname, '../auth/playground-auth.json');
const AUDIO = path.resolve(__dirname, '../input/CodeSwitchvoices_data/audio/hinglish_arti.wav');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();

  const captured: { buf: Buffer | null } = { buf: null };

  const confirmBtn = page.getByRole('button', { name: 'Confirm' });
  await page.addLocatorHandler(confirmBtn, async () => {
    await confirmBtn.click({ force: true, timeout: 2000 }).catch(() => {});
  });

  await page.goto(PLAYGROUND_URL, { waitUntil: 'load', timeout: 120000 });
  await page.getByRole('button', { name: 'Features' }).click().catch(() => {});
  await page.waitForTimeout(500);

  const switchesBefore = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="switch"]')).map((s) => ({
      label: s.getAttribute('aria-label') || s.closest('[role="button"]')?.textContent?.slice(0, 40),
      checked: s.getAttribute('aria-checked'),
    })),
  );
  console.log('switches before:', JSON.stringify(switchesBefore.slice(0, 15), null, 2));

  const label = page.locator('span.leading-tight', { hasText: 'Profanity Hashing' }).first();
  const row = label.locator('xpath=ancestor::div[contains(@class,"flex")][1]');
  const switches = page.getByRole('switch');
  console.log('switch count on page:', await switches.count());

  const nearRow = row.locator('[role="switch"], button[aria-checked], input[type="checkbox"]');
  console.log('controls near row:', await nearRow.count());
  if (await nearRow.count()) {
    await nearRow.first().click({ force: true });
  } else {
    await label.click({ force: true });
  }
  await page.waitForTimeout(1500);

  const sw = page.getByRole('switch', { name: /profanity/i });
  if (await sw.count()) {
    console.log('profanity switch aria-checked:', await sw.first().getAttribute('aria-checked'));
  }

  const switchesAfter = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="switch"]')).map((s) => ({
      label: s.getAttribute('aria-label') || s.closest('[role="button"]')?.textContent?.slice(0, 40),
      checked: s.getAttribute('aria-checked'),
    })),
  );
  console.log('switches after click:', JSON.stringify(switchesAfter.filter((s) => s.checked === 'true'), null, 2));

  await page.locator('input[type="file"]').setInputFiles(AUDIO);
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Run Analysis' }).click();

  await page.route('**/v1/audio/transcriptions', async (route) => {
    const post = route.request().postDataBuffer();
    if (post?.length) captured.buf = post;
    await route.continue();
  });

  const res = await page.waitForResponse(
    (r) => r.url().includes('/v1/audio/transcriptions') && r.request().method() === 'POST',
    { timeout: 180000 },
  );
  if (!captured.buf?.length) captured.buf = res.request().postDataBuffer() ?? null;

  await page.getByRole('button', { name: 'Code Sample' }).click().catch(() => {});
  await page.waitForTimeout(800);
  const codeText = await page.textContent('body');
  const hasProfanityInCode = codeText?.toLowerCase().includes('profanity') ?? false;
  console.log('Code Sample mentions profanity:', hasProfanityInCode);
  if (codeText?.includes('enable_')) {
    const m = codeText.match(/enable_[a-z_]+/gi);
    console.log('enable_* in code sample:', m?.slice(0, 15));
  }

  const buf = captured.buf;
  console.log('buffer length:', buf ? buf.length : 0);
  if (buf?.length) {
    const raw = buf.toString('latin1', 0, Math.min(buf.length, 8000));
    console.log('--- raw snippet (8k) ---\n', raw);
    const fields = extractMultipartTextFields(buf);
    console.log('--- parsed fields ---\n', fields);
    console.log('has enable_profanity:', multipartContainsAny(buf, ['enable_profanity_hashing', 'profanity']));
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
