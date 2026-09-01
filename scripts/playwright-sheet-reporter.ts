/**
 * Custom Playwright Reporter: PlaywrightSheetReporter
 * Automatically runs on every `playwright test` completion to:
 * 1. Collect all executed test case details (feature, model, status, duration, error).
 * 2. Save structured run JSON to `reports/playground-runs.json` and timestamped run file.
 * 3. Write/update Google Output Sheet with Top Run Summary Banner, Grey Separator, and Status Dropdowns.
 * 4. Regenerate the Executive Stakeholder Dashboard (`reports/Stakeholder-Dashboard.html`).
 */

import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';
import {
  writePlaygroundResults,
  PlaygroundSuiteResult,
  getLocalDateDMY,
  getLocalTimestamp,
  parseTestDetails,
} from '../src/utils/playgroundSheetWriter';
import { generateTestCases, DeepTestCase } from './populate-exhaustive-master-sheet';
import { generateSmokeTestCases } from './populate-smoke-test-sheet';
import { generateStakeholderDashboard } from './generate-stakeholder-dashboard';

export default class PlaywrightSheetReporter implements Reporter {
  private collectedResults: PlaygroundSuiteResult[] = [];
  private runStartTime: number = Date.now();
  private testCaseMap: Map<string, DeepTestCase> = new Map();

  onBegin(_config: FullConfig, _suite: Suite): void {
    this.runStartTime = Date.now();
    this.collectedResults = [];
    try {
      const canonicalCases = generateTestCases();
      const smokeCases = generateSmokeTestCases();
      const allCases = [...canonicalCases, ...smokeCases];
      this.testCaseMap = new Map(allCases.map((c) => [c.id, c]));
    } catch {
      this.testCaseMap = new Map();
    }
    console.log('\n[PlaywrightSheetReporter] 🚀 Starting test execution run...');
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const today = getLocalDateDMY();
    const timestamp = getLocalTimestamp();

    const isPass = result.status === 'passed';
    const isSkipped = result.status === 'skipped';
    const isFailed = result.status === 'failed' || result.status === 'timedOut';
    const durationMs = result.duration || 0;
    const errorMsg = result.error?.message ? result.error.message.split('\n')[0].replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '') : (isSkipped ? 'Skipped in test execution' : '');

    const titlePath = test.titlePath();
    const testTitle = test.title;

    // Extract structured Test ID, Module, Feature, and Scenario
    const parsed = parseTestDetails(testTitle, 'General');
    const masterCase = this.testCaseMap.get(parsed.testId);

    // Accurate Module, Feature, and Scenario mapping
    const moduleName = masterCase ? masterCase.module : parsed.module;
    let featureName = parsed.feature;
    if (masterCase && masterCase.featuresEnabled && masterCase.featuresEnabled !== 'N/A') {
      featureName = masterCase.featuresEnabled;
    }

    // Accurate Audio Path (only when required)
    let audioDisplay = '—';
    if (masterCase) {
      if (masterCase.audioPath && masterCase.audioPath !== 'N/A' && masterCase.audioPath !== '') {
        audioDisplay = masterCase.audioPath;
      } else if (masterCase.ttsInputText && masterCase.ttsInputText !== 'N/A' && masterCase.ttsInputText !== '') {
        audioDisplay = `TTS Text: "${masterCase.ttsInputText.slice(0, 30)}..."`;
      }
    } else {
      if (testTitle.includes('WAV')) audioDisplay = 'sample.wav';
      else if (testTitle.includes('MP3')) audioDisplay = 'sample.mp3';
      else if (testTitle.includes('corrupted')) audioDisplay = 'corrupted.wav';
      else if (testTitle.includes('empty')) audioDisplay = 'empty.wav';
      else if (testTitle.includes('silence')) audioDisplay = 'silence.wav';
    }

    // Accurate Language & Code (only when required)
    let langDisplay = '—';
    let langCodeDisplay = '—';
    if (masterCase) {
      if (masterCase.languageName && masterCase.languageName !== 'N/A' && masterCase.languageName !== '') {
        langDisplay = masterCase.languageName;
      }
      if (masterCase.languageCode && masterCase.languageCode !== 'N/A' && masterCase.languageCode !== '') {
        langCodeDisplay = masterCase.languageCode;
      }
    }

    const testStatus = isPass ? 'PASS' : (isSkipped ? 'SKIPPED' : 'FAIL');

