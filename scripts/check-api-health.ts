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

const HEALTH_ALERT_RECIPIENTS = [
  'saheb@shunyalabs.ai',
  'arti@shunyalabs.ai',
  'ritu@shunyalabs.ai',
  'yamini@shunyalabs.ai',
  'sumit@shunyalabs.ai',
  'saira@shunyalabs.ai',
];

/** Sender mailbox for health alerts. Recipients stay the list above. */
const HEALTH_ALERT_FROM = 'saira@shunyalabs.ai';

type FailureKind = 'dns' | 'timeout' | 'connection' | 'http' | 'unknown';

interface FailureClassification {
  kind: FailureKind;
  statusLabel: string;
  resolution?: string;
}

function classifyFailure(status: number, error?: string): FailureClassification {
  const message = error || '';
  if (/ENOTFOUND|ENODATA|EAI_AGAIN|getaddrinfo|Address unavailable|unable to resolve/i.test(message)) {
    return {
      kind: 'dns',
      statusLabel: 'DNS lookup failed',
      resolution:
        'The hostname did not resolve, so this check never reached the server. Check the DNS record for this host. Do not restart the container until the name resolves.',
    };
  }
  if (/timeout|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(message)) {
    return {
      kind: 'timeout',
      statusLabel: 'Connection timeout',
      resolution:
        'The host resolved, but the connection did not complete in time. Check instance health, the network path, and whether the process is listening.',
    };
  }
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH/i.test(message)) {
    return {
      kind: 'connection',
      statusLabel: 'Connection refused',
      resolution:
        'The host is reachable but refused the connection. Check that the service process is running and the port is open.',
    };
  }
  if (status > 0) {
    return { kind: 'http', statusLabel: `HTTP ${status}` };
  }
  return {
    kind: 'unknown',
    statusLabel: 'Unreachable',
    resolution:
      'The health check failed before an HTTP status was returned. Check DNS, network, and whether the service process is running.',
  };
}

interface FailedServicePayload {
  name: string;
  url: string;
  status: string;
  latencyMs: number;
  error?: string;
  impact: string;
  resolution: string;
  kind: FailureKind;
}

