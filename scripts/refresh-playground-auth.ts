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

import { chromium, Page, Frame } from '@playwright/test';
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
  console.log('→ Waiting for Cloudflare challenge to clear…');

  // Wait for the actual email input — not the hidden Cloudflare one
  const emailInput = page.locator(
    'input[type="email"], input[name="identifier"], input[autocomplete="email"], input[placeholder*="email" i]'
  ).first();

  await emailInput.waitFor({ state: 'visible', timeout: 60_000 });
  console.log('→ Filling email…');
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
  console.log(`   OTP code: ${code}`);

  // Take screenshot before filling OTP
  if (DEBUG) {
    await page.screenshot({ path: 'auth/otp-before-fill.png' });
    console.log('   📸 Screenshot saved: auth/otp-before-fill.png');
  }

  // Check for iframes (Clerk often uses iframes for OTP)
  const frames = page.frames();
  console.log(`   Total frames on page: ${frames.length}`);
  for (const frame of frames) {
    const frameName = frame.name();
    if (frameName) {
      console.log(`   Frame: ${frameName}`);
    }
  }

  // Try to find OTP inputs in main page or iframes
  let otpFilled = false;

  // First try main page
  console.log('   Searching for OTP inputs in main page...');
  otpFilled = await tryFillOtpInContext(page, code);

  // If not found in main page, search in iframes
  if (!otpFilled) {
    console.log('   Searching for OTP inputs in iframes...');
    for (const frame of frames) {
      if (frame === page.mainFrame()) continue;
      try {
        console.log(`   Checking frame: ${frame.name() || 'unnamed'}`);
        otpFilled = await tryFillOtpInContext(frame, code);
        if (otpFilled) {
          console.log(`   ✅ OTP filled in iframe: ${frame.name() || 'unnamed'}`);
          break;
        }
      } catch (e) {
        console.log(`   Frame check failed: ${(e as Error).message}`);
      }
    }
  }

  if (!otpFilled) {
    // Log all input fields for debugging
    const allInputs = await page.locator('input').all();
    console.log(`   Total input fields on main page: ${allInputs.length}`);
    for (let i = 0; i < Math.min(allInputs.length, 10); i++) {
      const input = allInputs[i];
      const name = await input.getAttribute('name').catch(() => 'no-name');
      const id = await input.getAttribute('id').catch(() => 'no-id');
      const type = await input.getAttribute('type').catch(() => 'no-type');
      const maxlength = await input.getAttribute('maxlength').catch(() => 'no-maxlength');
      const ariaLabel = await input.getAttribute('aria-label').catch(() => 'no-aria-label');
      console.log(`   Input ${i}: name=${name}, id=${id}, type=${type}, maxlength=${maxlength}, aria-label=${ariaLabel}`);
    }
    
    throw new Error('Could not find OTP input field on page or in iframes.');
  }

  // Wait for auto-submit, then click verify if needed
  await sleep(2000);
  
  // Take screenshot after filling OTP
  if (DEBUG) {
    await page.screenshot({ path: 'auth/otp-after-fill.png' });
    console.log('   📸 Screenshot saved: auth/otp-after-fill.png');
  }
  
  const verifyBtn = page.getByRole('button', { name: /verify|continue|confirm/i }).first();
  const btnCount = await verifyBtn.count();
  const btnEnabled = btnCount > 0 ? await verifyBtn.isEnabled().catch(() => false) : false;
  console.log(`   Verify button found: ${btnCount}, enabled: ${btnEnabled}`);
  
  if (btnCount > 0 && btnEnabled) {
    console.log('   Clicking verify button...');
    await verifyBtn.click();
  } else {
    console.log('   No verify button clicked, waiting for auto-submit...');
  }
}

async function tryFillOtpInContext(context: Page | Frame, code: string): Promise<boolean> {
  // Try single OTP input first
  const singleInput = context.locator(
    'input[name*="otp" i], input[id*="otp" i], input[aria-label*="code" i], input[placeholder*="code" i]'
  ).first();

  const singleCount = await singleInput.count();
  if (singleCount > 0) {
    await singleInput.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => null);
    if (await singleInput.isVisible().catch(() => false)) {
      await singleInput.fill(code);
      console.log('   ✅ OTP filled in single input');
      return true;
    }
  }

  // Try 6 individual digit boxes
  const boxes = context.locator('input[maxlength="1"]');
  const boxCount = await boxes.count();
  if (boxCount >= 6) {
    for (let i = 0; i < 6; i++) {
      const box = boxes.nth(i);
      await box.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => null);
      if (!(await box.isVisible().catch(() => false))) {
        console.log(`   Digit box ${i + 1} not visible`);
        return false;
      }
      await box.fill(code[i]);
    }
    console.log('   ✅ OTP filled in digit boxes');
    return true;
  }

  // Try Clerk-specific selectors
  const clerkInputs = context.locator('input[inputmode="numeric"], input[type="text"][maxlength="1"], input[autocomplete="one-time-code"]');
  const clerkCount = await clerkInputs.count();
  if (clerkCount >= 6) {
    for (let i = 0; i < 6; i++) {
      await clerkInputs.nth(i).fill(code[i]);
    }
    console.log('   ✅ OTP filled using Clerk selectors');
    return true;
  }

  return false;
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
    const otpRequestedAt = new Date(Date.now() - 30_000);
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