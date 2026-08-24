#!/usr/bin/env bash
# Stop all Playground daily test runner processes for this project.
# Usage: npm run test:playground-daily:stop

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

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

PIDS=""
COUNT=0
while IFS= read -r pid; do
  [ -n "$pid" ] || continue
  PIDS="$PIDS $pid"
  COUNT=$((COUNT + 1))
done <<EOF
$(pgrep -f "$PROJECT_DIR/scripts/run-playground-daily.sh" 2>/dev/null || true)
EOF

if [ "$COUNT" -eq 0 ]; then
  echo "No playground daily runners found for this project."
  exit 0
fi

echo "Stopping $COUNT daily runner(s)..."
for pid in $PIDS; do
  echo "  PID $pid"
  _kill_tree "$pid" TERM
done
sleep 2
for pid in $PIDS; do
  _kill_tree "$pid" KILL
done
pkill -f "$PROJECT_DIR/node_modules/.bin/playwright test src/tests" 2>/dev/null || true

echo "Done. Verify with: npm run test:playground-daily:status"
