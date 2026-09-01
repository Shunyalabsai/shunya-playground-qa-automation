# 🚀 Shunya Labs AI Playground — Complete Testing & Automation Commands Reference

This reference guide details all commands available in the test automation suite, categorized by execution intent, environment target, and reporting tools.

---

## 📌 Quick Summary Table

| What do you want to do? | Recommended Command | Duration / Scope |
| :--- | :--- | :--- |
| **P0 Smoke Sanity (Fast check)** | `npm run test:smoke` | ~30–60s (21 P0 Sanity checks) |
| **Smoke Backend API only** | `npm run test:smoke:api` | ~15–30s (11 API Sanity tests) |
| **Smoke UI only** | `npm run test:smoke:ui` | ~30–45s (10 UI Sanity tests) |
| **Full Regression Suite** | `npm run test:all` | ~5–10 min (280 Total test cases) |
| **All Backend API Tests** | `npm run test:backend` | ~2–4 min (97 API tests) |
| **All UI Tests** | `npm run test:ui` | ~4–8 min (183 UI tests) |
| **UI Tests with Live Browser** | `npm run test:headed` | Interactive UI visualization |
| **Open Stakeholder Dashboard** | `npm run dashboard:open` | Opens `reports/Stakeholder-Dashboard.html` |
| **Sync Google Smoke Tab** | `npm run sheet:smoke` | Populates `"Smoke test cases"` tab |
| **Sync Google Regression Tab** | `npm run sheet:populate-input` | Populates `"Master Test Cases"` tab |

---

## 1. 🔥 Smoke Testing Commands (Fast P0 Sanity)

> **When to run:**
> - Immediately after a new deployment or hotfix.
> - Before starting manual QA exploratory sessions.
> - In CI/CD Pull Request pipelines as a fast pre-merge gate.
> - First morning health check of the day.

```bash
# Run ALL Smoke Tests (11 Backend API + 10 UI = 21 P0 Tests)
npm run test:smoke

# Run Smoke Backend API Only (Health check, JWT Auth exchange, Core STT & TTS models)
npm run test:smoke:api

# Run Smoke UI Only (Playground navigation, Model tabs, Waveform player, Synthesis CTA)
npm run test:smoke:ui
```

---

## 2. 🧪 Full Regression Testing Commands (Comprehensive 280 Tests)

> **When to run:**
> - Nightly scheduled automation runs.
> - Major feature releases and sprint regression cycles.
> - Prior to production sign-off.

```bash
# Run the COMPLETE Test Suite (All 280 UI + Backend API tests)
npm run test:all

# Run all Backend API tests (97 tests covering STT Models, 12 Features, TTS, Negative & Security)
npm run test:backend

# Run all UI tests (183 tests across Layout, Models, 55+ Languages, Audio Upload, Features & Output)
npm run test:ui

# Run only Backend Microservice Health & Latency SLA Checks
npm run test:health
```

---

## 3. 🖥️ Interactive & Debugging Commands

> **When to run:**
> - Writing new tests or debugging failing selectors/locators.
> - Visually observing browser actions.

```bash
# Run UI tests with headed browser visible on screen
npm run test:headed

# Open Playwright Interactive Debugger with step-by-step execution & DOM inspector
npm run test:debug
```

---

## 4. 📊 Dashboard & Reporting Commands

> **When to run:**
> - Presenting test execution results, pass rates, and latency metrics to stakeholders.

```bash
# Generate and open the dark-neon Stakeholder Dashboard in your default browser
npm run dashboard:open

# Regenerate Stakeholder Dashboard without opening browser
npm run dashboard:generate

# Generate and open the technical Playground QC report
npm run report:playground:open
```

---

## 5. 📈 Google Sheets Sync & Management Commands

> **When to run:**
> - Updating the live Google Spreadsheet (`1KWWMQN3ppFfux1mP8Wb34UmtrIEXhz2T6_1_goXI8JI`) with structured test cases and formatting.

```bash
# Populate/Update the dedicated "Smoke test cases" worksheet tab
npm run sheet:smoke

# Populate/Update the comprehensive "Master Test Cases" worksheet tab
npm run sheet:populate-input

# Record live test execution results to Google Output Sheet
npm run sheet:record-run
```

---

## 6. 🔐 Authentication & Session Utilities

> **When to run:**
> - Setting up or refreshing Playwright browser `storageState` authentication cookies.

```bash
# Perform manual/interactive login and save session state
npm run playground:login

# Verify if saved session state is valid and active
npm run playground:verify-auth

# Refresh expired session tokens
npm run playground:refresh-auth
```

---

## 7. ⏰ Daily Automation & Scheduled Email Digest

> **When to run:**
> - Setting up or monitoring automated daily test schedules and email reports.

```bash
# Check status of daily automated batch runs
npm run test:playground-daily:status

# Stop/Cancel currently running daily batch job
npm run test:playground-daily:stop

# Send immediate test execution summary email
npm run email:playground
```
