/**
 * Script: populate-smoke-test-sheet.ts
 * Description: Generates and populates the dedicated "Smoke test cases" tab
 *              in the Google Master Sheet (1KWWMQN3ppFfux1mP8Wb34UmtrIEXhz2T6_1_goXI8JI)
 *              with 21 core P0 Smoke Test Cases (11 Backend API + 10 UI).
 */

import { google } from 'googleapis';
import * as path from 'path';
import { DeepTestCase } from './populate-exhaustive-master-sheet';

const SPREADSHEET_ID = '1KWWMQN3ppFfux1mP8Wb34UmtrIEXhz2T6_1_goXI8JI';
const KEY_FILE_PATH = path.resolve(__dirname, '../Google_service_account.json');
const TAB_NAME = 'Smoke test cases';

const HEADERS = [
  'Test Case ID',
  'Module / Category',
  'Suite Type',
  'Scenario Type',
  'Test Title',
  'Description / Objective',
  'Model',
  'Language Code',
  'Language Name',
  'Feature(s) Enabled',
  'Feature Parameters / Config Payload',
  'Audio File Path / Input URL',
  'TTS Input Text (Native Script)',
  'ShunyaLabs Translated Output (English Translation)',
  'TTS Voice & Speed / Format / Mode',
  'Preconditions',
  'Test Steps',
  'Expected Output / Result',
  'Expected Status / UI State',
  'Priority',
  'Automation Status',
];

