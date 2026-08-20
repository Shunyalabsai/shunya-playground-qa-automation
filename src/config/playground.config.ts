/**
 * Playground UI Test Configuration
 * Selectors, URLs, and test data for the Shunya Labs API Playground
 */

import dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const PLAYGROUND_URL = process.env.PLAYGROUND_URL || 'https://playground.shunyalabs.ai';

/**
 * Tabs available on the Playground
 */
export const PLAYGROUND_TABS = ['Speech to Text', 'Text to Speech'] as const;

/**
 * Models available in the Model dropdown
 */
export const PLAYGROUND_MODELS = ['Zero Indic', 'Zero Med', 'Zero Codeswitch'] as const;

/**
 * Configuration fields on the Playground
 */
export const PLAYGROUND_FIELDS = {
  transcriptionMode: 'Prerecorded',
  defaultModel: 'Zero Indic',
  defaultLanguage: 'English',
};

/**
 * Supported audio formats as shown on the UI
 */
export const SUPPORTED_AUDIO_FORMATS = ['MP3', 'WAV', 'FLAC', 'M4A'];

/**
 * Test audio files for upload testing
 */
export const TEST_AUDIO_FILES = {
  mp3: path.resolve(
    process.cwd(),
    'input/indicvoices_data/audio/Long_Medical_files',
    'Mania (Bipolar Disorder) _ Mental State Examination (MSE) _ OSCE Guide _  SCA Case _ UKMLA _ CPSA - (320 Kbps).mp3'
  ),
  mp4: path.resolve(
    process.cwd(),
    'input/CodeSwitchvoices_data/audio',
    'Shunyalabs_audio.mpeg'
  ),
  wav: path.resolve(
    process.cwd(),
    'input/CodeSwitchvoices_data/audio',
    'hinglish_arti.wav'
  ),
};

/**
 * Timeouts for UI interactions
 */
export const PLAYGROUND_TIMEOUTS = {
  pageLoad: 60000,
  transcription: 300000,
  uiAction: 10000,
};
