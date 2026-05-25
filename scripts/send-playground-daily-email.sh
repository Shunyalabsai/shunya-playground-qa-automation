#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Send ONE Playground QC email per calendar day (intended for ~8 PM local).
#
# Playground tests run in a daily back-to-back batch without email. Install the launchd job:
#   bash scripts/install-playground-daily-email.sh
#
# Manual send (latest run of the day):
#   npm run email:playground:daily
#
# Force resend if already sent today:
#   FORCE=1 npm run email:playground:daily
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

DATE="$(date '+%Y-%m-%d')"
LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/playground-email-$DATE.log"
SENT_STAMP="$LOG_DIR/.playground-email-sent-$DATE"

if [ -f "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1090
  source "$NVM_DIR/nvm.sh"
  nvm use default >> "$LOG_FILE" 2>&1 || true
fi
export PATH="/usr/local/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)/bin:$PATH"

{
  echo "════════════════════════════════════════════════════════════"
  echo "  Playground Daily Email — $(date '+%Y-%m-%d %H:%M:%S')"
  echo "════════════════════════════════════════════════════════════"

  if [ -f "$SENT_STAMP" ] && [ "${FORCE:-0}" != "1" ]; then
    echo "ℹ️  Email already sent today ($DATE). Stamp: $SENT_STAMP"
    echo "   Use FORCE=1 to send again."
    exit 0
  fi

  # Today-only quiet mode: no mail until 8 PM (see logs/.email-only-at-8pm-date)
  QUIET_FILE="$LOG_DIR/.email-only-at-8pm-date"
  QUIET_SCRIPT="$SCRIPT_DIR/.playground-email-quiet-today"
  QUIET_DATE=""
  if [ -f "$QUIET_FILE" ]; then
    QUIET_DATE="$(tr -d '[:space:]' < "$QUIET_FILE")"
  elif [ -f "$QUIET_SCRIPT" ]; then
    QUIET_DATE="$(tr -d '[:space:]' < "$QUIET_SCRIPT")"
  fi
  if [ -n "$QUIET_DATE" ] && [ "$QUIET_DATE" = "$DATE" ]; then
    HOUR="$(date +%H)"
    if [ "$HOUR" -lt 20 ] && [ "${FORCE:-0}" != "1" ]; then
      echo "ℹ️  Quiet mode for $DATE — no email until 8 PM digest (REPORT_EMAIL_DAILY_TO only)."
      echo "   (Remove $QUIET_FILE or $QUIET_SCRIPT to cancel.)"
      exit 0
    fi
  fi

  echo ""
  echo "── Regenerating dashboard (latest runs) ──"
  npx tsx scripts/generate-playground-report.ts

  echo ""
  echo "── Sending 8 PM digest (REPORT_EMAIL_DAILY_TO only, not full team list) ──"
  PLAYGROUND_DAILY_EMAIL=1 npx tsx scripts/send-playground-email.ts

  touch "$SENT_STAMP"
  echo ""
  echo "✅ Daily email complete. Stamp: $SENT_STAMP"
} 2>&1 | tee -a "$LOG_FILE"
