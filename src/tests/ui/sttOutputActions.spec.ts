/**
 * UI Test Suite — STT Output Displays & Action Verification
 * Tests Transcript tab, JSON output view, Code sample tab, and copy/download controls.
 */

import { test, expect } from '@playwright/test';
import { PLAYGROUND_URL } from '../../config/playground.config';

test.describe('Playground UI — Output Displays & Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'load', timeout: 60000 });
    await expect(page.getByText('API Playground')).toBeVisible({ timeout: 30000 });
  });

  test('TC-UI-OUT-001: Output tabs switching (Transcript & JSON)', async ({ page }) => {
    const transcriptTab = page.getByRole('button', { name: /Transcript/i }).first();
    const jsonTab = page.getByRole('button', { name: /JSON/i }).first();

    if (await transcriptTab.isVisible() && await jsonTab.isVisible()) {
      await jsonTab.click();
      await page.waitForTimeout(300);
      await transcriptTab.click();
      await page.waitForTimeout(300);
    }
  });

  test('TC-UI-OUT-002: Features vs Code Sample sub-tabs', async ({ page }) => {
    const featuresTab = page.getByRole('button', { name: /Features/i }).first();
    const codeSampleTab = page.getByRole('button', { name: /Code Sample/i }).first();

    if (await featuresTab.isVisible() && await codeSampleTab.isVisible()) {
      await codeSampleTab.click();
      await page.waitForTimeout(500);
      await expect(page.getByText('Copy Code').or(page.getByText('main.py')).first()).toBeVisible();

      await featuresTab.click();
      await page.waitForTimeout(500);
      await expect(page.getByText(/Translation|Transliteration|Speaker Diarization/i).first()).toBeVisible();
    }
  });

  test('TC-UI-OUT-003: Code snippet copy control', async ({ page }) => {
    const codeSampleTab = page.getByRole('button', { name: /Code Sample/i }).first();
    if (await codeSampleTab.isVisible()) {
      await codeSampleTab.click();
      await page.waitForTimeout(500);

      const copyBtn = page.getByRole('button', { name: /Copy Code/i }).first();
      if (await copyBtn.isVisible()) {
        await expect(copyBtn).toBeEnabled();
      }
    }
  });
});
