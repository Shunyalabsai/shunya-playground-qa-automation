/**
 * Playground Sheet Writer
 * Writes detailed playground test results to Google Sheets matching the clean,
 * elegant UI/UX design of the Master Input Sheet:
 * 1. Elegant Header & Run Summary Card at the TOP of the sheet (Row 2, beneath frozen Header).
 * 2. Pastel Category & Suite column coloring (Soft Indigo, Mint, Amber, Pink, Cyan, Orange).
 * 3. Pastel Model column coloring (zero-indic: soft green, zero-codeswitch: soft amber, zero-medasr: soft rose).
 * 4. Clean Soft Status Badges (PASS in #DCFCE7 / #166534 text, FAIL in #FEE2E2 / #991B1B text) with native dropdown chips.
 * 5. Failure reason cell highlighted in soft red ONLY when error text exists; clean white otherwise.
 * 6. Neutral divider row (#94A3B8) between consecutive runs.
 * 7. Subtly bordered grid with centered metrics and readable typography.
 */

import { google, sheets_v4 } from 'googleapis';
import { GOOGLE_SHEETS_CONFIG } from '../config/api.config';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface PlaygroundSuiteResult {
  test_id?: string;
  date: string;
  module: string; // Category / Module (e.g. "Intelligence Feature Matrix", "Authentication", "UI Suite")
  feature: string; // Specific Feature (e.g. "Translation (English)", "Speaker Diarization", "Zero Codeswitch")
  scenario: string; // Scenario Title / Description (e.g. "Backend API Parameter: Translation (English Target)")
  audio_file: string;
  language: string;
  lang_code: string;
  status: 'PASS' | 'FAIL';
  failure_reason: string;
  latency_ms: number;
  api_response_preview: string;
  timestamp: string;
}

// ── Date & Parser Helpers ───────────────────────────────────────────────────

