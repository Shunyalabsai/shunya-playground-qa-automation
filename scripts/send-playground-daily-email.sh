#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Send ONE Playground QC email per calendar day (intended for ~8 PM local).
#
# Playground tests run every 3 hours without email. Install the launchd job:
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

  echo ""
  echo "── Regenerating dashboard (latest runs) ──"
  npx ts-node scripts/generate-playground-report.ts

  echo ""
  echo "── Sending email to all REPORT_EMAIL_TO recipients ──"
  PLAYGROUND_DAILY_EMAIL=1 npx ts-node scripts/send-playground-email.ts

  touch "$SENT_STAMP"
  echo ""
  echo "✅ Daily email complete. Stamp: $SENT_STAMP"
} 2>&1 | tee -a "$LOG_FILE"
