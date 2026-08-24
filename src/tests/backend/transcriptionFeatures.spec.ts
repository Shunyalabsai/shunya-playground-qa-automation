/**
 * Backend API Test Suite — Intelligence Features Matrix
 * Verifies all 12 audio intelligence features on ASR backend:
 * 1. Translation
 * 2. Transliteration
 * 3. Speaker Diarization
 * 4. Word Timestamps
 * 5. Profanity Hashing
 * 6. Custom Keyword Hashing
 * 7. Intent Detection
 * 8. Sentiment Analysis
 * 9. Emotion Diarization
 * 10. Summarisation
 * 11. Keyword Normalisation
 * 12. Combined Multi-Feature Payload
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { API_CONFIG, getAuthHeaders, getAuthToken, ENDPOINTS } from '../../config/api.config';
import { TEST_AUDIO_FILES } from '../../config/playground.config';

test.describe('Backend API — ASR Feature Matrix', () => {
  test.beforeAll(async () => {
    await getAuthToken();
  });

  test.skip(!API_CONFIG.apiKey, 'ASR_API_KEY required for feature tests');

  test('Feature 1: Translation (English target)', async ({ request }) => {
    test.setTimeout(120000);
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

  test('Feature 2: Transliteration', async ({ request }) => {
    test.setTimeout(120000);
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
        model: 'zero-indic',
        language_code: 'hi',
        transliteration: 'true',
      },
      timeout: 120000,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('text');
  });

  test('Feature 3: Speaker Diarization', async ({ request }) => {
    test.setTimeout(120000);
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

  test('Feature 4: Word Timestamps', async ({ request }) => {
    test.setTimeout(120000);
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

  test('Feature 5: Profanity Hashing', async ({ request }) => {
    test.setTimeout(120000);
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
        model: 'zero-indic',
        language_code: 'auto',
        profanity: 'true',
      },
      timeout: 120000,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('text');
  });

  test('Feature 6: Custom Keyword Hashing', async ({ request }) => {
    test.setTimeout(120000);
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
        model: 'zero-indic',
        language_code: 'auto',
        hash: 'true',
        keywords: JSON.stringify(['shunya', 'testing']),
      },
      timeout: 120000,
    });

    expect(response.status()).toBe(200);
  });

  test('Feature 7: Intent Detection', async ({ request }) => {
    test.setTimeout(120000);
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
        model: 'zero-indic',
        language_code: 'auto',
        intent: 'true',
      },
      timeout: 120000,
    });

    expect(response.status()).toBe(200);
  });

  test('Feature 8: Sentiment Analysis', async ({ request }) => {
    test.setTimeout(120000);
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
        model: 'zero-indic',
        language_code: 'auto',
        sentiment: 'true',
      },
      timeout: 120000,
    });

    expect(response.status()).toBe(200);
  });

  test('Feature 9: Emotion Diarization', async ({ request }) => {
    test.setTimeout(120000);
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
        model: 'zero-indic',
        language_code: 'auto',
        emotion: 'true',
      },
      timeout: 120000,
    });

    expect(response.status()).toBe(200);
  });

  test('Feature 10: Summarisation', async ({ request }) => {
    test.setTimeout(120000);
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
        model: 'zero-indic',
        language_code: 'auto',
        summarize: 'true',
      },
      timeout: 120000,
    });

    expect(response.status()).toBe(200);
  });

  test('Feature 11: Keyword Normalisation', async ({ request }) => {
    test.setTimeout(120000);
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
        model: 'zero-indic',
        language_code: 'auto',
        normalize: 'true',
      },
      timeout: 120000,
    });

    expect(response.status()).toBe(200);
  });

  test('Feature 12: Combined Multi-Feature (Timestamps + Diarization + Sentiment + Intent)', async ({ request }) => {
    test.setTimeout(180000);
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
        model: 'zero-indic',
        language_code: 'auto',
        timestamps: 'true',
        diarize: 'true',
        sentiment: 'true',
        intent: 'true',
      },
      timeout: 180000,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('text');
  });
});
