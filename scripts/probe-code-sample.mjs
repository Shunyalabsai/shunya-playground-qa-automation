import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH = path.resolve(__dirname, '../auth/playground-auth.json');
const URL = 'https://playground.shunyalabs.ai/';

const browser = await chromium.launch({ headless: true });
const page = await browser.newContext({ storageState: AUTH }).then((c) => c.newPage());
await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
await page.getByRole('button', { name: 'Speech to Text' }).click().catch(() => {});
await page.getByRole('button', { name: 'Features' }).click().catch(() => {});
await page.waitForTimeout(500);

const row = page.locator('[role="button"]', {
  has: page.locator('span.leading-tight', { hasText: 'Translation' }),
}).first();
if (!((await row.getAttribute('class')) || '').includes('border-blue-500')) await row.click({ force: true });
const confirm = page.getByRole('button', { name: 'Confirm' });
if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) {
  await page.getByText('Hindi', { exact: true }).first().click({ force: true }).catch(() => {});
  await confirm.click({ force: true });
  await page.waitForTimeout(500);
}

await page.getByRole('button', { name: 'Code Sample' }).click();
await page.waitForTimeout(1000);
const sample = await page.locator('pre, code').allTextContents();
const joined = sample.join('\n');
console.log('has output_language:', /output_language/i.test(joined));
console.log('has enable_translation:', /enable_translation/i.test(joined));
console.log('snippet:', joined.slice(0, 1200));

await browser.close();
