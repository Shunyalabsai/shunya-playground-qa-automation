/**
 * Headless Playground auth refresh.
 *
 * Flow:
 *   1. Open https://playground.shunyalabs.ai/ in a Playwright browser.
 *   2. Submit PLAYGROUND_EMAIL on the sign-in page.
 *   3. Poll the GMAIL_USER mailbox over IMAP for a new message from
 *      notifications@shunyalabs.ai whose subject starts with "<6-digit code>
 *      is your verification code".
 *   4. Submit the OTP and wait for the post-login marker.
 *   5. Save Playwright storageState to auth/playground-auth.json.
 *
 * Env (read from .env):
 *   PLAYGROUND_EMAIL      Email used to log into the Playground.
 *   GMAIL_USER            Mailbox that receives the OTP. Defaults to PLAYGROUND_EMAIL.
 *   GMAIL_APP_PASSWORD    16-char Google app password (NOT the Gmail account password).
 *   PLAYGROUND_LOGIN_DEBUG  Set to "1" to run headed and pause on errors.
 *
 * Usage:
 *   npm run playground:refresh-auth
 */

import { chromium, Page } from '@playwright/test';
import { ImapFlow } from 'imapflow';
import * as path from 'path';
import * as fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const PLAYGROUND_URL = 'https://playground.shunyalabs.ai/';
const AUTH_STATE_PATH = path.resolve(__dirname, '..', 'auth', 'playground-auth.json');
const OTP_SENDER = 'notifications@shunyalabs.ai';
const OTP_SUBJECT_RE = /^(\d{6})\s+is your verification code/i;

const DEBUG = process.env.PLAYGROUND_LOGIN_DEBUG === '1';
const PLAYGROUND_EMAIL = required('PLAYGROUND_EMAIL');
const GMAIL_USER = process.env.GMAIL_USER || PLAYGROUND_EMAIL;
const GMAIL_APP_PASSWORD = required('GMAIL_APP_PASSWORD').replace(/\s+/g, '');

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`❌ Missing required env var: ${name}`);
    console.error(`   Add it to .env at the project root.`);
    process.exit(1);
  }
  return v;
}

async function fetchOtpFromGmail(sentAfter: Date, timeoutMs = 90_000): Promise<string> {
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
      const deadline = Date.now() + timeoutMs;
      const sinceDate = new Date(sentAfter.getTime() - 30_000); // 30s slack for clock skew
      while (Date.now() < deadline) {
        const uids = await client.search({
          from: OTP_SENDER,
          since: sinceDate,
        });
        if (uids && uids.length) {
          // Walk newest -> oldest, take the first that is newer than sentAfter.
          const sorted = [...uids].sort((a, b) => b - a);
          for (const uid of sorted) {
            const msg = await client.fetchOne(String(uid), { envelope: true, uid: true }, { uid: true });
            if (!msg || !msg.envelope) continue;
            const date = msg.envelope.date instanceof Date
              ? msg.envelope.date
              : new Date(msg.envelope.date as unknown as string);
            if (date.getTime() < sentAfter.getTime() - 30_000) continue;
            const subject = msg.envelope.subject || '';
            const m = subject.match(OTP_SUBJECT_RE);
            if (m) {
              console.log(`✅ OTP found in subject (uid=${uid}, sent ${date.toISOString()})`);
              return m[1];
            }
          }
        }
        await sleep(3000);
      }
      throw new Error(`No OTP email from ${OTP_SENDER} arrived within ${timeoutMs / 1000}s`);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => { /* ignore */ });
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function submitEmail(page: Page) {
  // Robust to a few common patterns: <input type="email">, name="email",
  // placeholder containing "email", or a label with "Email".
  const emailInput = page.locator(
    'input[type="email"], input[name="email" i], input[placeholder*="email" i], input[id*="email" i]'
  ).first();
  await emailInput.waitFor({ state: 'visible', timeout: 30_000 });
  await emailInput.fill(PLAYGROUND_EMAIL);

  // Try a button labelled Continue / Send / Next / Login / Submit.
  const submit = page.getByRole('button', { name: /(continue|send|next|log\s*in|sign\s*in|submit|get\s*otp|send\s*otp)/i }).first();
  if (await submit.count()) {
    await submit.click();
  } else {
    await emailInput.press('Enter');
  }
}

async function submitOtp(page: Page, code: string) {
  // Two common patterns: a single 6-digit input, or six separate digit boxes.
  const single = page.locator(
    'input[name*="otp" i], input[id*="otp" i], input[aria-label*="verification" i], input[aria-label*="code" i], input[placeholder*="code" i], input[placeholder*="otp" i]'
  ).first();
  if (await single.count()) {
    await single.fill(code);
  } else {
    const boxes = page.locator('input[maxlength="1"]');
    const n = await boxes.count();
    if (n >= 6) {
      for (let i = 0; i < 6; i++) await boxes.nth(i).fill(code[i]);
    } else {
      throw new Error('Could not find OTP input field — selector tweak needed.');
    }
  }
  const verify = page.getByRole('button', { name: /(verify|continue|log\s*in|sign\s*in|submit|confirm)/i }).first();
  if (await verify.count()) {
    await verify.click();
  } else {
    await page.keyboard.press('Enter');
  }
}

(async () => {
  fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });

  console.log('🔐 Playground headless auth refresh');
  console.log(`   Login email : ${PLAYGROUND_EMAIL}`);
  console.log(`   OTP mailbox : ${GMAIL_USER}`);
  console.log(`   Headless    : ${!DEBUG}`);

  const browser = await chromium.launch({ headless: !DEBUG });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle', timeout: 60_000 });

    // If we're already logged in (a fresh storageState file from elsewhere), skip.
    if (await page.getByText('API Playground').count()) {
      console.log('ℹ️  Already logged in — saving state and exiting.');
      await context.storageState({ path: AUTH_STATE_PATH });
      return;
    }

    console.log('→ Submitting email…');
    const sentAt = new Date();
    await submitEmail(page);

    console.log('→ Waiting for OTP email (max 90 s)…');
    const code = await fetchOtpFromGmail(sentAt, 90_000);
    console.log(`→ Submitting OTP ${code.slice(0, 1)}*****`);
    await submitOtp(page, code);

    await page.waitForSelector('text=API Playground', { timeout: 60_000 });
    await page.waitForTimeout(2000); // let cookies settle

    await context.storageState({ path: AUTH_STATE_PATH });
    console.log(`💾 Auth state saved to ${AUTH_STATE_PATH}`);
  } catch (err) {
    console.error('❌ Auth refresh failed:', (err as Error).message);
    if (DEBUG) {
      console.error('   Pausing 30s so you can inspect the browser.');
      await page.waitForTimeout(30_000);
    }
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
