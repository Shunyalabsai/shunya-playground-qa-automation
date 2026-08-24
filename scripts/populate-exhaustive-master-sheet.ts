/**
 * Script: populate-exhaustive-master-sheet.ts
 * Description: Generates 152+ exhaustive test cases and applies distinct color coding
 *              for Modules/Categories, Models, Suite Types, Scenario Types, and Priority.
 * Target Sheet: https://docs.google.com/spreadsheets/d/1KWWMQN3ppFfux1mP8Wb34UmtrIEXhz2T6_1_goXI8JI/edit
 */

import { google } from 'googleapis';
import * as path from 'path';

const SPREADSHEET_ID = '1KWWMQN3ppFfux1mP8Wb34UmtrIEXhz2T6_1_goXI8JI';
const KEY_FILE_PATH = path.resolve(__dirname, '../Google_service_account.json');

export interface DeepTestCase {
  id: string;
  module: string;
  suite: 'UI' | 'Backend API' | 'End-to-End';
  scenarioType: 'Positive' | 'Negative' | 'Edge Case' | 'Boundary' | 'Security' | 'Stress';
  title: string;
  description: string;
  model: string;
  languageCode: string;
  languageName: string;
  featuresEnabled: string;
  featureConfig: string;
  audioPath: string;
  ttsInputText: string;
  ttsVoiceAndSpeed: string;
  preconditions: string;
  testSteps: string;
  expectedResult: string;
  expectedStatus: string;
  priority: 'P0' | 'P1' | 'P2';
  automated: 'Automated';
}

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
  'ASR Feature(s) Enabled',
  'Feature Parameters / Config Payload',
  'Audio File Path / Input URL',
  'TTS Input Text',
  'TTS Voice & Speed / Format',
  'Preconditions',
  'Test Steps',
  'Expected Output / Result',
  'Expected Status / UI State',
  'Priority',
  'Automation Status',
];

const INDIC_LANG_MAP: Record<string, { code: string; name: string; sample: string }> = {
  Hindi: { code: 'hi', name: 'Hindi', sample: 'input/indicvoices_data/audio/Hindi/37.mp3' },
  Bengali: { code: 'bn', name: 'Bengali', sample: 'input/indicvoices_data/audio/Bengali/40.mp3' },
  Marathi: { code: 'mr', name: 'Marathi', sample: 'input/indicvoices_data/audio/Marathi/40.mp3' },
  Telugu: { code: 'te', name: 'Telugu', sample: 'input/indicvoices_data/audio/Telugu/38.mp3' },
  Tamil: { code: 'ta', name: 'Tamil', sample: 'input/indicvoices_data/audio/Tamil/38.mp3' },
  Gujarati: { code: 'gu', name: 'Gujarati', sample: 'input/indicvoices_data/audio/Gujarati/54.mp3' },
  Kannada: { code: 'kn', name: 'Kannada', sample: 'input/indicvoices_data/audio/Kannada/38.mp3' },
  Malayalam: { code: 'ml', name: 'Malayalam', sample: 'input/indicvoices_data/audio/Malayalam/51.mp3' },
  Punjabi: { code: 'pa', name: 'Punjabi', sample: 'input/indicvoices_data/audio/Punjabi/41.mp3' },
  Odia: { code: 'or', name: 'Odia', sample: 'input/indicvoices_data/audio/Odia/37.mp3' },
  Assamese: { code: 'as', name: 'Assamese', sample: 'input/indicvoices_data/audio/Assamese/40.mp3' },
  Urdu: { code: 'ur', name: 'Urdu', sample: 'input/indicvoices_data/audio/Urdu/38.mp3' },
  Sanskrit: { code: 'sa', name: 'Sanskrit', sample: 'input/indicvoices_data/audio/Sanskrit/46.mp3' },
  Bhojpuri: { code: 'bho', name: 'Bhojpuri', sample: 'input/indicvoices_data/audio/Bhojpuri/39.mp3' },
  Maithili: { code: 'mai', name: 'Maithili', sample: 'input/indicvoices_data/audio/Maithili/Maithili_0.wav' },
  Nepali: { code: 'ne', name: 'Nepali', sample: 'input/indicvoices_data/audio/Nepali/32.mp3' },
  Santali: { code: 'sat', name: 'Santali', sample: 'input/indicvoices_data/audio/Santali/37.mp3' },
  Sindhi: { code: 'sd', name: 'Sindhi', sample: 'input/indicvoices_data/audio/Sindhi/40.mp3' },
  Dogri: { code: 'doi', name: 'Dogri', sample: 'input/indicvoices_data/audio/Dogri/43.mp3' },
  Konkani: { code: 'kok', name: 'Konkani', sample: 'input/indicvoices_data/audio/Konkani/34.mp3' },
  Manipuri: { code: 'mni', name: 'Manipuri', sample: 'input/indicvoices_data/audio/Manipuri/33.mp3' },
  Bodo: { code: 'brx', name: 'Bodo', sample: 'input/indicvoices_data/audio/Bodo/40.mp3' },
  Kashmiri: { code: 'ks', name: 'Kashmiri', sample: 'input/indicvoices_data/audio/Kashmiri/32.mp3' },
  Chhattisgarhi: { code: 'hne', name: 'Chhattisgarhi', sample: 'input/indicvoices_data/audio/Chhattisgarhi/35.mp3' },
  Haryanvi: { code: 'bgc', name: 'Haryanvi', sample: 'input/indicvoices_data/audio/Haryanvi/37.mp3' },
  Marwadi: { code: 'mwr', name: 'Marwadi', sample: 'input/indicvoices_data/audio/Marwadi/37.mp3' },
  Awadhi: { code: 'awa', name: 'Awadhi', sample: 'input/indicvoices_data/audio/Awadhi/33.mp3' },
  Magahi: { code: 'mag', name: 'Magahi', sample: 'input/indicvoices_data/audio/Magahi/38.mp3' },
  Garhwali: { code: 'gbm', name: 'Garhwali', sample: 'input/indicvoices_data/audio/Garhwali/40.mp3' },
  Kumaoni: { code: 'kfy', name: 'Kumaoni', sample: 'input/indicvoices_data/audio/Kumaoni/40.mp3' },
  Tulu: { code: 'tcy', name: 'Tulu', sample: 'input/indicvoices_data/audio/Tulu/38.mp3' },
  Ahirani: { code: 'ahr', name: 'Ahirani', sample: 'input/indicvoices_data/audio/Ahirani/38.mp3' },
  Bagri: { code: 'bgq', name: 'Bagri', sample: 'input/indicvoices_data/audio/Bagri/38.mp3' },
  Banjari: { code: 'bwq', name: 'Banjari', sample: 'input/indicvoices_data/audio/Banjari/37.mp3' },
  Bhili: { code: 'bhb', name: 'Bhili', sample: 'input/indicvoices_data/audio/Bhili/38.mp3' },
  Braj: { code: 'bra', name: 'Braj', sample: 'input/indicvoices_data/audio/Braj/38.mp3' },
  Bundeli: { code: 'bns', name: 'Bundeli', sample: 'input/indicvoices_data/audio/Bundeli/37.mp3' },
  Garo: { code: 'grt', name: 'Garo', sample: 'input/indicvoices_data/audio/Garo/34.mp3' },
  Kangri: { code: 'xnr', name: 'Kangri', sample: 'input/indicvoices_data/audio/Kangri/38.mp3' },
  Khortha: { code: 'ktk', name: 'Khortha', sample: 'input/indicvoices_data/audio/Khortha/38.mp3' },
  Kurukh: { code: 'kru', name: 'Kurukh', sample: 'input/indicvoices_data/audio/Kurukh/37.mp3' },
  Mewari: { code: 'mtr', name: 'Mewari', sample: 'input/indicvoices_data/audio/Mewari/35.mp3' },
  Sambalpuri: { code: 'spv', name: 'Sambalpuri', sample: 'input/indicvoices_data/audio/Sambalpuri/38.mp3' },
  Surgujia: { code: 'sgj', name: 'Surgujia', sample: 'input/indicvoices_data/audio/Surgujia/38.mp3' },
};

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const clean = hex.replace('#', '');
  return {
    red: parseInt(clean.substring(0, 2), 16) / 255,
    green: parseInt(clean.substring(2, 4), 16) / 255,
    blue: parseInt(clean.substring(4, 6), 16) / 255,
  };
}

