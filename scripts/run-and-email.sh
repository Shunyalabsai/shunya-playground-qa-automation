#!/usr/bin/env bash
# Daily batch: run the full Playground suite back-to-back until RUNS_PER_DAY complete.
# Managed by launchd (once per day at 02:30). Email digest is separate at 8 PM.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

DATE="$(date '+%Y-%m-%d')"
LOG_DIR="$PROJECT_DIR/logs"
REPORTS_DIR="$PROJECT_DIR/reports"
RUNS_PER_DAY="${PLAYGROUND_RUNS_PER_DAY:-8}"
BATCH_STATE="$PROJECT_DIR/.daily-batch-state.json"
BATCH_LOCK_DIR="$PROJECT_DIR/.daily-batch.lock"
mkdir -p "$LOG_DIR" "$REPORTS_DIR"

# ── One batch at a time (launchd must not start a second batch while first runs) ──
if ! mkdir "$BATCH_LOCK_DIR" 2>/dev/null; then
  if [ -f "$BATCH_LOCK_DIR/pid" ] && kill -0 "$(cat "$BATCH_LOCK_DIR/pid")" 2>/dev/null; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Skip — daily batch already running (PID $(cat "$BATCH_LOCK_DIR/pid"))."
    exit 0
  fi
  rm -rf "$BATCH_LOCK_DIR"
  mkdir "$BATCH_LOCK_DIR"
fi
echo $$ > "$BATCH_LOCK_DIR/pid"
_release_batch_lock() { rm -rf "$BATCH_LOCK_DIR"; rm -f "$BATCH_STATE"; }

# Lock lives in run-playground-daily.sh only (this wrapper must not take that lock
# or the child exits immediately and scheduled runs report 0/60 suites).

# ── Wall-clock self-destruct for the entire batch (8 back-to-back full runs) ──
RUN_DEADLINE_SECS="${PLAYGROUND_BATCH_DEADLINE_SECS:-86400}"   # 24 hours
PARENT_PID=$$
(
  sleep "$RUN_DEADLINE_SECS"
  echo "[deadline] $RUN_DEADLINE_SECS s exceeded — killing batch run tree" >&2
  pkill -KILL -f "playwright test src/tests/playgroundUI.spec.ts" 2>/dev/null
  pkill -KILL -f "node_modules/playwright/lib/common/process.js" 2>/dev/null
  pkill -KILL -P "$PARENT_PID" 2>/dev/null
  kill -KILL "$PARENT_PID" 2>/dev/null
) &
WATCHDOG_PID=$!

cleanup() {
  kill "$WATCHDOG_PID" 2>/dev/null || true
  _release_batch_lock
}
trap cleanup EXIT INT TERM

_write_batch_state() {
  local current=$1
  python3 -c "
import json, sys
from datetime import datetime
path, current, total, date = sys.argv[1:5]
state = {'date': date, 'current': int(current), 'total': int(total), 'updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
with open(path, 'w') as f:
    json.dump(state, f)
" "$BATCH_STATE" "$current" "$RUNS_PER_DAY" "$DATE"
}

# ── Orphan sweep before batch ───────────────────────────────────────────────
pkill -KILL -f "playwright test src/tests/playgroundUI.spec.ts" 2>/dev/null || true
pkill -KILL -f "node_modules/playwright/lib/common/process.js" 2>/dev/null || true

echo "════════════════════════════════════════════════════"
echo "  Playground Daily Batch — $(date '+%Y-%m-%d %H:%M:%S')"
echo "  $RUNS_PER_DAY runs back-to-back (next starts when previous finishes)"
echo "════════════════════════════════════════════════════"

# Load node
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1090
  source "$NVM_DIR/nvm.sh"
  nvm use default 2>/dev/null || true
fi
export PATH="/usr/local/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)/bin:$PATH"

BATCH_LOG="$LOG_DIR/playground-batch-$DATE.log"
exec > >(tee -a "$BATCH_LOG") 2>&1

for run_num in $(seq 1 "$RUNS_PER_DAY"); do
  _write_batch_state "$run_num"

  echo ""
  echo "════════════════════════════════════════════════════"
  echo "  Batch run $run_num / $RUNS_PER_DAY — $(date '+%Y-%m-%d %H:%M:%S')"
  echo "════════════════════════════════════════════════════"

  # Clear stray browsers between runs (previous run should have exited cleanly)
  if [ "$run_num" -gt 1 ]; then
    pkill -KILL -f "playwright test src/tests/playgroundUI.spec.ts" 2>/dev/null || true
    pkill -KILL -f "node_modules/playwright/lib/common/process.js" 2>/dev/null || true
    sleep 3
  fi

  echo ""
  echo "── Running UI Test Suites (run $run_num/$RUNS_PER_DAY) ─────────"
  if ! bash "$SCRIPT_DIR/run-playground-daily.sh"; then
    echo "   ⚠️  run-playground-daily.sh exited non-zero on run $run_num — continuing batch"
  fi

  SUMMARY_JSON="$REPORTS_DIR/playground-summary-$DATE.json"
  if [ -f "$SUMMARY_JSON" ]; then
    SUITE_PASSED=$(python3 -c "import json; d=json.load(open('$SUMMARY_JSON')); print(d.get('passed',0))" 2>/dev/null || echo 0)
    SUITE_TOTAL=$(python3 -c "import json; d=json.load(open('$SUMMARY_JSON')); print(d.get('totalSuites',0))" 2>/dev/null || echo 0)
    echo "   Run $run_num summary: $SUITE_PASSED/$SUITE_TOTAL suites passed"
  fi

  if [ "$run_num" -lt "$RUNS_PER_DAY" ]; then
    echo ""
    echo "── Next run starts immediately ($((run_num + 1))/$RUNS_PER_DAY) ──"
  fi
done

_write_batch_state "$RUNS_PER_DAY"

# ── Final report pass (run-playground-daily already publishes each run) ───────
echo ""
echo "── Batch complete — final report refresh ─────────"
npx tsx scripts/generate-playground-report.ts 2>&1 || true

echo ""
echo "── Email ────────────────────────────────────────"
echo "   ℹ️  Skipped (daily digest at 8 PM: npm run email:playground:daily)"

echo ""
echo "════════════════════════════════════════════════════"
echo "  Batch done — $(date '+%H:%M:%S') | $RUNS_PER_DAY runs completed"
echo "  Log: $BATCH_LOG"
echo "════════════════════════════════════════════════════"
