#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Daily Playground Test Runner
# Runs BOTH UI and Backend API tests for the Playground, generates reports,
# writes results to Google Sheet, and saves dated logs.
#
# Managed by launchd: com.shunyalabs.playground-testing.plist (4:00 AM and 5:00 PM everyday)
# Project: /Users/unitedwecare/Playground_repo/playground-testing
#
# Manual run:
#   npm run test:playground-daily
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

DATE="$(date '+%Y-%m-%d')"
LOG_DIR="$PROJECT_DIR/logs"
REPORTS_DIR="$PROJECT_DIR/reports"
LOG_FILE="$LOG_DIR/playground-daily-$DATE.log"
SUMMARY_JSON="$REPORTS_DIR/playground-summary-$DATE.json"
mkdir -p "$LOG_DIR" "$REPORTS_DIR"

# ── Single-run guard (shared with run-and-email.sh) ─────────────────────────
LOCK_DIR="$PROJECT_DIR/.daily-run.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  if [ -f "$LOCK_DIR/pid" ] && kill -0 "$(cat "$LOCK_DIR/pid")" 2>/dev/null; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Skip — playground daily already running (PID $(cat "$LOCK_DIR/pid"))." | tee -a "$LOG_FILE"
    exit 0
  fi
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR"
fi
echo $$ > "$LOCK_DIR/pid"
_release_lock() { rm -rf "$LOCK_DIR"; }
trap _release_lock EXIT

TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"
RUN_ID="$(date '+%Y-%m-%dT%H-%M-%S')"
RUN_SUITE_LOG_DIR="$LOG_DIR/run-$RUN_ID"
mkdir -p "$RUN_SUITE_LOG_DIR"

echo "════════════════════════════════════════════════════════════"  | tee -a "$LOG_FILE"
echo "  Playground Daily Test Run — $TIMESTAMP"                     | tee -a "$LOG_FILE"
echo "  runId: $RUN_ID"                                              | tee -a "$LOG_FILE"
echo "════════════════════════════════════════════════════════════"  | tee -a "$LOG_FILE"

# ── Load node/npm (needed when running from cron with no interactive shell) ──
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1090
  source "$NVM_DIR/nvm.sh"
  nvm use default >> "$LOG_FILE" 2>&1 || true
fi
export PATH="/usr/local/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)/bin:$PATH"

