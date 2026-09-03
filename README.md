# Shunya Labs AI Playground — QA Test Automation Suite

Enterprise-grade end-to-end and API test automation framework for the **Shunya Labs AI Playground** and speech microservices platform. Built with **Playwright**, **TypeScript**, **Google Sheets API v4**, and custom executive stakeholder analytics.

---

## 🌟 Overview & Capabilities

This repository provides full-stack automated regression, health monitoring, and performance benchmarking for Shunya Labs' Speech-to-Text (STT) and Text-to-Speech (TTS) ecosystems across **151 verified test cases**.

* **ASR Model Matrix**: Exhaustive coverage across `zero-indic` (55+ Indic languages), `zero-codeswitch` (Hinglish conversational audio), and `zero-medasr` (clinical and medical consultations).
* **Audio Intelligence Features**: Full validation for Translation, Transliteration, Speaker Diarization, Speaker Identification, Word Timestamps, Profanity Hashing, Custom Keyword Hashing, Intent Detection, Sentiment Analysis, Emotion Diarization, Summarisation, and Keyword Normalisation.
* **TTS Speech Synthesis**: Multi-language, multi-voice (`Meera (Maithili)` [Female Indic], `Rajesh (Hindi)` [Male Indic], `Standard Oriental`, `Standard Universal`), variable speed (0.5x – 2.0x), and format validation (`mp3`, `wav`).
* **Live Google Sheets Synchronization**: Automated real-time streaming of test execution runs to Google Sheets with run summary cards, status chips, and contextual dataset metadata.
* **Executive Stakeholder Dashboard**: Visual, responsive HTML dashboard with KPI cards, latency SLA tracking, and interactive calendar filtering.

---

## 🏗️ Architecture & Project Structure

```
playground-testing/
├── src/
│   ├── config/                      # API endpoints, credentials, and test configurations
│   ├── tests/
│   │   ├── ui/                      # Playwright UI Suite (Chromium + Persistent StorageState)
│   │   │   ├── layoutAndNav.spec.ts          # Navbars, tabs, credits counter, banners, viewports
│   │   │   ├── sttConfigAndModels.spec.ts    # Model selectors, 55+ languages, auto-detect
│   │   │   ├── sttUploadAndPlayer.spec.ts    # File uploads (.wav, .mp3, .m4a), player controls
│   │   │   ├── sttFeatures.spec.ts           # 12 intelligence features (individual & combined)
│   │   │   ├── sttOutputActions.spec.ts      # Transcript/JSON view, copy clipboard, file download
│   │   │   ├── ttsSynthesisUI.spec.ts        # TTS text, voice/speed controls, audio playback
│   │   │   ├── uiNegativeAndEdge.spec.ts     # Modals, toasts, tooltips, responsive wrapping, XSS
│   │   │   └── playgroundUI.spec.ts          # Master UI regression integration
│   │   │
│   │   └── backend/                 # Pure HTTP Microservice API Suite (Playwright Request Context)
│   │       ├── health.spec.ts                # ASR & TTS /health checks, latency SLAs (<2000ms)
│   │       ├── transcriptionModels.spec.ts   # POST /v1/audio/transcriptions (Indic, Codeswitch, Med)
│   │       ├── transcriptionFeatures.spec.ts # Direct feature parameters & combined payloads
│   │       ├── transcriptionNegative.spec.ts # 401 Unauthorized, corrupted byte streams, 0-byte
│   │       └── speechSynthesis.spec.ts       # POST /v1/audio/speech (Voices, speeds, formats)
│   │
│   └── utils/
│       ├── playgroundSheetWriter.ts # Google Sheets v4 writer, custom styling, 13-column schema
│       └── ...
│
├── scripts/
│   ├── playwright-sheet-reporter.ts         # Custom Playwright reporter (runs after every test execution)
│   ├── record-test-run-to-sheet.ts          # Standalone execution sync runner for Google Sheets
│   ├── populate-exhaustive-master-sheet.ts  # Master test definition generator (151 cases)
│   ├── generate-stakeholder-dashboard.ts    # Executive Stakeholder HTML dashboard generator
│   └── send-playground-email.ts             # Automated test run email dispatcher
│
├── input/                                   # Real benchmark audio datasets & test fixtures
│   ├── indicvoices_data/                    # Standardized Indic language audio samples
│   ├── CodeSwitchvoices_data/               # Hinglish mixed conversational audio
│   ├── Medical_Keyterm_Correction/          # Clinical medical consultations (General Physician, MSE)
│   ├── speaker_diarization/                 # Multi-speaker debate recordings
│   └── audio/edge/                          # Edge test files (silence.wav, short.wav, corrupted.wav, empty.wav)
│
├── reports/                                 # Generated HTML reports and structured JSON history
│   ├── Stakeholder-Dashboard.html           # High-polish executive web dashboard
│   ├── Playground-Report.html               # Technical QA run report
│   └── playground-runs.json                 # Historical test execution time-series data
│
└── playwright.config.ts                     # Playwright configuration, projects, and reporter setup
```

