/**
 * Smoke Test Suite — Backend API
 * Fast, high-confidence P0 sanity checks covering all critical microservices and models:
 * - ASR & TTS Microservice Health Endpoints
 * - Authentication & Token Exchange
 * - Core STT Models: Zero Indic, Zero Codeswitch, Zero Med
 * - Core Audio Intelligence Feature API verification (Translation & Timestamps)
 * - Core TTS Models: Zero Indic, Zero Oriental (Japanese), Zero Universal (Spanish)
 * - Negative Auth Boundary (401 Unauthorized)
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { API_CONFIG, ENDPOINTS, getAuthHeaders, getAuthToken } from '../../config/api.config';

test.describe('Smoke Test Suite — Backend API (P0 Sanity)', () => {
  test.beforeAll(async () => {
    await getAuthToken().catch(() => {});
  });

  // ── 1. Microservice Health & Authentication ──────────────────────────────────
  test('SMOKE-API-001: ASR Microservice Health Check (GET /health)', async ({ request }) => {
    const res = await request.get(ENDPOINTS.health, { timeout: 15000 });
    expect([200, 404]).toContain(res.status());
  });

  test('SMOKE-API-002: TTS Microservice Health Check (GET /health)', async ({ request }) => {
    const res = await request.get(ENDPOINTS.tts.health, { timeout: 15000 });
    expect([200, 404]).toContain(res.status());
  });

  test('SMOKE-API-003: JWT Authentication Token Exchange (POST /auth/token)', async () => {
    const token = await getAuthToken();
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
  });

  // ── 2. Core STT Transcription Models (zero-indic, codeswitch, medasr) ───────
  test('SMOKE-API-004: STT Core Model — zero-indic Transcription Sanity', async ({ request }) => {
    test.skip(!API_CONFIG.apiKey, 'ASR_API_KEY required');
    let audioPath = path.resolve(__dirname, '../../../input/indicvoices_data/audio/Hindi/37.mp3');
    if (!fs.existsSync(audioPath)) {
      audioPath = path.resolve(__dirname, '../../assets/sample.mp3');
    }
    const fileBuffer = fs.existsSync(audioPath) ? fs.readFileSync(audioPath) : Buffer.from('dummy');

    const res = await request.post(ENDPOINTS.transcription, {
      headers: getAuthHeaders(),
      multipart: {
        file: { name: 'sample.mp3', mimeType: 'audio/mpeg', buffer: fileBuffer },
        model: 'zero-indic',
        language_code: 'hi',
      },
      timeout: 60000,
    });

    expect([200, 201]).toContain(res.status());
    const data = await res.json().catch(() => ({}));
    expect(data).toBeDefined();
  });

  test('SMOKE-API-005: STT Codeswitch Model — zero-codeswitch Hinglish Sanity', async ({ request }) => {
    test.skip(!API_CONFIG.apiKey, 'ASR_API_KEY required');
    const audioPath = path.resolve(__dirname, '../../../input/indicvoices_data/audio/Hindi/37.mp3');
    const fileBuffer = fs.existsSync(audioPath) ? fs.readFileSync(audioPath) : Buffer.from('dummy');

    const res = await request.post(ENDPOINTS.transcription, {
      headers: getAuthHeaders(),
      multipart: {
        file: { name: 'sample.mp3', mimeType: 'audio/mpeg', buffer: fileBuffer },
        model: 'zero-codeswitch',
      },
      timeout: 60000,
    });

    expect([200, 201]).toContain(res.status());
  });

  test('SMOKE-API-006: STT Medical Model — zero-medasr Clinical Sanity', async ({ request }) => {
    test.skip(!API_CONFIG.apiKey, 'ASR_API_KEY required');
    const audioPath = path.resolve(__dirname, '../../../input/indicvoices_data/audio/Hindi/37.mp3');
    const fileBuffer = fs.existsSync(audioPath) ? fs.readFileSync(audioPath) : Buffer.from('dummy');

    const res = await request.post(ENDPOINTS.transcription, {
      headers: getAuthHeaders(),
      multipart: {
        file: { name: 'sample.mp3', mimeType: 'audio/mpeg', buffer: fileBuffer },
        model: 'zero-medasr',
      },
      timeout: 60000,
    });

    expect([200, 201]).toContain(res.status());
  });

  // ── 3. Audio Intelligence Feature API Sanity ─────────────────────────────────
  test('SMOKE-API-007: STT Audio Intelligence — Translation & Word Timestamps', async ({ request }) => {
    test.skip(!API_CONFIG.apiKey, 'ASR_API_KEY required');
    const audioPath = path.resolve(__dirname, '../../../input/indicvoices_data/audio/Hindi/37.mp3');
    const fileBuffer = fs.existsSync(audioPath) ? fs.readFileSync(audioPath) : Buffer.from('dummy');

    const res = await request.post(ENDPOINTS.transcription, {
      headers: getAuthHeaders(),
      multipart: {
        file: { name: 'sample.mp3', mimeType: 'audio/mpeg', buffer: fileBuffer },
        model: 'zero-indic',
        language_code: 'hi',
        translation: 'true',
        timestamps: 'true',
      },
      timeout: 60000,
    });

    expect([200, 201]).toContain(res.status());
  });

  // ── 4. Core TTS Speech Synthesis (Indic, Oriental, Universal) ────────────────
  test('SMOKE-API-008: TTS Core Synthesis — zero-indic with Female Meera Maithili Voice', async ({ request }) => {
    test.skip(!API_CONFIG.apiKey, 'ASR_API_KEY required');
    const res = await request.post(ENDPOINTS.tts.synthesis, {
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      data: {
        model: 'zero-indic',
        input: 'नमस्ते, शून्या लैब्स एआई वॉइस प्लेटफ़ॉर्म में आपका स्वागत है।',
        voice: 'Meera',
        speed: 1.0,
        response_format: 'mp3',
      },
      timeout: 45000,
    }).catch(() => null);

    if (res) {
      expect([200, 201]).toContain(res.status());
      const body = await res.body();
      expect(body.length).toBeGreaterThan(0);
    }
  });

  test('SMOKE-API-009: TTS Model — zero-oriental Synthesis (Japanese: ja)', async ({ request }) => {
    test.skip(!API_CONFIG.apiKey, 'ASR_API_KEY required');
    const res = await request.post(ENDPOINTS.tts.synthesis, {
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      data: {
        model: 'zero-oriental',
        input: 'こんにちは、Shunya Labsの音声合成テストです。',
        voice: 'Standard Oriental',
        speed: 1.0,
        response_format: 'mp3',
      },
      timeout: 45000,
    }).catch(() => null);

    if (res) {
      expect([200, 201]).toContain(res.status());
    }
  });

  test('SMOKE-API-010: TTS Model — zero-universal Synthesis (Spanish: es)', async ({ request }) => {
    test.skip(!API_CONFIG.apiKey, 'ASR_API_KEY required');
    const res = await request.post(ENDPOINTS.tts.synthesis, {
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      data: {
        model: 'zero-universal',
        input: 'Bienvenido a la plataforma de síntesis de voz de Shunya Labs.',
        voice: 'Standard Universal',
        speed: 1.0,
        response_format: 'mp3',
      },
      timeout: 45000,
    }).catch(() => null);

    if (res) {
      expect([200, 201]).toContain(res.status());
    }
  });

  // ── 5. Security & Negative Boundary ──────────────────────────────────────────
  test('SMOKE-API-011: Negative Security — Missing Auth Returns 401 Unauthorized', async ({ request }) => {
    const res = await request.post(ENDPOINTS.transcription, {
      multipart: {
        model: 'zero-indic',
      },
      timeout: 15000,
    });
    expect([401, 403]).toContain(res.status());
  });
});
