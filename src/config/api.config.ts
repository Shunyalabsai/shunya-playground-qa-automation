/**
 * API Configuration for Shunyalabs ASR Service
 * Based on the official Shunyalabs docs (v1.0)
 *
 * Endpoint:  POST https://asrv2prod.shunyalabs.ai/v1/audio/transcriptions
 * Auth:      Authorization: Bearer <API_KEY>
 * Models:    zero-indic (live), zero-codeswitch, zero-medasr, zero-universal (planned)
 */

import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface ApiConfig {
  apiKey: string;
  transcriptionUrl: string;
  ttsSynthesisUrl: string;
  timeout: number;
  timeoutMs: number;
}

export interface ModelConfig {
  name: string;
  supportedLanguages: Record<string, string>; // display name → language_code
}

// ── Base URL ────────────────────────────────────────────────────────────────

const ASR_BASE = process.env.ASR_BASE_URL_ROOT || 'https://asrv2prod.shunyalabs.ai';
const TTS_BASE = process.env.TTS_BASE_URL_ROOT || 'https://ttsv2.shunyalabs.ai';

// ── API Config ──────────────────────────────────────────────────────────────

export const API_CONFIG: ApiConfig = {
  apiKey: (process.env.ASR_API_KEY || '').trim(),
  transcriptionUrl:
    process.env.ASR_BASE_URL || `${ASR_BASE}/v1/audio/transcriptions`,
  ttsSynthesisUrl:
    process.env.TTS_BASE_URL || `${TTS_BASE}/v1/audio/speech`,
  timeout: 60000,
  timeoutMs: 60000,
};

