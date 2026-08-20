import { test } from '@playwright/test';
import { TEST_AUDIO_FILES } from '../config/playground.config';
import {
  pickFeatureOutput,
  runFeatureAndCaptureResponse,
} from './playgroundStt.helpers';

const FEATURES: Array<{ label: string; outputField?: string }> = [
  { label: 'Translation', outputField: 'translation' },
  { label: 'Transliteration', outputField: 'transliteration' },
  { label: 'Speaker Diarization' },
  { label: 'Speaker Identification' },
  { label: 'Word Timestamps' },
  { label: 'Profanity Hashing' },
  { label: 'Custom Keyword Hashing' },
  { label: 'Intent Detection', outputField: 'intent' },
  { label: 'Sentiment Analysis', outputField: 'sentiment' },
  { label: 'Emotion Diarization' },
  { label: 'Summarisation', outputField: 'summary' },
  { label: 'Keyword Normalisation', outputField: 'normalized_text' },
];

test.describe('One File Feature Snapshot', () => {
  test('show all STT feature outputs on one input file', async ({ page }) => {
    test.setTimeout(1800000);
    const results: Array<Record<string, unknown>> = [];

    for (const feature of FEATURES) {
      try {
        const capture = await runFeatureAndCaptureResponse(page, feature.label, TEST_AUDIO_FILES.wav);
        const body = capture.body || {};
        const text = String((body as Record<string, unknown>).text || '');
        const output = feature.outputField ? pickFeatureOutput(body, feature.outputField) : undefined;

        results.push({
          feature: feature.label,
          status: capture.status,
          bodyKeys: Object.keys(body),
          hasText: text.trim().length > 0,
          textPreview: text.trim().slice(0, 120),
          featureInRequest: capture.featureInRequest,
          requestAugmented: capture.requestAugmented,
          outputField: feature.outputField || null,
          outputPreview: output ? String(output).slice(0, 120) : null,
        });
      } catch (error) {
        results.push({
          feature: feature.label,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log('\n=== ONE FILE ALL FEATURES SNAPSHOT ===');
    console.log(JSON.stringify({
      inputFile: TEST_AUDIO_FILES.wav,
      totalFeatures: FEATURES.length,
      results,
    }, null, 2));
  });
});
