/**
 * refresh-playground-auth.ts
 *
 * Refreshes the Playwright auth session for playground.shunyalabs.ai
 * Fully automated — reads OTP from Gmail, no human input needed.
 *
 * Flow:
 *   1. Open https://playground.shunyalabs.ai/ → redirects to Clerk sign-in
 *   2. Fill email and click Continue
 *   3. Auto-fetch OTP from Gmail via IMAP
 *   4. Fill OTP into the page
 *   5. Wait for successful login
 *   6. Save storageState → auth/playground-auth.json
 *
 * Env vars (from .env):
 *   PLAYGROUND_EMAIL        Email to log in with
 *   GMAIL_APP_PASSWORD      Gmail App Password (16-char)
 *   PLAYGROUND_LOGIN_DEBUG  Set to "1" to run headed + pause on failure
 *
 * Usage:
 *   npx ts-node scripts/refresh-playground-auth.ts
 *   PLAYGROUND_LOGIN_DEBUG=1 npx ts-node scripts/refresh-playground-auth.ts
 */

import { chromium, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import dotenv from 'dotenv';
import { fetchOtpFromGmail } from './gmail-otp';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ─── Config ──────────────────────────────────────────────────────────────────

const PLAYGROUND_URL   = 'https://playground.shunyalabs.ai/';
const AUTH_STATE_PATH  = path.resolve(__dirname, '..', 'auth', 'playground-auth.json');
const DEBUG            = process.env.PLAYGROUND_LOGIN_DEBUG === '1';
const PLAYGROUND_EMAIL = requireEnv('PLAYGROUND_EMAIL');

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`❌  Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Login steps ──────────────────────────────────────────────────────────────

async function fillEmail(page: Page): Promise<void> {
  console.log('→ Filling email…');
  const emailInput = page.locator('input').first();
  await emailInput.waitFor({ state: 'visible', timeout: 30_000 });
  await emailInput.fill(PLAYGROUND_EMAIL);

  const continueBtn = page.getByRole('button', { name: /continue/i }).first();
  if (await continueBtn.count()) {
    await continueBtn.click();
  } else {
    await emailInput.press('Enter');
  }
}

async function fillOtp(page: Page, code: string): Promise<void> {
  console.log(`→ Filling OTP into page…`);

  // Try single OTP input first
  const singleInput = page.locator(
    'input[name*="otp" i], input[id*="otp" i], input[aria-label*="code" i], input[placeholder*="code" i]'
  ).first();

  if (await singleInput.count()) {
    await singleInput.waitFor({ state: 'visible', timeout: 15_000 });
    await singleInput.fill(code);
  } else {
    // 6 individual digit boxes
    const boxes = page.locator('input[maxlength="1"]');
    await boxes.first().waitFor({ state: 'visible', timeout: 15_000 });
    const n = await boxes.count();
    if (n >= 6) {
      for (let i = 0; i < 6; i++) {
        await boxes.nth(i).fill(code[i]);
      }
    } else {
      throw new Error('Could not find OTP input field on the page.');
    }
  }

  // Wait for auto-submit, then click verify if needed
  await sleep(1500);
  const verifyBtn = page.getByRole('button', { name: /verify|continue|confirm/i }).first();
  if (await verifyBtn.count() && await verifyBtn.isEnabled()) {
    await verifyBtn.click();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });

  console.log('🔐 Playground auth refresh (automated)');
  console.log(`   Email  : ${PLAYGROUND_EMAIL}`);
  console.log(`   Headed : ${DEBUG}`);
  console.log('');

  const browser = await chromium.launch({ headless: !DEBUG });
  const context = await browser.newContext();
  const page    = await context.newPage();

  try {
    // 1. Open playground
    console.log(`→ Opening ${PLAYGROUND_URL}…`);
    await page.goto(PLAYGROUND_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

    // 2. Already logged in?
    if (await page.getByText('API Playground').count()) {
      console.log('ℹ️  Already logged in — saving state.');
      await context.storageState({ path: AUTH_STATE_PATH });
      console.log(`💾 Saved to ${AUTH_STATE_PATH}`);
      return;
    }

    // 3. Fill email — note the time just before so we only pick up the new OTP email
    const otpRequestedAt = new Date();
    await fillEmail(page);

    // 4. Auto-fetch OTP from Gmail
    console.log('');
    console.log('📧 OTP email requested — fetching from Gmail automatically…');
    const otp = await fetchOtpFromGmail(otpRequestedAt);

    if (!/^\d{6}$/.test(otp)) {
      throw new Error(`Invalid OTP "${otp}" — must be exactly 6 digits.`);
    }

    // 5. Fill OTP
    await fillOtp(page, otp);

    // 6. Wait for login to complete
    console.log('→ Waiting for login to complete…');
    await page.waitForURL('https://playground.shunyalabs.ai/**', { timeout: 60_000 });
    await page.waitForSelector('text=API Playground', { timeout: 30_000 });
    await sleep(2000);

    // 7. Save auth state
    await context.storageState({ path: AUTH_STATE_PATH });
    console.log('');
    console.log(`✅ Auth saved to ${AUTH_STATE_PATH}`);
    console.log('   Tests are ready to run.');

  } catch (err) {
    console.error('');
    console.error('❌ Auth refresh failed:', (err as Error).message);

    if (DEBUG) {
      await page.screenshot({ path: 'auth/debug-failure.png' });
      console.error('📸 Screenshot saved to auth/debug-failure.png');
      console.error('   Pausing 30 s so you can inspect the browser…');
      await sleep(30_000);
    }

    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();