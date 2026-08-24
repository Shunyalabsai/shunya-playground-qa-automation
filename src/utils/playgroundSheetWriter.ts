/**
 * Playground Sheet Writer
 * Writes detailed playground test results to Google Sheets with:
 * 1. Top-of-run Summary Card (Total, Passed, Failed, Pass Rate)
 * 2. Neutral Grey Separator row between consecutive test runs
 * 3. Data Validation Dropdowns (PASS / FAIL) on Status column
 * 4. Distinct Green/Red status badge colors and Light Red failure_reason highlight
 */

import { google, sheets_v4 } from 'googleapis';
import { GOOGLE_SHEETS_CONFIG } from '../config/api.config';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface PlaygroundSuiteResult {
  date: string;
  feature: string; // e.g. "Baseline Transcription", "Translation", "Zero Med", etc.
  category: string; // "UI", "Backend API", "Zero Indic Features"
  audio_file: string;
  language: string;
  lang_code: string;
  status: 'PASS' | 'FAIL';
  failure_reason: string;
  latency_ms: number;
  wer: number; // -1 if not applicable
  cer: number; // -1 if not applicable
  api_response_preview: string; // first 200 chars of response
  timestamp: string;
}

export interface DailySuiteResult {
  category: string;
  name: string;
  status: string;
  duration_s: number;
  failure_reason: string;
}

// ── Auth ───────────────────────────────────────────────────────────────────

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
          return google.sheets({ version: 'v4', auth: client as Parameters<typeof google.sheets>[0]['auth'] });
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

  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client as Parameters<typeof google.sheets>[0]['auth'] });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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

  // Create new sheet
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

// ── Headers & Column Layout ─────────────────────────────────────────────────
const PLAYGROUND_HEADERS = [
  'Date',
  'Feature / Scenario',
  'Category / Suite',
  'Audio File / Input',
  'Language',
  'Lang Code',
  'Status (Dropdown)',
  'Failure Reason',
  'Latency (ms)',
  'WER (%)',
  'CER (%)',
  'API Response Preview',
  'Timestamp',
];
const PLAYGROUND_COL_COUNT = PLAYGROUND_HEADERS.length; // 13
const STATUS_COL_INDEX = 6;
const FAILURE_REASON_COL_INDEX = 7;

// ── writePlaygroundResults ──────────────────────────────────────────────────

/**
 * Writes detailed playground test results with top run summary and grey separator between runs.
 */
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
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // 2. Ensure headers exist at row 1
    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:${colLetter(PLAYGROUND_COL_COUNT)}1`,
    });

    const hasHeaders =
      existingData.data.values &&
      existingData.data.values.length > 0 &&
      existingData.data.values[0].length > 0;

    if (!hasHeaders) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1:${colLetter(PLAYGROUND_COL_COUNT)}1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [PLAYGROUND_HEADERS],
        },
      });

      // Format Header Row (Navy Blue #0d1b2a with white bold text)
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
                    backgroundColor: hexToColor('#0d1b2a'),
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
    }

    // 3. Prepare Rows for insertion:
    // Row 1 of run: Summary Banner
    // Row 2..N: Test Data Rows
    // Row N+1: Grey Separator Row between runs
    const summaryBannerText = `🚀 RUN SUMMARY [ ${now} ]  |  TOTAL: ${total}  |  PASSED: ${passed} (${passRate}%)  |  FAILED: ${failed}  |  STATUS: ${failed === 0 ? 'ALL PASSED ✅' : 'FAILURES DETECTED ❌'}`;

    const summaryBannerRow = [
      summaryBannerText,
      ...Array(PLAYGROUND_COL_COUNT - 1).fill(''),
    ];

    const dataRows = results.map((r) => [
      r.date,
      r.feature,
      r.category,
      r.audio_file,
      r.language,
      r.lang_code,
      r.status,
      r.failure_reason || '',
      r.latency_ms,
      r.wer === -1 ? 'N/A' : `${(r.wer * 100).toFixed(2)}%`,
      r.cer === -1 ? 'N/A' : `${(r.cer * 100).toFixed(2)}%`,
      r.api_response_preview,
      r.timestamp,
    ]);

    const greySeparatorRow = Array(PLAYGROUND_COL_COUNT).fill('');

    const newRowsToInsert = [summaryBannerRow, ...dataRows, greySeparatorRow];
    const totalNewRows = newRowsToInsert.length;

    // 4. Check if sheet already has rows below headers -> Insert empty rows at row index 1 to push existing down
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

    // 6. Apply Formatting & Validation Rules
    const formatRequests: any[] = [];

    // A. Format Summary Banner (Row index 1)
    const bannerBg = failed === 0 ? hexToColor('#1b5e20') : hexToColor('#b71c1c');
    // Merge summary banner across all columns
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
                fontSize: 12,
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
        },
      }
    );

    // B. Set Data Validation (Dropdown chips: PASS / FAIL) on Status Column for all data rows
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
          showCustomUi: true, // creates the dropdown chip in Google Sheets!
        },
      },
    });

    // C. Format Data Rows (Status Green/Red and Failure Reason Highlight)
    results.forEach((r, idx) => {
      const rowIndex = 2 + idx; // Index 0=Header, Index 1=Banner, Index 2=First Data Row

      // Status cell styling
      const statusBg = r.status === 'PASS' ? hexToColor('#c8e6c9') : hexToColor('#ffcdd2');
      const statusFg = r.status === 'PASS' ? hexToColor('#1b5e20') : hexToColor('#b71c1c');

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
              },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      });

      // Failure reason styling (light red highlight if error present)
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
                backgroundColor: hexToColor('#ffebee'),
                textFormat: {
                  foregroundColor: hexToColor('#b71c1c'),
                  bold: true,
                },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        });
      }
    });

    // D. Format Grey Separator Row at the end of this run
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
            backgroundColor: hexToColor('#78909c'), // Neutral Grey
          },
        },
        fields: 'userEnteredFormat(backgroundColor)',
      },
    });

    // E. Auto-resize columns
    formatRequests.push({
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: PLAYGROUND_COL_COUNT,
        },
      },
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
