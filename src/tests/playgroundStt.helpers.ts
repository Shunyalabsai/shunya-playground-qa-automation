/**
 * Shared helpers for Playground STT UI tests — feature toggles, multipart capture, assertions.
 */
import { expect, type Page } from '@playwright/test';
import { PLAYGROUND_URL } from '../config/playground.config';

/** Extract text fields from multipart/form-data POST bodies (Playwright postData() is null for multipart). */
export function extractMultipartTextFields(buffer: Buffer | null | undefined): Record<string, string> {
  if (!buffer?.length) return {};
  const raw = buffer.toString('latin1', 0, Math.min(buffer.length, 512_000));
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
  const raw = buffer.toString('latin1', 0, Math.min(buffer.length, 512_000)).toLowerCase();
  return markers.some((m) => raw.includes(m.toLowerCase()));
}

/** Match feature markers in multipart body and/or parsed form field names/values. */
export function requestContainsMarkers(
  capture: Pick<TranscriptionCapture, 'requestBuffer' | 'requestFields'>,
  markers: string[],
): boolean {
  if (multipartContainsAny(capture.requestBuffer, markers)) return true;
  for (const marker of markers) {
    const m = marker.toLowerCase();
    for (const [key, value] of Object.entries(capture.requestFields)) {
      const kl = key.toLowerCase();
      if (kl.includes(m) || m.includes(kl)) {
        if (kl.startsWith('enable_') && !isTruthyFormValue(value)) continue;
        return true;
      }
      if (value.toLowerCase().includes(m)) return true;
    }
  }
  return false;
}

export function isTruthyFormValue(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'on' || (v.length > 0 && v !== 'false');
}

/** Dismiss feature configuration modal (Translation language, etc.). */
export async function confirmFeatureModalIfOpen(page: Page, featureLabel?: string): Promise<void> {
  const confirm = page.getByRole('button', { name: 'Confirm' });
  const visible = await confirm.isVisible({ timeout: 2500 }).catch(() => false);
  if (!visible) return;

  if (featureLabel === 'Translation') {
    await page.getByText('Hindi', { exact: false }).first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
  }

  await confirm.click({ timeout: 5000 });
  await page.waitForTimeout(400);
}

/** Click a feature label and confirm any modal (use instead of raw span click). */
export async function clickFeatureToggle(page: Page, featureLabel: string): Promise<void> {
  const label = page.locator('span.leading-tight', { hasText: featureLabel }).first();
  await label.scrollIntoViewIfNeeded().catch(() => {});
  await label.click({ force: true, timeout: 5000 }).catch(() => {});
  await confirmFeatureModalIfOpen(page, featureLabel);
  await page.waitForTimeout(300);
}

/**
 * Enable an STT feature: STT tab → Features tab → toggle switch ON → confirm modal.
 */
export async function enableSttFeature(page: Page, featureLabel: string): Promise<void> {
  await page.getByRole('button', { name: 'Speech to Text' }).click({ timeout: 10000 }).catch(() => {});
  await page.getByRole('button', { name: 'Features' }).click({ timeout: 10000 }).catch(() => {});

  const label = page.locator('span.leading-tight', { hasText: featureLabel }).first();
  await label.waitFor({ state: 'visible', timeout: 15000 });
  await label.scrollIntoViewIfNeeded();

  const row = label.locator('xpath=ancestor::*[@role="button"][1]');
  const switchInRow = row.getByRole('switch').first();
  const globalSwitch = page.getByRole('switch', { name: new RegExp(featureLabel, 'i') }).first();

  let toggled = false;
  if (await switchInRow.count()) {
    const on = (await switchInRow.getAttribute('aria-checked')) === 'true';
    if (!on) {
      await switchInRow.click({ timeout: 5000 });
      toggled = true;
    }
  } else if (await globalSwitch.count()) {
    const on = (await globalSwitch.getAttribute('aria-checked')) === 'true';
    if (!on) {
      await globalSwitch.click({ timeout: 5000 });
      toggled = true;
    }
  } else if (await row.count()) {
    await row.click({ timeout: 5000 });
    toggled = true;
  } else {
    await label.click({ force: true, timeout: 5000 });
    toggled = true;
  }

  if (toggled) {
    await confirmFeatureModalIfOpen(page, featureLabel);
  }

  if (await switchInRow.count()) {
    await expect(switchInRow).toHaveAttribute('aria-checked', 'true', { timeout: 8000 });
  }
}

