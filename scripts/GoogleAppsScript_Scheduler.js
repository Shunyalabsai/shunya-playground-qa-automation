/**
 * ============================================================================
 * GOOGLE APPS SCRIPT (GAS) QA AUTOMATION & SCHEDULER ENGINE
 * ============================================================================
 *
 * Configured Sheets:
 * - Master Input Sheet ID:  1KWWMQN3ppFfux1mP8Wb34UmtrIEXhz2T6_1_goXI8JI
 * - Output Sheet ID:        11leUutfqP4OXyIIaeTYqw_3gWc1w5fQLnQWuUHXPgW4
 * - Results Tab:            Playground-Execution-Results
 *
 * Remote Dashboards Updated:
 * 1. https://yamini-pal-singh.github.io/playground-testing/
 * 2. https://shunyalabsai.github.io/shunya-playground-qa-automation/
 *
 * Capabilities:
 * - Time-Driven Triggers: Executes daily at 4:00 AM and 5:00 PM IST automatically.
 * - Dual Cloud Dispatch: Triggers both GitHub repositories via repository_dispatch.
 * - Dashboard & Sheet Management: Logs execution status in Output Google Sheet.
 * ============================================================================
 */

var CONFIG = {
  TIMEZONE: 'Asia/Kolkata',

  SHEETS: {
    INPUT_SPREADSHEET_ID: '1KWWMQN3ppFfux1mP8Wb34UmtrIEXhz2T6_1_goXI8JI',
    OUTPUT_SPREADSHEET_ID: '11leUutfqP4OXyIIaeTYqw_3gWc1w5fQLnQWuUHXPgW4',
    RESULTS_TAB: 'Playground-Execution-Results',
    HISTORY_TAB: 'Execution History'
  },

  // Both Remote Repositories are triggered & updated
  REPOSITORIES: [
    {
      OWNER: 'yamini-pal-singh',
      REPO: 'playground-testing',
      NAME: 'Yamini Playground Testing',
      DASHBOARD_URL: 'https://yamini-pal-singh.github.io/playground-testing/'
    },
    {
      OWNER: 'Shunyalabsai',
      REPO: 'shunya-playground-qa-automation',
      NAME: 'Shunya Labs QA Automation',
      DASHBOARD_URL: 'https://shunyalabsai.github.io/shunya-playground-qa-automation/'
    }
  ],

  EVENT_TYPE: 'scheduled_daily_run',

  getGithubToken: function() {
    return PropertiesService.getScriptProperties().getProperty('GITHUB_PAT') || '';
  }
};

/**
 * Run this function ONCE in Apps Script editor to install 4:00 AM & 5:00 PM IST triggers.
 */
function setupDailyTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var handler = triggers[i].getHandlerFunction();
    if (handler === 'executeScheduledRun' || handler === 'morningRunJob' || handler === 'eveningRunJob') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // 1. Morning Run: 4:00 AM IST
  ScriptApp.newTrigger('executeScheduledRun')
    .timeBased()
    .atHour(4)
    .nearMinute(0)
    .everyDays(1)
    .inTimezone(CONFIG.TIMEZONE)
    .create();

  // 2. Evening Run: 5:00 PM IST
  ScriptApp.newTrigger('executeScheduledRun')
    .timeBased()
    .atHour(17)
    .nearMinute(0)
    .everyDays(1)
    .inTimezone(CONFIG.TIMEZONE)
    .create();

  Logger.log('✅ Daily triggers installed successfully for 4:00 AM and 5:00 PM (' + CONFIG.TIMEZONE + ')');
}

/**
 * Main execution function called by 4:00 AM & 5:00 PM triggers.
 * Dispatches to both GitHub repositories.
 */
