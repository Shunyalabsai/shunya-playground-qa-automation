/**
 * Test Results Reporter
 * Updates Google Sheets with test execution results
 */

import { google } from 'googleapis';
import { GOOGLE_SHEETS_CONFIG, getOutputSpreadsheetIdForModel } from '../config/api.config';

export interface TestResult {
  date: string; // Date when test was run (YYYY-MM-DD format)
  audio_path: string;
  lang: string;
  lang_code: string;
  detected_language: string; // Language detected by API
  lang_code_match: boolean; // Whether detected_language matches expected lang_code
  expected_text: string;
  predicted_text: string;
  duration: string;
  latency_ms: number;
  wer: number;
  cer: number;
  test_status: 'PASS' | 'FAIL';
  failure_reason: string; // Reason for failure (empty if PASS)
  timestamp: string;
}

export interface TranslationTestResult {
  date: string; // Date when test was run (YYYY-MM-DD format)
  audio_path: string;
  lang: string;
  source_lang: string; // Source language code (hi, te, etc.)
  target_lang: string; // Target language code (en, es, etc.)
  translation_method: string; // 'runtime' or 'post-processing'
  original_text: string; // Original text in source language
  expected_translation: string; // Expected translated text (ground truth)
  translated_text: string; // Actual translated text from API
  duration: string;
  latency_ms: number;
  wer: number; // Word Error Rate
  cer: number; // Character Error Rate
  test_status: 'PASS' | 'FAIL';
  failure_reason: string; // Reason for failure (empty if PASS)
  timestamp: string;
}

export interface TransliterationTestResult {
  date: string; // Date when test was run (YYYY-MM-DD format)
  audio_path: string;
  lang: string;
  language_code: string; // Source language code (hi, te, etc.)
  output_script: string; // Target script (Latin, Devanagari, etc.)
  transliteration_method: string; // 'runtime' or 'text-input'
  original_text: string; // Original text in source script
  transliterated_text: string; // Transliterated text in target script
  duration: string;
  latency_ms: number;
  test_status: 'PASS' | 'FAIL';
  failure_reason: string; // Reason for failure (empty if PASS)
  timestamp: string;
}

export interface DiarizationTestResult {
  date: string; // Date when test was run (YYYY-MM-DD format)
  audio_path: string;
  transcribed_text: string; // Full transcribed text
  speaker_count: number; // Number of unique speakers detected
  segment_count: number; // Number of segments
  segments_summary: string; // JSON string of segments
  duration: string;
  latency_ms: number;
  test_status: 'PASS' | 'FAIL';
  failure_reason: string; // Reason for failure (empty if PASS)
  timestamp: string;
}

export interface WordTimestampsTestResult {
  date: string; // Date when test was run (YYYY-MM-DD format)
  audio_path: string;
  transcribed_text: string; // Full transcribed text
  segment_count: number; // Number of segments
  total_words: number; // Total number of words with timestamps
  avg_confidence: string; // Average confidence score as percentage
  words_summary: string; // JSON string of word timestamps
  duration: string;
  latency_ms: number;
  test_status: 'PASS' | 'FAIL';
  failure_reason: string; // Reason for failure (empty if PASS)
  timestamp: string;
}

export interface SummarizationTestResult {
  date: string; // Date when test was run (YYYY-MM-DD format)
  mode: string; // 'transcription' or 'standalone'
  identifier: string; // Audio file name or text description
  original_length: number; // Original text length in characters
  summary_length: number; // Summary length in characters
  compression_ratio: string; // Percentage reduction (e.g., "75%")
  summary_text: string; // Generated summary
  max_length_param: string; // Max length parameter used (or 'N/A')
  latency_ms: number;
  test_status: 'PASS' | 'FAIL';
  failure_reason: string; // Reason for failure (empty if PASS)
  timestamp: string;
}

export interface IntentDetectionTestResult {
  date: string; // Date when test was run (YYYY-MM-DD format)
  mode: string; // 'transcription' or 'standalone'
  identifier: string; // Audio file name or text description
  detected_intent: string; // Detected intent category
  confidence: string; // Confidence score (0.0-1.0)
  intent_choices: string; // Intent choices used (comma-separated or 'N/A')
  transcribed_text: string; // Transcribed or input text
  latency_ms: number;
  test_status: 'PASS' | 'FAIL';
  failure_reason: string; // Reason for failure (empty if PASS)
  timestamp: string;
}

/**
 * Initialize Google Sheets API client
 */
