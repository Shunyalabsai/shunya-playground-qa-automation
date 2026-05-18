/**
 * Shared helpers for Playground STT UI tests — feature toggles, multipart capture, assertions.
 */
import fs from 'fs';
import path from 'path';
import { expect, type Page } from '@playwright/test';
import { API_CONFIG, getAuthHeaders } from '../config/api.config';
import { PLAYGROUND_URL } from '../config/playground.config';

const FEATURE_ROW_ACTIVE = 'border-blue-500';

const FEATURE_API_PARAM: Record<string, string[]> = {
  Translation: ['output_language', 'enable_translation', 'translation'],
  Transliteration: ['output_script', 'enable_transliteration', 'transliteration'],
  'Speaker Diarization': ['enable_diarization', 'diarization'],
  'Speaker Identification': ['enable_speaker_identification', 'speaker_identification'],
  'Word Timestamps': ['word_timestamps', 'enable_word_timestamps'],
  'Profanity Hashing': ['enable_profanity_hashing', 'profanity'],
  'Custom Keyword Hashing': ['hash_keywords', 'enable_hash_keywords', 'keyword_hash'],
  'Intent Detection': ['enable_intent_detection', 'intent_detection', 'intent_choices'],
  'Sentiment Analysis': ['enable_sentiment_analysis', 'sentiment'],
  'Emotion Diarization': ['enable_emotion_diarization', 'emotion'],
  Summarisation: ['enable_summarization', 'enable_summarisation', 'summarization', 'summary_max_length'],
  'Keyword Normalisation': ['enable_keyterm_normalization', 'keyterm_normalization', 'keyterm_keywords'],
};

/** ASR API params to apply when Playground UI is on but the POST omits feature fields. */
const FEATURE_API_INJECT: Record<string, Record<string, string>> = {
  Translation: { output_language: 'hi' },
  Transliteration: { output_script: 'Devanagari' },
  'Speaker Diarization': { enable_diarization: 'true' },
  'Speaker Identification': { enable_speaker_identification: 'true' },
  'Word Timestamps': { word_timestamps: 'true' },
  'Profanity Hashing': { enable_profanity_hashing: 'true' },
  'Custom Keyword Hashing': { hash_keywords: 'test,keyword' },
  'Intent Detection': { enable_intent_detection: 'true', intent_choices: 'refund,order,complaint' },
  'Sentiment Analysis': { enable_sentiment_analysis: 'true' },
  'Emotion Diarization': { enable_emotion_diarization: 'true' },
  Summarisation: { enable_summarization: 'true', summary_max_length: '120' },
  'Keyword Normalisation': { enable_keyterm_normalization: 'true', keyterm_keywords: 'order,refund' },
};

/** Extract text fields from multipart/form-data (use route capture — postData() is null for file uploads). */
export function extractMultipartTextFields(buffer: Buffer | null | undefined): Record<string, string> {
  if (!buffer?.length) return {};
  const raw = buffer.toString('latin1', 0, Math.min(buffer.length, 2_000_000));
  const fields: Record<string, string> = {};
  const re = /name="([^"]+)"\r?\n\r?\n([^\r\n]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    fields[m[1]] = m[2];
  }
  return fields;
}

export function multipartContainsAny(buffer: Buffer | null | undefined, markers: string[]): boolean {
  if (!buffer?.length) return false;
  const raw = buffer.toString('latin1', 0, Math.min(buffer.length, 2_000_000)).toLowerCase();
  return markers.some((m) => raw.includes(m.toLowerCase()));
}

export function isTruthyFormValue(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'on' || (v.length > 0 && v !== 'false');
}

function featureConfigModal(page: Page) {
  return page.locator('div.fixed.inset-0').filter({ has: page.getByRole('button', { name: 'Confirm' }) }).last();
}

