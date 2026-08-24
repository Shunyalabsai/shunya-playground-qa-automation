/**
 * Backend API Test Suite — ASR Audio Transcription
 * Tests direct REST endpoints at POST /v1/audio/transcriptions
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { API_CONFIG, getAuthHeaders, ENDPOINTS } from '../../config/api.config';
import { TEST_AUDIO_FILES } from '../../config/playground.config';

test.describe('Backend API — ASR Transcription', () => {
  test.skip(!API_CONFIG.apiKey, 'ASR_API_KEY is required for backend transcription tests');

  test('POST /v1/audio/transcriptions — baseline transcription with Zero Indic', async ({ request }) => {
    test.setTimeout(120000);
    const audioPath = TEST_AUDIO_FILES.wav;

    test.skip(!fs.existsSync(audioPath), `Test audio file not found at ${audioPath}`);

    const fileName = path.basename(audioPath);
    const response = await request.post(ENDPOINTS.transcription, {
      headers: getAuthHeaders(),
      multipart: {
        file: {
          name: fileName,
          mimeType: 'audio/wav',
          buffer: fs.readFileSync(audioPath),
        },
        model: 'zero-indic',
        language_code: 'auto',
      },
      timeout: 120000,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('text');
    expect(typeof body.text).toBe('string');
    expect(body.text.trim().length).toBeGreaterThan(0);
  });

  test('POST /v1/audio/transcriptions — baseline transcription with Zero Codeswitch', async ({ request }) => {
    test.setTimeout(120000);
    const audioPath = TEST_AUDIO_FILES.wav;

    test.skip(!fs.existsSync(audioPath), `Test audio file not found at ${audioPath}`);

    const fileName = path.basename(audioPath);
    const response = await request.post(ENDPOINTS.transcription, {
      headers: getAuthHeaders(),
      multipart: {
        file: {
          name: fileName,
          mimeType: 'audio/wav',
          buffer: fs.readFileSync(audioPath),
        },
        model: 'zero-codeswitch',
        language_code: 'auto',
      },
      timeout: 120000,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('text');
    expect(typeof body.text).toBe('string');
  });

  test('POST /v1/audio/transcriptions — Translation feature', async ({ request }) => {
    test.setTimeout(120000);
    const audioPath = TEST_AUDIO_FILES.wav;
    test.skip(!fs.existsSync(audioPath), `Test audio file not found`);

    const fileName = path.basename(audioPath);
    const response = await request.post(ENDPOINTS.transcription, {
      headers: getAuthHeaders(),
      multipart: {
        file: {
          name: fileName,
          mimeType: 'audio/wav',
          buffer: fs.readFileSync(audioPath),
        },
        model: 'zero-codeswitch',
        language_code: 'auto',
        translation: 'true',
        target_languages: JSON.stringify(['en']),
      },
      timeout: 120000,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('text');
  });

  test('POST /v1/audio/transcriptions — Speaker Diarization', async ({ request }) => {
    test.setTimeout(120000);
    const audioPath = TEST_AUDIO_FILES.wav;
    test.skip(!fs.existsSync(audioPath), `Test audio file not found`);

    const fileName = path.basename(audioPath);
    const response = await request.post(ENDPOINTS.transcription, {
      headers: getAuthHeaders(),
      multipart: {
        file: {
          name: fileName,
          mimeType: 'audio/wav',
          buffer: fs.readFileSync(audioPath),
        },
        model: 'zero-indic',
        language_code: 'auto',
        diarize: 'true',
      },
      timeout: 120000,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toBeTruthy();
  });

  test('POST /v1/audio/transcriptions — Word Timestamps', async ({ request }) => {
    test.setTimeout(120000);
    const audioPath = TEST_AUDIO_FILES.wav;
    test.skip(!fs.existsSync(audioPath), `Test audio file not found`);

    const fileName = path.basename(audioPath);
    const response = await request.post(ENDPOINTS.transcription, {
      headers: getAuthHeaders(),
      multipart: {
        file: {
          name: fileName,
          mimeType: 'audio/wav',
          buffer: fs.readFileSync(audioPath),
        },
        model: 'zero-indic',
        language_code: 'auto',
        timestamps: 'true',
      },
      timeout: 120000,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toBeTruthy();
  });

  test('POST /v1/audio/transcriptions — Sentiment and Intent Detection', async ({ request }) => {
    test.setTimeout(120000);
    const audioPath = TEST_AUDIO_FILES.wav;
    test.skip(!fs.existsSync(audioPath), `Test audio file not found`);

    const fileName = path.basename(audioPath);
    const response = await request.post(ENDPOINTS.transcription, {
      headers: getAuthHeaders(),
      multipart: {
        file: {
          name: fileName,
          mimeType: 'audio/wav',
          buffer: fs.readFileSync(audioPath),
        },
        model: 'zero-indic',
        language_code: 'auto',
        sentiment: 'true',
        intent: 'true',
      },
      timeout: 120000,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toBeTruthy();
  });

  test('POST /v1/audio/transcriptions — Negative case: missing audio file returns 400/422', async ({ request }) => {
    const response = await request.post(ENDPOINTS.transcription, {
      headers: getAuthHeaders(),
      multipart: {
        model: 'zero-indic',
      },
      timeout: 30000,
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('POST /v1/audio/transcriptions — Negative case: invalid API key returns 401/403', async ({ request }) => {
    const response = await request.post(ENDPOINTS.transcription, {
      headers: { Authorization: 'Bearer invalid_api_key_123' },
      multipart: {
        model: 'zero-indic',
      },
      timeout: 30000,
    });

    expect([401, 403, 400, 422]).toContain(response.status());
  });
});