async function getSheetsClient() {
  let auth;
  
  // Try to use service account JSON if provided
  if (GOOGLE_SHEETS_CONFIG.credentials) {
    try {
      // Try to parse as JSON string first
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
    // Use individual credentials
    const jwtAuth = new google.auth.JWT(
      GOOGLE_SHEETS_CONFIG.clientEmail,
      undefined,
      GOOGLE_SHEETS_CONFIG.privateKey,
      ['https://www.googleapis.com/auth/spreadsheets']
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

/**
 * Update Google Sheet with test results (inserts data at top and applies color formatting)
 * @param results - Array of test results
 * @param modelName - Name of the ASR model (e.g., 'zero-indic') - used as sheet name
 */
export async function updateGoogleSheet(
  results: TestResult[],
  modelName: string = 'zero-indic'
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getOutputSpreadsheetIdForModel(modelName); // All models write to main output spreadsheet
    const sheetName = modelName; // Use model name as sheet name
    
    // Log the dates being written for debugging
    if (results.length > 0) {
      const dates = [...new Set(results.map(r => r.date))];
      console.log(`\n📅 Writing test results with dates: ${dates.join(', ')}`);
    }

    // Prepare headers (with date column first)
    const headers = [
      'date',
      'audio_path',
      'lang',
      'lang_code',
      'detected_language',
      'lang_code_match',
      'Transcript / ground_truth_text',
      'Shunyalabs_transcribed_text',
      'duration',
      'latency_ms',
      'wer',
      'cer',
      'test_status',
      'failure_reason',
      'timestamp',
    ];

    // Check if sheet exists, create if it doesn't
    let sheetId = 0;

    try {
      // Get spreadsheet to check if sheet exists
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      const existingSheet = spreadsheet.data.sheets?.find(
        (s) => s.properties?.title === sheetName
      );

      if (existingSheet) {
        sheetId = existingSheet.properties?.sheetId || 0;
      } else {
        // Create new sheet with model name
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
        sheetId = createResponse.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;
      }
    } catch (error) {
      throw new Error(`Failed to access or create sheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Always update headers to ensure they match the current structure
    // This ensures the "failure_reason" column and other updated column names are always present
    // First, clear the header row to ensure clean update
    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A1:O1`,
      });
    } catch (error) {
      // Ignore errors if range doesn't exist yet (new sheet)
    }
    
    // Now update with new headers
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:O1`, // Updated to O1 for 15 columns
      valueInputOption: 'USER_ENTERED', // Use USER_ENTERED to ensure proper formatting
      requestBody: {
        values: [headers],
      },
    });
    
    console.log(`✅ Updated headers in sheet "${sheetName}" with ${headers.length} columns`);

    // Convert results to rows (with date first)
    // Format WER and CER as percentages (multiply by 100)
    const rows = results.map((result) => [
      result.date,
      result.audio_path,
      result.lang,
      result.lang_code,
      result.detected_language,
      result.lang_code_match ? 'YES' : 'NO',
      result.expected_text,
      result.predicted_text,
      result.duration,
      result.latency_ms,
      `${(result.wer * 100).toFixed(2)}%`, // WER as percentage
      `${(result.cer * 100).toFixed(2)}%`, // CER as percentage
      result.test_status,
      result.failure_reason || '', // Failure reason (empty if PASS)
      result.timestamp,
    ]);

    // Insert new rows at the top (row 3, after blank separator row at row 2)
    if (rows.length > 0) {
      // First, check if there's existing data (more than just headers)
      const allData = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:O`, // Updated to O for 15 columns
      });

      const currentRowCount = allData.data.values?.length || 1; // At least 1 for headers

      // Insert rows: 1 blank separator row + rows.length data rows
      const totalRowsToInsert = rows.length + 1; // +1 for blank separator row

      // If there's existing data (more than just headers), we need to shift it down
      if (currentRowCount > 1) {
        // Insert empty rows at position 2 to make space for new data + separator
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId: sheetId,
                    dimension: 'ROWS',
                    startIndex: 1, // 0-indexed, so 1 = row 2
                    endIndex: totalRowsToInsert + 1, // Insert enough rows for separator + new data
                  },
                },
              },
            ],
          },
        });
      }

      // Create blank separator row (empty array with 15 columns)
      const blankRow = Array(15).fill('');

      // Insert blank separator row at row 2, then test results at row 3 onwards
      const allRowsToInsert = [blankRow, ...rows];

      // Now update the rows starting from position 2 (blank row) and 3+ (test data)
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A2:O${totalRowsToInsert + 1}`, // Updated to O for 15 columns
        valueInputOption: 'RAW',
        requestBody: {
          values: allRowsToInsert,
        },
      });

      // Apply color formatting
      // Blank separator row (row 2) gets a different color
      // Test data rows (rows 3 to 3+rows.length) get light yellow/cream background
      const separatorRowIndex = 1; // Row 2 (0-indexed) - blank separator
      const dataStartRowIndex = 2; // Row 3 (0-indexed) - first test result
      const dataEndRowIndex = dataStartRowIndex + rows.length; // Exclusive end index

      const requests: any[] = [
        // Color the blank separator row (row 2) with a distinct color
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: separatorRowIndex,
              endRowIndex: separatorRowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: 15, // All columns (updated for 15 columns)
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 0.7,
                  green: 0.7,
                  blue: 0.7,
                  alpha: 1.0, // Gray color for separator
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
        // Color the test data rows (rows 3 onwards) with light yellow/cream
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: dataStartRowIndex,
              endRowIndex: dataEndRowIndex,
              startColumnIndex: 0,
              endColumnIndex: 15, // All columns (date through timestamp)
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 1.0,
                  green: 0.95,
                  blue: 0.8,
                  alpha: 1.0,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
      ];

      // Color code columns: test_status and lang_code_match (for data rows only, skip separator)
      results.forEach((result, index) => {
        const rowIndex = dataStartRowIndex + index; // 0-indexed (row 3 = index 2)
        
        // Color code test_status column: green for PASS, red for FAIL
        const statusColor =
          result.test_status === 'PASS'
            ? { red: 0.85, green: 0.95, blue: 0.85, alpha: 1.0 } // Light green
            : { red: 0.95, green: 0.85, blue: 0.85, alpha: 1.0 }; // Light red

        requests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 12, // test_status column (0-indexed: date=0, ... test_status=12)
              endColumnIndex: 13,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: statusColor,
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });

        // Color code lang_code_match column: green for YES, red for NO
        const matchColor =
          result.lang_code_match
            ? { red: 0.85, green: 0.95, blue: 0.85, alpha: 1.0 } // Light green
            : { red: 0.95, green: 0.85, blue: 0.85, alpha: 1.0 }; // Light red

        requests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 5, // lang_code_match column (0-indexed: date=0, ... lang_code_match=5)
              endColumnIndex: 6,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: matchColor,
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });
      });

      // Apply formatting
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests,
        },
      });
    }

    console.log(`\n✅ Google Sheet updated: ${rows.length} rows inserted at top of sheet "${sheetName}"`);
    console.log(`   Sheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  } catch (error: any) {
    console.error('\n❌ Error updating Google Sheet:', error.message);
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

/**
 * Update Google Sheet with translation test results (specialized for translation feature)
 * This includes WER/CER metrics, expected_translation, and target_lang
 * @param results - Array of translation test results
 * @param sheetName - Name of the sheet tab (default: 'Feat-Translation')
 */
export async function updateTranslationResults(
  results: TranslationTestResult[],
  sheetName: string = 'Feat-Translation'
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getOutputSpreadsheetIdForModel('translation');

    // Log the dates being written for debugging
    if (results.length > 0) {
      const dates = [...new Set(results.map(r => r.date))];
      console.log(`\n📅 Writing translation test results with dates: ${dates.join(', ')}`);
    }

    // Prepare headers for translation results (includes WER/CER, target_lang and method)
    const headers = [
      'date',
      'audio_path',
      'lang',
      'source_lang',
      'target_lang',
      'translation_method',
      'Transcript / ground_truth_text',
      'expected_translation',
      'Shunyalabs_transcribed_text',
      'duration',
      'latency_ms',
      'wer',
      'cer',
      'test_status',
      'failure_reason',
      'timestamp',
    ];

    // Check if sheet exists, create if it doesn't
    let sheetId = 0;

    try {
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      const existingSheet = spreadsheet.data.sheets?.find(
        (s) => s.properties?.title === sheetName
      );

      if (existingSheet) {
        sheetId = existingSheet.properties?.sheetId || 0;
      } else {
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
        sheetId = createResponse.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;
      }
    } catch (error) {
      throw new Error(`Failed to access or create sheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Always update headers
    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A1:P1`,
      });
    } catch (error) {
      // Ignore errors if range doesn't exist yet
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:P1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers],
      },
    });

    console.log(`✅ Updated headers in sheet "${sheetName}" with ${headers.length} columns`);

    // Convert results to rows
    const rows = results.map((result) => [
      result.date,
      result.audio_path,
      result.lang,
      result.source_lang,
      result.target_lang,
      result.translation_method,
      result.original_text,
      result.expected_translation,
      result.translated_text,
      result.duration,
      result.latency_ms,
      `${(result.wer * 100).toFixed(2)}%`,
      `${(result.cer * 100).toFixed(2)}%`,
      result.test_status,
      result.failure_reason || '',
      result.timestamp,
    ]);

    // Insert new rows at the top
    if (rows.length > 0) {
      const allData = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:P`,
      });

      const currentRowCount = allData.data.values?.length || 1;
      const totalRowsToInsert = rows.length + 1; // +1 for blank separator row

      if (currentRowCount > 1) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId: sheetId,
                    dimension: 'ROWS',
                    startIndex: 1,
                    endIndex: totalRowsToInsert + 1,
                  },
                },
              },
            ],
          },
        });
      }

      const blankRow = Array(16).fill('');
      const allRowsToInsert = [blankRow, ...rows];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A2:P${totalRowsToInsert + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: allRowsToInsert,
        },
      });

      // Apply color formatting
      const separatorRowIndex = 1;
      const dataStartRowIndex = 2;
      const dataEndRowIndex = dataStartRowIndex + rows.length;

      const requests: any[] = [
        // Gray separator row
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: separatorRowIndex,
              endRowIndex: separatorRowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: 16,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 0.7,
                  green: 0.7,
                  blue: 0.7,
                  alpha: 1.0,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
        // Light yellow for data rows
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: dataStartRowIndex,
              endRowIndex: dataEndRowIndex,
              startColumnIndex: 0,
              endColumnIndex: 16,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 1.0,
                  green: 0.95,
                  blue: 0.8,
                  alpha: 1.0,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
      ];

      // Color code test_status column (column index 13 (test_status))
      results.forEach((result, index) => {
        const rowIndex = dataStartRowIndex + index;

        const statusColor =
          result.test_status === 'PASS'
            ? { red: 0.85, green: 0.95, blue: 0.85, alpha: 1.0 }
            : { red: 0.95, green: 0.85, blue: 0.85, alpha: 1.0 };

        requests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 13, // test_status column
              endColumnIndex: 14,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: statusColor,
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });
      });

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests,
        },
      });
    }

    console.log(`\n✅ Google Sheet updated: ${rows.length} rows inserted at top of sheet "${sheetName}"`);
    console.log(`   Sheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  } catch (error: any) {
    console.error('\n❌ Error updating Google Sheet:', error.message);
    if (error.message.includes('credentials')) {
      console.error(
        '   Please configure Google Sheets credentials in .env file'
      );
    }
    throw error;
  }
}

/**
 * Update Google Sheet with transliteration test results (specialized for transliteration feature)
 * This uses a different column structure without WER/CER and includes output_script
 * @param results - Array of transliteration test results
 * @param sheetName - Name of the sheet tab (default: 'Feat-Transliteration')
 */
