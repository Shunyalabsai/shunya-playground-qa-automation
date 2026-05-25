#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Daily Playground Test Runner
# Runs BOTH UI and Backend API tests for the Playground, generates reports,
# writes results to Google Sheet, and saves dated logs.
#
# Managed by launchd: com.shunyalabs.playground-testing.plist (every 3h at :30)
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
fi

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
# SECTION 1: FUNCTIONAL / UI TESTS (run first)
# ════════════════════════════════════════════════════════════════
echo "" | tee -a "$LOG_FILE"
echo "-- Functional / UI Tests --------------------------------" | tee -a "$LOG_FILE"

run_test "Functional UI"  "Page Load & Layout"          "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Page Load'"
run_test "Functional UI"  "Credits"                     "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Playground — Credits:'"
run_test "Functional UI"  "Tab Navigation"              "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Tab Navigation'"
run_test "Functional UI"  "Model Selection"             "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Model Selection'"
run_test "Functional UI"  "Language Selection"          "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Language Selection'"
run_test "Functional UI"  "Audio Intelligence Features" "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Audio Intelligence'"
run_test "Functional UI"  "File Upload"                 "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'File Upload'"
run_test "Functional UI"  "Sample Audio Removal"        "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Sample Audio Removal'"
run_test "Functional UI"  "Language Dropdown"            "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Language Dropdown'"
run_test "Functional UI"  "TTS Configuration"            "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Configuration'"
run_test "Functional UI"  "TTS Text Input"               "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Text Input'"
run_test "Functional UI"  "TTS Sub-tabs"                 "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Sub-tabs'"
run_test "Functional UI"  "TTS Voice Options"            "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Voice Options'"
run_test "Functional UI"  "TTS Output Options"           "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Output Options'"
run_test "Functional UI"  "TTS Audio Player"             "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Audio Player'"
run_test "Functional UI"  "TTS Negative"                 "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS: Negative'"
run_test "Functional UI"  "TTS Edge Cases"               "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS: Edge Cases'"
run_test "Functional UI"  "TTS E2E Synthesis"            "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Functional: End-to-End'"
run_test "Functional UI"  "TTS Transliteration"          "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Functional: Transliteration'"
run_test "Functional UI"  "TTS Voice Cascade"            "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Functional: Voice Cascade'"
run_test "Functional UI"  "TTS Mode & Format"            "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Functional: Mode'"
run_test "Functional UI"  "TTS Auth & Errors"            "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Functional: Error'"
run_test "Functional UI"  "TTS API Payload"              "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Functional: API Payload'"
run_test "Functional UI"  "TTS Multiple Runs"            "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Functional: Multiple'"
run_test "Functional UI"  "TTS Audio Player E2E"         "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Functional: Audio Player'"
run_test "Functional UI"  "TTS Navigation During Work"   "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Functional: Navigation'"
run_test "Functional UI"  "STT E2E Upload & Analyze"     "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Functional: Upload'"
run_test "Functional UI"  "STT Feature Toggles"          "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Functional: Feature Toggles'"
run_test "Functional UI"  "STT Cross-Feature"            "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Functional: Cross-Feature'"
run_test "Functional UI"  "STT Extended E2E"             "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Functional: Extended'"
run_test "Functional UI"  "Voice Agent Positive"         "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Voice Agent: Positive'"
run_test "Functional UI"  "Voice Agent Negative"         "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Voice Agent: Negative'"
run_test "Functional UI"  "Voice Agent Edge Cases"       "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Voice Agent: Edge Cases'"
run_test "Functional UI"  "STT Navigation"          "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Navigation'"
run_test "Functional UI"  "STT Configuration"       "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Configuration'"
run_test "Functional UI"  "STT Upload"              "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Upload'"
run_test "Functional UI"  "STT Features"            "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Features'"
run_test "Functional UI"  "STT Run Analysis"        "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Run Analysis'"
run_test "Functional UI"  "STT Output"              "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Output'"
run_test "Functional UI"  "STT Credits"             "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Credits'"
run_test "Functional UI"  "STT Accessibility"       "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Accessibility'"
run_test "Functional UI"  "STT Performance"         "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Performance'"
run_test "Functional UI"  "STT DOM"                 "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT DOM'"
run_test "Functional UI"  "STT Code Sample"         "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Code Sample'"
run_test "Functional UI"  "STT Responsive"          "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Responsive'"
run_test "Functional UI"  "STT Network"             "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Network'"
run_test "Feature Verify" "Translation Result"           "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Feature Verification: Translation'"
run_test "Feature Verify" "Transliteration Result"       "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Feature Verification: Transliteration'"
run_test "Feature Verify" "Speaker Diarization Result"   "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Feature Verification: Speaker Diarization'"
run_test "Feature Verify" "Speaker Identification Result" "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Feature Verification: Speaker Identification'"
run_test "Feature Verify" "Word Timestamps Result"       "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Feature Verification: Word Timestamps'"
run_test "Feature Verify" "Profanity Hashing Result"     "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Feature Verification: Profanity Hashing'"
run_test "Feature Verify" "Custom Keyword Hashing Result" "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Feature Verification: Custom Keyword Hashing'"
run_test "Feature Verify" "Intent Detection Result"      "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Feature Verification: Intent Detection'"
run_test "Feature Verify" "Sentiment Analysis Result"    "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Feature Verification: Sentiment Analysis'"
run_test "Feature Verify" "Emotion Diarization Result"   "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Feature Verification: Emotion Diarization'"
run_test "Feature Verify" "Summarisation Result"         "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Feature Verification: Summarisation'"
run_test "Feature Verify" "Keyword Normalisation Result" "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Feature Verification: Keyword Normalisation'"
run_test "Feature Verify" "Error Detection"              "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Feature Verification: Error Detection'"
run_test "Feature Verify" "Model Variants"               "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Feature Verification: Model Variants'"