async function sendFailureEmail(failedServices: FailedServicePayload[], timestamp: string) {
  const user = (process.env.SMTP_USER || process.env.GMAIL_USER || '').trim();
  const pass = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const recipientList = process.env.HEALTH_ALERT_EMAIL_TO || HEALTH_ALERT_RECIPIENTS.join(', ');

  if (!user || !pass) {
    console.warn('⚠️ SMTP credentials not found in .env; skipping failure email alert.');
    return;
  }

  if (user.toLowerCase() !== HEALTH_ALERT_FROM.toLowerCase()) {
    console.warn(
      `[HealthCheck] SMTP is authenticated as ${user}. Gmail delivers From ${HEALTH_ALERT_FROM} only when that address is the SMTP account or a verified "Send mail as" alias. Set SMTP_USER and SMTP_PASS to ${HEALTH_ALERT_FROM} on the machine that runs this check.`
    );
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
        <td style="padding:12px;color:#fca5a5;font-weight:600;">${f.status} <span style="font-size:11px;color:#94a3b8;">(${f.latencyMs}ms)</span></td>
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
      <div style="max-width:680px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px;border:1px solid #ef4444;">
        <h2 style="color:#ef4444;margin-top:0;font-size:20px;">🚨 Playground Microservice Health Failure Alert</h2>
        <p style="color:#94a3b8;font-size:13px;margin-bottom:18px;">
          The automated 15-minute API health monitor confirmed this after 3 attempts. A one-off DNS miss is not mailed. DNS is mailed only when the same hostname fails on two checks in a row.
        </p>
        <p style="font-size:12px;color:#cbd5e1;margin-bottom:16px;"><strong>Timestamp:</strong> ${timestamp}</p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;background:#0f172a;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#334155;color:#94a3b8;font-size:11px;text-transform:uppercase;">
              <th style="padding:10px 12px;text-align:left;">Service</th>
              <th style="padding:10px 12px;text-align:left;">Endpoint</th>
              <th style="padding:10px 12px;text-align:left;">Status / Latency</th>
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
    const count = failedServices.length;
    const noun = count > 1 ? 'services' : 'service';
    const allDns = failedServices.every((f) => f.kind === 'dns');
    const subject = allDns
      ? `🚨 [ALERT] Playground API Health Check — DNS lookup failed (${count} ${noun}) — ${timestamp}`
      : `🚨 [CRITICAL ALERT] Playground API Health Check Failed (${count} ${noun} unreachable) — ${timestamp}`;

    const info = await transporter.sendMail({
      from: HEALTH_ALERT_FROM,
      replyTo: HEALTH_ALERT_FROM,
      to: recipientList,
      subject,
      html,
    });
    console.log(`[HealthCheck] 🚨 Failure alert email sent from ${HEALTH_ALERT_FROM} to ${recipientList} (MessageId: ${info.messageId})`);
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

const CHECK_ATTEMPTS = 3;
const RETRY_DELAY_MS = 4000;
const ALERT_STATE_PATH = path.resolve(__dirname, '../logs/health-alert-state.json');

function isExpectedStatus(service: ServiceCheck, status: number): boolean {
  return service.expectedStatuses.includes(status) || (status >= 200 && status < 400);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface DnsStrikeState {
  dnsStrikes: Record<string, number>;
}

function loadDnsStrikes(): Record<string, number> {
  try {
    const parsed = JSON.parse(fs.readFileSync(ALERT_STATE_PATH, 'utf8')) as DnsStrikeState;
    if (parsed && parsed.dnsStrikes && typeof parsed.dnsStrikes === 'object') return parsed.dnsStrikes;
  } catch {
    // First run, or the state file is not readable yet.
  }
  return {};
}

function saveDnsStrikes(dnsStrikes: Record<string, number>) {
  const logDir = path.dirname(ALERT_STATE_PATH);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const state: DnsStrikeState = { dnsStrikes };
  fs.writeFileSync(ALERT_STATE_PATH, JSON.stringify(state, null, 2));
}

/** Mail a DNS failure only after the same service fails DNS on two checks in a row. */
function shouldAlert(kind: FailureKind, previousDnsStrikes: number): boolean {
  if (kind !== 'dns') return true;
  return previousDnsStrikes >= 1;
}

async function probeWithRetries(service: ServiceCheck) {
  let res = await pingUrl(service.url);
  for (let attempt = 1; attempt < CHECK_ATTEMPTS && !isExpectedStatus(service, res.status); attempt++) {
    const reason = res.error || `HTTP ${res.status}`;
    console.log(`   ↻ ${service.name} failed (${reason}). Retry ${attempt} of ${CHECK_ATTEMPTS - 1} in ${RETRY_DELAY_MS / 1000}s...`);
    await sleep(RETRY_DELAY_MS);
    res = await pingUrl(service.url);
  }
  return res;
}

async function runHealthChecks() {
  const timestamp = new Date().toISOString();
  console.log(`\n🔍 [${timestamp}] Starting 15-Minute API Health Check...`);

  let allHealthy = true;
  const results: any[] = [];
  const dnsStrikes = loadDnsStrikes();
  const alertable: any[] = [];

  for (const s of SERVICES) {
    const res = await probeWithRetries(s);
    const isExpected = isExpectedStatus(s, res.status);
    const classification = classifyFailure(res.status, res.error);

    if (isExpected) {
      if (dnsStrikes[s.name]) delete dnsStrikes[s.name];
      console.log(`   ✅ ${s.name.padEnd(22)} | Status: ${res.status} | Latency: ${res.latencyMs}ms`);
    } else {
      allHealthy = false;
      const previousDnsStrikes = dnsStrikes[s.name] || 0;
      const alert = shouldAlert(classification.kind, previousDnsStrikes);
      if (classification.kind === 'dns') dnsStrikes[s.name] = previousDnsStrikes + 1;
      else delete dnsStrikes[s.name];
      console.log(
        `   ❌ ${s.name.padEnd(22)} | Status: ${classification.statusLabel} | Latency: ${res.latencyMs}ms ${
          res.error ? `(${res.error})` : ''
        }${alert ? '' : ' | suppressed (one-off DNS miss)'}`
      );

      const row = {
        service: s.name,
        url: s.url,
        status: res.status,
        statusLabel: classification.statusLabel,
        kind: classification.kind,
        failureResolution: classification.resolution,
        latencyMs: res.latencyMs,
        ok: false,
        error: res.error || null,
        timestamp,
      };
      results.push(row);
      if (alert) alertable.push(row);
      continue;
    }

    results.push({
      service: s.name,
      url: s.url,
      status: res.status,
      statusLabel: classification.statusLabel,
      kind: classification.kind,
      failureResolution: classification.resolution,
      latencyMs: res.latencyMs,
      ok: true,
      error: res.error || null,
      timestamp,
    });
  }

  saveDnsStrikes(dnsStrikes);

  // Save lightweight rolling log
  const logDir = path.resolve(__dirname, '../logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  const logFile = path.join(logDir, 'health-check.log');
  const logLine = `[${timestamp}] All Healthy: ${allHealthy ? 'YES' : 'NO'} | ${results
    .map((r) => `${r.service}: ${r.ok ? 'OK' : 'FAIL'} (${r.latencyMs}ms)`)
    .join(' | ')}\n`;

  fs.appendFileSync(logFile, logLine, 'utf8');

  if (alertable.length > 0) {
    console.log(`[HealthCheck] ⚠️ ${alertable.length} service(s) still failing after retries. Triggering alert email...`);
    const servicesMap = new Map(SERVICES.map(s => [s.name, s]));
    const failurePayload = alertable.map(f => ({
      name: f.service,
      url: f.url,
      status: f.statusLabel,
      latencyMs: f.latencyMs || 0,
      error: f.error || `HTTP ${f.status}`,
      impact: servicesMap.get(f.service)?.impact || 'Service degraded.',
      resolution: f.failureResolution || servicesMap.get(f.service)?.resolution || 'Check server logs.',
      kind: f.kind,
    }));
    await sendFailureEmail(failurePayload, timestamp);
  }

  console.log(`[HealthCheck] Completed. Status: ${allHealthy ? 'ALL SERVICES HEALTHY' : 'DEGRADED'}\n`);
}

runHealthChecks().catch((e) => {
  console.error('[HealthCheck] Error:', e.message);
  process.exit(1);
});
