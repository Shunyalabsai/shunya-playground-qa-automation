#!/bin/bash
# Runs on Mac every 2h — refreshes auth and pushes to server
cd ~/Playground_repo/playground-testing
PLAYGROUND_LOGIN_DEBUG=1 npx ts-node scripts/refresh-playground-auth.ts
scp auth/playground-auth.json yamini@136.119.127.72:~/projects/playground-testing/auth/
echo "✅ Auth synced to server: $(date)"