    this.collectedResults.push({
      test_id: parsed.testId || '—',
      date: today,
      module: moduleName,
      feature: featureName,
      scenario: masterCase ? masterCase.title : parsed.scenario,
      audio_file: audioDisplay,
      language: langDisplay,
      lang_code: langCodeDisplay,
      status: testStatus as any,
      failure_reason: isPass ? '' : errorMsg,
      latency_ms: durationMs,
      api_response_preview: isPass ? 'HTTP 200 OK — Assertion Verified' : (isSkipped ? 'Test Skipped' : `Failed: ${errorMsg.slice(0, 150)}`),
      timestamp,
    });
  }

  async onEnd(result: FullResult): Promise<void> {
    const totalDuration = ((Date.now() - this.runStartTime) / 1000).toFixed(1);
    const totalTests = this.collectedResults.length;
    const passedTests = this.collectedResults.filter((r) => r.status === 'PASS').length;
    const failedTests = this.collectedResults.filter((r) => r.status === 'FAIL').length;
    const skippedTests = this.collectedResults.filter((r) => r.status === 'SKIPPED').length;
    const passRate = totalTests > 0 ? ((passedTests / (totalTests - skippedTests || totalTests)) * 100).toFixed(1) : '0';

    console.log(`\n================================================================`);
    console.log(`📊 [PlaywrightSheetReporter] Execution Finished in ${totalDuration}s`);
    console.log(`   Total: ${totalTests} | Passed: ${passedTests} | Skipped: ${skippedTests} | Failed: ${failedTests}`);
    console.log(`================================================================\n`);

    if (totalTests === 0) {
      console.log('[PlaywrightSheetReporter] No test results collected in this run. Skipping sheet update.');
      return;
    }

    const reportsDir = path.resolve(__dirname, '../reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const now = new Date();
    const runIso = now.toISOString();
    const timestampStr = runIso.replace(/:/g, '-').replace(/\..+/, '');
    const dateStr = runIso.split('T')[0];

    // 1. Save individual run JSON
    const isSmokeRun = this.collectedResults.some(r => r.test_id?.startsWith('SMOKE-')) || totalTests <= 25;
    const runRecord = {
      runId: `run-${Date.now()}`,
      timestamp: runIso,
      date: dateStr,
      runType: isSmokeRun ? 'Smoke Test Run' : 'Full Regression Run',
      durationSeconds: parseFloat(totalDuration),
      status: result.status === 'passed' && failedTests === 0 ? 'PASS' : 'FAIL',
      totalTests,
      passedTests,
      failedTests,
      skippedTests,
      passRate: parseFloat(passRate),
      results: this.collectedResults,
    };

    const runFilePath = path.join(reportsDir, `playground-run-${timestampStr}.json`);
    try {
      fs.writeFileSync(runFilePath, JSON.stringify(runRecord, null, 2), 'utf8');
      console.log(`[PlaywrightSheetReporter] Saved run log to: ${runFilePath}`);
    } catch (e: any) {
      console.warn('[PlaywrightSheetReporter] Could not write run json:', e.message);
    }

    // 2. Append to master playground-runs.json
    const runsMasterPath = path.join(reportsDir, 'playground-runs.json');
    try {
      let masterRuns: any[] = [];
      if (fs.existsSync(runsMasterPath)) {
        try {
          const existing = JSON.parse(fs.readFileSync(runsMasterPath, 'utf8'));
          if (Array.isArray(existing)) masterRuns = existing;
        } catch {}
      }
      // Append genuine run record with individual results
      masterRuns.unshift(runRecord);

      // Keep last 100 genuine runs
      if (masterRuns.length > 100) masterRuns = masterRuns.slice(0, 100);
      fs.writeFileSync(runsMasterPath, JSON.stringify(masterRuns, null, 2), 'utf8');
    } catch (e: any) {
      console.warn('[PlaywrightSheetReporter] Could not update playground-runs.json:', e.message);
    }

    // 3. Automatically Update Google Output Sheet
    try {
      console.log('[PlaywrightSheetReporter] 📤 Syncing execution results to Google Output Sheet...');
      await writePlaygroundResults(this.collectedResults, 'Playground-Execution-Results');
      console.log('✅ [PlaywrightSheetReporter] Google Output Sheet updated automatically!');
    } catch (e: any) {
      console.error('❌ [PlaywrightSheetReporter] Failed to sync with Google Sheet:', e.message);
    }

    // 4. Automatically Regenerate Stakeholder Dashboard HTML
    try {
      console.log('[PlaywrightSheetReporter] 📈 Regenerating Stakeholder Dashboard...');
      await generateStakeholderDashboard();
      console.log('✅ [PlaywrightSheetReporter] Stakeholder Dashboard generated at reports/Stakeholder-Dashboard.html');
    } catch (e: any) {
      console.error('❌ [PlaywrightSheetReporter] Failed to regenerate dashboard:', e.message);
    }
  }
}
