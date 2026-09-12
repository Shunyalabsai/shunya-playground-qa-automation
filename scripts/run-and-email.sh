#!/usr/bin/env bash
# Twice daily (4:30 AM & 5:30 PM): run UI suites once, generate report, push dashboard & email report.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

DATE="$(date '+%Y-%m-%d')"
LOG_DIR="$PROJECT_DIR/logs"
REPORTS_DIR="$PROJECT_DIR/reports"
mkdir -p "$LOG_DIR" "$REPORTS_DIR"

# Lock lives in run-playground-daily.sh only (this wrapper must not take the lock
# or the child exits immediately and scheduled runs report 0/60 suites).

# ── Wall-clock self-destruct ────────────────────────────────────────────────
# Hard ceiling on the entire run so a hung suite can never block the next
# launchd trigger. Keep below that.
RUN_DEADLINE_SECS=9000   # 150 minutes
PARENT_PID=$$
(
  sleep "$RUN_DEADLINE_SECS"
  echo "[deadline] $RUN_DEADLINE_SECS s exceeded — killing run tree" >&2
  pkill -KILL -f "playwright test src/tests/ui/playgroundUI.spec.ts" 2>/dev/null
  pkill -KILL -f "node_modules/playwright/lib/common/process.js" 2>/dev/null
  pkill -KILL -P "$PARENT_PID" 2>/dev/null
  kill -KILL "$PARENT_PID" 2>/dev/null
) &
WATCHDOG_PID=$!

cleanup() {
  kill "$WATCHDOG_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── Orphan sweep ────────────────────────────────────────────────────────────
pkill -KILL -f "playwright test src/tests/ui/playgroundUI.spec.ts" 2>/dev/null || true
pkill -KILL -f "node_modules/playwright/lib/common/process.js" 2>/dev/null || true

echo "════════════════════════════════════════════════════"
echo "  Playground Scheduled Run — $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════════════"

if [ -f "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1090
  source "$NVM_DIR/nvm.sh"
  nvm use default 2>/dev/null || true
fi
export PATH="/usr/local/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)/bin:$PATH"

# ── Smart Failover & Deduplication Check ─────────────────────────────────────
echo "── Smart Failover & Deduplication Check ──────────"
if npx ts-node --transpile-only "$SCRIPT_DIR/check-apps-script-status.ts"; then
  echo ""
  echo "════════════════════════════════════════════════════"
  echo "  [SKIPPED] Apps Script / Cloud run already active for this slot."
  echo "  LaunchAgent skipped to avoid duplicate dashboard runs."
  echo "════════════════════════════════════════════════════"
  exit 0
fi
echo "── Proceeding with Local Fallback Execution ──────"

echo ""
echo "── Running Smoke Test Suite (21 Scenarios) ────────"
npm run test:smoke 2>&1 | tee -a "$LOG_DIR/playground-email-$DATE.log"

echo ""
echo "── Sending Email Notification ────────────────────"
npm run email:playground 2>&1 | tee -a "$LOG_DIR/playground-email-$DATE.log"

echo ""
echo "════════════════════════════════════════════════════"
echo "  Done — $(date '+%H:%M:%S') | Smoke Test Run Completed"
echo "════════════════════════════════════════════════════"