export function getLocalDateDMY(d: Date = new Date()): string {
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

export function getLocalTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  const dateStr = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${dateStr} ${timeStr}`;
}

export function parseTestDetails(testTitle: string, defaultModule: string = 'Backend API'): {
  testId: string;
  module: string;
  feature: string;
  scenario: string;
} {
  let testId = '';
  const idMatch = testTitle.match(/^(TC-[A-Z0-9-]+|SMOKE-[A-Z0-9-]+)/i);
  if (idMatch) {
    testId = idMatch[1];
  }

  let remaining = testTitle;
  if (testId && remaining.startsWith(testId + ':')) {
    remaining = remaining.substring(testId.length + 1).trim();
  }

  let module = defaultModule;
  const modMatch = remaining.match(/^\[(.*?)\]/);
  if (modMatch) {
    module = modMatch[1].replace(/^(UI - |Backend API - )/i, '').trim();
    remaining = remaining.substring(modMatch[0].length).trim();
  }

  const scenario = remaining;

  // Derive clean concise feature tag
  let feature = module;
  const sLower = scenario.toLowerCase();
  if (sLower.includes('translation')) {
    feature = sLower.includes('hindi') ? 'Translation (Hindi)' : 'Translation (English)';
  } else if (sLower.includes('transliteration')) {
    feature = sLower.includes('latin') ? 'Transliteration (Latin)' : 'Transliteration (Devanagari)';
  } else if (sLower.includes('speaker diarization') || sLower.includes('diariz')) {
    feature = 'Speaker Diarization';
  } else if (sLower.includes('speaker identification') || sLower.includes('identification')) {
    feature = 'Speaker Identification';
  } else if (sLower.includes('timestamp')) {
    feature = 'Word Timestamps';
  } else if (sLower.includes('profanity')) {
    feature = 'Profanity Hashing';
  } else if (sLower.includes('custom keyword') || sLower.includes('sensitive terms')) {
    feature = 'Custom Keyword Hashing';
  } else if (sLower.includes('intent')) {
    feature = 'Intent Detection';
  } else if (sLower.includes('sentiment')) {
    feature = 'Sentiment Analysis';
  } else if (sLower.includes('emotion')) {
    feature = 'Emotion Diarization';
  } else if (sLower.includes('summaris') || sLower.includes('summariz')) {
    feature = 'Summarisation';
  } else if (sLower.includes('normalis') || sLower.includes('normaliz')) {
    feature = 'Keyword Normalisation';
  } else if (sLower.includes('zero-codeswitch') || sLower.includes('codeswitch') || sLower.includes('hinglish')) {
    feature = 'Zero Codeswitch Model';
  } else if (sLower.includes('zero-medasr') || sLower.includes('medasr') || sLower.includes('medical')) {
    feature = 'Zero Med Model';
  } else if (sLower.includes('zero-indic') || sLower.includes('indic')) {
    feature = 'Zero Indic Model';
  } else if (sLower.includes('jwt token') || sLower.includes('/auth/token')) {
    feature = 'JWT Token Exchange';
  } else if (sLower.includes('sign up') || sLower.includes('login') || sLower.includes('logout') || sLower.includes('auth')) {
    feature = 'Authentication & Session';
  } else if (sLower.includes('tts') || sLower.includes('speech synthesis') || sLower.includes('/v1/audio/speech')) {
    feature = 'TTS Speech Synthesis';
  } else if (sLower.includes('onboarding') || sLower.includes('credits') || sLower.includes('survey')) {
    feature = 'Onboarding & Credits';
  } else if (sLower.includes('401') || sLower.includes('403') || sLower.includes('unauthorized')) {
    feature = 'Auth Rejection Guardrail';
  } else if (sLower.includes('corrupted') || sLower.includes('0-byte') || sLower.includes('empty') || sLower.includes('missing')) {
    feature = 'Negative Payload Validation';
  } else if (sLower.includes('concurrency') || sLower.includes('burst')) {
    feature = 'Concurrency Load Burst';
  } else if (sLower.includes('language selection') || sLower.includes('transcription:')) {
    const langMatch = scenario.match(/Transcription:\s*([A-Za-z]+)/i);
    feature = langMatch ? `Language (${langMatch[1]})` : 'Language Selection';
  }

  return { testId, module, feature, scenario };
}

// ── Auth ───────────────────────────────────────────────────────────────────

async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  if (GOOGLE_SHEETS_CONFIG.credentials) {
    let credentials;
    try {
      credentials = JSON.parse(GOOGLE_SHEETS_CONFIG.credentials);
    } catch {
      try {
        credentials = JSON.parse(
          Buffer.from(GOOGLE_SHEETS_CONFIG.credentials, 'base64').toString('utf-8')
        );
      } catch {
        const auth = new google.auth.GoogleAuth({
          keyFile: GOOGLE_SHEETS_CONFIG.credentials,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const client = await auth.getClient();
        return google.sheets({ version: 'v4', auth: client as Parameters<typeof google.sheets>[0]['auth'] });
      }
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client as Parameters<typeof google.sheets>[0]['auth'] });
  } else if (GOOGLE_SHEETS_CONFIG.clientEmail && GOOGLE_SHEETS_CONFIG.privateKey) {
    const jwtAuth = new google.auth.JWT(
      GOOGLE_SHEETS_CONFIG.clientEmail,
      undefined,
      GOOGLE_SHEETS_CONFIG.privateKey,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    return google.sheets({ version: 'v4', auth: jwtAuth });
  } else {
    throw new Error(
      'Google Sheets credentials not configured. Please set GOOGLE_SERVICE_ACCOUNT_JSON in .env'
    );
  }
}

// ── Helpers & Color Palette (Matching Master Input Sheet) ────────────────────

function getPlaygroundSpreadsheetId(): string {
  return (
    process.env.GOOGLE_SHEET_ID_PLAYGROUND_OUTPUT ||
    '11leUutfqP4OXyIIaeTYqw_3gWc1w5fQLnQWuUHXPgW4'
  );
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
    return existingSheet.properties?.sheetId || 0;
  }

  const createResponse = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: sheetName,
            },
          },
        },
      ],
    },
  });

  return createResponse.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;
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

// Pastel Module / Category Palette
const CATEGORY_PASTEL_COLORS: Record<string, { bg: string; text: string }> = {
  'Health Checks': { bg: '#E0F7FA', text: '#006064' },       // Soft Cyan
  'ASR Models': { bg: '#F3E5F5', text: '#4A148C' },          // Soft Purple
  'ASR Features': { bg: '#FFF8E1', text: '#B45309' },        // Soft Amber
  'TTS Speech Synthesis': { bg: '#FCE4EC', text: '#880E4F' },// Soft Rose/Pink
  'UI Suite': { bg: '#E1F5FE', text: '#01579B' },            // Soft Sky Blue
  'Negative & Auth': { bg: '#FFF3E0', text: '#C2410C' },     // Soft Warm Orange
  'Backend API': { bg: '#E8F5E9', text: '#1B5E20' },         // Soft Mint Green
};

function getCategoryColor(category: string): { bg: string; text: string } {
  for (const [key, color] of Object.entries(CATEGORY_PASTEL_COLORS)) {
    if (category.toLowerCase().includes(key.toLowerCase())) {
      return color;
    }
  }
  return { bg: '#F1F5F9', text: '#334155' }; // Clean Slate fallback
}

// Pastel Model Palette
const MODEL_PASTEL_COLORS: Record<string, { bg: string; text: string }> = {
  'zero-indic': { bg: '#DCFCE7', text: '#166534' },       // Soft Pastel Green
  'zero-codeswitch': { bg: '#FEF3C7', text: '#92400E' },  // Soft Pastel Amber
  'zero-medasr': { bg: '#FEE2E2', text: '#991B1B' },      // Soft Pastel Rose
};

// ── Column Definitions ──────────────────────────────────────────────────────

const PLAYGROUND_HEADERS = [
  'Test Case ID',
  'Date',
  'Module / Category',
  'Feature',
  'Scenario Description',
  'Audio / Input Payload',
  'Language',
  'Lang Code',
  'Status (PASS/FAIL)',
  'Failure Reason',
  'Latency (ms)',
  'API Response Preview',
  'Timestamp',
];
const PLAYGROUND_COL_COUNT = PLAYGROUND_HEADERS.length; // 13
const TEST_ID_COL_INDEX = 0;
const DATE_COL_INDEX = 1;
const MODULE_COL_INDEX = 2;
const FEATURE_COL_INDEX = 3;
const SCENARIO_COL_INDEX = 4;
const AUDIO_COL_INDEX = 5;
const LANG_COL_INDEX = 6;
const LANG_CODE_COL_INDEX = 7;
const STATUS_COL_INDEX = 8;
const FAILURE_REASON_COL_INDEX = 9;
const LATENCY_COL_INDEX = 10;
const API_PREVIEW_COL_INDEX = 11;
const TIMESTAMP_COL_INDEX = 12;

const COLUMN_WIDTHS = [
  130, // 0: Test Case ID
  100, // 1: Date
  170, // 2: Module / Category
  180, // 3: Feature
  340, // 4: Scenario Description
  180, // 5: Audio / Input Payload
  120, // 6: Language
  90,  // 7: Lang Code
  110, // 8: Status (PASS/FAIL)
  200, // 9: Failure Reason
  100, // 10: Latency (ms)
  260, // 11: API Response Preview
  150, // 12: Timestamp
];

// ── Main Execution ──────────────────────────────────────────────────────────

export async function writePlaygroundResults(
  results: PlaygroundSuiteResult[],
  sheetName: string = 'Playground-Execution-Results'
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getPlaygroundSpreadsheetId();
    const sheetId = await findOrCreateSheet(sheets, spreadsheetId, sheetName);

    console.log(`\n[PlaygroundWriter] Writing ${results.length} results to sheet "${sheetName}" in ${spreadsheetId}...`);

    // 1. Calculate Run Summary
    const total = results.length;
    const passed = results.filter((r) => r.status === 'PASS').length;
    const failed = results.filter((r) => r.status === 'FAIL').length;
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0';
    const now = getLocalTimestamp();

    // 2. Ensure headers exist at row 1 and are up-to-date
    // Clear any extra columns beyond column 13 (N:Z) to keep sheet pristine
    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!N1:Z1000`,
      });
    } catch {}

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:${colLetter(PLAYGROUND_COL_COUNT)}1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [PLAYGROUND_HEADERS],
      },
    });

    // Format Header Row (Navy Blue #0F172A with white bold text, centered, frozen)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: PLAYGROUND_COL_COUNT,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: hexToColor('#0F172A'),
                  textFormat: {
                    foregroundColor: { red: 1, green: 1, blue: 1, alpha: 1 },
                    bold: true,
                    fontSize: 10,
                  },
                  horizontalAlignment: 'CENTER',
                  verticalAlignment: 'MIDDLE',
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
            },
          },
          {
            updateSheetProperties: {
              properties: {
                sheetId,
                gridProperties: {
                  frozenRowCount: 1,
                },
              },
              fields: 'gridProperties.frozenRowCount',
            },
          },
        ],
      },
    });

    // 3. Prepare Rows:
    // Row 1 of run: Elegant Summary Card Banner
    // Row 2..N: Data Rows
    // Row N+1: Neutral Grey Divider Row
    const summaryBannerText = `📊 RUN EXECUTION [ ${now} ]   |   TOTAL: ${total}   |   PASSED: ${passed} (${passRate}%)   |   FAILED: ${failed}   |   HEALTH: ${failed === 0 ? 'OPTIMAL (100% PASS) ✅' : 'ATTENTION REQUIRED ❌'}`;

    const summaryBannerRow = [
      summaryBannerText,
      ...Array(PLAYGROUND_COL_COUNT - 1).fill(''),
    ];

    const dataRows = results.map((r) => {
      const audioDisplay = r.audio_file && r.audio_file !== 'N/A' && r.audio_file !== 'Standard Audio Sample' && r.audio_file !== 'Standard Test Dataset'
        ? r.audio_file
        : '—';
      const langDisplay = r.language && r.language !== 'N/A' ? r.language : '—';
      const codeDisplay = r.lang_code && r.lang_code !== 'N/A' ? r.lang_code : '—';

      return [
        r.test_id || '—',
        r.date,
        r.module,
        r.feature,
        r.scenario,
        audioDisplay,
        langDisplay,
        codeDisplay,
        r.status,
        r.failure_reason || '',
        r.latency_ms,
        r.api_response_preview,
        r.timestamp,
      ];
    });

    const greySeparatorRow = Array(PLAYGROUND_COL_COUNT).fill('');

    const newRowsToInsert = [summaryBannerRow, ...dataRows, greySeparatorRow];
    const totalNewRows = newRowsToInsert.length;

    // 4. ALWAYS insert new run at the TOP (push older runs down below row 1)
    const allData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:${colLetter(PLAYGROUND_COL_COUNT)}`,
    });
    const currentRowCount = allData.data.values?.length || 1;

    if (currentRowCount > 1) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              insertDimension: {
                range: {
                  sheetId,
                  dimension: 'ROWS',
                  startIndex: 1, // Below header
                  endIndex: 1 + totalNewRows,
                },
              },
            },
          ],
        },
      });
    }

    // 5. Write the new run rows starting at row 2 (index 1)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A2:${colLetter(PLAYGROUND_COL_COUNT)}${1 + totalNewRows}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: newRowsToInsert,
      },
    });

    // 6. Apply Batch Formatting & Styling
    const formatRequests: any[] = [];

    // A. Format Run Summary Banner (Row index 1)
    const bannerBg = failed === 0 ? hexToColor('#1E293B') : hexToColor('#881337');
    formatRequests.push(
      {
        mergeCells: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: 2,
            startColumnIndex: 0,
            endColumnIndex: PLAYGROUND_COL_COUNT,
          },
          mergeType: 'MERGE_ALL',
        },
      },
      {
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: 2,
            startColumnIndex: 0,
            endColumnIndex: PLAYGROUND_COL_COUNT,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: bannerBg,
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1, alpha: 1 },
                bold: true,
                fontSize: 11,
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
        },
      }
    );

    // B. Set Data Validation (Dropdown chips: PASS / FAIL) on Status Column
    formatRequests.push({
      setDataValidation: {
        range: {
          sheetId,
          startRowIndex: 2,
          endRowIndex: 2 + dataRows.length,
          startColumnIndex: STATUS_COL_INDEX,
          endColumnIndex: STATUS_COL_INDEX + 1,
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: [{ userEnteredValue: 'PASS' }, { userEnteredValue: 'FAIL' }],
          },
          inputMessage: 'Select test status: PASS or FAIL',
          strict: true,
          showCustomUi: true,
        },
      },
    });

    // C. Format Data Rows (Clean Pastel Colors, Soft Badges, Subtle Borders)
    results.forEach((r, idx) => {
      const rowIndex = 2 + idx; // Index 0=Header, Index 1=Banner, Index 2=First Data Row

      // 1. Default Row Styling (White background, vertical middle, subtle font)
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: 0,
            endColumnIndex: PLAYGROUND_COL_COUNT,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 1, green: 1, blue: 1, alpha: 1 },
              textFormat: {
                foregroundColor: hexToColor('#1E293B'),
                fontSize: 10,
              },
              verticalAlignment: 'MIDDLE',
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,horizontalAlignment)',
        },
      });

      // 2. Test ID column (Soft Purple/Indigo text, bold, centered)
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: TEST_ID_COL_INDEX,
            endColumnIndex: TEST_ID_COL_INDEX + 1,
          },
          cell: {
            userEnteredFormat: {
              textFormat: {
                foregroundColor: hexToColor('#3730A3'),
                bold: true,
              },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      });

      // 3. Date column centered
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: DATE_COL_INDEX,
            endColumnIndex: DATE_COL_INDEX + 1,
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(horizontalAlignment)',
        },
      });

      // 4. Module / Category Column (Soft Pastel Styling)
      const catColor = getCategoryColor(r.module);
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: MODULE_COL_INDEX,
            endColumnIndex: MODULE_COL_INDEX + 1,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: hexToColor(catColor.bg),
              textFormat: {
                foregroundColor: hexToColor(catColor.text),
                bold: true,
                fontSize: 10,
              },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      });

      // 5. Feature Column (Soft Pastel Indigo / Lavender badge)
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: FEATURE_COL_INDEX,
            endColumnIndex: FEATURE_COL_INDEX + 1,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: hexToColor('#EEF2FF'),
              textFormat: {
                foregroundColor: hexToColor('#4338CA'),
                bold: true,
                fontSize: 10,
              },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      });

      // 6. Scenario Description Column (Crisp clean text, left-aligned)
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: SCENARIO_COL_INDEX,
            endColumnIndex: SCENARIO_COL_INDEX + 1,
          },
          cell: {
            userEnteredFormat: {
              textFormat: {
                foregroundColor: hexToColor('#0F172A'),
                fontSize: 10,
              },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      });

      // 7. Audio, Language, Lang Code centered
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: AUDIO_COL_INDEX,
            endColumnIndex: LANG_CODE_COL_INDEX + 1,
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(horizontalAlignment)',
        },
      });

      // 8. Status Cell (Soft Pastel Badge: PASS in #DCFCE7, FAIL in #FEE2E2)
      const statusBg = r.status === 'PASS' ? hexToColor('#DCFCE7') : hexToColor('#FEE2E2');
      const statusFg = r.status === 'PASS' ? hexToColor('#166534') : hexToColor('#991B1B');

      formatRequests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: STATUS_COL_INDEX,
            endColumnIndex: STATUS_COL_INDEX + 1,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: statusBg,
              textFormat: {
                foregroundColor: statusFg,
                bold: true,
                fontSize: 10,
              },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      });

      // 9. Failure reason styling (Soft light red #FEF2F2 ONLY if error present)
      if (r.failure_reason) {
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: FAILURE_REASON_COL_INDEX,
              endColumnIndex: FAILURE_REASON_COL_INDEX + 1,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: hexToColor('#FEF2F2'),
                textFormat: {
                  foregroundColor: hexToColor('#991B1B'),
                  bold: true,
                  fontSize: 10,
                },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        });
      }

      // 10. Latency & Timestamp columns centered
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: LATENCY_COL_INDEX,
            endColumnIndex: LATENCY_COL_INDEX + 1,
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(horizontalAlignment)',
        },
      });

      formatRequests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: TIMESTAMP_COL_INDEX,
            endColumnIndex: TIMESTAMP_COL_INDEX + 1,
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(horizontalAlignment)',
        },
      });
    });

    // D. Format Neutral Grey Separator Row at the bottom of this run (#94A3B8)
    const separatorRowIndex = 2 + dataRows.length;
    formatRequests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: separatorRowIndex,
          endRowIndex: separatorRowIndex + 1,
          startColumnIndex: 0,
          endColumnIndex: PLAYGROUND_COL_COUNT,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: hexToColor('#CBD5E1'), // Neutral Slate Grey
          },
        },
        fields: 'userEnteredFormat(backgroundColor)',
      },
    });

    // E. Set precise, optimal column widths (prevent wide banner stretch)
    COLUMN_WIDTHS.forEach((pixelSize, colIdx) => {
      formatRequests.push({
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: 'COLUMNS',
            startIndex: colIdx,
            endIndex: colIdx + 1,
          },
          properties: {
            pixelSize,
          },
          fields: 'pixelSize',
        },
      });
    });

    // Apply all batch formatting
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: formatRequests,
      },
    });

    console.log(`[PlaygroundWriter] Successfully recorded run to "${sheetName}": Total ${total} | Passed ${passed} | Failed ${failed}`);
    console.log(`   Output URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  } catch (error: any) {
    console.error(`[PlaygroundWriter] Error writing playground results:`, error.message);
    throw error;
  }
}