export async function updateTransliterationResults(
  results: TransliterationTestResult[],
  sheetName: string = 'Feat-Transliteration'
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getOutputSpreadsheetIdForModel('transliteration');

    // Log the dates being written for debugging
    if (results.length > 0) {
      const dates = [...new Set(results.map(r => r.date))];
      console.log(`\n📅 Writing transliteration test results with dates: ${dates.join(', ')}`);
    }

    // Prepare headers for transliteration results (no WER/CER, includes output_script and method)
    const headers = [
      'date',
      'audio_path',
      'lang',
      'language_code',
      'output_script',
      'transliteration_method',
      'Transcript / ground_truth_text',
      'Shunyalabs_transliterated_text',
      'duration',
      'latency_ms',
      'test_status',
      'failure_reason',
      'timestamp',
    ];

    // Check if sheet exists, create if it doesn't
    let sheetId = 0;

    try {
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      const existingSheet = spreadsheet.data.sheets?.find(
        (s) => s.properties?.title === sheetName
      );

      if (existingSheet) {
        sheetId = existingSheet.properties?.sheetId || 0;
      } else {
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
        sheetId = createResponse.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;
      }
    } catch (error) {
      throw new Error(`Failed to access or create sheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Always update headers
    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A1:M1`,
      });
    } catch (error) {
      // Ignore errors if range doesn't exist yet
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:M1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers],
      },
    });

    console.log(`✅ Updated headers in sheet "${sheetName}" with ${headers.length} columns`);

    // Convert results to rows
    const rows = results.map((result) => [
      result.date,
      result.audio_path,
      result.lang,
      result.language_code,
      result.output_script,
      result.transliteration_method,
      result.original_text,
      result.transliterated_text,
      result.duration,
      result.latency_ms,
      result.test_status,
      result.failure_reason || '',
      result.timestamp,
    ]);

    // Insert new rows at the top
    if (rows.length > 0) {
      const allData = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:M`,
      });

      const currentRowCount = allData.data.values?.length || 1;
      const totalRowsToInsert = rows.length + 1; // +1 for blank separator row

      if (currentRowCount > 1) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId: sheetId,
                    dimension: 'ROWS',
                    startIndex: 1,
                    endIndex: totalRowsToInsert + 1,
                  },
                },
              },
            ],
          },
        });
      }

      const blankRow = Array(13).fill('');
      const allRowsToInsert = [blankRow, ...rows];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A2:M${totalRowsToInsert + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: allRowsToInsert,
        },
      });

      // Apply color formatting
      const separatorRowIndex = 1;
      const dataStartRowIndex = 2;
      const dataEndRowIndex = dataStartRowIndex + rows.length;

      const requests: any[] = [
        // Gray separator row
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: separatorRowIndex,
              endRowIndex: separatorRowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: 13,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 0.7,
                  green: 0.7,
                  blue: 0.7,
                  alpha: 1.0,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
        // Light yellow for data rows
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: dataStartRowIndex,
              endRowIndex: dataEndRowIndex,
              startColumnIndex: 0,
              endColumnIndex: 13,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 1.0,
                  green: 0.95,
                  blue: 0.8,
                  alpha: 1.0,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
      ];

      // Color code test_status column (column index 10)
      results.forEach((result, index) => {
        const rowIndex = dataStartRowIndex + index;

        const statusColor =
          result.test_status === 'PASS'
            ? { red: 0.85, green: 0.95, blue: 0.85, alpha: 1.0 }
            : { red: 0.95, green: 0.85, blue: 0.85, alpha: 1.0 };

        requests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 10, // test_status column
              endColumnIndex: 11,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: statusColor,
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });
      });

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests,
        },
      });
    }

    console.log(`\n✅ Google Sheet updated: ${rows.length} rows inserted at top of sheet "${sheetName}"`);
    console.log(`   Sheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  } catch (error: any) {
    console.error('\n❌ Error updating Google Sheet:', error.message);
    if (error.message.includes('credentials')) {
      console.error(
        '   Please configure Google Sheets credentials in .env file'
      );
    }
    throw error;
  }
}

/**
 * Generate summary statistics from test results
 * @param results - Array of test results
 * @returns Summary object with statistics
 */
export function generateSummary(results: TestResult[]): {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  avgWER: number;
  avgCER: number;
  avgLatency: number;
  byLanguage: {
    [lang: string]: {
      total: number;
      passed: number;
      avgWER: number;
      avgCER: number;
    };
  };
} {
  const total = results.length;
  const passed = results.filter((r) => r.test_status === 'PASS').length;
  const failed = total - passed;
  const passRate = total > 0 ? (passed / total) * 100 : 0;

  const avgWER =
    results.reduce((sum, r) => sum + r.wer, 0) / total || 0;
  const avgCER =
    results.reduce((sum, r) => sum + r.cer, 0) / total || 0;
  const avgLatency =
    results.reduce((sum, r) => sum + r.latency_ms, 0) / total || 0;

  // Group by language
  const byLanguage: {
    [lang: string]: {
      total: number;
      passed: number;
      avgWER: number;
      avgCER: number;
    };
  } = {};

  results.forEach((result) => {
    if (!byLanguage[result.lang]) {
      byLanguage[result.lang] = {
        total: 0,
        passed: 0,
        avgWER: 0,
        avgCER: 0,
      };
    }
    byLanguage[result.lang].total++;
    if (result.test_status === 'PASS') {
      byLanguage[result.lang].passed++;
    }
  });

  // Calculate averages per language
  Object.keys(byLanguage).forEach((lang) => {
    const langResults = results.filter((r) => r.lang === lang);
    byLanguage[lang].avgWER =
      langResults.reduce((sum, r) => sum + r.wer, 0) / langResults.length || 0;
    byLanguage[lang].avgCER =
      langResults.reduce((sum, r) => sum + r.cer, 0) / langResults.length || 0;
  });

  return {
    total,
    passed,
    failed,
    passRate,
    avgWER,
    avgCER,
    avgLatency,
    byLanguage,
  };
}

/**
 * Print summary to console
 * @param summary - Summary statistics
 */
