#!/usr/bin/env bash
# Hourly: Run UI test suites, generate summary + report, push dashboard, email on failure
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

DATE="$(date '+%Y-%m-%d')"
LOG_DIR="$PROJECT_DIR/logs"
REPORTS_DIR="$PROJECT_DIR/reports"
mkdir -p "$LOG_DIR" "$REPORTS_DIR"

# ── Single-run guard ─────────────────────────────────────────────────────────
# Prevent two concurrent launches (overlapping launchd triggers) from racing.
LOCK_DIR="$PROJECT_DIR/.daily-run.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  if [ -f "$LOCK_DIR/pid" ] && kill -0 "$(cat "$LOCK_DIR/pid")" 2>/dev/null; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Skip — run already in progress (PID $(cat "$LOCK_DIR/pid"))."
    exit 0
  fi
  # Stale lock — owner is gone. Take it over.
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR"
fi
echo $$ > "$LOCK_DIR/pid"
trap 'rm -rf "$LOCK_DIR"' EXIT INT TERM

echo "════════════════════════════════════════════════════"
echo "  Playground Hourly Run — $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════════════"

# Load node
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  source "$NVM_DIR/nvm.sh"
  nvm use default 2>/dev/null || true
fi
export PATH="/usr/local/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)/bin:$PATH"

# ── Step 1: Run daily suite script (generates summary JSON) ──
echo ""
echo "── Running UI Test Suites ─────────────────────────"
bash "$SCRIPT_DIR/run-playground-daily.sh" 2>&1 | tee "$LOG_DIR/playground-email-$DATE.log"

# ── Step 2: Read pass/fail from generated summary JSON ──
SUMMARY_JSON="$REPORTS_DIR/playground-summary-$DATE.json"
if [ -f "$SUMMARY_JSON" ]; then
  SUITE_PASSED=$(python3 -c "import json; d=json.load(open('$SUMMARY_JSON')); print(d.get('passed',0))" 2>/dev/null || echo 0)
  SUITE_FAILED=$(python3 -c "import json; d=json.load(open('$SUMMARY_JSON')); print(d.get('failed',0))" 2>/dev/null || echo 0)
  SUITE_TOTAL=$(python3 -c "import json; d=json.load(open('$SUMMARY_JSON')); print(d.get('totalSuites',0))" 2>/dev/null || echo 0)
else
  SUITE_PASSED=0
  SUITE_FAILED=0
  SUITE_TOTAL=0
fi

# ── Step 3: Generate HTML report ──
echo ""
echo "── Generating Report ────────────────────────────"
npx ts-node scripts/generate-playground-report.ts 2>&1

# ── Step 4: Push dashboard to GitHub Pages ──
echo ""
echo "── Publishing Dashboard ─────────────────────────"
git add reports/Playground-Report.html reports/playground-runs.json 2>/dev/null
git commit -m "Dashboard update — $DATE $(date '+%H:%M')" 2>/dev/null
git push origin main 2>&1
echo "   ✅ Dashboard published"

# ── Step 5: Email only on failure ──
echo ""
if [ "$SUITE_FAILED" -gt 0 ]; then
  echo "── ❌ $SUITE_FAILED suite(s) failed — Sending Email ──"
  npx ts-node scripts/send-playground-email.ts 2>&1
else
  echo "── ✅ All $SUITE_PASSED/$SUITE_TOTAL suites passed — No email needed ──"
fi

echo ""
echo "════════════════════════════════════════════════════"
echo "  Done — $(date '+%H:%M:%S') | Suites: $SUITE_PASSED/$SUITE_TOTAL passed"
echo "════════════════════════════════════════════════════"
