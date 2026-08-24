/**
 * Playground Sheet Writer
 * Writes detailed playground test results to a dedicated Google Sheet
 * with color formatting, conditional formatting, and daily summaries.
 */

import { google, sheets_v4 } from 'googleapis';
import { GOOGLE_SHEETS_CONFIG } from '../config/api.config';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface PlaygroundSuiteResult {
  date: string;
  feature: string; // e.g. "Baseline Transcription", "Translation", etc.
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

// ── Auth (same pattern as reporter.ts) ──────────────────────────────────────

async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  let auth;

  // Try to use service account JSON if provided
  if (GOOGLE_SHEETS_CONFIG.credentials) {
    try {
      let credentials;
      try {
        credentials = JSON.parse(GOOGLE_SHEETS_CONFIG.credentials);
      } catch {
        // If that fails, try base64 decode
        try {
          credentials = JSON.parse(
            Buffer.from(GOOGLE_SHEETS_CONFIG.credentials, 'base64').toString('utf-8')
          );
        } catch {
          // If that also fails, treat it as a file path
          auth = new google.auth.GoogleAuth({
            keyFile: GOOGLE_SHEETS_CONFIG.credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
          });
          const client = await auth.getClient();
          return google.sheets({ version: 'v4', auth: client as Parameters<typeof google.sheets>[0]['auth'] });
        }
      }

      // Use parsed credentials
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
    // JWT is the client — no getClient() (unlike GoogleAuth)
    const jwtAuth = new google.auth.JWT(
      GOOGLE_SHEETS_CONFIG.clientEmail,
      undefined,
      GOOGLE_SHEETS_CONFIG.privateKey,
      ['https://www.googleapis.com/auth/spreadsheets'],
    );
    return google.sheets({ version: 'v4', auth: jwtAuth });
  } else {
    throw new Error(
      'Google Sheets credentials not configured. Please set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env'
    );
  }

  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client as Parameters<typeof google.sheets>[0]['auth'] });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getPlaygroundSpreadsheetId(): string {
  return (
    process.env.GOOGLE_SHEET_ID_PLAYGROUND_OUTPUT ||
    GOOGLE_SHEETS_CONFIG.spreadsheetId
  );
}

/**
 * Find or create a sheet tab by name. Returns the sheetId (numeric).
 */
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

/**
 * Convert a hex color string (e.g. "#1a237e") to a Google Sheets RGBA object.
 */
function hexToColor(hex: string): { red: number; green: number; blue: number; alpha: number } {
  const h = hex.replace('#', '');
  return {
    red: parseInt(h.substring(0, 2), 16) / 255,
    green: parseInt(h.substring(2, 4), 16) / 255,
    blue: parseInt(h.substring(4, 6), 16) / 255,
    alpha: 1.0,
  };
}

// ── Column indices for PlaygroundSuiteResult ────────────────────────────────
// date=0, feature=1, category=2, audio_file=3, language=4, lang_code=5,
// status=6, failure_reason=7, latency_ms=8, wer=9, cer=10,
// api_response_preview=11, timestamp=12
const PLAYGROUND_HEADERS = [
  'date',
  'feature',
  'category',
  'audio_file',
  'language',
  'lang_code',
  'status',
  'failure_reason',
  'latency_ms',
  'wer',
  'cer',
  'api_response_preview',
  'timestamp',
];
const PLAYGROUND_COL_COUNT = PLAYGROUND_HEADERS.length; // 13
const STATUS_COL_INDEX = 6;
const FAILURE_REASON_COL_INDEX = 7;
const WER_COL_INDEX = 9;

// ── writePlaygroundResults ──────────────────────────────────────────────────

/**
 * Write detailed playground test results to a dedicated sheet tab.
 *
 * @param results - Array of PlaygroundSuiteResult objects
 * @param sheetName - Tab name, e.g. "Playground-Daily-2026-03-25"
 */
