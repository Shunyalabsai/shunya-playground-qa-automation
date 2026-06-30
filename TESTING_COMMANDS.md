## Playground Testing — Auth & Test Commands

Step-by-step guide to **set up auth** and **run tests** on your Mac and on the server.

---

### Quick reference — where to run each command

| Task | Run on | Directory |
|------|--------|-----------|
| Log in & save auth (browser) | **Mac** | `~/Playground_repo/playground-testing` |
| Verify auth | **Mac or server** | see above / `~/projects/playground-testing` |
| Copy auth to server (`scp`) | **Mac only** | `~/Playground_repo/playground-testing` |
| Refresh auth with Gmail OTP | **Mac or server** | same as above |
| Run UI tests | **Mac or server** | same as above |

**Important paths**

- Mac project: `~/Playground_repo/playground-testing`
- Server project: `~/projects/playground-testing`
- Auth file (both): `auth/playground-auth.json`
- Server SSH: `yamini@136.119.127.72`

**Do not run `scp` from the server.** If your prompt is `yamini@shunya-cpu-01`, you are already on the server — use Option B below instead.

---

### Option A — Test on Mac (full walkthrough)

#### Step 1 — One-time setup (first time only)

```bash
cd ~/Playground_repo/playground-testing
npm install
npx playwright install chromium
```

#### Step 2 — Log in and save auth

```bash
cd ~/Playground_repo/playground-testing
npm run playground:login
```

- A browser opens → sign in to playground.shunyalabs.ai
- Wait until you see **API Playground**
- Auth is saved to `auth/playground-auth.json`

#### Step 3 — Verify auth on Mac

```bash
cd ~/Playground_repo/playground-testing
npm run playground:verify-auth
```

Expected output:

```
✅ Auth OK — safe to run UI tests.
```

If you see `❌ Auth NOT valid`, repeat Step 2.

#### Step 4 — Run tests on Mac

```bash
cd ~/Playground_repo/playground-testing

# Full UI suite
npm run test:playground-ui

# UI + backend
npm run test:playground-all

# Single test group (example)
npx playwright test src/tests/playgroundUI.spec.ts \
  --project=playground-ui \
  -g 'TTS Configuration'
```

---

### Option B — Test on server (copy auth from Mac)

Use this when you want to run tests on the server but log in from your Mac.

#### Step 1 — On Mac: refresh auth and verify

```bash
cd ~/Playground_repo/playground-testing
npm run playground:login          # or: npm run playground:refresh-auth
npm run playground:verify-auth      # must show ✅ before copying
```

#### Step 2 — On Mac: copy auth to server

Run this in a **Mac terminal** (not while SSH'd into the server):

```bash
cd ~/Playground_repo/playground-testing
scp auth/playground-auth.json yamini@136.119.127.72:~/projects/playground-testing/auth/
```

#### Step 3 — On server: verify auth

SSH into the server, then:

```bash
cd ~/projects/playground-testing
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

npm run playground:verify-auth
```

Expected: `✅ Auth OK — safe to run UI tests.`

Check the file was updated:

```bash
ls -la auth/playground-auth.json
```

The date should be recent (not weeks old).

#### Step 4 — On server: run tests

```bash
cd ~/projects/playground-testing
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

npm run test:playground-ui
# or
npm run test:playground-all
```

---

### Option C — Refresh auth directly on server (no Mac copy)

Use this when you are already on the server and have Gmail OTP set up in `.env`.

#### Step 1 — Ensure `.env` exists on the server

```bash
cd ~/projects/playground-testing
cat .env   # should contain:
```

```bash
PLAYGROUND_EMAIL=you@example.com
GMAIL_APP_PASSWORD=your-16-char-google-app-password
```

#### Step 2 — Refresh and verify (headless)

```bash
cd ~/projects/playground-testing
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

npm run playground:refresh-auth
npm run playground:verify-auth
```

#### Step 3 — Run tests

```bash
npm run test:playground-ui
```

#### If headless refresh fails — use virtual display

```bash
sudo apt-get update
sudo apt-get install -y xvfb

cd ~/projects/playground-testing
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

xvfb-run -a PLAYGROUND_LOGIN_DEBUG=1 npm run playground:refresh-auth
npm run playground:verify-auth
```

---

### Auth commands reference

#### Mac — manual login (headed browser)

```bash
cd ~/Playground_repo/playground-testing
npm run playground:login
```

#### Mac or server — verify auth

```bash
npm run playground:verify-auth
```

#### Mac or server — automated OTP refresh (needs `.env`)

```bash
npm run playground:refresh-auth

# headed debug (Mac, or server with xvfb-run)
PLAYGROUND_LOGIN_DEBUG=1 npm run playground:refresh-auth
```

---

### Scheduled runs

#### Mac — launchd (every 3 hours)

```bash
cd ~/Playground_repo/playground-testing

npm run schedule:playground:install      # install schedule
npm run test:playground-daily:status     # check progress
npm run test:playground-daily            # run manually
npm run test:playground-daily:stop       # stop stuck runners
```

Mac auth sync to server (automated script):

```bash
# scripts/mac-auth-sync.sh — runs on Mac, refreshes auth + scp to server
```

#### Server — cron pipeline

Runs at 08:30, 11:30, 14:30, 17:30, 20:30, 23:30 server time.

```bash
cd ~/projects/playground-testing

bash scripts/server-run.sh --install     # install cron
bash scripts/server-run.sh --uninstall   # remove cron
bash scripts/server-run.sh               # run full pipeline once
```

Logs:

```bash
tail -f logs/server-cron.log
tail -f logs/playground-daily-$(date +%Y-%m-%d).log
```

---

### Troubleshooting

#### 1. `Permission denied (publickey)` when running `scp`

You are probably on the **server**, not your Mac.

- `scp` must run **from your Mac** → server
- If already on the server, use **Option C** (`playground:refresh-auth`) instead

#### 2. `❌ Auth NOT valid for tests`

```bash
npm run playground:verify-auth
```

Common causes:

| Symptom | Fix |
|---------|-----|
| Auth file is weeks old | Re-login on Mac or run `playground:refresh-auth` |
| `__session cookie: yes` but still on sign-in | Session expired — refresh auth |
| Copied auth but server still fails | Copied to wrong path — use `~/projects/playground-testing/auth/` |
| Mac verify fails too | Auth is stale — run `npm run playground:login` on Mac |

Quick checks:

```bash
ls -la auth/playground-auth.json          # file exists? recent date?
npm run playground:verify-auth            # passes?
```

#### 3. Headless browser error on server

If you see: *"Looks like you launched a headed browser without having a XServer running"*

- Run without `PLAYGROUND_LOGIN_DEBUG=1`, or
- Wrap in `xvfb-run` (see Option C above)

#### 4. Which machine am I on?

```bash
hostname
```

- Mac → run `playground:login` and `scp`
- `shunya-cpu-01` → you are on the server; do **not** run `scp`

---

### Decision flow (pick your path)

```
Need to run tests?
│
├─ On Mac only?
│   └─ Option A (Steps 1–4)
│
└─ On server?
    │
    ├─ Have Mac handy?
    │   └─ Option B (login on Mac → scp → verify on server → run tests)
    │
    └─ Already on server / no Mac?
        └─ Option C (refresh-auth on server → verify → run tests)
```
