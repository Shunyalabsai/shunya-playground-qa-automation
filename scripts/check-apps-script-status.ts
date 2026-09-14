/**
 * Smart Failover & Deduplication Checker
 *
 * Checks whether Google Apps Script / Cloud Actions has already triggered or executed
 * the test run for today's scheduled slot (Morning 4:00 AM or Evening 5:00 PM).
 *
 * Exits with:
 * - Code 0: Cloud run already completed or active -> Local LaunchAgent should SKIP.
 * - Code 1: No recent cloud run found -> Local LaunchAgent should RUN as fallback.
 */

import { google } from 'googleapis';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

const SPREADSHEET_ID = '11leUutfqP4OXyIIaeTYqw_3gWc1w5fQLnQWuUHXPgW4';
const KEY_FILE = path.resolve(__dirname, '../Google_service_account.json');

function getCurrentSlot(): { slotName: string; isMorning: boolean; todayStr: string } {
  const now = new Date();
  const hours = now.getHours();
  const isMorning = hours < 12;
  const slotName = isMorning ? 'Morning Run (4:30 AM)' : 'Evening Run (5:30 PM)';

  // Format YYYY-MM-DD
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;

  return { slotName, isMorning, todayStr };
}

async function checkGoogleSheet(): Promise<boolean> {
  if (!fs.existsSync(KEY_FILE)) {
    return false;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: KEY_FILE,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const { todayStr, isMorning } = getCurrentSlot();

    // 1. Check 'Execution History' tab for recent run completed within the last 45 minutes
    const historyRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Execution History!A2:D10',
    }).catch(() => null);

    if (historyRes && historyRes.data.values && historyRes.data.values.length > 0) {
      const nowMs = Date.now();
      for (const row of historyRes.data.values) {
        const timestampStr = String(row[0] || '');
        const slot = String(row[1] || '');
        const status = String(row[2] || row[3] || '');

        if (timestampStr) {
          const parsedTime = new Date(timestampStr).getTime();
          const ageMinutes = (nowMs - parsedTime) / (1000 * 60);

          // Only consider runs completed in the last 45 minutes
          if (!isNaN(parsedTime) && ageMinutes >= 0 && ageMinutes <= 45) {
            const isCompleted = status.includes('PASS') || status.includes('SUCCESS') || status.includes('COMPLETED');
            if (isCompleted) {
              console.log(`[Smart Failover] Found recent cloud test run in Execution History (${ageMinutes.toFixed(1)} mins ago): ${timestampStr} (${slot}) - Status: ${status}`);
              return true;
            }
          }
        }
      }
    }
  } catch (err: any) {
    console.warn(`[Smart Failover] Sheet check encountered error: ${err.message}`);
  }

  return false;
}

function checkGitRemote(): boolean {
  try {
    const projectDir = path.resolve(__dirname, '..');
    // Fetch latest remote info quietly
    execSync('git fetch origin main --quiet', { cwd: projectDir, timeout: 15000 });

    // Strictly check for automated commits made by github-actions in the last 45 minutes
    const automatedCommits = execSync(
      'git log -1 --since="45 minutes ago" --author="github-actions" --pretty=format:"%h %an %ad %s" origin/main',
      { cwd: projectDir, encoding: 'utf8', timeout: 5000 }
    ).trim();

    if (automatedCommits) {
      console.log(`[Smart Failover] Recent GitHub Actions automated commit found: ${automatedCommits}`);
      return true;
    }
  } catch (err: any) {
    console.warn(`[Smart Failover] Git remote check error: ${err.message}`);
  }

  return false;
}

async function main() {
  const { slotName, todayStr } = getCurrentSlot();
  console.log(`[Smart Failover] Checking status for ${slotName} on ${todayStr}...`);

  const sheetTriggered = await checkGoogleSheet();
  if (sheetTriggered) {
    console.log(`✅ [Smart Failover] Apps Script / Cloud run already triggered or completed for ${slotName}. SKIPPING local LaunchAgent.`);
    process.exit(0); // 0 = skip
  }

  const gitTriggered = checkGitRemote();
  if (gitTriggered) {
    console.log(`✅ [Smart Failover] Cloud test execution detected on GitHub within the last hour. SKIPPING local LaunchAgent.`);
    process.exit(0); // 0 = skip
  }

  console.log(`⚠️ [Smart Failover] No active cloud run detected for ${slotName}. LaunchAgent is taking over as fallback runner!`);
  process.exit(1); // 1 = need fallback run
}

main().catch(() => process.exit(1));