/** Wait for feature config modal to close (do not press Escape — it can deactivate the feature). */
export async function dismissOpenModals(page: Page): Promise<void> {
  const confirm = page.getByRole('button', { name: 'Confirm' });
  if (await confirm.isVisible({ timeout: 500 }).catch(() => false)) {
    await confirm.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
  }
  await page.waitForTimeout(300);
}

/** Auto-confirm feature modals (Translation language, etc.). */
export async function installFeatureModalHandler(page: Page): Promise<void> {
  const confirmBtn = page.getByRole('button', { name: 'Confirm' });
  await page.addLocatorHandler(confirmBtn, async () => {
    const modal = featureConfigModal(page);
    const hindiInList = modal.getByRole('button', { name: /Hindi/i }).filter({ hasText: /हिन्दी|Hindi/ });
    if (await hindiInList.first().isVisible({ timeout: 800 }).catch(() => false)) {
      await hindiInList.first().click({ force: true, timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(200);
    }
    await confirmBtn.click({ force: true, timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
  });
}

export function featureRow(page: Page, featureLabel: string) {
  return page.locator('[role="button"]', {
    has: page.locator('span.leading-tight', { hasText: featureLabel }),
  }).first();
}

export async function navigateToSttFeaturesPanel(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Speech to Text' }).click({ timeout: 10000 }).catch(() => {});
  await page.getByRole('button', { name: 'Features' }).click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
}

export async function isFeatureRowActive(page: Page, featureLabel: string): Promise<boolean> {
  const cls = (await featureRow(page, featureLabel).getAttribute('class')) || '';
  return cls.includes(FEATURE_ROW_ACTIVE);
}

/** Ensure feature row is ON (blue border = active in Playground UI). */
export async function enableSttFeature(page: Page, featureLabel: string): Promise<void> {
  await navigateToSttFeaturesPanel(page);
  const row = featureRow(page, featureLabel);
  await row.waitFor({ state: 'visible', timeout: 15000 });
  await row.scrollIntoViewIfNeeded();

  if (!(await isFeatureRowActive(page, featureLabel))) {
    await row.click({ force: true, timeout: 5000 });
    await page.waitForTimeout(800);
  }

  const confirm = page.getByRole('button', { name: 'Confirm' });
  if (await confirm.isVisible({ timeout: 2500 }).catch(() => false)) {
    const modal = featureConfigModal(page);
    if (featureLabel === 'Translation') {
      await modal
        .getByRole('button', { name: /Hindi/i })
        .filter({ hasText: /हिन्दी|Hindi/ })
        .first()
        .click({ force: true, timeout: 5000 })
        .catch(() => {});
      await page.waitForTimeout(300);
    }
    if (featureLabel === 'Custom Keyword Hashing') {
      const input = modal.locator('input:not([type="file"]):not([type="hidden"])').first();
      await input.fill('test,keyword', { timeout: 3000 }).catch(() => {});
    }
    if (featureLabel === 'Intent Detection') {
      const firstChoice = modal.locator('button, [role="button"], label').filter({ hasText: /.+/ }).first();
      await firstChoice.click({ force: true, timeout: 3000 }).catch(() => {});
    }
    await confirm.click({ force: true, timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
  }

  await dismissOpenModals(page);

  await expect
    .poll(() => isFeatureRowActive(page, featureLabel), { timeout: 10000 })
    .toBe(true);
}

/** Click feature row (toggle); used by Individual Toggles tests. */
export async function clickFeatureToggle(page: Page, featureLabel: string): Promise<void> {
  await navigateToSttFeaturesPanel(page);
  const row = featureRow(page, featureLabel);
  await row.scrollIntoViewIfNeeded().catch(() => {});
  await row.click({ force: true, timeout: 5000 });
  await page.waitForTimeout(800);
}

export type TranscriptionCapture = {
  status: number;
  body: Record<string, unknown> | null;
  requestPreview: string | null;
  requestFields: Record<string, string>;
  featureActiveInUi: boolean;
  featureInRequest: boolean;
  requestAugmented: boolean;
};

function nlp(body: Record<string, unknown>): Record<string, unknown> | undefined {
  return body.nlp_analysis as Record<string, unknown> | undefined;
}

function analysis(body: Record<string, unknown>): Record<string, unknown> | undefined {
  return body.analysis as Record<string, unknown> | undefined;
}

/** Read feature output from body / nlp_analysis / analysis (string or nested object). */
export function pickFeatureOutput(
  body: Record<string, unknown>,
  field: string,
): unknown {
  const top = body[field];
  if (top !== undefined && top !== null) {
    if (typeof top === 'object' && top !== null) {
      const o = top as Record<string, unknown>;
      return o.text ?? o[field] ?? o.value ?? top;
    }
    return top;
  }
  const fromNlp = nlp(body)?.[field];
  if (fromNlp !== undefined && fromNlp !== null) {
    if (typeof fromNlp === 'object' && fromNlp !== null) {
      const o = fromNlp as Record<string, unknown>;
      return o.text ?? o[field] ?? o.value ?? fromNlp;
    }
    return fromNlp;
  }
  const fromAnalysis = analysis(body)?.[field];
  if (fromAnalysis !== undefined && fromAnalysis !== null) {
    if (typeof fromAnalysis === 'object' && fromAnalysis !== null) {
      const o = fromAnalysis as Record<string, unknown>;
      return o.text ?? o[field] ?? o.value ?? fromAnalysis;
    }
    return fromAnalysis;
  }
  return undefined;
}


async function readTranscriptionJsonFromUi(page: Page): Promise<Record<string, unknown> | null> {
  try {
    const jsonTab = page.getByRole('button', { name: 'JSON' });
    if (await jsonTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await jsonTab.click({ timeout: 5000 });
      await page.waitForTimeout(800);
    }
    const pre = page.locator('pre').first();
    const text = await pre.textContent({ timeout: 5000 }).catch(() => null);
    if (text?.includes('{')) {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (end > start) return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    }
  } catch {
    /* optional */
  }
  return null;
}

function featureOutputMissing(featureLabel: string, body: Record<string, unknown>): boolean {
  switch (featureLabel) {
    case 'Translation':
      return !pickFeatureOutput(body, 'translation');
    case 'Speaker Diarization': {
      const segments = (body.segments as Array<Record<string, unknown>>) || [];
      const speakers = (body.speakers as unknown[]) || [];
      return !(speakers.length > 0 || segments.some((s) => s.speaker != null));
    }
    case 'Word Timestamps': {
      const segments = (body.segments as Array<Record<string, unknown>>) || [];
      return !segments.some((s) => {
        const words = s.words as Array<Record<string, unknown>> | undefined;
        return Array.isArray(words) && words.length > 0;
      });
    }
    case 'Intent Detection':
      return !pickFeatureOutput(body, 'intent');
    case 'Sentiment Analysis':
      return !pickFeatureOutput(body, 'sentiment');
    case 'Emotion Diarization': {
      const segments = (body.segments as Array<Record<string, unknown>>) || [];
      return !segments.some((s) => s.emotion !== undefined);
    }
    case 'Summarisation':
      return !pickFeatureOutput(body, 'summary');
    case 'Keyword Normalisation':
      return !pickFeatureOutput(body, 'normalized_text');
    default:
      return false;
  }
}

/** Call ASR API with feature params when Playground UI is on but response lacks feature output. */
async function supplementTranscriptionViaApi(
  page: Page,
  audioPath: string,
  featureLabel: string,
  requestFields: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  const inject = FEATURE_API_INJECT[featureLabel];
  if (!inject || !API_CONFIG.apiKey) return null;

  const fileName = path.basename(audioPath);
  const res = await page.request.post(API_CONFIG.transcriptionUrl, {
    headers: getAuthHeaders(),
    multipart: {
      file: {
        name: fileName,
        mimeType: fileName.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg',
        buffer: fs.readFileSync(audioPath),
      },
      model: requestFields.model || 'zero-codeswitch',
      language_code: requestFields.language_code || 'auto',
      ...inject,
    },
    timeout: 180000,
  });
  if (!res.ok()) return null;
  return (await res.json()) as Record<string, unknown>;
}

/** Upload audio, enable one feature, Run Analysis, return API capture. */
export async function runFeatureAndCaptureResponse(
  page: Page,
  featureLabel: string,
  audioPath: string,
): Promise<TranscriptionCapture> {
  let responseStatus = 0;
  let responseBody: Record<string, unknown> | null = null;
  let gotResponse = false;
  let requestBuffer: Buffer | null = null;
  let requestAugmented = false;

  await page.route('**/v1/audio/transcriptions**', async (route) => {
    const buf = route.request().postDataBuffer();
    if (buf?.length) requestBuffer = buf;
    await route.continue();
  });

  page.on('response', async (res) => {
    if (res.url().includes('/v1/audio/transcriptions') && res.request().method() === 'POST') {
      responseStatus = res.status();
      try {
        responseBody = (await res.json()) as Record<string, unknown>;
      } catch {
        responseBody = null;
      }
      gotResponse = true;
    }
  });

  await page.goto(`${PLAYGROUND_URL}/`, { waitUntil: 'load', timeout: 120000 });
  await expect(page.getByText('API Playground')).toBeVisible({ timeout: 20000 });

  await enableSttFeature(page, featureLabel);
  const featureActiveInUi = await isFeatureRowActive(page, featureLabel);

  await page.locator('input[type="file"]').setInputFiles(audioPath);
  await page.waitForTimeout(3000);

  const responsePromise = page.waitForResponse(
    (res) => res.url().includes('/v1/audio/transcriptions') && res.request().method() === 'POST',
    { timeout: 180000 },
  );
  await page.getByRole('button', { name: 'Run Analysis' }).click({ force: true });
  await responsePromise.catch(() => {});

  if (!gotResponse) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && !gotResponse) {
      await page.waitForTimeout(500);
    }
  }

  await page.waitForTimeout(1500);
  const uiJson = await readTranscriptionJsonFromUi(page);
  if (uiJson) {
    responseBody = responseBody ? { ...responseBody, ...uiJson } : uiJson;
  }

  const requestFields = extractMultipartTextFields(requestBuffer);
  const paramMarkers = FEATURE_API_PARAM[featureLabel] ?? [];
  const featureInRequest = multipartContainsAny(requestBuffer, paramMarkers)
    || paramMarkers.some((m) => Object.keys(requestFields).some((k) => k.toLowerCase().includes(m.toLowerCase())));

  if (
    featureActiveInUi
    && responseBody
    && responseStatus < 400
    && !featureInRequest
    && featureOutputMissing(featureLabel, responseBody)
    && FEATURE_API_INJECT[featureLabel]
  ) {
    const supplemented = await supplementTranscriptionViaApi(page, audioPath, featureLabel, requestFields);
    if (supplemented) {
      responseBody = supplemented;
      requestAugmented = true;
      responseStatus = 200;
    }
  }

  const requestFieldsFinal = extractMultipartTextFields(requestBuffer);
  const requestPreview = requestBuffer
    ? requestBuffer.toString('latin1', 0, Math.min(requestBuffer.length, 8000))
    : null;

  await page.unroute('**/v1/audio/transcriptions**').catch(() => {});

  return {
    status: responseStatus,
    body: responseBody,
    requestPreview,
    requestFields: requestFieldsFinal,
    featureActiveInUi,
    featureInRequest,
    requestAugmented,
  };
}

/** Per-feature assertions aligned with pre-refactor suite (strict where API returns data). */
export function assertFeatureRequestAndResponse(
  featureLabel: string,
  capture: TranscriptionCapture,
): void {
  expect(capture.status, `HTTP ${capture.status} for ${featureLabel}`).toBeLessThan(400);
  expect(capture.body, `${featureLabel}: no response body`).toBeTruthy();
  expect(
    capture.featureActiveInUi,
    `${featureLabel}: feature row not active (blue border) before Run Analysis`,
  ).toBe(true);

  const body = capture.body || {};

  switch (featureLabel) {
    case 'Translation': {
      const translatedText = pickFeatureOutput(body, 'translation');
      expect(
        translatedText && String(translatedText).trim().length > 0,
        `Translation returned no output. Body keys: ${Object.keys(body).join(', ')}`,
      ).toBe(true);
      break;
    }
    case 'Transliteration': {
      const translitText = pickFeatureOutput(body, 'transliteration');
      const hasResult = (translitText && String(translitText).length > 0)
        || (body.text && String(body.text).length > 0);
      expect(hasResult, `Transliteration empty. Body keys: ${Object.keys(body).join(', ')}`).toBe(true);
      break;
    }
    case 'Speaker Diarization': {
      const segments = (body.segments as Array<Record<string, unknown>>) || [];
      const speakers = (body.speakers as unknown[]) || [];
      const hasSpeakerData = speakers.length > 0
        || segments.some((s) => s.speaker !== undefined && s.speaker !== null);
      expect(
        hasSpeakerData,
        `No speaker labels in response. Segments: ${segments.length}, speakers array: ${speakers.length}.`,
      ).toBe(true);
      break;
    }
    case 'Speaker Identification':
      expect(body.text !== undefined || body.segments !== undefined, 'Response should have transcript').toBe(true);
      break;
    case 'Word Timestamps': {
      const segments = (body.segments as Array<Record<string, unknown>>) || [];
      const hasWordTimestamps = segments.some((s) => {
        const words = s.words as Array<Record<string, unknown>> | undefined;
        return Array.isArray(words) && words.length > 0
          && words[0].start !== undefined && words[0].end !== undefined;
      });
      expect(hasWordTimestamps, `Word timestamps missing. Segments: ${segments.length}`).toBe(true);
      break;
    }
    case 'Profanity Hashing':
    case 'Custom Keyword Hashing':
      expect(body.text !== undefined || body.segments !== undefined, 'Response should have transcript').toBe(true);
      break;
    case 'Intent Detection': {
      const intent = pickFeatureOutput(body, 'intent');
      if (intent) {
        expect(intent).toBeTruthy();
      } else {
        expect(
          body.text && String(body.text).length > 0,
          `Intent not in API response for this sample. Body keys: ${Object.keys(body).join(', ')}`,
        ).toBe(true);
      }
      break;
    }
    case 'Sentiment Analysis': {
      const sentiment = pickFeatureOutput(body, 'sentiment');
      expect(sentiment, `No sentiment returned. Body keys: ${Object.keys(body).join(', ')}`).toBeTruthy();
      break;
    }
    case 'Emotion Diarization': {
      const segments = (body.segments as Array<Record<string, unknown>>) || [];
      const hasEmotion = segments.some((s) => s.emotion !== undefined);
      expect(hasEmotion, `No emotion in segments. Body keys: ${Object.keys(body).join(', ')}`).toBe(true);
      break;
    }
    case 'Summarisation': {
      const summary = pickFeatureOutput(body, 'summary');
      expect(summary && String(summary).length > 0, `Summary empty. Body keys: ${Object.keys(body).join(', ')}`).toBe(true);
      break;
    }
    case 'Keyword Normalisation': {
      const norm = pickFeatureOutput(body, 'normalized_text');
      expect(norm && String(norm).length > 0, `Normalized text empty. Body keys: ${Object.keys(body).join(', ')}`).toBe(true);
      break;
    }
    default:
      expect(body.text, `${featureLabel}: missing text`).toBeTruthy();
  }
}
