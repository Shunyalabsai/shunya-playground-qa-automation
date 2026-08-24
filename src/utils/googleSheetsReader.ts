/**
 * Google Sheets Reader Utility
 * Reads test data from Google Sheets and maps to TestDataRow format
 */

import { google } from 'googleapis';
import * as path from 'path';
import { GOOGLE_SHEETS_CONFIG, getInputSpreadsheetIdForModel } from '../config/api.config';

export interface TestDataRow {
  audio_path: string;
  lang: string;
  lang_code: string;
  text: string;
  duration: string;
  test_case_id?: string;
  audio_url?: string;
  description?: string;
  speaker_id?: string;
  expected_translation?: string; // For translation feature - expected translated text
}

/**
 * Initialize Google Sheets API client
 */
async function getSheetsClient() {
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
      'Google Sheets credentials not configured. Please set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env'
    );
  }

  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client as Parameters<typeof google.sheets>[0]['auth'] });
}

/**
 * Read test data from Google Sheets
 * Maps Google Sheets columns to TestDataRow format
 * 
 * Google Sheets columns:
 * - test_case_id
 * - Audio URL
 * - Transcript / ground_truth_text -> text (expected_text)
 * - transcribed_text (Hypothesis) -> (will be filled by API)
 * - language -> lang
 * - detect_language_code -> detected_language (will be filled by API)
 * - expected_language_code -> lang_code
 * - WER -> (will be calculated)
 * - accuracy (%) -> (will be calculated)
 * - description
 * - duration
 * - Speaker ID -> speaker_id
 * 
 * @param sheetName - Name of the sheet tab to read from
 * @param spreadsheetId - Optional spreadsheet ID (defaults to GOOGLE_SHEETS_CONFIG.spreadsheetId)
 * @returns Promise resolving to array of test data rows
 */
