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
import * as nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

interface ServiceCheck {
  name: string;
  url: string;
  expectedStatuses: number[];
  impact: string;
  resolution: string;
}

const SERVICES: ServiceCheck[] = [
  {
    name: 'ASR Microservice',
    url: 'https://asrv2prod.shunyalabs.ai/health',
    expectedStatuses: [200, 404],
    impact: 'Audio transcription and speech intelligence features are unavailable or failing.',
    resolution: 'Check ASR server instance health, GPU worker status, or restart the asrv2prod container.',
  },
  {
    name: 'TTS Microservice',
    url: 'https://ttsv2.shunyalabs.ai/health',
    expectedStatuses: [200, 404],
    impact: 'Speech synthesis across Indic, Oriental, and Universal models is failing.',
    resolution: 'Check TTS service logs, memory/GPU thresholds, and ttsv2 endpoint connectivity.',
  },
  {
    name: 'Playground Web App',
    url: 'https://playground.shunyalabs.ai',
    expectedStatuses: [200, 301, 302, 307],
    impact: 'Playground web frontend is inaccessible; users and automated tests cannot log in.',
    resolution: 'Check Cloudflare/DNS routing, SSL certificates, and frontend web server availability.',
  },
];

async function sendFailureEmail(failedServices: { name: string; url: string; status: number | string; error?: string; impact: string; resolution: string }[], timestamp: string) {
  const user = (process.env.SMTP_USER || process.env.GMAIL_USER || '').trim();
  const pass = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const recipient = 'yamini@shunyalabs.ai';

  if (!user || !pass) {
    console.warn('⚠️ SMTP credentials not found in .env; skipping failure email alert.');
    return;
  }

  const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user, pass },
    connectionTimeout: 15000,
    socketTimeout: 20000,
  });

  let rowsHtml = '';
  failedServices.forEach((f, idx) => {
    rowsHtml += `
      <tr style="border-bottom:1px solid #334155;">
        <td style="padding:12px;font-weight:700;color:#f87171;">#${idx + 1} ${f.name}</td>
        <td style="padding:12px;color:#cbd5e1;font-family:monospace;font-size:12px;">${f.url}</td>
        <td style="padding:12px;color:#fca5a5;font-weight:600;">${f.status}</td>
        <td style="padding:12px;color:#e2e8f0;font-size:12px;">${f.error || 'Unexpected Status'}</td>
      </tr>
      <tr style="background:#1e293b;border-bottom:2px solid #0f172a;">
        <td colspan="4" style="padding:10px 14px;font-size:12px;">
          <div style="color:#fbbf24;margin-bottom:4px;"><strong>⚠️ Impact:</strong> ${f.impact}</div>
          <div style="color:#38bdf8;"><strong>🛠️ Recommended Resolution:</strong> ${f.resolution}</div>
        </td>
      </tr>`;
  });

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;padding:24px;color:#f8fafc;">
      <div style="max-width:640px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px;border:1px solid #ef4444;">
        <h2 style="color:#ef4444;margin-top:0;font-size:20px;">🚨 Service Health Outage Detected</h2>
        <p style="color:#94a3b8;font-size:13px;margin-bottom:18px;">
          The automated 15-minute health checker detected that one or more critical Playground microservices are degraded or unreachable.
        </p>
        <p style="font-size:12px;color:#cbd5e1;margin-bottom:16px;"><strong>Timestamp:</strong> ${timestamp}</p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;background:#0f172a;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#334155;color:#94a3b8;font-size:11px;text-transform:uppercase;">
              <th style="padding:10px 12px;text-align:left;">Service</th>
              <th style="padding:10px 12px;text-align:left;">Endpoint</th>
              <th style="padding:10px 12px;text-align:left;">Status</th>
              <th style="padding:10px 12px;text-align:left;">Error Reason</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div style="text-align:center;margin-top:24px;">
          <a href="https://shunyalabsai.github.io/shunya-playground-qa-automation/"
             style="background:#2563eb;color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:600;font-size:13px;display:inline-block;">
             Open Live QC Dashboard
          </a>
        </div>
      </div>
    </div>`;

  try {
    await transporter.sendMail({
      from: process.env.REPORT_EMAIL_FROM || user,
      to: recipient,
      subject: `🚨 [CRITICAL ALERT] Playground API Health Check Failed (${failedServices.length} Service${failedServices.length > 1 ? 's' : ''} Down) — ${timestamp}`,
      html,
    });
    console.log(`[HealthCheck] 🚨 Failure alert email sent to ${recipient}`);
  } catch (err: any) {
    console.error(`[HealthCheck] Could not send failure alert email: ${err.message}`);
  }
}

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

  // Trigger alert email if any service failed
  const failedServices = results.filter((r) => !r.ok);
  if (failedServices.length > 0) {
    console.log(`[HealthCheck] ⚠️ ${failedServices.length} service(s) failed. Triggering immediate alert email...`);
    const servicesMap = new Map(SERVICES.map(s => [s.name, s]));
    const failurePayload = failedServices.map(f => ({
      name: f.service,
      url: f.url,
      status: f.status || 'Unreachable / Timeout',
      error: f.error || `HTTP ${f.status}`,
      impact: servicesMap.get(f.service)?.impact || 'Service degraded.',
      resolution: servicesMap.get(f.service)?.resolution || 'Check server logs.',
    }));
    await sendFailureEmail(failurePayload, timestamp);
  }

  console.log(`[HealthCheck] Completed. Status: ${allHealthy ? 'ALL SERVICES HEALTHY' : 'DEGRADED'}\n`);
}

runHealthChecks().catch((e) => {
  console.error('[HealthCheck] Error:', e.message);
  process.exit(1);
});
