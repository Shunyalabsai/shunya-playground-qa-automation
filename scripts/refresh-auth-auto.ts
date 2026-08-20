/**
 * refresh-auth-auto.ts
 *
 * Fully automated auth refresh — fetches OTP from Gmail automatically.
 * Used by the scheduler/cron job. No manual input needed.
 *
 * Env vars (from .env):
 *   PLAYGROUND_EMAIL      Email to log in with
 *   GMAIL_USER            Gmail inbox that receives OTP (defaults to PLAYGROUND_EMAIL)
 *   GMAIL_APP_PASSWORD    16-char Google App Password
 *   PLAYGROUND_LOGIN_DEBUG  Set to "1" to run headed + save screenshot on failure
 */

import { chromium, Page } from '@playwright/test';
import { ImapFlow } from 'imapflow';
import * as path from 'path';
import * as fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const PLAYGROUND_URL  = 'https://playground.shunyalabs.ai/';
const AUTH_STATE_PATH = path.resolve(__dirname, '..', 'auth', 'playground-auth.json');
const OTP_SENDER      = 'notifications@shunyalabs.ai';
const OTP_SUBJECT_RE  = /^(\d{6})\s+is your verification code/i;
const DEBUG           = process.env.PLAYGROUND_LOGIN_DEBUG === '1';

const PLAYGROUND_EMAIL   = requireEnv('PLAYGROUND_EMAIL');
const GMAIL_USER         = process.env.GMAIL_USER || PLAYGROUND_EMAIL;
const GMAIL_APP_PASSWORD = requireEnv('GMAIL_APP_PASSWORD').replace(/\s+/g, '');

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`❌  Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchOtpFromGmail(sentAfter: Date, timeoutMs = 90_000): Promise<string> {
  console.log('→ Connecting to Gmail over IMAP…');
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const deadline  = Date.now() + timeoutMs;
      const sinceDate = new Date(sentAfter.getTime() - 30_000);

      while (Date.now() < deadline) {
        const uids = await client.search({ from: OTP_SENDER, since: sinceDate });
        const uidList = Array.isArray(uids) ? uids : [];

        if (uidList.length) {
          const sorted = [...uidList].sort((a, b) => b - a);
          for (const uid of sorted) {
            const msg = await client.fetchOne(
              String(uid),
              { envelope: true, uid: true },
              { uid: true }
            ) as any;
            if (!msg?.envelope) continue;

            const date = msg.envelope.date instanceof Date
              ? msg.envelope.date
              : new Date(msg.envelope.date as string);

            if (date.getTime() < sentAfter.getTime() - 30_000) continue;

            const m = ((msg.envelope.subject as string) || '').match(OTP_SUBJECT_RE);
            if (m) {
              console.log(`✅ OTP found (uid=${uid}, sent ${date.toISOString()})`);
              return m[1];
            }
          }
        }

        console.log('   No OTP yet — retrying in 3 s…');
        await sleep(3000);
      }

      throw new Error(`OTP not received from ${OTP_SENDER} within ${timeoutMs / 1000}s`);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

async function waitForTurnstile(page: Page): Promise<void> {
  const turnstileResponse = page.locator('input[name="cf-turnstile-response"]');
  const count = await turnstileResponse.count();
  if (count === 0) return; // No Turnstile on this page

  console.log('→ Cloudflare Turnstile detected — waiting for it to be solved…');
  const deadline = Date.now() + 120_000; // up to 2 minutes
  while (Date.now() < deadline) {
    const val = await turnstileResponse.inputValue().catch(() => '');
    if (val && val.length > 0) {
      console.log('✅ Turnstile solved.');
      return;
    }
    await sleep(2000);
  }
  throw new Error('Turnstile was not solved within timeout.');
}

async function fillEmail(page: Page): Promise<void> {
  console.log('→ Filling email…');
  await waitForTurnstile(page);

  // Try specific selectors first, fall back to first visible non-hidden input
  const emailInput = page.locator(
    'input[type="email"], input[name*="email" i], input[id*="email" i], input[placeholder*="email" i]'
  ).first();

  const visibleInputs = page.locator('input:visible');
  const visibleCount = await visibleInputs.count();

  if (visibleCount > 0) {
    await emailInput.waitFor({ state: 'visible', timeout: 30_000 });
  } else {
    // Fallback: wait for any input to become visible (after Turnstile)
    await page.locator('input').first().waitFor({ state: 'visible', timeout: 30_000 });
  }

  await emailInput.fill(PLAYGROUND_EMAIL);

  const continueBtn = page.getByRole('button', { name: /continue/i }).first();
  if (await continueBtn.count()) {
    await continueBtn.click();
  } else {
    await emailInput.press('Enter');
  }
}

async function fillOtp(page: Page, code: string): Promise<void> {
  console.log(`→ Filling OTP ${code[0]}*****…`);

  const singleInput = page.locator(
    'input[name*="otp" i], input[id*="otp" i], input[aria-label*="code" i], input[placeholder*="code" i]'
  ).first();

  if (await singleInput.count()) {
    await singleInput.waitFor({ state: 'visible', timeout: 15_000 });
    await singleInput.fill(code);
  } else {
    const boxes = page.locator('input[maxlength="1"]');
    await boxes.first().waitFor({ state: 'visible', timeout: 15_000 });
    const n = await boxes.count();
    if (n >= 6) {
      for (let i = 0; i < 6; i++) await boxes.nth(i).fill(code[i]);
    } else {
      throw new Error('Could not find OTP input field on the page.');
    }
  }

  await sleep(1500);
  const verifyBtn = page.getByRole('button', { name: /verify|continue|confirm/i }).first();
  if (await verifyBtn.count() && await verifyBtn.isEnabled()) {
    await verifyBtn.click();
  }
}

(async () => {
  fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });

  console.log('🔐 Automated Playground auth refresh');
  console.log(`   Email   : ${PLAYGROUND_EMAIL}`);
  console.log(`   Mailbox : ${GMAIL_USER}`);
  console.log(`   Time    : ${new Date().toISOString()}`);
  console.log('');

  const browser = await chromium.launch({ channel: 'chrome', headless: !DEBUG });
  const context = await browser.newContext();
  const page    = await context.newPage();

  try {
    console.log(`→ Opening ${PLAYGROUND_URL}…`);
    await page.goto(PLAYGROUND_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

    if (await page.getByText('API Playground').count()) {
      console.log('ℹ️  Already logged in — saving state.');
      await context.storageState({ path: AUTH_STATE_PATH });
      console.log(`💾 Saved to ${AUTH_STATE_PATH}`);
      return;
    }

    const sentAt = new Date();
    await fillEmail(page);

    console.log('→ Waiting for OTP email (up to 90 s)…');
    const otp = await fetchOtpFromGmail(sentAt, 90_000);

    await fillOtp(page, otp);

    console.log('→ Waiting for login to complete…');
    await page.waitForURL('https://playground.shunyalabs.ai/**', { timeout: 60_000 });
    await page.waitForSelector('text=API Playground', { timeout: 30_000 });
    await sleep(2000);

    await context.storageState({ path: AUTH_STATE_PATH });
    console.log('');
    console.log(`✅ Auth saved to ${AUTH_STATE_PATH}`);

  } catch (err) {
    console.error('');
    console.error('❌ Auth refresh failed:', (err as Error).message);

    if (DEBUG) {
      await page.screenshot({ path: 'auth/debug-failure.png' });
      console.error('📸 Screenshot saved to auth/debug-failure.png');
    }

    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
