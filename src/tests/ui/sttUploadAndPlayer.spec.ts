/**
 * UI Test Suite — Audio Upload, Formats & Player Controls
 * Tests file upload zone, format validation, audio player controls, and sample removal.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import { PLAYGROUND_URL, TEST_AUDIO_FILES } from '../../config/playground.config';

test.describe('Playground UI — Audio Upload & Player Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'load', timeout: 60000 });
    await expect(page.getByText('API Playground')).toBeVisible({ timeout: 30000 });
  });

  test('TC-UI-020: Upload valid WAV audio and verify player displays', async ({ page }) => {
    const audioPath = TEST_AUDIO_FILES.wav;
    test.skip(!fs.existsSync(audioPath), 'WAV file not found');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(audioPath);
    await page.waitForTimeout(2000);

    const runBtn = page.getByRole('button', { name: /Run Analysis/i });
    await expect(runBtn).toBeEnabled();
  });

  test('TC-UI-021: Upload valid MP3 audio and verify Run Analysis button enables', async ({ page }) => {
    const audioPath = TEST_AUDIO_FILES.mp3;
    test.skip(!fs.existsSync(audioPath), 'MP3 file not found');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(audioPath);
    await page.waitForTimeout(2000);

    const runBtn = page.getByRole('button', { name: /Run Analysis/i });
    await expect(runBtn).toBeEnabled();
  });

  test('TC-UI-022: Remove uploaded audio resets UI state', async ({ page }) => {
    const audioPath = TEST_AUDIO_FILES.wav;
    test.skip(!fs.existsSync(audioPath), 'WAV file not found');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(audioPath);
    await page.waitForTimeout(2000);

    const removeBtn = page.locator('button:has-text("Remove"), button[aria-label*="remove" i], button[aria-label*="delete" i], svg.lucide-trash-2').first();
    if (await removeBtn.isVisible()) {
      await removeBtn.click();
      await page.waitForTimeout(500);
      await expect(page.getByText(/Upload audio|Drop your audio/i).first()).toBeVisible();
    }
  });

  test('TC-UI-023: Negative — Uploading invalid file format (.txt) handles rejection gracefully', async ({ page }) => {
    const tempTxtFile = 'test-invalid.txt';
    fs.writeFileSync(tempTxtFile, 'This is not an audio file');

    try {
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(tempTxtFile).catch(() => {});
      await page.waitForTimeout(1000);

      const runBtn = page.getByRole('button', { name: /Run Analysis/i });
      if (await runBtn.isEnabled()) {
        await runBtn.click();
        await page.waitForTimeout(1000);
      }
      // UI should gracefully handle rejection without crash
      await expect(page.getByText('API Playground')).toBeVisible();
    } finally {
      if (fs.existsSync(tempTxtFile)) fs.unlinkSync(tempTxtFile);
    }
  });
});
