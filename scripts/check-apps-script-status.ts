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
  const slotName = isMorning ? 'Morning Run (4:00 AM)' : 'Evening Run (5:00 PM)';

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

    // 1. Check 'Execution History' tab
    const historyRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Execution History!A2:D10',
    }).catch(() => null);

    if (historyRes && historyRes.data.values && historyRes.data.values.length > 0) {
      for (const row of historyRes.data.values) {
        const timestamp = String(row[0] || '');
        const slot = String(row[1] || '');
        const status = String(row[2] || row[3] || '');

        if (timestamp.includes(todayStr)) {
          const rowHour = parseInt(timestamp.split(' ')[1]?.split(':')[0] || '-1', 10);
          if (rowHour >= 0) {
            const rowIsMorning = rowHour < 12;
            if (rowIsMorning === isMorning && (status.includes('TRIGGERED') || status.includes('PASS') || status.includes('SUCCESS'))) {
              console.log(`[Smart Failover] Found matching Apps Script trigger in Execution History: ${timestamp} (${slot}) - Status: ${status}`);
              return true;
            }
          }
        }
      }
    }

    // 2. Check 'Playground-Execution-Results' tab (Run Summary / Date)
    const resultsRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Playground-Execution-Results!A2:D5',
    }).catch(() => null);

    if (resultsRes && resultsRes.data.values && resultsRes.data.values.length > 0) {
      for (const row of resultsRes.data.values) {
        const rowText = row.join(' ');
        if (rowText.includes(todayStr)) {
          console.log(`[Smart Failover] Found matching completed test run in Playground-Execution-Results for today: ${todayStr}`);
          return true;
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

    const latestCommitDateStr = execSync('git log -1 --format=%cI origin/main', { cwd: projectDir, timeout: 5000 })
      .toString()
      .trim();

    if (latestCommitDateStr) {
      const commitDate = new Date(latestCommitDateStr);
      const now = new Date();
      const diffMinutes = (now.getTime() - commitDate.getTime()) / (1000 * 60);

      // If a cloud run was pushed to origin/main in the last 60 minutes
      if (diffMinutes >= 0 && diffMinutes <= 60) {
        console.log(`[Smart Failover] Remote origin/main has a recent update from ${diffMinutes.toFixed(1)} minutes ago.`);
        return true;
      }
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