# ── Check auth freshness (cross-platform using python3) ──────────────────────
AUTH_FILE="$PROJECT_DIR/auth/playground-auth.json"
if [ -f "$AUTH_FILE" ]; then
  AUTH_MTIME=$(python3 -c "import os; print(int(os.path.getmtime('$AUTH_FILE')))" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  AUTH_AGE_DAYS=$(( (NOW - AUTH_MTIME) / 86400 ))
  if [ "$AUTH_AGE_DAYS" -ge 7 ]; then
    echo "  ⚠️  Auth state is ${AUTH_AGE_DAYS} days old — UI tests may fail." | tee -a "$LOG_FILE"
    echo "  💡 Run: npm run playground:login  to refresh" | tee -a "$LOG_FILE"
  else
    echo "  ✅ Auth state is ${AUTH_AGE_DAYS} day(s) old" | tee -a "$LOG_FILE"
  fi
else
  echo "  ❌ Auth file missing! UI tests will fail." | tee -a "$LOG_FILE"
  echo "  💡 Run: npm run playground:login" | tee -a "$LOG_FILE"
  exit 1
fi

# ── Verify session works headless (stops 60-suite run if still on sign-in) ───
echo "  🔍 Verifying login session…" | tee -a "$LOG_FILE"
if ! npx ts-node scripts/verify-playground-auth.ts >> "$LOG_FILE" 2>&1; then
  echo "  ❌ Auth verify failed — UI tests would all fail on sign-in page." | tee -a "$LOG_FILE"
  echo "  💡 Mac: npm run playground:login  then scp auth/playground-auth.json to this machine" | tee -a "$LOG_FILE"
  exit 1
fi
echo "  ✅ Auth verify passed" | tee -a "$LOG_FILE"

# ── Tracking ──────────────────────────────────────────────────────────────────
TOTAL=0
PASS=0
FAIL=0
SUITE_ENTRIES=""

# Recursively send a signal to a PID and all its descendants.
# Needed because `kill <subshell-pid>` does not reach grandchildren — npm/node
# children get reparented to launchd (PID 1) and survive as orphans.
_kill_tree() {
  local pid=$1 sig=${2:-TERM}
  local kids
  kids=$(pgrep -P "$pid" 2>/dev/null) || true
  local k
  for k in $kids; do
    _kill_tree "$k" "$sig"
  done
  kill "-$sig" "$pid" 2>/dev/null || true
}

run_test() {
  local category="$1"
  local name="$2"
  local cmd="$3"
  local start_ts end_ts duration_s status failure_reason=""
  TOTAL=$((TOTAL + 1))

  # Safety: ensure log/report dirs still exist before each test
  mkdir -p "$LOG_DIR" "$REPORTS_DIR"

  printf "\n[%s] ▶  %s\n" "$category" "$name" | tee -a "$LOG_FILE"
  start_ts=$(date +%s)

  local tmp_out
  tmp_out=$(mktemp)
  # Hard wall-clock cap at 18 min per suite — guards against hung browser processes
  # that ignore Playwright's internal test/global timeouts. Sized to sit above
  # Playwright's 15-min globalTimeout so Playwright fires first under normal load.
  # macOS doesn't ship GNU `timeout`, so we use a portable background-kill pattern.
  # NOTE: must kill the *entire* descendant tree, not just the eval subshell,
  # otherwise npm/node grandchildren reparent to launchd and run forever.
  local cmd_rc
  ( eval "$cmd" ) >> "$tmp_out" 2>&1 &
  local cmd_pid=$!
  ( sleep 1080 && _kill_tree "$cmd_pid" TERM && sleep 5 && _kill_tree "$cmd_pid" KILL ) &
  local killer_pid=$!
  wait "$cmd_pid" 2>/dev/null
  cmd_rc=$?
  # Sweep any descendants the suite spawned, even on success.
  _kill_tree "$cmd_pid" TERM
  kill "$killer_pid" 2>/dev/null
  wait "$killer_pid" 2>/dev/null
  local suite_log="$RUN_SUITE_LOG_DIR/$(printf '%s' "$name" | tr ' /:' '___').log"
  {
    printf '[%s] ▶  %s\n' "$category" "$name"
    cat "$tmp_out"
  } > "$suite_log"

  if [ $cmd_rc -eq 0 ]; then
    status="pass"
    printf "   ✅ PASS\n" | tee -a "$LOG_FILE"
    printf '   ✅ PASS\n' >> "$suite_log"
    PASS=$((PASS + 1))
  else
    status="fail"
    printf "   ❌ FAIL\n" | tee -a "$LOG_FILE"
    printf '   ❌ FAIL\n' >> "$suite_log"
    FAIL=$((FAIL + 1))
    local reason
    reason=$(grep -oE "[0-9]+ (failed|test case)" "$tmp_out" | tail -1)
    if [ -z "$reason" ]; then
      reason=$(grep -oE "[0-9]+ did not run" "$tmp_out" | tail -1)
    fi
    if [ -z "$reason" ] && grep -q "Timed out waiting 900s" "$tmp_out"; then
      reason="Playwright suite timeout (15m)"
    fi
    if [ -z "$reason" ]; then
      reason=$(grep -m1 "Error:\|❌\|FAIL\|Timeout" "$tmp_out" | sed 's/^[[:space:]]*//' | cut -c1-120)
    fi
    failure_reason=$(printf '%s' "$reason" | tr -d '\n\r' | sed 's/\\/\\\\/g; s/"/\\"/g')
  fi
  cat "$tmp_out" >> "$LOG_FILE"
  rm -f "$tmp_out"

  end_ts=$(date +%s)
  duration_s=$((end_ts - start_ts))

  local entry="{\"category\":\"$category\",\"name\":\"$name\",\"status\":\"$status\",\"duration_s\":$duration_s,\"failure_reason\":\"$failure_reason\"}"
  if [ -z "$SUITE_ENTRIES" ]; then
    SUITE_ENTRIES="$entry"
  else
    SUITE_ENTRIES="$SUITE_ENTRIES,$entry"
  fi
}

# ════════════════════════════════════════════════════════════════
# SECTION 1: FUNCTIONAL / UI TESTS (Exhaustive Master UI Suite)
# ════════════════════════════════════════════════════════════════
echo "" | tee -a "$LOG_FILE"
echo "-- Functional / UI Tests --------------------------------" | tee -a "$LOG_FILE"

run_test "UI - Auth & Session"       "Authentication & Session"       "npx playwright test src/tests/ui/exhaustiveMasterUI.spec.ts --reporter=list --project=playground-ui -g 'Authentication & Session'"
run_test "UI - Onboarding"           "Onboarding Journey"             "npx playwright test src/tests/ui/exhaustiveMasterUI.spec.ts --reporter=list --project=playground-ui -g 'Onboarding Journey'"
run_test "UI - Navigation"           "Layout & Navigation"           "npx playwright test src/tests/ui/exhaustiveMasterUI.spec.ts --reporter=list --project=playground-ui -g 'Layout & Navigation'"
run_test "UI - Models & Languages"   "Model & Language Selection"    "npx playwright test src/tests/ui/exhaustiveMasterUI.spec.ts --reporter=list --project=playground-ui -g 'Model & Language Selection'"
run_test "UI - Intelligence"         "Intelligence Features"         "npx playwright test src/tests/ui/exhaustiveMasterUI.spec.ts --reporter=list --project=playground-ui -g 'Intelligence Features'"
run_test "UI - Text to Speech"       "Text to Speech UI"             "npx playwright test src/tests/ui/exhaustiveMasterUI.spec.ts --reporter=list --project=playground-ui -g 'Text to Speech'"
run_test "UI - Edge Cases"           "Negative & Edge Cases"         "npx playwright test src/tests/ui/exhaustiveMasterUI.spec.ts --reporter=list --project=playground-ui -g 'Negative & Edge Cases'"

# ════════════════════════════════════════════════════════════════
# SECTION 2: BACKEND API TESTS (Exhaustive Master API Suite)
# ════════════════════════════════════════════════════════════════
echo "" | tee -a "$LOG_FILE"
echo "-- Backend API Tests ------------------------------------" | tee -a "$LOG_FILE"

run_test "API - Intelligence"        "Intelligence Feature Matrix"   "npx playwright test src/tests/backend/exhaustiveMasterAPI.spec.ts --reporter=list --project=api-tests -g 'Intelligence Feature Matrix'"
run_test "API - Text to Speech"      "TTS Speech Synthesis"          "npx playwright test src/tests/backend/exhaustiveMasterAPI.spec.ts --reporter=list --project=api-tests -g 'TTS Speech Synthesis'"
run_test "API - Negative & Stress"   "Negative, Auth & Stress"       "npx playwright test src/tests/backend/exhaustiveMasterAPI.spec.ts --reporter=list --project=api-tests -g 'Negative, Auth & Stress'"

# ════════════════════════════════════════════════════════════════
# WRITE DAILY SUMMARY JSON
# ════════════════════════════════════════════════════════════════
END_TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"
RUN_JSON="$REPORTS_DIR/playground-run-$RUN_ID.json"

SUMMARY_BODY=$(cat <<EOF
{
  "runId": "$RUN_ID",
  "runDate": "$DATE",
  "runTimestamp": "$TIMESTAMP",
  "endTimestamp": "$END_TIMESTAMP",
  "totalSuites": $TOTAL,
  "passed": $PASS,
  "failed": $FAIL,
  "suites": [$SUITE_ENTRIES]
}
EOF
)

# Write per-run JSON (preserves history) AND latest-of-day JSON
echo "$SUMMARY_BODY" > "$RUN_JSON"
echo "$SUMMARY_BODY" > "$SUMMARY_JSON"

echo "" | tee -a "$LOG_FILE"
echo "   ✅ Run JSON: $RUN_JSON" | tee -a "$LOG_FILE"
echo "   ✅ Summary JSON: $SUMMARY_JSON" | tee -a "$LOG_FILE"

# ════════════════════════════════════════════════════════════════
# WRITE SUITE SUMMARY TO GOOGLE SHEET
# ════════════════════════════════════════════════════════════════
echo "" | tee -a "$LOG_FILE"
echo "── Writing Suite Summary to Google Sheet ─────────" | tee -a "$LOG_FILE"

export SUMMARY_JSON
if npx ts-node <<'TS' >> "$LOG_FILE" 2>&1
const fs = require('fs');
const { writeDailySummarySheet } = require('./src/utils/playgroundSheetWriter');
const summary = JSON.parse(fs.readFileSync(process.env.SUMMARY_JSON!, 'utf-8'));
writeDailySummarySheet(summary.suites, summary.runDate).then(() => {
  console.log('Done');
}).catch((e: any) => console.error(e.message));
TS
then
  echo "   ✅ Suite summary written to Google Sheet" | tee -a "$LOG_FILE"
else
  echo "   ⚠️  Suite summary sheet write failed" | tee -a "$LOG_FILE"
fi

# ════════════════════════════════════════════════════════════════
# GENERATE PLAYGROUND HTML REPORT & STAKEHOLDER DASHBOARD
# ════════════════════════════════════════════════════════════════
echo "" | tee -a "$LOG_FILE"
echo "── Generating Playground Report & Stakeholder Dashboard ────" | tee -a "$LOG_FILE"

npx tsx scripts/generate-playground-report.ts >> "$LOG_FILE" 2>&1 || true
if npx ts-node scripts/generate-stakeholder-dashboard.ts >> "$LOG_FILE" 2>&1; then
  echo "   ✅ Stakeholder Dashboard generated at index.html, docs/index.html, & reports/Stakeholder-Dashboard.html" | tee -a "$LOG_FILE"

  # Primary dashboard: dual sync to both organization and personal repos → GitHub Pages
  echo "" | tee -a "$LOG_FILE"
  echo "── Publishing Dashboard to GitHub Repos & Pages ─────" | tee -a "$LOG_FILE"
  (
    cd "$PROJECT_DIR"
    git add index.html docs/index.html .nojekyll reports/Stakeholder-Dashboard.html reports/Playground-Report.html reports/playground-runs.json reports/playground-summary-*.json reports/playground-today-summary.json 2>/dev/null || true
    if git diff --staged --quiet; then
      echo "   ℹ️  No new dashboard files to commit (will push existing commits if any)" | tee -a "$LOG_FILE"
    else
      COMMIT_MSG="Stakeholder Dashboard update — ${DATE} $(date +%H:%M)"
      git commit -m "$COMMIT_MSG" | tee -a "$LOG_FILE"
    fi
    if git push origin main 2>&1 | tee -a "$LOG_FILE"; then
      echo "   ✅ Dashboard pushed to GitHub (both org and personal repos) — Pages will update in ~1–2 min" | tee -a "$LOG_FILE"
      echo "   🔗 Org: https://shunyalabsai.github.io/shunya-playground-qa-automation/" | tee -a "$LOG_FILE"
      echo "   🔗 Personal: https://yamini-pal-singh.github.io/playground-testing/" | tee -a "$LOG_FILE"
    else
      echo "   ❌ git push failed — live dashboard NOT updated (check GitHub auth on this Mac)" | tee -a "$LOG_FILE"
      echo "   💡 Manual push: cd $PROJECT_DIR && git push origin main" | tee -a "$LOG_FILE"
    fi
  ) >> "$LOG_FILE" 2>&1 || echo "   ⚠️  Dashboard publish step failed (see log above)" | tee -a "$LOG_FILE"

  # Legacy mirror: asr-testing repo copy for historical archive
  GHPAGES_REPO="$HOME/repos/asr-testing"
  if [ -d "$GHPAGES_REPO/.git" ]; then
    mkdir -p "$GHPAGES_REPO/asr-testing/reports/playground-history"
    # Always update latest dashboard
    cp "$REPORTS_DIR/Playground-Report.html" "$GHPAGES_REPO/asr-testing/reports/Playground-Report.html" 2>/dev/null
    # Save dated copy with logs for history
    cp "$REPORTS_DIR/Playground-Report.html" "$GHPAGES_REPO/asr-testing/reports/playground-history/Playground-Report-$DATE.html" 2>/dev/null
    # Copy daily log file for reference
    cp "$LOG_FILE" "$GHPAGES_REPO/asr-testing/reports/playground-history/playground-daily-$DATE.log" 2>/dev/null
    # Copy summary JSON
    cp "$SUMMARY_JSON" "$GHPAGES_REPO/asr-testing/reports/playground-history/playground-summary-$DATE.json" 2>/dev/null
    (cd "$GHPAGES_REPO" && git add asr-testing/reports/ && git commit -m "Playground Dashboard + logs — $DATE" && git push origin main) >> "$LOG_FILE" 2>&1
    if [ $? -eq 0 ]; then
      echo "   ✅ Dashboard + logs published to GitHub Pages" | tee -a "$LOG_FILE"
    else
      echo "   ⚠️  GitHub Pages push failed (may need auth)" | tee -a "$LOG_FILE"
    fi
  fi
else
  echo "   ⚠️  Report generation failed" | tee -a "$LOG_FILE"
fi

# Email: once daily at 8 PM — not after each run (see send-playground-daily-email.sh)
echo "" | tee -a "$LOG_FILE"
echo "── Email ───────────────────────────────────────────" | tee -a "$LOG_FILE"
echo "   ℹ️  Skipped (scheduled once daily at 8 PM: npm run email:playground:daily)" | tee -a "$LOG_FILE"

# ════════════════════════════════════════════════════════════════
# FINAL SUMMARY
# ════════════════════════════════════════════════════════════════
echo "" | tee -a "$LOG_FILE"
echo "════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"
echo "  PLAYGROUND DAILY SUMMARY — $END_TIMESTAMP"                  | tee -a "$LOG_FILE"
echo "  Total suites : $TOTAL"                                      | tee -a "$LOG_FILE"
echo "  Passed       : $PASS"                                       | tee -a "$LOG_FILE"
echo "  Failed       : $FAIL"                                       | tee -a "$LOG_FILE"
echo "  Log          : $LOG_FILE"                                   | tee -a "$LOG_FILE"
echo "  Report       : $SUMMARY_JSON"                               | tee -a "$LOG_FILE"
echo "════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"

exit 0