export type TranscriptionCapture = {
  status: number;
  body: Record<string, unknown> | null;
  requestFields: Record<string, string>;
  requestBuffer: Buffer | null;
};

export interface SttFeatureSpec {
  requestMarkers: string[];
  assertResponse: (body: Record<string, unknown>) => { ok: boolean; detail: string };
}

export const STT_FEATURE_SPECS: Record<string, SttFeatureSpec> = {
  Translation: {
    requestMarkers: ['output_language', 'output_lang', 'enable_translation', 'translation'],
    assertResponse: (body) => {
      const t = body.translation ?? body.translated_text
        ?? (body.nlp_analysis as Record<string, unknown> | undefined)?.translation;
      const text = typeof t === 'object' && t !== null ? (t as { text?: string }).text : t;
      if (text && String(text).length > 0) return { ok: true, detail: '' };
      return { ok: false, detail: 'missing translation / translated_text in response' };
    },
  },
  Transliteration: {
    requestMarkers: ['output_script', 'transliteration', 'enable_transliteration'],
    assertResponse: (body) => {
      const tr = body.transliteration
        ?? (body.nlp_analysis as Record<string, unknown> | undefined)?.transliteration;
      const text = typeof tr === 'object' && tr !== null ? (tr as { text?: string }).text : tr;
      if (text && String(text).length > 0) return { ok: true, detail: '' };
      const script = body.output_script;
      if (script && String(script).length > 0 && String(script).toLowerCase() !== 'auto') {
        return { ok: true, detail: '' };
      }
      return { ok: false, detail: 'missing transliteration or output_script in response' };
    },
  },
  'Speaker Diarization': {
    requestMarkers: ['enable_diarization', 'diarization'],
    assertResponse: (body) => {
      const segments = (body.segments as Array<Record<string, unknown>>) || [];
      const speakers = (body.speakers as unknown[]) || [];
      const has = speakers.length > 0 || segments.some((s) => s.speaker !== undefined && s.speaker !== null);
      return has
        ? { ok: true, detail: '' }
        : { ok: false, detail: `no speaker labels (segments=${segments.length}, speakers=${speakers.length})` };
    },
  },
  'Speaker Identification': {
    requestMarkers: ['enable_speaker_identification', 'speaker_identification'],
    assertResponse: (body) => {
      const speakers = (body.speakers as Array<Record<string, unknown>>) || [];
      const identified = speakers.some((s) => s.name || s.speaker_id || s.id);
      if (identified) return { ok: true, detail: '' };
      const segments = (body.segments as Array<Record<string, unknown>>) || [];
      const hasSpeakerLabel = segments.some((s) => s.speaker !== undefined && s.speaker !== null);
      return hasSpeakerLabel
        ? { ok: true, detail: '' }
        : { ok: false, detail: 'no speaker identification metadata in response' };
    },
  },
  'Word Timestamps': {
    requestMarkers: ['word_timestamps', 'enable_word_timestamps'],
    assertResponse: (body) => {
      const segments = (body.segments as Array<Record<string, unknown>>) || [];
      const has = segments.some((s) => {
        const words = s.words as Array<Record<string, unknown>> | undefined;
        return Array.isArray(words) && words.length > 0
          && words[0].start !== undefined && words[0].end !== undefined;
      });
      return has ? { ok: true, detail: '' } : { ok: false, detail: 'segments lack word-level timestamps' };
    },
  },
  'Profanity Hashing': {
    requestMarkers: ['enable_profanity_hashing', 'profanity'],
    assertResponse: (body) => {
      const flagged = body.profanity ?? body.redaction ?? body.hashed_text
        ?? (body.nlp_analysis as Record<string, unknown> | undefined)?.profanity;
      return flagged !== undefined
        ? { ok: true, detail: '' }
        : { ok: false, detail: 'no profanity / redaction fields in response' };
    },
  },
  'Custom Keyword Hashing': {
    requestMarkers: ['hash_keywords', 'custom_keyword', 'keyword_hash'],
    assertResponse: (body) => {
      const kw = body.hash_keywords ?? body.keyword_hashes ?? body.keywords_hashed
        ?? (body.nlp_analysis as Record<string, unknown> | undefined)?.keyword_hashes;
      return kw !== undefined
        ? { ok: true, detail: '' }
        : { ok: false, detail: 'no keyword hash fields in response' };
    },
  },
  'Intent Detection': {
    requestMarkers: ['enable_intent_detection', 'intent_detection', 'intent_choices'],
    assertResponse: (body) => {
      const intent = body.intent
        ?? (body.nlp_analysis as Record<string, unknown> | undefined)?.intent
        ?? (body.analysis as Record<string, unknown> | undefined)?.intent;
      return intent
        ? { ok: true, detail: '' }
        : { ok: false, detail: 'missing intent in response' };
    },
  },
  'Sentiment Analysis': {
    requestMarkers: ['enable_sentiment_analysis', 'sentiment'],
    assertResponse: (body) => {
      const sentiment = body.sentiment
        ?? (body.nlp_analysis as Record<string, unknown> | undefined)?.sentiment
        ?? (body.analysis as Record<string, unknown> | undefined)?.sentiment;
      return sentiment
        ? { ok: true, detail: '' }
        : { ok: false, detail: 'missing sentiment in response' };
    },
  },
  'Emotion Diarization': {
    requestMarkers: ['enable_emotion_diarization', 'emotion'],
    assertResponse: (body) => {
      const segments = (body.segments as Array<Record<string, unknown>>) || [];
      const has = segments.some((s) => s.emotion !== undefined);
      return has ? { ok: true, detail: '' } : { ok: false, detail: 'no emotion in segments' };
    },
  },
  Summarisation: {
    requestMarkers: ['enable_summarization', 'enable_summarisation', 'summarization', 'summary_max_length'],
    assertResponse: (body) => {
      const summary = body.summary
        ?? (body.nlp_analysis as Record<string, unknown> | undefined)?.summary
        ?? (body.analysis as Record<string, unknown> | undefined)?.summary;
      return summary && String(summary).length > 0
        ? { ok: true, detail: '' }
        : { ok: false, detail: 'missing summary in response' };
    },
  },
  'Keyword Normalisation': {
    requestMarkers: ['enable_keyterm_normalization', 'keyterm_normalization', 'keyterm_keywords'],
    assertResponse: (body) => {
      const norm = body.normalized_text
        ?? (body.nlp_analysis as Record<string, unknown> | undefined)?.normalized_text
        ?? (body.analysis as Record<string, unknown> | undefined)?.normalized_text;
      return norm && String(norm).length > 0
        ? { ok: true, detail: '' }
        : { ok: false, detail: 'missing normalized_text in response' };
    },
  },
};

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

  page.on('request', (req) => {
    if (req.url().includes('/v1/audio/transcriptions') && req.method() === 'POST') {
      requestBuffer = req.postDataBuffer() ?? null;
    }
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

  await page.goto(`${PLAYGROUND_URL}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await expect(page.getByText('API Playground')).toBeVisible({ timeout: 20000 });

  await enableSttFeature(page, featureLabel);

  await page.locator('input[type="file"]').setInputFiles(audioPath);
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Run Analysis' }).click();

  const deadline = Date.now() + 180000;
  while (Date.now() < deadline && !gotResponse) {
    await page.waitForTimeout(500);
  }

  const requestFields = extractMultipartTextFields(requestBuffer);
  return {
    status: responseStatus,
    body: responseBody,
    requestFields,
    requestBuffer,
  };
}

export function assertFeatureRequestAndResponse(
  featureLabel: string,
  capture: TranscriptionCapture,
): void {
  const spec = STT_FEATURE_SPECS[featureLabel];
  expect(spec, `Unknown feature: ${featureLabel}`).toBeTruthy();
  expect(capture.status, `HTTP ${capture.status} for ${featureLabel}`).toBeLessThan(400);
  expect(
    requestContainsMarkers(capture, spec.requestMarkers),
    `${featureLabel}: request missing expected fields (${spec.requestMarkers.join(', ')}). ` +
      `Got form keys: ${Object.keys(capture.requestFields).join(', ') || '(none)'}`,
  ).toBe(true);
  const { ok, detail } = spec.assertResponse(capture.body || {});
  expect(ok, `${featureLabel}: ${detail}. Body keys: ${Object.keys(capture.body || {}).join(', ')}`).toBe(true);
}
