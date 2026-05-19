/**
 * Playground Report Generator — Stakeholder-Grade HTML Dashboard
 * Reads playground-run-*.json (every execution) and playground-summary-*.json (fallback),
 * plus playground-daily-*.log files,
 * generates a self-contained dark-themed HTML dashboard with embedded test logs.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPORTS_DIR = path.resolve(__dirname, '..', 'reports');
const LOGS_DIR = path.resolve(__dirname, '..', 'logs');
const OUTPUT_HTML = path.resolve(REPORTS_DIR, 'Playground-Report.html');
const OUTPUT_RUNS_JSON = path.resolve(REPORTS_DIR, 'playground-runs.json');

// ── Interfaces ──────────────────────────────────────────────────────────────

interface SuiteResult {
  category: string;
  name: string;
  status: 'pass' | 'fail';
  duration_s: number;
  failure_reason: string;
}

interface DailySummary {
  runId?: string;
  runDate: string;
  runTimestamp: string;
  endTimestamp: string;
  totalSuites: number;
  passed: number;
  failed: number;
  suites: SuiteResult[];
}

function parseSummaryFile(filePath: string): DailySummary | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as DailySummary;
  } catch {
    console.warn(`Skipping invalid file: ${path.basename(filePath)}`);
    return null;
  }
}

/** Load every completed run (newest first). Per-run files are authoritative; daily summary is fallback. */
function loadAllSummaries(): DailySummary[] {
  if (!fs.existsSync(REPORTS_DIR)) return [];

  const byRunId = new Map<string, DailySummary>();
  const datesWithRunFiles = new Set<string>();

  const runFiles = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.startsWith('playground-run-') && f.endsWith('.json'))
    .sort()
    .reverse();

  for (const file of runFiles) {
    const summary = parseSummaryFile(path.join(REPORTS_DIR, file));
    if (!summary?.runDate) continue;
    datesWithRunFiles.add(summary.runDate);
    const id = summary.runId || file.replace(/^playground-run-|\.json$/g, '');
    summary.runId = id;
    byRunId.set(id, summary);
  }

  // Legacy: one playground-summary-YYYY-MM-DD.json per day (overwritten each run — skip if we have run files)
  const summaryFiles = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.startsWith('playground-summary-') && f.endsWith('.json'))
    .sort()
    .reverse();

  for (const file of summaryFiles) {
    const summary = parseSummaryFile(path.join(REPORTS_DIR, file));
    if (!summary?.runDate) continue;
    if (datesWithRunFiles.has(summary.runDate)) continue;
    const id = summary.runId || `summary-${summary.runDate}`;
    if (!byRunId.has(id)) {
      summary.runId = id;
      byRunId.set(id, summary);
    }
  }

  return Array.from(byRunId.values()).sort((a, b) =>
    (b.runTimestamp || b.runDate).localeCompare(a.runTimestamp || a.runDate),
  );
}

// ── Parse log file into per-suite sections ──────────────────────────────────

function parseLogFile(logPath: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!fs.existsSync(logPath)) return result;

  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n');

  // Pattern: [Category] ▶  Suite Name  (but NOT [1/280] style lines)
  const suiteHeaderRe = /^\[([^\]]+)\]\s*▶\s\s(.+)$/;
  const numberedLineRe = /^\[\d+\/\d+\]/;

  interface Section { name: string; startLine: number; }
  const sections: Section[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (numberedLineRe.test(line)) continue;
    const m = suiteHeaderRe.exec(line);
    if (m) {
      sections.push({ name: m[2].trim(), startLine: i });
    }
  }

  for (let idx = 0; idx < sections.length; idx++) {
    const start = sections[idx].startLine;
    const end = idx + 1 < sections.length ? sections[idx + 1].startLine : lines.length;
    const sectionLines = lines.slice(start, end);
    result.set(sections[idx].name, sectionLines.join('\n'));
  }

  return result;
}

// ── Load all log data keyed by runDate ──────────────────────────────────────

