#!/usr/bin/env bash
# Show whether Playground daily tests are running and current progress.
# Usage: npm run test:playground-daily:status

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

DATE="$(date '+%Y-%m-%d')"
LOG_FILE="$PROJECT_DIR/logs/playground-daily-$DATE.log"
BATCH_LOG="$PROJECT_DIR/logs/playground-batch-$DATE.log"
BATCH_STATE="$PROJECT_DIR/.daily-batch-state.json"
SUMMARY_JSON="$PROJECT_DIR/reports/playground-summary-$DATE.json"

echo "════════════════════════════════════════════════════════════"
echo "  Playground Daily — Status"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════════════════════"
echo ""

# ── Batch progress (8 back-to-back runs) ─────────────────────────────────────
if [ -f "$BATCH_STATE" ]; then
  node -e "
    const fs = require('fs');
    const j = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const cur = j.current ?? '?';
    const tot = j.total ?? 8;
    console.log('▶ Daily batch:   run ' + cur + '/' + tot + ' in progress');
    if (j.updated) console.log('   Updated:       ' + j.updated);
  " "$BATCH_STATE" 2>/dev/null || echo "▶ Daily batch:   in progress (state file present)"
  echo ""
fi

# ── Running processes ─────────────────────────────────────────────────────────
BATCH_PIDS=""
BATCH_COUNT=0
while IFS= read -r pid; do
  [ -n "$pid" ] || continue
  BATCH_PIDS="$BATCH_PIDS $pid"
  BATCH_COUNT=$((BATCH_COUNT + 1))
done <<EOF
$(pgrep -f "$PROJECT_DIR/scripts/run-and-email.sh" 2>/dev/null || true)
EOF

DAILY_PIDS=""
DAILY_COUNT=0
while IFS= read -r pid; do
  [ -n "$pid" ] || continue
  DAILY_PIDS="$DAILY_PIDS $pid"
  DAILY_COUNT=$((DAILY_COUNT + 1))
done <<EOF
$(pgrep -f "$PROJECT_DIR/scripts/run-playground-daily.sh" 2>/dev/null || true)
EOF

if [ "$BATCH_COUNT" -eq 0 ] && [ "$DAILY_COUNT" -eq 0 ]; then
  echo "▶ Daily runner:  NOT RUNNING"
elif [ "$BATCH_COUNT" -gt 0 ]; then
  echo "▶ Daily runner:  BATCH RUNNING (run-and-email)"
  for pid in $BATCH_PIDS; do
    start=$(ps -p "$pid" -o lstart= 2>/dev/null | sed 's/^ *//')
    echo "   PID $pid  started: ${start:-unknown}"
  done
elif [ "$DAILY_COUNT" -gt 0 ]; then
  echo "▶ Daily runner:  RUNNING ($DAILY_COUNT process tree(s))"
  for pid in $DAILY_PIDS; do
    start=$(ps -p "$pid" -o lstart= 2>/dev/null | sed 's/^ *//')
    tty=$(ps -p "$pid" -o tty= 2>/dev/null | tr -d ' ')
    [ -z "$tty" ] || [ "$tty" = "??" ] && tty="background"
    echo "   PID $pid  started: ${start:-unknown}  tty: $tty"
  done
  if [ "$DAILY_COUNT" -gt 1 ]; then
    echo ""
    echo "   ⚠️  Multiple daily runs detected — stop extras to avoid timeouts:"
    echo "      npm run test:playground-daily:stop"
  fi
fi

echo ""

# ── Active Playwright suites ──────────────────────────────────────────────────
PW_COUNT=0
while IFS= read -r line; do
  [ -n "$line" ] || continue
  PW_COUNT=$((PW_COUNT + 1))
  if [ "$PW_COUNT" -eq 1 ]; then
    echo "▶ Playwright:    active worker(s)"
  fi
  suite=$(echo "$line" | sed -n "s/.*-g ['\"]\?\([^'\"]*\)['\"]\?.*/\1/p" | head -1)
  pid=$(echo "$line" | awk '{print $1}')
  if [ -n "$suite" ]; then
    echo "   PID $pid  →  $suite"
  else
    echo "   PID $pid  →  (full spec or unknown -g)"
  fi
done <<EOF
$(pgrep -fl "playwright test.*playgroundUI" 2>/dev/null | grep -v "playground-daily-status" || true)
EOF

[ "$PW_COUNT" -eq 0 ] && echo "▶ Playwright:    no playgroundUI tests running"

echo ""

# ── Log progress (today) ────────────────────────────────────────────────────
if [ -f "$BATCH_LOG" ]; then
  last_batch=$(grep -E "Batch run [0-9]+ /" "$BATCH_LOG" | tail -1 || true)
  echo "▶ Batch log:     $BATCH_LOG"
  [ -n "$last_batch" ] && echo "   $last_batch"
  echo ""
fi

if [ -f "$LOG_FILE" ]; then
  last_run=$(grep -E "Playground Daily Test Run —" "$LOG_FILE" | tail -1 || true)
  last_suite=$(grep -E "^\[(Functional UI|Feature Verify)\] ▶" "$LOG_FILE" | tail -1 || true)
  last_result=$(grep -E "^\[(Functional UI|Feature Verify)\]" "$LOG_FILE" | grep -E "✅ PASS|❌ FAIL" | tail -1 || true)
  last_summary=$(grep "PLAYGROUND DAILY SUMMARY" "$LOG_FILE" | tail -1 || true)

  echo "▶ Log:          $LOG_FILE"
  [ -n "$last_run" ] && echo "   Last started:  $last_run"
  [ -n "$last_suite" ] && echo "   Last suite:    $last_suite"
  [ -n "$last_result" ] && echo "   Last result:   $last_result"
  if [ -n "$last_summary" ]; then
    echo "   Completed:     $last_summary"
    tail -6 "$LOG_FILE" | grep -E "Total suites|Passed|Failed" | sed 's/^/   /' || true
  fi
else
  echo "▶ Log:          (no log for today yet)"
fi

echo ""

# ── Summary JSON (today) ────────────────────────────────────────────────────
if [ -f "$SUMMARY_JSON" ]; then
  node -e "
    const fs = require('fs');
    const p = process.argv[1];
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const pass = j.passed ?? 0;
    const fail = j.failed ?? 0;
    const total = j.totalSuites ?? (pass + fail);
    const pct = total ? ((pass / total) * 100).toFixed(1) : '0';
    console.log('▶ Last report:   ' + p);
    console.log('   Result:        ' + pass + '/' + total + ' passed (' + pct + '%)');
    if (j.runTimestamp) console.log('   Run started:   ' + j.runTimestamp);
    if (j.endTimestamp) console.log('   Run ended:     ' + j.endTimestamp);
  " "$SUMMARY_JSON" 2>/dev/null || echo "▶ Last report:   $SUMMARY_JSON (could not parse)"
else
  echo "▶ Last report:   (no summary JSON for today)"
fi

echo ""
echo "Commands:"
echo "  npm run test:playground-daily         Start daily suite"
echo "  npm run test:playground-daily:status  This status check"
echo "  npm run test:playground-daily:stop    Stop all daily runners"
echo "  tail -f logs/playground-daily-$DATE.log"
echo "════════════════════════════════════════════════════════════"

if [ "$BATCH_COUNT" -gt 0 ] || [ "$DAILY_COUNT" -gt 0 ]; then
  exit 0
fi
exit 1