---

## 📊 Live Google Sheets Reporting Schema

Every automated test run logs execution data directly to the Google Output Sheet using a **13-column layout**:

| Column # | Column Name | Description |
| :---: | :--- | :--- |
| **A** | `Test Case ID` | Canonical identifier (e.g., `TC-STT-MOD-001`, `TC-FEAT-API-003`, `TC-EDGE-012`) |
| **B** | `Date` | Local execution date formatted as `DD-MM-YYYY` (e.g., `25-08-2026`) |
| **C** | `Module / Category` | Distinct module with soft pastel color coding |
| **D** | `Feature` | Specific feature tested with lavender badge styling |
| **E** | `Scenario Description` | Complete scenario objective and assertion details |
| **F** | `Audio / Input Payload` | Actual dataset path (`input/...`) or TTS prompt (`—` for non-applicable) |
| **G** | `Language` | Target language name (`Hindi`, `Hinglish`, `Tamil`, `English (Medical)`, or `—`) |
| **H** | `Lang Code` | ISO language code (`hi`, `auto`, `ta`, `en`, or `—`) |
| **I** | `Status (PASS/FAIL)` | Interactive dropdown chip (`PASS` in soft mint green, `FAIL` in soft rose) |
| **J** | `Failure Reason` | Highlighted error message when assertions fail |
| **K** | `Latency (ms)` | End-to-end execution duration in milliseconds |
| **L** | `API Response Preview` | HTTP status code and response payload summary snippet |
| **M** | `Timestamp` | Local timestamp formatted as `DD-MM-YYYY HH:mm:ss` |

---

## 🚀 Getting Started

### 1. Prerequisites
* **Node.js**: v18.0.0 or higher
* **npm**: v9.0.0 or higher

### 2. Installation
```bash
git clone https://github.com/Shunyalabsai/shunya-playground-qa-automation.git
cd shunya-playground-qa-automation
npm install
npx playwright install --with-deps chromium
```

### 3. Environment Variables
Create a `.env` file in the root directory:
```env
# Backend API Endpoints & Auth
ASR_BASE_URL=https://asrv2prod.shunyalabs.ai
TTS_BASE_URL=https://ttsv2.shunyalabs.ai
PLAYGROUND_BASE_URL=https://playground.shunyalabs.ai
ASR_API_KEY=your_shunya_api_key_here

# Google Sheets Reporting
GOOGLE_SERVICE_ACCOUNT_JSON=./Google_service_account.json
GOOGLE_SHEET_ID_PLAYGROUND_OUTPUT=11leUutfqP4OXyIIaeTYqw_3gWc1w5fQLnQWuUHXPgW4
GOOGLE_SHEET_ID_MASTER_INPUT=1KWWMQN3ppFfux1mP8Wb34UmtrIEXhz2T6_1_goXI8JI

# Automated Email Notifications (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
REPORT_RECIPIENTS=team@shunyalabs.ai
```

---

## 🧪 Test Execution Commands

### Execute Test Suites
```bash
# Run both UI and Backend API suites (Full Regression)
npm run test:all

# Run UI Browser Suite only
npm run test:ui

# Run Backend API Suite only
npm run test:backend

# Run Microservice Health Checks
npm run test:health

# Run in Interactive Headed Mode (for visual debugging)
npm run test:headed

# Run with Playwright Debug Inspector
npm run test:debug
```

### Reporting & Synchronization
```bash
# Sync latest execution results to Google Output Sheet
npm run sheet:record-run

# Re-generate Executive Stakeholder Dashboard
npm run dashboard:generate

# Open Stakeholder Dashboard in browser
npm run dashboard:open

# Generate and view detailed technical QA HTML report
npm run report:playground:open
```

---

## 📈 Executive Stakeholder Dashboard

The dashboard provides leadership and stakeholders with clear, actionable insights:
* **KPI Header Cards**: Real-time pass rate, total runs executed, engine uptime, and latency benchmarks.
* **Filterable Test Explorer**: Search by Test ID, Model, Feature, or Scenario type.
* **Historical Trend Analysis**: Execution logs across previous test runs.
* **Direct Google Sheets Link**: Quick access to live Google Sheet records for granular audit trails.

To generate the dashboard locally:
```bash
npm run dashboard:generate
open reports/Stakeholder-Dashboard.html
```

---

## 🛡️ License

Proprietary — © Shunya Labs AI. All rights reserved.
