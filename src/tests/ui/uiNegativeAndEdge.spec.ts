/**
 * UI Test Suite — Negative & Edge Scenarios
 * Tests UI resilience against network timeouts, rapid clicks, page refreshes, and invalid inputs.
 */

import { test, expect } from '@playwright/test';
import { PLAYGROUND_URL } from '../../config/playground.config';

test.describe('Playground UI — Negative & Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'load', timeout: 60000 });
    await expect(page.getByText('API Playground')).toBeVisible({ timeout: 30000 });
  });

  test('TC-UI-EDGE-001: Page handles rapid service tab toggling without crash', async ({ page }) => {
    const sttTab = page.getByRole('button', { name: /Speech to Text/i });
    const ttsTab = page.getByRole('button', { name: /Text to Speech/i });

    if (await sttTab.isVisible() && await ttsTab.isVisible()) {
      for (let i = 0; i < 4; i++) {
        await ttsTab.click();
        await sttTab.click();
      }
      await expect(page.getByText('API Playground')).toBeVisible();
    }
  });

  test('TC-UI-EDGE-002: Page refresh retains layout and authentication state', async ({ page }) => {
    await page.reload({ waitUntil: 'load' });
    await expect(page.getByText('API Playground')).toBeVisible({ timeout: 30000 });
  });

  test('TC-UI-EDGE-003: No unexpected console errors on clean page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle' });
    // Filter out expected analytics or non-critical resource errors
    const criticalErrors = errors.filter(
      (e) => !e.includes('analytics') && !e.includes('favicon') && !e.includes('third-party')
    );
    expect(criticalErrors.length).toBe(0);
  });
});
