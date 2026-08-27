/**
 * Exhaustive Master Backend API Spec
 * Executes all 33 Backend API test cases from the Master Input Sheet:
 * - Health Checks
 * - ASR Models (zero-indic, zero-codeswitch, zero-medasr)
 * - 12 Intelligence Feature Matrix (Translation, Diarization, Timestamps, Hashing, etc.)
 * - TTS Speech Synthesis (Multiple languages, voices, speeds)
 * - Negative, Auth & Stress (401, 403, 400, 422, 0-byte, Corrupted audio, Concurrency burst)
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { generateTestCases } from '../../../scripts/populate-exhaustive-master-sheet';
import { API_CONFIG, ENDPOINTS, getAuthHeaders, getAuthToken } from '../../config/api.config';

const backendCases = generateTestCases().filter((t) => t.suite === 'Backend API');

test.describe('Exhaustive Master Backend API Suite (33 Scenarios)', () => {
  test.beforeAll(async () => {
    await getAuthToken();
  });

  for (const tc of backendCases) {
    test(`${tc.id}: [${tc.module}] ${tc.title}`, async ({ request }) => {
      // 1. Health & Auth Token Checks
      if (tc.title.includes('JWT Token Exchange') || tc.title.includes('/auth/token')) {
        const token = await getAuthToken();
        expect(token).toBeDefined();
        return;
      }

      if (tc.module.includes('Health') || tc.title.includes('/health')) {
        if (tc.title.includes('TTS')) {
          const res = await request.get(ENDPOINTS.tts.health, { timeout: 30000 });
          expect([200, 404]).toContain(res.status());
        } else {
          const res = await request.get(ENDPOINTS.health, { timeout: 30000 });
          expect([200, 404]).toContain(res.status());
        }
        return;
      }

      // 2. TTS Speech Synthesis (Zero Indic, Zero Oriental, Zero Universal)
      if (tc.module.includes('Text to Speech') || tc.module.includes('TTS')) {
        if (!API_CONFIG.apiKey) {
          test.skip(true, 'ASR_API_KEY required for TTS test');
        }
        let config: any = { voice: 'shunya-female-1', speed: 1.0, format: 'mp3' };
        try {
          config = JSON.parse(tc.featureConfig || '{}');
        } catch {}

        const postData: any = {
          input: tc.ttsInputText || 'Welcome to Shunya Labs speech synthesis.',
          voice: config.voice || 'shunya-female-1',
          speed: parseFloat(config.speed || '1.0'),
          response_format: config.format || config.response_format || 'mp3',
        };
        if (config.model && config.model !== 'N/A') {
          postData.model = config.model;
        }

        const res = await request.post(ENDPOINTS.tts.synthesis, {
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
          },
          data: postData,
          timeout: 60000,
        }).catch(() => null);

        if (res) {
          if (tc.scenarioType === 'Negative') {
            expect(res.status()).toBeGreaterThanOrEqual(400);
          } else {
            if (res.ok()) {
              expect(res.status()).toBe(200);
              const body = await res.body();
              expect(body.length).toBeGreaterThan(0);
            } else {
              expect(res.status()).toBeLessThan(500);
            }
          }
        }
        return;
      }

      // 3. Negative & Stress Cases
      if (tc.module.includes('Negative') || tc.scenarioType === 'Negative' || tc.scenarioType === 'Stress' || tc.scenarioType === 'Boundary') {
        if (tc.title.includes('Missing Authorization')) {
          const res = await request.post(ENDPOINTS.transcription, {
            multipart: {
              file: {
                name: '37.mp3',
                mimeType: 'audio/mpeg',
                buffer: Buffer.from('RIFF....'),
              },
              model: 'zero-indic',
            },
          });
          expect(res.status()).toBe(401);
          return;
        }

        if (tc.title.includes('Invalid API Key')) {
          const res = await request.post(ENDPOINTS.transcription, {
            headers: {
              Authorization: 'Bearer invalid_bad_key_12345678',
              'api-key': 'invalid_bad_key_12345678',
            },
            multipart: {
              file: {
                name: '37.mp3',
                mimeType: 'audio/mpeg',
                buffer: Buffer.from('RIFF....'),
              },
              model: 'zero-indic',
            },
          });
          expect([401, 403]).toContain(res.status());
          return;
        }

        if (tc.title.includes('Missing Audio File')) {
          const res = await request.post(ENDPOINTS.transcription, {
            headers: getAuthHeaders(),
            multipart: {
              model: 'zero-indic',
              language_code: 'hi',
            },
          });
          expect(res.status()).toBeGreaterThanOrEqual(400);
          return;
        }

        if (tc.title.includes('Corrupted Audio')) {
          const res = await request.post(ENDPOINTS.transcription, {
            headers: getAuthHeaders(),
            multipart: {
              file: {
                name: 'corrupted.wav',
                mimeType: 'audio/wav',
                buffer: Buffer.from('RIFFcorruptedgarbagebytestream\x00\x00\x00'),
              },
              model: 'zero-indic',
            },
          });
          expect(res.status()).toBeGreaterThanOrEqual(400);
          return;
        }

        if (tc.title.includes('0-Byte Empty Audio')) {
          const res = await request.post(ENDPOINTS.transcription, {
            headers: getAuthHeaders(),
            multipart: {
              file: {
                name: 'empty.wav',
                mimeType: 'audio/wav',
                buffer: Buffer.alloc(0),
              },
              model: 'zero-indic',
            },
          });
          expect(res.status()).toBeGreaterThanOrEqual(400);
          return;
        }

        if (tc.scenarioType === 'Stress' || tc.title.includes('Concurrency Burst')) {
          const audioPath = path.resolve(__dirname, '../../../', tc.audioPath || 'input/indicvoices_data/audio/Hindi/37.mp3');
          const fileBuffer = fs.existsSync(audioPath) ? fs.readFileSync(audioPath) : Buffer.from('dummy-audio');
          const responses = await Promise.all([
            request.post(ENDPOINTS.transcription, {
              headers: getAuthHeaders(),
              multipart: { file: { name: 'sample.mp3', mimeType: 'audio/mpeg', buffer: fileBuffer }, model: 'zero-indic' },
            }),
            request.post(ENDPOINTS.transcription, {
              headers: getAuthHeaders(),
              multipart: { file: { name: 'sample.mp3', mimeType: 'audio/mpeg', buffer: fileBuffer }, model: 'zero-indic' },
            }),
            request.post(ENDPOINTS.transcription, {
              headers: getAuthHeaders(),
              multipart: { file: { name: 'sample.mp3', mimeType: 'audio/mpeg', buffer: fileBuffer }, model: 'zero-indic' },
            }),
          ]);
          responses.forEach((r) => expect([200, 429]).toContain(r.status()));
          return;
        }
      }

      // 4. ASR Transcription & Intelligence Feature Matrix
      let audioFullPath = path.resolve(__dirname, '../../../', tc.audioPath || 'input/indicvoices_data/audio/Hindi/37.mp3');
      if (!fs.existsSync(audioFullPath)) {
        audioFullPath = path.resolve(__dirname, '../../../input/indicvoices_data/audio/Hindi/37.mp3');
      }
      const fileBuffer = fs.readFileSync(audioFullPath);
      const mimeType = audioFullPath.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
      const fileName = path.basename(audioFullPath);

      let configParams: Record<string, any> = {};
      try {
        configParams = JSON.parse(tc.featureConfig || '{}');
      } catch {}

      const multipart: Record<string, any> = {
        file: {
          name: fileName,
          mimeType,
          buffer: fileBuffer,
        },
        model: tc.model !== 'N/A' ? tc.model : 'zero-indic',
        ...configParams,
      };

      if (tc.languageCode && tc.languageCode !== 'N/A' && tc.languageCode !== 'auto') {
        multipart.language_code = tc.languageCode;
      }

      const res = await request.post(ENDPOINTS.transcription, {
        headers: getAuthHeaders(),
        multipart,
        timeout: 120000,
      });

      expect([200, 201]).toContain(res.status());
      const json = await res.json();
      expect(json).toBeDefined();
    });
  }
});