export async function readFromGoogleSheet(
  sheetName: string,
  spreadsheetId?: string
): Promise<TestDataRow[]> {
  try {
    const sheets = await getSheetsClient();
    const targetSpreadsheetId = spreadsheetId || GOOGLE_SHEETS_CONFIG.spreadsheetId;

    // First, verify the sheet exists and get its exact name
    let actualSheetName = sheetName;
    try {
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: targetSpreadsheetId,
      });
      
      const allSheets = spreadsheet.data.sheets || [];
      const availableSheetNames = allSheets.map(s => s.properties?.title).filter(Boolean) || [];
      
      // Try exact match first (case-sensitive)
      let existingSheet = allSheets.find(
        (s) => s.properties?.title === sheetName
      );
      
      // If not found, try case-insensitive match
      if (!existingSheet) {
        existingSheet = allSheets.find(
          (s) => s.properties?.title?.toLowerCase() === sheetName.toLowerCase()
        );
      }
      
      // If still not found, try partial match (contains)
      if (!existingSheet) {
        const lowerSheetName = sheetName.toLowerCase();
        existingSheet = allSheets.find(
          (s) => s.properties?.title?.toLowerCase().includes(lowerSheetName) ||
                 lowerSheetName.includes(s.properties?.title?.toLowerCase() || '')
        );
      }
      
      // Try common variations if still not found
      if (!existingSheet) {
        const variations = [
          sheetName.replace(/_/g, ' '),  // Replace underscores with spaces
          sheetName.replace(/ /g, '_'),    // Replace spaces with underscores
          sheetName.replace(/-/g, '_'),   // Replace hyphens with underscores
          sheetName.replace(/_/g, '-'),  // Replace underscores with hyphens
          sheetName.toLowerCase(),
          sheetName.toUpperCase(),
          'CodeSwitchvoices_sample',
          'codeswitchvoices_sample',
          'CodeSwitchVoices_sample',
          'universalvoices_sample',
          'Universalvoices_sample',
          'UniversalVoices_sample',
        ];
        
        for (const variation of variations) {
          existingSheet = allSheets.find(
            (s) => s.properties?.title?.toLowerCase() === variation.toLowerCase()
          );
          if (existingSheet) {
            console.log(`✅ Found sheet tab using variation: "${variation}" (original: "${sheetName}")`);
            break;
          }
        }
      }
      
      if (!existingSheet) {
        // List available sheets for debugging
        console.error(`\n❌ Sheet tab "${sheetName}" not found.`);
        console.error(`📋 Available tabs in spreadsheet: ${availableSheetNames.join(', ')}`);
        console.error(`💡 Tip: Make sure the tab name matches exactly. Common variations tried but not found.`);
        console.error(`💡 Please create the tab "${sheetName}" or update the code to use one of the available tabs.`);
        throw new Error(
          `Sheet tab "${sheetName}" not found. Available tabs: ${availableSheetNames.join(', ')}`
        );
      }
      
      // Use the exact sheet name from the spreadsheet (case-sensitive)
      actualSheetName = existingSheet.properties?.title || sheetName;
      console.log(`✅ Found sheet tab: "${actualSheetName}"`);
    } catch (error: any) {
      if (error.message.includes('not found')) {
        throw error;
      }
      console.warn(`Could not verify sheet existence, proceeding with name: ${sheetName}`);
    }

    // Escape sheet name if it contains special characters or spaces
    // Google Sheets requires single quotes around sheet names with special characters
    const escapedSheetName = actualSheetName.includes(' ') || 
                             actualSheetName.includes('-') || 
                             actualSheetName.includes('/') ||
                             actualSheetName.includes('!') ||
                             actualSheetName.includes("'")
      ? `'${actualSheetName.replace(/'/g, "''")}'` // Escape single quotes by doubling them
      : actualSheetName;

    // Read data from the specified sheet
    const range = `${escapedSheetName}!A:O`; // Extended to column O for additional fields
    console.log(`Reading from range: ${range}`);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: targetSpreadsheetId,
      range: range, // Read columns A through M
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) {
      console.warn(`No data found in sheet "${sheetName}"`);
      return [];
    }

    // Map column headers (first row)
    const headers = rows[0].map((h: string) => (h || '').trim());
    
    // Find column indices - map Google Sheets columns to our format
    const colMap: { [key: string]: number } = {};
    headers.forEach((header: string, index: number) => {
      const normalized = header.toLowerCase().trim();
      // Map: test_case_id -> test_case_id
      if (normalized.includes('test_case_id') || normalized.includes('test case id')) colMap.test_case_id = index;
      // Map: Audio URL -> audio_url
      if (normalized.includes('audio url') || normalized.includes('audio_url')) colMap.audio_url = index;
      // Map: Transcript / ground_truth_text -> text (this becomes expected_text in output)
      if ((normalized.includes('transcript') && normalized.includes('ground')) || 
          normalized.includes('ground_truth') || 
          normalized.includes('ground truth')) colMap.text = index;
      // Map: transcribed_text (Hypothesis) -> predicted_text (filled by API, not from sheet)
      if (normalized.includes('transcribed_text') || normalized.includes('hypothesis')) colMap.predicted_text = index;
      // Map: language -> lang
      if (normalized === 'language' || (normalized.includes('language') && !normalized.includes('code'))) colMap.lang = index;
      // Map: detect_language_code -> detected_language (filled by API, not from sheet)
      if (normalized.includes('detect_language_code') || 
          (normalized.includes('detect') && normalized.includes('language') && normalized.includes('code'))) colMap.detected_language = index;
      // Map: expected_language_code -> lang_code
      if (normalized.includes('expected_language_code') || 
          (normalized.includes('expected') && normalized.includes('language') && normalized.includes('code'))) colMap.lang_code = index;
      // Map: description -> description
      if (normalized.includes('description')) colMap.description = index;
      // Map: duration -> duration
      if (normalized === 'duration') colMap.duration = index;
      // Map: Speaker ID -> speaker_id
      if (normalized.includes('speaker id') || normalized.includes('speaker_id')) colMap.speaker_id = index;
      // Map: transcribed_text (Hindi) or expected translation -> expected_translation
      if ((normalized.includes('transcribed_text') && normalized.includes('hindi')) ||
          normalized.includes('expected_translation') ||
          normalized.includes('expected translation')) colMap.expected_translation = index;
    });

    console.log('Column mapping:', colMap);

    // Parse data rows
    const data: TestDataRow[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((cell: string) => !cell || cell.trim() === '')) continue; // Skip empty rows

      // Extract audio path from Audio URL if available
      let audioPath = '';
      if (colMap.audio_url !== undefined && row[colMap.audio_url]) {
        const audioUrl = row[colMap.audio_url].trim();
        // Extract filename from URL or use as-is if it's a local path
        if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
          // Extract filename from URL
          const urlParts = audioUrl.split('/');
          const filename = urlParts[urlParts.length - 1].split('?')[0];
          // Try to find the file locally
          audioPath = `CodeSwitchvoices_data/audio/${filename}`;
        } else {
          // It's already a local path
          audioPath = audioUrl;
          // Ensure it has the proper prefix if it's relative
          if (!audioPath.startsWith('CodeSwitchvoices_data/') && !audioPath.startsWith('/')) {
            audioPath = `CodeSwitchvoices_data/audio/${path.basename(audioPath)}`;
          }
        }
      }

      // Build TestDataRow
      const testRow: TestDataRow = {
        audio_path: audioPath || `CodeSwitchvoices_data/audio/test_${i}.mp4`,
        lang: colMap.lang !== undefined ? (row[colMap.lang] || '').trim() : 'Hinglish',
        lang_code: colMap.lang_code !== undefined ? (row[colMap.lang_code] || '').trim() : 'hi-en',
        text: colMap.text !== undefined ? (row[colMap.text] || '').trim() : '',
        duration: colMap.duration !== undefined ? (row[colMap.duration] || '').trim() : '0',
      };

      // Add optional fields
      if (colMap.test_case_id !== undefined && row[colMap.test_case_id]) {
        testRow.test_case_id = row[colMap.test_case_id].trim();
      }
      if (colMap.audio_url !== undefined && row[colMap.audio_url]) {
        testRow.audio_url = row[colMap.audio_url].trim();
      }
      if (colMap.description !== undefined && row[colMap.description]) {
        testRow.description = row[colMap.description].trim();
      }
      if (colMap.speaker_id !== undefined && row[colMap.speaker_id]) {
        testRow.speaker_id = row[colMap.speaker_id].trim();
      }
      if (colMap.expected_translation !== undefined && row[colMap.expected_translation]) {
        testRow.expected_translation = row[colMap.expected_translation].trim();
      }

      // Only add rows that have ground-truth text (lang_code may be absent for some rows)
      if (testRow.text) {
        data.push(testRow);
      } else {
        console.warn(`Skipping row ${i + 1}: missing ground_truth_text`);
      }
    }

    console.log(`Successfully parsed ${data.length} rows from Google Sheet "${sheetName}"`);
    return data;
  } catch (error: any) {
    console.error(`Error reading from Google Sheet "${sheetName}":`, error.message);
    throw error;
  }
}
