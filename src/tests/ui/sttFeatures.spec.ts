/**
 * UI Test Suite — STT Audio Intelligence Features
 * Tests all 12 features toggles on the UI:
 * 1. Translation
 * 2. Transliteration
 * 3. Speaker Diarization
 * 4. Speaker Identification
 * 5. Word Timestamps
 * 6. Profanity Hashing
 * 7. Custom Keyword Hashing
 * 8. Intent Detection
 * 9. Sentiment Analysis
 * 10. Emotion Diarization
 * 11. Summarisation
 * 12. Keyword Normalisation
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import { PLAYGROUND_URL, TEST_AUDIO_FILES } from '../../config/playground.config';
import { clickFeatureToggle, dismissOpenModals } from './playgroundStt.helpers';

test.describe('Playground UI — STT Feature Toggles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'load', timeout: 60000 });
    await expect(page.getByText('API Playground')).toBeVisible({ timeout: 30000 });
    await dismissOpenModals(page);
  });

  const FEATURES = [
    'Translation',
    'Transliteration',
    'Speaker Diarization',
    'Speaker Identification',
    'Word Timestamps',
    'Profanity Hashing',
    'Custom Keyword Hashing',
    'Intent Detection',
    'Sentiment Analysis',
    'Emotion Diarization',
    'Summarisation',
    'Keyword Normalisation',
  ];

  for (const feature of FEATURES) {
    test(`TC-UI-FEAT: Toggle ${feature} feature`, async ({ page }) => {
      await clickFeatureToggle(page, feature);
      await page.waitForTimeout(500);
      await dismissOpenModals(page);
    });
  }

  test('TC-UI-FEAT-COMBINED: Enable multi-feature matrix (Timestamps + Diarization + Sentiment)', async ({ page }) => {
    await clickFeatureToggle(page, 'Word Timestamps');
    await page.waitForTimeout(300);
    await dismissOpenModals(page);

    await clickFeatureToggle(page, 'Speaker Diarization');
    await page.waitForTimeout(300);
    await dismissOpenModals(page);

    await clickFeatureToggle(page, 'Sentiment Analysis');
    await page.waitForTimeout(300);
    await dismissOpenModals(page);

    const audioPath = TEST_AUDIO_FILES.wav;
    test.skip(!fs.existsSync(audioPath), 'WAV file not found');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(audioPath);
    await page.waitForTimeout(1000);

    const runBtn = page.getByRole('button', { name: /Run Analysis/i });
    await expect(runBtn).toBeEnabled();
  });
});