export async function writePlaygroundResults(
  results: PlaygroundSuiteResult[],
  sheetName: string
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getPlaygroundSpreadsheetId();
    const sheetId = await findOrCreateSheet(sheets, spreadsheetId, sheetName);

    if (results.length > 0) {
      const dates = [...new Set(results.map((r) => r.date))];
      console.log(`\n[PlaygroundWriter] Writing ${results.length} results for dates: ${dates.join(', ')}`);
    }

    // ── Write headers in row 1 ────────────────────────────────────────────
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:${colLetter(PLAYGROUND_COL_COUNT)}1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [PLAYGROUND_HEADERS],
      },
    });

    // ── Write data rows starting at row 2 ────────────────────────────────
    const rows = results.map((r) => [
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

    if (rows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A2:${colLetter(PLAYGROUND_COL_COUNT)}${rows.length + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: rows,
        },
      });
    }

    // ── Formatting requests ──────────────────────────────────────────────
    const formatRequests: any[] = [];

    // 1. Header row: dark blue background (#1a237e) with white bold text
    const headerBg = hexToColor('#1a237e');
    formatRequests.push({
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
            backgroundColor: headerBg,
            textFormat: {
              foregroundColor: { red: 1.0, green: 1.0, blue: 1.0, alpha: 1.0 },
              bold: true,
            },
          },
        },
        fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat',
      },
    });

    // 2. Freeze the header row
    formatRequests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
        fields: 'gridProperties.frozenRowCount',
      },
    });

    // 3. Auto-resize all columns
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

    // 4. Color-code the status column per row
    results.forEach((result, index) => {
      const rowIndex = index + 1; // 0-indexed; row 2 in sheet = index 1

      // Status column: bright green (#c8e6c9) for PASS, bright red (#ffcdd2) for FAIL
      const statusBg =
        result.status === 'PASS' ? hexToColor('#c8e6c9') : hexToColor('#ffcdd2');

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
            },
          },
          fields: 'userEnteredFormat.backgroundColor',
        },
      });

      // Failure reason column: light red (#ffebee) when non-empty
      if (result.failure_reason) {
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
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });
      }
    });

    // 5. Conditional formatting for WER column
    //    WER > 100% => red background
    formatRequests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [
            {
              sheetId,
              startRowIndex: 1,
              endRowIndex: results.length + 1,
              startColumnIndex: WER_COL_INDEX,
              endColumnIndex: WER_COL_INDEX + 1,
            },
          ],
          booleanRule: {
            condition: {
              type: 'TEXT_CONTAINS',
              values: [{ userEnteredValue: '1' }],
            },
            // We use a custom formula instead for accurate numeric comparison
            format: {
              backgroundColor: hexToColor('#ffcdd2'), // red
            },
          },
        },
        index: 0,
      },
    });

    // Replace the simple TEXT_CONTAINS rules with proper CUSTOM_FORMULA rules
    // Remove the last request we just pushed (the TEXT_CONTAINS one)
    formatRequests.pop();

    // WER > 100% => red
    formatRequests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [
            {
              sheetId,
              startRowIndex: 1,
              endRowIndex: results.length + 1,
              startColumnIndex: WER_COL_INDEX,
              endColumnIndex: WER_COL_INDEX + 1,
            },
          ],
          booleanRule: {
            condition: {
              type: 'CUSTOM_FORMULA',
              values: [
                {
                  userEnteredValue: `=AND(${colLetter(WER_COL_INDEX + 1)}2<>"N/A",VALUE(SUBSTITUTE(${colLetter(WER_COL_INDEX + 1)}2,"%",""))>100)`,
                },
              ],
            },
            format: {
              backgroundColor: hexToColor('#ffcdd2'), // red
            },
          },
        },
        index: 0,
      },
    });

    // WER > 80% => orange (lower priority, so add after red)
    formatRequests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [
            {
              sheetId,
              startRowIndex: 1,
              endRowIndex: results.length + 1,
              startColumnIndex: WER_COL_INDEX,
              endColumnIndex: WER_COL_INDEX + 1,
            },
          ],
          booleanRule: {
            condition: {
              type: 'CUSTOM_FORMULA',
              values: [
                {
                  userEnteredValue: `=AND(${colLetter(WER_COL_INDEX + 1)}2<>"N/A",VALUE(SUBSTITUTE(${colLetter(WER_COL_INDEX + 1)}2,"%",""))>80)`,
                },
              ],
            },
            format: {
              backgroundColor: { red: 1.0, green: 0.65, blue: 0.0, alpha: 1.0 }, // orange
            },
          },
        },
        index: 1,
      },
    });

    // ── Apply all formatting in one batch ────────────────────────────────
    if (formatRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: formatRequests,
        },
      });
    }

    console.log(`[PlaygroundWriter] Sheet "${sheetName}" written with ${rows.length} data rows.`);
    console.log(`   Sheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  } catch (error: any) {
    console.error(`[PlaygroundWriter] Error writing playground results:`, error.message);
    if (error.message.includes('credentials')) {
      console.error(
        '   Please configure Google Sheets credentials in .env file:\n' +
          '   - GOOGLE_SERVICE_ACCOUNT_JSON (base64 encoded JSON or file path)\n' +
          '   OR\n' +
          '   - GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY'
      );
    }
    throw error;
  }
}

// ── Daily Summary columns ───────────────────────────────────────────────────
// date=0, category=1, suite_name=2, status=3, duration=4, failure_reason=5
const SUMMARY_HEADERS = [
  'date',
  'category',
  'suite_name',
  'status',
  'duration_s',
  'failure_reason',
];
const SUMMARY_COL_COUNT = SUMMARY_HEADERS.length; // 6
const SUMMARY_STATUS_COL_INDEX = 3;

// ── writeDailySummarySheet ──────────────────────────────────────────────────

/**
 * Write (or append) a daily summary of suite results to the "Daily-Summary"
 * sheet tab. New runs are inserted at the top (below the header row), with
 * a gray separator row between runs.
 *
 * @param suiteResults - Array of per-suite summary objects
 * @param date - Date string for this run, e.g. "2026-03-25"
 */
export async function writeDailySummarySheet(
  suiteResults: DailySuiteResult[],
  date: string
): Promise<void> {
  const SHEET_NAME = 'Daily-Summary';

  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getPlaygroundSpreadsheetId();
    const sheetId = await findOrCreateSheet(sheets, spreadsheetId, SHEET_NAME);

    console.log(`\n[PlaygroundWriter] Writing daily summary for ${date} (${suiteResults.length} suites)`);

    // ── Ensure headers exist ────────────────────────────────────────────
    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A1:${colLetter(SUMMARY_COL_COUNT)}1`,
    });

    const hasHeaders =
      existingData.data.values &&
      existingData.data.values.length > 0 &&
      existingData.data.values[0].length > 0;

    if (!hasHeaders) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A1:${colLetter(SUMMARY_COL_COUNT)}1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [SUMMARY_HEADERS],
        },
      });

      // Format header row: dark blue + white bold
      const headerBg = hexToColor('#1a237e');
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
                  endColumnIndex: SUMMARY_COL_COUNT,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: headerBg,
                    textFormat: {
                      foregroundColor: { red: 1.0, green: 1.0, blue: 1.0, alpha: 1.0 },
                      bold: true,
                    },
                  },
                },
                fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat',
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

    // ── Build rows: 1 gray separator + N data rows ──────────────────────
    const separatorRow = Array(SUMMARY_COL_COUNT).fill('');
    const dataRows = suiteResults.map((s) => [
      date,
      s.category,
      s.name,
      s.status,
      s.duration_s,
      s.failure_reason || '',
    ]);

    const rowsToInsert = [separatorRow, ...dataRows];
    const totalNewRows = rowsToInsert.length;

    // ── Check for existing data below headers ───────────────────────────
    const allData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A:${colLetter(SUMMARY_COL_COUNT)}`,
    });
    const currentRowCount = allData.data.values?.length || 1;

    // If there is data beyond the header, insert empty rows to push it down
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
                  startIndex: 1, // right below header (0-indexed)
                  endIndex: 1 + totalNewRows,
                },
              },
            },
          ],
        },
      });
    }

    // ── Write the new rows at position 2 (index 1) ──────────────────────
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A2:${colLetter(SUMMARY_COL_COUNT)}${1 + totalNewRows}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: rowsToInsert,
      },
    });

    // ── Formatting ──────────────────────────────────────────────────────
    const formatRequests: any[] = [];

    // Gray separator row (row 2 = index 1)
    formatRequests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 0,
          endColumnIndex: SUMMARY_COL_COUNT,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.7, green: 0.7, blue: 0.7, alpha: 1.0 },
          },
        },
        fields: 'userEnteredFormat.backgroundColor',
      },
    });

    // Color-code status column for each data row
    suiteResults.forEach((s, index) => {
      const rowIndex = 2 + index; // separator is at index 1, first data row at index 2

      const statusBg =
        s.status === 'PASS' ? hexToColor('#c8e6c9') : hexToColor('#ffcdd2');

      formatRequests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: SUMMARY_STATUS_COL_INDEX,
            endColumnIndex: SUMMARY_STATUS_COL_INDEX + 1,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: statusBg,
            },
          },
          fields: 'userEnteredFormat.backgroundColor',
        },
      });
    });

    // Auto-resize columns
    formatRequests.push({
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: SUMMARY_COL_COUNT,
        },
      },
    });

    if (formatRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: formatRequests,
        },
      });
    }

    console.log(`[PlaygroundWriter] Daily summary written to "${SHEET_NAME}" (${dataRows.length} suites).`);
    console.log(`   Sheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  } catch (error: any) {
    console.error(`[PlaygroundWriter] Error writing daily summary:`, error.message);
    if (error.message.includes('credentials')) {
      console.error(
        '   Please configure Google Sheets credentials in .env file:\n' +
          '   - GOOGLE_SERVICE_ACCOUNT_JSON (base64 encoded JSON or file path)\n' +
          '   OR\n' +
          '   - GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY'
      );
    }
    throw error;
  }
}

// ── Utility ─────────────────────────────────────────────────────────────────

/**
 * Convert a 1-based column number to a spreadsheet column letter (1=A, 2=B, ... 26=Z, 27=AA).
 */
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
