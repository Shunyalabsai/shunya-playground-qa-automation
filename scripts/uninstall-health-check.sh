#!/usr/bin/env bash
# Stop and remove the 15-minute Playground health check on this Mac.
set -euo pipefail

LABEL="com.shunyalabs.playground-health"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"

echo "Unloading LaunchAgent: $LABEL..."
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$PLIST_DST" 2>/dev/null || true
rm -f "$PLIST_DST"
echo "Health check schedule removed from this Mac."