export function generateSmokeTestCases(): DeepTestCase[] {
  return [
    // ── Backend API Smoke Test Cases (11 Scenarios) ──────────────────────────
    {
      id: 'SMOKE-API-001',
      module: 'Backend API - Health Checks',
      suite: 'Backend API',
      scenarioType: 'Positive',
      title: 'ASR Microservice Health Check (GET /health)',
      description: 'Verify ASR microservice responds with HTTP 200 OK and status healthy within 2000ms latency SLA',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      translatedText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'ASR microservice online at https://asrv2prod.shunyalabs.ai',
      testSteps: '1. Send GET /health request\n2. Assert response status HTTP 200 OK\n3. Assert latency < 2000ms',
      expectedResult: 'HTTP 200 OK; response body contains status: "healthy" and latency < 2000ms',
      expectedStatus: 'HTTP 200 OK',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: 'SMOKE-API-002',
      module: 'Backend API - Health Checks',
      suite: 'Backend API',
      scenarioType: 'Positive',
      title: 'TTS Microservice Health Check (GET /health)',
      description: 'Verify TTS speech synthesis microservice responds with HTTP 200 OK and latency < 2000ms',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      translatedText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'TTS microservice online at https://ttsv2.shunyalabs.ai',
      testSteps: '1. Send GET /health request to TTS endpoint\n2. Assert HTTP 200 OK\n3. Assert latency < 2000ms',
      expectedResult: 'HTTP 200 OK; TTS service is healthy and reachable',
      expectedStatus: 'HTTP 200 OK',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: 'SMOKE-API-003',
      module: 'Backend API - Authentication & Session',
      suite: 'Backend API',
      scenarioType: 'Positive',
      title: 'JWT Authentication Token Exchange (POST /auth/token)',
      description: 'Verify valid API credentials successfully exchange for a signed JWT bearer token',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'Auth Token',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      translatedText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Valid ASR_API_KEY configured in environment',
      testSteps: '1. Send POST /auth/token with valid API credentials\n2. Assert HTTP 200 OK\n3. Assert access_token returned',
      expectedResult: 'HTTP 200 OK; signed JWT bearer token string returned',
      expectedStatus: 'HTTP 200 OK',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: 'SMOKE-API-004',
      module: 'Backend API - STT Transcription Models',
      suite: 'Backend API',
      scenarioType: 'Positive',
      title: 'STT Core Model — zero-indic Transcription Sanity',
      description: 'Verify zero-indic accurately transcribes standard Hindi audio (37.mp3)',
      model: 'zero-indic',
      languageCode: 'hi',
      languageName: 'Hindi',
      featuresEnabled: 'Basic Transcription',
      featureConfig: JSON.stringify({ model: 'zero-indic', language_code: 'hi' }),
      audioPath: 'input/indicvoices_data/audio/Hindi/37.mp3',
      ttsInputText: 'N/A',
      translatedText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Valid Bearer auth token; sample Hindi audio file available',
      testSteps: '1. POST /v1/audio/transcriptions with file and model: zero-indic\n2. Assert HTTP 200 OK\n3. Assert non-empty text in JSON response',
      expectedResult: 'HTTP 200 OK; accurate Hindi transcription text and segment timestamps returned',
      expectedStatus: 'HTTP 200 OK',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: 'SMOKE-API-005',
      module: 'Backend API - STT Transcription Models',
      suite: 'Backend API',
      scenarioType: 'Positive',
      title: 'STT Codeswitch Model — zero-codeswitch Hinglish Sanity',
      description: 'Verify zero-codeswitch transcribes code-mixed Hinglish audio without errors',
      model: 'zero-codeswitch',
      languageCode: 'hi-en',
      languageName: 'Hinglish',
      featuresEnabled: 'Codeswitch Transcription',
      featureConfig: JSON.stringify({ model: 'zero-codeswitch' }),
      audioPath: 'input/indicvoices_data/audio/Hindi/37.mp3',
      ttsInputText: 'N/A',
      translatedText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Valid Bearer auth token',
      testSteps: '1. POST /v1/audio/transcriptions with model: zero-codeswitch\n2. Assert HTTP 200 OK\n3. Verify JSON payload containing transcript',
      expectedResult: 'HTTP 200 OK; code-mixed Hinglish transcript text returned',
      expectedStatus: 'HTTP 200 OK',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: 'SMOKE-API-006',
      module: 'Backend API - STT Transcription Models',
      suite: 'Backend API',
      scenarioType: 'Positive',
      title: 'STT Medical Model — zero-medasr Clinical Sanity',
      description: 'Verify zero-medasr transcribes clinical terminology and diagnosis audio',
      model: 'zero-medasr',
      languageCode: 'en',
      languageName: 'English',
      featuresEnabled: 'Medical ASR Transcription',
      featureConfig: JSON.stringify({ model: 'zero-medasr' }),
      audioPath: 'input/indicvoices_data/audio/Hindi/37.mp3',
      ttsInputText: 'N/A',
      translatedText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Valid Bearer auth token',
      testSteps: '1. POST /v1/audio/transcriptions with model: zero-medasr\n2. Assert HTTP 200 OK\n3. Verify clinical transcription text',
      expectedResult: 'HTTP 200 OK; medical terminology and clinical text transcribed',
      expectedStatus: 'HTTP 200 OK',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: 'SMOKE-API-007',
      module: 'Backend API - Intelligence Feature Matrix',
      suite: 'Backend API',
      scenarioType: 'Positive',
      title: 'STT Audio Intelligence — Translation & Word Timestamps',
      description: 'Verify enabling translation=true and timestamps=true returns translated output and word offsets',
      model: 'zero-indic',
      languageCode: 'hi',
      languageName: 'Hindi',
      featuresEnabled: 'Translation, Timestamps',
      featureConfig: JSON.stringify({ model: 'zero-indic', language_code: 'hi', translation: 'true', timestamps: 'true' }),
      audioPath: 'input/indicvoices_data/audio/Hindi/37.mp3',
      ttsInputText: 'N/A',
      translatedText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Valid Bearer auth token',
      testSteps: '1. POST /v1/audio/transcriptions with translation=true, timestamps=true\n2. Assert HTTP 200 OK\n3. Verify translated_text and words array in JSON',
      expectedResult: 'HTTP 200 OK; JSON payload contains translated text and word-level start/end offsets',
      expectedStatus: 'HTTP 200 OK',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: 'SMOKE-API-008',
      module: 'Backend API - TTS Speech Synthesis',
      suite: 'Backend API',
      scenarioType: 'Positive',
      title: 'TTS Core Synthesis — zero-indic (Hindi & English)',
      description: 'Verify direct POST /v1/audio/speech with model zero-indic synthesizes Hindi text into MP3 audio',
      model: 'zero-indic',
      languageCode: 'hi',
      languageName: 'Hindi',
      featuresEnabled: 'TTS Speech Synthesis',
      featureConfig: JSON.stringify({ model: 'zero-indic', input: 'नमस्ते, शून्या लैब्स एआई वॉइस प्लेटफ़ॉर्म में आपका स्वागत है।', voice: 'shunya-female-1', speed: 1.0, response_format: 'mp3' }),
      audioPath: 'N/A',
      ttsInputText: 'नमस्ते, शून्या लैब्स एआई वॉइस प्लेटफ़ॉर्म में आपका स्वागत है।',
      translatedText: 'Hello, welcome to the Shunya Labs AI voice platform.',
      ttsVoiceAndSpeed: 'Model: zero-indic | Voice: shunya-female-1 | Speed: 1.0x | Format: mp3',
      preconditions: 'Valid API Key; TTS microservice online',
      testSteps: '1. POST /v1/audio/speech with Hindi text and model: zero-indic\n2. Assert HTTP 200 OK\n3. Assert binary audio byte length > 0',
      expectedResult: 'HTTP 200 OK; audio/mpeg binary payload generated successfully',
      expectedStatus: 'HTTP 200 OK',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: 'SMOKE-API-009',
      module: 'Backend API - TTS Speech Synthesis',
      suite: 'Backend API',
      scenarioType: 'Positive',
      title: 'TTS Model — zero-oriental Synthesis (Japanese: ja)',
      description: 'Verify zero-oriental synthesizes Japanese native characters into audio without errors',
      model: 'zero-oriental',
      languageCode: 'ja',
      languageName: 'Japanese',
      featuresEnabled: 'TTS Speech Synthesis',
      featureConfig: JSON.stringify({ model: 'zero-oriental', input: 'こんにちは、Shunya Labsの音声合成テストです。', voice: 'shunya-female-1', speed: 1.0, response_format: 'mp3' }),
      audioPath: 'N/A',
      ttsInputText: 'こんにちは、Shunya Labsの音声合成テストです。',
      translatedText: 'Hello, this is a speech synthesis test from Shunya Labs.',
      ttsVoiceAndSpeed: 'Model: zero-oriental | Voice: shunya-female-1 | Speed: 1.0x | Format: mp3',
      preconditions: 'Valid API Key; TTS microservice online',
      testSteps: '1. POST /v1/audio/speech with Japanese text and model: zero-oriental\n2. Assert HTTP 200 OK\n3. Assert binary payload',
      expectedResult: 'HTTP 200 OK; Japanese speech audio generated successfully',
      expectedStatus: 'HTTP 200 OK',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: 'SMOKE-API-010',
      module: 'Backend API - TTS Speech Synthesis',
      suite: 'Backend API',
      scenarioType: 'Positive',
      title: 'TTS Model — zero-universal Synthesis (Spanish: es)',
      description: 'Verify zero-universal synthesizes Spanish text into MP3 audio without errors',
      model: 'zero-universal',
      languageCode: 'es',
      languageName: 'Spanish',
      featuresEnabled: 'TTS Speech Synthesis',
      featureConfig: JSON.stringify({ model: 'zero-universal', input: 'Bienvenido a la plataforma de síntesis de voz de Shunya Labs.', voice: 'shunya-female-1', speed: 1.0, response_format: 'mp3' }),
      audioPath: 'N/A',
      ttsInputText: 'Bienvenido a la plataforma de síntesis de voz de Shunya Labs.',
      translatedText: 'Welcome to the speech synthesis platform of Shunya Labs.',
      ttsVoiceAndSpeed: 'Model: zero-universal | Voice: shunya-female-1 | Speed: 1.0x | Format: mp3',
      preconditions: 'Valid API Key; TTS microservice online',
      testSteps: '1. POST /v1/audio/speech with Spanish text and model: zero-universal\n2. Assert HTTP 200 OK\n3. Assert binary payload',
      expectedResult: 'HTTP 200 OK; Spanish speech audio generated successfully',
      expectedStatus: 'HTTP 200 OK',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: 'SMOKE-API-011',
      module: 'Backend API - Negative, Auth & Stress',
      suite: 'Backend API',
      scenarioType: 'Negative',
      title: 'Negative Security — Missing Auth Returns 401 Unauthorized',
      description: 'Verify unauthenticated API requests are immediately rejected with HTTP 401/403',
      model: 'zero-indic',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      translatedText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'No Authorization header attached',
      testSteps: '1. POST /v1/audio/transcriptions without auth headers\n2. Assert HTTP 401/403 status',
      expectedResult: 'HTTP 401 Unauthorized; request securely rejected',
      expectedStatus: 'HTTP 401 Unauthorized',
      priority: 'P0',
      automated: 'Automated',
    },

    // ── Playground UI Smoke Test Cases (10 Scenarios) ─────────────────────────
    {
      id: 'SMOKE-UI-001',
      module: 'Playground UI - Layout & Navigation',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'Playground App Shell & Authentication State Sanity',
      description: 'Verify the Playground UI loads properly with page title, branding, and logged-in user state',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'App Shell',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      translatedText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Playground web application online at https://playground.shunyalabs.ai',
      testSteps: '1. Navigate to Playground URL\n2. Assert page title exists\n3. Assert "API Playground" text is visible in main container',
      expectedResult: 'Playground landing page renders cleanly without console errors',
      expectedStatus: 'Page Loaded & Rendered',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: 'SMOKE-UI-002',
      module: 'Playground UI - Layout & Navigation',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'Primary Workspace Navigation (STT <-> TTS Tabs)',
      description: 'Verify switching smoothly between Speech to Text and Text to Speech workspace tabs',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'Navigation Tabs',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      translatedText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Playground loaded with active session',
      testSteps: '1. Click "Text to Speech" tab -> verify active state\n2. Click "Speech to Text" tab -> verify active state',
      expectedResult: 'Workspace toggles between STT and TTS tabs smoothly with active styling',
      expectedStatus: 'Tabs Toggled Successfully',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: 'SMOKE-UI-003',
      module: 'Playground UI - STT Models',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'STT Model Selection Dropdown (Zero Indic, Codeswitch, Med)',
      description: 'Verify selecting models in STT dropdown updates configurations properly',
      model: 'Zero Indic / Codeswitch / Med',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'Model Selection',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      translatedText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'STT workspace active',
      testSteps: '1. Click Model dropdown\n2. Select "Zero Codeswitch"\n3. Select "Zero Med"\n4. Select "Zero Indic"',
      expectedResult: 'Model dropdown updates selection without UI errors',
      expectedStatus: 'Model Option Selected',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: 'SMOKE-UI-004',
      module: 'Playground UI - STT Language Selection',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'STT Language Search and Selection Modal/Dropdown',
      description: 'Verify opening language modal, searching for "Hindi", and confirming selection',
      model: 'zero-indic',
      languageCode: 'hi',
      languageName: 'Hindi',
      featuresEnabled: 'Language Search',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      translatedText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'STT workspace active',
      testSteps: '1. Click Language selection button\n2. Type "Hindi" in search input\n3. Select Hindi and close modal',
      expectedResult: 'Language search filters correctly and selects Hindi',
      expectedStatus: 'Language Selected',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: 'SMOKE-UI-005',
      module: 'Playground UI - STT Audio Upload',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'STT File Upload & "Run Analysis" CTA Enablement',
      description: 'Verify uploading valid audio file enables the Run Analysis action button',
      model: 'zero-indic',
      languageCode: 'hi',
      languageName: 'Hindi',
      featuresEnabled: 'File Upload',
      featureConfig: '{}',
      audioPath: 'input/indicvoices_data/audio/Hindi/37.mp3',
      ttsInputText: 'N/A',
      translatedText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'STT workspace active',
      testSteps: '1. Attach sample audio (37.mp3) to file input\n2. Assert "Run Analysis" button state transitions to enabled',
      expectedResult: 'Audio file is staged and Run Analysis CTA button becomes active',
      expectedStatus: 'Button Enabled',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: 'SMOKE-UI-006',
      module: 'Playground UI - STT Output Actions',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'STT Output Display Tabs Switch (Transcript vs JSON)',
      description: 'Verify toggling between Transcript view and formatted JSON output tabs',
      model: 'zero-indic',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'Output Views',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      translatedText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'STT workspace active',
      testSteps: '1. Click "JSON" tab\n2. Click "Transcript" tab',
      expectedResult: 'Output container switches between Transcript and JSON views cleanly',
      expectedStatus: 'Output Tab Switched',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: 'SMOKE-UI-007',
      module: 'Playground UI - TTS Speech Synthesis',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'TTS Workspace Model Switch (Zero Indic, Zero Oriental, Zero Universal)',
      description: 'Verify selecting Zero Oriental and Zero Universal models updates language cascade',
      model: 'Zero Indic / Zero Oriental / Zero Universal',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'TTS Model Cascades',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      translatedText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'TTS workspace active',
      testSteps: '1. Select "Zero Oriental" -> verify Asian languages cascade\n2. Select "Zero Universal" -> verify 45 global languages cascade',
      expectedResult: 'TTS model selection dynamically updates the language options list',
      expectedStatus: 'Model Cascaded',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: 'SMOKE-UI-008',
      module: 'Playground UI - TTS Speech Synthesis',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'TTS Textarea Input & Voice/Speed Controls Sanity',
      description: 'Verify typing native script into TTS textarea and adjusting speed/voice selectors',
      model: 'Zero Indic',
      languageCode: 'hi',
      languageName: 'Hindi',
      featuresEnabled: 'TTS Text Input',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'नमस्ते, शून्या लैब्स टेस्ट स्पीच।',
      translatedText: 'Hello, Shunya Labs test speech.',
      ttsVoiceAndSpeed: 'Model: Zero Indic | Voice: shunya-female-1 | Speed: 1.0x',
      preconditions: 'TTS workspace active',
      testSteps: '1. Enter native text in textarea\n2. Verify character counter updates and text is preserved',
      expectedResult: 'Text is accurately entered in textarea ready for synthesis',
      expectedStatus: 'Text Input Ready',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: 'SMOKE-UI-009',
      module: 'Playground UI - TTS Speech Synthesis',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'TTS Synthesized Audio Player & Download Controls',
      description: 'Verify audio player mounts and playback/download actions are visible',
      model: 'Zero Indic',
      languageCode: 'hi',
      languageName: 'Hindi',
      featuresEnabled: 'Audio Player Controls',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      translatedText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'TTS workspace active',
      testSteps: '1. Verify audio player / synthesize controls are visible in DOM',
      expectedResult: 'Audio player controls and synthesize actions are present and functional',
      expectedStatus: 'Player Mounted',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: 'SMOKE-UI-010',
      module: 'Playground UI - Layout & Navigation',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'Responsive Layout — Mobile Viewport (375x812) Smoke Check',
      description: 'Verify Playground UI renders properly on iPhone/Mobile viewport without horizontal overflow',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'Responsive Mobile Layout',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      translatedText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Viewport set to 375x812',
      testSteps: '1. Set viewport to 375x812\n2. Navigate to Playground\n3. Assert body is visible and no horizontal overflow occurs',
      expectedResult: 'Mobile layout renders cleanly with responsive navbar and stacked controls',
      expectedStatus: 'Mobile Layout Validated',
      priority: 'P0',
      automated: 'Automated',
    },
  ];
}

