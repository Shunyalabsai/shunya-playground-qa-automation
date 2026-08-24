/**
 * UI Test Suite — STT Models & Language Configuration
 * Tests model switching (Zero Indic, Zero Codeswitch, Zero Med) and language selectors.
 */

import { test, expect } from '@playwright/test';
import { PLAYGROUND_URL, PLAYGROUND_MODELS } from '../../config/playground.config';

test.describe('Playground UI — STT Models & Language Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'load', timeout: 60000 });
    await expect(page.getByText('API Playground')).toBeVisible({ timeout: 30000 });
  });

  test('TC-UI-010: Model dropdown contains all supported model families', async ({ page }) => {
    const select = page.locator('select').first();
    await expect(select).toBeVisible();
    const options = await select.locator('option').allTextContents();
    expect(options).toContain('Zero Indic');
    expect(options).toContain('Zero Codeswitch');
    expect(options).toContain('Zero Med');
  });

  test('TC-UI-011: Switch between Zero Indic and Zero Codeswitch models', async ({ page }) => {
    const select = page.locator('select').first();
    await select.selectOption('Zero Codeswitch');
    await page.waitForTimeout(300);
    expect(await select.inputValue()).toBe('Zero Codeswitch');
    await select.selectOption('Zero Indic');
    await page.waitForTimeout(300);
    expect(await select.inputValue()).toBe('Zero Indic');
  });

  test('TC-UI-012: Language search and selection across Indic languages', async ({ page }) => {
    const langBtn = page.locator('button').filter({ hasText: /English|Hindi|Auto/i }).first();
    await expect(langBtn).toBeVisible();
    await langBtn.click();
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder*="Search languages" i]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Hindi');
    await page.waitForTimeout(300);

    const hindiOption = page.locator('button, div[role="button"]').filter({ hasText: /Hindi/i }).first();
    await expect(hindiOption).toBeVisible();
    await hindiOption.click();
    await page.waitForTimeout(300);
  });
});
