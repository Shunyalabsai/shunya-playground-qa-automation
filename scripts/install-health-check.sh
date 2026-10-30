#!/usr/bin/env bash
# Install the 15-minute Playground health check using the current project copy.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LABEL="com.shunyalabs.playground-health"
PLIST_SRC="$SCRIPT_DIR/com.shunyalabs.playground-health.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$PROJECT_DIR/logs" "$HOME/Library/LaunchAgents"
chmod +x "$SCRIPT_DIR/run-health-check.sh"

sed -e "s|REPLACE_PROJECT_DIR|$PROJECT_DIR|g" -e "s|REPLACE_HOME|$HOME|g" \
  "$PLIST_SRC" > "$PLIST_DST"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST" 2>/dev/null || launchctl load "$PLIST_DST"

echo "Installed: $PLIST_DST"
echo "Schedule: every 15 minutes"
echo "Script:   $PROJECT_DIR/scripts/check-api-health.ts"
echo "Logs:     $PROJECT_DIR/logs/health-check.log"
