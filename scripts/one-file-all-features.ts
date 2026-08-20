import { chromium } from '@playwright/test';
import * as path from 'path';
import { TEST_AUDIO_FILES } from '../src/config/playground.config';
import {
  pickFeatureOutput,
  runFeatureAndCaptureResponse,
  type TranscriptionCapture,
} from '../src/tests/playgroundStt.helpers';

type FeatureCase = {
  label: string;
  outputField?: string;
};

const FEATURES: FeatureCase[] = [
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

function summarizeCapture(fc: FeatureCase, capture: TranscriptionCapture) {
  const body = capture.body || {};
  const keys = Object.keys(body);
  const segments = Array.isArray((body as Record<string, unknown>).segments)
    ? (((body as Record<string, unknown>).segments as unknown[]) || []).length
    : 0;
  const speakers = Array.isArray((body as Record<string, unknown>).speakers)
    ? (((body as Record<string, unknown>).speakers as unknown[]) || []).length
    : 0;
  const text = String((body as Record<string, unknown>).text || '');
  const output = fc.outputField ? pickFeatureOutput(body, fc.outputField) : undefined;

  return {
    feature: fc.label,
    status: capture.status,
    keys,
    hasText: text.trim().length > 0,
    textPreview: text.trim().slice(0, 80),
    segments,
    speakers,
    featureInRequest: capture.featureInRequest,
    requestAugmented: capture.requestAugmented,
    outputField: fc.outputField || null,
    outputPreview: output ? String(output).slice(0, 100) : null,
  };
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    storageState: path.resolve(__dirname, '..', 'auth', 'playground-auth.json'),
  });
  const page = await context.newPage();

  const rows: Array<Record<string, unknown>> = [];
  for (const fc of FEATURES) {
    try {
      const capture = await runFeatureAndCaptureResponse(page, fc.label, TEST_AUDIO_FILES.wav);
      rows.push(summarizeCapture(fc, capture));
    } catch (error) {
      rows.push({
        feature: fc.label,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify({
    inputFile: TEST_AUDIO_FILES.wav,
    totalFeatures: FEATURES.length,
    results: rows,
  }, null, 2));

  await context.close();
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
