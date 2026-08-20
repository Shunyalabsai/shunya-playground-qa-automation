/**
 * Save Playground Auth State
 * Opens a headed browser to https://playground.shunyalabs.ai
 * Wait for manual login, then saves the session cookies/storage for reuse in tests.
 *
 * Usage: npx playwright test scripts/save-playground-auth.ts --headed
 */

import { chromium } from '@playwright/test';
import * as path from 'path';

const AUTH_STATE_PATH = path.resolve(__dirname, '..', 'auth', 'playground-auth.json');

(async () => {
  console.log('\n🔐 Playground Auth Setup');
  console.log('========================');
  console.log('A browser will open. Please log in to playground.shunyalabs.ai.');
  console.log('Once you see the Playground page (API Playground), come back here.\n');

  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://playground.shunyalabs.ai/', { waitUntil: 'networkidle' });

  // Wait for the user to log in and reach the playground page
  console.log('⏳ Waiting for you to log in... (looking for "API Playground" text)');
  console.log('   You have up to 5 minutes to complete login.\n');

  try {
    // Wait for "API Playground" text which only appears after successful login
    await page.waitForSelector('text=API Playground', { timeout: 300000 });
    // Give it a moment to fully load cookies/state
    await page.waitForTimeout(3000);
    console.log('✅ Login detected! Saving auth state...\n');
  } catch {
    console.log('⚠️  Could not detect "API Playground" text automatically.');
    console.log('   Saving current state anyway (you may already be logged in).\n');
  }

  // Save the authenticated state
  await context.storageState({ path: AUTH_STATE_PATH });

  console.log(`💾 Auth state saved to: ${AUTH_STATE_PATH}`);
  console.log('   You can now run UI tests with: npm run test:playground-ui\n');

  await browser.close();
})();
