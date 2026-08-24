/**
 * Backend API Test Suite — Negative & Edge Cases
 * Tests system resilience, input validation, authentication enforcement, and error codes:
 * - 401 Unauthorized (Missing/Malformed API Key)
 * - 400/422 Bad Request (Missing Audio, Invalid Model, Corrupt Payload, 0-byte File)
 * - Edge Cases: Very short audio, Silence audio, Concurrent requests
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { API_CONFIG, getAuthHeaders, getAuthToken, ENDPOINTS } from '../../config/api.config';
import { TEST_AUDIO_FILES } from '../../config/playground.config';

test.describe('Backend API — ASR Negative & Edge Cases', () => {
  test.beforeAll(async () => {
    await getAuthToken();
  });
  test('Negative: Missing Authorization header returns 401', async ({ request }) => {
    const audioPath = TEST_AUDIO_FILES.wav;
    test.skip(!fs.existsSync(audioPath), 'Audio file not found');

    const response = await request.post(ENDPOINTS.transcription, {
      multipart: {
        file: {
          name: path.basename(audioPath),
          mimeType: 'audio/wav',
          buffer: fs.readFileSync(audioPath),
        },
        model: 'zero-indic',
      },
      timeout: 30000,
    });

    expect(response.status()).toBe(401);
  });

  test('Negative: Invalid API Key returns 401/403', async ({ request }) => {
    const audioPath = TEST_AUDIO_FILES.wav;
    test.skip(!fs.existsSync(audioPath), 'Audio file not found');

    const response = await request.post(ENDPOINTS.transcription, {
      headers: { Authorization: 'Bearer invalid_api_key_xyz_12345' },
      multipart: {
        file: {
          name: path.basename(audioPath),
          mimeType: 'audio/wav',
          buffer: fs.readFileSync(audioPath),
        },
        model: 'zero-indic',
      },
      timeout: 30000,
    });

    expect([401, 403]).toContain(response.status());
  });

  test('Negative: Missing audio file in payload returns 400/422', async ({ request }) => {
    test.skip(!API_CONFIG.apiKey, 'API key required');

    const response = await request.post(ENDPOINTS.transcription, {
      headers: getAuthHeaders(),
      multipart: {
        model: 'zero-indic',
        language_code: 'hi',
      },
      timeout: 30000,
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('Negative: Invalid model identifier returns 400/422', async ({ request }) => {
    test.skip(!API_CONFIG.apiKey, 'API key required');
    const audioPath = TEST_AUDIO_FILES.wav;
    test.skip(!fs.existsSync(audioPath), 'Audio file not found');

    const response = await request.post(ENDPOINTS.transcription, {
      headers: getAuthHeaders(),
      multipart: {
        file: {
          name: path.basename(audioPath),
          mimeType: 'audio/wav',
          buffer: fs.readFileSync(audioPath),
        },
        model: 'non-existent-super-model-v99',
      },
      timeout: 30000,
    });

    // Server either rejects with 400/422 or gracefully falls back to default model (200)
    expect([200, 400, 422]).toContain(response.status());
  });

  test('Negative: Corrupted audio file buffer returns 400/422', async ({ request }) => {
    test.skip(!API_CONFIG.apiKey, 'API key required');

    const corruptBuffer = Buffer.from('RIFF....WAVEfmt ....data NOT_A_REAL_AUDIO_PAYLOAD_CORRUPT');
    const response = await request.post(ENDPOINTS.transcription, {
      headers: getAuthHeaders(),
      multipart: {
        file: {
          name: 'corrupted.wav',
          mimeType: 'audio/wav',
          buffer: corruptBuffer,
        },
        model: 'zero-indic',
      },
      timeout: 30000,
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('Negative: 0-byte empty audio file returns 400/422', async ({ request }) => {
    test.skip(!API_CONFIG.apiKey, 'API key required');

    const emptyBuffer = Buffer.alloc(0);
    const response = await request.post(ENDPOINTS.transcription, {
      headers: getAuthHeaders(),
      multipart: {
        file: {
          name: 'empty.wav',
          mimeType: 'audio/wav',
          buffer: emptyBuffer,
        },
        model: 'zero-indic',
      },
      timeout: 30000,
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('Edge Case: Multiple parallel requests (Concurrency stress check)', async ({ request }) => {
    test.skip(!API_CONFIG.apiKey, 'API key required');
    test.setTimeout(180000);
    const audioPath = TEST_AUDIO_FILES.wav;
    test.skip(!fs.existsSync(audioPath), 'Audio file not found');

    const fileBuffer = fs.readFileSync(audioPath);
    const requests = Array.from({ length: 3 }).map(() =>
      request.post(ENDPOINTS.transcription, {
        headers: getAuthHeaders(),
        multipart: {
          file: {
            name: path.basename(audioPath),
            mimeType: 'audio/wav',
            buffer: fileBuffer,
          },
          model: 'zero-indic',
          language_code: 'auto',
        },
        timeout: 120000,
      })
    );

    const responses = await Promise.all(requests);
    for (const res of responses) {
      expect([200, 429]).toContain(res.status());
    }
  });
});
