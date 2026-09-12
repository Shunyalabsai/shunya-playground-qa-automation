/**
 * Lightweight Standalone Health Check Runner
 * Checks Playground Core Microservices:
 * 1. ASR Service (GET https://asrv2prod.shunyalabs.ai/health)
 * 2. TTS Service (GET https://ttsv2.shunyalabs.ai/health)
 * 3. Playground Web UI (GET https://playground.shunyalabs.ai)
 * Logs status and latency without overhead.
 */

import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

interface ServiceCheck {
  name: string;
  url: string;
  expectedStatuses: number[];
}

const SERVICES: ServiceCheck[] = [
  { name: 'ASR Microservice', url: 'https://asrv2prod.shunyalabs.ai/health', expectedStatuses: [200, 404] },
  { name: 'TTS Microservice', url: 'https://ttsv2.shunyalabs.ai/health', expectedStatuses: [200, 404] },
  { name: 'Playground Web App', url: 'https://playground.shunyalabs.ai', expectedStatuses: [200, 301, 302] },
];

function pingUrl(urlStr: string): Promise<{ status: number; latencyMs: number; ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const start = Date.now();
    try {
      const parsed = new URL(urlStr);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.get(
        urlStr,
        {
          timeout: 10000,
          headers: {
            'User-Agent': 'Playground-HealthCheck/1.0',
          },
        },
        (res) => {
          const latencyMs = Date.now() - start;
          const status = res.statusCode || 0;
          res.resume(); // Drain stream
          resolve({ status, latencyMs, ok: status >= 200 && status < 400 });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        resolve({ status: 0, latencyMs: Date.now() - start, ok: false, error: 'Connection timeout (10s)' });
      });

      req.on('error', (err) => {
        resolve({ status: 0, latencyMs: Date.now() - start, ok: false, error: err.message });
      });
    } catch (err: any) {
      resolve({ status: 0, latencyMs: Date.now() - start, ok: false, error: err.message });
    }
  });
}

async function runHealthChecks() {
  const timestamp = new Date().toISOString();
  console.log(`\n🔍 [${timestamp}] Starting 15-Minute API Health Check...`);

  let allHealthy = true;
  const results: any[] = [];

  for (const s of SERVICES) {
    const res = await pingUrl(s.url);
    const isExpected = s.expectedStatuses.includes(res.status) || (res.status >= 200 && res.status < 400);
    if (!isExpected) allHealthy = false;

    console.log(
      `   ${isExpected ? '✅' : '❌'} ${s.name.padEnd(22)} | Status: ${res.status || 'ERR'} | Latency: ${res.latencyMs}ms ${
        res.error ? `(${res.error})` : ''
      }`
    );

    results.push({
      service: s.name,
      url: s.url,
      status: res.status,
      latencyMs: res.latencyMs,
      ok: isExpected,
      error: res.error || null,
      timestamp,
    });
  }

  // Save lightweight rolling log
  const logDir = path.resolve(__dirname, '../logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  const logFile = path.join(logDir, 'health-check.log');
  const logLine = `[${timestamp}] All Healthy: ${allHealthy ? 'YES' : 'NO'} | ${results
    .map((r) => `${r.service}: ${r.ok ? 'OK' : 'FAIL'} (${r.latencyMs}ms)`)
    .join(' | ')}\n`;

  fs.appendFileSync(logFile, logLine, 'utf8');

  console.log(`[HealthCheck] Completed. Status: ${allHealthy ? 'ALL SERVICES HEALTHY' : 'DEGRADED'}\n`);
}

runHealthChecks().catch((e) => {
  console.error('[HealthCheck] Error:', e.message);
  process.exit(1);
});
