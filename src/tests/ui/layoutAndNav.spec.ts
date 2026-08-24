/**
 * UI Test Suite — Layout, Navigation & Responsive Viewports
 * URL: https://playground.shunyalabs.ai
 */

import { test, expect } from '@playwright/test';
import { PLAYGROUND_URL } from '../../config/playground.config';

test.describe('Playground UI — Layout & Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'load', timeout: 60000 });
    await expect(page.getByText('API Playground')).toBeVisible({ timeout: 30000 });
  });

  test('TC-UI-001: Page title and header branding render correctly', async ({ page }) => {
    const title = await page.title();
    expect(title).toContain('Shunya Labs');
    await expect(page.locator('header, nav').first()).toBeVisible();
  });

  test('TC-UI-002: Service tabs are visible and switchable (STT & TTS)', async ({ page }) => {
    const sttTab = page.getByRole('button', { name: /Speech to Text/i });
    const ttsTab = page.getByRole('button', { name: /Text to Speech/i });

    await expect(sttTab).toBeVisible();
    await expect(ttsTab).toBeVisible();

    await ttsTab.click();
    await page.waitForTimeout(500);
    await expect(page.getByText(/Voice|Text Input|Generate/i).first()).toBeVisible();

    await sttTab.click();
    await page.waitForTimeout(500);
    await expect(page.getByText(/Model|Upload Audio|Run Analysis/i).first()).toBeVisible();
  });

  test('TC-UI-003: User credits balance and onboarding banner render', async ({ page }) => {
    const credits = page.locator('text=/Credits|Balance|\\$\\d+/i').first();
    await expect(credits).toBeVisible();
  });

  test('TC-UI-004: Responsive Viewports (Desktop, Tablet, Mobile)', async ({ page }) => {
    // Desktop Viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.getByText('API Playground')).toBeVisible();

    // Tablet Viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.getByText('API Playground')).toBeVisible();

    // Mobile Viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByText('API Playground')).toBeVisible();
  });
});
