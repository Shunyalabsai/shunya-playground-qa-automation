/**
 * ============================================================================
 * Playground QA Automation — Master Google Apps Script (Code.gs)
 * ============================================================================
 * Handles:
 * 1. Scheduled Daily Test Runs (Morning 04:30 AM & Evening 05:30 PM IST)
 * 2. GitHub Actions Dispatch Trigger
 * 3. Execution History Recording in Google Sheet
 * 4. Custom Playground QA Spreadsheet Menu
 */

// ── Configuration ────────────────────────────────────────────────────────────
var GITHUB_CONFIG = {
  owner: 'Shunyalabsai',
  repo: 'shunya-playground-qa-automation',
  workflowId: 'playground-qc-daily.yml', // GitHub Actions workflow file name
  branch: 'main',
  // Store GitHub PAT in Script Properties (File -> Project Settings -> Script Properties -> GITHUB_TOKEN)
};

// ── Spreadsheet Custom Menu ──────────────────────────────────────────────────
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🚀 Playground QA')
    .addItem('▶ Run 15-Min Health Check Now', 'run15MinuteApiHealthCheck')
    .addSeparator()
    .addItem('▶ Trigger Morning Test Run (04:30 AM)', 'triggerMorningRun')
    .addItem('▶ Trigger Evening Test Run (05:30 PM)', 'triggerEveningRun')
    .addSeparator()
    .addItem('📊 Open Executive Dashboard', 'openDashboard')
    .addToUi();
}

function openDashboard() {
  var html = HtmlService.createHtmlOutput(
    '<script>window.open("https://shunyalabsai.github.io/shunya-playground-qa-automation/", "_blank");google.script.host.close();</script>'
  ).setWidth(300).setHeight(100);
  SpreadsheetApp.getUi().showModalDialog(html, 'Opening Dashboard...');
}

// ── Scheduled Trigger Handlers ───────────────────────────────────────────────

/**
 * Morning Scheduled Trigger (04:30 AM IST)
 */
function triggerMorningRun() {
  runScheduledSlot('Morning Run (4:30 AM)');
}

/**
 * Evening Scheduled Trigger (05:30 PM IST)
 */
function triggerEveningRun() {
  runScheduledSlot('Evening Run (5:30 PM)');
}

function runScheduledSlot(slotName) {
  var timestamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
  Logger.log('[' + timestamp + '] 🚀 Triggering ' + slotName + '...');

  var triggered = dispatchGitHubWorkflow(slotName);
  var status = triggered ? 'TRIGGERED (Cloud GitHub Actions)' : 'QUEUED (Fallback to local LaunchAgent)';

  recordExecutionHistory(timestamp, slotName, status);
}

// ── GitHub Actions Trigger ───────────────────────────────────────────────────
function dispatchGitHubWorkflow(slotName) {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    Logger.log('ℹ️ No GITHUB_TOKEN set in Script Properties. Local LaunchAgent will handle execution.');
    return false;
  }

  var url = 'https://api.github.com/repos/' + GITHUB_CONFIG.owner + '/' + GITHUB_CONFIG.repo + '/actions/workflows/' + GITHUB_CONFIG.workflowId + '/dispatches';

  var payload = JSON.stringify({
    ref: GITHUB_CONFIG.branch,
    inputs: {
      slot: slotName,
      triggeredBy: 'Google Apps Script'
    }
  });

  try {
    var response = UrlFetchApp.fetch(url, {
      method: 'POST',
      muteHttpExceptions: true,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Playground-AppsScript-Runner/1.0',
        'Content-Type': 'application/json'
      },
      payload: payload
    });

    var code = response.getResponseCode();
    if (code === 204 || code === 200) {
      Logger.log('✅ Successfully dispatched GitHub Actions workflow for ' + slotName);
      return true;
    } else {
      Logger.log('⚠️ GitHub dispatch returned status ' + code + ': ' + response.getContentText());
      return false;
    }
  } catch (err) {
    Logger.log('❌ Error dispatching GitHub Actions: ' + err.toString());
    return false;
  }
}

// ── Execution History Sheet Logger ───────────────────────────────────────────
function recordExecutionHistory(timestamp, slotName, status) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Execution History');

    if (!sheet) {
      sheet = ss.insertSheet('Execution History');
      sheet.appendRow(['Timestamp (IST)', 'Scheduled Slot', 'Status', 'Trigger Source']);
      sheet.getRange('A1:D1').setBackground('#1e293b').setFontColor('#ffffff').setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([timestamp, slotName, status, 'Google Apps Script']);
    Logger.log('📝 Recorded to Execution History: ' + timestamp + ' | ' + slotName + ' | ' + status);
  } catch (e) {
    Logger.log('⚠️ Could not write to Execution History sheet: ' + e.toString());
  }
}
