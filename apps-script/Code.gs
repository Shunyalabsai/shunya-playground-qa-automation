/**
 * ============================================================================
 * Playground QA Automation & 24/7 API Health Monitor (Code.gs)
 * ============================================================================
 * 1. 15-Minute API Health Check (Alerts 6 stakeholders ONLY on failure)
 * 2. Scheduled Test Runs (Morning 04:30 AM & Evening 05:30 PM IST)
 * 3. Execution History Logger
 * 4. Custom Spreadsheet Menu
 */

// ── 1. Spreadsheet Custom Menu ───────────────────────────────────────────────
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("🚀 Playground QA")
    .addItem("▶ Run 15-Min Health Check Now", "run15MinuteApiHealthCheck")
    .addSeparator()
    .addItem("▶ Trigger Morning Run (04:30 AM)", "triggerMorningRun")
    .addItem("▶ Trigger Evening Run (05:30 PM)", "triggerEveningRun")
    .addSeparator()
    .addItem("📊 Open Executive Dashboard", "openDashboard")
    .addToUi();
}

function openDashboard() {
  var script = [
    "<script>",
    "window.open('https://shunyalabsai.github.io/shunya-playground-qa-automation/', '_blank');",
    "google.script.host.close();",
    "</script>"
  ].join("");
  var html = HtmlService.createHtmlOutput(script).setWidth(300).setHeight(100);
  SpreadsheetApp.getUi().showModalDialog(html, "Opening Dashboard...");
}

// ── 2. 15-Minute API Health Check (Failure-Only Alert) ───────────────────────
function run15MinuteApiHealthCheck() {
  var alertRecipients = [
    "saheb@shunyalabs.ai",
    "arti@shunyalabs.ai",
    "ritu@shunyalabs.ai",
    "yamini@shunyalabs.ai",
    "sumit@shunyalabs.ai",
    "saira@shunyalabs.ai"
  ].join(", ");

  var services = [
    {
      name: "ASR Microservice",
      url: "https://asrv2prod.shunyalabs.ai/health",
      expectedStatus: [200, 404],
      impact: "Audio transcription and speech intelligence features are failing.",
      resolution: "Check ASR server instance health, GPU worker load, or restart the asrv2prod container."
    },
    {
      name: "TTS Microservice",
      url: "https://ttsv2.shunyalabs.ai/health",
      expectedStatus: [200, 404],
      impact: "Speech synthesis across Indic, Oriental, and Universal models is failing.",
      resolution: "Check TTS service logs, memory/GPU thresholds, and ttsv2 endpoint connectivity."
    },
    {
      name: "Playground Web App",
      url: "https://playground.shunyalabs.ai",
      expectedStatus: [200, 301, 302, 307],
      impact: "Playground web frontend is inaccessible; users and automated tests cannot log in.",
      resolution: "Check Cloudflare/DNS routing, SSL certificates, and frontend web server availability."
    }
  ];

  var failedServices = [];
  var timestamp = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");

  for (var i = 0; i < services.length; i++) {
    var s = services[i];
    var startTime = new Date().getTime();
    try {
      var response = UrlFetchApp.fetch(s.url, {
        muteHttpExceptions: true,
        followRedirects: false,
        headers: { "User-Agent": "Playground-Cloud-HealthCheck/1.0" }
      });
      var latencyMs = new Date().getTime() - startTime;
      var statusCode = response.getResponseCode();

      var isExpected = s.expectedStatus.indexOf(statusCode) !== -1 || (statusCode >= 200 && statusCode < 400);

      if (!isExpected) {
        failedServices.push({
          name: s.name,
          url: s.url,
          status: statusCode,
          latencyMs: latencyMs,
          reason: "Unexpected HTTP status code: " + statusCode,
          impact: s.impact,
          resolution: s.resolution
        });
      }
    } catch (err) {
      var errLatencyMs = new Date().getTime() - startTime;
      failedServices.push({
        name: s.name,
        url: s.url,
        status: "Unreachable / Timeout",
        latencyMs: errLatencyMs,
        reason: err.toString(),
        impact: s.impact,
        resolution: s.resolution
      });
    }
  }

  // Send email alert ONLY when one or more services fail
  if (failedServices.length > 0) {
    sendHealthFailureAlertEmail(failedServices, timestamp, alertRecipients);
  } else {
    Logger.log("[" + timestamp + "] ✅ All services healthy. No alert email sent.");
  }
}

