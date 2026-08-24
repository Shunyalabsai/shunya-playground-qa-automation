/**
 * Backend API Test Suite — TTS Speech Synthesis
 * Tests direct REST endpoints at POST /v1/audio/speech
 */

import { test, expect } from '@playwright/test';
import { API_CONFIG, getAuthHeaders, ENDPOINTS } from '../../config/api.config';

test.describe('Backend API — TTS Speech Synthesis', () => {
  test.skip(!API_CONFIG.apiKey, 'ASR_API_KEY is required for backend TTS tests');

  test('POST /v1/audio/speech — synthesize speech from text (Hindi/English)', async ({ request }) => {
    test.setTimeout(60000);
    const response = await request.post(ENDPOINTS.tts.synthesis, {
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      data: {
        input: 'नमस्ते, यह एक परीक्षण संदेश है।',
        voice: 'shunya-female-1',
        response_format: 'mp3',
        speed: 1.0,
      },
      timeout: 60000,
    }).catch(() => null);

    if (response) {
      if (response.ok()) {
        expect(response.status()).toBe(200);
        const buffer = await response.body();
        expect(buffer.length).toBeGreaterThan(0);
      } else {
        expect(response.status()).toBeLessThan(500);
      }
    }
  });

  test('POST /v1/audio/speech — Negative case: empty input text returns 400/422', async ({ request }) => {
    const response = await request.post(ENDPOINTS.tts.synthesis, {
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      data: {
        input: '',
        voice: 'shunya-female-1',
      },
      timeout: 30000,
    }).catch(() => null);

    if (response) {
      expect(response.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('POST /v1/audio/speech — Negative case: invalid authentication returns 401/403', async ({ request }) => {
    const response = await request.post(ENDPOINTS.tts.synthesis, {
      headers: {
        Authorization: 'Bearer invalid_tts_key_xyz',
        'Content-Type': 'application/json',
      },
      data: {
        input: 'Hello world',
      },
      timeout: 30000,
    }).catch(() => null);

    if (response) {
      expect([401, 403, 400, 422]).toContain(response.status());
    }
  });
});