export function printSummary(summary: ReturnType<typeof generateSummary>): void {
  console.log('\n' + '='.repeat(80));
  console.log('TEST EXECUTION SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${summary.total}`);
  console.log(`Passed: ${summary.passed} (${summary.passRate.toFixed(2)}%)`);
  console.log(`Failed: ${summary.failed}`);
  console.log(`Average WER: ${(summary.avgWER * 100).toFixed(2)}%`);
  console.log(`Average CER: ${(summary.avgCER * 100).toFixed(2)}%`);
  console.log(`Average Latency: ${summary.avgLatency.toFixed(2)} ms`);
  console.log('\nBy Language:');
  Object.keys(summary.byLanguage).forEach((lang) => {
    const stats = summary.byLanguage[lang];
    console.log(
      `  ${lang}: ${stats.passed}/${stats.total} passed | WER: ${(stats.avgWER * 100).toFixed(2)}% | CER: ${(stats.avgCER * 100).toFixed(2)}%`
    );
  });
  console.log('='.repeat(80) + '\n');
}


/**
 * Update Google Sheet with speaker diarization test results
 * @param results - Array of diarization test results
 * @param sheetName - Name of the sheet tab (default: 'Feat-SpeakerDiarization')
 */
export async function updateDiarizationResults(
  results: DiarizationTestResult[],
  sheetName: string = 'Feat-SpeakerDiarization'
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getOutputSpreadsheetIdForModel('diarization');

    // Log the dates being written for debugging
    if (results.length > 0) {
      const dates = [...new Set(results.map(r => r.date))];
      console.log(`\n📅 Writing speaker diarization test results with dates: ${dates.join(', ')}`);
    }

    // Prepare headers for diarization results
    const headers = [
      'date',
      'audio_path',
      'transcribed_text',
      'speaker_count',
      'segment_count',
      'segments_summary',
      'duration',
      'latency_ms',
      'test_status',
      'failure_reason',
      'timestamp',
    ];

    // Check if sheet exists, create if it doesn't
    let sheetId = 0;

    try {
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      const existingSheet = spreadsheet.data.sheets?.find(
        (s) => s.properties?.title === sheetName
      );

      if (existingSheet) {
        sheetId = existingSheet.properties?.sheetId || 0;
      } else {
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
        sheetId = createResponse.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;
      }
    } catch (error) {
      throw new Error(`Failed to access or create sheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Always update headers
    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A1:K1`,
      });
    } catch (error) {
      // Ignore errors if range doesn't exist yet
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:K1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers],
      },
    });

    console.log(`✅ Updated headers in sheet "${sheetName}" with ${headers.length} columns`);

    // Convert results to rows
    const rows = results.map((result) => [
      result.date,
      result.audio_path,
      result.transcribed_text,
      result.speaker_count,
      result.segment_count,
      result.segments_summary,
      result.duration,
      result.latency_ms,
      result.test_status,
      result.failure_reason || '',
      result.timestamp,
    ]);

    // Insert new rows at the top
    if (rows.length > 0) {
      const allData = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:K`,
      });

      const currentRowCount = allData.data.values?.length || 1;
      const totalRowsToInsert = rows.length + 1; // +1 for blank separator row

      if (currentRowCount > 1) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId: sheetId,
                    dimension: 'ROWS',
                    startIndex: 1,
                    endIndex: totalRowsToInsert + 1,
                  },
                },
              },
            ],
          },
        });
      }

      const blankRow = Array(11).fill('');
      const allRowsToInsert = [blankRow, ...rows];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A2:K${totalRowsToInsert + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: allRowsToInsert,
        },
      });

      // Apply color formatting
      const separatorRowIndex = 1;
      const dataStartRowIndex = 2;
      const dataEndRowIndex = dataStartRowIndex + rows.length;

      const requests: any[] = [
        // Gray separator row
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: separatorRowIndex,
              endRowIndex: separatorRowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: 11,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 0.7,
                  green: 0.7,
                  blue: 0.7,
                  alpha: 1.0,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
        // Light yellow for data rows
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: dataStartRowIndex,
              endRowIndex: dataEndRowIndex,
              startColumnIndex: 0,
              endColumnIndex: 11,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 1.0,
                  green: 0.95,
                  blue: 0.8,
                  alpha: 1.0,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
      ];

      // Color code test_status column (column index 8: test_status)
      results.forEach((result, index) => {
        const rowIndex = dataStartRowIndex + index;

        const statusColor =
          result.test_status === 'PASS'
            ? { red: 0.85, green: 0.95, blue: 0.85, alpha: 1.0 } // Light green for PASS
            : { red: 0.95, green: 0.85, blue: 0.85, alpha: 1.0 }; // Light red for FAIL

        requests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 8, // test_status column (0-indexed)
              endColumnIndex: 9,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: statusColor,
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });
      });

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests,
        },
      });
    }

    console.log(`\n✅ Google Sheet updated: ${rows.length} rows inserted at top of sheet "${sheetName}"`);
    console.log(`   Sheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  } catch (error: any) {
    console.error('\n❌ Error updating Google Sheet:', error.message);
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

/**
 * Update Google Sheets with word timestamps test results
 * @param results - Array of word timestamps test results
 * @param sheetName - Name of the sheet to update (default: Feat-WordTimestamps)
 */
export async function updateWordTimestampsResults(
  results: WordTimestampsTestResult[],
  sheetName: string = 'Feat-WordTimestamps'
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getOutputSpreadsheetIdForModel('word-timestamps');

    // Log the dates being written for debugging
    if (results.length > 0) {
      const dates = [...new Set(results.map(r => r.date))];
      console.log(`\n📅 Writing word timestamps test results with dates: ${dates.join(', ')}`);
    }

    // Prepare headers for word timestamps results
    const headers = [
      'date',
      'audio_path',
      'transcribed_text',
      'segment_count',
      'total_words',
      'avg_confidence',
      'words_summary',
      'duration',
      'latency_ms',
      'test_status',
      'failure_reason',
      'timestamp',
    ];

    // Check if sheet exists, create if it doesn't
    let sheetId = 0;

    try {
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      const existingSheet = spreadsheet.data.sheets?.find(
        (s) => s.properties?.title === sheetName
      );

      if (existingSheet) {
        sheetId = existingSheet.properties?.sheetId || 0;
      } else {
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
        sheetId = createResponse.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;
      }
    } catch (error) {
      throw new Error(`Failed to access or create sheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Always update headers
    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A1:L1`,
      });
    } catch (error) {
      // Ignore errors if range doesn't exist yet
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:L1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers],
      },
    });

    console.log(`✅ Updated headers in sheet "${sheetName}" with ${headers.length} columns`);

    // Convert results to rows
    const rows = results.map((result) => [
      result.date,
      result.audio_path,
      result.transcribed_text,
      result.segment_count,
      result.total_words,
      result.avg_confidence,
      result.words_summary,
      result.duration,
      result.latency_ms,
      result.test_status,
      result.failure_reason || '',
      result.timestamp,
    ]);

    // Insert new rows at the top
    if (rows.length > 0) {
      const allData = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:L`,
      });

      const currentRowCount = allData.data.values?.length || 1;
      const totalRowsToInsert = rows.length + 1; // +1 for blank separator row

      if (currentRowCount > 1) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId: sheetId,
                    dimension: 'ROWS',
                    startIndex: 1,
                    endIndex: totalRowsToInsert + 1,
                  },
                },
              },
            ],
          },
        });
      }

      const blankRow = Array(12).fill('');
      const allRowsToInsert = [blankRow, ...rows];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A2:L${totalRowsToInsert + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: allRowsToInsert,
        },
      });

      // Apply color formatting
      const separatorRowIndex = 1;
      const dataStartRowIndex = 2;
      const dataEndRowIndex = dataStartRowIndex + rows.length;

      const requests: any[] = [
        // Gray separator row
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: separatorRowIndex,
              endRowIndex: separatorRowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: 12,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 0.7,
                  green: 0.7,
                  blue: 0.7,
                  alpha: 1.0,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
        // Light yellow for data rows
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: dataStartRowIndex,
              endRowIndex: dataEndRowIndex,
              startColumnIndex: 0,
              endColumnIndex: 12,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 1.0,
                  green: 0.95,
                  blue: 0.8,
                  alpha: 1.0,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
      ];

      // Color code test_status column (column index 9: test_status)
      results.forEach((result, index) => {
        const rowIndex = dataStartRowIndex + index;

        const statusColor =
          result.test_status === 'PASS'
            ? { red: 0.85, green: 0.95, blue: 0.85, alpha: 1.0 } // Light green for PASS
            : { red: 0.95, green: 0.85, blue: 0.85, alpha: 1.0 }; // Light red for FAIL

        requests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 9, // test_status column (0-indexed)
              endColumnIndex: 10,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: statusColor,
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });
      });

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests,
        },
      });
    }

    console.log(`\n✅ Google Sheet updated: ${rows.length} rows inserted at top of sheet "${sheetName}"`);
    console.log(`   Sheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  } catch (error: any) {
    console.error('\n❌ Error updating Google Sheet:', error.message);
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

/**
 * Update Google Sheets with summarization test results
 * @param results - Array of summarization test results
 * @param sheetName - Name of the sheet to update (default: Feat-Summarization)
 */
export async function updateSummarizationResults(
  results: SummarizationTestResult[],
  sheetName: string = 'Feat-Summarization'
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getOutputSpreadsheetIdForModel('summarization');

    // Log the dates being written for debugging
    if (results.length > 0) {
      const dates = [...new Set(results.map(r => r.date))];
      console.log(`\n📅 Writing summarization test results with dates: ${dates.join(', ')}`);
    }

    // Prepare headers for summarization results
    const headers = [
      'date',
      'mode',
      'identifier',
      'original_length',
      'summary_length',
      'compression_ratio',
      'summary_text',
      'max_length_param',
      'latency_ms',
      'test_status',
      'failure_reason',
      'timestamp',
    ];

    // Check if sheet exists, create if it doesn't
    let sheetId = 0;

    try {
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      const existingSheet = spreadsheet.data.sheets?.find(
        (s) => s.properties?.title === sheetName
      );

      if (existingSheet) {
        sheetId = existingSheet.properties?.sheetId || 0;
      } else {
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
        sheetId = createResponse.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;
      }
    } catch (error) {
      throw new Error(`Failed to access or create sheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Always update headers
    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A1:L1`,
      });
    } catch (error) {
      // Ignore errors if range doesn't exist yet
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:L1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers],
      },
    });

    console.log(`✅ Updated headers in sheet "${sheetName}" with ${headers.length} columns`);

    // Convert results to rows
    const rows = results.map((result) => [
      result.date,
      result.mode,
      result.identifier,
      result.original_length,
      result.summary_length,
      result.compression_ratio,
      result.summary_text,
      result.max_length_param,
      result.latency_ms,
      result.test_status,
      result.failure_reason || '',
      result.timestamp,
    ]);

    // Insert new rows at the top
    if (rows.length > 0) {
      const allData = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:L`,
      });

      const currentRowCount = allData.data.values?.length || 1;
      const totalRowsToInsert = rows.length + 1; // +1 for blank separator row

      if (currentRowCount > 1) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId: sheetId,
                    dimension: 'ROWS',
                    startIndex: 1,
                    endIndex: totalRowsToInsert + 1,
                  },
                },
              },
            ],
          },
        });
      }

      const blankRow = Array(12).fill('');
      const allRowsToInsert = [blankRow, ...rows];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A2:L${totalRowsToInsert + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: allRowsToInsert,
        },
      });

      // Apply color formatting
      const separatorRowIndex = 1;
      const dataStartRowIndex = 2;
      const dataEndRowIndex = dataStartRowIndex + rows.length;

      const requests: any[] = [
        // Gray separator row
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: separatorRowIndex,
              endRowIndex: separatorRowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: 12,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 0.7,
                  green: 0.7,
                  blue: 0.7,
                  alpha: 1.0,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
        // Light yellow for data rows
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: dataStartRowIndex,
              endRowIndex: dataEndRowIndex,
              startColumnIndex: 0,
              endColumnIndex: 12,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 1.0,
                  green: 0.95,
                  blue: 0.8,
                  alpha: 1.0,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
      ];

      // Color code test_status column (column index 9: test_status)
      results.forEach((result, index) => {
        const rowIndex = dataStartRowIndex + index;

        const statusColor =
          result.test_status === 'PASS'
            ? { red: 0.85, green: 0.95, blue: 0.85, alpha: 1.0 } // Light green for PASS
            : { red: 0.95, green: 0.85, blue: 0.85, alpha: 1.0 }; // Light red for FAIL

        requests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 9, // test_status column (0-indexed)
              endColumnIndex: 10,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: statusColor,
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });
      });

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests,
        },
      });
    }

    console.log(`\n✅ Google Sheet updated: ${rows.length} rows inserted at top of sheet "${sheetName}"`);
    console.log(`   Sheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  } catch (error: any) {
    console.error('\n❌ Error updating Google Sheet:', error.message);
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

/**
 * Update Google Sheets with intent detection test results
 * @param results - Array of intent detection test results
 * @param sheetName - Name of the sheet to update (default: Feat-IntentDetection)
 */
export async function updateIntentDetectionResults(
  results: IntentDetectionTestResult[],
  sheetName: string = 'Feat-IntentDetection'
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getOutputSpreadsheetIdForModel('intent-detection');

    // Log the dates being written for debugging
    if (results.length > 0) {
      const dates = [...new Set(results.map(r => r.date))];
      console.log(`\n📅 Writing intent detection test results with dates: ${dates.join(', ')}`);
    }

    // Prepare headers for intent detection results
    const headers = [
      'date',
      'mode',
      'identifier',
      'detected_intent',
      'confidence',
      'intent_choices',
      'transcribed_text',
      'latency_ms',
      'test_status',
      'failure_reason',
      'timestamp',
    ];

    // Check if sheet exists, create if it doesn't
    let sheetId = 0;

    try {
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      const existingSheet = spreadsheet.data.sheets?.find(
        (s) => s.properties?.title === sheetName
      );

      if (existingSheet) {
        sheetId = existingSheet.properties?.sheetId || 0;
      } else {
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
        sheetId = createResponse.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;
      }
    } catch (error) {
      throw new Error(`Failed to access or create sheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Always update headers
    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A1:K1`,
      });
    } catch (error) {
      // Ignore errors if range doesn't exist yet
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:K1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers],
      },
    });

    console.log(`✅ Updated headers in sheet "${sheetName}" with ${headers.length} columns`);

    // Convert results to rows
    const rows = results.map((result) => [
      result.date,
      result.mode,
      result.identifier,
      result.detected_intent,
      result.confidence,
      result.intent_choices,
      result.transcribed_text,
      result.latency_ms,
      result.test_status,
      result.failure_reason || '',
      result.timestamp,
    ]);

    // Insert new rows at the top
    if (rows.length > 0) {
      const allData = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:K`,
      });

      const currentRowCount = allData.data.values?.length || 1;
      const totalRowsToInsert = rows.length + 1; // +1 for blank separator row

      if (currentRowCount > 1) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId: sheetId,
                    dimension: 'ROWS',
                    startIndex: 1,
                    endIndex: totalRowsToInsert + 1,
                  },
                },
              },
            ],
          },
        });
      }

      const blankRow = Array(11).fill('');
      const allRowsToInsert = [blankRow, ...rows];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A2:K${totalRowsToInsert + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: allRowsToInsert,
        },
      });

      // Apply color formatting
      const separatorRowIndex = 1;
      const dataStartRowIndex = 2;
      const dataEndRowIndex = dataStartRowIndex + rows.length;

      const requests: any[] = [
        // Gray separator row
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: separatorRowIndex,
              endRowIndex: separatorRowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: 11,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 0.7,
                  green: 0.7,
                  blue: 0.7,
                  alpha: 1.0,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
        // Light yellow for data rows
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: dataStartRowIndex,
              endRowIndex: dataEndRowIndex,
              startColumnIndex: 0,
              endColumnIndex: 11,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 1.0,
                  green: 0.95,
                  blue: 0.8,
                  alpha: 1.0,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
      ];

      // Color code test_status column (column index 8: test_status)
      results.forEach((result, index) => {
        const rowIndex = dataStartRowIndex + index;

        const statusColor =
          result.test_status === 'PASS'
            ? { red: 0.85, green: 0.95, blue: 0.85, alpha: 1.0 } // Light green for PASS
            : { red: 0.95, green: 0.85, blue: 0.85, alpha: 1.0 }; // Light red for FAIL

        requests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 8, // test_status column (0-indexed)
              endColumnIndex: 9,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: statusColor,
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });
      });

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests,
        },
      });
    }

    console.log(`\n✅ Google Sheet updated: ${rows.length} rows inserted at top of sheet "${sheetName}"`);
    console.log(`   Sheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  } catch (error: any) {
    console.error('\n❌ Error updating Google Sheet:', error.message);
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

export interface SentimentAnalysisTestResult {
  date: string;
  mode: string;
  identifier: string;
  detected_sentiment: string;
  score: string;
  transcribed_text: string;
  latency_ms: number;
  test_status: 'PASS' | 'FAIL';
  failure_reason: string;
  timestamp: string;
}

export async function updateSentimentAnalysisResults(
  results: SentimentAnalysisTestResult[],
  sheetName: string = 'Feat-SentimentAnalysis'
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getOutputSpreadsheetIdForModel('sentiment');

    // Log the dates being written for debugging
    if (results.length > 0) {
      const dates = [...new Set(results.map(r => r.date))];
      console.log(`\n📅 Writing sentiment analysis test results with dates: ${dates.join(', ')}`);
    }

    // Prepare headers for sentiment analysis results
    const headers = [
      'date',
      'mode',
      'identifier',
      'detected_sentiment',
      'score',
      'transcribed_text',
      'latency_ms',
      'test_status',
      'failure_reason',
      'timestamp',
    ];

    // Check if sheet exists, create if it doesn't
    let sheetId = 0;

    try {
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      const existingSheet = spreadsheet.data.sheets?.find(
        (s) => s.properties?.title === sheetName
      );

      if (existingSheet) {
        sheetId = existingSheet.properties?.sheetId || 0;
      } else {
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
        sheetId = createResponse.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;
      }
    } catch (error) {
      throw new Error(`Failed to access or create sheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Always update headers
    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A1:J1`,
      });
    } catch (error) {
      // Ignore errors if range doesn't exist yet
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:J1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers],
      },
    });

    console.log(`✅ Updated headers in sheet "${sheetName}" with ${headers.length} columns`);

    // Convert results to rows
    const rows = results.map((result) => [
      result.date,
      result.mode,
      result.identifier,
      result.detected_sentiment,
      result.score,
      result.transcribed_text,
      result.latency_ms,
      result.test_status,
      result.failure_reason || '',
      result.timestamp,
    ]);

    // Insert new rows at the top
    if (rows.length > 0) {
      const allData = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:J`,
      });

      const currentRowCount = allData.data.values?.length || 1;
      const totalRowsToInsert = rows.length + 1; // +1 for blank separator row

      if (currentRowCount > 1) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId: sheetId,
                    dimension: 'ROWS',
                    startIndex: 1,
                    endIndex: totalRowsToInsert + 1,
                  },
                },
              },
            ],
          },
        });
      }

      const blankRow = Array(10).fill('');
      const allRowsToInsert = [blankRow, ...rows];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A2:J${totalRowsToInsert + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: allRowsToInsert,
        },
      });

      // Apply color formatting
      const separatorRowIndex = 1;
      const dataStartRowIndex = 2;
      const dataEndRowIndex = dataStartRowIndex + rows.length;

      const requests: any[] = [
        // Gray separator row
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: separatorRowIndex,
              endRowIndex: separatorRowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: 10,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 0.7,
                  green: 0.7,
                  blue: 0.7,
                  alpha: 1.0,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
        // Light yellow for data rows
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: dataStartRowIndex,
              endRowIndex: dataEndRowIndex,
              startColumnIndex: 0,
              endColumnIndex: 10,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 1.0,
                  green: 0.95,
                  blue: 0.8,
                  alpha: 1.0,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
      ];

      // Color code test_status column (column index 7: test_status)
      results.forEach((result, index) => {
        const rowIndex = dataStartRowIndex + index;

        const statusColor =
          result.test_status === 'PASS'
            ? { red: 0.85, green: 0.95, blue: 0.85, alpha: 1.0 } // Light green for PASS
            : { red: 0.95, green: 0.85, blue: 0.85, alpha: 1.0 }; // Light red for FAIL

        requests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 7, // test_status column (0-indexed)
              endColumnIndex: 8,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: statusColor,
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });
      });

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests,
        },
      });
    }

    console.log(`\n✅ Google Sheet updated: ${rows.length} rows inserted at top of sheet "${sheetName}"`);
    console.log(`   Sheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  } catch (error: any) {
    console.error('\n❌ Error updating Google Sheet:', error.message);
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

export interface ProfanityHashingTestResult {
  date: string;
  mode: string;
  identifier: string;
  original_text: string;
  clean_text: string;
  profanity_found: string;
  profanity_count: number;
  profanity_words: string;
  latency_ms: number;
  test_status: 'PASS' | 'FAIL';
  failure_reason: string;
  timestamp: string;
}

export async function updateProfanityHashingResults(
  results: ProfanityHashingTestResult[],
  sheetName: string = 'Feat-ProfanityHashing'
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getOutputSpreadsheetIdForModel('profanity-hashing');

    // Log the dates being written for debugging
    if (results.length > 0) {
      const dates = [...new Set(results.map(r => r.date))];
      console.log(`\n📅 Writing profanity hashing test results with dates: ${dates.join(', ')}`);
    }

    // Prepare headers for profanity hashing results (12 columns: A-L)
    const headers = [
      'date',
      'mode',
      'identifier',
      'Transcript / ground_truth_text',
      'clean_text',
      'profanity_found',
      'profanity_count',
      'profanity_words',
      'latency_ms',
      'test_status',
      'failure_reason',
      'timestamp',
    ];

    // Check if sheet exists, create if it doesn't
    let sheetId = 0;

    try {
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      const existingSheet = spreadsheet.data.sheets?.find(
        (s) => s.properties?.title === sheetName
      );

      if (existingSheet) {
        sheetId = existingSheet.properties?.sheetId || 0;
      } else {
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
        sheetId = createResponse.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;
      }
    } catch (error) {
      throw new Error(`Failed to access or create sheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Always update headers
    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A1:L1`,
      });
    } catch (error) {
      // Ignore errors if range doesn't exist yet
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:L1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers],
      },
    });

    console.log(`✅ Updated headers in sheet "${sheetName}" with ${headers.length} columns`);

    // Convert results to rows
    const rows = results.map((result) => [
      result.date,
      result.mode,
      result.identifier,
      result.original_text,
      result.clean_text,
      result.profanity_found,
      result.profanity_count,
      result.profanity_words,
      result.latency_ms,
      result.test_status,
      result.failure_reason || '',
      result.timestamp,
    ]);

    // Insert new rows at the top
    if (rows.length > 0) {
      const allData = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:L`,
      });

      const currentRowCount = allData.data.values?.length || 1;
      const totalRowsToInsert = rows.length + 1; // +1 for blank separator row

      if (currentRowCount > 1) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId: sheetId,
                    dimension: 'ROWS',
                    startIndex: 1,
                    endIndex: totalRowsToInsert + 1,
                  },
                },
              },
            ],
          },
        });
      }

      const blankRow = Array(12).fill('');
      const allRowsToInsert = [blankRow, ...rows];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A2:L${totalRowsToInsert + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: allRowsToInsert,
        },
      });

      // Apply color formatting
      const separatorRowIndex = 1;
      const dataStartRowIndex = 2;
      const dataEndRowIndex = dataStartRowIndex + rows.length;

      const requests: any[] = [
        // Gray separator row
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: separatorRowIndex,
              endRowIndex: separatorRowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: 12,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 0.7,
                  green: 0.7,
                  blue: 0.7,
                  alpha: 1.0,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
        // Light yellow for data rows
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: dataStartRowIndex,
              endRowIndex: dataEndRowIndex,
              startColumnIndex: 0,
              endColumnIndex: 12,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 1.0,
                  green: 0.95,
                  blue: 0.8,
                  alpha: 1.0,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
      ];

      // Color code test_status column (column index 9: test_status)
      results.forEach((result, index) => {
        const rowIndex = dataStartRowIndex + index;

        const statusColor =
          result.test_status === 'PASS'
            ? { red: 0.85, green: 0.95, blue: 0.85, alpha: 1.0 } // Light green for PASS
            : { red: 0.95, green: 0.85, blue: 0.85, alpha: 1.0 }; // Light red for FAIL

        requests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 9, // test_status column (0-indexed)
              endColumnIndex: 10,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: statusColor,
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });

        // Color code profanity_found column (column index 5)
        const profanityColor =
          result.profanity_found === 'YES'
            ? { red: 1.0, green: 0.9, blue: 0.7, alpha: 1.0 } // Light orange for YES
            : { red: 0.9, green: 0.95, blue: 1.0, alpha: 1.0 }; // Light blue for NO

        requests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 5, // profanity_found column (0-indexed)
              endColumnIndex: 6,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: profanityColor,
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });
      });

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests,
        },
      });
    }

    console.log(`\n✅ Google Sheet updated: ${rows.length} rows inserted at top of sheet "${sheetName}"`);
    console.log(`   Sheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  } catch (error: any) {
    console.error('\n❌ Error updating Google Sheet:', error.message);
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

export interface EmotionDiarizationTestResult {
  date: string;
  audio_file: string;
  emotions_detected: string;
  segment_count: number;
  avg_confidence: string;
  latency_ms: number;
  test_status: 'PASS' | 'FAIL';
  failure_reason: string;
  timestamp: string;
}

export async function updateEmotionDiarizationResults(
  results: EmotionDiarizationTestResult[],
  sheetName: string = 'Feat-EmotionDiarization'
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getOutputSpreadsheetIdForModel('emotion-diarization');

    // Log the dates being written for debugging
    if (results.length > 0) {
      const dates = [...new Set(results.map(r => r.date))];
      console.log(`\n📅 Writing emotion diarization test results with dates: ${dates.join(', ')}`);
    }

    // Prepare headers for emotion diarization results
    const headers = [
      'date',
      'audio_file',
      'emotions_detected',
      'segment_count',
      'avg_confidence',
      'latency_ms',
      'test_status',
      'failure_reason',
      'timestamp',
    ];

    // Check if sheet exists, create if it doesn't
    let sheetId = 0;

    try {
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      const existingSheet = spreadsheet.data.sheets?.find(
        (s) => s.properties?.title === sheetName
      );

      if (existingSheet) {
        sheetId = existingSheet.properties?.sheetId || 0;
      } else {
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
        sheetId = createResponse.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;
      }
    } catch (error) {
      throw new Error(`Failed to access or create sheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Always update headers
    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A1:I1`,
      });
    } catch (error) {
      // Ignore errors if range doesn't exist yet
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:I1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers],
      },
    });

    console.log(`✅ Updated headers in sheet "${sheetName}" with ${headers.length} columns`);

    // Convert results to rows
    const rows = results.map((result) => [
      result.date,
      result.audio_file,
      result.emotions_detected,
      result.segment_count,
      result.avg_confidence,
      result.latency_ms,
      result.test_status,
      result.failure_reason || '',
      result.timestamp,
    ]);

    // Insert new rows at the top
    if (rows.length > 0) {
      const allData = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:I`,
      });

      const currentRowCount = allData.data.values?.length || 1;
      const totalRowsToInsert = rows.length + 1; // +1 for blank separator row

      if (currentRowCount > 1) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId: sheetId,
                    dimension: 'ROWS',
                    startIndex: 1,
                    endIndex: totalRowsToInsert + 1,
                  },
                },
              },
            ],
          },
        });
      }

      const blankRow = Array(9).fill('');
      const allRowsToInsert = [blankRow, ...rows];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A2:I${totalRowsToInsert + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: allRowsToInsert,
        },
      });

      // Apply color formatting
      const separatorRowIndex = 1;
      const dataStartRowIndex = 2;
      const dataEndRowIndex = dataStartRowIndex + rows.length;

      const requests: any[] = [
        // Gray separator row
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: separatorRowIndex,
              endRowIndex: separatorRowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: 9,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 0.7,
                  green: 0.7,
                  blue: 0.7,
                  alpha: 1.0,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
        // Light yellow for data rows
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: dataStartRowIndex,
              endRowIndex: dataEndRowIndex,
              startColumnIndex: 0,
              endColumnIndex: 9,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 1.0,
                  green: 0.95,
                  blue: 0.8,
                  alpha: 1.0,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
      ];

      // Color code test_status column (column index 6: test_status)
      results.forEach((result, index) => {
        const rowIndex = dataStartRowIndex + index;

        const statusColor =
          result.test_status === 'PASS'
            ? { red: 0.85, green: 0.95, blue: 0.85, alpha: 1.0 } // Light green for PASS
            : { red: 0.95, green: 0.85, blue: 0.85, alpha: 1.0 }; // Light red for FAIL

        requests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 6, // test_status column (0-indexed)
              endColumnIndex: 7,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: statusColor,
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });
      });

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests,
        },
      });
    }

    console.log(`\n✅ Google Sheet updated: ${rows.length} rows inserted at top of sheet "${sheetName}"`);
    console.log(`   Sheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  } catch (error: any) {
    console.error('\n❌ Error updating Google Sheet:', error.message);
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

// ─── Custom Keyword Hashing ─────────────────────────────────────────────────

export interface CustomKeywordHashingTestResult {
  date: string;
  mode: string;
  identifier: string;
  original_text: string;
  clean_text: string;
  hash_keywords: string;
  keywords_count: number;
  keywords_found_in_original: number;
  hash_count: number;
  latency_ms: number;
  test_status: 'PASS' | 'FAIL';
  failure_reason: string;
  timestamp: string;
}

export async function updateCustomKeywordHashingResults(
  results: CustomKeywordHashingTestResult[],
  sheetName: string = 'Feat-CustomKeywordHashing'
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getOutputSpreadsheetIdForModel('custom-keyword-hashing');

    if (results.length > 0) {
      const dates = [...new Set(results.map(r => r.date))];
      console.log(`\n📅 Writing custom keyword hashing test results with dates: ${dates.join(', ')}`);
    }

    const headers = [
      'date',
      'mode',
      'identifier',
      'Transcript / ground_truth_text',
      'clean_text',
      'hash_keywords',
      'keywords_count',
      'keywords_found_in_original',
      'hash_count',
      'latency_ms',
      'test_status',
      'failure_reason',
      'timestamp',
    ];

    let sheetId = 0;

    try {
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      const existingSheet = spreadsheet.data.sheets?.find(
        (s) => s.properties?.title === sheetName
      );

      if (existingSheet) {
        sheetId = existingSheet.properties?.sheetId || 0;
      } else {
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
        sheetId = createResponse.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;
      }
    } catch (error) {
      throw new Error(`Failed to access or create sheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A1:M1`,
      });
    } catch (error) {
      // Ignore errors if range doesn't exist yet
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:M1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers],
      },
    });

    console.log(`✅ Updated headers in sheet "${sheetName}" with ${headers.length} columns`);

    const rows = results.map((result) => [
      result.date,
      result.mode,
      result.identifier,
      result.original_text,
      result.clean_text,
      result.hash_keywords,
      result.keywords_count,
      result.keywords_found_in_original,
      result.hash_count,
      result.latency_ms,
      result.test_status,
      result.failure_reason || '',
      result.timestamp,
    ]);

    if (rows.length > 0) {
      const allData = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:M`,
      });

      const currentRowCount = allData.data.values?.length || 1;
      const totalRowsToInsert = rows.length + 1;

      if (currentRowCount > 1) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId: sheetId,
                    dimension: 'ROWS',
                    startIndex: 1,
                    endIndex: totalRowsToInsert + 1,
                  },
                },
              },
            ],
          },
        });
      }

      const blankRow = Array(13).fill('');
      const allRowsToInsert = [blankRow, ...rows];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A2:M${totalRowsToInsert + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: allRowsToInsert,
        },
      });

      const separatorRowIndex = 1;
      const dataStartRowIndex = 2;
      const dataEndRowIndex = dataStartRowIndex + rows.length;

      const formatRequests: any[] = [
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: separatorRowIndex,
              endRowIndex: separatorRowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: 13,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.7, green: 0.7, blue: 0.7, alpha: 1.0 },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: dataStartRowIndex,
              endRowIndex: dataEndRowIndex,
              startColumnIndex: 0,
              endColumnIndex: 13,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 1.0, green: 0.95, blue: 0.8, alpha: 1.0 },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
      ];

      results.forEach((result, index) => {
        const rowIndex = dataStartRowIndex + index;

        const statusColor =
          result.test_status === 'PASS'
            ? { red: 0.85, green: 0.95, blue: 0.85, alpha: 1.0 }
            : { red: 0.95, green: 0.85, blue: 0.85, alpha: 1.0 };

        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 10,
              endColumnIndex: 11,
            },
            cell: {
              userEnteredFormat: { backgroundColor: statusColor },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });

        const hashCountColor =
          result.hash_count > 0
            ? { red: 1.0, green: 0.9, blue: 0.7, alpha: 1.0 }
            : { red: 0.9, green: 0.95, blue: 1.0, alpha: 1.0 };

        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 8,
              endColumnIndex: 9,
            },
            cell: {
              userEnteredFormat: { backgroundColor: hashCountColor },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });
      });

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: formatRequests,
        },
      });
    }

    console.log(`\n✅ Google Sheet updated: ${rows.length} rows inserted at top of sheet "${sheetName}"`);
    console.log(`   Sheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  } catch (error: any) {
    console.error('\n❌ Error updating Google Sheet:', error.message);
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

// ─── Keyword Normalization ──────────────────────────────────────────────────

export interface KeywordNormalizationTestResult {
  date: string;
  mode: string;
  identifier: string;
  original_text: string;
  transcribed_text: string;
  normalized_text: string;
  keywords: string;
  keywords_count: number;
  keywords_found_in_normalized: number;
  latency_ms: number;
  test_status: 'PASS' | 'FAIL';
  failure_reason: string;
  timestamp: string;
}

export async function updateKeywordNormalizationResults(
  results: KeywordNormalizationTestResult[],
  sheetName: string = 'Feat-KeywordNormalization'
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getOutputSpreadsheetIdForModel('keyword-normalization');

    if (results.length > 0) {
      const dates = [...new Set(results.map(r => r.date))];
      console.log(`\n📅 Writing keyword normalization test results with dates: ${dates.join(', ')}`);
    }

    const headers = [
      'date',
      'mode',
      'identifier',
      'original_text',
      'transcribed_text',
      'normalized_text',
      'keywords',
      'keywords_count',
      'keywords_found_in_normalized',
      'latency_ms',
      'test_status',
      'failure_reason',
      'timestamp',
    ];

    let sheetId = 0;

    try {
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      const existingSheet = spreadsheet.data.sheets?.find(
        (s) => s.properties?.title === sheetName
      );

      if (existingSheet) {
        sheetId = existingSheet.properties?.sheetId || 0;
      } else {
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
        sheetId = createResponse.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;
      }
    } catch (error) {
      throw new Error(`Failed to access or create sheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A1:M1`,
      });
    } catch (error) {
      // Ignore errors if range doesn't exist yet
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:M1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers],
      },
    });

    console.log(`✅ Updated headers in sheet "${sheetName}" with ${headers.length} columns`);

    const rows = results.map((result) => [
      result.date,
      result.mode,
      result.identifier,
      result.original_text,
      result.transcribed_text,
      result.normalized_text,
      result.keywords,
      result.keywords_count,
      result.keywords_found_in_normalized,
      result.latency_ms,
      result.test_status,
      result.failure_reason || '',
      result.timestamp,
    ]);

    if (rows.length > 0) {
      const allData = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:M`,
      });

      const currentRowCount = allData.data.values?.length || 1;
      const totalRowsToInsert = rows.length + 1;

      if (currentRowCount > 1) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId: sheetId,
                    dimension: 'ROWS',
                    startIndex: 1,
                    endIndex: totalRowsToInsert + 1,
                  },
                },
              },
            ],
          },
        });
      }

      const blankRow = Array(13).fill('');
      const allRowsToInsert = [blankRow, ...rows];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A2:M${totalRowsToInsert + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: allRowsToInsert,
        },
      });

      const separatorRowIndex = 1;
      const dataStartRowIndex = 2;
      const dataEndRowIndex = dataStartRowIndex + rows.length;

      const normFormatRequests: any[] = [
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: separatorRowIndex,
              endRowIndex: separatorRowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: 13,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.7, green: 0.7, blue: 0.7, alpha: 1.0 },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: dataStartRowIndex,
              endRowIndex: dataEndRowIndex,
              startColumnIndex: 0,
              endColumnIndex: 13,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 1.0, green: 0.95, blue: 0.8, alpha: 1.0 },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
      ];

      results.forEach((result, index) => {
        const rowIndex = dataStartRowIndex + index;

        const statusColor =
          result.test_status === 'PASS'
            ? { red: 0.85, green: 0.95, blue: 0.85, alpha: 1.0 }
            : { red: 0.95, green: 0.85, blue: 0.85, alpha: 1.0 };

        normFormatRequests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 10, // test_status column (0-indexed)
              endColumnIndex: 11,
            },
            cell: {
              userEnteredFormat: { backgroundColor: statusColor },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });

        // Color keywords_found_in_normalized column (index 8)
        const keywordsColor =
          result.keywords_found_in_normalized > 0
            ? { red: 0.85, green: 0.95, blue: 0.85, alpha: 1.0 } // Light green if keywords normalized
            : { red: 1.0, green: 0.9, blue: 0.7, alpha: 1.0 }; // Light orange if none found

        normFormatRequests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 8, // keywords_found_in_normalized column (0-indexed)
              endColumnIndex: 9,
            },
            cell: {
              userEnteredFormat: { backgroundColor: keywordsColor },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });
      });

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: normFormatRequests,
        },
      });
    }

    console.log(`\n✅ Google Sheet updated: ${rows.length} rows inserted at top of sheet "${sheetName}"`);
    console.log(`   Sheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  } catch (error: any) {
    console.error('\n❌ Error updating Google Sheet:', error.message);
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

// ─── Medical Keyterm Correction ─────────────────────────────────────────────

export interface MedicalCorrectionTestResult {
  date: string;
  mode: string;
  identifier: string;
  original_text: string;
  transcribed_text: string;
  corrected_text: string;
  entities_found: number;
  entities_corrected: number;
  corrections: string;
  latency_ms: number;
  test_status: 'PASS' | 'FAIL';
  failure_reason: string;
  timestamp: string;
}

export async function updateMedicalCorrectionResults(
  results: MedicalCorrectionTestResult[],
  sheetName: string = 'Feat-MedicalCorrection'
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getOutputSpreadsheetIdForModel('medical-correction');

    if (results.length > 0) {
      const dates = [...new Set(results.map(r => r.date))];
      console.log(`\n📅 Writing medical correction test results with dates: ${dates.join(', ')}`);
    }

    // 13 columns: A-M
    const headers = [
      'date',
      'mode',
      'identifier',
      'original_text',
      'transcribed_text',
      'corrected_text',
      'entities_found',
      'entities_corrected',
      'corrections',
      'latency_ms',
      'test_status',
      'failure_reason',
      'timestamp',
    ];

    let sheetId = 0;

    try {
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      const existingSheet = spreadsheet.data.sheets?.find(
        (s) => s.properties?.title === sheetName
      );

      if (existingSheet) {
        sheetId = existingSheet.properties?.sheetId || 0;
      } else {
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
        sheetId = createResponse.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;
      }
    } catch (error) {
      throw new Error(`Failed to access or create sheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A1:M1`,
      });
    } catch (error) {
      // Ignore errors if range doesn't exist yet
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:M1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers],
      },
    });

    console.log(`✅ Updated headers in sheet "${sheetName}" with ${headers.length} columns`);

    const rows = results.map((result) => [
      result.date,
      result.mode,
      result.identifier,
      result.original_text,
      result.transcribed_text,
      result.corrected_text,
      result.entities_found,
      result.entities_corrected,
      result.corrections,
      result.latency_ms,
      result.test_status,
      result.failure_reason || '',
      result.timestamp,
    ]);

    if (rows.length > 0) {
      const allData = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:M`,
      });

      const currentRowCount = allData.data.values?.length || 1;
      const totalRowsToInsert = rows.length + 1;

      if (currentRowCount > 1) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId: sheetId,
                    dimension: 'ROWS',
                    startIndex: 1,
                    endIndex: totalRowsToInsert + 1,
                  },
                },
              },
            ],
          },
        });
      }

      const blankRow = Array(13).fill('');
      const allRowsToInsert = [blankRow, ...rows];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A2:M${totalRowsToInsert + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: allRowsToInsert,
        },
      });

      const separatorRowIndex = 1;
      const dataStartRowIndex = 2;
      const dataEndRowIndex = dataStartRowIndex + rows.length;

      const medFormatRequests: any[] = [
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: separatorRowIndex,
              endRowIndex: separatorRowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: 13,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.7, green: 0.7, blue: 0.7, alpha: 1.0 },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: dataStartRowIndex,
              endRowIndex: dataEndRowIndex,
              startColumnIndex: 0,
              endColumnIndex: 13,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 1.0, green: 0.95, blue: 0.8, alpha: 1.0 },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
      ];

      results.forEach((result, index) => {
        const rowIndex = dataStartRowIndex + index;

        // test_status column (index 10)
        const statusColor =
          result.test_status === 'PASS'
            ? { red: 0.85, green: 0.95, blue: 0.85, alpha: 1.0 }
            : { red: 0.95, green: 0.85, blue: 0.85, alpha: 1.0 };

        medFormatRequests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 10,
              endColumnIndex: 11,
            },
            cell: {
              userEnteredFormat: { backgroundColor: statusColor },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });

        // entities_corrected column (index 7) - highlight if corrections were made
        const correctedColor =
          result.entities_corrected > 0
            ? { red: 0.85, green: 0.95, blue: 0.85, alpha: 1.0 } // Light green
            : { red: 0.9, green: 0.95, blue: 1.0, alpha: 1.0 }; // Light blue

        medFormatRequests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 7,
              endColumnIndex: 8,
            },
            cell: {
              userEnteredFormat: { backgroundColor: correctedColor },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });
      });

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: medFormatRequests,
        },
      });
    }

    console.log(`\n✅ Google Sheet updated: ${rows.length} rows inserted at top of sheet "${sheetName}"`);
    console.log(`   Sheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  } catch (error: any) {
    console.error('\n❌ Error updating Google Sheet:', error.message);
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
