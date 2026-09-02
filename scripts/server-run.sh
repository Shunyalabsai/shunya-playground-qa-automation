#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# server-run.sh
#
# Server-side wrapper for run-playground-daily.sh
# Handles auth refresh automatically before running tests.
#
# Install cron:   bash scripts/server-run.sh --install
# Remove cron:    bash scripts/server-run.sh --uninstall
# Manual run:     bash scripts/server-run.sh
#
# Runs at: 04:00, 17:00 (4:00 AM and 5:00 PM everyday)
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"
CRON_LOG="$LOG_DIR/server-cron.log"

# ── Install cron job ─────────────────────────────────────────
if [ "$1" == "--install" ]; then
  mkdir -p "$LOG_DIR"
  CRON_LINE="0 4,17 * * * bash $SCRIPT_DIR/server-run.sh >> $CRON_LOG 2>&1"
  (crontab -l 2>/dev/null | grep -v "server-run.sh"; echo "$CRON_LINE") | crontab -
  echo "✅ Cron job installed on server!"
  echo ""
  echo "   Runs at : 04:00, 17:00 (4:00 AM and 5:00 PM server time everyday)"
  echo "   Log     : tail -f $CRON_LOG"
  echo "   Check   : crontab -l"
  echo "   Remove  : bash $SCRIPT_DIR/server-run.sh --uninstall"
  echo ""
  # Show current server time
  echo "   Server time now: $(date)"
  echo "   Next run at    : $(date -d 'next hour' '+%Y-%m-%d') 08:30 (if before 08:30)"
  exit 0
fi

# ── Remove cron job ──────────────────────────────────────────
if [ "$1" == "--uninstall" ]; then
  crontab -l 2>/dev/null | grep -v "server-run.sh" | crontab -
  echo "✅ Cron job removed from server."
  exit 0
fi

# ── Main pipeline ────────────────────────────────────────────
mkdir -p "$LOG_DIR"

# Load nvm so node/npm work in cron environment
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

cd "$PROJECT_DIR" || exit 1

echo ""
echo "════════════════════════════════════════════════════════"
echo "  Server run started: $(date)"
echo "════════════════════════════════════════════════════════"

# ── Step 1: Pull latest code ──────────────────────────────────

# ── Step 2: Strip short-lived Cloudflare cookies ──────────────
echo ""
echo "🔐 Preparing auth…"
python3 -c "
import json
with open('auth/playground-auth.json', 'r') as f:
    data = json.load(f)
data['cookies'] = [c for c in data['cookies'] if c['name'] not in ['__cf_bm', '_cfuvid']]
with open('auth/playground-auth.json', 'w') as f:
    json.dump(data, f, indent=2)
print(f'Auth ready — {len(data[\"cookies\"])} cookies kept')
"
echo "✅ Auth ready"

# ── Step 3: Run the full test pipeline ────────────────────────
echo ""
echo "🧪 Starting full test pipeline…"
bash scripts/run-playground-daily.sh 2>&1

echo ""
echo "════════════════════════════════════════════════════════"
echo "  Server run complete: $(date)"
echo "════════════════════════════════════════════════════════"
