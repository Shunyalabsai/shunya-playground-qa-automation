/**
 * ============================================================================
 * 24/7 Cloud API Health Check — Runs Every 15 Minutes (HealthCheck15Min.gs)
 * ============================================================================
 * Checks Playground Core Microservices:
 * 1. ASR Microservice (GET https://asrv2prod.shunyalabs.ai/health)
 * 2. TTS Microservice (GET https://ttsv2.shunyalabs.ai/health)
 * 3. Playground Web App (GET https://playground.shunyalabs.ai)
 *
 * Alerts 6 stakeholders ONLY on service failure with full diagnostic data.
 * MailApp sends as the Google account that owns this script. Run it as
 * saira@shunyalabs.ai so the From address matches the Node health checker.
 */

function classifyHealthFailure(statusCode, errorText, fallbackResolution) {
  var message = String(errorText || "");
  if (/ENOTFOUND|ENODATA|EAI_AGAIN|getaddrinfo|DNS|Address unavailable|unable to resolve/i.test(message)) {
    return {
      kind: "dns",
      statusLabel: "DNS lookup failed",
      resolution: "The hostname did not resolve, so this check never reached the server. Check the DNS record for this host. Do not restart the container until the name resolves."
    };
  }
  if (/timeout|ETIMEDOUT|timed out/i.test(message)) {
    return {
      kind: "timeout",
      statusLabel: "Connection timeout",
      resolution: "The host resolved, but the connection did not complete in time. Check instance health, the network path, and whether the process is listening."
    };
  }
  if (/refused|ECONNREFUSED|ECONNRESET|unreachable/i.test(message)) {
    return {
      kind: "connection",
      statusLabel: "Connection refused",
      resolution: "The host is reachable but refused the connection. Check that the service process is running and the port is open."
    };
  }
  if (statusCode > 0) {
    return {
      kind: "http",
      statusLabel: "HTTP " + statusCode,
      resolution: fallbackResolution
    };
  }
  return {
    kind: "unknown",
    statusLabel: "Unreachable",
    resolution: fallbackResolution || "The health check failed before an HTTP status was returned. Check DNS, network, and whether the service process is running."
  };
}

var HEALTH_CHECK_ATTEMPTS = 3;
var HEALTH_CHECK_RETRY_MS = 4000;
var HEALTH_DNS_STATE_KEY = "HEALTH_DNS_STRIKES";

function loadDnsStrikes() {
  var raw = PropertiesService.getScriptProperties().getProperty(HEALTH_DNS_STATE_KEY);
  if (!raw) return {};
  try {
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveDnsStrikes(strikes) {
  PropertiesService.getScriptProperties().setProperty(HEALTH_DNS_STATE_KEY, JSON.stringify(strikes));
}

function probeMonitoredService(service) {
  var last = { ok: false, statusCode: 0, latencyMs: 0, error: "No attempt made" };
  for (var attempt = 1; attempt <= HEALTH_CHECK_ATTEMPTS; attempt++) {
    var startTime = new Date().getTime();
    try {
      var response = UrlFetchApp.fetch(service.url, {
        muteHttpExceptions: true,
        followRedirects: false,
        headers: { "User-Agent": "Playground-Cloud-HealthCheck/1.0" }
      });
      var statusCode = response.getResponseCode();
      var isExpected = service.expectedStatus.indexOf(statusCode) !== -1 || (statusCode >= 200 && statusCode < 400);
      last = {
        ok: isExpected,
        statusCode: statusCode,
        latencyMs: new Date().getTime() - startTime,
        error: isExpected ? "" : "Unexpected HTTP status code: " + statusCode
      };
      if (isExpected) return last;
    } catch (err) {
      last = {
        ok: false,
        statusCode: 0,
        latencyMs: new Date().getTime() - startTime,
        error: err.toString()
      };
    }
    if (attempt < HEALTH_CHECK_ATTEMPTS) {
      Logger.log("↻ " + service.name + " failed (" + last.error + "). Retry " + attempt + " of " + (HEALTH_CHECK_ATTEMPTS - 1) + ".");
      Utilities.sleep(HEALTH_CHECK_RETRY_MS);
    }
  }
  return last;
}

function run15MinuteApiHealthCheck() {
  var alertRecipients = [
    "saheb@shunyalabs.ai",
    "arti@shunyalabs.ai",
    "ritu@shunyalabs.ai",
    "yamini@shunyalabs.ai",
    "sumit@shunyalabs.ai",
    "saira@shunyalabs.ai"
  ].join(", ");

  var monitoredServices = [
    {
      name: "ASR Microservice",
      url: "https://asrv2prod.shunyalabs.ai/health",
      expectedStatus: [200, 404],
      impact: "Audio transcription and speech intelligence features are unavailable or failing.",
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
  var dnsStrikes = loadDnsStrikes();

  for (var i = 0; i < monitoredServices.length; i++) {
    var s = monitoredServices[i];
    var probe = probeMonitoredService(s);
    if (probe.ok) {
      if (dnsStrikes[s.name]) delete dnsStrikes[s.name];
      Logger.log("✅ " + s.name + " " + probe.statusCode + " (" + probe.latencyMs + "ms)");
      continue;
    }

    var classified = classifyHealthFailure(probe.statusCode, probe.error, s.resolution);
    var previousDnsStrikes = dnsStrikes[s.name] || 0;
    var alert = classified.kind !== "dns" || previousDnsStrikes >= 1;
    if (classified.kind === "dns") dnsStrikes[s.name] = previousDnsStrikes + 1;
    else delete dnsStrikes[s.name];

    if (!alert) {
      Logger.log("Suppressed one-off DNS miss for " + s.name + " (" + probe.error + "). Will alert if the next check also fails DNS.");
      continue;
    }

    failedServices.push({
      name: s.name,
      url: s.url,
      status: classified.statusLabel,
      latencyMs: probe.latencyMs,
      reason: probe.error,
      impact: s.impact,
      resolution: classified.resolution,
      kind: classified.kind
    });
  }

  saveDnsStrikes(dnsStrikes);

  if (failedServices.length > 0) {
    sendHealthFailureAlertEmail(failedServices, timestamp, alertRecipients);
  } else {
    Logger.log("[" + timestamp + "] ✅ No alert email sent.");
  }
}

function sendHealthFailureAlertEmail(failures, timestamp, recipients) {
  var allDns = true;
  for (var k = 0; k < failures.length; k++) {
    if (failures[k].kind !== "dns") allDns = false;
  }
  var noun = failures.length > 1 ? "services" : "service";
  var subject = allDns
    ? "🚨 [ALERT] Playground API Health Check — DNS lookup failed (" + failures.length + " " + noun + ") — " + timestamp + " IST"
    : "🚨 [CRITICAL ALERT] Playground API Health Check Failed (" + failures.length + " " + noun + " unreachable) — " + timestamp + " IST";

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
          "The automated 15-minute API health monitor confirmed this after 3 attempts. A one-off DNS miss is not mailed. DNS is mailed only when the same hostname fails on two checks in a row.",
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
    replyTo: "saira@shunyalabs.ai",
    subject: subject,
    htmlBody: htmlBody
  });

  Logger.log("🚨 Failure alert email sent to: " + recipients);
}