function hexToRgbColor(hex: string) {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  return { red: r, green: g, blue: b };
}

export async function populateSmokeTestSheet() {
  console.log(`Connecting to Google Sheets API using: ${KEY_FILE_PATH}`);
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // 1. Check if "Smoke test cases" tab exists, if not create it
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existingSheets = meta.data.sheets || [];
  let smokeSheet = existingSheets.find((s) => s.properties?.title === TAB_NAME);
  let smokeSheetId = smokeSheet?.properties?.sheetId;

  if (!smokeSheet) {
    console.log(`Creating new tab "${TAB_NAME}" in spreadsheet ${SPREADSHEET_ID}...`);
    const addSheetRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: TAB_NAME,
                gridProperties: {
                  rowCount: 100,
                  columnCount: 26,
                  frozenRowCount: 1,
                },
              },
            },
          },
        ],
      },
    });
    smokeSheetId = addSheetRes.data.replies?.[0]?.addSheet?.properties?.sheetId;
    console.log(`Created tab "${TAB_NAME}" with sheetId: ${smokeSheetId}`);
  } else {
    console.log(`Found existing tab "${TAB_NAME}" (sheetId: ${smokeSheetId})`);
  }

  // 2. Generate 21 Smoke Test Cases
  const smokeCases = generateSmokeTestCases();
  console.log(`Generated ${smokeCases.length} smoke test cases!`);

  const rows: string[][] = [HEADERS];
  for (const tc of smokeCases) {
    rows.push([
      tc.id,
      tc.module,
      tc.suite,
      tc.scenarioType,
      tc.title,
      tc.description,
      tc.model,
      tc.languageCode,
      tc.languageName,
      tc.featuresEnabled,
      tc.featureConfig || '{}',
      tc.audioPath || 'N/A',
      tc.ttsInputText || 'N/A',
      tc.translatedText || 'N/A',
      tc.ttsVoiceAndSpeed || 'N/A',
      tc.preconditions || 'N/A',
      tc.testSteps || 'N/A',
      tc.expectedResult || 'N/A',
      tc.expectedStatus || 'N/A',
      tc.priority || 'P0',
      tc.automated || 'Automated',
    ]);
  }

  // 3. Clear and write data to the tab
  console.log(`Clearing existing content in "${TAB_NAME}"...`);
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${TAB_NAME}'!A1:Z500`,
  });

  console.log(`Writing ${rows.length} rows to "${TAB_NAME}"...`);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${TAB_NAME}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });

  // 4. Apply styling (Navy header, bold text, borders, auto-resize)
  if (smokeSheetId !== undefined && smokeSheetId !== null) {
    console.log(`Applying formatting to sheetId ${smokeSheetId}...`);
    const requests: any[] = [
      // Freeze header row
      {
        updateSheetProperties: {
          properties: {
            sheetId: smokeSheetId,
            gridProperties: { frozenRowCount: 1 },
          },
          fields: 'gridProperties.frozenRowCount',
        },
      },
      // Format Header Row (Navy Blue #0f172a, White Bold Text)
      {
        repeatCell: {
          range: {
            sheetId: smokeSheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: HEADERS.length,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: hexToRgbColor('#0f172a'),
              textFormat: {
                foregroundColor: hexToRgbColor('#ffffff'),
                bold: true,
                fontSize: 11,
                fontFamily: 'Inter',
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              padding: { top: 8, bottom: 8, left: 10, right: 10 },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)',
        },
      },
      // Format Data Rows (Font, wrap text, vertical alignment)
      {
        repeatCell: {
          range: {
            sheetId: smokeSheetId,
            startRowIndex: 1,
            endRowIndex: rows.length,
            startColumnIndex: 0,
            endColumnIndex: HEADERS.length,
          },
          cell: {
            userEnteredFormat: {
              textFormat: {
                fontSize: 10,
                fontFamily: 'Inter',
              },
              verticalAlignment: 'MIDDLE',
              wrapStrategy: 'WRAP',
            },
          },
          fields: 'userEnteredFormat(textFormat,verticalAlignment,wrapStrategy)',
        },
      },
      // Add grid borders
      {
        updateBorders: {
          range: {
            sheetId: smokeSheetId,
            startRowIndex: 0,
            endRowIndex: rows.length,
            startColumnIndex: 0,
            endColumnIndex: HEADERS.length,
          },
          top: { style: 'SOLID', color: hexToRgbColor('#e2e8f0') },
          bottom: { style: 'SOLID', color: hexToRgbColor('#e2e8f0') },
          left: { style: 'SOLID', color: hexToRgbColor('#e2e8f0') },
          right: { style: 'SOLID', color: hexToRgbColor('#e2e8f0') },
          innerHorizontal: { style: 'SOLID', color: hexToRgbColor('#f1f5f9') },
          innerVertical: { style: 'SOLID', color: hexToRgbColor('#f1f5f9') },
        },
      },
    ];

    // Priority P0 chip coloring (Red chip)
    for (let r = 1; r < rows.length; r++) {
      requests.push({
        repeatCell: {
          range: {
            sheetId: smokeSheetId,
            startRowIndex: r,
            endRowIndex: r + 1,
            startColumnIndex: 19, // Priority column
            endColumnIndex: 20,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: hexToRgbColor('#ffcdd2'),
              textFormat: { foregroundColor: hexToRgbColor('#b71c1c'), bold: true },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      });
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests },
    });
    console.log(`Successfully formatted "${TAB_NAME}" tab in spreadsheet!`);
  }

  console.log(`\n🎉 Smoke test cases populated successfully in tab "${TAB_NAME}"!`);
  console.log(`Spreadsheet URL: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit\n`);
}

if (require.main === module) {
  populateSmokeTestSheet()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Failed to populate smoke test sheet:', err);
      process.exit(1);
    });
}
