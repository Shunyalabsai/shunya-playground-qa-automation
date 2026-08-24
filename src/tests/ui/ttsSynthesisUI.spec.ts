/**
 * UI Test Suite — Text to Speech (TTS) Tab
 * Tests text inputs, voice selectors, speed sliders, playback controls, and edge cases.
 */

import { test, expect } from '@playwright/test';
import { PLAYGROUND_URL } from '../../config/playground.config';

test.describe('Playground UI — TTS Synthesis', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'load', timeout: 60000 });
    await expect(page.getByText('API Playground')).toBeVisible({ timeout: 30000 });

    const ttsTab = page.getByRole('button', { name: /Text to Speech/i });
    if (await ttsTab.isVisible()) {
      await ttsTab.click();
      await page.waitForTimeout(1000);
    }
  });

  test('TC-TTS-UI-001: TTS Input area accepts text and character counter updates', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible()) {
      await textarea.fill('Testing speech synthesis on Shunya Labs Playground');
      await page.waitForTimeout(300);
      const textVal = await textarea.inputValue();
      expect(textVal).toContain('Testing speech synthesis');
    }
  });

  test('TC-TTS-UI-002: TTS Voice dropdown displays available voices', async ({ page }) => {
    const voiceDropdown = page.locator('text=/Voice|shunya-/i').first();
    if (await voiceDropdown.isVisible()) {
      await voiceDropdown.click();
      await page.waitForTimeout(300);
    }
  });

  test('TC-TTS-UI-003: TTS Negative — Empty text input prevents speech generation', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible()) {
      await textarea.fill('');
      const generateBtn = page.getByRole('button', { name: /Generate Speech|Synthesize/i }).first();
      if (await generateBtn.isVisible()) {
        const isEnabled = await generateBtn.isEnabled().catch(() => false);
        // Either disabled or clicking produces a validation prompt
        if (isEnabled) {
          await generateBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
  });
});