// ── Auth ─────────────────────────────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getAuthToken(apiKey?: string): Promise<string> {
  const key = (apiKey || API_CONFIG.apiKey).trim();
  if (!key) return '';

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && tokenExpiresAt > now + 60) {
    return cachedToken;
  }

  try {
    const res = await fetch(`${ASR_BASE}/auth/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'api-key': key,
        'Accept': 'application/json',
      },
    });

    if (res.ok) {
      const data = (await res.json()) as { token?: string; expires_at?: number; expires_in?: number };
      if (data?.token) {
        cachedToken = data.token;
        tokenExpiresAt = data.expires_at || (now + (data.expires_in || 900));
        return cachedToken;
      }
    }
  } catch {
    /* fallback to raw API key */
  }

  return key;
}

export function getAuthHeaders(tokenOrKey?: string): { Authorization: string } {
  const token = tokenOrKey || cachedToken || API_CONFIG.apiKey.trim();
  return { Authorization: `Bearer ${token}` };
}

// ── Endpoints ────────────────────────────────────────────────────────────────

export const ENDPOINTS = {
  transcription: API_CONFIG.transcriptionUrl,
  health: `${ASR_BASE}/health`,
  languages: `${ASR_BASE}/languages`,
  streaming: `wss://${new URL(ASR_BASE).host}/v1/realtime`,
  intelligence: {
    translation: `${ASR_BASE}/v1/translate`,
  },
  tts: {
    synthesis: API_CONFIG.ttsSynthesisUrl,
    streaming: `wss://${new URL(TTS_BASE).host}/v1/realtime/v1/audio/speech`,
    health: `${TTS_BASE}/health`,
  },
  speakers: {
    register: `${ASR_BASE}/v1/speakers/register`,
    list: `${ASR_BASE}/v1/speakers/list`,
    identify: `${ASR_BASE}/v1/speakers/identify`,
    delete: `${ASR_BASE}/v1/speakers/delete`,
  },
};

// ── Model Configurations ─────────────────────────────────────────────────────

/**
 * Zero Indic — 55 Indic + English languages
 * Full language list from docs: https://docs.shunyalabs.ai/models-languages/supported-languages
 */
export const ZERO_INDIC_CONFIG: ModelConfig = {
  name: 'zero-indic',
  supportedLanguages: {
    Ahirani: 'ahr',
    Assamese: 'as',
    Awadhi: 'awa',
    Bagheli: 'bfy',
    Bagri: 'bgq',
    Banjari: 'bwq',
    Bengali: 'bn',
    Bhili: 'bhb',
    Bhojpuri: 'bho',
    Bodo: 'brx',
    Braj: 'bra',
    Bundeli: 'bns',
    Chhattisgarhi: 'hne',
    Dogri: 'doi',
    English: 'en',
    Garhwali: 'gbm',
    Garo: 'grt',
    Gujarati: 'gu',
    Harouti: 'hoj',
    Haryanvi: 'bgc',
    Hindi: 'hi',
    Kachchhi: 'kfr',
    Kangri: 'xnr',
    Kannada: 'kn',
    Kashmiri: 'ks',
    Khortha: 'ktk',
    Kodava: 'kfa',
    Konkani: 'kok',
    Kumaoni: 'kfy',
    Kurukh: 'kru',
    Lambadi: 'lmn',
    Magahi: 'mag',
    Maithili: 'mai',
    Malayalam: 'ml',
    Manipuri: 'mni',
    Marathi: 'mr',
    Marwadi: 'mwr',
    Mewari: 'mtr',
    Nepali: 'ne',
    Nimadi: 'noe',
    Odia: 'or',
    'Pahari Mahasui': 'him',
    Punjabi: 'pa',
    Rajasthani: 'raj',
    Sambalpuri: 'spv',
    Sanskrit: 'sa',
    Santali: 'sat',
    Sindhi: 'sd',
    Surgujia: 'sgj',
    Tamil: 'ta',
    Telugu: 'te',
    Tulu: 'tcy',
    Urdu: 'ur',
    Wagdi: 'wbr',
  },
};

/**
 * Zero Codeswitch — Hindi-English code-mixed audio
 */
export const ZERO_CODESWITCH_CONFIG: ModelConfig = {
  name: 'zero-codeswitch',
  supportedLanguages: {
    Hinglish: 'hi-en',
    Auto: 'auto',
  },
};

/**
 * Zero MedASR — Medical/clinical audio (planned)
 */
export const ZERO_MEDASR_CONFIG: ModelConfig = {
  name: 'zero-medasr',
  supportedLanguages: {
    English: 'en',
    Hindi: 'hi',
    Auto: 'auto',
  },
};

/**
 * Zero Universal — 200+ languages (planned)
 */
export const ZERO_UNIVERSAL_CONFIG: ModelConfig = {
  name: 'zero-universal',
  supportedLanguages: {
    Auto: 'auto',
  },
};

// ── Output Script Values (for transliteration) ──────────────────────────────

export const OUTPUT_SCRIPTS = [
  'auto',
  'Devanagari',
  'Bengali',
  'Telugu',
  'Tamil',
  'Kannada',
  'Latin',
  'ITRANS',
] as const;

export type OutputScript = (typeof OUTPUT_SCRIPTS)[number];

// ── Feature Parameters (for reference) ──────────────────────────────────────
// All features are enabled via params on the single /v1/audio/transcriptions endpoint:
//
// Core:           model, file/url, language_code, use_vad_chunking, chunk_size, output_script, word_timestamps, project
// Diarization:    enable_diarization, enable_speaker_identification, enable_emotion_diarization
// NLP (Gemini):   enable_sentiment_analysis, enable_intent_detection, intent_choices,
//                 enable_summarization, summary_max_length, output_language,
//                 enable_keyterm_normalization, keyterm_keywords
// Redaction:      enable_profanity_hashing, hash_keywords

// ── Test Thresholds ──────────────────────────────────────────────────────────

export const TEST_THRESHOLDS = {
  WER: process.env.ASR_WER_THRESHOLD
    ? parseFloat(process.env.ASR_WER_THRESHOLD)
    : 0.8,
  CER: process.env.ASR_CER_THRESHOLD
    ? parseFloat(process.env.ASR_CER_THRESHOLD)
    : 0.4,
};

// ── Google Sheets Config ─────────────────────────────────────────────────────

const defaultKeyFilePath = path.resolve(process.cwd(), 'Google_service_account.json');
const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || (fs.existsSync(defaultKeyFilePath) ? defaultKeyFilePath : '');

export const GOOGLE_SHEETS_CONFIG = {
  spreadsheetId:
    process.env.GOOGLE_SHEET_ID ||
    '1KWWMQN3ppFfux1mP8Wb34UmtrIEXhz2T6_1_goXI8JI',
  indicInputSpreadsheetId:
    process.env.GOOGLE_SHEET_ID_INDIC_INPUT ||
    '1KWWMQN3ppFfux1mP8Wb34UmtrIEXhz2T6_1_goXI8JI',
  codeswitchInputSpreadsheetId:
    process.env.GOOGLE_SHEET_ID_CODESWITCH_INPUT ||
    '1KWWMQN3ppFfux1mP8Wb34UmtrIEXhz2T6_1_goXI8JI',
  universalInputSpreadsheetId:
    process.env.GOOGLE_SHEET_ID_UNIVERSAL_INPUT ||
    '1KWWMQN3ppFfux1mP8Wb34UmtrIEXhz2T6_1_goXI8JI',
  credentials: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || serviceAccountPath || '',
  clientEmail: process.env.GOOGLE_CLIENT_EMAIL || '',
  privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') || '',
};

export function getInputSpreadsheetIdForModel(modelName: string): string {
  switch (modelName) {
    case 'zero-indic':
    case 'translation':
    case 'transliteration':
    case 'custom-keyword-hashing':
    case 'keyword-normalization':
      return GOOGLE_SHEETS_CONFIG.indicInputSpreadsheetId;
    case 'zero-codeswitch':
      return GOOGLE_SHEETS_CONFIG.codeswitchInputSpreadsheetId;
    case 'zero-universal':
      return GOOGLE_SHEETS_CONFIG.universalInputSpreadsheetId;
    default:
      return GOOGLE_SHEETS_CONFIG.spreadsheetId;
  }
}

export function getOutputSpreadsheetIdForModel(_modelName: string): string {
  return GOOGLE_SHEETS_CONFIG.spreadsheetId;
}

// ── Backward-compat aliases (to avoid breaking existing imports) ─────────────

export function getApiUrl(): string {
  return API_CONFIG.transcriptionUrl;
}

/** @deprecated Use ENDPOINTS instead. Kept temporarily for migration. */
export const NLP_ENDPOINTS = {
  speechIntelligence: API_CONFIG.transcriptionUrl,
  translate: ENDPOINTS.intelligence.translation,
  keyterms: API_CONFIG.transcriptionUrl,
  hash: API_CONFIG.transcriptionUrl,
  summarize: API_CONFIG.transcriptionUrl,
  intent: API_CONFIG.transcriptionUrl,
  sentiment: API_CONFIG.transcriptionUrl,
  transliterate: API_CONFIG.transcriptionUrl,
  languageIdentify: API_CONFIG.transcriptionUrl,
};

// Legacy feature configs (kept for existing test imports)
export const TRANSLATION_CONFIG: ModelConfig = { name: 'translation', supportedLanguages: { English: 'en', Hindi: 'hi' } };
export const TRANSLITERATION_CONFIG: ModelConfig = { name: 'transliteration', supportedLanguages: { Hindi: 'hi', Telugu: 'te', Kannada: 'kn', Bengali: 'bn' } };
export const DIARIZATION_CONFIG: ModelConfig = { name: 'diarization', supportedLanguages: { 'All Languages': 'all' } };
export const WORD_TIMESTAMPS_CONFIG: ModelConfig = { name: 'word-timestamps', supportedLanguages: { 'All Languages': 'all' } };
export const SUMMARIZATION_CONFIG: ModelConfig = { name: 'summarization', supportedLanguages: { 'All Languages': 'all' } };
export const INTENT_DETECTION_CONFIG: ModelConfig = { name: 'intent-detection', supportedLanguages: { 'All Languages': 'all' } };
export const SENTIMENT_ANALYSIS_CONFIG: ModelConfig = { name: 'sentiment-analysis', supportedLanguages: { 'All Languages': 'all' } };
export const EMOTION_DIARIZATION_CONFIG: ModelConfig = { name: 'emotion-diarization', supportedLanguages: { 'All Languages': 'all' } };
export const PROFANITY_HASHING_CONFIG: ModelConfig = { name: 'profanity-hashing', supportedLanguages: { 'All Languages': 'all' } };
export const CUSTOM_KEYWORD_HASHING_CONFIG: ModelConfig = { name: 'custom-keyword-hashing', supportedLanguages: { 'All Languages': 'all' } };
export const KEYWORD_NORMALIZATION_CONFIG: ModelConfig = { name: 'keyword-normalization', supportedLanguages: { 'All Languages': 'all' } };
