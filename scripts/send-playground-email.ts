/**
 * Send Playground UI Test Report Email
 * Reads actual results from reports/playground-summary-*.json
 * Premium dark theme with visual clarity
 */

import * as nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

/** Gmail SMTP: prefer SMTP_*; fall back to GMAIL_* used by OTP refresh. */
function resolveSmtpAuth(): { user: string; pass: string } {
  const user = (process.env.SMTP_USER || process.env.GMAIL_USER || '').trim();
  const pass = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  if (!user || !pass) {
    console.error(
      '❌ SMTP credentials missing. Set SMTP_USER + SMTP_PASS in .env, or reuse GMAIL_USER + GMAIL_APP_PASSWORD (16-char Google App Password, not your Gmail login password).'
    );
    process.exit(1);
  }
  return { user, pass };
}

function formatSmtpError(error: { message?: string; code?: string; responseCode?: number }): string {
  const msg = error.message || String(error);
  if (msg.includes('535') || msg.includes('BadCredentials') || error.responseCode === 535) {
    return `${msg}\n   → Gmail rejected the password. Use an App Password: https://myaccount.google.com/apppasswords (2FA required). Put it in SMTP_PASS or GMAIL_APP_PASSWORD with no spaces.`;
  }
  return msg;
}

// ── Interfaces ───────────────────────────────────────────────────────────────

interface SuiteResult {
  category: string;
  name: string;
  status: 'pass' | 'fail';
  duration_s: number;
  failure_reason: string;
}

interface PlaygroundSummary {
  runDate: string;
  runTimestamp: string;
  endTimestamp: string;
  totalSuites: number;
  passed: number;
  failed: number;
  suites: SuiteResult[];
}

interface CategoryGroup {
  category: string;
  suites: SuiteResult[];
  passed: number;
  failed: number;
  totalDuration: number;
}

// ── Load Summary Data ────────────────────────────────────────────────────────

function loadLatestSummary(): PlaygroundSummary {
  const reportsDir = path.resolve(__dirname, '..', 'reports');

  if (!fs.existsSync(reportsDir)) {
    console.error('❌ Reports directory not found:', reportsDir);
    process.exit(1);
  }

  const files = fs.readdirSync(reportsDir)
    .filter(f => f.startsWith('playground-summary-') && f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.error('❌ No playground-summary-*.json files found in', reportsDir);
    process.exit(1);
  }

  const latestFile = path.join(reportsDir, files[0]);
  console.log(`📂 Reading summary: ${latestFile}`);

  const raw = fs.readFileSync(latestFile, 'utf-8');
  return JSON.parse(raw) as PlaygroundSummary;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  }
  return secs > 0 ? `${mins}m ${secs}s` : `${mins} min`;
}

function computeDurationSeconds(start: string, end: string): number {
  const s = new Date(start.replace(' ', 'T'));
  const e = new Date(end.replace(' ', 'T'));
  return Math.round((e.getTime() - s.getTime()) / 1000);
}