function generateTestCases(): DeepTestCase[] {
  const list: DeepTestCase[] = [];
  let seq = 1;
  const nextId = (prefix: string) => `${prefix}-${String(seq++).padStart(3, '0')}`;

  // ── 1. Authentication & Session Management (8 cases) ───────────────────
  seq = 1;
  list.push(
    {
      id: nextId('TC-AUTH'),
      module: 'Authentication & Session',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'New User Sign Up with Valid Email & OTP',
      description: 'Verify new user can register by entering email and verifying OTP',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'User is on login modal; email not registered',
      testSteps: '1. Enter email newuser_qa@shunyalabs.ai\n2. Click Continue\n3. Enter received OTP\n4. Click Verify',
      expectedResult: 'User created, session initialized, redirected to Playground with onboarding prompt',
      expectedStatus: 'HTTP 200 / Redirect',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: nextId('TC-AUTH'),
      module: 'Authentication & Session',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'Existing User Login with Valid Email (yamini@shunyalabs.ai)',
      description: 'Verify existing user login and profile name loading',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'User registered',
      testSteps: '1. Navigate to Playground\n2. Enter yamini@shunyalabs.ai\n3. Submit OTP/auth\n4. Assert profile button',
      expectedResult: 'User profile shows "Yamini Singh", credits badge visible, session saved in storageState',
      expectedStatus: 'HTTP 200 / Authenticated',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: nextId('TC-AUTH'),
      module: 'Authentication & Session',
      suite: 'UI',
      scenarioType: 'Negative',
      title: 'Login with Invalid / Wrong OTP',
      description: 'Verify error message when incorrect 6-digit OTP is supplied',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'OTP requested on login dialog',
      testSteps: '1. Enter valid email\n2. Request OTP\n3. Type "000000"\n4. Click Verify',
      expectedResult: 'Toast error "Invalid or expired OTP" appears; user remains on modal',
      expectedStatus: 'HTTP 400 / Error Toast',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: nextId('TC-AUTH'),
      module: 'Authentication & Session',
      suite: 'UI',
      scenarioType: 'Negative',
      title: 'Login with Blank Email Address',
      description: 'Verify form validation prevents submitting empty email',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Login modal open',
      testSteps: '1. Leave email input empty\n2. Click Continue button',
      expectedResult: 'Client validation error "Please enter an email address" displayed',
      expectedStatus: 'Validation Error',
      priority: 'P1',
      automated: 'Automated',
    },
    {
      id: nextId('TC-AUTH'),
      module: 'Authentication & Session',
      suite: 'UI',
      scenarioType: 'Negative',
      title: 'Login with Malformed Email Syntax (user@, @shunya.ai, user name@shunya.ai)',
      description: 'Verify regex email validator blocks invalid email strings',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Login modal open',
      testSteps: '1. Test inputs "user@", "@domain.com", "user name@domain.com"\n2. Verify each is blocked',
      expectedResult: 'Error message "Please enter a valid email address" appears for each',
      expectedStatus: 'Validation Error',
      priority: 'P1',
      automated: 'Automated',
    },
    {
      id: nextId('TC-AUTH'),
      module: 'Authentication & Session',
      suite: 'UI',
      scenarioType: 'Security',
      title: 'Login Input XSS & SQL Injection Sanitization',
      description: 'Verify login input handles injection attacks safely without crashing or executing script',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Login modal open',
      testSteps: '1. Enter payload "\' OR 1=1 --<script>alert(1)</script>"\n2. Click Continue',
      expectedResult: 'Rejected as invalid email; zero script execution in DOM',
      expectedStatus: 'HTTP 400 / Validation Error',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: nextId('TC-AUTH'),
      module: 'Authentication & Session',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'User Logout from Profile Menu',
      description: 'Verify clicking Logout revokes session and clears local auth tokens',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'User is authenticated',
      testSteps: '1. Click profile button\n2. Click Log out\n3. Assert page redirects to logged out view',
      expectedResult: 'User logged out; storage cookies cleared; Login button visible',
      expectedStatus: 'HTTP 200 / Logged Out',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: nextId('TC-AUTH'),
      module: 'Authentication & Session',
      suite: 'Backend API',
      scenarioType: 'Positive',
      title: 'Backend JWT Token Exchange Endpoint (POST /auth/token)',
      description: 'Verify exchanging API key for short-lived JWT token via POST https://asrv2prod.shunyalabs.ai/auth/token',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Valid API Key PM33tkGUHWyjGvU8D0GutZrr5fHPxQsF',
      testSteps: '1. POST /auth/token with headers api-key and Authorization: Bearer <key>\n2. Assert status 200\n3. Assert response has token and expires_at',
      expectedResult: 'HTTP 200 OK; JWT token returned and cached for subsequent requests',
      expectedStatus: 'HTTP 200 OK',
      priority: 'P0',
      automated: 'Automated',
    }
  );

  // ── 2. Onboarding Journey & Banner Modals (5 cases) ──────────────────────
  seq = 1;
  list.push(
    {
      id: nextId('TC-ONBOARD'),
      module: 'Onboarding Journey',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'Onboarding Announcement Banner Display ($5 Credits Offer) for New Users',
      description: 'Verify new accounts see the onboarding announcement banner at the top of workspace',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'New user logged in without completed onboarding',
      testSteps: '1. Navigate to Playground\n2. Check announcement banner text for "receive $5 in credits"',
      expectedResult: 'Top announcement bar visible with "Complete Now" action button and dismiss icon',
      expectedStatus: 'UI Banner Rendered',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: nextId('TC-ONBOARD'),
      module: 'Onboarding Journey',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'Complete Full Onboarding Survey Modal and Grant $5 Credits',
      description: 'Verify clicking Complete Now opens survey popup modal, submitting grants $5.00 credits',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Onboarding banner is visible',
      testSteps: '1. Click "Complete Now"\n2. Verify Onboarding Pop-up Window opens\n3. Select role, company size, use case\n4. Click Submit\n5. Assert credits update to $5.00',
      expectedResult: 'Success toast snackbar displayed; popup closes; credits balance shows $5.00',
      expectedStatus: 'HTTP 200 / Balance Updated',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: nextId('TC-ONBOARD'),
      module: 'Onboarding Journey',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'Dismiss Announcement Banner via Close Icon',
      description: 'Verify clicking "X" close icon on announcement bar dismisses it with smooth reflow',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Banner displayed',
      testSteps: '1. Click "X" close icon on banner\n2. Verify announcement bar is removed from layout',
      expectedResult: 'Banner removed cleanly; page layout reflows without overlapping headers',
      expectedStatus: 'UI Updated',
      priority: 'P1',
      automated: 'Automated',
    },
    {
      id: nextId('TC-ONBOARD'),
      module: 'Onboarding Journey',
      suite: 'UI',
      scenarioType: 'Edge Case',
      title: 'Zero Balance Action Intercept Modal (Pop-up Guardrail)',
      description: 'Verify clicking Run Analysis with $0 balance triggers pop-up modal prompting onboarding or add funds',
      model: 'zero-indic',
      languageCode: 'hi',
      languageName: 'Hindi',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'input/indicvoices_data/audio/Hindi/37.mp3',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'User wallet balance is $0.00',
      testSteps: '1. Upload audio file\n2. Click Run Analysis\n3. Observe intercept pop-up modal',
      expectedResult: 'Pop-up window appears with "Complete Now" for $5 credits and "Add Funds" options',
      expectedStatus: 'UI Pop-up Modal Intercept',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: nextId('TC-ONBOARD'),
      module: 'Onboarding Journey',
      suite: 'UI',
      scenarioType: 'Edge Case',
      title: 'Onboarding Pop-up Modal Backdrop Click Dismissal',
      description: 'Verify clicking outside the onboarding popup modal (backdrop) closes it safely',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Onboarding modal is open',
      testSteps: '1. Click "Complete Now" to open modal\n2. Click on darkened overlay backdrop outside dialog box\n3. Verify modal closes',
      expectedResult: 'Modal closes smoothly without freezing page',
      expectedStatus: 'UI Modal Dismissed',
      priority: 'P1',
      automated: 'Automated',
    }
  );

  // ── 3. UI Layout & Navigation (3 cases) ──────────────────────────────────
  seq = 1;
  list.push(
    {
      id: nextId('TC-UI-LAY'),
      module: 'UI - Layout & Navigation',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'Header Navigation Branding, Docs & Console Links',
      description: 'Verify top nav contains Docs, Console, and User profile buttons with active links',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Playground loaded',
      testSteps: '1. Assert Docs button visible and enabled\n2. Assert Console button visible and enabled\n3. Assert profile button shows user name',
      expectedResult: 'All header elements visible and clickable',
      expectedStatus: 'HTTP 200 / Rendered',
      priority: 'P1',
      automated: 'Automated',
    },
    {
      id: nextId('TC-UI-LAY'),
      module: 'UI - Layout & Navigation',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'Service Tab Switching: Speech to Text <-> Text to Speech',
      description: 'Verify active workspace toggles between STT and TTS',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Playground loaded',
      testSteps: '1. Click "Text to Speech" tab -> assert TTS workspace active\n2. Click "Speech to Text" tab -> assert STT workspace active',
      expectedResult: 'Workspace switches cleanly with active tab highlights',
      expectedStatus: 'UI Tab Switch OK',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: nextId('TC-UI-LAY'),
      module: 'UI - Layout & Navigation',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'Credits Balance Currency Display Format ($X.XX)',
      description: 'Verify credits badge formatted accurately with dollar sign and decimal amounts',
      model: 'N/A',
      languageCode: 'N/A',
      languageName: 'N/A',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'User authenticated',
      testSteps: '1. Locate Credits badge in Configuration card\n2. Validate against regex `Credits:\\s*\\$[\\d,.-]+`',
      expectedResult: 'Numeric currency amount correctly parsed',
      expectedStatus: 'UI Badge Rendered',
      priority: 'P1',
      automated: 'Automated',
    }
  );

  // ── 4. STT Model & Indic Language Matrix (50+ Languages) ─────────────────
  seq = 1;
  list.push(
    {
      id: nextId('TC-STT-MOD'),
      module: 'UI - Model & Language Selection',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'Model Dropdown Contains Zero Indic, Zero Codeswitch, and Zero Med',
      description: 'Verify all 3 primary model families are listed in Model selector',
      model: 'zero-indic, zero-codeswitch, zero-medasr',
      languageCode: 'auto',
      languageName: 'Auto Detect',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'input/indicvoices_data/audio/Hindi/37.mp3',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'STT tab active',
      testSteps: '1. Select model dropdown\n2. Assert options include "Zero Indic", "Zero Codeswitch", "Zero Med"',
      expectedResult: 'All 3 models available and selectable',
      expectedStatus: 'UI Select Options OK',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: nextId('TC-STT-MOD'),
      module: 'UI - Model & Language Selection',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'Switching Between Models Updates Dropdown & Active Engine',
      description: 'Verify selecting Zero Codeswitch updates input value to "Zero Codeswitch"',
      model: 'zero-codeswitch',
      languageCode: 'hi-en',
      languageName: 'Hinglish',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'input/CodeSwitchvoices_data/audio/hinglish_arti.wav',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'STT tab active',
      testSteps: '1. Select "Zero Codeswitch"\n2. Assert select value is "Zero Codeswitch"\n3. Switch back to "Zero Indic"\n4. Assert select value is "Zero Indic"',
      expectedResult: 'Model switches smoothly',
      expectedStatus: 'UI State OK',
      priority: 'P0',
      automated: 'Automated',
    }
  );

  // Per language test cases
  for (const [langKey, info] of Object.entries(INDIC_LANG_MAP)) {
    list.push({
      id: nextId('TC-STT-LANG'),
      module: 'UI - Model & Language Selection',
      suite: 'UI',
      scenarioType: 'Positive',
      title: `Language Selection & Transcription: ${langKey} (${info.code})`,
      description: `Verify searching and selecting ${langKey}, uploading ${path.basename(info.sample)}, and running transcription`,
      model: 'zero-indic',
      languageCode: info.code,
      languageName: info.name,
      featuresEnabled: 'None (Baseline)',
      featureConfig: JSON.stringify({ language_code: info.code, model: 'zero-indic' }),
      audioPath: info.sample,
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: `Audio file exists at ${info.sample}`,
      testSteps: `1. Open language search popup\n2. Search "${langKey}"\n3. Select ${langKey}\n4. Upload ${info.sample}\n5. Click Run Analysis`,
      expectedResult: `Audio in ${langKey} transcribed successfully; non-empty transcript text rendered in native/Latin script`,
      expectedStatus: 'HTTP 200 / Transcript Rendered',
      priority: info.code === 'hi' || info.code === 'bn' || info.code === 'ta' || info.code === 'te' || info.code === 'mr' ? 'P0' : 'P1',
      automated: 'Automated',
    });
  }

  // Model-specific test cases for Codeswitch & Medical ASR
  list.push(
    {
      id: nextId('TC-STT-MOD'),
      module: 'UI - Model & Language Selection',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'Model zero-codeswitch with Mixed Hinglish WAV Audio',
      description: 'Verify mixed Hindi-English conversational audio transcription with zero-codeswitch',
      model: 'zero-codeswitch',
      languageCode: 'auto',
      languageName: 'Hinglish',
      featuresEnabled: 'None',
      featureConfig: JSON.stringify({ model: 'zero-codeswitch', language_code: 'auto' }),
      audioPath: 'input/CodeSwitchvoices_data/audio/hinglish_arti.wav',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'WAV file available',
      testSteps: '1. Select Zero Codeswitch model\n2. Upload hinglish_arti.wav\n3. Click Run Analysis\n4. Assert transcript text',
      expectedResult: 'Code-mixed audio transcribed accurately with code-switching tokens',
      expectedStatus: 'HTTP 200 OK',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: nextId('TC-STT-MOD'),
      module: 'UI - Model & Language Selection',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'Model zero-medasr (Medical Model) with General Physician Consultation Audio',
      description: 'Verify specialized medical diagnosis audio transcription with zero-medasr using General Physician Consultation audio',
      model: 'zero-medasr',
      languageCode: 'en',
      languageName: 'English (Medical)',
      featuresEnabled: 'None',
      featureConfig: JSON.stringify({ model: 'zero-medasr', language_code: 'en' }),
      audioPath: 'input/Medical_Keyterm_Correction/General_Physician Consultation_Medical_keterm.mp3',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Medical consultation MP3 audio available',
      testSteps: '1. Select Zero Med model\n2. Upload General_Physician Consultation_Medical_keterm.mp3\n3. Click Run Analysis\n4. Assert medical terminologies in transcript',
      expectedResult: 'Medical diagnosis, prescriptions, and clinical entities accurately captured',
      expectedStatus: 'HTTP 200/201 OK',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: nextId('TC-STT-MOD'),
      module: 'UI - Model & Language Selection',
      suite: 'UI',
      scenarioType: 'Positive',
      title: 'Model zero-medasr with Bipolar Disorder Psychiatric OSCE Case Audio',
      description: 'Verify psychiatric consultation audio transcription using zero-medasr',
      model: 'zero-medasr',
      languageCode: 'en',
      languageName: 'English (Medical)',
      featuresEnabled: 'None',
      featureConfig: JSON.stringify({ model: 'zero-medasr', language_code: 'en' }),
      audioPath: 'input/indicvoices_data/audio/Long_Medical_files/Mania (Bipolar Disorder) _ Mental State Examination (MSE) _ OSCE Guide _  SCA Case _ UKMLA _ CPSA - (320 Kbps).mp3',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Long medical consultation file available',
      testSteps: '1. Select Zero Med model\n2. Upload Bipolar Disorder OSCE Guide MP3\n3. Click Run Analysis\n4. Assert clinical notes',
      expectedResult: 'Clinical mental state examination notes transcribed accurately',
      expectedStatus: 'HTTP 200/201 OK',
      priority: 'P1',
      automated: 'Automated',
    }
  );

  // ── 5. Audio Intelligence Feature Matrix (Real Feature Dataset Paths) ─────
  seq = 1;
  const FEATURE_DEFS = [
    {
      name: 'Translation (English Target)',
      featureName: 'Translation',
      config: { translation: 'true', target_languages: '["en"]', output_language: 'en' },
      sample: 'input/indicvoices_data/audio/Hindi/37.mp3',
      model: 'zero-indic',
      lang: 'hi',
      langName: 'Hindi',
      validation: 'Response body contains translated English text',
    },
    {
      name: 'Translation (Hindi Target)',
      featureName: 'Translation',
      config: { translation: 'true', target_languages: '["hi"]', output_language: 'hi' },
      sample: 'input/CodeSwitchvoices_data/audio/hinglish_arti.wav',
      model: 'zero-codeswitch',
      lang: 'auto',
      langName: 'Hinglish',
      validation: 'Response body contains translated Hindi text',
    },
    {
      name: 'Transliteration (Devanagari Script)',
      featureName: 'Transliteration',
      config: { transliteration: 'true', output_script: 'Devanagari' },
      sample: 'input/indicvoices_data/audio/Hindi/37.mp3',
      model: 'zero-indic',
      lang: 'hi',
      langName: 'Hindi',
      validation: 'Response contains Devanagari script transliterated text',
    },
    {
      name: 'Transliteration (Latin Script)',
      featureName: 'Transliteration',
      config: { transliteration: 'true', output_script: 'Latin' },
      sample: 'input/indicvoices_data/audio/Telugu/38.mp3',
      model: 'zero-indic',
      lang: 'te',
      langName: 'Telugu',
      validation: 'Response contains Romanized Latin script transliterated text',
    },
    {
      name: 'Speaker Diarization (Debate Audio with Multiple Speakers)',
      featureName: 'Speaker Diarization',
      config: { diarize: 'true', enable_diarization: 'true' },
      sample: 'input/speaker_diarization/QA-02.mp3',
      model: 'zero-indic',
      lang: 'auto',
      langName: 'Hindi/English',
      validation: 'Segments labeled by distinct speakers (Speaker 0, Speaker 1, Speaker 2)',
    },
    {
      name: 'Speaker Diarization (Rajya Sabha Budget Session Parliamentary Debate)',
      featureName: 'Speaker Diarization',
      config: { diarize: 'true', enable_diarization: 'true' },
      sample: 'input/speaker_diarization/RS  Zero Hour  Budget Session 2026  12 March, 2026.mp3',
      model: 'zero-indic',
      lang: 'hi',
      langName: 'Hindi',
      validation: 'Multi-speaker turn-taking parsed cleanly with timestamps',
    },
    {
      name: 'Speaker Identification (Voiceprint Matching on Studio Debate)',
      featureName: 'Speaker Identification',
      config: { enable_speaker_identification: 'true' },
      sample: 'input/speaker_diarization/India Vs Pakistan  T20 World Cup_ NDTV Studio म महसगरम! Kapil Dev  Shoaib Malik  IND Vs PAK.mp3',
      model: 'zero-indic',
      lang: 'hi',
      langName: 'Hindi',
      validation: 'Identified speaker metadata and voiceprint profile tags returned',
    },
    {
      name: 'Word Timestamps (Word Start/End Timing Offsets on WAV)',
      featureName: 'Word Timestamps',
      config: { timestamps: 'true', word_timestamps: 'true' },
      sample: 'input/CodeSwitchvoices_data/audio/hinglish_arti.wav',
      model: 'zero-codeswitch',
      lang: 'auto',
      langName: 'Hinglish',
      validation: 'Every segment contains words array with start and end float timestamps',
    },
    {
      name: 'Profanity Hashing (Abusive Language Test Audio)',
      featureName: 'Profanity Hashing',
      config: { profanity: 'true', enable_profanity_hashing: 'true' },
      sample: 'input/Profanity_Hashing/Abusive_lan_test.mp3',
      model: 'zero-indic',
      lang: 'hi',
      langName: 'Hindi',
      validation: 'Profane / abusive words masked with asterisks (***)',
    },
    {
      name: 'Custom Keyword Hashing (Customer Call with Sensitive Terms)',
      featureName: 'Custom Keyword Hashing',
      config: { hash: 'true', keywords: '["shunya", "testing", "doctor", "account"]', hash_keywords: 'shunya,testing,doctor,account' },
      sample: 'input/Keyword_normalization/Hindi_customer_call_keyword_norm.mp3',
      model: 'zero-indic',
      lang: 'hi',
      langName: 'Hindi',
      validation: 'Specified custom keywords hashed or masked in transcript',
    },
    {
      name: 'Intent Detection (Customer Call Support Intent Classification)',
      featureName: 'Intent Detection',
      config: { intent: 'true', enable_intent_detection: 'true', intent_choices: 'refund,order,support,complaint,inquiry' },
      sample: 'input/Keyword_normalization/Hindi_customer_call_keyword_norm.mp3',
      model: 'zero-indic',
      lang: 'hi',
      langName: 'Hindi',
      validation: 'Intent classification category returned in analysis block',
    },
    {
      name: 'Sentiment Analysis (Customer Sentiment Polarity)',
      featureName: 'Sentiment Analysis',
      config: { sentiment: 'true', enable_sentiment_analysis: 'true' },
      sample: 'input/Keyword_normalization/Hindi_customer_call_keyword_norm.mp3',
      model: 'zero-indic',
      lang: 'hi',
      langName: 'Hindi',
      validation: 'Sentiment polarity score and label returned in output',
    },
    {
      name: 'Emotion Diarization (Group Meeting Audio)',
      featureName: 'Emotion Diarization',
      config: { emotion: 'true', enable_emotion_diarization: 'true' },
      sample: 'input/speaker_diarization/Emo_dia_group_meeting.mp3',
      model: 'zero-indic',
      lang: 'auto',
      langName: 'Hindi/English',
      validation: 'Segment-level emotion labels (Joy, Frustration, Neutral, Anger) returned',
    },
    {
      name: 'Summarisation (Executive Abstract on Parliamentary Debate)',
      featureName: 'Summarisation',
      config: { summarize: 'true', enable_summarization: 'true', summary_max_length: '150' },
      sample: 'input/speaker_diarization/RS  Zero Hour  Budget Session 2026  11 March, 2026.mp3',
      model: 'zero-indic',
      lang: 'hi',
      langName: 'Hindi',
      validation: 'Concise executive summary paragraph generated from speech',
    },
    {
      name: 'Keyword Normalisation (Hindi Stress Test Variations)',
      featureName: 'Keyword Normalisation',
      config: { normalize: 'true', enable_keyterm_normalization: 'true', keyterm_keywords: 'price,date,amount,number' },
      sample: 'input/Keyword_normalization/Hindi-Stress-Test Script-(Deliberate-Variations).mp3',
      model: 'zero-indic',
      lang: 'hi',
      langName: 'Hindi',
      validation: 'Entities and numerical variations formatted into canonical representation',
    },
    {
      name: 'Keyword Normalisation (Industry Jargon & Brand Normalization)',
      featureName: 'Keyword Normalisation',
      config: { normalize: 'true', enable_keyterm_normalization: 'true', keyterm_keywords: 'google,microsoft,shunya,amazon' },
      sample: 'input/Keyword_normalization/Industry_Jargon _Brand Normalizatio.mp3',
      model: 'zero-indic',
      lang: 'auto',
      langName: 'Hinglish',
      validation: 'Brand names and acronyms standardized across transcript',
    },
  ];

  for (const f of FEATURE_DEFS) {
    list.push({
      id: nextId('TC-FEAT-UI'),
      module: 'UI - Intelligence Features',
      suite: 'UI',
      scenarioType: 'Positive',
      title: `UI Feature Toggle & Run: ${f.name}`,
      description: `Verify enabling ${f.featureName} toggle in UI, uploading ${path.basename(f.sample)}, and asserting output`,
      model: f.model,
      languageCode: f.lang,
      languageName: f.langName,
      featuresEnabled: f.featureName,
      featureConfig: JSON.stringify(f.config),
      audioPath: f.sample,
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: `Audio file exists at ${f.sample}`,
      testSteps: `1. Open Features panel\n2. Toggle "${f.featureName}"\n3. Configure parameters ${JSON.stringify(f.config)}\n4. Upload ${f.sample}\n5. Click Run Analysis`,
      expectedResult: `Feature successfully executed. ${f.validation}`,
      expectedStatus: 'HTTP 200 / Feature Rendered',
      priority: 'P0',
      automated: 'Automated',
    });

    list.push({
      id: nextId('TC-FEAT-API'),
      module: 'Backend API - Intelligence Feature Matrix',
      suite: 'Backend API',
      scenarioType: 'Positive',
      title: `Backend API Parameter: ${f.name}`,
      description: `Verify direct POST /v1/audio/transcriptions with ${f.featureName} parameters returns 200 on ${path.basename(f.sample)}`,
      model: f.model,
      languageCode: f.lang,
      languageName: f.langName,
      featuresEnabled: f.featureName,
      featureConfig: JSON.stringify(f.config),
      audioPath: f.sample,
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: `Valid API Key`,
      testSteps: `1. POST /v1/audio/transcriptions with multipart file and ${JSON.stringify(f.config)}\n2. Assert status 200\n3. Verify response schema`,
      expectedResult: `HTTP 200 OK. ${f.validation}`,
      expectedStatus: 'HTTP 200 OK',
      priority: 'P0',
      automated: 'Automated',
    });
  }

  // ── 6. Extensive Edge Cases (Modals, Snackbars, Alerts, Banners, Tooltips) ─
  seq = 1;
  const EDGE_CASES = [
    {
      title: 'Feature Config Pop-up Modal: Backdrop Click Dismissal',
      desc: 'Verify clicking outside feature modal on darkened backdrop dismisses the pop-up window without breaking toggle state',
      precond: 'Translation or Custom Keywords modal is open',
      steps: '1. Click "Translation" feature row\n2. Modal pop-up appears\n3. Click on darkened backdrop overlay outside modal box\n4. Verify pop-up closes safely',
      expResult: 'Modal closes smoothly; page remains interactive',
      expStatus: 'UI Pop-up Dismissed',
      prio: 'P1' as const,
    },
    {
      title: 'Feature Config Pop-up Modal: Auto-Confirm & Escape Key Interception',
      desc: 'Verify modal auto-confirms or closes safely when user presses Escape key without unhandled JavaScript exceptions',
      precond: 'Custom Keyword Hashing modal is open',
      steps: '1. Open Custom Keyword Hashing modal\n2. Type keywords\n3. Press Keyboard Escape\n4. Verify UI state',
      expResult: 'Modal closes cleanly; state handled gracefully',
      expStatus: 'UI Modal Dismissed',
      prio: 'P1' as const,
    },
    {
      title: 'Sequential Pop-up Windows Opening & Closing (Translation -> Diarization -> Hashing)',
      desc: 'Verify opening multiple configuration modals in rapid succession does not leave orphan DOM backdrops',
      precond: 'STT features panel open',
      steps: '1. Click Translation -> Confirm\n2. Click Custom Keyword Hashing -> Confirm\n3. Click Intent Detection -> Confirm',
      expResult: 'No overlapping backdrop layers; each modal opens and closes independently',
      expStatus: 'Clean DOM State',
      prio: 'P1' as const,
    },
    {
      title: 'Language Search Pop-up Modal: Large List Scrolling (55+ Languages)',
      desc: 'Verify scrolling through 55+ Indic language list in modal does not trigger scroll-chaining to main page body',
      precond: 'Language search modal open',
      steps: '1. Open language search popup\n2. Scroll rapidly from top to bottom (55+ languages)\n3. Verify main page behind modal remains fixed',
      expResult: 'Modal list scrolls smoothly with sticky search bar; body scroll is locked',
      expStatus: 'UI Scroll Lock OK',
      prio: 'P2' as const,
    },
    {
      title: 'Profile Menu Pop-up Dropdown: Outside Click Dismissal',
      desc: 'Verify clicking user profile button opens menu, clicking anywhere outside closes the popup menu',
      precond: 'User is logged in',
      steps: '1. Click profile button ("Yamini Singh")\n2. Profile dropdown appears with "Log out"\n3. Click on page background\n4. Verify dropdown closes',
      expResult: 'Profile menu dismisses cleanly',
      expStatus: 'UI Pop-up Dismissed',
      prio: 'P2' as const,
    },
    {
      title: 'Snackbar Toast Alert on Invalid File Format Upload (.txt rejection)',
      desc: 'Verify uploading non-audio document triggers a dismissible error snackbar toast',
      precond: 'STT workspace active',
      steps: '1. Upload test-invalid.txt\n2. Verify error snackbar toast appears\n3. Assert toast auto-dismisses after 5 seconds',
      expResult: 'Error toast "Please upload a valid audio file (.wav, .mp3, .m4a, .flac)" appears',
      expStatus: 'UI Snackbar Toast',
      prio: 'P0' as const,
    },
    {
      title: 'Snackbar Toast Alert on Oversized File Upload (> 25MB Limit)',
      desc: 'Verify uploading file exceeding maximum upload size threshold triggers warning snackbar',
      precond: 'File > 25MB',
      steps: '1. Attempt to upload oversized file\n2. Observe toast notification',
      expResult: 'Warning toast "File size exceeds 25MB limit" appears',
      expStatus: 'UI Snackbar Warning',
      prio: 'P1' as const,
    },
    {
      title: 'Snackbar Success Toast on Copy Code Snippet Action',
      desc: 'Verify clicking Copy Code triggers "Copied to clipboard!" snackbar toast',
      precond: 'Code Sample tab active',
      steps: '1. Click Code Sample tab\n2. Click "Copy Code" button\n3. Check toast notification',
      expResult: 'Success toast "Code copied to clipboard" displayed; button state updates to Copied',
      expStatus: 'UI Success Toast',
      prio: 'P1' as const,
    },
    {
      title: 'Snackbar Success Toast on Copy Transcript Action',
      desc: 'Verify clicking Copy Transcript triggers clipboard confirmation snackbar',
      precond: 'Transcript rendered',
      steps: '1. Click "Copy Transcript" button\n2. Check feedback toast',
      expResult: 'Snackbar confirms transcript copied to clipboard',
      expStatus: 'UI Success Toast',
      prio: 'P1' as const,
    },
    {
      title: 'Snackbar Alert on Empty TTS Text Submission',
      desc: 'Verify clicking Generate Speech with blank text triggers validation alert toast',
      precond: 'TTS textarea empty',
      steps: '1. Switch to TTS tab\n2. Click "Generate Speech" with empty input\n3. Verify alert toast',
      expResult: 'Validation toast "Please enter text to synthesize" appears',
      expStatus: 'UI Alert Toast',
      prio: 'P1' as const,
    },
    {
      title: 'Snackbar Alert on Network Interruption / Gateway Timeout',
      desc: 'Verify API disconnection during transcription triggers error alert snackbar',
      precond: 'Network offline during request',
      steps: '1. Initiate transcription\n2. Simulate network disconnect\n3. Observe error snackbar',
      expResult: 'Error toast "Network error: Unable to connect to ASR service" appears with Retry option',
      expStatus: 'UI Network Alert',
      prio: 'P0' as const,
    },
    {
      title: 'Announcement Bar: Responsive Text Wrapping on Mobile Screens (375px)',
      desc: 'Verify $5 onboarding announcement banner wraps text cleanly on small mobile viewports without overflowing screen bounds',
      precond: 'Viewport set to 375x812',
      steps: '1. Set mobile viewport\n2. Load Playground with announcement banner\n3. Verify CTA button and dismiss icon are fully clickable',
      expResult: 'Banner text wraps into multi-line cleanly; CTA and dismiss button stay inside screen',
      expStatus: 'UI Responsive Banner',
      prio: 'P2' as const,
    },
    {
      title: 'Announcement Bar: Persistence Across Route & Workspace Tab Switching',
      desc: 'Verify announcement bar remains visible when user switches between STT and TTS workspaces until dismissed',
      precond: 'Announcement banner active',
      steps: '1. Switch to TTS tab -> verify banner visible\n2. Switch to STT tab -> verify banner visible\n3. Click Docs -> return -> verify banner visible',
      expResult: 'Announcement bar state is consistent across tab transitions',
      expStatus: 'UI State Persistent',
      prio: 'P2' as const,
    },
    {
      title: 'Feature Toggle Hover Tooltips & Helper Hints',
      desc: 'Verify hovering over feature row badges displays explanatory tooltips for parameters and models',
      precond: 'Features tab open',
      steps: '1. Hover over "Translation"\n2. Hover over "Speaker Diarization"\n3. Hover over "Profanity Hashing"\n4. Assert tooltip popups',
      expResult: 'Tooltip popups render with clear feature description and pricing note',
      expStatus: 'UI Tooltip Rendered',
      prio: 'P2' as const,
    },
    {
      title: 'Credits Counter Hover Tooltip (Billing & Usage Hint)',
      desc: 'Verify hovering over Credits badge shows tooltip with current rate and wallet link',
      precond: 'User authenticated',
      steps: '1. Hover over Credits badge "$X.XX"\n2. Assert billing tooltip visibility',
      expResult: 'Tooltip displays detailed credit breakdown / manage funds link',
      expStatus: 'UI Tooltip Rendered',
      prio: 'P2' as const,
    },
    {
      title: 'Upload Pure Silence Audio File (silence.wav)',
      desc: 'Verify uploading completely silent audio is handled gracefully by ASR engine without crash',
      precond: 'File input/audio/edge/silence.wav exists',
      steps: '1. Upload input/audio/edge/silence.wav\n2. Click Run Analysis\n3. Observe response',
      expResult: 'Server returns empty transcript or silence token without 500 error',
      expStatus: 'HTTP 200 / Empty Transcript',
      prio: 'P1' as const,
    },
    {
      title: 'Upload Ultra-Short Audio File (< 0.5s short.wav)',
      desc: 'Verify micro-duration audio file (0.3s) is decoded and processed safely',
      precond: 'File input/audio/edge/short.wav exists',
      steps: '1. Upload input/audio/edge/short.wav\n2. Click Run Analysis\n3. Assert response',
      expResult: 'Short duration audio transcribed safely without duration assertion failure',
      expStatus: 'HTTP 200 OK',
      prio: 'P1' as const,
    },
    {
      title: 'Upload Corrupted Audio File (corrupted.wav)',
      desc: 'Verify corrupted WAV header byte stream is rejected by ASR backend with 400/422 and UI displays error toast',
      precond: 'File input/audio/edge/corrupted.wav exists',
      steps: '1. Upload input/audio/edge/corrupted.wav\n2. Click Run Analysis\n3. Observe rejection',
      expResult: 'HTTP 400/422 returned; UI displays "Unable to decode audio payload"',
      expStatus: 'HTTP 400 / Error Toast',
      prio: 'P0' as const,
    },
    {
      title: 'Upload 0-Byte Empty File (empty.wav)',
      desc: 'Verify 0-byte file buffer is caught by frontend/backend validation',
      precond: 'File input/audio/edge/empty.wav exists',
      steps: '1. Upload input/audio/edge/empty.wav\n2. Verify Run Analysis behavior',
      expResult: '0-byte file rejected; error notification displayed',
      expStatus: 'Validation Error',
      prio: 'P1' as const,
    },
    {
      title: 'Upload Long Medical Audio (20+ Minute Consultation)',
      desc: 'Verify uploading and processing large 320kbps medical consultation audio with chunking and VAD',
      precond: 'Long medical file available',
      steps: '1. Upload input/indicvoices_data/audio/Long_Medical_files/Mania (Bipolar Disorder) _ Mental State Examination (MSE) _ OSCE Guide _  SCA Case _ UKMLA _ CPSA - (320 Kbps).mp3\n2. Select Zero Med\n3. Click Run Analysis (timeout 300s)\n4. Assert multi-segment output',
      expResult: 'Full consultation transcribed across multiple segments with timestamps',
      expStatus: 'HTTP 200 / Long Transcript',
      prio: 'P1' as const,
    },
    {
      title: 'Upload OGG Vorbis Audio Format (Gillidanda_Interview1.ogg)',
      desc: 'Verify OGG Vorbis audio container decoding and transcription',
      precond: 'OGG reference audio exists',
      steps: '1. Upload input/audio/reference/PeopleAreKnowledge_Gillidanda_Interview1.ogg\n2. Click Run Analysis\n3. Assert transcript',
      expResult: 'OGG file decoded and transcribed cleanly',
      expStatus: 'HTTP 200 OK',
      prio: 'P1' as const,
    },
    {
      title: 'Rapid Audio Playback Controls Spamming (Play/Pause 10x)',
      desc: 'Verify rapidly spamming Play and Pause buttons on audio player does not cause audio context buffer overlap',
      precond: 'Audio loaded in player',
      steps: '1. Upload audio\n2. Click Play/Pause toggle 10 times in 2 seconds\n3. Assert player state stabilizes',
      expResult: 'Audio player state remains stable without audio stutter or browser audio freeze',
      expStatus: 'UI Player Stable',
      prio: 'P2' as const,
    },
    {
      title: 'Audio Waveform Scrubber Seeking While Audio Playing',
      desc: 'Verify dragging scrubber across timeline during active playback smoothly seeks audio position',
      precond: 'Audio playing',
      steps: '1. Play audio\n2. Drag scrubber to 50% duration\n3. Verify audio playback resumes from midpoint',
      expResult: 'Audio seeks cleanly to new timestamp offset',
      expStatus: 'UI Player Seek OK',
      prio: 'P2' as const,
    },
    {
      title: 'Replacing Uploaded Audio File Dynamically',
      desc: 'Verify uploading a second audio file smoothly replaces the first file without requiring manual deletion',
      precond: 'First audio file uploaded',
      steps: '1. Upload WAV file\n2. Upload MP3 file without clicking remove\n3. Verify player and duration update to new file',
      expResult: 'Player updates immediately to new file waveform and duration',
      expStatus: 'UI Player Updated',
      prio: 'P1' as const,
    },
    {
      title: 'Rapid Run Analysis Button Double-Click (Debouncing & Request Deduplication)',
      desc: 'Verify clicking Run Analysis button twice rapidly triggers only 1 API request and disables button during processing',
      precond: 'Audio uploaded',
      steps: '1. Double-click "Run Analysis" button rapidly within 100ms\n2. Intercept network requests\n3. Assert only 1 POST /v1/audio/transcriptions request dispatched',
      expResult: 'Request is debounced; spinner is visible; single analysis executed',
      expStatus: '1 Request Dispatched',
      prio: 'P0' as const,
    },
    {
      title: 'Page Reload During Active Transcription (Loading Spinner State)',
      desc: 'Verify reloading page while analysis is in progress cancels pending request cleanly without corrupting UI',
      precond: 'Analysis in flight',
      steps: '1. Click Run Analysis\n2. Immediately reload page\n3. Verify Playground re-renders in clean default state',
      expResult: 'Page reloads cleanly without broken state or persistent spinner',
      expStatus: 'Clean Page Reload',
      prio: 'P1' as const,
    },
    {
      title: 'XSS Sanitization in Custom Keyword Input Field',
      desc: 'Verify typing `<img src=x onerror=alert(1)>` in custom keyword hashing modal is escaped and safely handled',
      precond: 'Custom keyword modal open',
      steps: '1. Open Custom Keyword Hashing modal\n2. Type `<img src=x onerror=alert(1)>`\n3. Click Confirm\n4. Verify DOM inspection',
      expResult: 'Payload treated as literal string; zero JavaScript execution in browser',
      expStatus: 'Sanitized Literal String',
      prio: 'P0' as const,
    },
    {
      title: 'Special Unicode & Emojis in TTS Text Input',
      desc: 'Verify entering text with emojis (🎉🔥🇮🇳) and Zero-Width Joiners in TTS input does not crash synthesis engine',
      precond: 'TTS tab active',
      steps: '1. Enter "नमस्ते! 🎉 Welcome to Shunya Labs 🔥🚀"\n2. Click Generate Speech\n3. Assert response',
      expResult: 'Emojis stripped or handled gracefully; speech generated for spoken characters',
      expStatus: 'HTTP 200 / Speech Synthesized',
      prio: 'P1' as const,
    },
  ];

  for (const edge of EDGE_CASES) {
    list.push({
      id: nextId('TC-EDGE'),
      module: 'UI - Negative & Edge Cases',
      suite: 'UI',
      scenarioType: 'Edge Case',
      title: edge.title,
      description: edge.desc,
      model: 'zero-indic',
      languageCode: 'auto',
      languageName: 'Auto',
      featuresEnabled: 'Edge Case Test',
      featureConfig: '{}',
      audioPath: 'input/audio/edge/silence.wav',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: edge.precond,
      testSteps: edge.steps,
      expectedResult: edge.expResult,
      expectedStatus: edge.expStatus,
      priority: edge.prio,
      automated: 'Automated',
    });
  }

  // ── 7. Text to Speech (TTS) Synthesis Matrix (10 cases) ───────────────────
  seq = 1;
  const TTS_SCENARIOS = [
    { lang: 'en', voice: 'shunya-female-1', speed: '1.0', format: 'mp3', text: 'Welcome to Shunya Labs speech synthesis platform.' },
    { lang: 'en', voice: 'shunya-male-1', speed: '1.0', format: 'mp3', text: 'Experience natural sounding AI voices for your applications.' },
    { lang: 'hi', voice: 'shunya-female-1', speed: '1.0', format: 'mp3', text: 'नमस्ते, शून्या लैब्स में आपका स्वागत है।' },
    { lang: 'hi', voice: 'shunya-male-1', speed: '1.25', format: 'mp3', text: 'यह भारतीय भाषाओं के लिए विशेष रूप से निर्मित आवाज है।' },
    { lang: 'bn', voice: 'shunya-female-1', speed: '1.0', format: 'mp3', text: 'শূন্যা ল্যাবসে আপনাকে স্বাগতম।' },
    { lang: 'ta', voice: 'shunya-female-1', speed: '1.0', format: 'mp3', text: 'ஷூன்யா லேப்ஸுக்கு வரவேற்கிறோம்.' },
    { lang: 'te', voice: 'shunya-female-1', speed: '1.0', format: 'mp3', text: 'శూన్య ల్యాబ్స్‌కు స్వాగతం.' },
    { lang: 'en', voice: 'shunya-female-1', speed: '0.5', format: 'wav', text: 'Slow playback speech test for accessibility.' },
    { lang: 'en', voice: 'shunya-female-1', speed: '1.5', format: 'wav', text: 'Fast playback speech test for quick audio previews.' },
    { lang: 'en', voice: 'shunya-female-1', speed: '2.0', format: 'mp3', text: 'Double speed audio generation test.' },
  ];

  for (const t of TTS_SCENARIOS) {
    list.push({
      id: nextId('TC-TTS-SYN'),
      module: 'UI - Text to Speech',
      suite: 'UI',
      scenarioType: 'Positive',
      title: `TTS UI Synthesis: ${t.lang.toUpperCase()} voice=${t.voice} speed=${t.speed}x`,
      description: `Verify typing "${t.text.slice(0, 30)}...", selecting voice ${t.voice}, speed ${t.speed}x, generating audio`,
      model: 'N/A',
      languageCode: t.lang,
      languageName: t.lang === 'hi' ? 'Hindi' : t.lang === 'bn' ? 'Bengali' : t.lang === 'ta' ? 'Tamil' : t.lang === 'te' ? 'Telugu' : 'English',
      featuresEnabled: 'TTS Speech Synthesis',
      featureConfig: JSON.stringify({ voice: t.voice, speed: t.speed, format: t.format }),
      audioPath: 'N/A',
      ttsInputText: t.text,
      ttsVoiceAndSpeed: `Voice: ${t.voice} | Speed: ${t.speed}x | Format: ${t.format}`,
      preconditions: 'TTS tab active',
      testSteps: `1. Switch to Text to Speech tab\n2. Enter text "${t.text}"\n3. Select voice "${t.voice}"\n4. Set speed slider to ${t.speed}x\n5. Click Generate Speech`,
      expectedResult: `Audio synthesized; audio player populates with waveform; play button plays synthesized voice`,
      expectedStatus: 'HTTP 200 / Audio Generated',
      priority: 'P0',
      automated: 'Automated',
    });

    list.push({
      id: nextId('TC-TTS-API'),
      module: 'Backend API - TTS Speech Synthesis',
      suite: 'Backend API',
      scenarioType: 'Positive',
      title: `Backend POST /v1/audio/speech: ${t.lang.toUpperCase()} voice=${t.voice}`,
      description: `Verify direct POST https://ttsv2.shunyalabs.ai/v1/audio/speech returns binary audio stream`,
      model: 'N/A',
      languageCode: t.lang,
      languageName: t.lang,
      featuresEnabled: 'TTS Synthesis',
      featureConfig: JSON.stringify({ input: t.text, voice: t.voice, speed: parseFloat(t.speed), response_format: t.format }),
      audioPath: 'N/A',
      ttsInputText: t.text,
      ttsVoiceAndSpeed: `Voice: ${t.voice} | Speed: ${t.speed}x`,
      preconditions: 'Valid API Key; TTS service live',
      testSteps: `1. POST /v1/audio/speech with input, voice, speed, response_format\n2. Assert status 200\n3. Verify binary Content-Type audio/mpeg or audio/wav`,
      expectedResult: 'HTTP 200 OK; Content-Type: audio/mpeg; non-zero binary payload',
      expectedStatus: 'HTTP 200 OK',
      priority: 'P0',
      automated: 'Automated',
    });
  }

  // ── 8. Backend Negative, Auth & Stress Suite (6 cases) ────────────────────
  seq = 1;
  list.push(
    {
      id: nextId('TC-API-NEG'),
      module: 'Backend API - Negative, Auth & Stress',
      suite: 'Backend API',
      scenarioType: 'Negative',
      title: 'Missing Authorization Header Returns 401 Unauthorized',
      description: 'Verify ASR API returns 401 when Authorization header is absent',
      model: 'zero-indic',
      languageCode: 'auto',
      languageName: 'Auto',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'input/indicvoices_data/audio/Hindi/37.mp3',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'No auth headers',
      testSteps: '1. POST /v1/audio/transcriptions without Authorization header\n2. Assert status 401',
      expectedResult: 'HTTP 401 Unauthorized',
      expectedStatus: 'HTTP 401 Unauthorized',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: nextId('TC-API-NEG'),
      module: 'Backend API - Negative, Auth & Stress',
      suite: 'Backend API',
      scenarioType: 'Negative',
      title: 'Invalid API Key / Bearer Token Returns 401 or 403',
      description: 'Verify ASR API rejects forged token "Bearer invalid_api_key_xyz_12345"',
      model: 'zero-indic',
      languageCode: 'auto',
      languageName: 'Auto',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'input/indicvoices_data/audio/Hindi/37.mp3',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Bad token',
      testSteps: '1. POST /v1/audio/transcriptions with Authorization: "Bearer invalid_key_xyz"\n2. Assert status in [401, 403]',
      expectedResult: 'HTTP 401 / 403 Unauthorized',
      expectedStatus: 'HTTP 401 / 403',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: nextId('TC-API-NEG'),
      module: 'Backend API - Negative, Auth & Stress',
      suite: 'Backend API',
      scenarioType: 'Negative',
      title: 'Missing Audio File in Multipart Payload Returns 400 or 422',
      description: 'Verify POSTing without file field returns 400/422',
      model: 'zero-indic',
      languageCode: 'hi',
      languageName: 'Hindi',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'N/A',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Valid API Key',
      testSteps: '1. POST /v1/audio/transcriptions with model="zero-indic", language_code="hi" (no file)\n2. Assert status >= 400',
      expectedResult: 'HTTP 400 Bad Request or 422 Unprocessable Entity',
      expectedStatus: 'HTTP 400 / 422',
      priority: 'P0',
      automated: 'Automated',
    },
    {
      id: nextId('TC-API-NEG'),
      module: 'Backend API - Negative, Auth & Stress',
      suite: 'Backend API',
      scenarioType: 'Negative',
      title: 'Corrupted Audio Byte Buffer Payload Returns 400 or 422',
      description: 'Verify sending corrupt garbage byte stream as audio file is rejected cleanly',
      model: 'zero-indic',
      languageCode: 'auto',
      languageName: 'Auto',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'input/audio/edge/corrupted.wav',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Valid API Key',
      testSteps: '1. POST /v1/audio/transcriptions with input/audio/edge/corrupted.wav\n2. Assert status >= 400',
      expectedResult: 'HTTP 400 / 422 Client Error; server does not crash',
      expectedStatus: 'HTTP 400 / 422',
      priority: 'P1',
      automated: 'Automated',
    },
    {
      id: nextId('TC-API-NEG'),
      module: 'Backend API - Negative, Auth & Stress',
      suite: 'Backend API',
      scenarioType: 'Boundary',
      title: '0-Byte Empty Audio Buffer Payload Returns 400 or 422',
      description: 'Verify sending 0-byte Buffer.alloc(0) is rejected',
      model: 'zero-indic',
      languageCode: 'auto',
      languageName: 'Auto',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'input/audio/edge/empty.wav',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Valid API Key',
      testSteps: '1. POST /v1/audio/transcriptions with input/audio/edge/empty.wav\n2. Assert status >= 400',
      expectedResult: 'HTTP 400 / 422 Client Error',
      expectedStatus: 'HTTP 400 / 422',
      priority: 'P1',
      automated: 'Automated',
    },
    {
      id: nextId('TC-API-NEG'),
      module: 'Backend API - Negative, Auth & Stress',
      suite: 'Backend API',
      scenarioType: 'Stress',
      title: 'Concurrency Burst Test: 3 Parallel Transcription Requests',
      description: 'Verify ASR service handles burst of 3 concurrent requests without dropping or failing',
      model: 'zero-indic',
      languageCode: 'auto',
      languageName: 'Auto',
      featuresEnabled: 'None',
      featureConfig: '{}',
      audioPath: 'input/CodeSwitchvoices_data/audio/hinglish_arti.wav',
      ttsInputText: 'N/A',
      ttsVoiceAndSpeed: 'N/A',
      preconditions: 'Valid API Key; audio available',
      testSteps: '1. Dispatch 3 parallel POST /v1/audio/transcriptions requests via Promise.all\n2. Assert each status is in [200, 429]',
      expectedResult: 'All 3 requests succeed (200) or are gracefully rate limited (429); zero 500 errors',
      expectedStatus: 'HTTP 200 / 429 OK',
      priority: 'P1',
      automated: 'Automated',
    }
  );

  return list;
}

