#!/usr/bin/env bash
# Twice daily (4:00 AM & 5:00 PM): run UI suites once, generate report, push dashboard (email at 8 PM only).
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

echo ""
echo "── Running UI Test Suites ─────────────────────────"
bash "$SCRIPT_DIR/run-playground-daily.sh" 2>&1 | tee -a "$LOG_DIR/playground-email-$DATE.log"

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

echo ""
echo "── Generating Report ────────────────────────────"
npx tsx scripts/generate-playground-report.ts 2>&1

echo ""
echo "── Publishing Dashboard ─────────────────────────"
publish_dashboard() {
  git add reports/Playground-Report.html reports/playground-runs.json reports/playground-today-summary.json 2>/dev/null || true
  if ! git diff --staged --quiet 2>/dev/null; then
    COMMIT_MSG="Dashboard update — ${DATE} $(date +%H:%M)"
    git commit -m "$COMMIT_MSG" || return 1
  else
    echo "   ℹ️  No new dashboard files to commit (will push existing commits if any)"
  fi
  if git push origin main; then
    echo "   ✅ Dashboard pushed to GitHub — Pages will update in ~1–2 min"
    echo "   🔗 https://yamini-pal-singh.github.io/playground-testing/Playground-Report.html"
    return 0
  fi
  echo "   ❌ git push failed — live dashboard will NOT update until push succeeds"
  echo "   💡 This Mac is logged into GitHub as: $(git config user.name 2>/dev/null || echo unknown) <$(git config user.email 2>/dev/null || echo unknown)>"
  echo "   💡 Push manually as yamini-pal-singh: cd $PROJECT_DIR && git push origin main"
  return 1
}
publish_dashboard || true

echo ""
echo "── Email ────────────────────────────────────────"
echo "   ℹ️  Skipped (daily digest at 8 PM: npm run email:playground:daily)"

echo ""
echo "════════════════════════════════════════════════════"
echo "  Done — $(date '+%H:%M:%S') | Suites: $SUITE_PASSED/$SUITE_TOTAL passed"
echo "════════════════════════════════════════════════════"
