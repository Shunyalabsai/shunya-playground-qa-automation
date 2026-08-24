/**
 * Backend API Test Suite — ASR Model Matrix
 * Verifies direct transcription across all supported model variants:
 * - zero-indic
 * - zero-codeswitch
 * - zero-medasr
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { API_CONFIG, getAuthHeaders, getAuthToken, ENDPOINTS } from '../../config/api.config';
import { TEST_AUDIO_FILES } from '../../config/playground.config';

test.describe('Backend API — ASR Models Matrix', () => {
  test.beforeAll(async () => {
    await getAuthToken();
  });

  test.skip(!API_CONFIG.apiKey, 'ASR_API_KEY required for model tests');

  test('POST /v1/audio/transcriptions — Model: zero-indic (WAV format)', async ({ request }) => {
    test.setTimeout(120000);
    const audioPath = TEST_AUDIO_FILES.wav;
    test.skip(!fs.existsSync(audioPath), 'Audio file not found');

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

  test('POST /v1/audio/transcriptions — Model: zero-indic (MP3 format)', async ({ request }) => {
    test.setTimeout(180000);
    const audioPath = TEST_AUDIO_FILES.mp3;
    test.skip(!fs.existsSync(audioPath), 'MP3 audio file not found');

    const fileName = path.basename(audioPath);
    const response = await request.post(ENDPOINTS.transcription, {
      headers: getAuthHeaders(),
      multipart: {
        file: {
          name: fileName,
          mimeType: 'audio/mpeg',
          buffer: fs.readFileSync(audioPath),
        },
        model: 'zero-indic',
        language_code: 'auto',
      },
      timeout: 180000,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('text');
  });

  test('POST /v1/audio/transcriptions — Model: zero-codeswitch (Mixed Hinglish)', async ({ request }) => {
    test.setTimeout(120000);
    const audioPath = TEST_AUDIO_FILES.wav;
    test.skip(!fs.existsSync(audioPath), 'Audio file not found');

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
    expect(body.text.trim().length).toBeGreaterThan(0);
  });

  test('POST /v1/audio/transcriptions — Model: zero-medasr (Medical consultation audio)', async ({ request }) => {
    test.setTimeout(180000);
    const audioPath = TEST_AUDIO_FILES.mp3;
    test.skip(!fs.existsSync(audioPath), 'Medical audio file not found');

    const fileName = path.basename(audioPath);
    const response = await request.post(ENDPOINTS.transcription, {
      headers: getAuthHeaders(),
      multipart: {
        file: {
          name: fileName,
          mimeType: 'audio/mpeg',
          buffer: fs.readFileSync(audioPath),
        },
        model: 'zero-medasr',
        language_code: 'en',
      },
      timeout: 180000,
    });

    expect([200, 201]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('text');
  });

  test('POST /v1/audio/transcriptions — Explicit language_code (Hindi: hi)', async ({ request }) => {
    test.setTimeout(120000);
    const audioPath = TEST_AUDIO_FILES.wav;
    test.skip(!fs.existsSync(audioPath), 'Audio file not found');

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
        language_code: 'hi',
      },
      timeout: 120000,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('text');
  });
});