// ── Color Schemes for Categories & Models ───────────────────────────────────

const MODULE_COLORS: Record<string, { bg: string; text?: string }> = {
  'Authentication & Session': { bg: '#e8eaf6', text: '#1a237e' }, // Soft Indigo
  'Onboarding Journey': { bg: '#e0f7fa', text: '#006064' },       // Soft Cyan
  'UI - Layout & Navigation': { bg: '#e1f5fe', text: '#01579b' }, // Soft Light Blue
  'UI - Model & Language Selection': { bg: '#f3e5f5', text: '#4a148c' }, // Soft Purple
  'UI - Intelligence Features': { bg: '#fff8e1', text: '#f57f17' },      // Soft Amber
  'UI - Text to Speech': { bg: '#fce4ec', text: '#880e4f' },             // Soft Pink
  'UI - Negative & Edge Cases': { bg: '#fff3e0', text: '#e65100' },      // Soft Orange
  'Backend API - Intelligence Feature Matrix': { bg: '#e8f5e9', text: '#1b5e20' }, // Soft Mint Green
  'Backend API - TTS Speech Synthesis': { bg: '#ffebee', text: '#b71c1c' },        // Soft Rose
  'Backend API - Negative, Auth & Stress': { bg: '#fbe9e7', text: '#bf360c' },     // Soft Deep Orange
};

