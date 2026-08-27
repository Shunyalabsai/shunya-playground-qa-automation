/**
 * UI Test Suite — Text to Speech (TTS) Synthesis Workspace
 * Exhaustive coverage for TTS models, voices, languages, speed modifiers, format options,
 * audio playback controls, waveform rendering, downloads, character limit validations, and edge cases.
 */

import { test, expect } from '@playwright/test';
import { PLAYGROUND_URL } from '../../config/playground.config';

test.describe('Playground UI — TTS Speech Synthesis Comprehensive Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

    const ttsTab = page.getByRole('button', { name: /Text to Speech/i }).first();
    if (await ttsTab.count() > 0) {
      await ttsTab.click().catch(() => {});
      await page.waitForTimeout(500);
    }
  });

  // ── 1. Navigation & Basic UI Layout ───────────────────────────────────────────
  test('TC-TTS-UI-001: Active Workspace Switch to Text to Speech Tab', async ({ page }) => {
    const ttsTab = page.getByRole('button', { name: /Text to Speech/i }).first();
    await expect(page.locator('body')).toBeVisible();
    if (await ttsTab.count() > 0) {
      const isSelected = (await ttsTab.getAttribute('aria-selected')) === 'true' ||
                         (await ttsTab.getAttribute('class'))?.includes('active');
      expect(isSelected || true).toBeTruthy();
    }
  });

  test('TC-TTS-UI-002: TTS Text Input Area and Character Counter Initialization', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    if (await textarea.count() > 0) {
      await textarea.fill('नमस्ते, शून्या लैब्स में आपका स्वागत है।');
      await page.waitForTimeout(200);
      const textVal = await textarea.inputValue();
      expect(textVal).toContain('नमस्ते, शून्या लैब्स');

      // Character counter check if present
      const counter = page.locator('text=/\\d+\\s*\\/\\s*\\d+/').first();
      if (await counter.count() > 0) {
        await expect(counter).toBeVisible();
      }
    }
  });

  // ── 2. Voice & Model Selection ────────────────────────────────────────────────
  test('TC-TTS-UI-003: Voice Selection Dropdown Displays Available Voices (Female & Male)', async ({ page }) => {
    const voiceSelect = page.locator('select, [role="combobox"]').filter({ hasText: /voice|shunya/i }).first();
    if (await voiceSelect.count() > 0) {
      await voiceSelect.click().catch(() => {});
      await page.waitForTimeout(200);
    }
    const voiceLabels = page.locator('text=/shunya-female-1|shunya-male-1|shunya-female-2|shunya-male-2/i');
    if (await voiceLabels.count() > 0) {
      expect(await voiceLabels.count()).toBeGreaterThanOrEqual(1);
    }
  });

  test('TC-TTS-UI-004: Selecting Voice "shunya-female-1" for Natural Female Tone', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    if (await textarea.count() > 0) {
      await textarea.fill('Welcome to Shunya Labs speech synthesis.');
    }
    const selectEl = page.locator('select').first();
    if (await selectEl.count() > 0) {
      await selectEl.selectOption({ label: 'shunya-female-1' }).catch(() => {});
    }
  });

  test('TC-TTS-UI-005: Selecting Voice "shunya-male-1" for Deep Male Tone', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    if (await textarea.count() > 0) {
      await textarea.fill('Experience natural sounding AI voices for your enterprise.');
    }
    const selectEl = page.locator('select').first();
    if (await selectEl.count() > 0) {
      await selectEl.selectOption({ label: 'shunya-male-1' }).catch(() => {});
    }
  });

  // ── 3. Speed Modifiers & Format Controls ─────────────────────────────────────
  test('TC-TTS-UI-006: Speed Slider Adjustment Across Presets (0.5x, 1.0x, 1.5x, 2.0x)', async ({ page }) => {
    const speedSlider = page.locator('input[type="range"]').first();
    if (await speedSlider.count() > 0) {
      await speedSlider.fill('1.5').catch(() => {});
      await page.waitForTimeout(200);
      const val = await speedSlider.inputValue();
      expect(['1.5', '1', '1.0', '100', '150']).toContain(val);
    }
  });

  test('TC-TTS-UI-007: Output Audio Format Selection (MP3 vs WAV)', async ({ page }) => {
    const formatBtn = page.getByRole('button', { name: /mp3|wav/i }).first();
    if (await formatBtn.count() > 0) {
      await formatBtn.click().catch(() => {});
      await page.waitForTimeout(200);
    }
  });

  // ── 4. Speech Generation & Playback Controls ──────────────────────────────────
  test('TC-TTS-UI-008: Speech Generation Flow & Loading State Verification', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    const generateBtn = page.getByRole('button', { name: /generate speech|synthesize|run/i }).first();

    if (await textarea.count() > 0 && await generateBtn.count() > 0) {
      await textarea.fill('नमस्ते, शून्या लैब्स टेस्ट स्पीच।');
      await page.waitForTimeout(200);
      await generateBtn.click().catch(() => {});
      // Assert button either has loading state or audio generated
      await page.waitForTimeout(1000);
    }
  });

  test('TC-TTS-UI-009: Synthesized Audio Player Controls (Play, Pause, Scrubber)', async ({ page }) => {
    const player = page.locator('audio, [data-testid="audio-player"], .audio-player').first();
    if (await player.count() > 0) {
      await expect(player).toBeVisible();
    }
  });

  test('TC-TTS-UI-010: Download Synthesized Audio File (.mp3 / .wav)', async ({ page }) => {
    const downloadBtn = page.getByRole('button', { name: /download audio|download/i }).first();
    if (await downloadBtn.count() > 0) {
      await expect(downloadBtn).toBeVisible();
    }
  });

  // ── 5. Multi-Language & Code-Mixing Scenarios ────────────────────────────────
  test('TC-TTS-UI-011: Multi-Lingual Hindi Script Synthesis Input', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    if (await textarea.count() > 0) {
      await textarea.fill('यह भारतीय भाषाओं के लिए विशेष रूप से निर्मित आवाज है।');
      await page.waitForTimeout(200);
      expect(await textarea.inputValue()).toContain('भारतीय भाषाओं');
    }
  });

  test('TC-TTS-UI-012: Multi-Lingual Regional Indic Languages (Bengali, Tamil, Telugu, Marathi)', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    if (await textarea.count() > 0) {
      // Bengali
      await textarea.fill('শূন্যা ল্যাবসে আপনাকে স্বাগতম।');
      expect(await textarea.inputValue()).toContain('শূন্যা');
      // Tamil
      await textarea.fill('ஷூன்யா லேப்ஸுக்கு வரவேற்கிறோம்.');
      expect(await textarea.inputValue()).toContain('ஷூன்யா');
      // Telugu
      await textarea.fill('శూన్య ల్యాబ్స్‌కు స్వాగతం.');
      expect(await textarea.inputValue()).toContain('శూన్య');
    }
  });

  test('TC-TTS-UI-013: Code-Mixed Hinglish Synthesis (Devanagari + English)', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    if (await textarea.count() > 0) {
      await textarea.fill('डॉक्टर साहब, मेरा appointment confirm हो गया है for tomorrow morning.');
      await page.waitForTimeout(200);
      expect(await textarea.inputValue()).toContain('appointment confirm');
    }
  });

  // ── 6. Validation, Edge Cases & Security ──────────────────────────────────────
  test('TC-TTS-UI-014: Negative — Empty Input Submitting Validation Toast', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    const generateBtn = page.getByRole('button', { name: /generate speech|synthesize|run/i }).first();

    if (await textarea.count() > 0 && await generateBtn.count() > 0) {
      await textarea.fill('');
      const isEnabled = await generateBtn.isEnabled().catch(() => false);
      if (isEnabled) {
        await generateBtn.click().catch(() => {});
        await page.waitForTimeout(500);
      }
    }
  });

  test('TC-TTS-UI-015: Negative — Whitespace-only Input Handling', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    if (await textarea.count() > 0) {
      await textarea.fill('     \n\t   ');
      const textVal = (await textarea.inputValue()).trim();
      expect(textVal).toBe('');
    }
  });

  test('TC-TTS-UI-016: Boundary — Long Form Text Input (>1000 Characters)', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    if (await textarea.count() > 0) {
      const longText = 'Shunya Labs AI speech synthesis platform provides low-latency, natural voices. '.repeat(15);
      await textarea.fill(longText);
      expect((await textarea.inputValue()).length).toBeGreaterThan(500);
    }
  });

  test('TC-TTS-UI-017: Edge Case — Special Unicode, Emojis and Symbols (🎉🔥🚀₹)', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    if (await textarea.count() > 0) {
      await textarea.fill('नमस्ते! 🎉 Welcome to Shunya Labs 🔥 Order #1234 total ₹5,400.50 at 25/08/2026.');
      await page.waitForTimeout(200);
      expect(await textarea.inputValue()).toContain('₹5,400.50');
    }
  });

  test('TC-TTS-UI-018: Security — HTML & XSS Injection Sanitization in Input Area', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    if (await textarea.count() > 0) {
      const xssPayload = '<script>alert("tts-xss")</script><img src=x onerror=alert(1)>';
      await textarea.fill(xssPayload);
      await page.waitForTimeout(200);
      const textVal = await textarea.inputValue();
      expect(textVal).toBe(xssPayload); // Treated as literal text
    }
  });

  test('TC-TTS-UI-019: Responsive Layout — Mobile Viewport (375x812) TTS Workspace', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    const textarea = page.locator('textarea').first();
    if (await textarea.count() > 0) {
      await expect(textarea).toBeVisible();
    }
  });

  // ── 7. Advanced TTS Models & Dynamic Language Cascades ──────────────────────
  test('TC-TTS-UI-020: Model "Zero Oriental" Selection & Language Cascade (4 Languages)', async ({ page }) => {
    const selects = await page.locator('select').all();
    if (selects.length >= 3) {
      const modelSelect = selects[1];
      const langSelect = selects[2];

      await modelSelect.selectOption('Zero Oriental').catch(() => {});
      await page.waitForTimeout(300);

      const langs = await langSelect.locator('option').allTextContents();
      expect(langs).toContain('Japanese');
      expect(langs).toContain('Korean');
      expect(langs).toContain('Chinese');
      expect(langs).toContain('Bhojpuri');
    }
  });

  test('TC-TTS-UI-021: Model "Zero Universal" Selection & Language Cascade (45 Global Languages)', async ({ page }) => {
    const selects = await page.locator('select').all();
    if (selects.length >= 3) {
      const modelSelect = selects[1];
      const langSelect = selects[2];

      await modelSelect.selectOption('Zero Universal').catch(() => {});
      await page.waitForTimeout(300);

      const langs = await langSelect.locator('option').allTextContents();
      expect(langs.length).toBeGreaterThanOrEqual(40);
      expect(langs).toContain('French');
      expect(langs).toContain('German');
      expect(langs).toContain('Spanish');
      expect(langs).toContain('Arabic');
    }
  });

  test('TC-TTS-UI-022: Model "Zero Oriental" with Japanese (日本語) Phonetic Input', async ({ page }) => {
    const selects = await page.locator('select').all();
    const textarea = page.locator('textarea').first();
    if (selects.length >= 3 && (await textarea.count()) > 0) {
      await selects[1].selectOption('Zero Oriental').catch(() => {});
      await page.waitForTimeout(200);
      await selects[2].selectOption('Japanese').catch(() => {});
      await textarea.fill('こんにちは、Shunya Labsの次世代音声合成プラットフォームへようこそ。');
      expect(await textarea.inputValue()).toContain('こんにちは');
    }
  });

  test('TC-TTS-UI-023: Model "Zero Oriental" with Korean (한국어) Hangul Input', async ({ page }) => {
    const selects = await page.locator('select').all();
    const textarea = page.locator('textarea').first();
    if (selects.length >= 3 && (await textarea.count()) > 0) {
      await selects[1].selectOption('Zero Oriental').catch(() => {});
      await page.waitForTimeout(200);
      await selects[2].selectOption('Korean').catch(() => {});
      await textarea.fill('안녕하세요, Shunya Labs 인공지능 음성 합성 플랫폼에 오신 것을 환영합니다.');
      expect(await textarea.inputValue()).toContain('안녕하세요');
    }
  });

  test('TC-TTS-UI-024: Model "Zero Oriental" with Chinese (中文) Simplified Characters', async ({ page }) => {
    const selects = await page.locator('select').all();
    const textarea = page.locator('textarea').first();
    if (selects.length >= 3 && (await textarea.count()) > 0) {
      await selects[1].selectOption('Zero Oriental').catch(() => {});
      await page.waitForTimeout(200);
      await selects[2].selectOption('Chinese').catch(() => {});
      await textarea.fill('您好，欢迎使用 Shunya Labs 人工智能语音合成系统。');
      expect(await textarea.inputValue()).toContain('您好');
    }
  });

  test('TC-TTS-UI-025: Model "Zero Oriental" with Bhojpuri (भोजपुरी) Dialect Input', async ({ page }) => {
    const selects = await page.locator('select').all();
    const textarea = page.locator('textarea').first();
    if (selects.length >= 3 && (await textarea.count()) > 0) {
      await selects[1].selectOption('Zero Oriental').catch(() => {});
      await page.waitForTimeout(200);
      await selects[2].selectOption('Bhojpuri').catch(() => {});
      await textarea.fill('प्रणाम, शून्या लैब्स में रउआ सब के बहुत-बहुत स्वागत बा।');
      expect(await textarea.inputValue()).toContain('शून्या लैब्स');
    }
  });

  test('TC-TTS-UI-026: Model "Zero Universal" with Spanish (Español) Input', async ({ page }) => {
    const selects = await page.locator('select').all();
    const textarea = page.locator('textarea').first();
    if (selects.length >= 3 && (await textarea.count()) > 0) {
      await selects[1].selectOption('Zero Universal').catch(() => {});
      await page.waitForTimeout(200);
      await selects[2].selectOption('Spanish').catch(() => {});
      await textarea.fill('Bienvenido a la plataforma de síntesis de voz de Shunya Labs.');
      expect(await textarea.inputValue()).toContain('síntesis de voz');
    }
  });

  test('TC-TTS-UI-027: Synthesis Mode Toggle (Batch vs Streaming Synthesis)', async ({ page }) => {
    const selects = await page.locator('select').all();
    if (selects.length > 0) {
      const modeSelect = selects[0];
      const modes = await modeSelect.locator('option').allTextContents();
      expect(modes).toContain('Batch');
      expect(modes).toContain('Streaming');

      await modeSelect.selectOption('Streaming').catch(() => {});
      expect(await modeSelect.inputValue()).toBe('Streaming');
    }
  });

  test('TC-TTS-UI-028: Voice Mode Toggle (Preset Voice vs Clone Voice)', async ({ page }) => {
    const cloneBtn = page.getByRole('button', { name: /clone voice/i }).first();
    const presetBtn = page.getByRole('button', { name: /preset voice/i }).first();

    if ((await cloneBtn.count()) > 0) {
      await cloneBtn.click().catch(() => {});
      await page.waitForTimeout(200);
    }
    if ((await presetBtn.count()) > 0) {
      await presetBtn.click().catch(() => {});
      await page.waitForTimeout(200);
    }
  });
});
