/**
 * Write Master Test Cases Sheet
 *
 * Writes ALL test cases (from every spec file) to a "Master-Test-Cases" tab
 * in the playground output Google Sheet, with formatting and color coding.
 *
 * Usage:  npx ts-node scripts/write-master-test-sheet.ts
 */

import { google, sheets_v4 } from 'googleapis';
import { GOOGLE_SHEETS_CONFIG } from '../src/config/api.config';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// ── Interfaces ──────────────────────────────────────────────────────────────

interface TestCase {
  id: string;
  category: string;
  module: string;
  test_name: string;
  type: string;
  priority: string;
  status: string;
  last_run_date: string;
  last_result: string;
}

// ── Auth (same pattern as playgroundSheetWriter.ts) ─────────────────────────

async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  let auth;

  if (GOOGLE_SHEETS_CONFIG.credentials) {
    try {
      let credentials;
      try {
        credentials = JSON.parse(GOOGLE_SHEETS_CONFIG.credentials);
      } catch {
        try {
          credentials = JSON.parse(
            Buffer.from(GOOGLE_SHEETS_CONFIG.credentials, 'base64').toString('utf-8')
          );
        } catch {
          auth = new google.auth.GoogleAuth({
            keyFile: GOOGLE_SHEETS_CONFIG.credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
          });
          const client = await auth.getClient();
          return google.sheets({ version: 'v4', auth: client as any });
        }
      }

      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    } catch (error) {
      throw new Error(
        `Failed to parse Google Sheets credentials: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  } else if (GOOGLE_SHEETS_CONFIG.clientEmail && GOOGLE_SHEETS_CONFIG.privateKey) {
    auth = new google.auth.JWT(
      GOOGLE_SHEETS_CONFIG.clientEmail,
      undefined,
      GOOGLE_SHEETS_CONFIG.privateKey,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
  } else {
    throw new Error(
      'Google Sheets credentials not configured. Please set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env'
    );
  }

  const client = await (auth as any).getClient();
  return google.sheets({ version: 'v4', auth: client as any });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getSpreadsheetId(): string {
  return (
    process.env.GOOGLE_SHEET_ID_PLAYGROUND_OUTPUT ||
    GOOGLE_SHEETS_CONFIG.spreadsheetId
  );
}

function colLetter(colNum: number): string {
  let letter = '';
  let n = colNum;
  while (n > 0) {
    n--;
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26);
  }
  return letter;
}

function hexToColor(hex: string): { red: number; green: number; blue: number; alpha: number } {
  const h = hex.replace('#', '');
  return {
    red: parseInt(h.substring(0, 2), 16) / 255,
    green: parseInt(h.substring(2, 4), 16) / 255,
    blue: parseInt(h.substring(4, 6), 16) / 255,
    alpha: 1.0,
  };
}

function tcId(n: number): string {
  return `TC-${String(n).padStart(3, '0')}`;
}

async function findOrCreateSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string
): Promise<number> {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const existingSheet = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === sheetName
  );

  if (existingSheet) {
    // Clear the existing sheet before rewriting
    const sheetId = existingSheet.properties?.sheetId || 0;
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
    });
    return sheetId;
  }

  const createResponse = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    },
  });

  return createResponse.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;
}

// ── Auto-scan spec files ────────────────────────────────────────────────────

function scanTestsFromSpec(): TestCase[] {
  const specPath = path.resolve(__dirname, '..', 'src', 'tests', 'playgroundUI.spec.ts');
  const src = fs.readFileSync(specPath, 'utf-8');
  const lines = src.split('\n');

  const tests: TestCase[] = [];
  let currentDescribe = '';
  let n = 0;

  for (const line of lines) {
    const d = line.match(/test\.describe\(['`]([^'`]+)['`]/);
    if (d) currentDescribe = d[1];
    const t = line.match(/^\s*test\(['`]([^'`]+)['`]/);
    if (t && currentDescribe) {
      n++;
      const moduleFull = currentDescribe.replace(/^Playground — /, '');
      const priority =
        /Feature Verification/.test(moduleFull) ? 'P0' :
        /Functional/.test(moduleFull) ? 'P0' :
        /Negative/.test(moduleFull) ? 'P3' :
        /Edge Cases?/.test(moduleFull) ? 'P2' :
        /Additional/.test(moduleFull) ? 'P1' :
        'P0';
      const type = /Functional|Feature Verification|API|Network|Performance/.test(moduleFull)
        ? 'Integration' : 'Functional/UI';
      const category =
        /TTS|Text to Speech/i.test(moduleFull) ? 'Text to Speech' :
        /Feature Verification/.test(moduleFull) ? 'Feature Verification' :
        /STT|Speech to Text|Upload|Transcript|Credits|Tab Navigation|Model Selection|Language|Audio Intelligence|Page Load|Sample Audio/i.test(moduleFull) ? 'Speech to Text' :
        'Playground UI';
      tests.push({
        id: tcId(n),
        category,
        module: moduleFull,
        test_name: t[1],
        type,
        priority,
        status: '',
        last_run_date: '',
        last_result: '',
      });
    }
  }
  return tests;
}

// ── All 314 Test Cases ──────────────────────────────────────────────────────

function buildAllTestCases(): TestCase[] {
  const tests: TestCase[] = [];
  let n = 0;

  const add = (category: string, module: string, test_name: string, type: string, priority: string) => {
    n++;
    tests.push({
      id: tcId(n),
      category,
      module,
      test_name,
      type,
      priority,
      status: '',
      last_run_date: '',
      last_result: '',
    });
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Page Load & Layout (10 tests, P0)
  // ══════════════════════════════════════════════════════════════════════════

  const UI = 'Playground UI';
  const FUI = 'Functional/UI';

  add(UI, 'Page Load & Layout', 'should load the Playground page with correct title', FUI, 'P0');
  add(UI, 'Page Load & Layout', 'should display Shunya Labs navigation bar', FUI, 'P0');
  add(UI, 'Page Load & Layout', 'should display Credits balance', FUI, 'P0');
  add(UI, 'Page Load & Layout', 'should display all three service tabs', FUI, 'P0');
  add(UI, 'Page Load & Layout', 'should display Configuration section with labels', FUI, 'P0');
  add(UI, 'Page Load & Layout', 'should display Upload Audio section', FUI, 'P0');
  add(UI, 'Page Load & Layout', 'should display Features and Code Sample tabs', FUI, 'P0');
  add(UI, 'Page Load & Layout', 'should display Transcript and JSON output tabs', FUI, 'P0');
  add(UI, 'Page Load & Layout', 'should display Run Analysis button', FUI, 'P0');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Page Load: Additional + Edge Cases (28 tests, P1)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Page Load: Additional + Edge Cases', 'page title tag should be "Shunya Labs Playground"', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'subtitle text should describe the playground purpose', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'page should not display any error banners on load', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'page should load within acceptable time (< 10s)', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'Docs button should be clickable', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'Console button should be clickable', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'user profile button should show logged-in user name', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'SHUNYA LABS logo/brand should be visible', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'Credits balance should show a positive dollar amount', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'Credits should not show NaN or undefined', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'exactly three service tabs should be present (no more, no less)', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'all three service tabs should be clickable/enabled', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'Transcription Mode should default to Prerecorded', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'Model dropdown should default to Zero Indic', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'Language should default to English', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'Configuration heading should not be empty', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'Choose Audio File button should be clickable', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'supported formats text should mention MP3, WAV, FLAC, M4A', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'no file should be pre-selected on page load', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'file input should accept audio MIME types', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'Features tab should show Audio Intelligence heading', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'Features tab should show Intelligence Features heading', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'all 12 feature toggles should be present', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'transcript area should show placeholder text before analysis', FUI, 'P1');
  add(UI, 'Page Load: Additional + Edge Cases', 'Run Analysis button should be clickable', FUI, 'P1');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Page Load: Negative Tests (10 tests, P2)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Page Load: Negative Tests', 'should redirect to login when accessing without auth', FUI, 'P2');
  add(UI, 'Page Load: Negative Tests', 'should not display playground content when unauthenticated', FUI, 'P2');
  add(UI, 'Page Load: Negative Tests', 'should handle invalid playground URL path gracefully', FUI, 'P2');
  add(UI, 'Page Load: Negative Tests', 'page should not have any JavaScript console errors on load', FUI, 'P2');
  add(UI, 'Page Load: Negative Tests', 'page should not have broken images', FUI, 'P2');
  add(UI, 'Page Load: Negative Tests', 'page should not have any failed network requests (4xx/5xx)', FUI, 'P2');
  add(UI, 'Page Load: Negative Tests', 'Run Analysis without uploading audio should not crash', FUI, 'P2');
  add(UI, 'Page Load: Negative Tests', 'page should be responsive at mobile viewport (375px)', FUI, 'P2');
  add(UI, 'Page Load: Negative Tests', 'page should be responsive at tablet viewport (768px)', FUI, 'P2');
  add(UI, 'Page Load: Negative Tests', 'page should handle rapid refresh without breaking', FUI, 'P2');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Credits: Positive Tests (7 tests, P1)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Credits: Positive Tests', 'Credits badge should be visible in Configuration section', FUI, 'P1');
  add(UI, 'Credits: Positive Tests', 'Credits should display dollar symbol with amount', FUI, 'P1');
  add(UI, 'Credits: Positive Tests', 'Credits amount should be a valid number format (X.XX or X,XXX.XX)', FUI, 'P1');
  add(UI, 'Credits: Positive Tests', 'Credits should persist after page refresh', FUI, 'P1');
  add(UI, 'Credits: Positive Tests', 'Credits should persist after switching tabs (STT → TTS → STT)', FUI, 'P1');
  add(UI, 'Credits: Positive Tests', 'with positive credits, Run Analysis should produce transcription result', FUI, 'P1');
  add(UI, 'Credits: Positive Tests', 'credits should decrease after a successful transcription', FUI, 'P1');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Credits: Zero & Negative Balance Tests (4 tests, P2)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Credits: Zero & Negative Balance Tests', 'with $0.00 credits, Run Analysis button should still be clickable', FUI, 'P2');
  add(UI, 'Credits: Zero & Negative Balance Tests', 'with $0.00 credits, Run Analysis should NOT produce transcription but show CTA', FUI, 'P2');
  add(UI, 'Credits: Zero & Negative Balance Tests', 'with negative credits, should show "Add funds" CTA', FUI, 'P2');
  add(UI, 'Credits: Zero & Negative Balance Tests', 'with $0 credits, transcription result area should not show transcript text', FUI, 'P2');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Credits: Edge Cases (7 tests, P2)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Credits: Edge Cases', 'Credits format should handle large amounts (e.g. $1,234.56)', FUI, 'P2');
  add(UI, 'Credits: Edge Cases', 'Credits should not show more than 2 decimal places', FUI, 'P2');
  add(UI, 'Credits: Edge Cases', 'Credits should update in real-time after transcription (no stale cache)', FUI, 'P2');
  add(UI, 'Credits: Edge Cases', 'Credits badge should be visible in both STT and TTS tabs', FUI, 'P2');
  add(UI, 'Credits: Edge Cases', 'Credits should show same value in both STT and TTS tabs', FUI, 'P2');
  add(UI, 'Credits: Edge Cases', 'Credits badge should not be editable/input by user', FUI, 'P2');
  add(UI, 'Credits: Edge Cases', 'multiple rapid Run Analysis clicks should not double-deduct credits', FUI, 'P2');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Credits: Negative Tests (6 tests, P3)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Credits: Negative Tests', 'Credits should not show HTML tags or raw code', FUI, 'P3');
  add(UI, 'Credits: Negative Tests', 'Credits should not display negative sign for positive balance', FUI, 'P3');
  add(UI, 'Credits: Negative Tests', 'Credits should handle network error gracefully (not crash page)', FUI, 'P3');
  add(UI, 'Credits: Negative Tests', 'Credits area should not be vulnerable to XSS (no script execution)', FUI, 'P3');
  add(UI, 'Credits: Negative Tests', 'with zero credits, JSON tab should not show transcription data', FUI, 'P3');
  add(UI, 'Credits: Negative Tests', 'credits deduction should not happen for failed/errored transcriptions', FUI, 'P3');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Tab Navigation (4 tests, P0)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Tab Navigation', 'Speech to Text tab should be active by default', FUI, 'P0');
  add(UI, 'Tab Navigation', 'should switch to Text to Speech tab', FUI, 'P0');
  add(UI, 'Tab Navigation', 'should switch back to Speech to Text from another tab', FUI, 'P0');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Tab Navigation: Additional Positive Tests (22 tests, P1)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Tab Navigation: Additional Positive Tests', 'STT tab should display Transcription Mode field', FUI, 'P1');
  add(UI, 'Tab Navigation: Additional Positive Tests', 'STT tab should display Model dropdown', FUI, 'P1');
  add(UI, 'Tab Navigation: Additional Positive Tests', 'STT tab should display Language selector', FUI, 'P1');
  add(UI, 'Tab Navigation: Additional Positive Tests', 'STT tab should show Upload Audio section', FUI, 'P1');
  add(UI, 'Tab Navigation: Additional Positive Tests', 'STT tab should show Features panel', FUI, 'P1');
  add(UI, 'Tab Navigation: Additional Positive Tests', 'STT tab should show output area with Transcript and JSON tabs', FUI, 'P1');
  add(UI, 'Tab Navigation: Additional Positive Tests', 'TTS tab should display Synthesis Mode field', FUI, 'P1');
  add(UI, 'Tab Navigation: Additional Positive Tests', 'TTS tab should display Batch and Streaming mode options', FUI, 'P1');
  add(UI, 'Tab Navigation: Additional Positive Tests', 'TTS tab should display text input area', FUI, 'P1');
  add(UI, 'Tab Navigation: Additional Positive Tests', 'TTS tab should display character counter', FUI, 'P1');
  add(UI, 'Tab Navigation: Additional Positive Tests', 'TTS tab should display Voice Options section', FUI, 'P1');
  add(UI, 'Tab Navigation: Additional Positive Tests', 'TTS tab should display Output Options section', FUI, 'P1');
  add(UI, 'Tab Navigation: Additional Positive Tests', 'TTS tab should display Run Synthesis button', FUI, 'P1');
  add(UI, 'Tab Navigation: Additional Positive Tests', 'TTS tab should display Audio Player section', FUI, 'P1');
  add(UI, 'Tab Navigation: Additional Positive Tests', 'switching STT → TTS should hide STT-specific content', FUI, 'P1');
  add(UI, 'Tab Navigation: Additional Positive Tests', 'switching TTS → STT should hide TTS-specific content', FUI, 'P1');
  add(UI, 'Tab Navigation: Additional Positive Tests', 'Credits should remain visible across all tab switches', FUI, 'P1');
  add(UI, 'Tab Navigation: Additional Positive Tests', 'nav bar should remain visible across all tab switches', FUI, 'P1');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Tab Navigation: Edge Cases (8 tests, P2)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Tab Navigation: Edge Cases', 'clicking the already active STT tab should not break the page', FUI, 'P2');
  add(UI, 'Tab Navigation: Edge Cases', 'clicking the already active TTS tab should not break the page', FUI, 'P2');
  add(UI, 'Tab Navigation: Edge Cases', 'rapid tab switching (10 times) should not crash or show errors', FUI, 'P2');
  add(UI, 'Tab Navigation: Edge Cases', 'switching tabs should not duplicate DOM elements', FUI, 'P2');
  add(UI, 'Tab Navigation: Edge Cases', 'tab switch should complete within 2 seconds', FUI, 'P2');
  add(UI, 'Tab Navigation: Edge Cases', 'uploaded file state should NOT persist when switching STT → TTS → STT', FUI, 'P2');
  add(UI, 'Tab Navigation: Edge Cases', 'TTS text input should NOT carry over to STT tab', FUI, 'P2');
  add(UI, 'Tab Navigation: Edge Cases', 'page URL should not change when switching tabs', FUI, 'P2');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Tab Navigation: Negative Tests (9 tests, P3)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Tab Navigation: Negative Tests', 'there should be no hidden or invisible 4th tab', FUI, 'P3');
  add(UI, 'Tab Navigation: Negative Tests', 'switching tabs should not produce JavaScript console errors', FUI, 'P3');
  add(UI, 'Tab Navigation: Negative Tests', 'switching tabs should not produce failed network requests', FUI, 'P3');
  add(UI, 'Tab Navigation: Negative Tests', 'tab content should not leak/overlap between STT and TTS', FUI, 'P3');
  add(UI, 'Tab Navigation: Negative Tests', 'switching to TTS should not trigger any STT API calls', FUI, 'P3');
  add(UI, 'Tab Navigation: Negative Tests', 'browser back button after tab switch should not break the page', FUI, 'P3');
  add(UI, 'Tab Navigation: Negative Tests', 'keyboard Tab key should be able to navigate between tabs (accessibility)', FUI, 'P3');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Model Selection (3 tests, P0)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Model Selection', 'should display all available models in the config panel', FUI, 'P0');
  add(UI, 'Model Selection', 'should be able to select Zero Med model', FUI, 'P0');
  add(UI, 'Model Selection', 'should be able to select Zero Codeswitch model', FUI, 'P0');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Model Selection: Additional Positive Tests (8 tests, P1)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Model Selection: Additional Positive Tests', 'Model label should be visible in Configuration section', FUI, 'P1');
  add(UI, 'Model Selection: Additional Positive Tests', 'Zero Indic should be the default selected model', FUI, 'P1');
  add(UI, 'Model Selection: Additional Positive Tests', 'should be able to select Zero Indic model explicitly', FUI, 'P1');
  add(UI, 'Model Selection: Additional Positive Tests', 'each model should have a unique value in the select dropdown', FUI, 'P1');
  add(UI, 'Model Selection: Additional Positive Tests', 'model count should match expected (3 models)', FUI, 'P1');
  add(UI, 'Model Selection: Additional Positive Tests', 'selecting each model and switching back should work', FUI, 'P1');
  add(UI, 'Model Selection: Additional Positive Tests', 'model selection should persist after scrolling the page', FUI, 'P1');
  add(UI, 'Model Selection: Additional Positive Tests', 'model selection should be visible without scrolling (above fold)', FUI, 'P1');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Model Selection: Model-Specific Behavior (7 tests, P1)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Model Selection: Model-Specific Behavior', 'Zero Indic: language dropdown should show Indic languages', FUI, 'P1');
  add(UI, 'Model Selection: Model-Specific Behavior', 'Zero Med: should update configuration for medical transcription', FUI, 'P1');
  add(UI, 'Model Selection: Model-Specific Behavior', 'Zero Codeswitch: should be configured for code-mixed audio', FUI, 'P1');
  add(UI, 'Model Selection: Model-Specific Behavior', 'changing model should not clear uploaded file', FUI, 'P1');
  add(UI, 'Model Selection: Model-Specific Behavior', 'changing model should not affect Credits display', FUI, 'P1');
  add(UI, 'Model Selection: Model-Specific Behavior', 'features panel should remain visible regardless of model selected', FUI, 'P1');
  add(UI, 'Model Selection: Model-Specific Behavior', 'Run Analysis should work with each model (basic transcription)', FUI, 'P1');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Model Selection: Edge Cases (8 tests, P2)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Model Selection: Edge Cases', 'selecting the same model twice should not break anything', FUI, 'P2');
  add(UI, 'Model Selection: Edge Cases', 'rapid model switching (10 times) should not crash', FUI, 'P2');
  add(UI, 'Model Selection: Edge Cases', 'model switch should complete within 1 second (no heavy reload)', FUI, 'P2');
  add(UI, 'Model Selection: Edge Cases', 'model selection should persist after page scroll', FUI, 'P2');
  add(UI, 'Model Selection: Edge Cases', 'model dropdown should not have empty/blank options', FUI, 'P2');
  add(UI, 'Model Selection: Edge Cases', 'model dropdown should not have duplicate options', FUI, 'P2');
  add(UI, 'Model Selection: Edge Cases', 'model selection should be keyboard-accessible (arrow keys)', FUI, 'P2');
  add(UI, 'Model Selection: Edge Cases', 'model dropdown should be focusable via Tab key', FUI, 'P2');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Model Selection: Negative Tests (11 tests, P3)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Model Selection: Negative Tests', 'model dropdown should not contain non-existent models', FUI, 'P3');
  add(UI, 'Model Selection: Negative Tests', 'model dropdown should not allow text input/typing', FUI, 'P3');
  add(UI, 'Model Selection: Negative Tests', 'model dropdown should not be disabled', FUI, 'P3');
  add(UI, 'Model Selection: Negative Tests', 'selecting model should not trigger API calls (no premature request)', FUI, 'P3');
  add(UI, 'Model Selection: Negative Tests', 'model selection should not cause console JavaScript errors', FUI, 'P3');
  add(UI, 'Model Selection: Negative Tests', 'model selection should not cause failed network requests', FUI, 'P3');
  add(UI, 'Model Selection: Negative Tests', 'model dropdown should not show HTML/raw code in option labels', FUI, 'P3');
  add(UI, 'Model Selection: Negative Tests', 'model dropdown should not allow selecting a disabled/grayed-out option', FUI, 'P3');
  add(UI, 'Model Selection: Negative Tests', 'model selection should not affect the Language dropdown value', FUI, 'P3');
  add(UI, 'Model Selection: Negative Tests', 'model selection should not reset the Transcription Mode', FUI, 'P3');
  add(UI, 'Model Selection: Negative Tests', 'model dropdown should not be visible in TTS tab', FUI, 'P3');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Language Selection (2 tests, P0)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Language Selection', 'should display English as default language', FUI, 'P0');
  add(UI, 'Language Selection', 'should open language dropdown and show options', FUI, 'P0');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Language Selection: Additional Positive Tests (15 tests, P1)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Language Selection: Additional Positive Tests', 'Language label should be visible in Configuration section', FUI, 'P1');
  add(UI, 'Language Selection: Additional Positive Tests', 'default language button should show flag emoji with English', FUI, 'P1');
  add(UI, 'Language Selection: Additional Positive Tests', 'language dropdown should open on click and show multiple languages', FUI, 'P1');
  add(UI, 'Language Selection: Additional Positive Tests', 'language dropdown should include Hindi', FUI, 'P1');
  add(UI, 'Language Selection: Additional Positive Tests', 'language dropdown should include Telugu', FUI, 'P1');
  add(UI, 'Language Selection: Additional Positive Tests', 'language dropdown should include Kannada', FUI, 'P1');
  add(UI, 'Language Selection: Additional Positive Tests', 'language dropdown should include Bengali', FUI, 'P1');
  add(UI, 'Language Selection: Additional Positive Tests', 'language dropdown should include Tamil', FUI, 'P1');
  add(UI, 'Language Selection: Additional Positive Tests', 'language dropdown should include Marathi', FUI, 'P1');
  add(UI, 'Language Selection: Additional Positive Tests', 'should be able to select Hindi language', FUI, 'P1');
  add(UI, 'Language Selection: Additional Positive Tests', 'should be able to switch language from Hindi back to English', FUI, 'P1');
  add(UI, 'Language Selection: Additional Positive Tests', 'language selection should persist after scrolling', FUI, 'P1');
  add(UI, 'Language Selection: Additional Positive Tests', 'language button should be clickable and enabled', FUI, 'P1');
  add(UI, 'Language Selection: Additional Positive Tests', 'selecting a language should close the dropdown', FUI, 'P1');
  add(UI, 'Language Selection: Additional Positive Tests', 'Credits should not change when switching languages', FUI, 'P1');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Language Selection: Edge Cases (9 tests, P2)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Language Selection: Edge Cases', 'opening and closing dropdown without selecting should keep current language', FUI, 'P2');
  add(UI, 'Language Selection: Edge Cases', 'rapid language switching should not crash the page', FUI, 'P2');
  add(UI, 'Language Selection: Edge Cases', 'language dropdown should open within 500ms', FUI, 'P2');
  add(UI, 'Language Selection: Edge Cases', 'language selection should not affect Model dropdown value', FUI, 'P2');
  add(UI, 'Language Selection: Edge Cases', 'language selection should not affect uploaded file', FUI, 'P2');
  add(UI, 'Language Selection: Edge Cases', 'language selection should not affect Transcription Mode', FUI, 'P2');
  add(UI, 'Language Selection: Edge Cases', 'language dropdown should be scrollable if many languages are listed', FUI, 'P2');
  add(UI, 'Language Selection: Edge Cases', 'language dropdown should handle double-click without issues', FUI, 'P2');
  add(UI, 'Language Selection: Edge Cases', 'language selection should be keyboard accessible', FUI, 'P2');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Language Selection: Negative Tests (12 tests, P3)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Language Selection: Negative Tests', 'language dropdown should not show non-Indic/unsupported languages for Zero Indic', FUI, 'P3');
  add(UI, 'Language Selection: Negative Tests', 'language dropdown should not have empty/blank entries', FUI, 'P3');
  add(UI, 'Language Selection: Negative Tests', 'language dropdown should not show duplicate languages', FUI, 'P3');
  add(UI, 'Language Selection: Negative Tests', 'language dropdown should not show HTML/template code', FUI, 'P3');
  add(UI, 'Language Selection: Negative Tests', 'language selection should not trigger any API calls', FUI, 'P3');
  add(UI, 'Language Selection: Negative Tests', 'language selection should not cause JavaScript console errors', FUI, 'P3');
  add(UI, 'Language Selection: Negative Tests', 'language selection should not cause failed network requests', FUI, 'P3');
  add(UI, 'Language Selection: Negative Tests', 'language button should not be disabled', FUI, 'P3');
  add(UI, 'Language Selection: Negative Tests', 'language button text should not show NaN, null, or undefined', FUI, 'P3');
  add(UI, 'Language Selection: Negative Tests', 'language dropdown should not be visible in TTS tab', FUI, 'P3');
  add(UI, 'Language Selection: Negative Tests', 'language dropdown should not be editable via developer tools injection', FUI, 'P3');
  add(UI, 'Language Selection: Negative Tests', 'selecting the already-selected language should not break anything', FUI, 'P3');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Audio Intelligence Features (2 tests, P0)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Audio Intelligence Features', 'should display all Audio Intelligence features', FUI, 'P0');
  add(UI, 'Audio Intelligence Features', 'should display all Intelligence Features', FUI, 'P0');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Audio Intelligence Features: Additional (23 tests, P1)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Audio Intelligence Features: Additional', 'Audio Intelligence heading should be visible', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'Intelligence Features heading should be visible', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'Translation feature should be visible', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'Transliteration feature should be visible', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'Speaker Diarization feature should be visible', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'Speaker Identification feature should be visible', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'Word Timestamps feature should be visible', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'Profanity Hashing feature should be visible', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'Custom Keyword Hashing feature should be visible', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'Intent Detection feature should be visible', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'Sentiment Analysis feature should be visible', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'Emotion Diarization feature should be visible', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'Summarisation feature should be visible', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'Keyword Normalisation feature should be visible', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'Audio Intelligence should have exactly 5 features', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'Intelligence Features should have exactly 7 features', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'total feature count should be 12', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'Features tab should be active by default (features visible on load)', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'Code Sample tab should show code when clicked', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'switching from Code Sample back to Features should restore features list', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'each feature should be clickable/toggleable', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'features should remain visible after model change', FUI, 'P1');
  add(UI, 'Audio Intelligence Features: Additional', 'features should remain visible after language change', FUI, 'P1');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Audio Intelligence Features: Edge Cases (9 tests, P2)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Audio Intelligence Features: Edge Cases', 'toggling a feature on and off should not break the page', FUI, 'P2');
  add(UI, 'Audio Intelligence Features: Edge Cases', 'toggling multiple features simultaneously should not crash', FUI, 'P2');
  add(UI, 'Audio Intelligence Features: Edge Cases', 'enabling all 12 features should not crash the page', FUI, 'P2');
  add(UI, 'Audio Intelligence Features: Edge Cases', 'rapidly toggling a single feature 10 times should not crash', FUI, 'P2');
  add(UI, 'Audio Intelligence Features: Edge Cases', 'feature toggles should not trigger API calls (only Run Analysis should)', FUI, 'P2');
  add(UI, 'Audio Intelligence Features: Edge Cases', 'features panel should be scrollable if content overflows', FUI, 'P2');
  add(UI, 'Audio Intelligence Features: Edge Cases', 'feature toggle state should persist after scrolling', FUI, 'P2');
  add(UI, 'Audio Intelligence Features: Edge Cases', 'switching Features → Code Sample → Features should preserve feature list', FUI, 'P2');
  add(UI, 'Audio Intelligence Features: Edge Cases', 'Credits should not change when toggling features', FUI, 'P2');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Audio Intelligence Features: Negative Tests (10 tests, P3)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Audio Intelligence Features: Negative Tests', 'should not show any non-existent/deprecated features', FUI, 'P3');
  add(UI, 'Audio Intelligence Features: Negative Tests', 'feature names should not show HTML tags or template variables', FUI, 'P3');
  add(UI, 'Audio Intelligence Features: Negative Tests', 'toggling features should not cause JavaScript console errors', FUI, 'P3');
  add(UI, 'Audio Intelligence Features: Negative Tests', 'toggling features should not cause failed network requests', FUI, 'P3');
  add(UI, 'Audio Intelligence Features: Negative Tests', 'features panel should not be visible in TTS tab', FUI, 'P3');
  add(UI, 'Audio Intelligence Features: Negative Tests', 'feature toggles should not be editable via contentEditable', FUI, 'P3');
  add(UI, 'Audio Intelligence Features: Negative Tests', 'features should not have broken/missing icons or images', FUI, 'P3');
  add(UI, 'Audio Intelligence Features: Negative Tests', 'Run Analysis with features enabled but no audio should not crash', FUI, 'P3');
  add(UI, 'Audio Intelligence Features: Negative Tests', 'feature toggle labels should not overlap or truncate', FUI, 'P3');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — File Upload (3 tests, P0)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'File Upload', 'should have a hidden file input for audio upload', FUI, 'P0');
  add(UI, 'File Upload', 'should upload WAV file via file input', FUI, 'P0');
  add(UI, 'File Upload', 'should trigger transcription via Run Analysis button after upload', FUI, 'P0');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — File Upload: Additional (11 tests, P1)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'File Upload: Additional', 'Upload Your Audio heading should be visible', FUI, 'P1');
  add(UI, 'File Upload: Additional', 'Upload description text should be visible', FUI, 'P1');
  add(UI, 'File Upload: Additional', 'Choose Audio File button should be enabled', FUI, 'P1');
  add(UI, 'File Upload: Additional', 'after uploading WAV, filename should appear on page', FUI, 'P1');
  add(UI, 'File Upload: Additional', 'after uploading MP3, filename should appear on page', FUI, 'P1');
  add(UI, 'File Upload: Additional', 'after uploading, file size should be displayed', FUI, 'P1');
  add(UI, 'File Upload: Additional', 'after uploading, Replace File button should appear', FUI, 'P1');
  add(UI, 'File Upload: Additional', 'after uploading, "Uploaded" status should appear', FUI, 'P1');
  add(UI, 'File Upload: Additional', 'Run Analysis with uploaded file should show transcription in Transcript tab', FUI, 'P1');
  add(UI, 'File Upload: Additional', 'Run Analysis with uploaded file should show data in JSON tab', FUI, 'P1');
  add(UI, 'File Upload: Additional', 'uploading a file should not change Credits', FUI, 'P1');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — File Upload: Edge Cases (7 tests, P2)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'File Upload: Edge Cases', 'replacing an uploaded file with a new one should update the filename', FUI, 'P2');
  add(UI, 'File Upload: Edge Cases', 'uploading a large MP3 file (28 MB) should not crash the page', FUI, 'P2');
  add(UI, 'File Upload: Edge Cases', 'uploading file should not affect model selection', FUI, 'P2');
  add(UI, 'File Upload: Edge Cases', 'uploading file should not affect language selection', FUI, 'P2');
  add(UI, 'File Upload: Edge Cases', 'uploading file should not affect feature toggle states', FUI, 'P2');
  add(UI, 'File Upload: Edge Cases', 'rapid file upload (upload → replace → upload) should not crash', FUI, 'P2');
  add(UI, 'File Upload: Edge Cases', 'page should handle MPEG audio file upload', FUI, 'P2');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — File Upload: Negative Tests (8 tests, P3)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'File Upload: Negative Tests', 'Run Analysis without uploading any file should not crash', FUI, 'P3');
  add(UI, 'File Upload: Negative Tests', 'Run Analysis without file should NOT deduct credits', FUI, 'P3');
  add(UI, 'File Upload: Negative Tests', 'uploading should not trigger any API calls (only Run Analysis should)', FUI, 'P3');
  add(UI, 'File Upload: Negative Tests', 'uploading should not cause JavaScript console errors', FUI, 'P3');
  add(UI, 'File Upload: Negative Tests', 'upload area should not accept non-audio files gracefully', FUI, 'P3');
  add(UI, 'File Upload: Negative Tests', 'file upload area should not be visible in TTS tab', FUI, 'P3');
  add(UI, 'File Upload: Negative Tests', 'double-clicking Run Analysis should not send duplicate API requests', FUI, 'P3');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Sample Audio Removal: Positive Tests (5 tests, P1)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Sample Audio Removal: Positive Tests', 'upload section should show only file upload without sample options', FUI, 'P1');
  add(UI, 'Sample Audio Removal: Positive Tests', 'upload section should display supported format information', FUI, 'P1');
  add(UI, 'Sample Audio Removal: Positive Tests', 'upload description text should be visible', FUI, 'P1');
  add(UI, 'Sample Audio Removal: Positive Tests', 'file upload should be the only way to provide audio input', FUI, 'P1');
  add(UI, 'Sample Audio Removal: Positive Tests', 'Run Analysis button should be visible without sample audio', FUI, 'P1');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Sample Audio Removal: Negative Tests (5 tests, P2)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Sample Audio Removal: Negative Tests', 'no sample audio cards should exist in STT tab', FUI, 'P2');
  add(UI, 'Sample Audio Removal: Negative Tests', 'no sample audio cards should exist in TTS tab', FUI, 'P2');
  add(UI, 'Sample Audio Removal: Negative Tests', 'page should not contain any orphaned sample audio references', FUI, 'P2');
  add(UI, 'Sample Audio Removal: Negative Tests', 'no JavaScript errors should occur where sample audio was removed', FUI, 'P2');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Sample Audio Removal: Edge Cases (4 tests, P2)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Sample Audio Removal: Edge Cases', 'uploading a file should work without sample audio fallback', FUI, 'P2');
  add(UI, 'Sample Audio Removal: Edge Cases', 'page layout should be intact without sample audio section', FUI, 'P2');
  add(UI, 'Sample Audio Removal: Edge Cases', 'switching tabs should not reveal hidden sample audio elements', FUI, 'P2');
  add(UI, 'Sample Audio Removal: Edge Cases', 'refreshing page should not bring back sample audio section', FUI, 'P2');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Language Dropdown: Positive Tests (7 tests, P1)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Language Dropdown: Positive Tests', 'language dropdown should open when clicking English button', FUI, 'P1');
  add(UI, 'Language Dropdown: Positive Tests', 'language dropdown should show Indic languages', FUI, 'P1');
  add(UI, 'Language Dropdown: Positive Tests', 'language dropdown should show global languages', FUI, 'P1');
  add(UI, 'Language Dropdown: Positive Tests', 'language dropdown should show African languages', FUI, 'P1');
  add(UI, 'Language Dropdown: Positive Tests', 'language dropdown should show Southeast Asian languages', FUI, 'P1');
  add(UI, 'Language Dropdown: Positive Tests', 'selecting a language should update the language button text', FUI, 'P1');
  add(UI, 'Language Dropdown: Positive Tests', 'language dropdown should display flag emojis with language names', FUI, 'P1');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Language Dropdown: Negative Tests (5 tests, P2)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Language Dropdown: Negative Tests', 'language dropdown should not have empty or blank entries', FUI, 'P2');
  add(UI, 'Language Dropdown: Negative Tests', 'language dropdown should not show duplicate language entries', FUI, 'P2');
  add(UI, 'Language Dropdown: Negative Tests', 'selecting a language should not trigger API calls', FUI, 'P2');
  add(UI, 'Language Dropdown: Negative Tests', 'language dropdown should not cause console errors', FUI, 'P2');
  add(UI, 'Language Dropdown: Negative Tests', 'language selection should not affect Credits balance', FUI, 'P2');

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYGROUND UI — Language Dropdown: Edge Cases (6 tests, P2)
  // ══════════════════════════════════════════════════════════════════════════

  add(UI, 'Language Dropdown: Edge Cases', 'rapidly opening and closing language dropdown should not crash', FUI, 'P2');
  add(UI, 'Language Dropdown: Edge Cases', 'switching language then switching tabs should preserve selection', FUI, 'P2');
  add(UI, 'Language Dropdown: Edge Cases', 'language selection should not affect model dropdown', FUI, 'P2');
  add(UI, 'Language Dropdown: Edge Cases', 'selecting non-Indic language should keep page functional', FUI, 'P2');
  add(UI, 'Language Dropdown: Edge Cases', 'language dropdown should close when clicking outside', FUI, 'P2');
  add(UI, 'Language Dropdown: Edge Cases', 'scrolling through large language list should be smooth', FUI, 'P2');

  return tests;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const SHEET_NAME = 'Master-Test-Cases';
  const HEADERS = [
    'id', 'category', 'module', 'test_name', 'type',
    'priority', 'status', 'last_run_date', 'last_result',
  ];
  const COL_COUNT = HEADERS.length;

  // Priority column index (0-based)
  const PRIORITY_COL = 5;
  // Type column index (0-based)
  const TYPE_COL = 4;

  const allTests = scanTestsFromSpec();
  console.log(`\n[MasterTestSheet] Total test cases: ${allTests.length}`);

  // Summary by category
  const categories = [...new Set(allTests.map(t => t.category))];
  for (const cat of categories) {
    const count = allTests.filter(t => t.category === cat).length;
    console.log(`  ${cat}: ${count} tests`);
  }

  // Summary by priority
  const priorities = ['P0', 'P1', 'P2', 'P3'];
  for (const p of priorities) {
    const count = allTests.filter(t => t.priority === p).length;
    console.log(`  ${p}: ${count} tests`);
  }

  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const sheetId = await findOrCreateSheet(sheets, spreadsheetId, SHEET_NAME);

    console.log(`\n[MasterTestSheet] Writing to sheet "${SHEET_NAME}" (sheetId: ${sheetId})...`);

    // ── Write headers ──────────────────────────────────────────────────
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A1:${colLetter(COL_COUNT)}1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [HEADERS] },
    });

    // ── Write data rows ────────────────────────────────────────────────
    const rows = allTests.map(t => [
      t.id, t.category, t.module, t.test_name, t.type,
      t.priority, t.status, t.last_run_date, t.last_result,
    ]);

    if (rows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A2:${colLetter(COL_COUNT)}${rows.length + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: rows },
      });
    }

    // ── Formatting ─────────────────────────────────────────────────────
    const formatRequests: any[] = [];

    // 1. Header row: dark blue background (#1a237e) with white bold text
    formatRequests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: COL_COUNT,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: hexToColor('#1a237e'),
            textFormat: {
              foregroundColor: { red: 1.0, green: 1.0, blue: 1.0, alpha: 1.0 },
              bold: true,
              fontSize: 11,
            },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment',
      },
    });

    // 2. Freeze header row
    formatRequests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: 1 },
        },
        fields: 'gridProperties.frozenRowCount',
      },
    });

    // 3. Auto-resize columns
    formatRequests.push({
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: COL_COUNT,
        },
      },
    });

    // 4. Color code the Priority column per row
    const priorityColors: Record<string, string> = {
      P0: '#c8e6c9', // green
      P1: '#bbdefb', // blue
      P2: '#fff9c4', // yellow
      P3: '#ffe0b2', // orange
    };

    allTests.forEach((tc, index) => {
      const rowIndex = index + 1;
      const bgHex = priorityColors[tc.priority];
      if (bgHex) {
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: PRIORITY_COL,
              endColumnIndex: PRIORITY_COL + 1,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: hexToColor(bgHex),
                horizontalAlignment: 'CENTER',
                textFormat: { bold: true },
              },
            },
            fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat.bold',
          },
        });
      }
    });

    // 5. Color code the Type column per row
    const typeColors: Record<string, string> = {
      'Functional/UI': '#e1bee7', // purple
      'API': '#b2dfdb',           // teal
      'Integration': '#c5cae9',   // indigo
    };

    allTests.forEach((tc, index) => {
      const rowIndex = index + 1;
      const bgHex = typeColors[tc.type];
      if (bgHex) {
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: TYPE_COL,
              endColumnIndex: TYPE_COL + 1,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: hexToColor(bgHex),
                horizontalAlignment: 'CENTER',
              },
            },
            fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.horizontalAlignment',
          },
        });
      }
    });

    // ── Apply all formatting in one batch ──────────────────────────────
    if (formatRequests.length > 0) {
      // Google Sheets API has a limit on batch requests, chunk if needed
      const CHUNK_SIZE = 500;
      for (let i = 0; i < formatRequests.length; i += CHUNK_SIZE) {
        const chunk = formatRequests.slice(i, i + CHUNK_SIZE);
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: chunk },
        });
      }
    }

    console.log(`\n[MasterTestSheet] Successfully written ${allTests.length} test cases to "${SHEET_NAME}".`);
    console.log(`   Sheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
    console.log(`\n   ID range: ${allTests[0].id} — ${allTests[allTests.length - 1].id}`);
  } catch (error: any) {
    console.error(`\n[MasterTestSheet] Error:`, error.message);
    if (error.message.includes('credentials')) {
      console.error(
        '   Please configure Google Sheets credentials in .env file:\n' +
        '   - GOOGLE_SERVICE_ACCOUNT_JSON (base64 encoded JSON or file path)\n' +
        '   OR\n' +
        '   - GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY'
      );
    }
    process.exit(1);
  }
}

main();