const MODEL_COLORS: Record<string, { bg: string; text: string }> = {
  'zero-indic': { bg: '#c8e6c9', text: '#1b5e20' }, // Green
  'zero-codeswitch': { bg: '#ffe0b2', text: '#e65100' }, // Orange
  'zero-medasr': { bg: '#ffcdd2', text: '#b71c1c' }, // Red
  'zero-indic, zero-codeswitch, zero-medasr': { bg: '#d1c4e9', text: '#311b92' }, // Purple
  'N/A': { bg: '#f5f5f5', text: '#757575' }, // Gray
};

const SUITE_COLORS: Record<string, { bg: string; text: string }> = {
  UI: { bg: '#bbdefb', text: '#0d47a1' },
  'Backend API': { bg: '#b2dfdb', text: '#004d40' },
  'End-to-End': { bg: '#d1c4e9', text: '#311b92' },
};

const SCENARIO_COLORS: Record<string, { bg: string; text: string }> = {
  Positive: { bg: '#e8f5e9', text: '#2e7d32' },
  Negative: { bg: '#ffebee', text: '#c62828' },
  'Edge Case': { bg: '#fff9c4', text: '#f57f17' },
  Boundary: { bg: '#ffe0b2', text: '#ef6c00' },
  Security: { bg: '#fce4ec', text: '#ad1457' },
  Stress: { bg: '#ede7f6', text: '#4527a0' },
};

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  P0: { bg: '#ffcdd2', text: '#b71c1c' }, // High Priority - Red
  P1: { bg: '#bbdefb', text: '#0d47a1' }, // Medium - Blue
  P2: { bg: '#fff9c4', text: '#f57f17' }, // Low - Yellow
};

