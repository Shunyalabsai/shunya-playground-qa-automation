#!/usr/bin/env bash
# Install launchd job: one Playground QC email per day at 8:00 PM local.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_SRC="$SCRIPT_DIR/com.shunyalabs.playground-daily-email.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.shunyalabs.playground-daily-email.plist"
LABEL="com.shunyalabs.playground-daily-email"

chmod +x "$SCRIPT_DIR/send-playground-daily-email.sh"

sed "s|REPLACE_PROJECT_DIR|$PROJECT_DIR|g" "$PLIST_SRC" > "$PLIST_DST"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/$LABEL"

echo "✅ Installed: $PLIST_DST"
echo "   Schedule: every day at 20:00 (8 PM) local time"
echo "   Command:  npm run email:playground:daily"
echo ""
echo "   Test now:  npm run email:playground:daily"
echo "   Uninstall: launchctl bootout gui/$(id -u)/$LABEL && rm \"$PLIST_DST\""