function loadAllLogs(): Map<string, Map<string, string>> {
  const allLogs = new Map<string, Map<string, string>>();
  if (!fs.existsSync(LOGS_DIR)) return allLogs;

  const files = fs.readdirSync(LOGS_DIR)
    .filter(f => f.startsWith('playground-daily-') && f.endsWith('.log'))
    .sort()
    .reverse();

  for (const file of files) {
    const dateMatch = file.match(/playground-daily-(\d{4}-\d{2}-\d{2})\.log/);
    if (dateMatch) {
      allLogs.set(dateMatch[1], parseLogFile(path.join(LOGS_DIR, file)));
    }
  }
  return allLogs;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtDuration(s: number): string {
  const mins = Math.floor(s / 60);
  const secs = Math.round(s % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function passRate(passed: number, total: number): number {
  return total === 0 ? 0 : Math.round((passed / total) * 100);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Generate HTML ───────────────────────────────────────────────────────────

function generateHTML(summaries: DailySummary[], allLogs: Map<string, Map<string, string>>): string {
  if (summaries.length === 0) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>No Data</title></head>
<body style="background:#0a0e17;color:#e0e0e0;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;">
<h1 style="opacity:0.5">No Playground reports found</h1></body></html>`;
  }

  // Build per-run log data as JSON-safe object: { runDate: { suiteName: logText } }
  const logsDataObj: Record<string, Record<string, string>> = {};
  for (const [date, suiteMap] of allLogs.entries()) {
    logsDataObj[date] = {};
    for (const [name, text] of suiteMap.entries()) {
      logsDataObj[date][name] = text;
    }
  }

  const summariesJson = JSON.stringify(summaries);
  const logsJson = JSON.stringify(logsDataObj);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Playground QC Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif;
      background: #0a0e17;
      color: #e0e0e0;
      line-height: 1.6;
      padding: 0;
    }
    .container {
      max-width: 1360px;
      margin: 0 auto;
      padding: 32px 24px;
    }

    /* ── Header ──────────────────────────────────────────── */
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 36px;
      padding-bottom: 24px;
      border-bottom: 1px solid #252540;
    }
    .logo-area h1 {
      font-size: 30px;
      font-weight: 800;
      background: linear-gradient(135deg, #6c47ff, #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      letter-spacing: -0.5px;
    }
    .logo-area .tagline {
      font-size: 12px;
      color: #555;
      margin-top: 2px;
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .run-date-display {
      font-size: 13px;
      color: #888;
    }
    .run-selector {
      background: #1a1a2e;
      color: #e0e0e0;
      border: 1px solid #252540;
      padding: 8px 14px;
      border-radius: 10px;
      font-size: 13px;
      cursor: pointer;
      outline: none;
      transition: border-color 0.2s;
    }
    .run-selector:hover, .run-selector:focus { border-color: #6c47ff; }

    /* ── Section Titles ──────────────────────────────────── */
    .section-title {
      font-size: 17px;
      font-weight: 700;
      color: #a78bfa;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-title::before {
      content: '';
      display: inline-block;
      width: 4px;
      height: 20px;
      background: linear-gradient(180deg, #6c47ff, #a78bfa);
      border-radius: 2px;
    }

    /* ── KPI Cards ───────────────────────────────────────── */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 16px;
      margin-bottom: 36px;
    }
    @media (max-width: 1100px) { .kpi-grid { grid-template-columns: repeat(3, 1fr); } }
    .kpi-card {
      background: #1a1a2e;
      border: 1px solid #252540;
      border-radius: 12px;
      padding: 22px 18px;
      text-align: center;
      position: relative;
      overflow: hidden;
      transition: transform 0.2s, border-color 0.2s;
    }
    .kpi-card:hover { transform: translateY(-2px); border-color: #3a3a5e; }
    .kpi-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
    }
    .kpi-card[data-accent="blue"]::before { background: linear-gradient(90deg, #6c47ff, #818cf8); }
    .kpi-card[data-accent="green"]::before { background: linear-gradient(90deg, #22c55e, #4ade80); }
    .kpi-card[data-accent="red"]::before { background: linear-gradient(90deg, #ef4444, #f87171); }
    .kpi-card[data-accent="yellow"]::before { background: linear-gradient(90deg, #eab308, #facc15); }
    .kpi-card[data-accent="purple"]::before { background: linear-gradient(90deg, #a78bfa, #c4b5fd); }
    .kpi-value {
      font-size: 34px;
      font-weight: 800;
      line-height: 1.1;
    }
    .kpi-card[data-accent="blue"] .kpi-value { color: #818cf8; }
    .kpi-card[data-accent="green"] .kpi-value { color: #22c55e; }
    .kpi-card[data-accent="red"] .kpi-value { color: #ef4444; }
    .kpi-card[data-accent="yellow"] .kpi-value { color: #eab308; }
    .kpi-card[data-accent="purple"] .kpi-value { color: #a78bfa; }
    .kpi-label {
      font-size: 10px;
      color: #777;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-top: 6px;
      font-weight: 600;
    }

    /* ── Trend Chart ─────────────────────────────────────── */
    .panel {
      background: #1a1a2e;
      border: 1px solid #252540;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 36px;
    }
    .trend-chart {
      display: flex;
      gap: 8px;
      align-items: flex-end;
      overflow-x: auto;
      padding-bottom: 8px;
      min-height: 180px;
    }
    .trend-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex: 1;
      min-width: 52px;
      max-width: 90px;
    }
    .trend-pct { font-size: 11px; font-weight: 700; margin-bottom: 4px; }
    .trend-bar-outer {
      width: 100%;
      max-width: 44px;
      height: 110px;
      background: #252540;
      border-radius: 6px;
      position: relative;
      overflow: hidden;
    }
    .trend-bar-inner {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      border-radius: 6px;
      transition: height 0.5s ease;
    }
    .trend-date { font-size: 10px; color: #666; margin-top: 6px; white-space: nowrap; }

    /* ── Category Cards ──────────────────────────────────── */
    .cat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
      margin-bottom: 36px;
    }
    .cat-card {
      background: #1a1a2e;
      border: 1px solid #252540;
      border-radius: 12px;
      padding: 20px;
      cursor: pointer;
      transition: border-color 0.2s, transform 0.2s;
    }
    .cat-card:hover { border-color: #6c47ff; transform: translateY(-2px); }
    .cat-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .cat-card-header h3 { font-size: 14px; font-weight: 700; color: #c4b5fd; }
    .gauge-wrap { width: 54px; height: 54px; }
    .gauge { width: 100%; height: 100%; transform: rotate(-90deg); }
    .gauge-bg { fill: none; stroke: #252540; stroke-width: 3.5; }
    .gauge-fill { fill: none; stroke-width: 3.5; stroke-linecap: round; transition: stroke-dasharray 0.6s ease; }
    .gauge-text {
      fill: #e0e0e0; font-size: 9px; font-weight: 700;
      text-anchor: middle; dominant-baseline: middle;
      transform: rotate(90deg); transform-origin: 18px 18px;
    }
    .cat-progress-bar {
      width: 100%; height: 5px;
      background: #252540; border-radius: 3px;
      overflow: hidden; margin-bottom: 8px;
    }
    .cat-progress-fill { height: 100%; border-radius: 3px; transition: width 0.4s ease; }
    .cat-meta { font-size: 12px; color: #777; margin-bottom: 10px; }
    .suite-list { display: flex; flex-direction: column; gap: 4px; }
    .suite-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #aaa; }
    .suite-icon {
      display: inline-flex; align-items: center; justify-content: center;
      width: 18px; height: 18px; border-radius: 50%; font-size: 10px; font-weight: 700; flex-shrink: 0;
    }
    .pass-icon { background: rgba(34,197,94,0.15); color: #22c55e; }
    .fail-icon { background: rgba(239,68,68,0.15); color: #ef4444; }

    /* ── Results Table ────────────────────────────────────── */
    .table-wrap {
      background: #1a1a2e;
      border: 1px solid #252540;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 36px;
    }
    .results-table { width: 100%; border-collapse: collapse; }
    .results-table thead th {
      background: #12122a;
      padding: 12px 16px;
      text-align: left;
      font-size: 10px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      font-weight: 700;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      transition: color 0.2s;
    }
    .results-table thead th:hover { color: #a78bfa; }
    .results-table thead th .sort-arrow { margin-left: 4px; font-size: 9px; opacity: 0.4; }
    .results-table thead th.sorted .sort-arrow { opacity: 1; color: #a78bfa; }
    .results-table tbody td {
      padding: 10px 16px;
      border-bottom: 1px solid #1e1e30;
      font-size: 13px;
      vertical-align: top;
    }
    .results-table tbody tr.suite-row { cursor: pointer; transition: background 0.15s; }
    .results-table tbody tr.suite-row:hover td { background: #1e1e30; }
    .cat-header-row td {
      background: #12122a;
      font-weight: 700;
      color: #a78bfa;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      padding: 10px 16px;
      border-left: 3px solid #6c47ff;
    }
    .badge {
      display: inline-block;
      padding: 3px 14px;
      border-radius: 50px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .badge-pass { background: rgba(34,197,94,0.12); color: #22c55e; border: 1px solid rgba(34,197,94,0.25); }
    .badge-fail { background: rgba(239,68,68,0.12); color: #ef4444; border: 1px solid rgba(239,68,68,0.25); }
    .reason-cell { color: #888; font-size: 12px; max-width: 320px; }
    .no-error { color: #444; }
    .expand-arrow {
      display: inline-block;
      width: 18px;
      font-size: 11px;
      color: #666;
      transition: transform 0.2s;
      flex-shrink: 0;
    }
    .expand-arrow.open { transform: rotate(90deg); }

    /* ── Log Section ─────────────────────────────────────── */
    .log-row td { padding: 0 !important; border-bottom: 1px solid #1e1e30; }
    .log-container {
      display: none;
      background: #111827;
      padding: 16px 20px;
      max-height: 400px;
      overflow-y: auto;
      position: relative;
    }
    .log-container.open { display: block; }
    .log-container pre {
      font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      color: #9ca3af;
      margin: 0;
    }
    .log-container .log-pass { color: #22c55e; }
    .log-container .log-fail { color: #ef4444; }
    .log-container .log-warn { color: #eab308; }
    .log-container .log-info { color: #6b7280; }
    .log-no-data { color: #555; font-style: italic; padding: 20px; }
    .copy-btn {
      position: absolute;
      top: 10px;
      right: 14px;
      background: #252540;
      color: #aaa;
      border: 1px solid #3a3a5e;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 11px;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
      z-index: 2;
    }
    .copy-btn:hover { background: #6c47ff; color: #fff; }

    /* ── Failed Tests Panel ──────────────────────────────── */
    .failed-section {
      background: #1a1a2e;
      border: 1px solid #3b1f1f;
      border-left: 4px solid #ef4444;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 36px;
    }
    .failed-section .section-title { color: #f87171; }
    .failed-section .section-title::before { background: linear-gradient(180deg, #ef4444, #f87171); }
    .fail-card {
      background: #1f1520;
      border: 1px solid #3b1f1f;
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 10px;
    }
    .fail-card:last-child { margin-bottom: 0; }
    .fail-card-name { font-size: 14px; font-weight: 700; color: #f87171; margin-bottom: 2px; }
    .fail-card-cat { font-size: 10px; color: #777; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
    .fail-card-duration { font-size: 12px; color: #888; margin-bottom: 8px; }
    .fail-card-reason {
      font-size: 12px; color: #ccc;
      background: #0a0e17;
      padding: 10px 14px;
      border-radius: 8px;
      border-left: 3px solid #ef4444;
      font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
    }
    .no-failures { color: #22c55e; font-size: 14px; text-align: center; padding: 16px; }

    /* ── Timing Analysis ─────────────────────────────────── */
    .timing-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 6px;
    }
    .timing-name {
      font-size: 12px;
      color: #bbb;
      width: 220px;
      flex-shrink: 0;
      text-align: right;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .timing-bar-wrap {
      flex: 1;
      height: 20px;
      background: #252540;
      border-radius: 4px;
      overflow: hidden;
    }
    .timing-bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.4s ease;
      min-width: 2px;
    }
    .timing-dur {
      font-size: 11px;
      color: #888;
      width: 60px;
      flex-shrink: 0;
      text-align: left;
    }

    /* ── Footer ──────────────────────────────────────────── */
    .footer {
      text-align: center;
      padding: 32px 0 16px;
      border-top: 1px solid #252540;
      margin-top: 24px;
    }
    .footer-ts { font-size: 11px; color: #555; }
    .footer-brand { font-size: 12px; color: #6c47ff; font-weight: 600; margin-top: 4px; }

    /* ── Responsive ──────────────────────────────────────── */
    @media (max-width: 768px) {
      .header-bar { flex-direction: column; align-items: flex-start; }
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      .kpi-grid .kpi-card:last-child { grid-column: span 2; }
      .cat-grid { grid-template-columns: 1fr; }
      .timing-name { width: 120px; font-size: 11px; }
      .results-table { font-size: 12px; }
      .results-table thead th, .results-table tbody td { padding: 8px 10px; }
    }

    /* ── Scrollbar ───────────────────────────────────────── */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #0a0e17; }
    ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #555; }
  </style>
</head>
<body>
<div class="container">

  <!-- HEADER -->
  <div class="header-bar">
    <div class="logo-area">
      <h1>Playground QC Dashboard</h1>
      <div class="tagline">Automated test results &amp; analysis</div>
    </div>
    <div class="header-right">
      <span class="run-date-display" id="runDateDisplay"></span>
      <select class="run-selector" id="runSelector" onchange="switchRun(this.selectedIndex)"></select>
      <div style="position:relative">
        <button class="run-selector" style="border-color:#6c47ff;color:#a78bfa" onclick="toggleExport(event)">Export ▾</button>
        <div id="exportMenu" style="display:none;position:absolute;top:40px;right:0;background:#1a1a2e;border:1px solid #252540;border-radius:10px;padding:4px;z-index:20;min-width:140px">
          <a onclick="exportJson()" style="display:block;padding:8px 12px;color:#e0e0e0;cursor:pointer;border-radius:6px;font-size:13px">Export JSON</a>
          <a onclick="exportCsv()" style="display:block;padding:8px 12px;color:#e0e0e0;cursor:pointer;border-radius:6px;font-size:13px">Export CSV</a>
        </div>
      </div>
      <button class="run-selector" style="border-color:#6c47ff;color:#a78bfa" onclick="window.print()">Print</button>
    </div>
  </div>

  <!-- TABS -->
  <div style="display:flex;gap:32px;border-bottom:1px solid #252540;margin-bottom:28px">
    <button class="dash-tab active" data-tab="current" style="background:none;border:none;color:#a78bfa;padding:12px 4px;font-size:15px;font-weight:500;cursor:pointer;border-bottom:2px solid #a78bfa">Latest Run</button>
    <button class="dash-tab" data-tab="insights" style="background:none;border:none;color:#6b7280;padding:12px 4px;font-size:15px;font-weight:500;cursor:pointer;border-bottom:2px solid transparent">Insights</button>
    <button class="dash-tab" data-tab="history" style="background:none;border:none;color:#6b7280;padding:12px 4px;font-size:15px;font-weight:500;cursor:pointer;border-bottom:2px solid transparent">Run History</button>
    <button class="dash-tab" data-tab="calendar" style="background:none;border:none;color:#6b7280;padding:12px 4px;font-size:15px;font-weight:500;cursor:pointer;border-bottom:2px solid transparent">Calendar View</button>
  </div>

  <!-- Existing dashboard lives inside Current Run tab -->
  <div id="tab-current" class="dash-tab-content">


  <!-- KPI CARDS -->
  <div class="kpi-grid" id="kpiGrid"></div>

  <!-- PASS RATE TREND -->
  <div class="panel">
    <div class="section-title">Pass Rate Trend</div>
    <div class="trend-chart" id="trendChart"></div>
  </div>

  <!-- CATEGORY BREAKDOWN -->
  <div class="section-title">Category Breakdown</div>
  <div class="cat-grid" id="catGrid"></div>

  <!-- DETAILED RESULTS TABLE -->
  <div class="section-title">Detailed Results</div>
  <div class="table-wrap">
    <table class="results-table" id="resultsTable">
      <thead>
        <tr>
          <th data-col="name" onclick="sortTable('name')">Suite Name <span class="sort-arrow">&#9650;</span></th>
          <th data-col="status" onclick="sortTable('status')">Status <span class="sort-arrow">&#9650;</span></th>
          <th data-col="duration" onclick="sortTable('duration')">Duration <span class="sort-arrow">&#9650;</span></th>
          <th data-col="reason" onclick="sortTable('reason')">Failure Reason <span class="sort-arrow">&#9650;</span></th>
        </tr>
      </thead>
      <tbody id="resultsBody"></tbody>
    </table>
  </div>

  <!-- FAILED TESTS PANEL -->
  <div id="failedSection"></div>

  <!-- TIMING ANALYSIS -->
  <div class="panel">
    <div class="section-title">Timing Analysis</div>
    <div id="timingChart"></div>
  </div>

  </div>
  <!-- end tab-current wrapper -->

  <!-- RUN HISTORY TAB -->
  <div id="tab-history" class="dash-tab-content" style="display:none">
    <div class="kpi-grid" id="historyKpis"></div>
    <div id="historyList"></div>
  </div>

  <!-- CALENDAR VIEW TAB -->
  <div id="tab-calendar" class="dash-tab-content" style="display:none">
    <div class="kpi-grid" id="calendarKpis"></div>
    <div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <button class="run-selector" onclick="calMonth(-1)">« Prev</button>
        <h2 id="calMonthLabel" style="font-size:20px"></h2>
        <button class="run-selector" onclick="calMonth(1)">Next »</button>
      </div>
      <div id="calendarBody"></div>
    </div>
  </div>

  <!-- INSIGHTS TAB (aggregated analytics across all runs) -->
  <div id="tab-insights" class="dash-tab-content" style="display:none">
    <div class="kpi-grid" id="insightsKpis"></div>

    <!-- Flaky suites (intermittent failures) -->
    <div class="panel">
      <div class="section-title">Flaky Suites <span style="color:#6b7280;font-size:13px;font-weight:400">— pass sometimes, fail others</span></div>
      <div id="flakySuites"></div>
    </div>

    <!-- Most common failure reasons -->
    <div class="panel">
      <div class="section-title">Top Failure Reasons</div>
      <div id="topFailures"></div>
    </div>

    <!-- Coverage gaps: hours with no runs (catches missed schedule slots) -->
    <div class="panel">
      <div class="section-title">Schedule Coverage Heatmap (today)</div>
      <div style="color:#6b7280;font-size:13px;margin-bottom:12px">Green = run executed, dim = missed hourly slot</div>
      <div id="coverageMap"></div>
    </div>

    <!-- Suite duration trends -->
    <div class="panel">
      <div class="section-title">Slowest Suites (avg across runs)</div>
      <div id="slowestSuites"></div>
    </div>
  </div>

  <!-- RUN DETAIL MODAL -->
  <div id="runModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:100;justify-content:center;align-items:center;padding:24px">
    <div style="background:#1a1a2e;border:1px solid #252540;border-radius:16px;padding:28px;max-width:900px;width:100%;max-height:85vh;overflow-y:auto;position:relative">
      <button onclick="closeModal()" style="position:absolute;top:16px;right:16px;background:none;border:none;color:#999;font-size:24px;cursor:pointer">×</button>
      <h2 id="modalTitle" style="font-size:20px;margin-bottom:24px"></h2>
      <div id="modalKpis" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px"></div>
      <div style="font-size:14px;color:#888;margin-bottom:10px">Module Breakdown</div>
      <div id="modalSuites"></div>
      <div style="display:flex;gap:12px;margin-top:24px">
        <button class="run-selector" style="border-color:#6c47ff;color:#fff;background:#6c47ff" onclick="exportRun()">Export This Run</button>
        <button class="run-selector" onclick="closeModal()">Close</button>
      </div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <div class="footer-ts" id="footerTs"></div>
    <div class="footer-brand">Shunyalabs Playground Automation</div>
  </div>

</div>

<script>
// ── Data ──────────────────────────────────────────────────────────────────
var SUMMARIES = ${summariesJson};
var LOGS_DATA = ${logsJson};
var currentRunIdx = 0;
var currentSortCol = null;
var currentSortAsc = true;

// ── Init ──────────────────────────────────────────────────────────────────
(function init() {
  var sel = document.getElementById('runSelector');
  SUMMARIES.forEach(function(s, i) {
    var opt = document.createElement('option');
    opt.value = i;
    opt.textContent = s.runDate + ' (' + s.runTimestamp + ')';
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  });
  switchRun(0);
})();

// ── Switch Run ────────────────────────────────────────────────────────────
function switchRun(idx) {
  currentRunIdx = idx;
  var s = SUMMARIES[idx];
  var totalDuration = s.suites.reduce(function(a, x) { return a + x.duration_s; }, 0);
  var rate = s.totalSuites === 0 ? 0 : Math.round((s.passed / s.totalSuites) * 100);

  // Run date display
  document.getElementById('runDateDisplay').textContent = s.runTimestamp + ' — ' + (s.endTimestamp || '');

  // KPI Cards
  var rateColor = rate >= 90 ? 'green' : rate >= 70 ? 'yellow' : 'red';
  var todayRuns = SUMMARIES.filter(function(r) { return r.runDate === s.runDate; }).length;
  var todayLabel = todayRuns + ' / 8';
  var todayAccent = todayRuns >= 7 ? 'green' : todayRuns >= 4 ? 'yellow' : 'red';
  document.getElementById('kpiGrid').innerHTML =
    kpiCard('blue', s.totalSuites, 'Total Tests') +
    kpiCard('green', s.passed, 'Passed') +
    kpiCard('red', s.failed, 'Failed') +
    kpiCard(rateColor, rate + '%', 'Pass Rate') +
    kpiCard('purple', fmtDur(totalDuration), 'Duration') +
    kpiCard(todayAccent, todayLabel, "Today's Runs (of 8)");

  // Trend chart (all runs, chronological)
  renderTrend();

  // Category breakdown
  renderCategories(s);

  // Table
  renderTable(s);

  // Failed panel
  renderFailed(s);

  // Timing
  renderTiming(s);

  // Footer
  document.getElementById('footerTs').textContent = 'Report generated: ' + new Date().toLocaleString();
}

function kpiCard(accent, value, label) {
  return '<div class="kpi-card" data-accent="' + accent + '">' +
    '<div class="kpi-value">' + value + '</div>' +
    '<div class="kpi-label">' + label + '</div></div>';
}

function fmtDur(sec) {
  var m = Math.floor(sec / 60);
  var s = Math.round(sec % 60);
  return m > 0 ? m + 'm ' + s + 's' : s + 's';
}

function pr(passed, total) {
  return total === 0 ? 0 : Math.round((passed / total) * 100);
}

function esc(str) {
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── Trend ─────────────────────────────────────────────────────────────────
function renderTrend() {
  var container = document.getElementById('trendChart');
  var html = '';
  // Chronological order (reversed since summaries are newest-first)
  var items = SUMMARIES.slice().reverse();
  items.forEach(function(s) {
    var pct = pr(s.passed, s.totalSuites);
    var color = pct >= 90 ? '#22c55e' : pct >= 70 ? '#eab308' : '#ef4444';
    html += '<div class="trend-col">' +
      '<div class="trend-pct" style="color:' + color + '">' + pct + '%</div>' +
      '<div class="trend-bar-outer"><div class="trend-bar-inner" style="height:' + pct + '%;background:' + color + '"></div></div>' +
      '<div class="trend-date">' + s.runDate.slice(5) + '</div></div>';
  });
  container.innerHTML = html;
}

// ── Categories ────────────────────────────────────────────────────────────
function renderCategories(s) {
  var cats = [];
  var seen = {};
  s.suites.forEach(function(x) {
    if (!seen[x.category]) { seen[x.category] = true; cats.push(x.category); }
  });

  var html = '';
  cats.forEach(function(cat) {
    var suites = s.suites.filter(function(x) { return x.category === cat; });
    var passed = suites.filter(function(x) { return x.status === 'pass'; }).length;
    var total = suites.length;
    var rate = pr(passed, total);
    var gaugeColor = rate >= 80 ? '#22c55e' : rate >= 50 ? '#eab308' : '#ef4444';
    var catId = cat.replace(/[^a-zA-Z0-9]/g, '_');

    var suiteList = suites.map(function(x) {
      var icon = x.status === 'pass'
        ? '<span class="suite-icon pass-icon">&#10003;</span>'
        : '<span class="suite-icon fail-icon">&#10007;</span>';
      return '<div class="suite-item">' + icon + ' <span>' + esc(x.name) + '</span></div>';
    }).join('');

    html += '<div class="cat-card" onclick="scrollToCategory(\\'' + catId + '\\')">' +
      '<div class="cat-card-header"><h3>' + esc(cat) + '</h3>' +
      '<div class="gauge-wrap"><svg viewBox="0 0 36 36" class="gauge">' +
      '<path class="gauge-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>' +
      '<path class="gauge-fill" stroke-dasharray="' + rate + ', 100" style="stroke:' + gaugeColor + '" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>' +
      '<text x="18" y="21" class="gauge-text">' + rate + '%</text></svg></div></div>' +
      '<div class="cat-progress-bar"><div class="cat-progress-fill" style="width:' + rate + '%;background:' + gaugeColor + '"></div></div>' +
      '<div class="cat-meta">' + passed + '/' + total + ' passed</div>' +
      '<div class="suite-list">' + suiteList + '</div></div>';
  });
  document.getElementById('catGrid').innerHTML = html;
}

// ── Table ─────────────────────────────────────────────────────────────────
function renderTable(s) {
  var cats = [];
  var seen = {};
  s.suites.forEach(function(x) {
    if (!seen[x.category]) { seen[x.category] = true; cats.push(x.category); }
  });

  var html = '';
  var suiteIdx = 0;
  cats.forEach(function(cat) {
    var catId = cat.replace(/[^a-zA-Z0-9]/g, '_');
    html += '<tr class="cat-header-row" id="cat-' + catId + '"><td colspan="4">' + esc(cat) + '</td></tr>';
    var suites = s.suites.filter(function(x) { return x.category === cat; });
    suites.forEach(function(x) {
      var sid = 'suite-' + suiteIdx;
      var badgeCls = x.status === 'pass' ? 'badge-pass' : 'badge-fail';
      html += '<tr class="suite-row" onclick="toggleLog(\\'' + sid + '\\')">' +
        '<td><span class="expand-arrow" id="arrow-' + sid + '">&#9654;</span> ' + esc(x.name) + '</td>' +
        '<td><span class="badge ' + badgeCls + '">' + x.status.toUpperCase() + '</span></td>' +
        '<td data-sort="' + x.duration_s + '">' + fmtDur(x.duration_s) + '</td>' +
        '<td class="reason-cell">' + (x.failure_reason ? esc(x.failure_reason) : '<span class="no-error">&mdash;</span>') + '</td></tr>';

      // Log row
      var logText = getLogForSuite(s.runDate, x.name);
      html += '<tr class="log-row"><td colspan="4"><div class="log-container" id="log-' + sid + '">' +
        '<button class="copy-btn" onclick="event.stopPropagation();copyLog(\\'' + sid + '\\')">Copy</button>' +
        (logText ? '<pre>' + highlightLog(logText) + '</pre>' : '<div class="log-no-data">No logs available</div>') +
        '</div></td></tr>';
      suiteIdx++;
    });
  });
  document.getElementById('resultsBody').innerHTML = html;
}

function getLogForSuite(runDate, suiteName) {
  if (!LOGS_DATA[runDate]) return null;
  // Direct match first
  if (LOGS_DATA[runDate][suiteName]) return LOGS_DATA[runDate][suiteName];
  // Fuzzy: try finding a key that ends with the suite name or contains it
  var keys = Object.keys(LOGS_DATA[runDate]);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].indexOf(suiteName) !== -1 || suiteName.indexOf(keys[i]) !== -1) {
      return LOGS_DATA[runDate][keys[i]];
    }
  }
  return null;
}

function highlightLog(text) {
  return esc(text).split('\\n').map(function(line) {
    var trimmed = line.trimStart();
    if (/^[\\u2713\\u2714]|^\\s*[\\u2713\\u2714]|^\\s*\\u2705|^\\s*\\u2714/.test(line) || line.indexOf('\\u2713') !== -1) {
      return '<span class="log-pass">' + line + '</span>';
    }
    if (/^[\\u2717\\u2718]|^\\s*[\\u2717\\u2718]|^\\s*\\u274C|\\u2718/.test(line) || line.indexOf('\\u2718') !== -1 || line.indexOf('\\u274C') !== -1) {
      return '<span class="log-fail">' + line + '</span>';
    }
    if (/^\\s*\\u26A0|Warning|WARN|warn/.test(line) || line.indexOf('\\u26A0') !== -1) {
      return '<span class="log-warn">' + line + '</span>';
    }
    return '<span class="log-info">' + line + '</span>';
  }).join('\\n');
}

// ── Toggle Log ────────────────────────────────────────────────────────────
function toggleLog(sid) {
  var el = document.getElementById('log-' + sid);
  var arrow = document.getElementById('arrow-' + sid);
  if (el.classList.contains('open')) {
    el.classList.remove('open');
    arrow.classList.remove('open');
  } else {
    el.classList.add('open');
    arrow.classList.add('open');
  }
}

// ── Copy Log ──────────────────────────────────────────────────────────────
function copyLog(sid) {
  var el = document.getElementById('log-' + sid);
  var pre = el.querySelector('pre');
  if (!pre) return;
  var text = pre.textContent || pre.innerText;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function() {
      var btn = el.querySelector('.copy-btn');
      btn.textContent = 'Copied!';
      setTimeout(function() { btn.textContent = 'Copy'; }, 1500);
    });
  } else {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    var btn = el.querySelector('.copy-btn');
    btn.textContent = 'Copied!';
    setTimeout(function() { btn.textContent = 'Copy'; }, 1500);
  }
}

// ── Scroll to Category ───────────────────────────────────────────────────
function scrollToCategory(catId) {
  var el = document.getElementById('cat-' + catId);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Sort Table ────────────────────────────────────────────────────────────
function sortTable(col) {
  if (currentSortCol === col) {
    currentSortAsc = !currentSortAsc;
  } else {
    currentSortCol = col;
    currentSortAsc = true;
  }
  // Update header styles
  document.querySelectorAll('.results-table thead th').forEach(function(th) {
    th.classList.remove('sorted');
    if (th.getAttribute('data-col') === col) th.classList.add('sorted');
  });
  // Re-render with sorted data
  var s = SUMMARIES[currentRunIdx];
  var suites = s.suites.slice();
  suites.sort(function(a, b) {
    var va, vb;
    if (col === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
    else if (col === 'status') { va = a.status; vb = b.status; }
    else if (col === 'duration') { va = a.duration_s; vb = b.duration_s; }
    else if (col === 'reason') { va = a.failure_reason || ''; vb = b.failure_reason || ''; }
    else { va = a.name; vb = b.name; }
    if (va < vb) return currentSortAsc ? -1 : 1;
    if (va > vb) return currentSortAsc ? 1 : -1;
    return 0;
  });
  // Build sorted table without category grouping
  var html = '';
  var idx = 0;
  suites.forEach(function(x) {
    var sid = 'sorted-' + idx;
    var badgeCls = x.status === 'pass' ? 'badge-pass' : 'badge-fail';
    html += '<tr class="suite-row" onclick="toggleLog(\\'' + sid + '\\')">' +
      '<td><span class="expand-arrow" id="arrow-' + sid + '">&#9654;</span> ' + esc(x.name) + ' <span style="color:#555;font-size:10px">(' + esc(x.category) + ')</span></td>' +
      '<td><span class="badge ' + badgeCls + '">' + x.status.toUpperCase() + '</span></td>' +
      '<td data-sort="' + x.duration_s + '">' + fmtDur(x.duration_s) + '</td>' +
      '<td class="reason-cell">' + (x.failure_reason ? esc(x.failure_reason) : '<span class="no-error">&mdash;</span>') + '</td></tr>';
    var logText = getLogForSuite(s.runDate, x.name);
    html += '<tr class="log-row"><td colspan="4"><div class="log-container" id="log-' + sid + '">' +
      '<button class="copy-btn" onclick="event.stopPropagation();copyLog(\\'' + sid + '\\')">Copy</button>' +
      (logText ? '<pre>' + highlightLog(logText) + '</pre>' : '<div class="log-no-data">No logs available</div>') +
      '</div></td></tr>';
    idx++;
  });
  document.getElementById('resultsBody').innerHTML = html;
}

// ── Failed Panel ──────────────────────────────────────────────────────────
function renderFailed(s) {
  var failures = s.suites.filter(function(x) { return x.status === 'fail'; });
  var container = document.getElementById('failedSection');
  if (failures.length === 0) {
    container.innerHTML = '';
    return;
  }
  var html = '<div class="failed-section"><div class="section-title">Failed Tests (' + failures.length + ')</div>';
  failures.forEach(function(f) {
    html += '<div class="fail-card">' +
      '<div class="fail-card-name">' + esc(f.name) + '</div>' +
      '<div class="fail-card-cat">' + esc(f.category) + '</div>' +
      '<div class="fail-card-duration">Duration: ' + fmtDur(f.duration_s) + '</div>' +
      '<div class="fail-card-reason">' + esc(f.failure_reason || 'No error message captured') + '</div></div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

// ── Timing ────────────────────────────────────────────────────────────────
function renderTiming(s) {
  var sorted = s.suites.slice().sort(function(a, b) { return b.duration_s - a.duration_s; });
  var maxDur = sorted.length > 0 ? sorted[0].duration_s : 1;
  var html = '';
  sorted.forEach(function(x) {
    var pct = Math.max(2, (x.duration_s / maxDur) * 100);
    var color = x.status === 'pass' ? '#6c47ff' : '#ef4444';
    html += '<div class="timing-row">' +
      '<span class="timing-name">' + esc(x.name) + '</span>' +
      '<div class="timing-bar-wrap"><div class="timing-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
      '<span class="timing-dur">' + fmtDur(x.duration_s) + '</span></div>';
  });
  document.getElementById('timingChart').innerHTML = html;
}

// ── Tab switching ─────────────────────────────────────────────────────────
document.querySelectorAll('.dash-tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var name = btn.dataset.tab;
    document.querySelectorAll('.dash-tab').forEach(function(t) {
      t.style.color = '#6b7280';
      t.style.borderBottomColor = 'transparent';
      t.classList.remove('active');
    });
    btn.style.color = '#a78bfa';
    btn.style.borderBottomColor = '#a78bfa';
    btn.classList.add('active');
    document.querySelectorAll('.dash-tab-content').forEach(function(c) { c.style.display = 'none'; });
    document.getElementById('tab-' + name).style.display = 'block';
    if (name === 'history') renderHistory();
    if (name === 'calendar') renderCalendar();
    if (name === 'insights') renderInsights();
  });
});

// ── Export / Print ────────────────────────────────────────────────────────
function toggleExport(e) {
  e.stopPropagation();
  var m = document.getElementById('exportMenu');
  m.style.display = m.style.display === 'block' ? 'none' : 'block';
}
document.addEventListener('click', function() { document.getElementById('exportMenu').style.display = 'none'; });
function exportJson() {
  var blob = new Blob([JSON.stringify(SUMMARIES, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'playground-runs.json'; a.click();
}
function exportCsv() {
  var rows = [['runId', 'runDate', 'runTimestamp', 'totalSuites', 'passed', 'failed', 'passRate']];
  SUMMARIES.forEach(function(r) {
    var pr = r.totalSuites ? Math.round(r.passed / r.totalSuites * 100) : 0;
    rows.push([r.runId || '', r.runDate, r.runTimestamp, r.totalSuites, r.passed, r.failed, pr + '%']);
  });
  var csv = rows.map(function(r) { return r.map(function(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); }).join('\\n');
  var blob = new Blob([csv], { type: 'text/csv' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'playground-runs.csv'; a.click();
}

// ── Stats (for history/calendar tabs) ────────────────────────────────────
function renderKpiStats(containerId) {
  var total = SUMMARIES.length;
  var perfect = SUMMARIES.filter(function(r) { return r.failed === 0 && r.totalSuites > 0; }).length;
  var avgPass = total ? Math.round(SUMMARIES.reduce(function(s, r) { return s + (r.totalSuites ? r.passed / r.totalSuites * 100 : 0); }, 0) / total) : 0;
  var latest = SUMMARIES[0];
  var latestPr = latest && latest.totalSuites ? Math.round(latest.passed / latest.totalSuites * 100) : 0;
  var dates = new Set(SUMMARIES.map(function(r) { return r.runDate; }));
  var colorFor = function(n) { return n >= 95 ? '#22c55e' : n >= 80 ? '#eab308' : '#ef4444'; };
  document.getElementById(containerId).innerHTML =
    '<div class="kpi-card"><div class="kpi-label">TOTAL RUNS</div><div class="kpi-value" style="color:#a78bfa">' + total + '</div><div class="kpi-sub">across ' + dates.size + ' day' + (dates.size === 1 ? '' : 's') + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">PERFECT RUNS</div><div class="kpi-value" style="color:#22c55e">' + perfect + '</div><div class="kpi-sub">' + (total ? Math.round(perfect / total * 100) : 0) + '% of all runs</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">AVG PASS RATE</div><div class="kpi-value" style="color:' + colorFor(avgPass) + '">' + avgPass + '%</div><div class="kpi-sub">across all runs</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">LATEST RESULT</div><div class="kpi-value" style="color:' + colorFor(latestPr) + '">' + latestPr + '%</div><div class="kpi-sub">' + (latest ? latest.passed + '/' + latest.totalSuites + ' passed' : '—') + '</div></div>';
}

// ── Run History tab ──────────────────────────────────────────────────────
function renderHistory() {
  renderKpiStats('historyKpis');
  var byDate = {};
  SUMMARIES.forEach(function(r) {
    (byDate[r.runDate] = byDate[r.runDate] || []).push(r);
  });
  var dates = Object.keys(byDate).sort().reverse();
  var html = '';
  dates.forEach(function(d) {
    var niceDate = new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    var items = byDate[d].sort(function(a, b) { return new Date(b.runTimestamp).getTime() - new Date(a.runTimestamp).getTime(); });
    html += '<div style="margin-bottom:32px"><h3 style="font-size:15px;color:#e5e7eb;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #252540;font-weight:600">' + niceDate + '</h3>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">';
    items.forEach(function(r, i) {
      var pr = r.totalSuites ? Math.round(r.passed / r.totalSuites * 100) : 0;
      var color = pr >= 95 ? '#22c55e' : pr >= 80 ? '#eab308' : '#ef4444';
      var timeStr = new Date(r.runTimestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      var shortId = (r.runId || r.runTimestamp).replace(/[^a-z0-9]/gi, '').substring(0, 8);
      var globalIdx = SUMMARIES.indexOf(r);
      html += '<div onclick="event.stopPropagation();openModal(' + globalIdx + ')" style="background:#1a1a2e;border:1px solid #252540;border-radius:10px;padding:16px;cursor:pointer" onmouseover="this.style.borderColor=\\'#6c47ff\\'" onmouseout="this.style.borderColor=\\'#252540\\'">';
      html += '<div style="font-size:16px;font-weight:600;margin-bottom:4px">' + timeStr + '</div>';
      html += '<div style="font-size:12px;color:#6b7280;margin-bottom:10px">Run ' + shortId + '</div>';
      html += '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">';
      html += '<span style="background:rgba(34,197,94,0.15);color:#22c55e;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:600">' + r.passed + ' passed</span>';
      if (r.failed > 0) html += '<span style="background:rgba(239,68,68,0.15);color:#ef4444;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:600">' + r.failed + ' failed</span>';
      html += '<span style="color:' + color + ';font-weight:600;margin-left:auto">' + pr + '%</span>';
      html += '</div></div>';
    });
    html += '</div></div>';
  });
  document.getElementById('historyList').innerHTML = html;
}

// ── Calendar View tab ────────────────────────────────────────────────────
var calOffset = 0;
function calMonth(delta) { calOffset += delta; renderCalendar(); }
function renderCalendar() {
  renderKpiStats('calendarKpis');
  var now = new Date();
  now.setMonth(now.getMonth() + calOffset);
  var year = now.getFullYear(), month = now.getMonth();
  var first = new Date(year, month, 1), last = new Date(year, month + 1, 0);
  var byDate = {};
  SUMMARIES.forEach(function(r) {
    if (!byDate[r.runDate]) byDate[r.runDate] = { runs: 0, sumPass: 0 };
    var pr = r.totalSuites ? r.passed / r.totalSuites * 100 : 0;
    byDate[r.runDate].runs++;
    byDate[r.runDate].sumPass += pr;
  });
  document.getElementById('calMonthLabel').textContent = first.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:8px">';
  days.forEach(function(d) { html += '<div style="text-align:center;color:#6b7280;font-size:12px;font-weight:600;padding:8px 0">' + d + '</div>'; });
  html += '</div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px">';
  for (var i = 0; i < first.getDay(); i++) html += '<div></div>';
  for (var d = 1; d <= last.getDate(); d++) {
    var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var data = byDate[dateStr];
    var border = '#252540';
    var body = '';
    if (data) {
      var avg = Math.round(data.sumPass / data.runs);
      var col = avg >= 95 ? '#22c55e' : avg >= 80 ? '#eab308' : '#ef4444';
      border = col + '66';
      body = '<div style="margin-top:8px"><div style="font-size:11px;color:#9ca3af">' + data.runs + ' run' + (data.runs === 1 ? '' : 's') + '</div><div style="font-size:13px;font-weight:600;color:' + col + '">' + avg + '% pass</div></div>';
    }
    html += '<div style="min-height:90px;background:#14142a;border:1px solid ' + border + ';border-radius:8px;padding:10px"><div style="font-size:18px;font-weight:600">' + d + '</div>' + body + '</div>';
  }
  html += '</div>';
  document.getElementById('calendarBody').innerHTML = html;
}

// ── Run detail modal ─────────────────────────────────────────────────────
var modalRunIdx = 0;
function openModal(idx) {
  modalRunIdx = idx;
  var r = SUMMARIES[idx];
  var pr = r.totalSuites ? Math.round(r.passed / r.totalSuites * 100) : 0;
  var color = pr >= 95 ? '#22c55e' : pr >= 80 ? '#eab308' : '#ef4444';
  var ts = new Date(r.runTimestamp);
  document.getElementById('modalTitle').textContent = 'Test Run — ' + ts.toLocaleDateString('en-GB') + ', ' + ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  document.getElementById('modalKpis').innerHTML =
    '<div style="background:#14142a;border:1px solid #252540;border-radius:10px;padding:16px"><div style="font-size:11px;color:#888;letter-spacing:1px">TOTAL</div><div style="font-size:32px;font-weight:700">' + r.totalSuites + '</div></div>' +
    '<div style="background:#14142a;border:1px solid #252540;border-radius:10px;padding:16px"><div style="font-size:11px;color:#888;letter-spacing:1px">PASSED</div><div style="font-size:32px;font-weight:700;color:#22c55e">' + r.passed + '</div></div>' +
    '<div style="background:#14142a;border:1px solid #252540;border-radius:10px;padding:16px"><div style="font-size:11px;color:#888;letter-spacing:1px">FAILED</div><div style="font-size:32px;font-weight:700;color:#ef4444">' + r.failed + '</div></div>' +
    '<div style="background:#14142a;border:1px solid #252540;border-radius:10px;padding:16px"><div style="font-size:11px;color:#888;letter-spacing:1px">PASS RATE</div><div style="font-size:32px;font-weight:700;color:' + color + '">' + pr + '%</div></div>';
  var byCat = {};
  r.suites.forEach(function(s) { (byCat[s.category] = byCat[s.category] || []).push(s); });
  var sHtml = '';
  Object.keys(byCat).forEach(function(cat) {
    var list = byCat[cat];
    var pass = list.filter(function(s) { return s.status === 'pass'; }).length;
    var failCount = list.length - pass;
    var headerColor = failCount === 0 ? '#22c55e' : '#ef4444';
    // Collapsible category section
    sHtml += '<details open style="background:#14142a;border:1px solid #252540;border-radius:10px;margin-bottom:8px">';
    sHtml += '<summary style="padding:14px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;list-style:none">';
    sHtml += '<div style="font-weight:600">' + cat + '</div>';
    sHtml += '<div style="display:flex;gap:8px;align-items:center">';
    sHtml += '<span style="background:rgba(34,197,94,0.15);color:#22c55e;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">' + pass + ' pass</span>';
    if (failCount > 0) sHtml += '<span style="background:rgba(239,68,68,0.15);color:#ef4444;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">' + failCount + ' fail</span>';
    sHtml += '<span style="color:' + headerColor + ';font-weight:700;font-size:14px">' + pass + '/' + list.length + '</span>';
    sHtml += '</div></summary>';
    // Individual suite rows
    sHtml += '<div style="padding:0 16px 12px 16px">';
    list.forEach(function(suite) {
      var statusBadge = suite.status === 'pass'
        ? '<span style="background:rgba(34,197,94,0.15);color:#22c55e;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.5px">PASS</span>'
        : '<span style="background:rgba(239,68,68,0.15);color:#ef4444;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.5px">FAIL</span>';
      var durStr = suite.duration_s < 60 ? suite.duration_s + 's' : Math.floor(suite.duration_s / 60) + 'm ' + (suite.duration_s % 60) + 's';
      var rowBg = suite.status === 'fail' ? 'rgba(239,68,68,0.05)' : 'transparent';
      sHtml += '<div style="padding:8px 10px;border-top:1px solid rgba(255,255,255,0.04);background:' + rowBg + ';display:flex;justify-content:space-between;align-items:center;gap:10px">';
      sHtml += '<div style="flex:1;min-width:0">';
      sHtml += '<div style="font-size:13px;color:#e5e7eb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(suite.name) + '</div>';
      if (suite.status === 'fail' && suite.failure_reason) {
        sHtml += '<div style="font-size:11px;color:#f87171;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(suite.failure_reason) + '</div>';
      }
      sHtml += '</div>';
      sHtml += '<div style="display:flex;gap:8px;align-items:center;flex-shrink:0">';
      sHtml += '<span style="color:#6b7280;font-size:11px;font-family:monospace">' + durStr + '</span>';
      sHtml += statusBadge;
      sHtml += '</div></div>';
    });
    sHtml += '</div></details>';
  });
  document.getElementById('modalSuites').innerHTML = sHtml;
  var modal = document.getElementById('runModal');
  // Save scroll position and lock body scroll
  document.body.dataset.savedScroll = window.scrollY;
  document.body.style.overflow = 'hidden';
  modal.style.display = 'flex';
  // Reset modal scroll to top so user sees KPIs first
  var modalBody = modal.firstElementChild;
  if (modalBody) modalBody.scrollTop = 0;
}
function closeModal() {
  document.getElementById('runModal').style.display = 'none';
  document.body.style.overflow = '';
  var saved = parseInt(document.body.dataset.savedScroll || '0', 10);
  window.scrollTo(0, saved);
}

// ── Insights tab (new aggregated analytics) ──────────────────────────────
function renderInsights() {
  // 1. KPI cards specific to insights
  var totalSuiteRuns = 0, totalSuiteFails = 0;
  var suiteStats = {}; // name -> { runs, fails, totalDur }
  var reasons = {}; // reason -> count
  SUMMARIES.forEach(function(r) {
    r.suites.forEach(function(s) {
      totalSuiteRuns++;
      if (!suiteStats[s.name]) suiteStats[s.name] = { runs: 0, fails: 0, totalDur: 0, category: s.category };
      suiteStats[s.name].runs++;
      suiteStats[s.name].totalDur += s.duration_s;
      if (s.status === 'fail') {
        suiteStats[s.name].fails++;
        totalSuiteFails++;
        var rsn = (s.failure_reason || 'Unknown').substring(0, 80);
        reasons[rsn] = (reasons[rsn] || 0) + 1;
      }
    });
  });

  var flakyCount = 0;
  Object.keys(suiteStats).forEach(function(n) {
    var st = suiteStats[n];
    if (st.fails > 0 && st.fails < st.runs) flakyCount++;
  });

  var stableCount = Object.keys(suiteStats).filter(function(n) { return suiteStats[n].fails === 0; }).length;
  var brokenCount = Object.keys(suiteStats).filter(function(n) { return suiteStats[n].fails === suiteStats[n].runs && suiteStats[n].runs > 1; }).length;

  document.getElementById('insightsKpis').innerHTML =
    kpiCard('purple', Object.keys(suiteStats).length, 'Unique Suites') +
    kpiCard('green', stableCount, 'Always Pass') +
    kpiCard('yellow', flakyCount, 'Flaky (intermittent)') +
    kpiCard('red', brokenCount, 'Always Fail') +
    kpiCard('blue', totalSuiteRuns, 'Suite Executions') +
    kpiCard('purple', SUMMARIES.length, 'Total Runs');

  // 2. Flaky suites list
  var flaky = Object.keys(suiteStats)
    .filter(function(n) { return suiteStats[n].fails > 0 && suiteStats[n].fails < suiteStats[n].runs; })
    .map(function(n) { return { name: n, ...suiteStats[n], failRate: suiteStats[n].fails / suiteStats[n].runs }; })
    .sort(function(a, b) { return b.failRate - a.failRate; })
    .slice(0, 15);
  document.getElementById('flakySuites').innerHTML = flaky.length === 0
    ? '<div style="color:#22c55e;padding:16px;text-align:center">No flaky suites detected — all suites are consistent.</div>'
    : flaky.map(function(f) {
        var pct = Math.round(f.failRate * 100);
        return '<div style="background:#14142a;border:1px solid #252540;border-radius:8px;padding:12px 16px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">' +
          '<div><div style="font-weight:600;font-size:14px">' + f.name + '</div><div style="font-size:12px;color:#6b7280;margin-top:2px">' + f.category + '</div></div>' +
          '<div style="text-align:right"><div style="color:#eab308;font-weight:700;font-size:16px">' + pct + '% fail</div><div style="font-size:12px;color:#6b7280">' + f.fails + '/' + f.runs + ' runs</div></div>' +
          '</div>';
      }).join('');

  // 3. Top failure reasons (clickable — expands to show affected runs/suites)
  // Build reason -> list of { runIdx, suiteName }
  var reasonDetails = {};
  SUMMARIES.forEach(function(r, idx) {
    r.suites.forEach(function(s) {
      if (s.status === 'fail') {
        var rsn = (s.failure_reason || 'Unknown').substring(0, 80);
        if (!reasonDetails[rsn]) reasonDetails[rsn] = [];
        reasonDetails[rsn].push({ runIdx: idx, suiteName: s.name, runTs: r.runTimestamp });
      }
    });
  });
  var reasonList = Object.keys(reasonDetails).map(function(r) { return { reason: r, count: reasonDetails[r].length, occurrences: reasonDetails[r] }; })
    .sort(function(a, b) { return b.count - a.count; }).slice(0, 10);
  document.getElementById('topFailures').innerHTML = reasonList.length === 0
    ? '<div style="color:#22c55e;padding:16px;text-align:center">No failure reasons recorded — all recent runs passed.</div>'
    : reasonList.map(function(r, idx) {
        var occList = r.occurrences.slice(0, 20).map(function(o) {
          return '<li style="padding:6px 0;border-bottom:1px solid #252540;font-size:12px;cursor:pointer" onclick="openModal(' + o.runIdx + ')">' +
            '<span style="color:#a78bfa">' + o.suiteName + '</span> <span style="color:#6b7280">@ ' + o.runTs + '</span>' +
            '</li>';
        }).join('');
        return '<details style="background:#14142a;border:1px solid #252540;border-radius:8px;padding:10px 16px;margin-bottom:6px">' +
          '<summary style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;list-style:none">' +
          '<div style="font-size:13px;color:#e5e7eb;flex:1">' + r.reason + '</div>' +
          '<div style="color:#ef4444;font-weight:700;min-width:40px;text-align:right">' + r.count + '</div>' +
          '</summary>' +
          '<ul style="margin-top:10px;padding-left:0;list-style:none">' + occList + '</ul>' +
          '</details>';
      }).join('');

  // 4. Coverage heatmap for today (24 hours, local time)
  // Use local date (matches what daily script writes) NOT UTC
  var nowDate = new Date();
  var todayStr = nowDate.getFullYear() + '-' + String(nowDate.getMonth() + 1).padStart(2, '0') + '-' + String(nowDate.getDate()).padStart(2, '0');
  var runsByHour = new Array(24).fill(0);
  var runTimesByHour = {}; // hour -> timestamps list
  SUMMARIES.forEach(function(r) {
    if (r.runDate !== todayStr) return;
    // Parse HH from "YYYY-MM-DD HH:MM:SS"
    var parts = (r.runTimestamp || '').split(' ');
    if (parts.length < 2) return;
    var h = parseInt(parts[1].split(':')[0], 10);
    if (h >= 0 && h < 24) {
      runsByHour[h]++;
      (runTimesByHour[h] = runTimesByHour[h] || []).push(r.runTimestamp);
    }
  });
  var hmap = '<div style="display:grid;grid-template-columns:repeat(24,1fr);gap:4px">';
  for (var h = 0; h < 24; h++) {
    var c = runsByHour[h];
    var bg = c === 0 ? '#1f1f36' : c >= 2 ? '#16a34a' : '#22c55e';
    var hourLabel = String(h).padStart(2, '0') + ':30';
    var tooltip = c === 0
      ? hourLabel + ' — no run (missed slot)'
      : hourLabel + ' — ' + c + ' run(s): ' + (runTimesByHour[h] || []).join(', ');
    hmap += '<div title="' + tooltip + '" style="background:' + bg + ';height:44px;border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:9px;color:' + (c === 0 ? '#555' : '#fff') + ';font-weight:600">' +
      '<div style="font-size:10px;opacity:0.7">' + String(h).padStart(2, '0') + 'h</div>' +
      (c > 0 ? '<div style="font-size:11px;margin-top:1px">' + c + '</div>' : '') +
      '</div>';
  }
  hmap += '</div>';
  var totalToday = runsByHour.reduce(function(a, b) { return a + b; }, 0);
  hmap += '<div style="margin-top:10px;font-size:13px;color:#e5e7eb"><strong>' + totalToday + '</strong> / 8 scheduled slots executed today (' + todayStr + ')</div>';
  hmap += '<div style="margin-top:4px;font-size:11px;color:#6b7280">Each column is one scheduled hour (00h–23h, local time). Hover for exact run timestamps. Column label = hour of day, not date.</div>';
  document.getElementById('coverageMap').innerHTML = hmap;

  // 5. Slowest suites
  var slowest = Object.keys(suiteStats)
    .map(function(n) { return { name: n, avgDur: suiteStats[n].totalDur / suiteStats[n].runs, runs: suiteStats[n].runs }; })
    .sort(function(a, b) { return b.avgDur - a.avgDur; })
    .slice(0, 10);
  var maxDur = slowest.length > 0 ? slowest[0].avgDur : 1;
  document.getElementById('slowestSuites').innerHTML = slowest.map(function(s) {
    var pct = Math.round(s.avgDur / maxDur * 100);
    return '<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span>' + s.name + '</span><span style="color:#a78bfa;font-weight:600">' + fmtDur(Math.round(s.avgDur)) + '</span></div>' +
      '<div style="background:#14142a;height:8px;border-radius:4px;overflow:hidden"><div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,#6c47ff,#a78bfa)"></div></div></div>';
  }).join('');
}
function exportRun() {
  var r = SUMMARIES[modalRunIdx];
  var blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'playground-run-' + (r.runId || r.runDate) + '.json';
  a.click();
}
</script>
</body>
</html>`;
}

// ── Main ────────────────────────────────────────────────────────────────────

function buildRunsJson(summaries: DailySummary[]): any[] {
  // Newest first — loadAllSummaries() already sorts files reverse, but enforce here too
  const sorted = [...summaries].sort((a, b) =>
    (b.runTimestamp || b.runDate).localeCompare(a.runTimestamp || a.runDate)
  );
  return sorted.map((s) => {
    const total = s.totalSuites;
    const rate = total === 0 ? 0 : Math.round((s.passed / total) * 1000) / 10; // 1 decimal
    return {
      runId: (s as any).runId || '',
      runDate: s.runDate,
      runTimestamp: s.runTimestamp,
      total,
      passed: s.passed,
      failed: s.failed,
      passRate: rate,
      suites: s.suites,
    };
  });
}

function main() {
  const summaries = loadAllSummaries();
  const allLogs = loadAllLogs();
  const html = generateHTML(summaries, allLogs);

  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_HTML, html, 'utf-8');
  console.log(`Playground report generated: ${OUTPUT_HTML}`);
  console.log(`   ${summaries.length} historical run(s) included`);
  const logCount = Array.from(allLogs.values()).reduce((a, m) => a + m.size, 0);
  console.log(`   ${logCount} suite log section(s) embedded`);

  const runs = buildRunsJson(summaries);
  fs.writeFileSync(OUTPUT_RUNS_JSON, JSON.stringify(runs, null, 2), 'utf-8');
  console.log(`Playground runs JSON written: ${OUTPUT_RUNS_JSON}`);
  console.log(`   ${runs.length} run(s) listed`);
}

main();