async function run() {
  console.log(`Connecting to Google Sheets API using: ${KEY_FILE_PATH}`);
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const testCases = generateTestCases();
  console.log(`Generated ${testCases.length} exhaustive test cases!`);

  const rows: string[][] = [HEADERS];
  for (const tc of testCases) {
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
      tc.featureConfig,
      tc.audioPath,
      tc.ttsInputText,
      tc.ttsVoiceAndSpeed,
      tc.preconditions,
      tc.testSteps,
      tc.expectedResult,
      tc.expectedStatus,
      tc.priority,
      tc.automated,
    ]);
  }

  console.log(`Clearing existing content in spreadsheet: ${SPREADSHEET_ID}`);
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Master_Test_Scenarios!A1:Z2000',
  });

  console.log(`Writing ${rows.length} rows...`);
  const updateRes = await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Master_Test_Scenarios!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: rows,
    },
  });
  console.log(`Updated ${updateRes.data.updatedRows} rows, ${updateRes.data.updatedColumns} columns.`);

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetId = meta.data.sheets?.[0]?.properties?.sheetId || 0;

  console.log(`Applying styling (navy header, colored modules/categories, models, priorities) to sheetId ${sheetId}...`);

  const formatRequests: any[] = [
    // 1. Sheet properties
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          title: 'Master_Test_Scenarios',
          gridProperties: {
            frozenRowCount: 1,
            frozenColumnCount: 2,
          },
        },
        fields: 'title,gridProperties.frozenRowCount,gridProperties.frozenColumnCount',
      },
    },
    // 2. Header formatting (Deep Navy)
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: HEADERS.length,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.08, green: 0.18, blue: 0.36 }, // Deep Navy
            textFormat: {
              foregroundColor: { red: 1, green: 1, blue: 1 },
              bold: true,
              fontSize: 11,
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
      },
    },
  ];

  // Column indices (0-based)
  const COL_MODULE = 1;
  const COL_SUITE = 2;
  const COL_SCENARIO = 3;
  const COL_MODEL = 6;
  const COL_PRIORITY = 18;

  testCases.forEach((tc, index) => {
    const rowIndex = index + 1; // row 1 is header

    // 1. Module / Category color
    const modConfig = MODULE_COLORS[tc.module];
    if (modConfig) {
      const bg = hexToRgb(modConfig.bg);
      const fg = modConfig.text ? hexToRgb(modConfig.text) : { red: 0, green: 0, blue: 0 };
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: COL_MODULE,
            endColumnIndex: COL_MODULE + 1,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: bg,
              textFormat: {
                foregroundColor: fg,
                bold: true,
              },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      });
    }

    // 2. Model color
    const modelConfig = MODEL_COLORS[tc.model] || { bg: '#f5f5f5', text: '#333333' };
    const modelBg = hexToRgb(modelConfig.bg);
    const modelFg = hexToRgb(modelConfig.text);
    formatRequests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: rowIndex,
          endRowIndex: rowIndex + 1,
          startColumnIndex: COL_MODEL,
          endColumnIndex: COL_MODEL + 1,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: modelBg,
            textFormat: {
              foregroundColor: modelFg,
              bold: true,
            },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    });

    // 3. Suite Type color
    const suiteConfig = SUITE_COLORS[tc.suite];
    if (suiteConfig) {
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: COL_SUITE,
            endColumnIndex: COL_SUITE + 1,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: hexToRgb(suiteConfig.bg),
              textFormat: { foregroundColor: hexToRgb(suiteConfig.text), bold: true },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      });
    }

    // 4. Scenario Type color
    const scenConfig = SCENARIO_COLORS[tc.scenarioType];
    if (scenConfig) {
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: COL_SCENARIO,
            endColumnIndex: COL_SCENARIO + 1,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: hexToRgb(scenConfig.bg),
              textFormat: { foregroundColor: hexToRgb(scenConfig.text), bold: true },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      });
    }

    // 5. Priority color
    const prioConfig = PRIORITY_COLORS[tc.priority];
    if (prioConfig) {
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: COL_PRIORITY,
            endColumnIndex: COL_PRIORITY + 1,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: hexToRgb(prioConfig.bg),
              textFormat: { foregroundColor: hexToRgb(prioConfig.text), bold: true },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      });
    }
  });

  // Auto resize columns
  formatRequests.push({
    autoResizeDimensions: {
      dimensions: {
        sheetId,
        dimension: 'COLUMNS',
        startIndex: 0,
        endIndex: HEADERS.length,
      },
    },
  });

  // Execute batchUpdate in chunks of 500 to stay within API batch limits
  const CHUNK_SIZE = 500;
  for (let i = 0; i < formatRequests.length; i += CHUNK_SIZE) {
    const chunk = formatRequests.slice(i, i + CHUNK_SIZE);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: chunk,
      },
    });
  }

  console.log('Successfully formatted Master Input Sheet with Module, Model, Suite, and Priority color coding!');
}

run().catch((err) => {
  console.error('Failed to populate exhaustive master input sheet:', err);
  process.exit(1);
});