function groupByCategory(suites: SuiteResult[]): CategoryGroup[] {
  const map = new Map<string, SuiteResult[]>();
  for (const s of suites) {
    const list = map.get(s.category) || [];
    list.push(s);
    map.set(s.category, list);
  }
  // Explicit order: Functional UI first, then Health, Backend, Zero Indic
  const categoryOrder = ['Functional UI', 'Playground UI', 'Health Check', 'Backend API', 'Zero Indic Features'];
  const groups: CategoryGroup[] = [];
  const orderedKeys = [...map.keys()].sort((a, b) => {
    const ai = categoryOrder.findIndex(c => a.includes(c) || c.includes(a));
    const bi = categoryOrder.findIndex(c => b.includes(c) || c.includes(b));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  for (const category of orderedKeys) {
    const items = map.get(category)!;
    groups.push({
      category,
      suites: items,
      passed: items.filter(s => s.status === 'pass').length,
      failed: items.filter(s => s.status === 'fail').length,
      totalDuration: items.reduce((sum, s) => sum + s.duration_s, 0),
    });
  }
  return groups;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr.replace(' ', 'T'));
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatTime(timestampStr: string): string {
  const d = new Date(timestampStr.replace(' ', 'T'));
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatSuiteDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ── HTML Template ────────────────────────────────────────────────────────────

function buildEmailHTML(summary: PlaygroundSummary): string {
  const { totalSuites, passed, failed, suites, runDate, runTimestamp, endTimestamp } = summary;
  const passRate = totalSuites > 0 ? Math.round((passed / totalSuites) * 100) : 0;
  const rateColor = passRate >= 95 ? '#00E676' : passRate >= 80 ? '#FFD600' : '#FF5252';

  const durationSec = computeDurationSeconds(runTimestamp, endTimestamp);
  const duration = formatDuration(durationSec);
  const dateDisplay = formatDate(runDate);
  const timeDisplay = formatTime(runTimestamp);

  const categories = groupByCategory(suites);
  const failedSuites = suites.filter(s => s.status === 'fail');

  const reportBaseUrl = process.env.REPORT_BASE_URL || 'https://yamini-pal-singh.github.io/playground-testing';
  const dashboardUrl = `${reportBaseUrl}/Playground-Report.html`;
  const playgroundSheetId = process.env.GOOGLE_SHEET_ID_PLAYGROUND_OUTPUT || '1Mw1CFU6yV6Q-8N_qLU09gAdj6fe2qg0ZsqZPn9SUE3s';
  const masterSheetUrl = `https://docs.google.com/spreadsheets/d/${playgroundSheetId}/edit#gid=1927033749`;

  // Build category rows with grouped suites
  let categoryTableRows = '';
  for (const group of categories) {
    const catRate = group.suites.length > 0
      ? Math.round((group.passed / group.suites.length) * 100)
      : 0;
    const catRateColor = catRate === 100 ? '#00E676' : catRate >= 80 ? '#FFD600' : '#FF5252';

    // Category header row
    categoryTableRows += `
      <tr>
        <td colspan="4" style="padding:12px 16px 10px;background:#1a1f3d;border-bottom:1px solid #2a2f5a;">
          <table style="width:100%;border-collapse:collapse;"><tr>
            <td style="font-size:13px;font-weight:700;color:#B388FF;text-transform:uppercase;letter-spacing:1px;">
              ${group.category}
            </td>
            <td style="text-align:right;font-size:11px;color:#78909C;">
              <span style="color:${catRateColor};font-weight:700;">${catRate}%</span>
              &nbsp;&middot;&nbsp; ${group.passed}/${group.suites.length} passed
              &nbsp;&middot;&nbsp; ${formatSuiteDuration(group.totalDuration)}
            </td>
          </tr></table>
        </td>
      </tr>`;

    // Individual suite rows
    for (const suite of group.suites) {
      const isPassed = suite.status === 'pass';
      const statusIcon = isPassed
        ? '<span style="color:#00E676;font-size:16px;font-weight:700;">&#10003;</span>'
        : '<span style="color:#FF5252;font-size:16px;font-weight:700;">&#10007;</span>';
      const nameColor = isPassed ? '#e0e0e0' : '#FF8A80';
      const failReason = !isPassed && suite.failure_reason
        ? `<div style="font-size:11px;color:#78909C;margin-top:3px;">${suite.failure_reason}</div>`
        : '';

      categoryTableRows += `
        <tr>
          <td style="padding:10px 16px 10px 28px;border-bottom:1px solid #1e2a3a;font-size:13px;color:${nameColor};">
            ${suite.name}${failReason}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e2a3a;text-align:center;">
            ${statusIcon}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e2a3a;text-align:center;font-size:12px;color:#90A4AE;">
            ${formatSuiteDuration(suite.duration_s)}
          </td>
          <td style="padding:10px 16px;border-bottom:1px solid #1e2a3a;font-size:12px;color:#546E7A;">
            ${!isPassed && suite.failure_reason ? suite.failure_reason : '—'}
          </td>
        </tr>`;
    }
  }

  // Build failed tests section
  let failedSection = '';
  if (failedSuites.length > 0) {
    let failedRows = '';
    failedSuites.forEach((t, i) => {
      failedRows += `
        <tr>
          <td style="padding:12px 14px;border-bottom:1px solid #1e2a3a;font-size:13px;color:#ccc;">
            <span style="color:#FF5252;font-weight:600;margin-right:6px;">#${i + 1}</span>${t.name}
          </td>
          <td style="padding:12px 14px;border-bottom:1px solid #1e2a3a;">
            <span style="background:#1e2a3a;color:#B388FF;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600;">${t.category}</span>
          </td>
          <td style="padding:12px 14px;border-bottom:1px solid #1e2a3a;font-size:12px;color:#FF8A80;max-width:220px;">
            ${t.failure_reason || 'Unknown error'}
          </td>
        </tr>`;
    });

    failedSection = `
      <div style="padding:0 24px 20px;">
        <table style="width:100%;border-collapse:collapse;"><tr>
          <td style="padding:0 0 12px;">
            <table style="border-collapse:collapse;"><tr>
              <td style="width:4px;background:#FF5252;border-radius:2px;"></td>
              <td style="padding-left:12px;">
                <span style="font-size:14px;color:#FF5252;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">
                  ${failedSuites.length} Failed Test${failedSuites.length > 1 ? 's' : ''}
                </span>
              </td>
            </tr></table>
          </td>
        </tr></table>
        <table style="width:100%;border-collapse:collapse;background:#141c2e;border-radius:10px;overflow:hidden;border:1px solid #2a1a1a;">
          <thead>
            <tr style="background:#1a2540;">
              <th style="padding:10px 14px;text-align:left;font-size:11px;color:#607D8B;text-transform:uppercase;letter-spacing:1px;">Test</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;color:#607D8B;text-transform:uppercase;letter-spacing:1px;">Category</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;color:#607D8B;text-transform:uppercase;letter-spacing:1px;">Error</th>
            </tr>
          </thead>
          <tbody>${failedRows}</tbody>
        </table>
      </div>`;
  }

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#0a0e17;-webkit-text-size-adjust:100%;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e17;">
<tr><td align="center" style="padding:16px 0;">

<table role="presentation" width="660" cellpadding="0" cellspacing="0" style="max-width:660px;width:100%;background:#0f1623;">

  <!-- HEADER -->
  <tr><td style="background:linear-gradient(135deg,#0D47A1 0%,#1565C0 40%,#00838F 100%);padding:36px 32px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:top;">
        <div style="display:inline-block;width:40px;height:40px;background:rgba(255,255,255,0.15);border-radius:10px;text-align:center;line-height:40px;font-size:20px;margin-bottom:12px;">&#127919;</div>
        <h1 style="margin:8px 0 2px;font-size:24px;font-weight:800;color:white;letter-spacing:-0.5px;">Playground QC Report</h1>
        <p style="margin:0 0 2px;font-size:14px;color:rgba(255,255,255,0.8);">Shunyalabs Playground Automation</p>
        <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.5);">${dateDisplay} &bull; ${timeDisplay} &bull; Duration: ${duration}</p>
      </td>
      <td style="text-align:right;vertical-align:top;width:120px;">
        <div style="background:rgba(255,255,255,0.12);border-radius:12px;padding:12px 16px;display:inline-block;">
          <div style="font-size:10px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:1px;">Pass Rate</div>
          <div style="font-size:36px;font-weight:800;color:${rateColor};line-height:1.1;">${passRate}%</div>
        </div>
      </td>
    </tr></table>
  </td></tr>

  <!-- KPI STRIP -->
  <tr><td style="background:#141c2e;padding:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td width="20%" style="padding:20px;text-align:center;border-right:1px solid #1e2a3a;">
          <div style="font-size:28px;font-weight:800;color:#E0E0E0;">${totalSuites}</div>
          <div style="font-size:10px;color:#607D8B;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px;">Total</div>
        </td>
        <td width="20%" style="padding:20px;text-align:center;border-right:1px solid #1e2a3a;">
          <div style="font-size:28px;font-weight:800;color:#00E676;">${passed}</div>
          <div style="font-size:10px;color:#607D8B;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px;">Passed</div>
        </td>
        <td width="20%" style="padding:20px;text-align:center;border-right:1px solid #1e2a3a;">
          <div style="font-size:28px;font-weight:800;color:#FF5252;">${failed}</div>
          <div style="font-size:10px;color:#607D8B;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px;">Failed</div>
        </td>
        <td width="20%" style="padding:20px;text-align:center;border-right:1px solid #1e2a3a;">
          <div style="font-size:28px;font-weight:800;color:${rateColor};">${passRate}%</div>
          <div style="font-size:10px;color:#607D8B;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px;">Pass Rate</div>
        </td>
        <td width="20%" style="padding:20px;text-align:center;">
          <div style="font-size:24px;font-weight:800;color:#64B5F6;">${duration}</div>
          <div style="font-size:10px;color:#607D8B;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px;">Duration</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- PROGRESS BAR -->
  <tr><td style="padding:16px 24px;background:#0f1623;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#141c2e;border-radius:10px;">
      <tr>
        <td style="padding:14px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:12px;">
              <div style="height:8px;background:#1e2a3a;border-radius:4px;overflow:hidden;">
                <div style="width:${passRate}%;height:100%;background:linear-gradient(90deg,#00C853,#00E676);border-radius:4px;"></div>
              </div>
            </td>
            <td style="white-space:nowrap;font-size:12px;color:#90A4AE;font-weight:600;width:1%;">
              ${passed} of ${totalSuites} tests passing
            </td>
          </tr></table>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- RESULTS BY CATEGORY -->
  <tr><td style="padding:8px 24px 20px;">
    <h3 style="font-size:14px;color:#90A4AE;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 12px;font-weight:600;">Results by Category</h3>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#141c2e;border-radius:10px;overflow:hidden;">
      <thead>
        <tr style="background:#1a2540;">
          <th style="padding:12px 16px;text-align:left;font-size:11px;color:#607D8B;text-transform:uppercase;letter-spacing:1px;">Suite</th>
          <th style="padding:12px 12px;text-align:center;font-size:11px;color:#607D8B;text-transform:uppercase;letter-spacing:1px;width:60px;">Status</th>
          <th style="padding:12px 12px;text-align:center;font-size:11px;color:#607D8B;text-transform:uppercase;letter-spacing:1px;width:70px;">Duration</th>
          <th style="padding:12px 16px;text-align:left;font-size:11px;color:#607D8B;text-transform:uppercase;letter-spacing:1px;">Failure Reason</th>
        </tr>
      </thead>
      <tbody>${categoryTableRows}</tbody>
    </table>
  </td></tr>

  <!-- FAILED TESTS (conditional) -->
  ${failedSection}

  <!-- DASHBOARD ATTACHMENT NOTE -->
  <tr><td style="padding:8px 24px 4px;text-align:center;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;background:#141c2e;border-radius:10px;border:1px solid #1e2a3a;"><tr>
      <td style="padding:14px 20px;text-align:center;">
        <span style="font-size:20px;vertical-align:middle;">&#128206;</span>
        <span style="font-size:13px;color:#90A4AE;font-weight:600;margin-left:6px;">Full Interactive Dashboard attached as HTML — open in browser for charts &amp; drill-down</span>
      </td>
    </tr></table>
  </td></tr>

  <!-- CTA BUTTONS -->
  <tr><td style="padding:12px 24px 28px;text-align:center;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
      <td style="padding:0 6px;">
        <a href="${dashboardUrl}"
           style="display:inline-block;background:linear-gradient(135deg,#1565C0,#00838F);color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.3px;">
          &#128202; View Full Dashboard
        </a>
      </td>
      <td style="padding:0 6px;">
        <a href="${masterSheetUrl}"
           style="display:inline-block;background:#1e2a3a;color:#64B5F6;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:13px;border:1px solid #2a3a4a;letter-spacing:0.3px;">
          &#128196; View Test Cases
        </a>
      </td>
    </tr></table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#0a0e17;padding:24px;text-align:center;border-top:1px solid #1e2a3a;">
    <p style="margin:0 0 6px;font-size:13px;color:#546E7A;">Thanks &amp; Regards,</p>
    <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#B0BEC5;">Playground Automation BOT &#129302; by Yamini</p>
    <p style="margin:0;font-size:11px;color:#37474F;">This is an automated report generated from the latest test run.</p>
  </td></tr>

</table>

</td></tr>
</table>

</body></html>`;
}

// ── Send Email ───────────────────────────────────────────────────────────────

async function sendEmail() {
  const summary = loadLatestSummary();
  const { totalSuites, passed, failed, runDate } = summary;
  const passRate = totalSuites > 0 ? Math.round((passed / totalSuites) * 100) : 0;
  const dateDisplay = formatDate(runDate);

  const smtpAuth = resolveSmtpAuth();
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: smtpAuth,
  });

  const statusEmoji = passRate >= 95 ? '\u{1F7E2}' : passRate >= 80 ? '\u{1F7E1}' : '\u{1F534}';

  const recipients = process.env.REPORT_EMAIL_TO;
  if (!recipients) {
    console.error('❌ REPORT_EMAIL_TO is not set in .env');
    process.exit(1);
  }

  // Attach the full HTML dashboard report if it exists
  const reportPath = path.resolve(__dirname, '..', 'reports', 'Playground-Report.html');
  const attachments: any[] = [];
  if (fs.existsSync(reportPath)) {
    attachments.push({
      filename: `Playground-Dashboard-${runDate}.html`,
      path: reportPath,
      contentType: 'text/html',
    });
  }

  const priorityPrefix = failed > 0 ? '[HIGH PRIORITY] ' : '';
  const headers: Record<string, string> = {};
  if (failed > 0) {
    headers['X-Priority'] = '1';
    headers['X-MSMail-Priority'] = 'High';
    headers['Importance'] = 'High';
  }

  const mailOptions = {
    from: process.env.REPORT_EMAIL_FROM || smtpAuth.user,
    to: recipients,
    subject: `${priorityPrefix}${statusEmoji} Playground QC — ${passRate}% Pass Rate (${passed}/${totalSuites}) — ${dateDisplay}`,
    html: buildEmailHTML(summary),
    attachments,
    headers,
  };

  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = 30000;
  let lastError: any;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ Email sent to ${recipients.trim()} — MessageId: ${info.messageId}${attempt > 1 ? ` (attempt ${attempt}/${MAX_ATTEMPTS})` : ''}`);
      console.log(`   📊 Summary: ${passed}/${totalSuites} passed (${passRate}%) | ${failed} failed`);
      return;
    } catch (error: any) {
      lastError = error;
      console.error(`❌ Email attempt ${attempt}/${MAX_ATTEMPTS} failed: ${formatSmtpError(error)}`);
      if (attempt < MAX_ATTEMPTS) {
        console.log(`⏳ Retrying in ${BACKOFF_MS / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, BACKOFF_MS));
      }
    }
  }

  console.error(`❌ All ${MAX_ATTEMPTS} email attempts failed. Last error: ${formatSmtpError(lastError || {})}`);
  process.exit(1);
}

sendEmail();