function sendHealthFailureAlertEmail(failures, timestamp, recipients) {
  var subject = "🚨 [CRITICAL ALERT] Playground API Health Check Failed (" + failures.length + " Service" + (failures.length > 1 ? "s" : "") + " Down) — " + timestamp + " IST";

  var rowsHtml = [];
  for (var j = 0; j < failures.length; j++) {
    var f = failures[j];
    rowsHtml.push(
      "<tr style=\"border-bottom:1px solid #334155;\">",
        "<td style=\"padding:12px;font-weight:700;color:#f87171;\">#" + (j + 1) + " " + f.name + "</td>",
        "<td style=\"padding:12px;color:#cbd5e1;font-family:monospace;font-size:12px;\">" + f.url + "</td>",
        "<td style=\"padding:12px;color:#fca5a5;font-weight:600;\">" + f.status + " <span style=\"font-size:11px;color:#94a3b8;\">(" + f.latencyMs + "ms)</span></td>",
        "<td style=\"padding:12px;color:#e2e8f0;font-size:12px;\">" + f.reason + "</td>",
      "</tr>",
      "<tr style=\"background:#1e293b;border-bottom:2px solid #0f172a;\">",
        "<td colspan=\"4\" style=\"padding:10px 14px;font-size:12px;\">",
          "<div style=\"color:#fbbf24;margin-bottom:4px;\"><strong>⚠️ Impact:</strong> " + f.impact + "</div>",
          "<div style=\"color:#38bdf8;\"><strong>🛠️ Recommended Resolution:</strong> " + f.resolution + "</div>",
        "</td>",
      "</tr>"
    );
  }

  var htmlBody = [
    "<div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;padding:24px;color:#f8fafc;\">",
      "<div style=\"max-width:680px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px;border:1px solid #ef4444;\">",
        "<h2 style=\"color:#ef4444;margin-top:0;font-size:20px;\">🚨 Playground Microservice Health Failure Alert</h2>",
        "<p style=\"color:#94a3b8;font-size:13px;margin-bottom:18px;\">",
          "The automated 15-minute API health monitor detected that one or more critical Playground microservices are currently degraded, returning error status codes, or unreachable.",
        "</p>",
        "<p style=\"font-size:12px;color:#cbd5e1;margin-bottom:16px;\"><strong>Timestamp:</strong> " + timestamp + " IST</p>",
        "<table style=\"width:100%;border-collapse:collapse;margin-bottom:20px;background:#0f172a;border-radius:8px;overflow:hidden;\">",
          "<thead>",
            "<tr style=\"background:#334155;color:#94a3b8;font-size:11px;text-transform:uppercase;\">",
              "<th style=\"padding:10px 12px;text-align:left;\">Service</th>",
              "<th style=\"padding:10px 12px;text-align:left;\">Endpoint</th>",
              "<th style=\"padding:10px 12px;text-align:left;\">Status / Latency</th>",
              "<th style=\"padding:10px 12px;text-align:left;\">Error Reason</th>",
            "</tr>",
          "</thead>",
          "<tbody>",
            rowsHtml.join(""),
          "</tbody>",
        "</table>",
        "<div style=\"text-align:center;margin-top:24px;\">",
          "<a href=\"https://shunyalabsai.github.io/shunya-playground-qa-automation/\" style=\"background:#2563eb;color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:600;font-size:13px;display:inline-block;\">",
            "Open Live QC Dashboard",
          "</a>",
        "</div>",
      "</div>",
    "</div>"
  ].join("");

  MailApp.sendEmail({
    to: recipients,
    subject: subject,
    htmlBody: htmlBody
  });

  Logger.log("🚨 Failure alert email sent to: " + recipients);
}

// ── 3. Scheduled Daily Test Runs (04:30 AM & 05:30 PM IST) ───────────────────
function triggerMorningRun() {
  runScheduledSlot("Morning Run (4:30 AM)");
}

function triggerEveningRun() {
  runScheduledSlot("Evening Run (5:30 PM)");
}

function runScheduledSlot(slotName) {
  var timestamp = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");
  Logger.log("[" + timestamp + "] 🚀 Triggering " + slotName + "...");

  var triggered = dispatchGitHubWorkflow(slotName);
  var status = triggered ? "TRIGGERED (Cloud GitHub Actions)" : "QUEUED (Fallback to local LaunchAgent)";

  recordExecutionHistory(timestamp, slotName, status);
}

function dispatchGitHubWorkflow(slotName) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty("GITHUB_PAT") || props.getProperty("GITHUB_TOKEN");

  if (!token) {
    Logger.log("ℹ️ GITHUB_PAT / GITHUB_TOKEN not found in Script Properties. Local LaunchAgent will handle test execution.");
    return false;
  }

  var url = "https://api.github.com/repos/Shunyalabsai/shunya-playground-qa-automation/actions/workflows/scheduled-tests.yml/dispatches";
  var payload = JSON.stringify({
    ref: "main",
    inputs: {
      suite: "smoke"
    }
  });

  try {
    var response = UrlFetchApp.fetch(url, {
      method: "POST",
      muteHttpExceptions: true,
      headers: {
        "Authorization": "Bearer " + token.trim(),
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Playground-AppsScript-Runner/1.0",
        "Content-Type": "application/json"
      },
      payload: payload
    });

    var code = response.getResponseCode();
    if (code === 204 || code === 200) {
      Logger.log("✅ Successfully triggered Cloud GitHub Actions (" + slotName + ")");
      return true;
    } else {
      Logger.log("⚠️ GitHub API responded with status " + code + ": " + response.getContentText());
      return false;
    }
  } catch (err) {
    Logger.log("❌ Error dispatching GitHub Actions: " + err.toString());
    return false;
  }
}

function recordExecutionHistory(timestamp, slotName, status) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Execution History");

    if (!sheet) {
      sheet = ss.insertSheet("Execution History");
      sheet.appendRow(["Timestamp (IST)", "Scheduled Slot", "Status", "Trigger Source"]);
      sheet.getRange("A1:D1").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([timestamp, slotName, status, "Google Apps Script"]);
    Logger.log("📝 Recorded to Execution History: " + timestamp + " | " + slotName + " | " + status);
  } catch (e) {
    Logger.log("⚠️ Could not write to Execution History sheet: " + e.toString());
  }
}