# Sections 2-4 (Health Check, Backend API, Zero Indic) removed — only UI tests are active

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
# GENERATE PLAYGROUND HTML REPORT
# ════════════════════════════════════════════════════════════════
echo "" | tee -a "$LOG_FILE"
echo "── Generating Playground Report ────────────────────" | tee -a "$LOG_FILE"

if npx tsx scripts/generate-playground-report.ts >> "$LOG_FILE" 2>&1; then
  echo "   ✅ Playground HTML report generated" | tee -a "$LOG_FILE"

  # Primary dashboard: playground-testing repo → GitHub Pages (yamini-pal-singh.github.io/playground-testing)
  echo "" | tee -a "$LOG_FILE"
  echo "── Publishing Dashboard (playground-testing) ───────" | tee -a "$LOG_FILE"
  (
    cd "$PROJECT_DIR"
    git add reports/Playground-Report.html reports/playground-runs.json reports/playground-today-summary.json 2>/dev/null || true
    if git diff --staged --quiet; then
      echo "   ℹ️  No new dashboard files to commit (will push existing commits if any)" | tee -a "$LOG_FILE"
    else
      COMMIT_MSG="Dashboard update — ${DATE} $(date +%H:%M)"
      git commit -m "$COMMIT_MSG" | tee -a "$LOG_FILE"
    fi
    if git push origin main 2>&1 | tee -a "$LOG_FILE"; then
      echo "   ✅ Dashboard pushed to GitHub — Pages will update in ~1–2 min" | tee -a "$LOG_FILE"
      echo "   🔗 https://yamini-pal-singh.github.io/playground-testing/Playground-Report.html" | tee -a "$LOG_FILE"
    else
      echo "   ❌ git push failed — live dashboard NOT updated (check GitHub auth on this Mac)" | tee -a "$LOG_FILE"
      echo "   💡 Push as yamini-pal-singh: cd $PROJECT_DIR && git push origin main" | tee -a "$LOG_FILE"
      exit 1
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
