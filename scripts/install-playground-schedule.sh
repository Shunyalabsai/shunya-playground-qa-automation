#!/usr/bin/env bash
# Install or reload the macOS LaunchAgent for scheduled Playground UI tests.
# Schedule: once daily at 02:30 — 8 back-to-back runs (see run-and-email.sh).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LABEL="com.shunyalabs.playground-testing"
PLIST_SRC="$SCRIPT_DIR/com.shunyalabs.playground-testing.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"

chmod +x "$SCRIPT_DIR/run-and-email.sh" "$SCRIPT_DIR/run-playground-daily.sh"

sed -e "s|REPLACE_PROJECT_DIR|$PROJECT_DIR|g" -e "s|REPLACE_HOME|$HOME|g" \
  "$PLIST_SRC" > "$PLIST_DST"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST" 2>/dev/null || launchctl load "$PLIST_DST"

echo "Installed: $PLIST_DST"
echo "Schedule: 02:30 daily — 8 runs back-to-back until batch completes (local time)"
echo "Logs: $PROJECT_DIR/logs/launchd-playground.log"
echo "Status: npm run test:playground-daily:status"
