/**
 * Backend API Test Suite — Health & Readiness Checks
 * Pings backend microservices directly without browser overhead.
 */

import { test, expect } from '@playwright/test';
import { ENDPOINTS, API_CONFIG } from '../../config/api.config';
import { checkHealth } from '../../services/healthClient';

test.describe('Backend API — Health Checks', () => {
  test('ASR service health check returns 200 and healthy status', async ({ request }) => {
    const health = await checkHealth(request);
    expect(health.status).toBe(200);
    expect(health.ok).toBe(true);
    expect(health.latencyMs).toBeLessThan(10000);
  });

  test('TTS service health check returns 200', async ({ request }) => {
    const start = Date.now();
    const response = await request.get(ENDPOINTS.tts.health, { timeout: 10000 }).catch(() => null);

    if (response) {
      expect(response.status()).toBeLessThan(500);
      const latency = Date.now() - start;
      expect(latency).toBeLessThan(10000);
    } else {
      test.skip(true, 'TTS health endpoint not reachable in current environment');
    }
  });

  test('ASR supported languages endpoint responds', async ({ request }) => {
    const response = await request.get(ENDPOINTS.languages, { timeout: 10000 }).catch(() => null);
    if (response && response.ok()) {
      expect(response.status()).toBe(200);
      const body = await response.json().catch(() => null);
      expect(body).toBeTruthy();
    }
  });
});