function executeScheduledRun() {
  var now = new Date();
  var timestampStr = Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  var slot = (now.getHours() < 12) ? 'Morning Run (4:00 AM IST)' : 'Evening Run (5:00 PM IST)';

  Logger.log('🚀 Triggering Scheduled QA Runs for slot: ' + slot + ' at ' + timestampStr);

  var results = [];
  for (var i = 0; i < CONFIG.REPOSITORIES.length; i++) {
    var repo = CONFIG.REPOSITORIES[i];
    var triggered = triggerGitHubWorkflow(repo, CONFIG.EVENT_TYPE, {
      trigger_slot: slot,
      triggered_at: timestampStr,
      input_sheet: CONFIG.SHEETS.INPUT_SPREADSHEET_ID,
      output_sheet: CONFIG.SHEETS.OUTPUT_SPREADSHEET_ID,
      source: 'Google Apps Script Scheduler'
    });
    results.push({ repo: repo, status: triggered ? 'TRIGGERED' : 'FAILED_TO_DISPATCH' });
  }

  logExecutionHistory(timestampStr, slot, results);
}

/**
 * Sends repository_dispatch POST request to GitHub API.
 */
function triggerGitHubWorkflow(repo, eventType, clientPayload) {
  var token = CONFIG.getGithubToken();
  if (!token) {
    Logger.log('⚠️ GITHUB_PAT not found in Script Properties.');
    return false;
  }

  var url = 'https://api.github.com/repos/' + repo.OWNER + '/' + repo.REPO + '/dispatches';
  var payload = {
    event_type: eventType,
    client_payload: clientPayload || {}
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Google-Apps-Script-QA-Scheduler'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    if (code === 204 || code === 200 || code === 201) {
      Logger.log('✅ [' + repo.NAME + '] GitHub Action workflow triggered successfully');
      return true;
    } else {
      Logger.log('❌ [' + repo.NAME + '] Trigger failed: HTTP ' + code + ' ' + response.getContentText());
      return false;
    }
  } catch (err) {
    Logger.log('❌ [' + repo.NAME + '] Exception: ' + err.toString());
    return false;
  }
}

/**
 * Records the triggered slot in the Execution History tab of Output Sheet.
 */
function logExecutionHistory(timestamp, slot, dispatchResults) {
  var ss;
  try {
    ss = SpreadsheetApp.openById(CONFIG.SHEETS.OUTPUT_SPREADSHEET_ID);
  } catch (e) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  if (!ss) return;

  var sheet = ss.getSheetByName(CONFIG.SHEETS.HISTORY_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.HISTORY_TAB);
  }

  if (sheet.getLastRow() === 0) {
    var headers = ['Timestamp (IST)', 'Scheduled Slot', 'Repository 1 Status', 'Repository 2 Status', 'Dashboard Links', 'Input Sheet ID', 'Output Sheet ID'];
    sheet.appendRow(headers);
    sheet.getRange('A1:G1').setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff').setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }

  var r1 = dispatchResults[0] ? dispatchResults[0].status : 'N/A';
  var r2 = dispatchResults[1] ? dispatchResults[1].status : 'N/A';
  var dashboards = '1. ' + CONFIG.REPOSITORIES[0].DASHBOARD_URL + '\n2. ' + CONFIG.REPOSITORIES[1].DASHBOARD_URL;

  sheet.insertRowBefore(2);
  var rowData = [
    timestamp,
    slot,
    r1,
    r2,
    dashboards,
    CONFIG.SHEETS.INPUT_SPREADSHEET_ID,
    CONFIG.SHEETS.OUTPUT_SPREADSHEET_ID
  ];

  var rowRange = sheet.getRange(2, 1, 1, 7);
  rowRange.setValues([rowData]);
  rowRange.setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle');

  // Format Status Badge
  var statusCell1 = sheet.getRange(2, 3);
  var statusCell2 = sheet.getRange(2, 4);
  [statusCell1, statusCell2].forEach(function(cell) {
    cell.setFontWeight('bold').setHorizontalAlignment('center');
    var val = cell.getValue();
    if (val === 'TRIGGERED' || val === 'PASSED' || val === 'SUCCESS') {
      cell.setBackground('#dcfce7').setFontColor('#15803d');
    } else {
      cell.setBackground('#fee2e2').setFontColor('#b91c1c');
    }
  });

  rowRange.setBorder(null, null, true, null, null, null, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);
  for (var col = 1; col <= 7; col++) {
    sheet.autoResizeColumn(col);
  }
}
