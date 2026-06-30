/**
 * Quick check: can headless Playwright reach the logged-in Playground?
 * Usage: npm run playground:verify-auth
 */
import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_PATH = path.resolve(__dirname, '..', 'auth', 'playground-auth.json');
const PLAYGROUND_URL = process.env.PLAYGROUND_URL || 'https://playground.shunyalabs.ai/';

function cookieSummary(file: string): void {
  const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as { cookies?: { name: string; domain: string }[] };
  const cookies = data.cookies || [];
  const hasPlaygroundSession = cookies.some(
    (c) => c.domain.includes('playground.shunyalabs.ai') && c.name.startsWith('__session'),
  );
  console.log(`   Cookies: ${cookies.length} total`);
  console.log(`   Playground __session cookie: ${hasPlaygroundSession ? 'yes' : 'NO — re-run npm run playground:login on Mac'}`);
}

(async () => {
  console.log('\n🔍 Playground auth verify');
  console.log('========================');

  if (!fs.existsSync(AUTH_PATH)) {
    console.error(`❌ Missing ${AUTH_PATH}`);
    console.error('   Mac: npm run playground:login');
    process.exit(1);
  }

  console.log(`📁 ${AUTH_PATH}`);
  cookieSummary(AUTH_PATH);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: AUTH_PATH });
  const page = await context.newPage();

  try {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(3000);

    const url = page.url();
    const body = (await page.textContent('body')) || '';
    const onPlayground = body.includes('API Playground');
    const onSignIn = url.includes('accounts.shunyalabs.ai') || url.includes('sign-in');

    console.log(`\n   Final URL: ${url}`);
    console.log(`   API Playground visible: ${onPlayground ? 'yes' : 'no'}`);

    if (onPlayground && !onSignIn) {
      console.log('\n✅ Auth OK — safe to run UI tests.\n');
      process.exit(0);
    }

    console.log('\n❌ Auth NOT valid for tests (still on sign-in or playground UI missing).');
    console.log('   Fix on Mac:');
    console.log('     cd Playground_repo/playground-testing');
    console.log('     npm run playground:login');
    console.log('   Then copy to server:');
    console.log('     scp auth/playground-auth.json yamini@136.119.127.72:~/projects/playground-testing/auth/\n');
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
