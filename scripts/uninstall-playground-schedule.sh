#!/usr/bin/env bash
# Unload and remove macOS LaunchAgent for Playground UI tests.
# Use this when using Google Apps Script / GitHub Actions as the primary scheduler
# to prevent duplicate runs on the dashboard.
set -euo pipefail

LABEL="com.shunyalabs.playground-testing"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"

echo "Unloading LaunchAgent: $LABEL..."
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$PLIST_DST" 2>/dev/null || true

if [ -f "$PLIST_DST" ]; then
  rm -f "$PLIST_DST"
  echo "Removed: $PLIST_DST"
fi

echo "✅ LaunchAgent uninstalled successfully."
echo "ℹ️  Google Apps Script (Cloud) is now the sole scheduler to prevent duplicate runs."
